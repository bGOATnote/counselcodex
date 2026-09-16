import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { assertDemoPortAvailable, DEMO_URL, inspectDemoSetup, launchDemo, main } from "../scripts/demo.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "counsel-demo-launcher-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "apps/evaluation/.next"), { recursive: true });
  writeFileSync(join(root, "apps/evaluation/.next/BUILD_ID"), "offline-fixture");
  return { root, resolveNext: () => "/fixture/next", nodeVersion: "22.18.0", environment: {} };
}

test("preflight reads root .env without returning a secret and honors server environment precedence", (t) => {
  const options = fixture(t);
  writeFileSync(join(options.root, ".env"), 'ANTHROPIC_API_KEY="offline-fixture-value"\n');
  const setup = inspectDemoSetup(options);
  assert.deepEqual(Object.keys(setup).sort(), ["nextBinary", "workspace"]);
  assert.ok(!JSON.stringify(setup).includes("offline-fixture-value"));
  rmSync(join(options.root, ".env"));
  mkdirSync(join(options.root, ".env")); // unreadable as a file, but environment wins
  assert.doesNotThrow(() => inspectDemoSetup({ ...options, environment: { ANTHROPIC_API_KEY: "environment-fixture" } }));
  assert.throws(() => inspectDemoSetup(options), /could not be read/);
});

test("preflight gives actionable failures for missing key, build, dependencies and unsupported Node", (t) => {
  const options = fixture(t);
  assert.throws(() => inspectDemoSetup(options), /ANTHROPIC_API_KEY is missing/);
  assert.throws(() => inspectDemoSetup({ ...options, environment: { ANTHROPIC_API_KEY: "  " } }), /missing or empty/);
  for (const nodeVersion of ["22.17.0", "23.0.0", "24.3.0", "24.10.9"]) {
    assert.throws(() => inspectDemoSetup({ ...options, nodeVersion }), /Node.js 22.18/);
  }
  for (const nodeVersion of ["22.18.0", "22.20.0", "24.11.0", "24.19.0"]) {
    assert.doesNotThrow(() => inspectDemoSetup({ ...options, nodeVersion, environment: { ANTHROPIC_API_KEY: "offline-fixture-value" } }));
  }
  assert.throws(() => inspectDemoSetup({ ...options, resolveNext: () => { throw new Error("module missing"); } }), /npm ci/);
  rmSync(join(options.root, "apps/evaluation/.next/BUILD_ID"));
  assert.throws(() => inspectDemoSetup(options), /npm run review:build/);
});

test("an occupied loopback port fails without stopping its owner", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen({ host: "127.0.0.1", port: 0 }, resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  await assert.rejects(assertDemoPortAvailable(port), /already in use/);
  assert.equal(server.listening, true);
});

test("an IPv6 localhost listener also blocks the canonical port", async (t) => {
  const server = createServer();
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host: "::1", port: 0, ipv6Only: true }, resolve); });
  } catch (error) {
    if (["EAFNOSUPPORT", "EADDRNOTAVAIL"].includes(error.code)) return t.skip("IPv6 loopback is unavailable on this host");
    throw error;
  }
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await assert.rejects(assertDemoPortAvailable(server.address().port), /already in use/);
  assert.equal(server.listening, true);
});

test("offline route needs no key, dependencies, build, port or server", async () => {
  const output = [];
  const forbidden = () => { throw new Error("live dependency reached"); };
  assert.equal(await main(["--offline"], { root: "/saved/repo", output: (line) => output.push(line), inspect: forbidden, checkPort: forbidden, launch: forbidden }), 0);
  assert.match(output.join("\n"), /counsel-disposition-take-home.pdf/);
  assert.match(output.join("\n"), /no server, API key or new model calls/);
});

test("preflight-only does not launch and rejects silent alternate-port options", async () => {
  const output = [];
  let checked = 0;
  const deps = { inspect: () => ({}), checkPort: async () => { checked++; }, launch: () => { throw new Error("must not launch"); }, output: (line) => output.push(line) };
  assert.equal(await main(["--check"], deps), 0);
  assert.equal(checked, 1);
  assert.ok(output.join("\n").includes(DEMO_URL));
  await assert.rejects(main(["--port", "4121"], deps), /fixed at 4120/);
});

test("launcher starts the workspace on the exact loopback port and propagates a bind failure", async () => {
  let captured;
  const child = new EventEmitter();
  child.kill = () => true;
  const exit = launchDemo({ workspace: "/demo/apps/evaluation", nextBinary: "/demo/next" }, {
    environment: { PORT: "4121" },
    spawnProcess: (command, args, options) => { captured = { command, args, options }; return child; },
  });
  assert.deepEqual(captured.args, ["/demo/next", "start", "--hostname", "127.0.0.1", "--port", "4120"]);
  assert.equal(captured.options.cwd, "/demo/apps/evaluation");
  assert.equal(captured.options.shell, false);
  assert.equal(captured.options.env.NODE_ENV, "production");
  child.emit("exit", 1, null); // e.g. a competing process binds after preflight
  assert.equal(await exit, 1);
});
