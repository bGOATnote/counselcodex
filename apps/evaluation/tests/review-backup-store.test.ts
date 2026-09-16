import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dataset, evaluationCases } from "../lib/cases.ts";
import { appendEvent, createWorkspace, emptyJudgment, judgmentFromDraft, MAX_IMPORT_BYTES, parseImportedWorkspace, stableStringify } from "../lib/review-state.ts";
import { readBoundedReviewBody, requireLocalReviewRequest, reviewBackupStore } from "../lib/review-backup-store.ts";
import { createReviewBackupHandler } from "../lib/review-backup-handler.ts";

const ids = evaluationCases.map(({ id }) => id);
const workspace = () => {
  const w = createWorkspace(dataset, ids, "2026-09-08T12:00:00.000Z");
  w.records.C01.draft.clinicalRationale = "AUTOMATED TEST DRAFT ONLY; not physician adjudication.";
  return w;
};
const directory = () => mkdtempSync(join(tmpdir(), "counsel-review-disk-test-"));

test("disk backup survives a fresh store instance and restores every draft without claiming review", async () => {
  const path = directory();
  const original = workspace();
  const store = reviewBackupStore(path, dataset, ids);
  const receipt = await store.save(stableStringify(original));
  assert.equal(receipt.started, 1);
  assert.equal(receipt.complete, 0);
  assert.equal(receipt.attested, false);
  const reopened = reviewBackupStore(path, dataset, ids);
  const restored = await parseImportedWorkspace(await reopened.load(receipt.id), dataset, ids);
  assert.deepEqual(restored, original);
  assert.equal(statSync(join(path, `${receipt.id}.json`)).mode & 0o777, 0o600);
  assert.equal((await reopened.list()).backups[0].id, receipt.id);
});

test("focused locked answers survive disk recovery without filling optional fields or erasing earlier notes", async () => {
  const path = directory();
  let original = workspace();
  const focused = judgmentFromDraft({ ...emptyJudgment(), disposition: "SAME_DAY_IN_PERSON", clinicalRationale: "AUTOMATED TEST: same-day assessment needed." });
  const lockedAt = "2026-09-08T12:01:00.000Z";
  original.records.C02 = { ...original.records.C02, draft: focused, blindJudgment: focused, finalJudgment: focused, blindCommittedAt: lockedAt };
  original = appendEvent(original, "C02", "blind_judgment_committed", lockedAt);
  const receipt = await reviewBackupStore(path, dataset, ids).save(stableStringify(original));
  const restored = await parseImportedWorkspace(await reviewBackupStore(path, dataset, ids).load(receipt.id), dataset, ids);
  assert.deepEqual(restored, original);
  assert.equal(restored.records.C02.blindJudgment?.confidence, "");
  assert.equal(restored.records.C02.blindJudgment?.evidenceSufficiency, "");
  assert.equal(restored.records.C02.completedAt, null);
  assert.equal(receipt.complete, 0);
  assert.equal(receipt.started, 2);
});

test("idempotent concurrent saves preserve bytes; changed drafts create new copies, never overwrite", async () => {
  const path = directory();
  const store = reviewBackupStore(path, dataset, ids);
  const raw = stableStringify(workspace());
  const receipts = await Promise.all([store.save(raw), store.save(raw)]);
  assert.equal(receipts[0].id, receipts[1].id);
  const original = readFileSync(join(path, `${receipts[0].id}.json`), "utf8");
  const changed = workspace();
  changed.records.C01.draft.clinicalRationale += " Updated draft.";
  const next = await store.save(stableStringify(changed));
  assert.notEqual(next.id, receipts[0].id);
  assert.equal(readFileSync(join(path, `${receipts[0].id}.json`), "utf8"), original);
  assert.equal(readdirSync(path).length, 2);
});

test("partial and corrupt copies never masquerade as recovery; corrupted files are preserved", async () => {
  const path = directory();
  const store = reviewBackupStore(path, dataset, ids);
  const receipt = await store.save(stableStringify(workspace()));
  writeFileSync(join(path, "interrupted.partial"), "partial test write");
  const corruptId = "a".repeat(64);
  writeFileSync(join(path, `${corruptId}.json`), "corrupt test fixture");
  const listing = await store.list();
  assert.deepEqual(listing.backups.map((r) => r.id), [receipt.id]);
  assert.equal(listing.unreadable, 1);
  assert.equal(readdirSync(path).length, 3);
  await assert.rejects(() => store.load(corruptId));
  await assert.rejects(() => store.load("../../.env"), /BACKUP_ID_INVALID/);
});

