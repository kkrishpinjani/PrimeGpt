import { getSecret } from "./store";
import { normPhone } from "../brain/rules";

/** Quo (formerly OpenPhone) SMS. Each tenant brings its own API key + number. */
const BASE = "https://api.openphone.com/v1";

type QuoSecret = { apiKey: string; phoneNumberId: string; from: string; webhookToken?: string };

export async function sendSms(tenantId: string, to: string, content: string) {
  const s = await getSecret<QuoSecret>(tenantId, "quo");
  if (!s) throw new Error("Quo/OpenPhone is not connected for this workspace");
  const r = await fetch(`${BASE}/messages`, {
    method: "POST",
    headers: { Authorization: s.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ content, from: s.phoneNumberId || s.from, to: [normPhone(to)] }),
  });
  if (!r.ok) throw new Error(`Quo send failed (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const j: any = await r.json();
  return { id: j?.data?.id as string | undefined };
}

export type InboundSms = { id: string; from: string; text: string; createdAt: Date };

/** Poll recent inbound texts (webhook at /api/webhooks/quo/[token] is the preferred path). */
export async function pollSms(tenantId: string, sinceMs: number, participants: string[]): Promise<InboundSms[]> {
  const s = await getSecret<QuoSecret>(tenantId, "quo");
  if (!s) return [];
  const out: InboundSms[] = [];
  for (const p of participants.slice(0, 40)) {
    const u = new URL(`${BASE}/messages`);
    u.searchParams.set("phoneNumberId", s.phoneNumberId);
    u.searchParams.append("participants", normPhone(p));
    u.searchParams.set("createdAfter", new Date(sinceMs).toISOString());
    u.searchParams.set("maxResults", "20");
    const r = await fetch(u, { headers: { Authorization: s.apiKey } });
    if (!r.ok) continue;
    const j: any = await r.json();
    for (const m of j.data ?? []) {
      if (m.direction === "incoming") out.push({ id: m.id, from: m.from, text: m.text ?? "", createdAt: new Date(m.createdAt) });
    }
  }
  return out;
}
