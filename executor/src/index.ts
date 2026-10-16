#!/usr/bin/env node
/**
 * RecruitGPT Local Helper ("local hands").
 *
 * Runs on the customer's computer and does exactly one thing: carry out generic browser primitives
 * (navigate / click / type / read ...) that the RecruitGPT cloud sends, inside the customer's OWN
 * signed-in Chrome, from their OWN residential connection. It holds no prompts, rubrics or skills.
 *
 * Safety rails enforced HERE (not only in the cloud):
 *  - schema-validated commands only (protocol.ts), https + LinkedIn/Indeed hosts only
 *  - human-like pacing + hard rate limits
 *  - never solves or bypasses captchas / verification: it reports them so a human can act
 */
import { WebSocket } from "ws";
import { chromium, type Browser, type Page } from "playwright-core";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CHALLENGE_PATTERNS, CloudToExecutor, hostAllowed } from "./protocol.js";

const VERSION = "0.1.0";
const CFG_DIR = path.join(os.homedir(), ".recruitgpt");
const CFG_FILE = path.join(CFG_DIR, "config.json");
const PROFILE_DIR = path.join(CFG_DIR, "chrome-profile");
const CDP = process.env.RGPT_CDP ?? "http://127.0.0.1:9222";

type Cfg = { server: string; gateway: string; token: string };
const loadCfg = (): Cfg | null => { try { return JSON.parse(fs.readFileSync(CFG_FILE, "utf8")); } catch { return null; } };
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (min: number, max: number) => min + Math.random() * (max - min);

// ───────────── commands ─────────────
async function pair(code: string, server: string) {
  const r = await fetch(`${server.replace(/\/$/, "")}/api/executor/pair`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, platform: `${os.platform()} ${os.release()}` }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? `pairing failed (${r.status})`);
  fs.mkdirSync(CFG_DIR, { recursive: true });
  fs.writeFileSync(CFG_FILE, JSON.stringify({ server, gateway: j.gateway, token: j.token }, null, 2), { mode: 0o600 });
  log("Paired. Next: `chrome` to open the dedicated browser and sign in to LinkedIn/Indeed, then `run`.");
}

function findChrome() {
  const c = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  return c.find((p) => fs.existsSync(p));
}

function launchChrome() {
  const exe = findChrome();
  if (!exe) throw new Error("Chrome not found. Set CHROME_PATH.");
  fs.mkdirSync(PROFILE_DIR, { recursive: true });
  spawn(exe, [`--remote-debugging-port=${new URL(CDP).port}`, `--user-data-dir=${PROFILE_DIR}`, "--no-first-run", "https://www.linkedin.com/login"], { detached: true, stdio: "ignore" }).unref();
  log("Opened the dedicated RecruitGPT browser profile. Sign in to LinkedIn Recruiter / Indeed there, and leave it open.");
}

// ───────────── browser ─────────────
let browser: Browser | null = null;
async function getPage(): Promise<Page> {
  if (!browser || !browser.isConnected()) browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  if (!ctx) throw new Error("No browser context. Run `chrome` first.");
  return ctx.pages()[0] ?? (await ctx.newPage());
}
const browserUp = async () => { try { await getPage(); return true; } catch { return false; } };

// ───────────── rate limits ─────────────
const navTimes: number[] = [];
const actionTimes: number[] = [];
let lastNav = 0;
function check(limit: number, arr: number[], windowMs: number) {
  const now = Date.now();
  while (arr.length && now - arr[0] > windowMs) arr.shift();
  if (arr.length >= limit) throw new Error("local rate limit reached; slowing down to protect your account");
  arr.push(now);
}

async function detectChallenge(page: Page) {
  const url = page.url().toLowerCase();
  if (/checkpoint|captcha|challenge|authwall|uas\/login/.test(url)) return { challenge: true, kind: "verification_or_login_wall" };
  const text = (await page.evaluate(() => document.body?.innerText?.slice(0, 4000) ?? "").catch(() => "")).toLowerCase();
  const hit = CHALLENGE_PATTERNS.find((p) => text.includes(p));
  if (hit) return { challenge: true, kind: hit };
  if (await page.locator("iframe[src*='captcha'], iframe[src*='recaptcha'], #captcha-internal").count().catch(() => 0)) return { challenge: true, kind: "captcha" };
  return { challenge: false };
}

