/** Logical backup via mysqldump. Usage: npm run backup  (schedule daily; copy backups/ off-box). Keeps the newest 14. */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const url = new URL(process.env.DATABASE_URL ?? "");
const dir = path.resolve("backups");
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `recruitgpt-${new Date().toISOString().replace(/[:.]/g, "-")}.sql`);
const bin = process.env.MYSQLDUMP ?? (fs.existsSync("C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe") ? "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe" : "mysqldump");
const r = spawnSync(bin, ["-h", url.hostname, "-P", url.port || "3306", "-u", decodeURIComponent(url.username), "--single-transaction", "--routines", "--result-file", file, url.pathname.slice(1)], {
  env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: "inherit",
});
if (r.status !== 0) { console.error("backup failed"); process.exit(1); }
const all = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const old of all.slice(0, Math.max(0, all.length - 14))) fs.unlinkSync(path.join(dir, old));
console.log("backup written:", file);
