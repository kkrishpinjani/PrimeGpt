import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getContext } from "@/lib/auth";

export const metadata = { title: "Sign in" };

export default async function Login() {
  if (await getContext()) redirect("/app");
  return (
    <main className="hero-bg grid min-h-screen place-items-center px-4">
      <div className="flex flex-col items-center gap-6">
        <Link href="/" className="text-xl font-bold">RecruitGPT<span className="text-brand">.ai</span></Link>
        <AuthForm mode="login" demo={process.env.NODE_ENV !== "production" ? { email: "demo@recruitgpt.local", password: "DemoPass-12345" } : undefined} />
      </div>
    </main>
  );
}