async function execute(cmd: CloudToExecutor["action"]): Promise<unknown> {
  check(600, actionTimes, 3_600_000);
  const page = await getPage();
  switch (cmd.op) {
    case "navigate": {
      if (!hostAllowed(cmd.url)) throw new Error("host not allowed");
      check(40, navTimes, 600_000);
      const gap = jitter(3500, 8500) - (Date.now() - lastNav);
      if (gap > 0) await sleep(gap);
      await page.goto(cmd.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      lastNav = Date.now();
      await sleep(jitter(800, 2200));
      return { url: page.url() };
    }
    case "click": await sleep(jitter(250, 900)); await page.locator(cmd.selector).first().click({ timeout: 15_000 }); return {};
    case "type": {
      const el = page.locator(cmd.selector).first();
      await el.click({ timeout: 15_000 });
      if (cmd.clear) await page.keyboard.press("Control+A").then(() => page.keyboard.press("Backspace"));
      await page.keyboard.type(cmd.text, { delay: jitter(25, 70) });
      return {};
    }
    case "press": await page.keyboard.press(cmd.key); return {};
    case "read": {
      if (!cmd.selector) return (await page.evaluate(() => document.body?.innerText ?? "")).slice(0, 60_000);
      const el = page.locator(cmd.selector).first();
      return cmd.mode === "html" ? (await el.innerHTML({ timeout: 10_000 })).slice(0, 120_000) : (await el.innerText({ timeout: 10_000 })).slice(0, 60_000);
    }
    case "readAll": {
      const els = await page.locator(cmd.selector).all();
      const out: string[] = [];
      for (const el of els.slice(0, cmd.limit)) out.push(cmd.attr ? ((await el.getAttribute(cmd.attr)) ?? "") : (await el.innerText()).slice(0, 2000));
      return out;
    }
    case "scroll": await page.mouse.wheel(0, cmd.dy); await sleep(jitter(400, 1100)); return {};
    case "wait": if (cmd.selector) await page.locator(cmd.selector).first().waitFor({ timeout: cmd.ms ?? 15_000 }); else await sleep(cmd.ms ?? 1000); return {};
    case "url": return page.url();
    case "screenshot": return (await page.screenshot({ type: "jpeg", quality: 55 })).toString("base64");
    case "detect_challenge": return detectChallenge(page);
  }
}

// ───────────── connection loop ─────────────
async function run() {
  const cfg = loadCfg();
  if (!cfg) throw new Error("Not paired. Run: recruitgpt-helper pair <CODE> --server https://recruitgpt.ai");
  let backoff = 1000;
  for (;;) {
    await new Promise<void>((resolve) => {
      const ws = new WebSocket(`${cfg.gateway}/executor?token=${encodeURIComponent(cfg.token)}`);
      let hb: NodeJS.Timeout;
      ws.on("open", async () => {
        backoff = 1000;
        log("connected to RecruitGPT cloud");
        ws.send(JSON.stringify({ type: "hello", version: VERSION, platform: `${os.platform()} ${os.arch()}`, browserConnected: await browserUp() }));
        hb = setInterval(async () => ws.readyState === 1 && ws.send(JSON.stringify({ type: "heartbeat", browserConnected: await browserUp() })), 15_000);
      });
      ws.on("message", async (raw) => {
        let cmd: CloudToExecutor;
        try { cmd = CloudToExecutor.parse(JSON.parse(raw.toString())); }
        catch { log("rejected a malformed/unknown command"); return; }
        try {
          const data = await execute(cmd.action);
          ws.send(JSON.stringify({ type: "result", id: cmd.id, ok: true, data }));
        } catch (e) {
          ws.send(JSON.stringify({ type: "result", id: cmd.id, ok: false, error: String((e as Error).message).slice(0, 400) }));
        }
      });
      ws.on("close", (code) => { clearInterval(hb); if (code === 4401) { log("device token revoked. Re-pair from the RecruitGPT web app."); process.exit(1); } resolve(); });
      ws.on("error", () => { /* close follows */ });
    });
    log(`disconnected; retrying in ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 30_000);
  }
}

// ───────────── cli ─────────────
const [cmd, ...rest] = process.argv.slice(2);
const flag = (n: string) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
(async () => {
  if (cmd === "pair") return pair(rest[0], flag("--server") ?? process.env.RGPT_SERVER ?? "https://recruitgpt.ai");
  if (cmd === "chrome") return launchChrome();
  if (cmd === "run") return run();
  console.log("RecruitGPT Local Helper\n  pair <CODE> [--server URL]   pair this computer with your workspace\n  chrome                        open the dedicated browser profile (sign in to LinkedIn/Indeed)\n  run                           connect and carry out browser actions for your workspace");
})().catch((e) => { console.error("Error:", e.message); process.exit(1); });
