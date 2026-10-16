import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getContext } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function Login() {
  if (await getContext()) redirect("/app");
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="flex flex-col items-center gap-6">
        <Link href="/" className="text-lg font-semibold">RecruitGPT<span className="text-brand">.ai</span></Link>
        <AuthForm mode="login" />
      </div>
    </main>
  );
}
