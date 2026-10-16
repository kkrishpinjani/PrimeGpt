import { getSecret } from "./store";

/** Apollo (company/contact data) and Exa (web search). Platform-provided by default, BYO key per tenant overrides. */

export type ApolloPerson = {
  fullName: string; title?: string; company?: string; domain?: string; email?: string; linkedinUrl?: string; location?: string; id?: string;
};

export async function apolloPeople(tenantId: string, q: { titles: string[]; keywords?: string; companyDomains?: string[]; locations?: string[]; limit?: number }): Promise<ApolloPerson[]> {
  const s = await getSecret<{ apiKey: string }>(tenantId, "apollo");
  if (!s) throw new Error("Apollo is not configured");
  const r = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
    method: "POST",
    headers: { "X-Api-Key": s.apiKey, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    body: JSON.stringify({
      person_titles: q.titles,
      q_keywords: q.keywords,
      q_organization_domains_list: q.companyDomains,
      person_locations: q.locations,
      per_page: Math.min(q.limit ?? 25, 100),
      page: 1,
    }),
  });
  if (!r.ok) throw new Error(`Apollo error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return (j.people ?? []).map((p: any) => ({
    id: p.id, fullName: p.name ?? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(), title: p.title,
    company: p.organization?.name, domain: p.organization?.primary_domain, email: p.email ?? undefined,
    linkedinUrl: p.linkedin_url, location: [p.city, p.state, p.country].filter(Boolean).join(", "),
  }));
}

export type ExaResult = { title: string; url: string; text: string };

export async function exaSearch(tenantId: string, query: string, n = 10): Promise<ExaResult[]> {
  const s = await getSecret<{ apiKey: string }>(tenantId, "exa");
  if (!s) throw new Error("Exa is not configured");
  const r = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": s.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, numResults: n, contents: { text: { maxCharacters: 1500 } } }),
  });
  if (!r.ok) throw new Error(`Exa error ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j: any = await r.json();
  return (j.results ?? []).map((x: any) => ({ title: x.title ?? "", url: x.url, text: x.text ?? "" }));
}
