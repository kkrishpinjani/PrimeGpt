import * as Sentry from "@sentry/nextjs";

/** Error tracking (WS9). Inert unless SENTRY_DSN is set. */
export async function register() {
  if (process.env.SENTRY_DSN && process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.1 });
  }
}

export const onRequestError = Sentry.captureRequestError;
