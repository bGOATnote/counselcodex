import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { makeAomPlan, validateAomPlan, aomReservations, replaceAomRecognition, verifyAomPhaseClaim } from "../scripts/aom-source-probe.ts";
import { evaluateCorrection } from "../scripts/routing-brief-correction-probe.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

test("only one evidence chunk changes; neither gold nor an issued route enters input", () => {
  const p = makeAomPlan(); validateAomPlan(p);
  const [a, b] = p.cases;
  assert.deepEqual(Object.keys(a.packets.brief).sort(), ["context", "patient", "sources"]);
  assert.equal(a.packets.brief.patient, b.packets.brief.patient);
  assert.deepEqual(a.packets.brief.context, b.packets.brief.context);
  assert.deepEqual(a.issued, []); assert.deepEqual(b.issued, []);
  assert.equal(a.hits.length, 9); assert.equal(b.hits.length, 9);
  const changed = a.hits.flatMap((h, i) => JSON.stringify(h) === JSON.stringify(b.hits[i]) ? [] : [i]);
  assert.equal(changed.length, 1);
  for (let i = 0; i < 9; i++) if (!changed.includes(i)) {
    assert.deepEqual(a.packets.brief.sources[i], b.packets.brief.sources[i]);
    assert.deepEqual(a.guidance[i], b.guidance[i]);
  }
  assert.equal(p.prompts.full, p.prompts.brief); assert.deepEqual(p.schemas.full, p.schemas.brief);
  assert.equal(p.settings.maxOutputTokens, 2400); assert.equal(p.settings.maxRetries, 0);
  assert.equal(p.schedule.length, 6); assert.equal(p.budget.missionCeilingUSD, 90);
  assert.ok(Math.abs(p.budget.priorAccountedAndReservedUSD - 83.533736) < 1e-8);
  for (const name of ["capture.mjs", "README.md"]) {
    const path = `src/evidence/rag/fixtures/cdc-aom-2026-09-15/${name}`;
    assert.equal(p.files[path], sha256(readFileSync(path)));
  }
});
test("reserved phase rejects missing or tampered claim identity, directory and allocation", () => {
  const directory = mkdtempSync(join(tmpdir(), "aom-claim-offline-"));
  try {
    const original = makeAomPlan();
    const plan = { ...original, budget: { ...original.budget, exclusiveClaim: join(directory, "claim") } };
    const allocationUSD = aomReservations(plan).totalUSD;
    const expected = { fingerprint: sha256(JSON.stringify(plan)), directory: resolve(directory), allocationUSD };
    assert.throws(() => verifyAomPhaseClaim(directory, plan, allocationUSD), /PHASE_CLAIM_CHANGED/);
    mkdirSync(plan.budget.exclusiveClaim);
    const path = join(plan.budget.exclusiveClaim, "claim.json");
    writeFileSync(path, JSON.stringify(expected));
    assert.doesNotThrow(() => verifyAomPhaseClaim(directory, plan, allocationUSD));
    for (const changed of [{ ...expected, fingerprint: "different-plan" },
      { ...expected, directory: join(directory, "other-output") },
      { ...expected, allocationUSD: allocationUSD - .001 }]) {
      writeFileSync(path, JSON.stringify(changed));
      assert.throws(() => verifyAomPhaseClaim(directory, plan, allocationUSD), /PHASE_CLAIM_CHANGED/);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test("all six reservations fit and protocol changes cannot silently enter", () => {
  const p = makeAomPlan(), r = aomReservations(p);
  assert.ok(r.totalUSD > 0 && r.totalUSD < p.budget.remainingUSD);
  assert.throws(() => aomReservations({ ...p, budget: { ...p.budget, remainingUSD: r.totalUSD - .001 } }), /ALL_SIX/);
  for (const changed of [{ ...p, schedule: p.schedule.slice(1) }, { ...p, prompts: { ...p.prompts, brief: "changed" } },
    { ...p, cases: [p.cases[0], p.cases[0]] }, { ...p, budget: { ...p.budget, remainingUSD: 20 } }])
    assert.throws(() => validateAomPlan(changed), /FROZEN_AOM_CHANGED/);
});
test("source binding changes and duplicate replacement fail", () => {
  const [a, b] = makeAomPlan().cases;
  assert.throws(() => replaceAomRecognition(b), /BASELINE_BINDING_CHANGED/);
  const changed = structuredClone(a); changed.sources[0].text += " changed";
  assert.throws(() => replaceAomRecognition(changed), /BASELINE_BINDING_CHANGED/);
});
test("old removed reference cannot pass new packet; failure remains not_assessed", () => {
  const p = makeAomPlan();
  const execution = JSON.parse(readFileSync("outputs/routing-brief-correction-live-2026-09-15/C32-brief-result.json", "utf8")).execution;
  assert.equal(evaluateCorrection(p.cases[0], "brief", execution).failure, null);
  const row = evaluateCorrection(p.cases[1], "brief", execution);
  assert.equal(row.failure, "WIRE_SCHEMA_OR_QUOTE_REFERENCE_FAILED");
  assert.equal(row.eligibleRoutingProposal, false); assert.equal(row.unsupported_claims, "not_assessed");
  assert.equal(row.clinicalApproval, false); assert.equal(row.patientAdvicePublished, false);
});
