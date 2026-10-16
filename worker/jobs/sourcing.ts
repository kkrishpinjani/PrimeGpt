import type { Run } from "@prisma/client";
import { prisma } from "@/lib/db";
import { completeJson, aiConfigured } from "@/lib/brain/claude";
import { SOURCING_PLAN_SYSTEM } from "@/lib/brain/prompts";
import { jobText } from "@/lib/brain/scoring";
import { apolloPeople, exaSearch } from "@/lib/integrations/data-sources";
import { scoreAndSave, upsertCandidate } from "@/lib/services/candidates";
import { runEvent } from "@/lib/services/runs";
import { handsStatus, hands } from "../gateway";
import { ChallengeError, sourceIndeed, sourceLinkedIn, waitForHuman } from "../drivers/browser-sources";

const split = (s?: string | null) => (s ?? "").split(/[\n,;]/).map((x) => x.trim()).filter(Boolean);

async function plan(tenantId: string, search: any, job: any) {
  let titles = split(search.titles), keywords = split(search.keywords), excludes = split(search.excludes), locations = split(search.locations);
  if ((!titles.length || !keywords.length) && job && aiConfigured()) {
    try {
      const p = await completeJson<{ titles: string[]; keywords: string[]; excludes: string[]; locations: string[] }>({
        tenantId, feature: "sourcing_plan", system: SOURCING_PLAN_SYSTEM, user: jobText(job), maxTokens: 500,
      });
      titles = titles.length ? titles : p.titles ?? [];
      keywords = keywords.length ? keywords : p.keywords ?? [];
      excludes = excludes.length ? excludes : p.excludes ?? [];
      locations = locations.length ? locations : p.locations ?? [];
    } catch { /* fall through to what we have */ }
  }
  if (!titles.length && job) titles = [job.title];
  if (!locations.length && job?.location) locations = [job.location];
  if (!keywords.length && job?.mustHaves) keywords = split(job.mustHaves).slice(0, 8);
  return { titles, keywords, excludes, locations };
}

export async function runSourcing(run: Run) {
  const { tenantId } = run;
  const search = run.searchId ? await prisma.savedSearch.findFirst({ where: { id: run.searchId, tenantId } }) : null;
  if (!search) throw new Error("Saved search not found");
  const job = search.jobOrderId ? await prisma.jobOrder.findFirst({ where: { id: search.jobOrderId, tenantId } }) : null;
  const sources = search.sources.split(",").map((s) => s.trim()).filter(Boolean);
  const p = await plan(tenantId, search, job);
  await runEvent(run.id, `Plan: titles=[${p.titles.join(", ")}] keywords=[${p.keywords.slice(0, 8).join(", ")}] locations=[${p.locations.join(", ")}]`);

  let created = 0, updated = 0, scored = 0;
  const max = search.maxResults;
  const setProgress = (n: number) => prisma.run.update({ where: { id: run.id }, data: { progress: Math.min(99, n) } });

  const handle = async (raw: Parameters<typeof upsertCandidate>[1]) => {
    if (p.excludes.some((x) => (raw.rawProfile ?? `${raw.headline} ${raw.currentCompany}`).toLowerCase().includes(x.toLowerCase()))) return;
    const [c, isNew] = await upsertCandidate(tenantId, raw, { runId: run.id, jobOrderId: search.jobOrderId });
    isNew ? created++ : updated++;
    if (job && (isNew || c.fitScore == null)) { await scoreAndSave(tenantId, job, c); scored++; }
  };

  for (let si = 0; si < sources.length; si++) {
    const src = sources[si];
    const base = (si / sources.length) * 100;
    await runEvent(run.id, `Source: ${src}`);
    try {
      if (src === "apollo") {
        const people = await apolloPeople(tenantId, { titles: p.titles, keywords: p.keywords.join(" "), locations: p.locations, limit: max });
        for (const x of people) {
          await handle({ source: "apollo", sourceRef: x.id ?? x.linkedinUrl, fullName: x.fullName, currentTitle: x.title, currentCompany: x.company, headline: [x.title, x.company].filter(Boolean).join(" at "), location: x.location, email: x.email, linkedinUrl: x.linkedinUrl, summary: `${x.title ?? ""} at ${x.company ?? ""}` });
        }
      } else if (src === "exa") {
        const q = `${p.titles[0] ?? ""} ${p.keywords.slice(0, 5).join(" ")} ${p.locations[0] ?? ""} linkedin profile`;
        for (const x of await exaSearch(tenantId, q, Math.min(max, 25))) {
          const name = x.title.split(/[-|–]/)[0].trim();
          if (name) await handle({ source: "exa", sourceRef: x.url, fullName: name, headline: x.title, linkedinUrl: /linkedin\.com\/in\//.test(x.url) ? x.url : undefined, rawProfile: x.text, summary: x.text.slice(0, 600) });
        }
      } else if (src === "linkedin_recruiter" || src === "indeed") {
        if (!handsStatus(tenantId).online) throw new Error("Local helper is offline. Start the RecruitGPT Local Helper, then re-run this search.");
        const h = hands(tenantId);
        const driver = src === "indeed" ? sourceIndeed : sourceLinkedIn;
        const prog = async (n: number, total: number, msg: string) => { await setProgress(base + (n / total) * (100 / sources.length)); await runEvent(run.id, msg); };
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const profiles = await driver(h, { titles: p.titles, keywords: p.keywords, locations: p.locations, max }, prog);
            for (const pr of profiles) await handle(pr);
            break;
          } catch (e) {
            if (!(e instanceof ChallengeError)) throw e;
            // Human-in-the-loop: surface it, wait, never bypass.
            await prisma.run.update({ where: { id: run.id }, data: { status: "NEEDS_HUMAN", needsHuman: e.message } });
            await runEvent(run.id, e.message, "warn");
            const ok = await waitForHuman(h);
            if (!ok) throw new Error("Timed out waiting for a human to clear the verification. Re-run the search later.");
            await prisma.run.update({ where: { id: run.id }, data: { status: "RUNNING", needsHuman: null } });
            await runEvent(run.id, "Verification cleared by user; resuming.");
          }
        }
      } else {
        await runEvent(run.id, `Unknown source "${src}", skipped`, "warn");
      }
    } catch (e) {
      await runEvent(run.id, `Source ${src} failed: ${(e as Error).message}`, "error");
      if (sources.length === 1) throw e;
    }
    await setProgress(base + 100 / sources.length);
  }

  await prisma.usageEvent.create({ data: { tenantId, kind: "sourcing_run", quantity: 1, meta: { created, updated } } });
  return `Found ${created} new and ${updated} existing candidates; scored ${scored}.`;
}
