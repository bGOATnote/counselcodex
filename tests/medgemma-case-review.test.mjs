import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { addHistoricalModels, caseReviewArtifacts, caseReviewClient, escalationDirection, loadCaseReview, projectCaseReview, publishCaseReview, renderCaseReview, safeEmbeddedJSON } from "../src/research/medgemma-case-review.mjs";
import { loadHistoricalCaseReview } from "../scripts/load-historical-case-review.mjs";
import { parseCsv } from "../src/lib/csv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path => JSON.parse(readFileSync(join(root, path), "utf8"));
const source = () => ({ comparison: read("outputs/stripped-3bucket-medgemma-27b-q5-2026-09-16/comparison-fable.json"), reference: read("data/evaluation/physician-adjudication-v3-2026-09-15.json"), base: read("data/evaluation/physician-system-reference-v2.json"), csvRows: parseCsv(readFileSync(join(root, "data/patient_messages.csv"), "utf8")), provenance: {}, completedAt: "2026-09-16T00:00:00.000Z", scoredAt: "2026-09-16T01:00:00.000Z", promptSHA256: "a".repeat(64) });

test("verified admission preserves all 50 messages and the distinct C49 endpoints", () => {
  const data = loadCaseReview(root);
  assert.equal(data.cases.length, 50);
  assert.deepEqual(data.disagreementIds, ["C22", "C32", "C34", "C38", "C47", "C49"]);
  assert.equal(data.metrics.fable.agree, 48); assert.equal(data.metrics.medgemma.agree, 46);
  assert.equal(data.metrics.medgemma.clinicianActionFN, 0); assert.equal(data.metrics.medgemma.urgentActionFN, 1);
  const c49 = data.cases[48];
  assert.deepEqual(c49.physician.acceptedBuckets, ["URGENT_ESCALATION"]);
  assert.equal(c49.csv.disposition, "ASYNC_PHYSICIAN");
  assert.equal(c49.fable.disposition, "URGENT_ESCALATION");
  assert.equal(c49.medgemma.disposition, "ASYNC_PHYSICIAN");
  assert.equal(c49.medgemma.clinicianAction, "TP"); assert.equal(c49.medgemma.urgentAction, "FN");
  assert.match(c49.medgemma.rationale, /^Chest pain, but no red flags/);
  assert.equal(c49.physician.note, null, "Do not invent a physician explanation from an earlier model response");
  assert.equal(data.csvScored, false); assert.equal(data.inferenceEnabled, false);
  assert(!JSON.stringify(data).includes("estimatedUSD"));
});

test("projection rejects mismatched messages, missing cases and label changes", () => {
  for (const mutate of [value => { value.csvRows[48].message += " changed"; }, value => { value.reference.cases.pop(); }, value => { value.comparison.rows[48].acceptedBuckets = ["SELF_CARE"]; }, value => { value.csvRows[48].disposition = "OTHER"; }, value => { value.comparison.rows[48].medgemma.agrees = true; }]) {
    const value = source(); mutate(value); assert.throws(() => projectCaseReview(value));
  }
});

