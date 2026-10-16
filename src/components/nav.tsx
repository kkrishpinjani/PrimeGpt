"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const ITEMS: Array<[string, string]> = [
  ["/app", "Dashboard"],
  ["/app/searches", "Searches"],
  ["/app/candidates", "Candidates"],
  ["/app/pipeline", "Pipeline"],
  ["/app/outreach", "Outreach"],
  ["/app/interviews", "Interviews"],
  ["/app/jobs", "Roles"],
  ["/app/clients", "Clients"],
  ["/app/prospects", "Prospects"],
  ["/app/integrations", "Integrations"],
  ["/app/team", "Team"],
  ["/app/billing", "Billing"],
  ["/app/settings", "Settings"],
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {ITEMS.map(([href, label]) => {
        const active = href === "/app" ? path === "/app" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={clsx("rounded-lg px-3 py-2 text-sm", active ? "bg-brand/10 font-medium text-brand" : "text-muted hover:bg-black/5 hover:text-ink")}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
