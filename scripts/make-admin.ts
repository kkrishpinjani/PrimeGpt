/** Grant platform-operator access:  npm run make-admin -- someone@company.com */
import { prisma } from "@/lib/db";

async function main() {
  const email = process.argv[2]?.toLowerCase();
  if (!email) throw new Error("Usage: npm run make-admin -- <email>");
  const r = await prisma.user.updateMany({ where: { email }, data: { isPlatformAdmin: true } });
  console.log(r.count ? `${email} is now a platform admin` : `No user with email ${email}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
