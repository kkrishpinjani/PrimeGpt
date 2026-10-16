import { z } from "zod";

/**
 * Cloud ⇄ local-hands wire protocol (WS5/WS7).
 *
 * IP BOUNDARY: this schema is the ONLY thing that crosses to a customer's machine. It is deliberately
 * limited to generic browser primitives. There is no field for prompts, rubrics, skills or candidate
 * scoring, and strings are length-capped so a prompt cannot be smuggled through `text`.
 * This file is duplicated verbatim in executor/src/protocol.ts (tests/ip-boundary.test.ts checks they match).
 */

export const ALLOWED_HOSTS = ["linkedin.com", "indeed.com"] as const;

export const MAX_TYPE_CHARS = 2200; // longest legitimate message body (InMail limit is 1900)
export const MAX_SELECTOR = 300;

const selector = z.string().min(1).max(MAX_SELECTOR);

export const Primitive = z.discriminatedUnion("op", [
  z.object({ op: z.literal("navigate"), url: z.string().url().max(2000) }),
  z.object({ op: z.literal("click"), selector }),
  z.object({ op: z.literal("type"), selector, text: z.string().max(MAX_TYPE_CHARS), clear: z.boolean().optional() }),
  z.object({ op: z.literal("press"), key: z.enum(["Enter", "Tab", "Escape", "PageDown", "ArrowDown"]) }),
  z.object({ op: z.literal("read"), selector: selector.optional(), mode: z.enum(["text", "html"]).default("text") }),
  z.object({ op: z.literal("readAll"), selector, attr: z.string().max(40).optional(), limit: z.number().int().min(1).max(200).default(100) }),
  z.object({ op: z.literal("scroll"), dy: z.number().int().min(-5000).max(5000) }),
  z.object({ op: z.literal("wait"), ms: z.number().int().min(0).max(30000).optional(), selector: selector.optional() }),
  z.object({ op: z.literal("url") }),
  z.object({ op: z.literal("screenshot") }),
  z.object({ op: z.literal("detect_challenge") }),
]);
export type Primitive = z.infer<typeof Primitive>;

export const CloudToExecutor = z.object({ id: z.string().max(64), type: z.literal("cmd"), action: Primitive });
export type CloudToExecutor = z.infer<typeof CloudToExecutor>;

export const ExecutorToCloud = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hello"), version: z.string().max(32), platform: z.string().max(100), browserConnected: z.boolean() }),
  z.object({ type: z.literal("heartbeat"), browserConnected: z.boolean() }),
  z.object({
    type: z.literal("result"), id: z.string().max(64), ok: z.boolean(),
    data: z.unknown().optional(), error: z.string().max(500).optional(),
  }),
]);
export type ExecutorToCloud = z.infer<typeof ExecutorToCloud>;

export function hostAllowed(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
  } catch {
    return false;
  }
}

export const CHALLENGE_PATTERNS = [
  "captcha", "verify you are human", "verify you're human", "unusual activity", "security verification",
  "let's do a quick security check", "checkpoint", "are you a robot", "confirm it's you",
];
