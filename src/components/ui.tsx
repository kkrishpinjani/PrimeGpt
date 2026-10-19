import clsx from "clsx";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="h1">{title}</h1>
        {subtitle && <p className="muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES: Record<string, string> = {
  ok: "border-ok/30 text-ok bg-ok/10",
  warn: "border-warn/30 text-warn bg-warn/10",
  bad: "border-bad/30 text-bad bg-bad/10",
  info: "border-brand/30 text-brand bg-brand/10",
  neutral: "",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={clsx("badge", TONES[tone])}>{children}</span>;
}

export function statusTone(s: string) {
  if (["SUCCEEDED", "SENT", "ACTIVE", "PLACED", "SAVED", "connected", "online"].includes(s)) return "ok";
  if (["FAILED", "REJECTED", "CANCELED", "PAST_DUE"].includes(s)) return "bad";
  if (["NEEDS_HUMAN", "DRAFT", "QUEUED", "APPROVED", "SENDING"].includes(s)) return "warn";
  if (["RUNNING", "NEW", "REPLIED", "INTERVIEWING", "CONTACTED"].includes(s)) return "info";
  return "neutral";
}
export const StatusBadge = ({ s }: { s: string }) => <Badge tone={statusTone(s) as any}>{s.replace("_", " ").toLowerCase()}</Badge>;

export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="badge">unscored</span>;
  const tone = score >= 75 ? "ok" : score >= 55 ? "warn" : "bad";
  return <Badge tone={tone as any}>{score}</Badge>;
}

export function Stat({ label, value, hint, icon: Icon }: { label: string; value: ReactNode; hint?: string; icon?: LucideIcon }) {
  return (
    <div className="card flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-1 text-2xl font-bold">{value}</div>
        {hint && <div className="muted mt-0.5 text-xs">{hint}</div>}
      </div>
      {Icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand"><Icon size={20} aria-hidden /></span>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card py-12 text-center">
      <div className="h2">{title}</div>
      {children && <div className="muted mx-auto mt-2 max-w-md">{children}</div>}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "ok"; children: ReactNode }) {
  return <div className={clsx("mb-4 rounded-lg border px-4 py-3 text-sm", TONES[tone])}>{children}</div>;
}

export const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
