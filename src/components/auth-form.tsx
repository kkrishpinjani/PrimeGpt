"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export function AuthForm({ mode, inviteToken, inviteEmail }: { mode: "login" | "signup"; inviteToken?: string; inviteEmail?: string }) {
  const router = useRouter();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const body: Record<string, string> = Object.fromEntries(new FormData(e.currentTarget) as any);
    if (inviteToken) body.inviteToken = inviteToken;
    const r = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Something went wrong");
    router.push("/app");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
      <h1 className="h1">{mode === "login" ? "Sign in" : inviteToken ? "Join your team" : "Start with RecruitGPT"}</h1>
      {mode === "signup" && (
        <>
          <div><label className="label">Your name</label><input name="name" required className="input" autoComplete="name" /></div>
          {!inviteToken && <div><label className="label">Company / firm</label><input name="company" required className="input" autoComplete="organization" /></div>}
          {inviteToken && <input type="hidden" name="company" value="invited" />}
        </>
      )}
      <div><label className="label">Email</label><input name="email" type="email" required defaultValue={inviteEmail} className="input" autoComplete="email" /></div>
      <div>
        <label className="label">Password{mode === "signup" && " (10+ characters)"}</label>
        <input name="password" type="password" required minLength={mode === "signup" ? 10 : 1} className="input" autoComplete={mode === "login" ? "current-password" : "new-password"} />
      </div>
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
      <button className="btn btn-primary w-full" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
      <p className="muted text-center">
        {mode === "login" ? <>New here? <Link href="/signup" className="underline">Create an account</Link></> : <>Have an account? <Link href="/login" className="underline">Sign in</Link></>}
      </p>
    </form>
  );
}
