import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { IDS, ROUTE_TO_BUCKET } from "../scripts/score-stripped-3bucket-astra.mjs";
import { SYSTEM_PROMPT, settingsFor } from "../scripts/stripped-3bucket-baseline.mjs";
import { buildRequest, mapSubdisposition, STRATIFICATION_SETTINGS, STRATIFICATION_PROMPTS, STRATIFICATION_PROMPT_HASHES } from "../scripts/stripped-stratification-fable.mjs";
import { buildFineReference, scoreStratification, loadFrozenStratification, scoreFrozenStratification,
  verifyStratificationFreeze } from "../scripts/score-stripped-stratification.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
const byteHash = path => hash(readFileSync(path));

function fixture() {
  const routes = { C01: ["PRIORITY_ASYNC"], C02: ["SAME_DAY_IN_PERSON"],
    C03: ["PRIORITY_ASYNC", "STANDARD_ASYNC"], C04: ["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"],
    C05: ["STANDARD_ASYNC"], C22: ["STANDARD_ASYNC"], C25: null,
    C32: ["STANDARD_ASYNC"], C34: ["STANDARD_ASYNC"], C38: ["STANDARD_ASYNC"], C47: ["STANDARD_ASYNC"] };
  const base = { cases: IDS.map(id => {
    const message = `Independent synthetic scoring fixture ${id}.`;
    return { id, message, inputHash: hash(message), originalSuppliedLabel: "MUST_NEVER_AFFECT_SCORING",
      reference: { acceptedRoutes: Object.hasOwn(routes, id) ? routes[id] : ["SELF_CARE"] } };
  }) };
  const adjudication = { referenceId: "synthetic-physician-v3", cases: base.cases.map(row => ({ id: row.id,
    message: row.message, inputSHA256: row.inputHash, previousAcceptedRoutes: row.reference.acceptedRoutes,
    acceptedBuckets: row.id === "C25" ? ["URGENT_ESCALATION"] : ["C32", "C34", "C38"].includes(row.id)
      ? ["SELF_CARE"] : [...new Set(row.reference.acceptedRoutes.map(route => ROUTE_TO_BUCKET[route]))] })) };
  const final = { C01: "STANDARD_ASYNC", C02: "EMERGENCY_NOW", C03: "STANDARD_ASYNC", C04: "EMERGENCY_NOW", C05: null, C25: "EMERGENCY_NOW" };
  const predictions = adjudication.cases.map(row => {
    const finalRoute = Object.hasOwn(final, row.id) ? final[row.id] : "SELF_CARE";
    const parentDisposition = row.id === "C05" ? "ASYNC_PHYSICIAN" : ROUTE_TO_BUCKET[finalRoute];
    return { id: row.id, message: row.message, inputSHA256: row.inputSHA256, parentDisposition,
      finalRoute, failure: finalRoute === null ? "Synthetic provider failure" : null,
      providerCalls: parentDisposition === "SELF_CARE" ? 0 : 1 };
  });
  return { base, adjudication, predictions, reference: buildFineReference(base, adjudication) };
}

test("v3 self-care corrections supersede v2 finer routes without inventing C25 finer urgency", () => {
  const f = fixture();
  for (const id of ["C32", "C34", "C38"]) {
    assert.deepEqual(f.reference.cases.find(row => row.id === id).acceptedRoutes, ["SELF_CARE"]);
    assert.deepEqual(f.base.cases.find(row => row.id === id).reference.acceptedRoutes, ["STANDARD_ASYNC"]);
  }
  assert.equal(f.reference.cases[24].acceptedRoutes, null);
  assert.deepEqual(f.reference.cases[24].acceptedBuckets, ["URGENT_ESCALATION"]);
  assert.deepEqual(f.reference.cases[2].acceptedRoutes, ["PRIORITY_ASYNC", "STANDARD_ASYNC"]);
});

test("parent, end-to-end and conditional denominators remain separate; failed calls stay in denominator", () => {
  const f = fixture();
  const score = scoreStratification(f.predictions, f.reference);
  assert.equal(score.parent.agree, 48);
  assert.equal(score.parent.denominator, 50);
  assert.deepEqual(score.parent.missIds, ["C22", "C47"]);
  assert.equal(score.endToEnd.agree, 44);
  assert.equal(score.endToEnd.denominator, 49);
  assert.deepEqual(score.endToEnd.missIds, ["C01", "C02", "C05", "C22", "C47"]);
  assert.deepEqual(score.endToEnd.excludedIds, ["C25"]);
  assert.equal(score.conditional.agree, 2);
  assert.equal(score.conditional.denominator, 5);
  assert.deepEqual(score.conditional.byParent.ASYNC_PHYSICIAN, { agree: 1, denominator: 3, agreement: 1 / 3, missIds: ["C01", "C05"] });
  assert.deepEqual(score.conditional.byParent.URGENT_ESCALATION, { agree: 1, denominator: 2, agreement: .5, missIds: ["C02"] });
  assert.deepEqual(score.coverage.failedSubtypeIds, ["C05"]);
  assert.deepEqual(score.coverage.subtypeMissIds, ["C01", "C02", "C05"]);
  assert.equal(score.rows[24].finerAgrees, null);
  assert.equal(score.rows[21].errorStage, "parent");
});

