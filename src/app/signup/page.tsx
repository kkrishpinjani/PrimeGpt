import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getContext } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const metadata = { title: "Create account" };

export default async function Signup({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (await getContext()) redirect("/app");
  const { invite } = await searchParams;
  const inv = invite ? await prisma.invite.findUnique({ where: { token: invite } }) : null;
  const valid = inv && !inv.acceptedAt && inv.expiresAt > new Date();
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex flex-col items-center gap-6">
        <Link href="/" className="text-lg font-semibold">RecruitGPT<span className="text-brand">.ai</span></Link>
        {invite && !valid && <p className="text-sm text-bad">This invite link is invalid or has expired.</p>}
        <AuthForm mode="signup" inviteToken={valid ? invite : undefined} inviteEmail={valid ? inv!.email : undefined} />
      </div>
    </main>
  );
}
