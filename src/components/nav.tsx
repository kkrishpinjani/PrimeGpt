"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import {
  Activity, BookUser, Briefcase, Building2, LifeBuoy, ShieldCheck, CalendarDays, Columns3, CreditCard, LayoutDashboard, Plug, Search, Send, Settings, Target, Users, UsersRound,
  type LucideIcon,
} from "lucide-react";

const ITEMS: Array<[string, string, LucideIcon]> = [
  ["/app", "Dashboard", LayoutDashboard],
  ["/app/searches", "Searches", Search],
  ["/app/candidates", "Candidates", Users],
  ["/app/pipeline", "Pipeline", Columns3],
  ["/app/outreach", "Outreach", Send],
  ["/app/interviews", "Interviews", CalendarDays],
  ["/app/jobs", "Roles", Briefcase],
  ["/app/runs", "Runs", Activity],
  ["/app/clients", "Clients", Building2],
  ["/app/contacts", "Contacts", BookUser],
  ["/app/prospects", "Prospects", Target],
  ["/app/integrations", "Integrations", Plug],
  ["/app/team", "Team", UsersRound],
  ["/app/expert-help", "Expert help", LifeBuoy],
  ["/app/billing", "Billing", CreditCard],
  ["/app/settings", "Settings", Settings],
];

export function Nav({ platformAdmin = false }: { platformAdmin?: boolean }) {
  const path = usePathname();
  const items = platformAdmin ? [...ITEMS, ["/app/admin", "Platform admin", ShieldCheck] as [string, string, LucideIcon]] : ITEMS;
  return (
    // Mobile: horizontal scroll row. Desktop: vertical sidebar list.
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0" aria-label="Main">
      {items.map(([href, label, Icon]) => {
        const active = href === "/app" ? path === "/app" : path.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex min-h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm",
              active ? "bg-brand/15 font-semibold text-brand shadow-[inset_2px_0_0_var(--brand)]" : "text-muted hover:bg-white/5 hover:text-ink",
            )}
          >
            <Icon size={17} aria-hidden strokeWidth={active ? 2.25 : 1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
