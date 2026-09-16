import assert from "node:assert/strict";

// Run against `next start`, not `next dev`. This spends no provider tokens and
// complements (does not replace) a real browser hydration/assessment rehearsal.
const seen = new Set<string>();
for (const path of ["/", "/", "/candidate", "/candidate", "/review", "/v0", "/quality"]) {
  const response = await fetch(`http://127.0.0.1:4120${path}`);
  assert.equal(response.status, 200, `${path}: document unavailable`);
  const csp = response.headers.get("content-security-policy") ?? "";
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
  assert.ok(nonce, `${path}: missing CSP nonce`);
  assert.ok(!seen.has(nonce), `${path}: nonce reused across documents`);
  seen.add(nonce);
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map(([tag]) => tag);
  assert.ok(scripts.length > 0, `${path}: no hydration scripts`);
  for (const tag of scripts) assert.ok(tag.includes(`nonce="${nonce}"`), `${path}: script lacks this response's nonce`);
  console.log(`${path}: HTTP 200; ${scripts.length} scripts match a fresh CSP nonce`);
}
