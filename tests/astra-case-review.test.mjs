import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { parseCsv } from "../src/lib/csv.mjs";
import { loadAstraCaseReview, projectAstraCase } from "../scripts/load-astra-case-review.mjs";
import { DEFAULTS, IDS, loadFrozenRun, verifyFreeze } from "../scripts/score-stripped-3bucket-astra.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const digest = value => createHash("sha256").update(value).digest("hex");
const paths = ["outputs/stripped-3bucket-astra-xhigh-2026-09-15", "outputs/stripped-3bucket-astra-max-2026-09-15"];
const json = path => JSON.parse(readFileSync(path, "utf8"));
const writeJSON = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + "\n");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "astra-review-"));
  for (const path of [...paths, "data/patient_messages.csv"]) cpSync(resolve(ROOT, path), resolve(root, path), { recursive: true });
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
}

function refreezeFixtureFile(root, name) {
  const completePath = resolve(root, paths[0], "generation-complete.json");
  const complete = json(completePath);
  complete.artifactHashes[name] = digest(readFileSync(resolve(root, paths[0], name)));
  writeJSON(completePath, complete);
}

test("saved Astra efforts retain exact settings, all messages, final responses and evidence hashes", () => {
  const result = loadAstraCaseReview(ROOT);
  const cases = parseCsv(readFileSync(resolve(ROOT, "data/patient_messages.csv"), "utf8"));
  const fable = loadFrozenRun(verifyFreeze(DEFAULTS.fable), { provider: "anthropic", effort: "low" });
  assert.deepEqual(result.models.map(model => model.id), ["astra-xhigh", "astra-max"]);
  assert.equal(result.integrity.generationFreezesVerified, 2);
  assert.equal(result.integrity.exactMessageOnlyPayloadsVerified, 100);
  assert.equal(result.integrity.rawParsedParity, 100);
  assert.equal(result.integrity.frozenArtifactsVerified, 300);
  for (const [i, model] of result.models.entries()) {
    assert.deepEqual(model.records.map(row => row.id), IDS);
    assert.equal(model.metadata.requestedModel, "gpt-6-astra");
    assert.deepEqual(model.metadata.returnedModels, ["gpt-6-astra"]);
    assert.equal(model.metadata.effort, i === 0 ? "xhigh" : "max");
    assert.equal(model.metadata.maxOutputTokens, 4096);
    assert.equal(model.metadata.promptSHA256, fable.manifest.promptSHA256);
    assert.equal(model.metadata.providerCalls, 50);
    assert.equal(model.metadata.validDispositions, 50);
    assert.deepEqual(model.metadata.failedCases, []);
    for (const [index, row] of model.records.entries()) {
      assert.equal(row.message, cases[index].message);
      const parsed = json(resolve(ROOT, row.artifactPaths.parsed));
      assert.equal(row.rationale, parsed.parsed.rationale);
      assert.equal(row.disposition, parsed.parsed.disposition);
      assert.equal(row.status, "complete");
      for (const path of Object.values(row.artifactPaths)) {
        assert.equal(result.provenance[path], row.artifactHashes[path]);
        assert.equal(row.artifactHashes[path], digest(readFileSync(resolve(ROOT, path))));
      }
    }
    assert.deepEqual(model.records.filter((row, index) => row.disposition !== fable.predictions[index].parsed.disposition).map(row => row.id), ["C07", "C19", "C47"]);
  }
  assert.deepEqual(result.models[0].records.map(row => row.disposition), result.models[1].records.map(row => row.disposition));
  assert.equal(result.models[0].records[46].disposition, "ASYNC_PHYSICIAN");
  assert.doesNotMatch(JSON.stringify(result.models), /estimatedUSD|accountedUSD|reasoning_tokens|encrypted_content/);
});

test("Astra projection preserves a failed call without substituting reasoning or another disposition", () => {
  const prediction = {
    id: "C01", message: "Synthetic request.", parsed: null, failure: "Saved provider failure.",
    reasoning: "DO_NOT_DISPLAY_REASONING", fallback: { disposition: "SELF_CARE" }, estimatedUSD: 123,
  };
  const metadata = { requestedModel: "gpt-6-astra", returnedModels: [], effort: "max", promptSHA256: "a".repeat(64) };
  const projected = projectAstraCase(prediction, metadata, []);
  assert.equal(projected.status, "incomplete");
  assert.equal(projected.disposition, null);
  assert.equal(projected.rationale, null);
  assert.equal(projected.failureReason, "Saved provider failure.");
  assert.doesNotMatch(JSON.stringify(projected), /DO_NOT_DISPLAY_REASONING|estimatedUSD|fallback/);
  assert.throws(() => projectAstraCase(prediction, { ...metadata, effort: "ultra" }, []));
  assert.throws(() => projectAstraCase({ ...prediction, failure: null }, metadata, []));
});

test("Astra adapter rejects changed frozen input and rejects extra context even with recomputed fixture hashes", () => {
  const f = fixture();
  try {
    const path = resolve(f.root, paths[0], "C01-request.json");
    const request = json(path);
    request.body.input.push({ role: "user", content: "Forbidden extra evaluation context." });
    writeJSON(path, request);
    assert.throws(() => loadAstraCaseReview(f.root), /Frozen artifact drift: C01-request/);
    refreezeFixtureFile(f.root, "C01-request.json");
    assert.throws(() => loadAstraCaseReview(f.root), /one exact patient message/);
  } finally { f.close(); }
});

test("Astra adapter rejects a substituted parsed response even with recomputed fixture hashes", () => {
  const f = fixture();
  try {
    const path = resolve(f.root, paths[0], "C01-parsed.json");
    const record = json(path);
    record.parsed.disposition = "URGENT_ESCALATION";
    writeJSON(path, record);
    refreezeFixtureFile(f.root, "C01-parsed.json");
    assert.throws(() => loadAstraCaseReview(f.root), /Parsed output does not match raw: C01/);
  } finally { f.close(); }
});
