import { jwtVerify } from "jose";
import { handleOAuthCallback } from "@/lib/integrations/google";
import { audit } from "@/lib/audit";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const back = (q: string) => Response.redirect(`${process.env.APP_URL}/app/integrations?${q}`);
  if (!code || !state) return back("error=google_denied");
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(process.env.SESSION_SECRET));
    await handleOAuthCallback(String(payload.tid), code);
    await audit("integration.google_connected", { tenantId: String(payload.tid), userId: String(payload.uid) });
    return back("connected=google");
  } catch (e) {
    console.error("google callback", e);
    return back("error=google_failed");
  }
}
