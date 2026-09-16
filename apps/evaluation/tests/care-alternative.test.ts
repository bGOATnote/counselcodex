import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { verifyCareAlternative, verifyCareAlternativeSync, verifyPublishedJudgeSourceRepair } from "../lib/care-alternative.ts";
import { readDispositionStream } from "../lib/disposition-stream.ts";
import { draftSchema, wireDraftSchema } from "../../../src/disposition/graph-output.ts";
import { reconcileCareAlternative, type CareAlternativeInput } from "../../../src/disposition/care-alternative.ts";
import { createRepairContract } from "../../../src/disposition/graph-repair.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../../../src/disposition/care-setting.ts";
import type { DispositionRun, ResponseEvent } from "../../../src/disposition/contract.ts";
import { buildJudgeSourceAnchorRepairAuditSteps } from "../../../src/disposition/judge-source-anchor-repair.ts";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const repair = createRepairContract(draftSchema, wireDraftSchema);
const criteria = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"];

// Synthetic serialization/provenance fixture, not a medical case or gold label.
function fixture(patched = false, sourceId = "source-1") {
  const patient = "A new concerning symptom is present. Other features are unknown.";
  const source = "Synthetic exact reference passage used for contract testing only.";
  const draft = draftSchema.parse({ disposition: "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null,
    patientMessage: "Seek in-person assessment today for a hands-on examination. If suitable prompt care is unavailable, go to the emergency department now. Do not wait for a message reply.",
    reason: "The reported new symptom needs an examination today in this synthetic fixture.", differential: ["A possible explanation requiring examination"],
    redFlags: [{ concern: "New symptom", status: "reported", quote: "new concerning symptom" }, { concern: "Other features", status: "unknown", quote: "" }],
    vitalSigns: "No vital measurements were supplied; measurements are unknown.", questions: [], evidenceLimitations: "Synthetic fixture; no medical validation.",
    citations: [{ passageId: sourceId, quote: source, claim: "Synthetic citation supports the fixture statement only.", applicability: "uncertain", limitation: "Not clinical evidence." }] });
  const notice = { disposition: "EMERGENCY_NOW" as const, directive: "Seek emergency department assessment now. Do not wait for a message reply; call 911 if you cannot travel safely.", source: "emergency_agent" as const };
  const output = { reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: "supported", earlyCorrection: null,
    criteria: criteria.map(id => ({ id, verdict: "pass", reason: "Synthetic exact-draft check.", anchors: [{ unit: id === "claim_support" ? `source:${sourceId}` : "patient", quote: id === "claim_support" ? source : "new concerning symptom" }] })),
    alternativeReconciliation: { decision: "use_final_alternative", reason: "The earlier ED pathway was defensible; this synthetic alternative preserves required timing and capability with an immediate fallback.",
      earlyDirectiveQuote: notice.directive, patientQuotes: ["new concerning symptom"], finalDirectiveQuote: "Seek in-person assessment today",
      timing: { verdict: "meets_required_timing", quote: "assessment today" }, capability: { verdict: "meets_required_capability", requirement: "A hands-on examination is required.", quote: "for a hands-on examination" },
      access: { verdict: "fallback_preserves_required_care", fallbackQuote: "If suitable prompt care is unavailable, go to the emergency department now." }, decisiveUnresolvedPrerequisites: [] } };
  const packet = { units: [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) }, { id: "early", text: JSON.stringify({ notice, basis: [] }) },
    { id: `source:${sourceId}`, text: `patient_summary; Contract only; publication: unknown\n${source}` }], hasIssuedEarlyAction: true };
  const checks = ["quoted_patient_evidence", "citation_provenance", "action_timing_present", "no_blanket_clearance", "no_unconfirmed_handoff", "rag_source_integrity"].map(id => ({ id, status: "pass" as const, detail: "Synthetic exact check." }));
  const binding = { patientHash: hash(patient), draftHash: hash(JSON.stringify(draft)), packetHash: hash(JSON.stringify(packet)) };
  const input: CareAlternativeInput = { patient, draft, issued: { notice, sequence: 1 }, reviewPacket: packet,
    reviews: [{ failure: null, output, binding: { ...binding, noticeHash: hash(JSON.stringify(notice)), noticeSequence: 1, judgeHash: hash(JSON.stringify(output)) } }],
    mechanical: { draftHash: binding.draftHash, checks }, cancelled: false };
  const admitted = reconcileCareAlternative(input, hash); assert.ok(admitted.ok);
  const proof = admitted.reconciliation;
  const reconciliation = { policy: "issued-care-reconciliation/v1", status: "revised", from: proof.from, to: proof.to, reason: proof.reason };
  const { citations, transportIntent: _intent, ...rest } = draft;
  const answer = { ...rest, evidence: citations.map(c => ({ sourceId: c.passageId, claim: c.claim })) };
  const run = { version: "disposition-agent/v3", workflowId: "clinical-evidence-graph", profile: "evidence-graph-opus", runId: "b647045d-2f68-4220-9d74-60977c022d6d",
    message: patient, inputHash: hash(patient), answerHash: hash(JSON.stringify(answer)), status: "complete", origin: "agent", failure: null, safetyFloor: null,
    answer, reconciliation, checks: [...checks, { id: "independent_review", status: "pass" }, { id: "care_reconciliation", status: "pass" }],
    guidance: [{ id: sourceId, summary: source, retrievedPassages: [{ id: sourceId, excerpt: source, excerptSha256: hash(source) }] }],
    graph: { version: "evidence-graph/v23", safety: { basis: [] }, judge: output, release: "model_reviewed", clinicalApproval: false, sourceIntegrity: true, careCorrectionReleased: false,
      citations, retrieval: [{ hits: [{ chunk: { id: sourceId, text: source, hash: hash(source) }, document: { kind: "patient_summary", scope: "Contract only", publicationDate: null } }] }],
      careAlternative: { proof, packet, checks } },
    responseEvents: [{ kind: "action", notice, sequence: 1, elapsedMs: 100 }, { kind: "care_revision", reconciliation, sequence: 2, elapsedMs: 200 },
      { kind: "patient_reply", disposition: answer.disposition, text: answer.patientMessage, sequence: 3, elapsedMs: 210 }],
    agents: [{ role: "disposition", failure: null, output: draft }, { role: "critic", failure: null, output, reviewInputBinding: binding }] } as unknown as DispositionRun;
  if (patched) {
    const base = { ...draft, reason: "An older synthetic explanation before the exact field-local patch." };
    const sources = [{ id: sourceId, kind: "patient_summary", scope: "Contract only", text: source }];
    const prepared = repair.prepare(base, sources, ["reason", "questions"]);
    const patch = { baseDraftHash: prepared.baseDraftHash, evidenceHash: prepared.evidenceHash,
      edits: [{ field: "reason", value: draft.reason }, { field: "questions", value: [] }] };
    const applied = repair.apply(base, sources, prepared.allowedFields, patch); assert.ok(applied.output);
    assert.deepEqual(applied.output, draft);
    run.graph!.repair = applied.audit;
    run.agents = [{ role: "disposition", failure: null, output: base }, { role: "disposition", failure: null, output: patch,
      repairInputBinding: { baseDraftHash: prepared.baseDraftHash, evidenceHash: prepared.evidenceHash, allowedFields: prepared.allowedFields } }, run.agents![1]] as DispositionRun["agents"];
  }
  return run;
}
function response(run: DispositionRun) {
  const records = [...run.responseEvents!.map(event => ({ type: "response_event", event })), { type: "result", result: run }];
  return new Response(records.map(record => JSON.stringify(record)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
}

test("browser binds the full supported alternative and preserves the historical action", async () => {
  for (const patched of [false, true]) {
    const run = fixture(patched), before = JSON.stringify(run), observed: ResponseEvent[] = [];
    assert.equal(await verifyCareAlternative(run, run.message), true);
    assert.equal(verifyCareAlternativeSync(run, run.message, hash), true);
    const accepted = await readDispositionStream(response(run), run.message, () => {}, event => observed.push(event));
    assert.equal(accepted.answer!.disposition, "SAME_DAY_IN_PERSON");
    assert.deepEqual(observed.map(event => event.kind), ["action", "care_revision", "patient_reply"]);
    assert.equal(JSON.stringify(run), before);
  }
});

function sourceRepairFixture(mode: "alternative" | "ordinary" | "unsupported") {
  const run = fixture(false, "a".repeat(64)), critic = run.agents!.at(-1)!, packet = structuredClone(run.graph!.careAlternative!.packet);
  if (mode === "ordinary") {
    delete run.graph!.careAlternative; delete run.reconciliation;
    run.responseEvents = [{ ...run.responseEvents!.at(-1)!, sequence: 1 }];
    packet.units = packet.units.filter(unit => unit.id !== "early"); packet.hasIssuedEarlyAction = false;
    run.graph!.judge!.earlyAction = "none"; run.graph!.judge!.alternativeReconciliation = null;
  } else if (mode === "unsupported") {
    delete run.graph!.careAlternative; run.graph!.careReviewPacket = packet;
    run.graph!.judge!.earlyAction = "unsupported"; run.graph!.judge!.alternativeReconciliation = null;
    run.graph!.judge!.earlyCorrection = { reason: run.reconciliation!.reason!, patientQuotes: ["new concerning symptom"], triggerMisattributedOrCorrected: true };
  }
  critic.output = run.graph!.judge; critic.reviewInputBinding!.packetHash = hash(JSON.stringify(packet));
  const raw = structuredClone(run.graph!.judge!); raw.criteria.find(c => c.id === "claim_support")!.anchors[0].unit = `source:${"b".repeat(58)}`;
  const steps = buildJudgeSourceAnchorRepairAuditSteps(raw, critic.output, packet);
  let state = steps.next(); while (!state.done) state = steps.next(hash(state.value));
  assert.ok(state.value); critic.rawOutput = raw; critic.judgeSourceRepair = state.value;
  return run;
}

test("browser replays exact source-ID repairs for ordinary and both care-transition completions", async () => {
  for (const mode of ["ordinary", "alternative", "unsupported"] as const) {
    const run = sourceRepairFixture(mode);
    assert.equal(await verifyPublishedJudgeSourceRepair(run, run.message), true, mode);
    if (mode === "alternative") {
      assert.equal(await verifyCareAlternative(run, run.message), true);
      assert.equal(verifyCareAlternativeSync(run, run.message, hash), true);
    }
    await readDispositionStream(response(run), run.message, () => {});
    for (const mutate of [
      (copy: DispositionRun) => { delete copy.agents!.at(-1)!.judgeSourceRepair; },
      (copy: DispositionRun) => { delete copy.agents!.at(-1)!.rawOutput; },
      (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.rawHash = "0".repeat(64); },
      (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.repairs[0].quote += " altered"; },
      (copy: DispositionRun) => { (copy.agents!.at(-1)!.rawOutput as { verdict: string }).verdict = "revise"; },
      (copy: DispositionRun) => { copy.agents!.at(-1)!.failure = "INCOMPLETE_MODEL_STREAM"; },
      (copy: DispositionRun) => { copy.agents!.at(-1)!.judgeSourceRepair!.packet.units.find(unit => unit.id.startsWith("source:"))!.text += " Extra source text."; },
    ]) {
      const copy = structuredClone(run); mutate(copy);
      assert.equal(await verifyPublishedJudgeSourceRepair(copy, copy.message), false, mode);
      const observed: ResponseEvent[] = [];
      await assert.rejects(readDispositionStream(response(copy), copy.message, () => {}, event => observed.push(event)), /source repair/);
      assert.deepEqual(observed.map(event => event.kind), mode === "ordinary" ? [] : ["action"]);
    }
  }
});

test("proof rejects changed patient, hashes, source, checks, chronology and canonical fields", async () => {
  const mutations: [string, (run: DispositionRun) => void][] = [
    ["patient", run => { run.message += " New information."; }],
    ["input hash", run => { run.inputHash = "0".repeat(64); }],
    ["answer hash", run => { run.answerHash = "0".repeat(64); }],
    ["proof sequence", run => { run.graph!.careAlternative!.proof.binding.noticeSequence = 2; }],
    ["proof checks hash", run => { run.graph!.careAlternative!.proof.binding.mechanicalChecksHash = "0".repeat(64); }],
    ["notice", run => { const action = run.responseEvents![0]; if (action.kind === "action") action.notice.directive += " Different instruction."; }],
    ["later failed critic", run => { run.agents!.push({ ...run.agents!.at(-1)!, failure: "INCOMPLETE_MODEL_STREAM" }); }],
    ["later producer", run => { run.agents!.push({ ...run.agents![0] }); }],
    ["wrong draft", run => { run.agents!.at(-1)!.reviewInputBinding!.draftHash = "0".repeat(64); }],
    ["wrong packet", run => { run.agents!.at(-1)!.reviewInputBinding!.packetHash = "0".repeat(64); }],
    ["judge summary", run => { run.graph!.judge = { ...run.graph!.judge!, earlyAction: "unsupported" }; }],
    ["source content", run => { run.graph!.retrieval[0].hits[0].chunk.text += " Invented support."; }],
    ["source hash", run => { run.graph!.retrieval[0].hits[0].chunk.hash = "0".repeat(64); }],
    ["citation", run => { run.graph!.citations = []; }],
    ["guidance", run => { run.guidance = []; }],
    ["final check", run => { run.checks[0].status = "fail"; }],
    ["missing final check", run => { run.checks.pop(); }],
    ["check detail", run => { run.checks[0].detail = "Different finding"; }],
    ["canonical answer", run => { run.answer = { ...run.answer!, reason: "A different unreviewed explanation." }; run.answerHash = hash(JSON.stringify(run.answer)); }],
    ["cancelled", run => { run.failure = "RUN_CANCELLED"; }],
    ["proof extra key", run => { Object.assign(run.graph!.careAlternative!.proof, { clinicianApproved: true }); }],
  ];
  for (const [label, mutate] of mutations) {
    const run = fixture(), patient = run.message; mutate(run);
    assert.equal(await verifyCareAlternative(run, patient), false, label);
    assert.equal(verifyCareAlternativeSync(run, patient, hash), false, `sync: ${label}`);
  }
});

test("schema-normalized check-key order has the same browser and server hash", async () => {
  const run = fixture();
  run.graph!.careAlternative!.checks = run.graph!.careAlternative!.checks.map(c => ({ detail: c.detail, status: c.status, id: c.id }));
  assert.equal(await verifyCareAlternative(run, run.message), true);
});

test("v23 omitted or tampered alternative proof cannot expose a lower instruction callback", async () => {
  for (const mutate of [
    (run: DispositionRun) => { delete run.graph!.careAlternative; },
    (run: DispositionRun) => { delete run.graph!.careAlternative; run.graph!.judge = null; },
    (run: DispositionRun) => { delete run.graph; },
    (run: DispositionRun) => { delete run.graph!.careAlternative; delete (run.graph as { version?: string }).version; },
    (run: DispositionRun) => { delete run.graph!.careAlternative; run.graph!.version = "unknown-version"; },
    (run: DispositionRun) => { delete run.graph!.careAlternative; run.graph!.judge = { ...run.graph!.judge!, earlyAction: "unsupported" }; },
    (run: DispositionRun) => { run.graph!.careAlternative!.proof.binding.draftHash = "0".repeat(64); },
  ]) {
    const run = fixture(); mutate(run); const observed: ResponseEvent[] = [], notices: unknown[] = [];
    await assert.rejects(readDispositionStream(response(run), run.message, notice => notices.push(notice), event => observed.push(event)), /alternative/);
    assert.equal(notices.length, 1); assert.deepEqual(observed.map(event => event.kind), ["action"]);
  }
});

test("unsupported correction remains separate, but must bind a fresh actual critic in v23", async () => {
  const run = fixture(); run.graph!.careReviewPacket = run.graph!.careAlternative!.packet; delete run.graph!.careAlternative;
  const judge = { ...run.graph!.judge!, earlyAction: "unsupported" as const, alternativeReconciliation: null,
    earlyCorrection: { reason: run.reconciliation!.reason!, patientQuotes: ["new concerning symptom"], triggerMisattributedOrCorrected: true } };
  run.graph!.judge = judge; run.agents!.at(-1)!.output = judge;
  await readDispositionStream(response(run), run.message, () => {});
  for (const mutate of [
    (copy: DispositionRun) => { copy.agents!.push({ ...copy.agents!.at(-1)!, failure: "JUDGE_CONTRACT_FAILED" }); },
    (copy: DispositionRun) => { delete copy.graph!.careReviewPacket; },
    (copy: DispositionRun) => { copy.graph!.judge!.criteria[0].anchors[0].quote = "Invented patient finding"; },
    (copy: DispositionRun) => { copy.graph!.careReviewPacket!.units.find(unit => unit.id === "early")!.text = JSON.stringify({ notice: { disposition: "EMERGENCY_NOW", directive: "Different emergency advice for this patient.", source: "emergency_agent" }, basis: [] }); },
    (copy: DispositionRun) => {
      copy.graph!.careReviewPacket!.units.find(unit => unit.id === "early")!.text = JSON.stringify({ notice: { disposition: "EMERGENCY_NOW", directive: "Different emergency advice for this patient.", source: "emergency_agent" }, basis: [] });
      copy.agents!.at(-1)!.reviewInputBinding!.packetHash = hash(JSON.stringify(copy.graph!.careReviewPacket));
    },
  ]) {
    const copy = structuredClone(run); mutate(copy);
    await assert.rejects(readDispositionStream(response(copy), copy.message, () => {}), /alternative/);
  }
});

test("historical v22 completed revision does not acquire new proof requirements", async () => {
  const run = fixture(); run.graph!.version = "evidence-graph/v22"; delete run.graph!.careAlternative;
  assert.equal((await readDispositionStream(response(run), run.message, () => {})).status, "complete");
});

test("a pending revision cannot smuggle an unverified lower action through onNotice", async () => {
  const run = fixture(), action = run.responseEvents![0]; assert.equal(action.kind, "action"); if (action.kind !== "action") return;
  run.responseEvents!.splice(2, 0, { kind: "action", sequence: 3, notice: { ...action.notice, disposition: "SAME_DAY_IN_PERSON" } });
  run.responseEvents![3].sequence = 4;
  const notices: unknown[] = [], observed: ResponseEvent[] = [];
  await assert.rejects(readDispositionStream(response(run), run.message, notice => notices.push(notice), event => observed.push(event)), /pending care revision/);
  assert.equal(notices.length, 1); assert.deepEqual(observed.map(event => event.kind), ["action"]);
});

test("an internally rehashed proof cannot lower either activation or continue-EMS care", async () => {
  for (const directive of ["Call 911 now. Do not drive yourself.", CONTINUE_EMS_DIRECTIVE]) {
    const run = fixture(), action = run.responseEvents![0]; assert.equal(action.kind, "action"); if (action.kind !== "action") continue;
    action.notice.directive = directive;
    const metadata = run.graph!.careAlternative!, judge = run.graph!.judge!;
    metadata.packet.units.find(unit => unit.id === "early")!.text = JSON.stringify({ notice: action.notice, basis: [] });
    judge.alternativeReconciliation!.earlyDirectiveQuote = directive;
    metadata.proof.from.directive = directive;
    run.reconciliation!.from.directive = directive;
    const binding = run.agents!.at(-1)!.reviewInputBinding!;
    binding.packetHash = hash(JSON.stringify(metadata.packet));
    metadata.proof.binding.packetHash = binding.packetHash;
    metadata.proof.binding.noticeHash = hash(JSON.stringify(action.notice));
    metadata.proof.binding.judgeHash = hash(JSON.stringify(judge));
    assert.equal(await verifyCareAlternative(run, run.message), false);
  }
});
