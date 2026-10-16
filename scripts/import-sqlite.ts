/**
 * One-time migration of a legacy local SQLite database into a tenant (WS2).
 *   npm run import:sqlite -- --db path/to/recruit.db --tenant <slug> [--dry-run]
 * Uses Node's built-in node:sqlite. Table/column names are matched loosely; unknown tables are reported, not guessed.
 * Legacy pre-2026 tables (names containing "legacy" or "old", or ending in a year before 2026) are NOT carried forward.
 */
import { DatabaseSync } from "node:sqlite";
import { prisma } from "@/lib/db";
import { upsertCandidate } from "@/lib/services/candidates";
import { normPhone } from "@/lib/brain/rules";

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const dry = process.argv.includes("--dry-run");

const legacy = (t: string) => /legacy|_old\b|^old_|_bak\b|backup/i.test(t) || /(19|20)\d\d$/.test(t) && Number(t.slice(-4)) < 2026;
const pick = (r: Record<string, any>, ...keys: string[]) => { for (const k of keys) { const v = r[k]; if (v != null && String(v).trim() !== "") return String(v).trim(); } return undefined; };
const norm = (r: Record<string, any>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase().replace(/[^a-z0-9]+/g, "_"), v]));

async function main() {
  const file = arg("--db"), slug = arg("--tenant");
  if (!file || !slug) throw new Error("Usage: --db <file.db> --tenant <slug> [--dry-run]");
  const tenant = await prisma.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error(`Tenant "${slug}" not found`);
  const db = new DatabaseSync(file, { readOnly: true });
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'").all() as { name: string }[]).map((t) => t.name);
  console.log("Tables:", tables.join(", "));
  const rows = (t: string) => (db.prepare(`SELECT * FROM "${t}"`).all() as Record<string, any>[]).map(norm);
  const has = (re: RegExp) => tables.filter((t) => re.test(t) && !legacy(t));
  const counts: Record<string, number> = {};
  const idMap = { client: new Map<string, string>(), job: new Map<string, string>(), cand: new Map<string, string>() };

  for (const t of has(/^clients?$/i)) for (const r of rows(t)) {
    const name = pick(r, "name", "company", "client_name"); if (!name) continue;
    if (!dry) { const c = await prisma.client.create({ data: { tenantId: tenant.id, name, industry: pick(r, "industry"), website: pick(r, "website", "url"), notes: pick(r, "notes") } }); idMap.client.set(String(r.id), c.id); }
    counts.clients = (counts.clients ?? 0) + 1;
  }
  for (const t of has(/job_?orders?|^jobs?$|^roles?$/i)) for (const r of rows(t)) {
    const title = pick(r, "title", "job_title", "name"); if (!title) continue;
    if (!dry) { const j = await prisma.jobOrder.create({ data: { tenantId: tenant.id, title, clientId: idMap.client.get(String(r.client_id)), location: pick(r, "location"), description: pick(r, "description"), mustHaves: pick(r, "must_haves", "requirements") } }); idMap.job.set(String(r.id), j.id); }
    counts.job_orders = (counts.job_orders ?? 0) + 1;
  }
  for (const t of has(/candidates?/i)) for (const r of rows(t)) {
    const name = pick(r, "full_name", "name") ?? [pick(r, "first_name"), pick(r, "last_name")].filter(Boolean).join(" "); if (!name) continue;
    if (!dry) {
      const [c] = await upsertCandidate(tenant.id, {
        fullName: name, source: pick(r, "source") ?? "legacy_import", sourceRef: pick(r, "linkedin_url", "profile_url", "external_id") ?? `legacy:${t}:${r.id}`,
        headline: pick(r, "headline"), currentTitle: pick(r, "title", "current_title"), currentCompany: pick(r, "company", "current_company"), location: pick(r, "location"),
        email: pick(r, "email"), phone: pick(r, "phone") ? normPhone(pick(r, "phone")!) : undefined, linkedinUrl: pick(r, "linkedin_url", "profile_url"), summary: pick(r, "summary", "notes"), skills: pick(r, "skills"), rawProfile: pick(r, "raw_profile", "profile_text"),
      }, { jobOrderId: idMap.job.get(String(r.job_order_id ?? r.job_id)) });
      const score = Number(pick(r, "fit_score", "score")); if (!Number.isNaN(score)) await prisma.candidate.update({ where: { id: c.id }, data: { fitScore: Math.max(0, Math.min(100, Math.round(score))) } });
      idMap.cand.set(String(r.id), c.id);
    }
    counts.candidates = (counts.candidates ?? 0) + 1;
  }
  for (const t of has(/messages?|events?|message_log/i)) for (const r of rows(t)) {
    const body = pick(r, "body", "content", "text"); const ch = (pick(r, "channel", "type") ?? "email").toUpperCase();
    if (!body) continue;
    const channel = ch.includes("SMS") || ch.includes("TEXT") ? "SMS" : ch.includes("LINK") || ch.includes("INMAIL") ? "LINKEDIN" : "EMAIL";
    const inbound = /in/i.test(pick(r, "direction") ?? "") && !/out/i.test(pick(r, "direction") ?? "");
    if (!dry) await prisma.message.create({ data: { tenantId: tenant.id, candidateId: idMap.cand.get(String(r.candidate_id)), channel, direction: inbound ? "INBOUND" : "OUTBOUND", status: inbound ? "RECEIVED" : "SENT", body, subject: pick(r, "subject"), sentAt: pick(r, "created_at", "sent_at") ? new Date(pick(r, "created_at", "sent_at")!) : undefined, kind: "imported" } });
    counts.messages = (counts.messages ?? 0) + 1;
  }
  const skipped = tables.filter((t) => legacy(t));
  console.log(dry ? "DRY RUN (nothing written):" : "Imported:", counts);
  if (skipped.length) console.log("Skipped legacy tables:", skipped.join(", "));
  const unknown = tables.filter((t) => !legacy(t) && !/clients?|job|roles?|candidate|message|event/i.test(t));
  if (unknown.length) console.log("Not imported (no mapping):", unknown.join(", "));
}
main().then(() => prisma.$disconnect()).catch((e) => { console.error(e.message); process.exit(1); });