test("disk quotas fail visibly without eviction, including interrupted-write bytes", async () => {
  const path = directory();
  const store = reviewBackupStore(path, dataset, ids, { files: 1, bytes: MAX_IMPORT_BYTES });
  const raw = stableStringify(workspace());
  const receipt = await store.save(raw);
  assert.equal((await store.save(raw)).id, receipt.id);
  const next = workspace(); next.records.C02.draft.mustNotMiss = "TEST";
  await assert.rejects(() => store.save(stableStringify(next)), /BACKUP_CAPACITY_REACHED/);
  assert.equal((await store.list()).backups.length, 1);
  const partialPath = directory(); writeFileSync(join(partialPath, "crash.partial"), "1234567890");
  await assert.rejects(() => reviewBackupStore(partialPath, dataset, ids, { files: 10, bytes: 10 }).save(raw), /BACKUP_CAPACITY_REACHED/);
});

test("wrong dataset or fabricated completion is refused before writing a backup", async () => {
  const path = directory(); const store = reviewBackupStore(path, dataset, ids);
  const wrong = workspace(); wrong.datasetHash = "b".repeat(64);
  await assert.rejects(() => store.save(stableStringify(wrong)), /different source/);
  const fake = workspace(); fake.records.C01.completedAt = "2026-09-08T13:00:00.000Z";
  await assert.rejects(() => store.save(stableStringify(fake)), /without a blind judgment/);
  assert.equal(readdirSync(path).length, 0);
});

function request(extra: Record<string, string> = {}, method = "POST", origin = "http://localhost:4120") {
  return new Request(`${origin}/api/review-backups`, { method,
    headers: { host: new URL(origin).host, origin, "x-counsel-review": "local-v1", "sec-fetch-site": "same-origin", ...extra } });
}
test("backup API rejects cross-origin, DNS-rebinding and missing-header requests", () => {
  assert.doesNotThrow(() => requireLocalReviewRequest(request()));
  assert.doesNotThrow(() => requireLocalReviewRequest(request({}, "POST", "http://127.0.0.1:4120")));
  for (const invalid of [request({ origin: "https://evil.example" }), request({ host: "evil.example" }), request({ "x-counsel-review": "" }), request({ "sec-fetch-site": "cross-site" }), request({ origin: "" }), request({}, "POST", "http://evil.example:4120")]) {
    assert.throws(() => requireLocalReviewRequest(invalid), /LOCAL_ORIGIN_REQUIRED/);
  }
});

test("streamed backup body has a real byte bound, even without content-length", async () => {
  const init = { method: "POST", headers: { "Content-Type": "application/json" } };
  assert.equal(await readBoundedReviewBody(new Request("http://localhost:4120", { ...init, body: "{}" })), "{}");
  await assert.rejects(() => readBoundedReviewBody(new Request("http://localhost:4120", { ...init, body: "x".repeat(MAX_IMPORT_BYTES + 1) })), /BACKUP_TOO_LARGE/);
  await assert.rejects(() => readBoundedReviewBody(new Request("http://localhost:4120", { method: "POST", body: "{}" })), /JSON_REQUIRED/);
});

test("HTTP save, list and restore round-trip through a fresh handler using isolated disk storage", async () => {
  const path = directory();
  const handler = () => createReviewBackupHandler(reviewBackupStore(path, dataset, ids));
  const original = workspace();
  const incoming = new Request(request(), { body: stableStringify(original), headers: { ...Object.fromEntries(request().headers), "content-type": "application/json" } });
  const saved = await handler()(incoming);
  assert.equal(saved.status, 200);
  assert.equal(saved.headers.get("cache-control"), "no-store");
  const receipt = await saved.json();
  const listing = await handler()(request({}, "GET"));
  assert.equal(listing.status, 200);
  assert.equal((await listing.json()).backups[0].id, receipt.id);
  const restore = await handler()(new Request(`http://localhost:4120/api/review-backups?id=${receipt.id}`, { headers: request({}, "GET").headers }));
  assert.equal(restore.status, 200);
  assert.deepEqual(await parseImportedWorkspace(await restore.text(), dataset, ids), original);
  assert.equal(readdirSync(path).length, 1);
});

test("HTTP failures are bounded and sanitized, never echoing review content or writing on denial", async () => {
  const path = directory();
  const handler = createReviewBackupHandler(reviewBackupStore(path, dataset, ids));
  const denied = await handler(request({ origin: "https://evil.example" }));
  assert.equal(denied.status, 403);
  assert.equal(readdirSync(path).length, 0);
  const malformed = await handler(new Request(request(), { body: "AUTOMATED PRIVATE TEST DRAFT", headers: { ...Object.fromEntries(request().headers), "content-type": "application/json" } }));
  assert.equal(malformed.status, 503);
  assert.deepEqual(await malformed.json(), { error: "BACKUP_UNAVAILABLE_OR_INVALID" });
  assert.equal(readdirSync(path).length, 0);
  const missing = await handler(new Request(`http://localhost:4120/api/review-backups?id=${"b".repeat(64)}`, { headers: request({}, "GET").headers }));
  assert.equal(missing.status, 404);
  assert.equal((await handler(request({}, "DELETE"))).status, 405);
});
