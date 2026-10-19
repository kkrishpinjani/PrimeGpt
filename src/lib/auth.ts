import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { tdb } from "./tenant-db";
import { hasActiveAccess } from "./billing-gate";
import { allow } from "./memory-ratelimit";

const COOKIE = "rgpt_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET ?? "");

export const hashPassword = (p: string) => bcrypt.hash(p, 12);
export const verifyPassword = (p: string, h: string) => bcrypt.compare(p, h);

export async function createSession(userId: string, tenantId: string) {
  const token = await new SignJWT({ uid: userId, tid: tenantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: 7 * 86400,
    secure: process.env.NODE_ENV === "production",
  });
}
export async function destroySession() { (await cookies()).delete(COOKIE); }

async function readSession(): Promise<{ uid: string; tid: string } | null> {
  const t = (await cookies()).get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return { uid: String(payload.uid), tid: String(payload.tid) };
  } catch { return null; }
}

export const ROLE_RANK: Record<Role, number> = { VIEWER: 0, RECRUITER: 1, ADMIN: 2, OWNER: 3 };

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** Resolve the signed-in user + active tenant. Membership is re-verified on every request. */
/** Cached per request: the layout and the page share one session/membership lookup. */
export const getContext = cache(async () => {
  const s = await readSession();
  if (!s) return null;
  const m = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: s.tid, userId: s.uid } },
    include: { user: true, tenant: true },
  });
  if (!m) return null;
  return {
    user: m.user, tenant: m.tenant, role: m.role,
    db: tdb(m.tenantId),
    canWrite: ROLE_RANK[m.role] >= ROLE_RANK.RECRUITER,
    isAdmin: ROLE_RANK[m.role] >= ROLE_RANK.ADMIN,
    active: hasActiveAccess(m.tenant),
  };
});
export type Ctx = NonNullable<Awaited<ReturnType<typeof getContext>>>;

export async function requireCtx(opts: { minRole?: Role; needSubscription?: boolean } = {}): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  // per-user limit: ~20 requests/second sustained is far beyond a person and well below a runaway script
  if (!allow(`user:${ctx.user.id}`, 1500, 60_000)) throw new Error("Too many requests. Please wait a moment.");
  if (opts.minRole && ROLE_RANK[ctx.role] < ROLE_RANK[opts.minRole]) redirect("/app?denied=1");
  if (opts.needSubscription && !ctx.active) redirect("/app/billing?required=1");
  return ctx;
}

/** For route handlers: throws a Response-able error instead of redirecting. */
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
export async function apiCtx(opts: { minRole?: Role; needSubscription?: boolean } = {}): Promise<Ctx> {
  const ctx = await getContext();
  if (!ctx) throw new HttpError(401, "Not signed in");
  if (!allow(`user:${ctx.user.id}`, 1500, 60_000)) throw new HttpError(429, "Too many requests");
  if (opts.minRole && ROLE_RANK[ctx.role] < ROLE_RANK[opts.minRole]) throw new HttpError(403, "Insufficient role");
  if (opts.needSubscription && !ctx.active) throw new HttpError(402, "Active subscription required");
  return ctx;
}
export function apiError(e: unknown) {
  if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
  console.error(e);
  return Response.json({ error: "Internal error" }, { status: 500 });
}
