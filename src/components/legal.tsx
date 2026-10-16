import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/" className="text-sm text-muted">← RecruitGPT.ai</Link>
      <h1 className="h1 mt-4">{title}</h1>
      <p className="muted mt-1">Last updated {updated}</p>
      <div className="mt-8 space-y-4 text-sm leading-7 [&_h2]:mt-8 [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-5">{children}</div>
    </main>
  );
}
