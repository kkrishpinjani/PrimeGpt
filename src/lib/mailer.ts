import nodemailer from "nodemailer";

/** System email (invites etc.) over SMTP. This is NOT recruiter outreach, which goes through each tenant's own Gmail. */
export const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendSystemEmail(to: string, subject: string, text: string): Promise<boolean> {
  if (!smtpConfigured()) return false;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  try {
    await t.sendMail({ from: process.env.SMTP_FROM ?? "RecruitGPT <no-reply@recruitgpt.ai>", to, subject, text });
    return true;
  } catch (e) {
    console.error("[mailer] send failed:", (e as Error).message);
    return false;
  }
}