test("omissions, duplicates, input changes and incomplete reference cannot shrink denominators", () => {
  const f = fixture();
  assert.throws(() => scoreStratification(f.predictions.slice(1), f.reference), /50 ordered unique cases/);
  const duplicates = structuredClone(f.predictions); duplicates[24] = duplicates[0];
  assert.throws(() => scoreStratification(duplicates, f.reference), /50 ordered unique cases/);
  const changed = structuredClone(f.predictions); changed[0].message += " changed";
  assert.throws(() => scoreStratification(changed, f.reference));
  const omittedGold = structuredClone(f.adjudication); omittedGold.cases.pop();
  assert.throws(() => buildFineReference(f.base, omittedGold), /50 ordered unique cases/);
  const missingGold = structuredClone(f.base); missingGold.cases[0].reference.acceptedRoutes = null;
  const corresponding = structuredClone(f.adjudication); corresponding.cases[0].previousAcceptedRoutes = null;
  assert.throws(() => buildFineReference(missingGold, corresponding), /Missing finer reference/);
});

test("subtype cannot repair or alter its frozen parent and SELF_CARE cannot trigger a call", () => {
  const f = fixture();
  const repaired = structuredClone(f.predictions); repaired[21].finalRoute = "STANDARD_ASYNC";
  assert.throws(() => scoreStratification(repaired, f.reference), /Subtype changed parent bucket/);
  const crossBucket = structuredClone(f.predictions); crossBucket[0].finalRoute = "EMERGENCY_NOW";
  assert.throws(() => scoreStratification(crossBucket, f.reference), /Subtype changed parent bucket/);
  const hiddenCall = structuredClone(f.predictions); hiddenCall[21].providerCalls = 1;
  assert.throws(() => scoreStratification(hiddenCall, f.reference), /SELF_CARE must pass through/);
  const hiddenFailure = structuredClone(f.predictions); hiddenFailure[4].failure = null;
  assert.throws(() => scoreStratification(hiddenFailure, f.reference), /Unrecorded subtype failure/);
});

test("finer reference must be explicit for a changed clinician-action parent", () => {
  const f = fixture();
  const changed = structuredClone(f.adjudication); changed.cases[0].acceptedBuckets = ["URGENT_ESCALATION"];
  assert.throws(() => buildFineReference(f.base, changed), /explicit finer adjudication/);
  const fabricated = structuredClone(f.base); fabricated.cases[24].reference.acceptedRoutes = ["EMERGENCY_NOW"];
  const tracked = structuredClone(f.adjudication); tracked.cases[24].previousAcceptedRoutes = ["EMERGENCY_NOW"];
  assert.throws(() => buildFineReference(fabricated, tracked), /no finer adjudication/);
});

test("assignment labels never affect the physician score", () => {
  const f = fixture();
  const expected = scoreStratification(f.predictions, f.reference);
  for (const row of f.base.cases) row.originalSuppliedLabel = "ARBITRARY_LABEL_CHANGE";
  assert.deepEqual(scoreStratification(f.predictions, buildFineReference(f.base, f.adjudication)), expected);
  assert.equal(expected.csvLabelsRead, false);
  assert.equal(expected.csvAgreementScored, false);
});

