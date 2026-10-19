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
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]" style={color ? ({ ["--brand" as any]: color } as React.CSSProperties) : undefined}>
      <aside className="border-line bg-panel/70 backdrop-blur-xl md:sticky md:top-0 md:h-screen md:overflow-y-auto border-b md:border-b-0 md:border-r p-4">
        <Link href="/app" className="mb-5 flex items-center gap-2 px-1 text-base font-semibold">
          {ctx.tenant.brandLogoUrl ? <img src={ctx.tenant.brandLogoUrl} alt="" className="h-8 w-8 rounded-xl" /> : <span className="grid h-8 w-8 place-items-center rounded-xl text-sm font-bold text-white" style={{ background: "linear-gradient(135deg, var(--brand), var(--brand-2))", boxShadow: "0 6px 18px -6px rgba(91,140,255,.7)" }}>R</span>}
          <span className="truncate">{brand}</span>
        </Link>
        <Nav platformAdmin={ctx.user.isPlatformAdmin} />
        <div className="mt-6 border-t border-line pt-4 text-xs text-muted">
          <div className="truncate font-medium text-ink">{ctx.user.name}</div>
          <div className="truncate">{ctx.user.email}</div>
          <div className="mt-1 flex items-center gap-2"><span className="badge">{ctx.role.toLowerCase()}</span></div>
          <form action={signOut} className="mt-3"><button className="btn btn-sm w-full">Sign out</button></form>
        </div>
      </aside>
      <main className="min-w-0 p-4 md:px-6 md:py-6 xl:px-8">
        {!ctx.active && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
            <span>Your workspace has no active subscription. You can browse your data, but searches, AI and sending are paused.</span>
            <Link href="/app/billing" className="btn btn-primary btn-sm">Activate</Link>
          </div>
        )}
        <div className="mx-auto w-full max-w-[1760px]">{children}</div>
      </main>
    </div>
  );
}
