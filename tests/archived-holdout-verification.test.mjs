import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyArchivedHoldout, ARCHIVE_SHA256 } from "../scripts/verify-archived-holdout.mjs";
import { runFrozenRetrievalHoldout } from "../scripts/frozen-retrieval-holdout.mjs";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
test("archived holdout verification preserves the rejected historical result and exposes candidate drift", async () => {
  const before = await Promise.all(Object.keys(ARCHIVE_SHA256).map(read));
  const result = await verifyArchivedHoldout();
  assert.equal(result.archiveIntegrityVerified, true);
  assert.equal(result.currentEligible, false);
  assert.ok(result.candidateDrift.some(value => value.path === "src/domain/rules.mjs"));
  assert.equal(result.archivedRetrievalStatus, "not_admitted");
  assert.equal(result.currentCandidateEvaluated, false); assert.equal(result.newHoldoutRun, false); assert.equal(result.providerCalls, 0);
  assert.match(result.agentBindingLimitation, /no embedded implementation/);
  assert.deepEqual(await Promise.all(Object.keys(ARCHIVE_SHA256).map(read)), before);
});
test("archive, frozen inputs and evaluation harness mutations fail closed", async () => {
  for (const target of [...Object.keys(ARCHIVE_SHA256), "data/retrieval/policy-corpus-v1.jsonl", "data/clinical_agent_temporal_holdout_v1.jsonl", "data/retrieval/retrieval-temporal-holdout-v1.jsonl", "scripts/clinical-agent-eval.ts", "scripts/frozen-retrieval-holdout.mjs"]) {
    await assert.rejects(verifyArchivedHoldout({ read: async path => await read(path) + (path === target ? " " : "") }), /changed/);
  }
});
test("additional candidate changes are disclosed, not scored under the old registration", async () => {
  const target = "src/domain/constants.mjs";
  const result = await verifyArchivedHoldout({ read: async path => await read(path) + (path === target ? "\n// candidate change" : "") });
  assert.equal(result.currentEligible, false); assert.equal(result.currentCandidateEvaluated, false);
  assert.ok(result.candidateDrift.some(value => value.path === target));
});
test("original frozen runner still refuses the changed current candidate before execution", async () => {
  await assert.rejects(runFrozenRetrievalHoldout(), /changed after registration/);
});
