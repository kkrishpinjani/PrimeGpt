import { aiConfigured, completeJson } from "./claude";
import { CLASSIFY_SYSTEM } from "./prompts";

export type Classification = { label: string; confidence: number; suggestedReply: string | null };

/** Hard rules first: opt-outs must never depend on a model. */
const STOP = /^\s*(stop|unsubscribe|cancel|end|quit)\s*[.!]*\s*$|remove me|do not contact|don'?t contact|take me off/i;
const OOO = /out of (the )?office|automatic reply|auto-?reply|on (annual )?leave|away until/i;

export async function classifyInbound(tenantId: string, text: string): Promise<Classification> {
  if (STOP.test(text)) return { label: "unsubscribe", confidence: 1, suggestedReply: null };
  if (OOO.test(text)) return { label: "out_of_office", confidence: 0.95, suggestedReply: null };
  if (aiConfigured()) {
    try {
      const r = await completeJson<Classification>({ tenantId, feature: "classify", system: CLASSIFY_SYSTEM, user: text.slice(0, 4000), maxTokens: 400 });
      if (r.label === "unsubscribe" || r.label === "out_of_office") r.suggestedReply = null;
      return r;
    } catch (e) {
      console.warn("[inbox] AI failed, using rules:", (e as Error).message);
    }
  }
  const t = text.toLowerCase();
  if (/\b(not interested|no thanks|no thank you|pass|not looking)\b/.test(t)) return { label: "not_interested", confidence: 0.7, suggestedReply: "Understood, thanks for letting me know. I won't follow up. All the best." };
  if (/\b(schedule|available|tomorrow|call|time works|calendar|meet)\b/.test(t)) return { label: "scheduling", confidence: 0.6, suggestedReply: "Great, thanks. I'll send a couple of times that work and a calendar link." };
  if (/\?/.test(t)) return { label: "question", confidence: 0.55, suggestedReply: "Good question. Happy to cover that on a short call; what time works for you this week?" };
  if (/\b(interested|yes|sure|sounds good|tell me more|open to)\b/.test(t)) return { label: "interested", confidence: 0.65, suggestedReply: "Thanks, glad it's of interest. Could you send a good time for a 15 minute call this week?" };
  return { label: "other", confidence: 0.3, suggestedReply: null };
}
