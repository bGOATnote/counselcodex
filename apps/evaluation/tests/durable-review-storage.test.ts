import assert from "node:assert/strict";
import test from "node:test";
import { dataset, evaluationCases } from "../lib/cases.ts";
import {
  backupStorageKey,
  clearLocalCheckpoints,
  decideCheckpointWrite,
  parseCheckpoint,
  readLocalCandidates,
  saveLocalCheckpoint,
  selectNewestCheckpoint,
  serializeCheckpoint,
  type StorageLike,
} from "../lib/durable-review-storage.ts";
import { createWorkspace, stableStringify } from "../lib/review-state.ts";

const caseIds = evaluationCases.map(({ id }) => id);
const storageKey = `counsel-physician-review:${dataset.sourceHash}`;

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>();
  failWrites = false;
  mismatchReads = false;

  getItem(key: string) {
    const value = this.values.get(key) ?? null;
    return this.mismatchReads && key === storageKey && value !== null ? `${value}x` : value;
  }

  setItem(key: string, value: string) {
    if (this.failWrites) throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function workspaceAt(when: string, reviewer = "") {
  const workspace = createWorkspace(dataset, caseIds, when);
  workspace.reviewer.name = reviewer;
  return workspace;
}

test("legacy workspace JSON remains recoverable as revision zero", () => {
  const workspace = workspaceAt("2026-09-06T12:00:00.000Z", "Legacy reviewer");
  const parsed = parseCheckpoint(stableStringify(workspace), dataset, caseIds, "local-primary");
  assert.equal(parsed.legacy, true);
  assert.equal(parsed.revision, 0);
  assert.equal(parsed.workspace.reviewer.name, "Legacy reviewer");
});

test("hydration selects the highest revision across independent stores", () => {
  const older = serializeCheckpoint(workspaceAt("2026-09-06T12:00:00.000Z", "Older"), 7, "2026-09-06T12:01:00.000Z");
  const newest = serializeCheckpoint(workspaceAt("2026-09-06T12:02:00.000Z", "Newest"), 8, "2026-09-06T12:03:00.000Z");
  const result = selectNewestCheckpoint([
    { source: "local-primary", raw: older },
    { source: "indexeddb", raw: newest },
  ], dataset, caseIds);
  assert.equal(result.selected?.source, "indexeddb");
  assert.equal(result.selected?.workspace.reviewer.name, "Newest");
});

test("a corrupt primary recovers the valid rotating backup", () => {
  const backup = serializeCheckpoint(workspaceAt("2026-09-06T12:00:00.000Z", "Recovered"), 4);
  const result = selectNewestCheckpoint([
    { source: "local-primary", raw: "{not-json" },
    { source: "local-backup", raw: backup },
  ], dataset, caseIds);
  assert.equal(result.selected?.source, "local-backup");
  assert.equal(result.selected?.workspace.reviewer.name, "Recovered");
  assert.equal(result.invalid.length, 1);
});

test("local saves rotate a validated previous checkpoint and verify the new write", () => {
  const storage = new MemoryStorage();
  const first = serializeCheckpoint(workspaceAt("2026-09-06T12:00:00.000Z"), 1);
  const second = serializeCheckpoint(workspaceAt("2026-09-06T12:01:00.000Z"), 2);
  storage.values.set(storageKey, first);
  const result = saveLocalCheckpoint(storage, storageKey, second, (raw) => {
    parseCheckpoint(raw, dataset, caseIds, "local-primary");
  });
  assert.deepEqual(result, { primarySaved: true, backupSaved: true, verified: true, conflict: false, errors: [] });
  assert.equal(storage.values.get(storageKey), second);
  assert.equal(storage.values.get(backupStorageKey(storageKey)), first);
});

test("monotonic writes reject stale and same-revision competing checkpoints", () => {
  const newest = serializeCheckpoint(workspaceAt("2026-09-06T12:03:00.000Z", "Newest"), 3);
  const stale = serializeCheckpoint(workspaceAt("2026-09-06T12:02:00.000Z", "Stale"), 2);
  const competing = serializeCheckpoint(workspaceAt("2026-09-06T12:04:00.000Z", "Other tab"), 3);
  assert.equal(decideCheckpointWrite(newest, stale), "stale");
  assert.equal(decideCheckpointWrite(newest, competing), "conflict");
  assert.equal(decideCheckpointWrite(newest, newest), "unchanged");

  const storage = new MemoryStorage();
  storage.values.set(storageKey, newest);
  const result = saveLocalCheckpoint(storage, storageKey, competing, (raw) => {
    parseCheckpoint(raw, dataset, caseIds, "local-primary");
  });
  assert.equal(result.conflict, true);
  assert.equal(result.primarySaved, false);
  assert.equal(storage.values.get(storageKey), newest);
  assert.match(result.errors.join(" "), /another tab/i);
});

test("quota failures are reported without throwing or destroying the prior checkpoint", () => {
  const storage = new MemoryStorage();
  const prior = serializeCheckpoint(workspaceAt("2026-09-06T12:00:00.000Z"), 1);
  storage.values.set(storageKey, prior);
  storage.failWrites = true;
  const result = saveLocalCheckpoint(storage, storageKey, serializeCheckpoint(workspaceAt("2026-09-06T12:01:00.000Z"), 2), () => undefined);
  assert.equal(result.primarySaved, false);
  assert.equal(result.verified, false);
  assert.match(result.errors.join(" "), /quota/i);
  assert.equal(storage.values.get(storageKey), prior);
});

test("read-back mismatch and local read failures become explicit diagnostics", () => {
  const storage = new MemoryStorage();
  storage.mismatchReads = true;
  const raw = serializeCheckpoint(workspaceAt("2026-09-06T12:00:00.000Z"), 1);
  const result = saveLocalCheckpoint(storage, storageKey, raw, () => undefined);
  assert.equal(result.primarySaved, true);
  assert.equal(result.verified, false);
  assert.match(result.errors.join(" "), /read-back/);
  assert.equal(readLocalCandidates(storage, storageKey).candidates.length, 1);
});

test("explicit reset clears both local copies", () => {
  const storage = new MemoryStorage();
  storage.values.set(storageKey, "primary");
  storage.values.set(backupStorageKey(storageKey), "backup");
  assert.deepEqual(clearLocalCheckpoints(storage, storageKey), []);
  assert.equal(storage.values.size, 0);
});
