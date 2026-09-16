import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runEmergencyBranch, runIntentBranch } from "../src/domain/branches.mjs";
import { applyHardGate, assertDispositionInvariants, routeResidual } from "../src/domain/routing.mjs";
import { EMERGENCY_NOW, isEscalatedDisposition } from "../src/domain/constants.mjs";
import { MAX_MESSAGE_CHARS } from "../src/domain/rules.mjs";
import { routeMessage } from "../src/workflows/disposition-workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rows = (await readFile(resolve(root, "data/red_team_cases.jsonl"), "utf8"))
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));

for (const row of rows) {
  const result = await routeMessage({ id: row.id, message: row.message });
  assert.equal(result.disposition, row.expected, `${row.id} (${row.category})`);
  assert.equal(result.locked, result.overrideBlocked, `${row.id} lock consistency`);
  assert.equal(isEscalatedDisposition(result.disposition), result.locked, `${row.id} escalation lock`);
}

const urgentSeed = "Worst headache of my life; it hit like a thunderclap out of nowhere.";
for (const variant of [urgentSeed.toUpperCase(), `  ${urgentSeed}\n`, urgentSeed.replace("thunderclap", "thunder\u200Bclap")]) {
  assert.equal((await routeMessage({ message: variant })).disposition, EMERGENCY_NOW);
}

const emergencyFailure = await runEmergencyBranch("ordinary message", async () => { throw new Error("synthetic fault"); });
const history = await runIntentBranch("ordinary message");
const failClosed = routeResidual(applyHardGate({ emergency: emergencyFailure, history }));
assert.equal(failClosed.disposition, EMERGENCY_NOW);
assert.equal(failClosed.subtype, "safety_system_failure");
assert.equal(failClosed.confidence, "indeterminate");

const intentFailure = await runIntentBranch("ordinary message", async () => { throw new Error("synthetic fault"); });
const gateClear = applyHardGate({
  emergency: { status: "ok", fired: false, name: null, disposition: null, subtype: null, evidence: [], directive: null },
  history: intentFailure,
});
assert.equal(routeResidual(gateClear).disposition, "ASYNC_PHYSICIAN");

assert.throws(() => assertDispositionInvariants({ locked: true, overrideBlocked: false, disposition: EMERGENCY_NOW, layer: "hard_escalation_gate" }));
assert.throws(() => assertDispositionInvariants({ locked: false, overrideBlocked: false, disposition: EMERGENCY_NOW, layer: "policy_default" }));
await assert.rejects(() => routeMessage({ message: "x".repeat(MAX_MESSAGE_CHARS + 1) }), /must not exceed/);

const canary = "TRACE_CANARY_7f37";
const canaryId = "PRIVATE_CASE_9ac1";
const traced = await routeMessage({ id: canaryId, message: `Routine question ${canary}` });
const serializedTrace = JSON.stringify(traced.trace);
assert.equal(serializedTrace.includes(canary), false, "raw message leaked into local trace");
assert.equal(serializedTrace.includes(canaryId), false, "case identifier leaked into local trace");

console.log(`Red-team corpus: ${rows.length}/${rows.length} expected dispositions; mutation, fault, invariant, boundary, and trace checks passed.`);
