import { z } from "zod";
import { prisma } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/crypto";
import { rateLimit } from "@/lib/ratelimit";
import { audit } from "@/lib/audit";

/** Called by the local helper: exchanges a one-time pairing code for a long-lived device token. */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (!(await rateLimit(`pair:${ip}`, 10, 600))) return Response.json({ error: "Too many attempts" }, { status: 429 });
  const parsed = z
    .object({ code: z.string().min(4).max(20), platform: z.string().max(100).optional() })
    .safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const code = parsed.data.code.trim().toUpperCase();
  const dev = await prisma.executorDevice.findUnique({ where: { pairingCode: code } });
  if (!dev || dev.revokedAt || !dev.pairingExpires || dev.pairingExpires < new Date()) {
    return Response.json({ error: "Pairing code is invalid or expired" }, { status: 400 });
  }
  const token = randomToken(32);
  await prisma.executorDevice.update({
    where: { id: dev.id },
    data: { tokenHash: sha256(token), pairingCode: null, pairingExpires: null, platformInfo: parsed.data.platform?.slice(0, 190) },
  });
  await audit("executor.paired", { tenantId: dev.tenantId, detail: dev.id, ip });
  return Response.json({ token, gateway: process.env.GATEWAY_PUBLIC_URL ?? "ws://localhost:8009" });
}
