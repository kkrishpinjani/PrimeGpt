import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { CloudToExecutor, ExecutorToCloud, Primitive, hostAllowed } from "@/lib/protocol";

/**
 * Cloud side of the "local hands" channel. One socket per paired device, authenticated by a
 * long-lived device token (only its sha256 is stored). The brain calls `hands(tenantId)` and gets a
 * typed set of generic browser primitives; nothing else can be sent (validated by protocol.ts).
 */

type Conn = { ws: WebSocket; deviceId: string; tenantId: string; browserConnected: boolean; lastSeen: number };
const conns = new Map<string, Conn>(); // tenantId → connection (latest wins)
const pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout; tenantId: string }>();

export class HandsOffline extends Error {}

export function startGateway(port: number) {
  const http = createServer((req, res) => {
    if (req.url === "/health") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ ok: true, service: "recruitgpt-backend", devices: conns.size })); }
    res.writeHead(404); res.end();
  });
  const wss = new WebSocketServer({ server: http, path: "/executor", maxPayload: 8 * 1024 * 1024 });
  http.listen(port);

  wss.on("connection", (ws, req) => {
    const token = new URL(req.url ?? "", "http://x").searchParams.get("token") ?? req.headers["authorization"]?.toString().replace(/^Bearer /, "");
    // Authenticate asynchronously, but attach listeners synchronously so early frames (hello) are never lost.
    const ready = (async () => {
      const dev = token ? await prisma.executorDevice.findUnique({ where: { tokenHash: sha256(token) } }) : null;
      if (!dev || dev.revokedAt) { ws.close(4401, "unauthorized"); return null; }
      const conn: Conn = { ws, deviceId: dev.id, tenantId: dev.tenantId, browserConnected: false, lastSeen: Date.now() };
      conns.get(dev.tenantId)?.ws.close(4000, "replaced by a newer connection");
      conns.set(dev.tenantId, conn);
      await prisma.executorDevice.update({ where: { id: dev.id }, data: { online: true, lastSeenAt: new Date() } });
      console.log(`[gateway] device ${dev.id} online (tenant ${dev.tenantId})`);
      return { dev, conn };
    })();

    ws.on("message", async (raw) => {
      const auth = await ready;
      if (!auth) return;
      const { dev, conn } = auth;
      let msg: ExecutorToCloud;
      try { msg = ExecutorToCloud.parse(JSON.parse(raw.toString())); } catch { return; }
      conn.lastSeen = Date.now();
      if (msg.type === "hello") {
        conn.browserConnected = msg.browserConnected;
        await prisma.executorDevice.update({ where: { id: dev.id }, data: { platformInfo: `${msg.platform} v${msg.version}`.slice(0, 190), browserConnected: msg.browserConnected } });
      } else if (msg.type === "heartbeat") {
        conn.browserConnected = msg.browserConnected;
        await prisma.executorDevice.update({ where: { id: dev.id }, data: { lastSeenAt: new Date(), browserConnected: msg.browserConnected } }).catch(() => {});
      } else if (msg.type === "result") {
        const p = pending.get(msg.id);
        if (!p || p.tenantId !== dev.tenantId) return; // a device can only answer its own tenant's commands
        clearTimeout(p.timer);
        pending.delete(msg.id);
        msg.ok ? p.resolve(msg.data) : p.reject(new Error(msg.error ?? "executor error"));
      }
    });

    ws.on("close", async () => {
      const auth = await ready;
      if (!auth) return;
      const { dev, conn } = auth;
      if (conns.get(dev.tenantId) === conn) conns.delete(dev.tenantId);
      await prisma.executorDevice.update({ where: { id: dev.id }, data: { online: false, browserConnected: false } }).catch(() => {});
      console.log(`[gateway] device ${dev.id} offline`);
    });
  });

  // reap dead sockets
  setInterval(() => {
    for (const [tid, c] of conns) if (Date.now() - c.lastSeen > 60_000) { c.ws.terminate(); conns.delete(tid); }
  }, 15_000).unref();

  // The HTTP server is shared (for /health), so closing the gateway must close it too.
  const closeWss = wss.close.bind(wss);
  wss.close = ((cb?: (err?: Error) => void) => {
    for (const c of wss.clients) c.terminate();
    closeWss(() => http.close(() => cb?.()));
    http.closeAllConnections?.();
  }) as typeof wss.close;

  console.log(`[gateway] listening on :${port}/executor`);
  return wss;
}

export function handsStatus(tenantId: string) {
  const c = conns.get(tenantId);
  return { online: !!c, browserConnected: !!c?.browserConnected };
}

async function call(tenantId: string, action: unknown, timeoutMs = 45_000): Promise<any> {
  const conn = conns.get(tenantId);
  if (!conn) throw new HandsOffline("Local executor is offline. Start the RecruitGPT Local Helper on your computer.");
  const parsed = Primitive.parse(action); // schema gate: nothing but primitives can be sent
  if (parsed.op === "navigate" && !hostAllowed(parsed.url)) throw new Error("navigation blocked: host not allowed"); // defence in depth: the executor enforces this too
  const id = crypto.randomUUID();
  const frame: CloudToExecutor = { id, type: "cmd", action: parsed };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`executor timeout on ${parsed.op}`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer, tenantId });
    conn.ws.send(JSON.stringify(frame), (err) => { if (err) { clearTimeout(timer); pending.delete(id); reject(err); } });
  });
}

/** Typed facade used by the sourcing drivers. */
export type Hands = ReturnType<typeof hands>;
export function hands(tenantId: string) {
  return {
    navigate: (url: string) => call(tenantId, { op: "navigate", url }, 60_000) as Promise<{ url: string }>,
    click: (selector: string) => call(tenantId, { op: "click", selector }),
    type: (selector: string, text: string, clear = true) => call(tenantId, { op: "type", selector, text, clear }),
    press: (key: "Enter" | "Tab" | "Escape" | "PageDown" | "ArrowDown") => call(tenantId, { op: "press", key }),
    read: (selector?: string) => call(tenantId, { op: "read", selector, mode: "text" }) as Promise<string>,
    readHtml: (selector?: string) => call(tenantId, { op: "read", selector, mode: "html" }) as Promise<string>,
    readAll: (selector: string, attr?: string, limit = 100) => call(tenantId, { op: "readAll", selector, attr, limit }) as Promise<string[]>,
    scroll: (dy: number) => call(tenantId, { op: "scroll", dy }),
    wait: (ms?: number, selector?: string) => call(tenantId, { op: "wait", ms, selector }, 35_000),
    url: () => call(tenantId, { op: "url" }) as Promise<string>,
    screenshot: () => call(tenantId, { op: "screenshot" }) as Promise<string>,
    challenge: () => call(tenantId, { op: "detect_challenge" }) as Promise<{ challenge: boolean; kind?: string }>,
  };
}
