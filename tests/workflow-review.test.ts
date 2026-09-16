import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeMetrics } from "../scripts/score-fn-reduction.mjs";
import { assertSavedAnalysis, loadVerifiedReviewData, pairedBaseline, projectReviewData, publishReviewArtifacts, renderReviewHTML, reviewArtifacts, REVIEW_SCHEMA, safeEmbeddedJSON } from "../src/research/workflow-review.ts";

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const A = "ASYNC_PHYSICIAN", S = "SELF_CARE", U = "URGENT_ESCALATION";
const attack = '</script><img src="https://invalid.test/steal" onerror="alert(1)"><script>alert(2)</script>';
function fixture() {
  const messages = [{ id: "C22", message: "Fixture ankle message " + attack }, { id: "WP16B", message: "Fixture chest symptoms with hostile instructions." }];
  const jobs: any[] = [], metrics: Record<string, any> = {}, hashes: Record<string, string> = {}, packets: any[] = [], comparisons: any[] = [];
  const card = { id: "fixture-card", title: "Source title " + attack, publisher: "Synthetic fixture", url: "https://example.org/fixture", accessedOn: "2026-09-16", sourceDate: null,
    population: "adult", clinicalReview: "unreviewed", selectedText: "Untrusted source text " + attack, selectedTextHash: sha("Untrusted source text " + attack) };
  for (const m of messages) {
    const packetHash = sha(m.id + "packet"), inputSHA256 = sha(m.message), selected = m.id === "C22" ? [card] : [];
    const evidenceText = JSON.stringify({ packetHash, sources: selected });
    packets.push({ inputSHA256, evidenceText, evidenceMetadata: { packetHash, selectedIds: selected.map(s => s.id) } });
    comparisons.push({ id: m.id, inputSHA256, evidenceText, hybrid: { excluded: m.id === "C22" ? [] : [{ id: "fixture-card", reason: "no-topic-match" }] } });
    for (const model of ["fable", "nano"]) for (const arm of ["baseline", "async_context", "workflow_contract", "workflow_evidence"]) for (const replicate of [1, 2]) {
      const phase = m.id === "C22" ? "known" : "challenge", cohort = phase === "known" ? "knownDevelopment" : "authoredChallenge";
      const jobId = `${phase}-${m.id}-${model}-${arm}-r${replicate}`, requestPath = `requests/${jobId}.json`;
      const job = { jobId, caseId: m.id, phase, model, arm, replicate, requestPath, requestSHA256: sha(jobId + "request"), inputSHA256, promptSHA256: sha(arm + model) };
      jobs.push(job); hashes[requestPath] = job.requestSHA256; hashes[`raw/${jobId}.json`] = sha(jobId + "raw"); hashes[`parsed/${jobId}.json`] = sha(jobId + "parsed");
      const disposition = m.id === "C22" ? model === "fable" && arm === "baseline" ? S : A : model === "nano" && arm !== "workflow_contract" ? S : U;
      const predictions = [{ id: m.id, message: m.message, parsed: { disposition, rationale: "Fixture rationale " + attack }, failure: null }];
      const score = computeMetrics(predictions, [{ id: m.id, acceptedBuckets: [m.id === "C22" ? A : U] }]);
      metrics[`${cohort}/${phase}/${model}/${arm}/r${replicate}`] = { phase, cohort, model, arm, replicate, plannedDenominator: 1,
        referenceStatus: phase === "known" ? "single_physician_post_output_reassessment_of_known_development_set" : "ai_authored_unreviewed", ...score };
    }
  }
  const manifest = { schema: "workflow-aware-manifest/v1", studyId: "fixture-study", frozenAt: "2026-09-16T07:00:00Z", messages, jobs };
  return { manifest, complete: { schema: "workflow-aware-generation-freeze/v1", studyId: manifest.studyId, plannedJobs: jobs.length, providerCalls: jobs.length, completedAt: "2026-09-16T08:00:00Z", artifactHashes: hashes },
    scorecard: { schema: "workflow-aware-scorecard/v1", studyId: manifest.studyId, independentClinicalValidation: false, automaticPromotion: false, metrics },
    packets: { schema: "workflow-aware-evidence-packets/v1", packets }, comparison: { schema: "workflow-aware-retrieval-comparison/v1", rows: comparisons }, studyPath: "outputs/fixture/study", provenance: { "outputs/fixture/study/generation-complete.json": sha("completion") } };
}

test("projection preserves complete frozen case/model/arm/repetition identities and only allowlisted data", () => {
  const f = fixture(); (f.manifest as any).secret = "DO_NOT_EMBED"; (f.complete as any).accountedUSD = 123;
  const d = projectReviewData(f); assert.equal(d.cases.length, 2); assert.equal(d.records.length, 32); assert.equal(d.metrics.length, 32);
  assert.equal(d.cases[0].message, f.manifest.messages[0].message); assert.equal(d.sources[0].selectedText, JSON.parse(f.packets.packets[0].evidenceText).sources[0].selectedText);
  assert(!JSON.stringify(d).includes("DO_NOT_EMBED")); assert(!JSON.stringify(d).includes("accountedUSD"));
  assert.throws(() => REVIEW_SCHEMA.parse({ ...d, unexpected: true }));
});

