import { apiCtx, apiError } from "@/lib/auth";
import { pairingCode } from "@/lib/crypto";
import { audit } from "@/lib/audit";
import { allow } from "@/lib/memory-ratelimit";
import { buildUnixScript, buildWindowsScript, installerFile, parseOs } from "@/lib/installer-scripts";

/**
 * One-click installer (Windows .cmd, macOS .command, Linux .sh), personalised with a single-use pairing code.
 * The customer runs it: installs Node if missing, downloads the helper, pairs, registers it to start at sign-in,
 * and opens the dedicated browser. The helper then keeps itself up to date from this server.
 */
export async function GET(req: Request) {
  try {
    const os = parseOs(new URL(req.url).searchParams.get("os"));
    const ctx = await apiCtx({ minRole: "ADMIN" });
    if (!allow(`installer:${ctx.tenant.id}`, 10, 600_000)) return Response.json({ error: "Too many installer downloads; try again shortly" }, { status: 429 });
    const file = installerFile(os);
    const dev = await ctx.db.executorDevice.create({
      data: { tenantId: ctx.tenant.id, label: file.label, pairingCode: pairingCode(), pairingExpires: new Date(Date.now() + 60 * 60_000) },
    });
    await audit("executor.installer_downloaded", { tenantId: ctx.tenant.id, userId: ctx.user.id, detail: `${os} ${dev.id}` });
    const server = (process.env.APP_URL ?? "").replace(/\/$/, "");
    const body = os === "windows" ? buildWindowsScript(server, dev.pairingCode!) : buildUnixScript(os, server, dev.pairingCode!);
    return new Response(body, {
      headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${file.name}"`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return apiError(e);
  }
}
