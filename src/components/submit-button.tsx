"use client";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import type { ReactNode } from "react";

export function SubmitButton({ children, className, pending: pendingText, confirm }: { children: ReactNode; className?: string; pending?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={clsx("btn", className)}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? (pendingText ?? "Working…") : children}
    </button>
  );
}