function frozenFixture() {
  const temp = mkdtempSync(join(tmpdir(), "stratification-score-test-"));
  const directory = join(temp, "subtype"), parentDirectory = join(temp, "parent"), output = join(temp, "score");
  mkdirSync(directory); mkdirSync(parentDirectory);
  const f = fixture();
  const cases = f.adjudication.cases.map(({ id, message, inputSHA256 }, index) => ({ id, message, inputSHA256,
    parentDisposition: id === "C25" ? "URGENT_ESCALATION" : index < 41 ? "ASYNC_PHYSICIAN" : "SELF_CARE" }));
  const parentManifest = { settings: settingsFor("claude-fable-5-1"), systemPrompt: SYSTEM_PROMPT, promptSHA256: hash(SYSTEM_PROMPT),
    cases: cases.map(({ id, message, inputSHA256 }) => ({ id, message, inputSHA256 })), csvSHA256: "synthetic-dataset-hash" };
  writeJSON(join(parentDirectory, "manifest.json"), parentManifest);
  writeFileSync(join(parentDirectory, "system-prompt.txt"), SYSTEM_PROMPT + "\n");
  const parentHashes = {};
  for (const row of cases) {
    const parsed = { disposition: row.parentDisposition, rationale: "Synthetic first-stage rationale." };
    const response = { model: "claude-fable-5-1", id: `parent-response-${row.id}`, stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(parsed) }], usage: { input_tokens: 10, output_tokens: 10 } };
    const artifacts = {
      request: { id: row.id, inputSHA256: row.inputSHA256, body: { ...parentManifest.settings, system: SYSTEM_PROMPT, messages: [{ role: "user", content: row.message }] } },
      raw: { id: row.id, status: 200, requestId: `parent-request-${row.id}`, latencyMs: 100, responseText: JSON.stringify(response) },
      parsed: { id: row.id, parsed, failure: null, providerCalls: 1, usage: response.usage },
    };
    for (const [kind, value] of Object.entries(artifacts)) {
      const name = `${row.id}-${kind}.json`;
      writeJSON(join(parentDirectory, name), value); parentHashes[name] = byteHash(join(parentDirectory, name));
    }
  }
  writeJSON(join(parentDirectory, "generation-complete.json"), { completedAt: "2026-09-15T12:00:00.000Z", providerCalls: 50,
    validDispositions: 50, failedCases: [], artifactHashes: parentHashes });
  const manifest = { protocol: "stripped-conditional-stratification/v1", settings: STRATIFICATION_SETTINGS,
    prompts: STRATIFICATION_PROMPTS, promptSHA256: STRATIFICATION_PROMPT_HASHES, cases,
    parent: { completionSHA256: byteHash(join(parentDirectory, "generation-complete.json")), manifestSHA256: byteHash(join(parentDirectory, "manifest.json")), promptSHA256: hash(SYSTEM_PROMPT) },
    callPolicy: { plannedCases: 50, newParentCalls: 0, subtypeCalls: 41, callsPerEligibleCase: 1, selfCarePassThrough: 9, concurrency: 4, automaticRetries: 0, fallbacks: 0, judgeCalls: 0 } };
  writeJSON(join(directory, "manifest.json"), manifest);
  const names = ["manifest.json"];
  for (const [parent, prompt] of Object.entries(STRATIFICATION_PROMPTS)) {
    const name = `system-prompt-${parent}.txt`;
    writeFileSync(join(directory, name), prompt + "\n"); names.push(name);
  }
  for (const row of cases) {
    if (row.parentDisposition === "SELF_CARE") {
      const name = `${row.id}-parsed.json`;
      writeJSON(join(directory, name), { id: row.id, parentDisposition: row.parentDisposition, parsed: null,
        subdisposition: "SELF_CARE", failure: null, model: null, usage: null, providerCalls: 0 });
      names.push(name); continue;
    }
    const failed = row.id === "C05";
    const parsed = failed ? null : { choice: 1, rationale: "Synthetic subtype rationale." };
    const response = { model: "claude-fable-5-1", id: `subtype-response-${row.id}`, stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify(parsed) }], usage: { input_tokens: 10, output_tokens: 10 } };
    const artifacts = {
      request: { id: row.id, parentDisposition: row.parentDisposition, inputSHA256: row.inputSHA256, body: buildRequest(row) },
      raw: { id: row.id, status: failed ? 503 : 200, requestId: `subtype-request-${row.id}`, latencyMs: 200, responseText: JSON.stringify(response) },
      parsed: { id: row.id, parentDisposition: row.parentDisposition, parsed, subdisposition: failed ? null : mapSubdisposition(row.parentDisposition, parsed),
        failure: failed ? "Synthetic HTTP503" : null, providerCalls: 1, model: failed ? null : response.model,
        responseId: failed ? null : response.id, usage: failed ? null : response.usage },
    };
    for (const [kind, value] of Object.entries(artifacts)) {
      const name = `${row.id}-${kind}.json`; writeJSON(join(directory, name), value); names.push(name);
    }
  }
  const complete = { completedAt: "2026-09-15T13:00:00.000Z", plannedCases: 50, providerCalls: 41, newParentCalls: 0, eligibleCalls: 41,
    selfCarePassThrough: 9, validSubdispositions: 49, validSubtypeCalls: 40, failedCases: ["C05"],
    artifactHashes: Object.fromEntries(names.map(name => [name, byteHash(join(directory, name))])) };
  writeJSON(join(directory, "generation-complete.json"), complete);
  f.base.datasetSha256 = parentManifest.csvSHA256;
  const baseReferencePath = join(temp, "base.json"), referencePath = join(temp, "adjudication.json");
  writeJSON(baseReferencePath, f.base);
  f.adjudication.baseReference = { path: baseReferencePath, sha256: byteHash(baseReferencePath) };
  writeJSON(referencePath, f.adjudication);
  return { directory, parentDirectory, referencePath, baseReferencePath, output, temp,
    close: () => rmSync(temp, { recursive: true, force: true }) };
}

