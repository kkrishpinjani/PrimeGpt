"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type RunView = {
  id: string; type: string; status: string; progress: number; summary: string | null; error: string | null; needsHuman: string | null; candidates: number;
  events: { at: string; level: string; message: string }[];
};
const DONE = ["SUCCEEDED", "FAILED", "CANCELED"];

export function LiveRun({ runId, initial }: { runId: string; initial: RunView }) {
  const [run, setRun] = useState<RunView>(initial);
  useEffect(() => {
    if (DONE.includes(run.status)) return;
    const t = setInterval(async () => {
      const r = await fetch(`/api/runs/${runId}`, { cache: "no-store" });
      if (r.ok) setRun(await r.json());
    }, 2000);
    return () => clearInterval(t);
  }, [runId, run.status]);

  const tone = run.status === "SUCCEEDED" ? "text-ok" : run.status === "FAILED" ? "text-bad" : run.status === "NEEDS_HUMAN" ? "text-warn" : "text-brand";
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-center justify-between">
          <div className={`text-sm font-semibold uppercase tracking-wide ${tone}`}>{run.status.replace("_", " ")}</div>
          <div className="muted">{run.progress}%</div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={run.progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand transition-all" style={{ width: `${run.progress}%` }} />
        </div>
        {run.type === "SOURCING" && <p className="muted mt-3">{run.candidates} candidates found so far</p>}
        {run.summary && <p className="mt-3 text-sm">{run.summary}</p>}
        {run.error && run.status === "FAILED" && <p className="mt-3 text-sm text-bad">{run.error}</p>}
      </div>

      {run.status === "NEEDS_HUMAN" && (
        <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm">
          <b>Action needed in your browser.</b> {run.needsHuman} Complete the check yourself in the RecruitGPT browser window. The run resumes automatically. We never solve or bypass these checks.
        </div>
      )}

      <div className="card">
        <h2 className="h2 mb-2">Activity</h2>
        <ol className="max-h-96 space-y-1.5 overflow-y-auto text-sm">
          {run.events.length === 0 && <li className="muted">Waiting for a worker to pick this up…</li>}
          {run.events.map((e, i) => (
            <li key={i} className={e.level === "error" ? "text-bad" : e.level === "warn" ? "text-warn" : ""}>
              <span className="muted mr-2 text-xs">{new Date(e.at).toLocaleTimeString()}</span>{e.message}
            </li>
          ))}
        </ol>
      </div>
      {run.status === "SUCCEEDED" && run.type === "SOURCING" && <Link href="/app/candidates" className="btn btn-primary">Review candidates</Link>}
      {run.status === "SUCCEEDED" && run.type === "OUTREACH_DRAFT" && <Link href="/app/outreach" className="btn btn-primary">Review drafts</Link>}
      {run.status === "SUCCEEDED" && run.type === "PROSPECTING" && <Link href="/app/prospects" className="btn btn-primary">View prospects</Link>}
    </div>
  );
}