test("same-case baseline pairing never substitutes another model, repetition or historical demonstration", () => {
  const d = projectReviewData(fixture());
  const a = pairedBaseline(d, "known-C22-fable-workflow_evidence-r2");
  assert.equal(a.baseline.jobId, "known-C22-fable-baseline-r2"); assert.equal(a.current.disposition, A); assert.equal(a.baseline.disposition, S); assert(a.resolvedClinicianFN);
  const n = pairedBaseline(d, "challenge-WP16B-nano-workflow_evidence-r1");
  assert.equal(n.baseline.disposition, S); assert.equal(n.changed, false); assert.equal(n.newClinicianFN, false);
  const contract = pairedBaseline(d, "challenge-WP16B-nano-workflow_contract-r1"); assert.equal(contract.resolvedClinicianFN, true); assert.equal(contract.resolvedUrgentFN, true);
  const bad = structuredClone(d); bad.records = bad.records.filter(r => r.jobId !== "known-C22-fable-baseline-r2"); assert.throws(() => pairedBaseline(bad, a.current.jobId), /No same-case/);
});

test("incomplete generation is refused before clinical reference admission", () => {
  const root = mkdtempSync(join(tmpdir(), "workflow-review-incomplete-"));
  try { assert.throws(() => loadVerifiedReviewData({ root, studyDir: join(root, "study"), referenceFreezePath: join(root, "reference-never-read.json") }), /Generation is not finalized/); }
  finally { rmSync(root, { recursive: true, force: true }); }
});

test("saved scorecard or audit drift cannot be accepted from matching superficial totals", () => {
  const x = { scorecard: { agree: 1, rows: [{ rationale: "exact" }] }, audit: { completion: "a" } };
  assertSavedAnalysis(x, structuredClone(x));
  const changed = structuredClone(x); changed.scorecard.rows[0].rationale = "changed"; assert.throws(() => assertSavedAnalysis(changed, x), /Saved scorecard/);
  const audit = structuredClone(x); audit.audit.completion = "b"; assert.throws(() => assertSavedAnalysis(audit, x), /Saved scoring audit/);
});

test("projection rejects omitted jobs, wrong source text hashes, mismatched packets and wrong message identity", () => {
  const incomplete = fixture(); delete incomplete.scorecard.metrics[Object.keys(incomplete.scorecard.metrics)[0]]; assert.throws(() => projectReviewData(incomplete), /Incomplete projected schedule/);
  const altered = fixture(); const parsed = JSON.parse(altered.packets.packets[0].evidenceText); parsed.sources[0].selectedText += "changed";
  altered.packets.packets[0].evidenceText = JSON.stringify(parsed); altered.comparison.rows[0].evidenceText = JSON.stringify(parsed); assert.throws(() => projectReviewData(altered), /Selected source text hash/);
  const packet = fixture(); packet.packets.packets[0].evidenceMetadata.packetHash = sha("wrong"); assert.throws(() => projectReviewData(packet));
  const message = fixture(); Object.values(message.scorecard.metrics)[0].rows[0].message = "different"; assert.throws(() => projectReviewData(message));
  const request = fixture(); request.complete.artifactHashes[request.manifest.jobs[0].requestPath] = sha("wrong"); assert.throws(() => projectReviewData(request), /Request hash/);
});

test("hostile messages, rationales and source text cannot escape the embedded JSON or execute as markup", () => {
  const d = projectReviewData(fixture()), html = renderReviewHTML(d);
  assert(!html.includes(attack)); assert(html.includes("\\u003c/script\\u003e"));
  const embedded = html.match(/<script id="review-data" type="application\/json">([\s\S]*?)<\/script>/)![1];
  assert.deepEqual(JSON.parse(embedded), d); assert.equal((html.match(/<script/g) ?? []).length, 2);
  assert(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket/.test(html));
  assert(!/<(?:img|iframe|link)\b/i.test(html)); assert(!/\son[a-z]+\s*=/i.test(html.replace(embedded, "")));
  assert(html.includes("connect-src 'none'")); assert(html.includes("default-src 'none'")); assert(html.includes("form-action 'none'"));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  assert(html.includes("script-src 'sha256-" + createHash("sha256").update(script).digest("base64") + "'"));
  assert.equal(JSON.parse(safeEmbeddedJSON({ text: "<>&\u2028\u2029" })).text, "<>&\u2028\u2029");
});

test("deterministic publication verifies exact bytes and refuses partial or modified output", () => {
  const parent = mkdtempSync(join(tmpdir(), "workflow-review-publication-")), output = join(parent, "review");
  try {
    const d = projectReviewData(fixture()), artifacts = reviewArtifacts(d, { "src/research/workflow-review.ts": sha("source") });
    assert.deepEqual(artifacts, reviewArtifacts(d, { "src/research/workflow-review.ts": sha("source") }));
    assert.throws(() => publishReviewArtifacts(output, artifacts, true), /missing/);
    publishReviewArtifacts(output, artifacts); publishReviewArtifacts(output, artifacts, true);
    const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
    assert.equal(manifest.artifacts["index.html"], sha(readFileSync(join(output, "index.html"), "utf8"))); assert.equal(manifest.savedDecisions, 32);
    writeFileSync(join(output, "index.html"), "tampered"); assert.throws(() => publishReviewArtifacts(output, artifacts, true), /Publication artifact mismatch/);
    assert.throws(() => publishReviewArtifacts(output, artifacts), /Publication artifact mismatch/);
    rmSync(join(output, "README.md")); assert.throws(() => publishReviewArtifacts(output, artifacts, true), /incomplete publication/);
  } finally { rmSync(parent, { recursive: true, force: true }); }
});