function refreshSubtypeHash(f, name) {
  const path = join(f.directory, "generation-complete.json");
  const complete = JSON.parse(readFileSync(path));
  complete.artifactHashes[name] = byteHash(join(f.directory, name));
  writeJSON(path, complete);
}

test("completed artifact verification runs before physician access and prevents incomplete or altered output scoring", () => {
  const f = frozenFixture();
  try {
    const unreadable = join(f.temp, "must-not-read-gold.json");
    assert.throws(() => scoreFrozenStratification({ ...f, directory: join(f.temp, "not-frozen"), referencePath: unreadable }),
      error => error.path === join(f.temp, "not-frozen", "generation-complete.json"));
    writeFileSync(join(f.directory, "C01-raw.json"), "changed raw output");
    assert.throws(() => scoreFrozenStratification({ ...f, referencePath: unreadable }), /Frozen subtype artifact drift/);
    assert.equal(existsSync(f.output), false);
  } finally { f.close(); }
});

test("all135 frozen artifacts are required and unsafe artifact paths fail", () => {
  const f = frozenFixture();
  try {
    const path = join(f.directory, "generation-complete.json"), complete = JSON.parse(readFileSync(path));
    const saved = structuredClone(complete);
    delete complete.artifactHashes["C50-parsed.json"]; writeJSON(path, complete);
    assert.throws(() => verifyStratificationFreeze(f.directory), /Unfrozen or unexpected subtype artifact/);
    saved.artifactHashes["../outside.json"] = "0".repeat(64); writeJSON(path, saved);
    assert.throws(() => verifyStratificationFreeze(f.directory), /Unsafe frozen artifact path/);
  } finally { f.close(); }
});

test("extra context, parent manipulation, stale parsed output and hidden SELF_CARE calls fail closed", () => {
  const f = frozenFixture();
  try {
    const requestPath = join(f.directory, "C01-request.json"), request = JSON.parse(readFileSync(requestPath));
    request.body.messages.push({ role: "user", content: "UNAUTHORIZED_REFERENCE_SENTINEL" });
    writeJSON(requestPath, request); refreshSubtypeHash(f, "C01-request.json");
    assert.throws(() => loadFrozenStratification(f), /Unexpected subtype provider context/);
    request.body.messages.pop(); writeJSON(requestPath, request); refreshSubtypeHash(f, "C01-request.json");
    const parsedPath = join(f.directory, "C01-parsed.json"), parsed = JSON.parse(readFileSync(parsedPath));
    parsed.parsed.choice = 2; writeJSON(parsedPath, parsed); refreshSubtypeHash(f, "C01-parsed.json");
    assert.throws(() => loadFrozenStratification(f), /Subtype parsed output differs from raw/);
    parsed.parsed.choice = 1; writeJSON(parsedPath, parsed); refreshSubtypeHash(f, "C01-parsed.json");
    writeJSON(join(f.directory, "C50-request.json"), { hidden: true });
    assert.throws(() => loadFrozenStratification(f), /Unexpected SELF_CARE call/);
  } finally { f.close(); }
});

test("offline scoring is idempotent and failures retain end-to-end and conditional denominators", () => {
  const f = frozenFixture();
  try {
    const result = scoreFrozenStratification(f), repeated = scoreFrozenStratification(f);
    assert.deepEqual(result, repeated);
    assert.equal(result.scorecard.parent.denominator, 50);
    assert.equal(result.scorecard.endToEnd.denominator, 49);
    assert.deepEqual(result.scorecard.coverage.failedSubtypeIds, ["C05"]);
    assert.ok(result.scorecard.endToEnd.missIds.includes("C05"));
    assert.ok(result.scorecard.conditional.missIds.includes("C05"));
    assert.equal(result.audit.verifiedSubtypeArtifacts, 135);
    assert.equal(result.audit.exactMessageOnlySubtypeRequestsVerified, 41);
    assert.equal(result.audit.assignmentCSVFileRead, false);
    assert.equal(result.audit.referencesReadOnlyAfterBothFreezesVerified, true);
    assert.equal(result.summary.timing.sequentialPipelineEstimate.medianMs, 300);
    assert.ok(existsSync(join(f.output, "misses.csv")));
  } finally { f.close(); }
});
