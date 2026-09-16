#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as util from "node:util";

export const DEMO_URL = "http://localhost:4120/stripped";
export const DEMO_PORT = 4120;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const guide = "docs/GUI_ACCESS.md";

export function inspectDemoSetup({ root = repositoryRoot, environment = process.env, nodeVersion = process.versions.node, resolveNext } = {}) {
  const [major, minor] = nodeVersion.split(".").map(Number);
  if (!(major > 22 || (major === 22 && minor >= 18))) throw new Error("Use Node.js 22.18 or newer, then run npm ci.");
  let nextBinary;
  try { nextBinary = (resolveNext ?? (() => createRequire(join(root, "package.json")).resolve("next/dist/bin/next")))(); }
  catch { throw new Error("Dependencies are missing. Run npm ci from the repository root."); }
  const workspace = join(root, "apps/evaluation");
  if (!existsSync(join(workspace, ".next/BUILD_ID"))) throw new Error("The GUI production build is missing. Run npm run review:build, then npm run demo.");
  let apiKey = environment.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const envPath = join(root, ".env");
    try { if (existsSync(envPath)) apiKey = util.parseEnv(readFileSync(envPath, "utf8")).ANTHROPIC_API_KEY; }
    catch { throw new Error("The repository-root .env could not be read. Check its format and permissions; no values were printed."); }
  }
  if (!apiKey?.trim()) throw new Error("ANTHROPIC_API_KEY is missing or empty. Set it in the server environment or repository-root .env. Saved results need no key: npm run demo:offline.");
  // Availability only: never print, return or verify the credential over the network.
  return { workspace, nextBinary };
}

export async function assertDemoPortAvailable(port = DEMO_PORT) {
  // localhost may resolve to either family. An unrelated IPv6 listener must not
  // intercept the canonical URL even though this server binds IPv4 explicitly.
  for (const host of ["127.0.0.1", "::1"]) {
    await new Promise((resolvePort, reject) => {
      const probe = createServer();
      probe.once("error", (error) => {
        if (host === "::1" && ["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) return resolvePort();
        reject(new Error(error.code === "EADDRINUSE"
          ? `Port ${port} is already in use. Stop the server you own on this port, then retry. No process was stopped and no alternate port was selected.`
          : `Could not reserve loopback port ${port}. Check local networking permissions; no alternate port was selected.`));
      });
      probe.once("listening", () => probe.close((error) => error ? reject(new Error(`Could not release the port ${port} preflight probe.`)) : resolvePort()));
      probe.listen({ host, port, exclusive: true });
    });
  }
}

export function offlineDemoGuide(root = repositoryRoot) {
  return [
    "Saved demonstration artifacts (offline; no server, API key or new model calls):",
    join(root, "output/submission-2026-09-15/README.md"),
    join(root, "output/submission-2026-09-15/counsel-disposition-take-home.pdf"),
    join(root, "output/submission-2026-09-15/counsel-disposition-adjudication-v3.xlsx"),
    join(root, "outputs/stripped-3bucket-fable-2026-09-15"),
    `Open these saved files directly. They do not start the live GUI. See ${guide}.`,
  ].join("\n");
}

export function launchDemo({ workspace, nextBinary }, { environment = process.env, spawnProcess = spawn } = {}) {
  return new Promise((resolveExit, reject) => {
    // Next start with an explicit port fails if another process wins the race
    // after preflight. It does not use next dev's automatic port selection.
    const child = spawnProcess(process.execPath, [nextBinary, "start", "--hostname", "127.0.0.1", "--port", String(DEMO_PORT)], {
      cwd: workspace, stdio: "inherit", shell: false,
      env: { ...environment, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    });
    const interrupt = () => child.kill("SIGINT");
    const terminate = () => child.kill("SIGTERM");
    const cleanup = () => { process.off("SIGINT", interrupt); process.off("SIGTERM", terminate); };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", terminate);
    child.once("error", () => { cleanup(); reject(new Error("The GUI server could not start. Run npm ci and npm run review:build, then retry.")); });
    child.once("exit", (code, signal) => { cleanup(); resolveExit(code ?? (signal === "SIGINT" ? 130 : signal === "SIGTERM" ? 143 : 1)); });
  });
}

export async function main(args = process.argv.slice(2), { root = repositoryRoot, environment = process.env, output = console.log, checkPort = assertDemoPortAvailable, inspect = inspectDemoSetup, launch = launchDemo } = {}) {
  if (args.length > 1 || (args.length === 1 && !["--check", "--offline", "--help"].includes(args[0]))) throw new Error("Usage: npm run demo [-- --check|--offline|--help]. The live port is fixed at 4120.");
  if (args[0] === "--help") { output(`Live: npm run demo → ${DEMO_URL}\nPreflight only: npm run demo:check\nSaved files: npm run demo:offline\nSetup: ${guide}`); return 0; }
  if (args[0] === "--offline") { output(offlineDemoGuide(root)); return 0; }
  const setup = inspect({ root, environment });
  await checkPort();
  output(`Local setup passed; no model calls were made.\nCanonical live URL: ${DEMO_URL}`);
  if (args[0] === "--check") { output("Preflight finished. No server was started. Run npm run demo when ready."); return 0; }
  output("Starting the GUI. Open the canonical URL after Next reports Ready.\nGet disposition makes a paid provider call using the local demo allowance.\nKeep this terminal open; Ctrl+C stops this launcher server.");
  return launch(setup, { environment });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((error) => { console.error(`Demo could not start: ${error.message}\nSetup guide: ${guide}`); process.exitCode = 1; });
}
