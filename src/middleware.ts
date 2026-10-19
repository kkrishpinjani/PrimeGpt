import { NextResponse, type NextRequest } from "next/server";
import { allow } from "@/lib/memory-ratelimit";

/** General per-IP rate limit on every route except static assets. Generous for people, tight enough to blunt floods. */
export function middleware(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
  const isApi = req.nextUrl.pathname.startsWith("/api/");
  // Stripe/Quo webhooks and cron come from a few IPs in bursts; give them their own bucket
  const isHook = req.nextUrl.pathname.startsWith("/api/webhooks/") || req.nextUrl.pathname.startsWith("/api/cron/");
  const ok = isHook ? allow(`hook:${ip}`, 600, 60_000) : isApi ? allow(`api:${ip}`, 240, 60_000) : allow(`page:${ip}`, 1500, 60_000);
  if (ok) return NextResponse.next();
  return new NextResponse(JSON.stringify({ error: "Too many requests. Slow down and try again in a minute." }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Retry-After": "60" },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|helper/).*)"] };