test("script-closing patient and model text remains inert and exact after JSON parse", () => {
  const text = '</script><img src=x onerror="alert(1)">&\u2028\u2029';
  const encoded = safeEmbeddedJSON({ message: text });
  assert(!encoded.includes("<")); assert(!encoded.includes(">")); assert(!encoded.includes("&"));
  assert.equal(JSON.parse(encoded).message, text);
  const data = projectCaseReview(source()); data.cases[0].message = text; data.cases[0].medgemma.rationale = text;
  const html = renderCaseReview(data);
  assert(!html.includes(text));
  const embedded = html.match(/<script type="application\/json" id="case-data">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(embedded).cases[0].message, text);
  assert.doesNotMatch(caseReviewClient.toString(), /innerHTML|outerHTML|insertAdjacentHTML|\bfetch\s*\(|XMLHttpRequest|WebSocket/);
});

test("offline HTML binds exact script and style, and contains one replaceable detail surface", () => {
  const html = renderCaseReview(projectCaseReview(source()));
  const hash = value => createHash("sha256").update(value).digest("base64");
  const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert(html.includes(`script-src 'sha256-${hash(script)}'`));
  assert(html.includes(`style-src 'sha256-${hash(style)}'`));
  assert(html.includes("connect-src 'none'"));
  assert.equal((html.match(/id="message"/g) || []).length, 1);
  assert.equal((html.match(/id="fable"/g) || []).length, 1);
  assert.equal((html.match(/id="medgemma"/g) || []).length, 1);
  assert.match(script, /replaceChildren/); assert.match(script, /popstate/); assert.match(script, /hashchange/);
  assert.match(html, /id="case-index"[^>]*>/);
  assert.match(html, /id="case-detail"[^>]* hidden>/);
  assert.match(script, /history\.replaceState\(null, "", "#index"\)/);
});

test("artifact verification detects stale derived bytes and never repairs them", () => {
  const directory = mkdtempSync(join(tmpdir(), "medgemma-review-test-"));
  try {
    const artifacts = caseReviewArtifacts(projectCaseReview(source()), {});
    publishCaseReview(directory, artifacts); publishCaseReview(directory, artifacts, true);
    writeFileSync(join(directory, "index.html"), "changed");
    assert.throws(() => publishCaseReview(directory, artifacts, true), /Stale case viewer/);
    assert.equal(readFileSync(join(directory, "index.html"), "utf8"), "changed");
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("four-model projection preserves both Nano repetitions and incomplete V25 releases", () => {
  const historical = loadHistoricalCaseReview(root);
  const data = addHistoricalModels(projectCaseReview(source()), historical);
  assert.equal(data.cases.length, 50);
  assert.equal(data.metrics["nano-r1"].agree, 40);
  assert.equal(data.metrics["nano-r2"].agree, 40);
  assert.equal(data.cases.filter(row => row.v25.disposition === null).length, 23);
  assert.equal(data.cases[48].v25.disposition, null);
  assert.equal(data.cases[48].v25.rationale, null);
  assert.equal(data.cases[48].v25.escalation, "incomplete");
  assert(data.cases[48].v25.earlyActions.some(row => row.disposition === "URGENT_ESCALATION"));
  assert.equal(data.cases[48].medgemma.escalation, "under");
  assert.equal(data.cases[31].medgemma.escalation, "over");
  assert.equal(data.cases[48].fable.escalation, "aligned");
  const changed = structuredClone(historical);
  changed.models[0].records[0].message += " changed";
  assert.throws(() => addHistoricalModels(projectCaseReview(source()), changed), /message differs/);
  const unsafeLink = structuredClone(historical);
  unsafeLink.models[0].records[0].artifactPaths.run = "../private.json";
  assert.throws(() => addHistoricalModels(projectCaseReview(source()), unsafeLink), /relative path/);
});

test("ordinal classification separates incomplete and ambiguous accepted ranges", () => {
  assert.equal(escalationDirection(null, ["URGENT_ESCALATION"]), "incomplete");
  assert.equal(escalationDirection("ASYNC_PHYSICIAN", ["URGENT_ESCALATION"]), "under");
  assert.equal(escalationDirection("ASYNC_PHYSICIAN", ["SELF_CARE"]), "over");
  assert.equal(escalationDirection("ASYNC_PHYSICIAN", ["SELF_CARE", "URGENT_ESCALATION"]), "unaccepted");
  assert.equal(escalationDirection("ASYNC_PHYSICIAN", ["SELF_CARE", "ASYNC_PHYSICIAN"]), "aligned");
});

test("simple viewer keeps comparisons qualified behind an index-first interface", () => {
  const data = projectCaseReview(source());
  const html = renderCaseReview(data), client = caseReviewClient.toString();
  assert.match(html, /Fable ≠ MedGemma is a pairwise filter/);
  assert.doesNotMatch(client, /"Models disagree"|"Same disposition"|"Model dispositions match\."/);
  const header = html.match(/<header>([\s\S]*?)<\/header>/)[1];
  assert.match(header, /Disposition Study/);
  assert.match(header, /id="case-link"[^>]*href="#index"/);
  assert.doesNotMatch(html, /id="print"|class="hero"|class="metrics"|class="case-footer"/);
  assert.doesNotMatch(header, /Same message|Fable|MedGemma|Nemotron|Prepared for/);
  assert.match(html, /<summary>About the study<\/summary>/);
  assert.match(html, /Fable and MedGemma used identical instruction text and message-only user content/);
  assert.match(html, /V25 adds multi-stage processing context/);
  assert.doesNotMatch(html, /the only user content supplied to each model/);
  assert.match(client, /document\.querySelector\("\.skip"\).*preventDefault/);
  assert.match(client, /history\.pushState/);
});
