import { google } from "googleapis";
import { prisma } from "../db";
import { getSecret, saveSecret } from "./store";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar.events",
  "openid",
  "email",
];

export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function oauthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.APP_URL}/api/integrations/google/callback`,
  );
}

export function authUrl(state: string) {
  return oauthClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: GOOGLE_SCOPES, state });
}

async function authedClient(tenantId: string) {
  const s = await getSecret<{ refresh_token: string; email?: string }>(tenantId, "gmail");
  if (!s?.refresh_token) throw new Error("Gmail is not connected for this workspace");
  const c = oauthClient();
  c.setCredentials({ refresh_token: s.refresh_token });
  return { c, email: s.email };
}

export async function handleOAuthCallback(tenantId: string, code: string) {
  const c = oauthClient();
  const { tokens } = await c.getToken(code);
  if (!tokens.refresh_token) throw new Error("Google did not return a refresh token; revoke access and retry");
  c.setCredentials(tokens);
  const info = await google.oauth2({ version: "v2", auth: c }).userinfo.get();
  const email = info.data.email ?? undefined;
  await saveSecret(tenantId, "gmail", { refresh_token: tokens.refresh_token, email }, email);
  await saveSecret(tenantId, "gcalendar", { refresh_token: tokens.refresh_token, email }, email);
  return email;
}

const b64url = (s: string) => Buffer.from(s).toString("base64url");
const encHeader = (s: string) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s).toString("base64")}?=`);

export async function sendGmail(tenantId: string, m: { to: string; subject: string; body: string; threadId?: string }) {
  const { c, email } = await authedClient(tenantId);
  const raw = [
    `From: ${email ?? "me"}`,
    `To: ${m.to}`,
    `Subject: ${encHeader(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    m.body,
  ].join("\r\n");
  const r = await google.gmail({ version: "v1", auth: c }).users.messages.send({
    userId: "me",
    requestBody: { raw: b64url(raw), threadId: m.threadId },
  });
  return { id: r.data.id!, threadId: r.data.threadId! };
}

export async function createGmailDraft(tenantId: string, m: { to: string; subject: string; body: string }) {
  const { c } = await authedClient(tenantId);
  const raw = [`To: ${m.to}`, `Subject: ${encHeader(m.subject)}`, 'Content-Type: text/plain; charset="UTF-8"', "", m.body].join("\r\n");
  const r = await google.gmail({ version: "v1", auth: c }).users.drafts.create({ userId: "me", requestBody: { message: { raw: b64url(raw) } } });
  return r.data.id!;
}

export type InboundEmail = { id: string; threadId: string; from: string; subject: string; body: string; date: Date };

/** Inbox watch: unread inbound mail since `sinceMs`, excluding our own sends. */
export async function pollInbox(tenantId: string, sinceMs: number): Promise<InboundEmail[]> {
  const { c, email } = await authedClient(tenantId);
  const gmail = google.gmail({ version: "v1", auth: c });
  const after = Math.floor(sinceMs / 1000);
  const list = await gmail.users.messages.list({ userId: "me", q: `in:inbox after:${after} -from:me`, maxResults: 50 });
  const out: InboundEmail[] = [];
  for (const m of list.data.messages ?? []) {
    const full = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" });
    const h = (n: string) => full.data.payload?.headers?.find((x) => x.name?.toLowerCase() === n)?.value ?? "";
    const from = h("from");
    if (email && from.toLowerCase().includes(email.toLowerCase())) continue;
    out.push({
      id: full.data.id!, threadId: full.data.threadId!, from, subject: h("subject"),
      body: extractBody(full.data.payload) || full.data.snippet || "", date: new Date(Number(full.data.internalDate)),
    });
  }
  return out;
}

function extractBody(p: any): string {
  if (!p) return "";
  if (p.mimeType === "text/plain" && p.body?.data) return Buffer.from(p.body.data, "base64url").toString("utf8");
  for (const part of p.parts ?? []) {
    const t = extractBody(part);
    if (t) return t;
  }
  return "";
}

export async function labelThread(tenantId: string, threadId: string, labelName: string) {
  const { c } = await authedClient(tenantId);
  const gmail = google.gmail({ version: "v1", auth: c });
  const labels = await gmail.users.labels.list({ userId: "me" });
  let id = labels.data.labels?.find((l) => l.name === labelName)?.id;
  if (!id) id = (await gmail.users.labels.create({ userId: "me", requestBody: { name: labelName } })).data.id!;
  await gmail.users.threads.modify({ userId: "me", id: threadId, requestBody: { addLabelIds: [id] } });
}

/** Scheduling: Google Calendar event with a Meet link. */
export async function createMeetEvent(tenantId: string, e: { summary: string; description?: string; start: Date; end: Date; attendees: string[] }) {
  const { c } = await authedClient(tenantId);
  const r = await google.calendar({ version: "v3", auth: c }).events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all",
    requestBody: {
      summary: e.summary,
      description: e.description,
      start: { dateTime: e.start.toISOString() },
      end: { dateTime: e.end.toISOString() },
      attendees: e.attendees.map((email) => ({ email })),
      conferenceData: { createRequest: { requestId: `rg-${Date.now()}`, conferenceSolutionKey: { type: "hangoutsMeet" } } },
    },
  });
  return { eventId: r.data.id!, meetLink: r.data.hangoutLink ?? null };
}

export async function gmailConnected(tenantId: string) {
  return !!(await prisma.integration.findUnique({ where: { tenantId_provider: { tenantId, provider: "gmail" } } }));
}
