import type { Hands } from "../gateway";

/**
 * Browser sourcing drivers (cloud brain). They use ONLY generic primitives from `Hands`.
 * All site-specific knowledge (URLs, selectors) lives here in the cloud, never on the customer's machine.
 * Selectors are centralised so they can be hot-fixed server-side when LinkedIn/Indeed change markup,
 * without shipping a new local helper.
 */
export type RawProfile = {
  source: "linkedin_recruiter" | "indeed";
  sourceRef: string;
  fullName: string;
  headline?: string;
  currentTitle?: string;
  currentCompany?: string;
  location?: string;
  linkedinUrl?: string;
  rawProfile: string;
};

export class ChallengeError extends Error {
  constructor(public kind: string) { super(`Verification/CAPTCHA detected (${kind}). A human must resolve it in the browser.`); }
}

export const SELECTORS = {
  linkedin: {
    resultLinks: "a[href*='/talent/profile/'], a[href*='/talent/hire/'], a[href*='linkedin.com/in/']",
    name: "h1",
  },
  indeed: {
    resultLinks: "a[href*='/candidates/view'], a[href*='/resume/']",
    name: "h1",
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function guard(h: Hands) {
  const c = await h.challenge();
  if (c.challenge) throw new ChallengeError(c.kind ?? "unknown");
}

const clean = (s: string) => s.replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** Heuristic parse of a profile page's visible text. The full text is stored too, so scoring never depends on this. */
export function parseProfileText(name: string, text: string) {
  const lines = clean(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const idx = lines.findIndex((l) => l.toLowerCase().includes(name.toLowerCase().split(" ")[0]));
  const after = lines.slice(idx >= 0 ? idx + 1 : 0, (idx >= 0 ? idx + 1 : 0) + 8);
  const headline = after.find((l) => l.length > 8 && l.length < 220 && !/connections?|followers?|^·|degree/i.test(l));
  const atMatch = headline?.match(/^(.*?)(?:\s+(?:at|@)\s+)(.+)$/i);
  const loc = after.find((l) => /,\s*[A-Z][a-z]+|Area|Metropolitan|Remote|United States|Canada|India|UK|United Kingdom/.test(l) && l !== headline && l.length < 90);
  return { headline, currentTitle: atMatch?.[1]?.trim() ?? headline, currentCompany: atMatch?.[2]?.split("|")[0]?.trim(), location: loc };
}

const canon = (u: string) => u.split("?")[0].replace(/\/$/, "");

async function collect(h: Hands, kind: "linkedin" | "indeed", searchUrl: string, max: number, onProgress: (n: number, total: number, msg: string) => Promise<void>): Promise<RawProfile[]> {
  const sel = SELECTORS[kind];
  await h.navigate(searchUrl);
  await guard(h);
  await h.wait(undefined, sel.resultLinks).catch(() => {}); // results may be empty
  const links = new Set<string>();
  for (let page = 0; page < 6 && links.size < max; page++) {
    for (const href of await h.readAll(sel.resultLinks, "href", 200)) if (href) links.add(canon(href));
    if (links.size >= max) break;
    await h.scroll(2500);
    await guard(h);
  }
  const targets = [...links].slice(0, max);
  const out: RawProfile[] = [];
  let i = 0;
  for (const link of targets) {
    i++;
    try {
      await h.navigate(link);
      await guard(h);
      const name = clean(await h.read(sel.name).catch(() => ""));
      const text = await h.read();
      if (!name) continue;
      const parsed = parseProfileText(name, text);
      out.push({
        source: kind === "linkedin" ? "linkedin_recruiter" : "indeed",
        sourceRef: link,
        fullName: name.slice(0, 190),
        ...parsed,
        linkedinUrl: kind === "linkedin" ? link : undefined,
        rawProfile: clean(text).slice(0, 40_000),
      });
      await onProgress(i, targets.length, `Read profile ${i}/${targets.length}: ${name}`);
    } catch (e) {
      if (e instanceof ChallengeError) throw e;
      await onProgress(i, targets.length, `Skipped a profile (${(e as Error).message})`);
    }
    await sleep(500);
  }
  return out;
}

const q = (parts: string[]) => encodeURIComponent(parts.filter(Boolean).join(" "));

export function linkedinSearchUrl(titles: string[], keywords: string[], locations: string[]) {
  const kw = [titles.length ? `(${titles.map((t) => `"${t}"`).join(" OR ")})` : "", ...keywords.slice(0, 6)];
  return `https://www.linkedin.com/talent/search?keywords=${q(kw)}${locations[0] ? `&location=${encodeURIComponent(locations[0])}` : ""}`;
}
export function indeedSearchUrl(titles: string[], keywords: string[], locations: string[]) {
  return `https://employers.indeed.com/candidates?keywords=${q([titles[0] ?? "", ...keywords.slice(0, 5)])}${locations[0] ? `&location=${encodeURIComponent(locations[0])}` : ""}`;
}

export const sourceLinkedIn = (h: Hands, p: { titles: string[]; keywords: string[]; locations: string[]; max: number }, prog: Parameters<typeof collect>[4]) =>
  collect(h, "linkedin", linkedinSearchUrl(p.titles, p.keywords, p.locations), p.max, prog);
export const sourceIndeed = (h: Hands, p: { titles: string[]; keywords: string[]; locations: string[]; max: number }, prog: Parameters<typeof collect>[4]) =>
  collect(h, "indeed", indeedSearchUrl(p.titles, p.keywords, p.locations), p.max, prog);

/** Wait for a human to clear a verification in their own browser. Never attempts to bypass. */
export async function waitForHuman(h: Hands, timeoutMs = 10 * 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    await sleep(10_000);
    try { if (!(await h.challenge()).challenge) return true; } catch { /* keep waiting */ }
  }
  return false;
}

/** LinkedIn InMail send: only ever called for APPROVED messages, under a daily cap. */
export async function sendLinkedInMessage(h: Hands, profileUrl: string, subject: string | null, body: string) {
  await h.navigate(profileUrl);
  await guard(h);
  await h.click("button:has-text('Message'), a:has-text('Message'), button:has-text('InMail')");
  await h.wait(1200);
  if (subject) await h.type("input[placeholder*='Subject' i], input[name*='subject' i]", subject).catch(() => {});
  await h.type("div[role='textbox'], textarea", body);
  await guard(h);
  await h.click("button:has-text('Send')");
  await h.wait(1500);
}
