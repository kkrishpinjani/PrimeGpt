// Bundles the local helper into public/helper/helper.mjs (+ version.json) so the web app can serve it for one-click install and auto-update.
import { build } from "esbuild";
import crypto from "node:crypto";
import fs from "node:fs";

const out = "public/helper/helper.mjs";
fs.mkdirSync("public/helper", { recursive: true });
await build({
  entryPoints: ["executor/src/index.ts"],
  outfile: out,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["playwright-core"], // installed next to the bundle by the installer
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "warning",
});
const body = fs.readFileSync(out);
const version = /const VERSION = "([^"]+)"/.exec(fs.readFileSync("executor/src/index.ts", "utf8"))[1];
fs.writeFileSync("public/helper/version.json", JSON.stringify({ version, sha256: crypto.createHash("sha256").update(body).digest("hex") }, null, 2));
console.log(`helper ${version} built (${(body.length / 1024).toFixed(0)} KB)`);
