import Link from "next/link";
import { requireCtx } from "@/lib/auth";
import { Nav } from "@/components/nav";
import { signOut } from "./actions/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireCtx();
  const brand = ctx.tenant.brandName ?? ctx.tenant.name;
  const color = ctx.tenant.brandColor ?? undefined;
  return (
    <div className="min-h-screen md:grid md:grid-cols-[230px_1fr]" style={color ? ({ ["--brand" as any]: color } as React.CSSProperties) : undefined}>
      <aside className="border-line bg-panel md:sticky md:top-0 md:h-screen md:overflow-y-auto border-b md:border-b-0 md:border-r p-4">
        <Link href="/app" className="mb-5 flex items-center gap-2 px-1 text-base font-semibold">
          {ctx.tenant.brandLogoUrl ? <img src={ctx.tenant.brandLogoUrl} alt="" className="h-6 w-6 rounded" /> : <span className="grid h-6 w-6 place-items-center rounded bg-brand text-xs text-white">R</span>}
          <span className="truncate">{brand}</span>
        </Link>
        <Nav />
        <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
          <div className="truncate font-medium text-ink">{ctx.user.name}</div>
          <div className="truncate">{ctx.user.email}</div>
          <div className="mt-1 flex items-center gap-2"><span className="badge">{ctx.role.toLowerCase()}</span></div>
          <form action={signOut} className="mt-3"><button className="btn btn-sm w-full">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 p-5 md:p-8">
        {!ctx.active && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warn/30 bg-warn/10 px-4 py-3 text-sm">
            <span>Your workspace has no active subscription. You can browse your data, but searches, AI and sending are paused.</span>
            <Link href="/app/billing" className="btn btn-primary btn-sm">Activate</Link>
          </div>
        )}
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
