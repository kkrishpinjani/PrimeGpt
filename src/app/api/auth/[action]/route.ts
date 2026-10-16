import { z } from "zod";
import { prisma } from "@/lib/db";
import { apiError, clientIp, createSession, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { rateLimit } from "@/lib/ratelimit";
import { slugify } from "@/lib/slug";
import { audit } from "@/lib/audit";

const signup = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(190),
  password: z.string().min(10).max(200),
  company: z.string().min(1).max(120),
  inviteToken: z.string().optional(),
});
const login = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

export async function POST(req: Request, { params }: { params: Promise<{ action: string }> }) {
  const { action } = await params;
  try {
    const ip = (await clientIp()) ?? "unknown";
    if (action === "logout") { await destroySession(); return Response.json({ ok: true }); }

    if (!(await rateLimit(`auth:${action}:${ip}`, 10, 600))) return Response.json({ error: "Too many attempts. Try again in a few minutes." }, { status: 429 });
    const body = await req.json();

    if (action === "signup") {
      const d = signup.parse(body);
      const email = d.email.toLowerCase();
      if (await prisma.user.findUnique({ where: { email } })) return Response.json({ error: "An account with this email already exists" }, { status: 409 });
      const passwordHash = await hashPassword(d.password);

      if (d.inviteToken) {
        const inv = await prisma.invite.findUnique({ where: { token: d.inviteToken } });
        if (!inv || inv.acceptedAt || inv.expiresAt < new Date() || inv.email.toLowerCase() !== email) return Response.json({ error: "Invite is invalid or expired" }, { status: 400 });
        const user = await prisma.user.create({ data: { email, name: d.name, passwordHash } });
        await prisma.membership.create({ data: { tenantId: inv.tenantId, userId: user.id, role: inv.role } });
        await prisma.invite.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
        await createSession(user.id, inv.tenantId);
        await audit("invite.accepted", { tenantId: inv.tenantId, userId: user.id, ip });
        return Response.json({ ok: true });
      }

      let slug = slugify(d.company);
      if (await prisma.tenant.findUnique({ where: { slug } })) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
      const tenant = await prisma.tenant.create({ data: { name: d.company, slug } });
      const user = await prisma.user.create({ data: { email, name: d.name, passwordHash } });
      await prisma.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: "OWNER" } });
      await createSession(user.id, tenant.id);
      await audit("tenant.created", { tenantId: tenant.id, userId: user.id, ip });
      return Response.json({ ok: true });
    }

    if (action === "login") {
      const d = login.parse(body);
      const user = await prisma.user.findUnique({ where: { email: d.email.toLowerCase() }, include: { memberships: { orderBy: { createdAt: "asc" } } } });
      // Always run a hash compare so timing doesn't reveal whether the email exists.
      const ok = await verifyPassword(d.password, user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
      if (!user || !ok || !user.memberships.length) { await audit("login.failed", { ip, detail: d.email }); return Response.json({ error: "Invalid email or password" }, { status: 401 }); }
      await createSession(user.id, user.memberships[0].tenantId);
      await audit("login", { tenantId: user.memberships[0].tenantId, userId: user.id, ip });
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Not found" }, { status: 404 });
  } catch (e) {
    if (e instanceof z.ZodError) return Response.json({ error: e.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    return apiError(e);
  }
}
