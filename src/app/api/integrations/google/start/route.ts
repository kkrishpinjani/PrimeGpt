import { SignJWT } from "jose";
import { apiCtx, apiError } from "@/lib/auth";
import { authUrl, googleConfigured } from "@/lib/integrations/google";

export async function GET() {
  try {
    const ctx = await apiCtx({ minRole: "ADMIN" });
    if (!googleConfigured()) return Response.redirect(`${process.env.APP_URL}/app/integrations?error=google_not_configured`);
    const state = await new SignJWT({ tid: ctx.tenant.id, uid: ctx.user.id })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("10m")
      .sign(new TextEncoder().encode(process.env.SESSION_SECRET));
    return Response.redirect(authUrl(state));
  } catch (e) {
    return apiError(e);
  }
}
