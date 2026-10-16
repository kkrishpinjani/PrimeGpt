import crypto from "node:crypto";

/** Quo/OpenPhone webhook URL token = "<tenantId>.<hmac>" so the URL cannot be guessed. */
export const quoWebhookToken = (tenantId: string) =>
  `${tenantId}.${crypto.createHmac("sha256", process.env.ENCRYPTION_KEY!).update("quo:" + tenantId).digest("hex").slice(0, 32)}`;
