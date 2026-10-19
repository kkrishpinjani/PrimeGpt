import Link from "next/link";
import { Check, Circle } from "lucide-react";
import { dismissOnboarding } from "@/app/app/actions/settings";

export type OnboardingStep = { label: string; hint: string; href: string; done: boolean };

/** First-run checklist (scope WS6 "trial/onboarding"). Hides itself when complete or dismissed. */
export function Onboarding({ steps, canDismiss }: { steps: OnboardingStep[]; canDismiss: boolean }) {
  const done = steps.filter((s) => s.done).length;
  return (
    <section className="card mt-6 border-brand/30" aria-label="Getting started">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="h2">Get started</h2>
          <p className="muted">{done} of {steps.length} done. A few steps to your first approved message.</p>
        </div>
        {canDismiss && <form action={dismissOnboarding}><button className="btn btn-sm">Hide</button></form>}
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand transition-all" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      <ol className="mt-4 grid gap-2 md:grid-cols-2">
        {steps.map((s) => (
          <li key={s.label}>
            <Link href={s.href} className="flex items-start gap-3 rounded-xl border border-line p-3 hover:bg-white/5">
              {s.done ? <Check size={18} className="mt-0.5 shrink-0 text-ok" aria-label="done" /> : <Circle size={18} className="mt-0.5 shrink-0 text-muted" aria-label="to do" />}
              <span><span className={`block text-sm font-medium ${s.done ? "text-muted line-through" : ""}`}>{s.label}</span><span className="muted text-xs">{s.hint}</span></span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
