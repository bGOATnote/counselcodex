import assert from "node:assert/strict";
import test from "node:test";
import { Agent } from "@mastra/core/agent";
import { noopLogger } from "@mastra/core/logger";
import { Mastra } from "@mastra/core/mastra";
import { createHonoServer } from "@mastra/deployer/server";
import { LOCAL_CLI_HEADER, LOCAL_CLI_VALUE, localServerPolicy, localServerRequestGuard } from "../src/mastra/local-server-policy.ts";

async function fixture(t) {
  let dispatches = 0;
  const agent = new Agent({ id: "local-policy-test", name: "Local policy test", instructions: "Synthetic HTTP boundary test.", model: "openai/gpt-4o-mini" });
  // Exercise the native raw-agent endpoint without a model call, key or store.
  agent.generate = async () => { dispatches++; return { text: "Stub response" }; };
  const mastra = new Mastra({ agents: { testAgent: agent }, server: localServerPolicy, logger: noopLogger });
  mastra.setServerMiddleware(localServerRequestGuard);
  t.after(() => mastra.shutdown());
  const app = await createHonoServer(mastra, { tools: {}, browserStream: false });
  return { app, dispatches: () => dispatches };
}

function request({ origin = "http://127.0.0.1:4111", url = "http://127.0.0.1:4111/api/agents/testAgent/generate", method = "POST", headers = {}, body } = {}) {
  return new Request(url, {
    method,
    headers: { host: new URL(url).host, "content-type": "application/json", ...(origin === null ? {} : { origin }), ...headers },
    ...(method === "GET" || method === "HEAD" || method === "OPTIONS" ? {} : { body: body ?? JSON.stringify({ messages: [{ role: "user", content: "Synthetic test message" }] }) }),
  });
}

test("native policy fixes the bind address and port independently of environment defaults", () => {
  assert.equal(localServerPolicy.host, "127.0.0.1");
  assert.equal(localServerPolicy.port, 4111);
  assert.equal(localServerPolicy.cors.credentials, false);
});

test("native same-origin Studio requests can dispatch on each explicit local origin", async (t) => {
  const f = await fixture(t);
  for (const origin of ["http://127.0.0.1:4111", "http://localhost:4111"]) {
    const response = await f.app.fetch(request({ origin, url: `${origin}/api/agents/testAgent/generate`, headers: { "sec-fetch-site": "same-origin", "x-mastra-client-type": "studio" } }));
    assert.equal(response.status, 200, await response.text());
    assert.equal(response.headers.get("access-control-allow-origin"), origin);
  }
  assert.equal(f.dispatches(), 2);
});

test("foreign, null and mismatched browser origins never dispatch, even with the CLI header", async (t) => {
  const f = await fixture(t);
  for (const origin of ["https://attacker.invalid", "http://127.0.0.1:4999", "http://localhost:4111", "null", ""]) {
    const response = await f.app.fetch(request({ origin, headers: { [LOCAL_CLI_HEADER]: LOCAL_CLI_VALUE } }));
    assert.equal(response.status, 403, origin);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await response.json(), { error: "LOCAL_ORIGIN_REQUIRED" });
  }
  // A simple cross-origin POST must also be stopped server-side, not just by CORS.
  const simple = await f.app.fetch(request({ origin: "https://attacker.invalid", headers: { "content-type": "text/plain" } }));
  assert.equal(simple.status, 403);
  assert.equal(f.dispatches(), 0);
});

test("rebinding, unexpected Host and cross-site fetch metadata never dispatch", async (t) => {
  const f = await fixture(t);
  const invalid = [
    request({ origin: "http://attacker.invalid:4111", url: "http://attacker.invalid:4111/api/agents/testAgent/generate" }),
    request({ headers: { host: "attacker.invalid:4111" } }),
    request({ headers: { host: "" } }),
    request({ headers: { "sec-fetch-site": "cross-site", [LOCAL_CLI_HEADER]: LOCAL_CLI_VALUE } }),
    request({ headers: { "sec-fetch-site": "same-site" } }),
    request({ origin: null, headers: { "sec-fetch-site": "cross-site", [LOCAL_CLI_HEADER]: LOCAL_CLI_VALUE } }),
    request({ origin: "http://127.0.0.1:4112", url: "http://127.0.0.1:4112/api/agents/testAgent/generate" }),
    request({ origin: "https://127.0.0.1:4111", url: "https://127.0.0.1:4111/api/agents/testAgent/generate" }),
  ];
  for (const incoming of invalid) assert.equal((await f.app.fetch(incoming)).status, 403);
  assert.equal(f.dispatches(), 0);
});

test("originless CLI mutations require the explicit local header", async (t) => {
  const f = await fixture(t);
  for (const value of [undefined, "", "wrong"]) {
    const headers = value === undefined ? {} : { [LOCAL_CLI_HEADER]: value };
    assert.equal((await f.app.fetch(request({ origin: null, headers }))).status, 403);
  }
  assert.equal(f.dispatches(), 0);
  const response = await f.app.fetch(request({ origin: null, headers: { [LOCAL_CLI_HEADER]: LOCAL_CLI_VALUE } }));
  assert.equal(response.status, 200, await response.text());
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal(f.dispatches(), 1);
});

test("protected reads enforce local Host and browser origin while permitting local CLI reads", async (t) => {
  const f = await fixture(t);
  const read = { method: "GET", url: "http://127.0.0.1:4111/api/agents" };
  assert.equal((await f.app.fetch(request({ ...read, origin: null }))).status, 200);
  assert.equal((await f.app.fetch(request({ ...read, origin: null, headers: { "sec-fetch-site": "none" } }))).status, 200);
  assert.equal((await f.app.fetch(request({ ...read, origin: "https://attacker.invalid" }))).status, 403);
  assert.equal((await f.app.fetch(request({ ...read, origin: null, headers: { host: "attacker.invalid:4111" } }))).status, 403);
  assert.equal(f.dispatches(), 0);
});

test("the guard rejects foreign preflight before native CORS can short-circuit", async (t) => {
  const f = await fixture(t);
  const preflight = { method: "OPTIONS", headers: { "access-control-request-method": "POST", "access-control-request-headers": "content-type,x-counsel-local" } };
  const denied = await f.app.fetch(request({ ...preflight, origin: "https://attacker.invalid" }));
  assert.equal(denied.status, 403);
  assert.equal(denied.headers.get("access-control-allow-origin"), null);
  const allowed = await f.app.fetch(request(preflight));
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("access-control-allow-origin"), "http://127.0.0.1:4111");
  assert.match(allowed.headers.get("access-control-allow-headers"), /x-counsel-local/i);
  assert.equal(f.dispatches(), 0);
});
