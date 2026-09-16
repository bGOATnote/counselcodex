import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSourceLink, validateSourceUrl, sourceRegistryHash } from '../src/evaluation/source-link-checker.mjs';

const allowedHosts = new Set(['www.cdc.gov']);
const source = { id: 'test', url: 'https://www.cdc.gov/test' };
const run = (fetchImpl, options = {}) => checkSourceLink(source, { allowedHosts, fetchImpl, ...options });

test('public GETs omit credentials and never equate HTTP 200 with clinical support', async () => {
  const check = await run(async (url, options) => {
    assert.equal(url, source.url);
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'manual');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.body, undefined);
    return new Response('<html><title>Clinical article</title></html>', { headers: { 'content-type': 'text/html' } });
  });
  assert.equal(check.status, 'reachable_html_unverified');
  assert.equal(check.claimSupportVerified, false);
  assert.match(check.inspectedPrefixSha256, /^[a-f0-9]{64}$/);
});

test('private, credentialed, non-HTTPS and off-publisher URLs are refused', () => {
  for (const url of ['http://www.cdc.gov/a', 'https://127.0.0.1/a', 'https://[::1]/', 'https://www.cdc.gov.attacker.test/', 'https://user:pass@www.cdc.gov/', 'https://www.cdc.gov:444/a', 'file:///etc/passwd']) assert.throws(() => validateSourceUrl(url, allowedHosts));
});

test('redirects are logged and revalidated before another request', async () => {
  let calls = 0;
  const blocked = await run(async () => { calls++; return new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }); });
  assert.equal(blocked.status, 'unsafe_url');
  assert.equal(calls, 1);
  calls = 0;
  const success = await run(async () => ++calls === 1 ? new Response(null, { status: 301, headers: { location: '/new' } }) : new Response('%PDF-test', { headers: { 'content-type': 'application/pdf' } }));
  assert.equal(success.status, 'reachable_pdf_unverified');
  assert.equal(success.redirects.length, 1);
  assert.equal(success.finalUrl, 'https://www.cdc.gov/new');
});

test('bad status, anti-bot pages, redirect loops, errors and unexpected content are not success', async () => {
  for (const [status, expected] of [[403, 'access_blocked'], [429, 'access_blocked'], [404, 'http_error'], [500, 'http_error']]) assert.equal((await run(async () => new Response(null, { status }))).status, expected);
  assert.equal((await run(async () => new Response('<html><title>Just a moment...</title></html>', { headers: { 'content-type': 'text/html' } }))).status, 'access_blocked');
  assert.equal((await run(async () => new Response(null, { status: 302, headers: { location: '/loop' } }))).status, 'redirect_error');
  assert.equal((await run(async () => { throw new DOMException('deadline', 'TimeoutError'); })).status, 'timeout');
  assert.equal((await run(async () => { throw new Error('secret response text'); })).status, 'network_error');
  assert.equal((await run(async () => new Response('{}'))).status, 'unexpected_content');
});

test('download limits bound memory, log truncation and hash changes', async () => {
  const check = await run(async () => new Response('<html>' + 'a'.repeat(200)), { maxBytes: 32 });
  assert.equal(check.bytesInspected, 32);
  assert.equal(check.bodyTruncated, true);
  assert.notEqual(sourceRegistryHash([source]), sourceRegistryHash([{ ...source, url: 'https://www.cdc.gov/new' }]));
});
