import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createGraphRuntime } from "../src/disposition/graph-runtime.ts";
import { draftSchema, type GraphGenerate } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { CONTINUE_EMS_DIRECTIVE } from "../src/disposition/care-setting.ts";
import { type ResponseEvent } from "../src/disposition/contract.ts";
import { buildCorpus, sha256, type ClinicalDocument, type Hit, type Retrieval } from "../src/evidence/rag/model.ts";
import { readDispositionStream } from "../apps/evaluation/lib/disposition-stream.ts";

// Synthetic contract fixtures only. Their routes and sources are not clinical
// gold, evidence of safety, or a recommendation for any real symptom.
const patient = "There is a new concerning symptom. Other features have not been assessed.";
const activeQuote = "I called 911 and an ambulance is coming for me now.";
const source = "Synthetic reference statement used solely for exact quotation testing.";
const document: ClinicalDocument = { id: "test-care-transition", title: "Synthetic care-transition reference", url: "https://medlineplus.gov/ency/article/000000.htm", publisher: "Test fixture", kind: "patient_summary", license: "US-PUBLIC-DOMAIN", licenseUrl: "https://medlineplus.gov/about/using/usingcontent/", attribution: "Synthetic contract fixture", sourceVersion: "test-v1", rawHash: sha256(source), retrievedAt: "2026-09-14T00:00:00Z", publicationDate: null, reviewDate: null, reviewStatus: "publisher_reviewed", currency: "not_assessed", scope: "Synthetic contract source only; no clinical validation.", aliases: [], concepts: [], related: [], sections: [{ title: "Synthetic statement", text: source }] };
const corpus = buildCorpus([document]), { sections: _sections, ...metadata } = document;
const hit: Hit = { document: metadata, chunk: corpus.chunks[0], score: 1, channels: ["lexical"], context: { before: "", after: "" } };
const retrieval: Retrieval = { query: "synthetic care transition", corpusHash: corpus.hash, mode: "hybrid", hits: [hit], timings: { totalMs: 1 }, warnings: [], embeddingTokens: 0, embeddingCacheHit: false };
const sameDayMessage = "An in-person assessment is recommended today for a hands-on examination. If prompt suitable care is unavailable, go to the emergency department now. Do not wait for a message reply.";
const emergencyMessage = "Call 911 now. Do not drive yourself or wait for a message reply.";
const baseDraft = draftSchema.parse({ disposition: "SAME_DAY_IN_PERSON", reviewPriority: null, workType: null, patientMessage: sameDayMessage,
  reason: "The reported new symptom needs an examination today in this synthetic test.", differential: ["Possible explanation requiring examination"],
  redFlags: [{ concern: "New symptom", status: "reported", quote: "new concerning symptom" }, { concern: "Other features", status: "unknown", quote: "" }],
  vitalSigns: "No vital-sign measurements are reported; their context is unknown.", questions: [], evidenceLimitations: "Synthetic contract fixture; no clinical validation.",
  citations: [{ passageId: hit.chunk.id, quote: source, claim: "This is a synthetic reference statement, not medical guidance.", applicability: "uncertain", limitation: "Contract test only." }],
});
const ids = ["undertriage", "overtriage", "patient_grounding", "claim_support", "safety_net", "clarification_delay", "ownership"];
const usage = { inputTokens: 10, outputTokens: 10 };
type Mode = "supported_alternative" | "missing_alternative" | "ems" | "continue_ems" | "failed_review" | "upward" | "revise_all_pass";

async function assess(mode: Mode) {
  const message = mode === "continue_ems" ? `${patient} ${activeQuote}` : patient;
  const finalDraft = mode === "upward" ? draftSchema.parse({ ...baseDraft, disposition: "EMERGENCY_NOW", transportIntent: { mode: "activate_ems", activationQuote: null }, patientMessage: emergencyMessage }) : baseDraft;
  const reviewPackets: unknown[] = [];
  const generate: GraphGenerate = async (role, prompt) => {
    if (role === "context") return { output: { queries: [retrieval.query], findings: [{ finding: "New symptom", status: "reported", quote: "new concerning symptom" }], question: null }, usage };
    if (role === "safety") {
      return { output: { action: mode === "upward" ? "SAME_DAY_IN_PERSON" : mode === "ems" ? "EMS_NOW" : mode === "continue_ems" ? "CONTINUE_EMS" : "ED_NOW",
        basis: [{ quote: mode === "continue_ems" ? activeQuote : "new concerning symptom", interpretation: "Exact current-patient statement in a synthetic contract fixture.", currentPatient: true, present: true }], actionBasis: { indices: [0], sufficient: true },
        reason: "Synthetic early-care fixture, not a clinical conclusion.", patientMessage: "Synthetic early-care text, not published as patient prose.",
        physicalRequirement: mode === "upward" ? "A hands-on examination in this synthetic fixture." : null,
        activeEms: mode === "continue_ems" ? { quote: activeQuote, currentPatient: true, currentEpisode: true, active: true } : null }, usage };
    }
    if (role === "disposition") {
      // Deliberately fail any requested repair instead of accidentally treating
      // a second producer draw as an independent accepted clinical answer.
      if (JSON.parse(prompt).repairContract) throw new Error("SYNTHETIC_REPAIR_NOT_AUTHORIZED");
      return { output: finalDraft, usage };
    }
    if (mode === "failed_review") throw new Error("SYNTHETIC_JUDGE_UNAVAILABLE");
    const packet = JSON.parse(prompt), early = JSON.parse(packet.units.find((unit: { id: string }) => unit.id === "early").text).notice;
    reviewPackets.push(packet);
    return { output: {
      reviewScope: "draft-and-issued-question/v2", verdict: mode === "revise_all_pass" ? "revise" : "accept",
      earlyAction: mode === "upward" ? "unsupported" : "supported",
      earlyCorrection: mode === "upward" ? { reason: "The earlier same-day instruction understates the required urgency of this synthetic final assessment.", patientQuotes: ["new concerning symptom"], triggerMisattributedOrCorrected: false } : null,
      correction: mode === "revise_all_pass" ? "A negative overall review must remain negative even with all seven criteria passing." : "",
      repairTargets: [], evidenceQueries: [],
      criteria: ids.map(id => ({ id, verdict: "pass", reason: "Synthetic supplied criterion passes, not clinical approval.", anchors: [{ unit: id === "claim_support" ? `source:${hit.chunk.id}` : "patient", quote: id === "claim_support" ? source : "new concerning symptom" }] })),
      transportReview: mode === "upward" ? { mode: "activate_ems", verdict: "supported", draftQuote: emergencyMessage, activation: null } : null,
      alternativeReconciliation: mode === "missing_alternative" || mode === "upward" ? null : {
        decision: "use_final_alternative", reason: "The earlier ED alternative is defensible; the final pathway preserves the judged necessary examination and timing with an immediate fallback.",
        earlyDirectiveQuote: early.directive, patientQuotes: ["new concerning symptom"], finalDirectiveQuote: "An in-person assessment is recommended today",
        timing: { verdict: "meets_required_timing", quote: "assessment is recommended today" },
        capability: { verdict: "meets_required_capability", requirement: "A hands-on examination is judged necessary.", quote: "for a hands-on examination" },
        access: { verdict: "fallback_preserves_required_care", fallbackQuote: "If prompt suitable care is unavailable, go to the emergency department now." }, decisiveUnresolvedPrerequisites: [],
      },
    }, usage };
  };
  const directory = mkdtempSync(join(tmpdir(), "graph-care-transition-"));
  const runtime = createGraphRuntime(directory, async () => retrieval, generate, undefined, resolveGraphConfig());
  const events: ResponseEvent[] = [];
  try { const result = await runtime.assess(message, event => events.push(event)); return { result, message, events, directory, reviewPackets, finalDraft }; }
  finally { await runtime.close(); }
}
function response(result: Awaited<ReturnType<typeof assess>>["result"], events: ResponseEvent[]) {
  return new Response([...events.map(event => ({ type: "response_event", event })), { type: "result", result }].map(value => JSON.stringify(value)).join("\n") + "\n", { headers: { "content-type": "application/x-ndjson" } });
}

test("bound supported ED-to-same-day alternative releases once, with explicit revision before patient reply", async () => {
  const { result, events, message } = await assess("supported_alternative");
  assert.equal(result.status, "complete", JSON.stringify(result.checks.filter(check => check.status === "fail")));
  assert.equal(result.answer?.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(result.graph?.judge?.earlyAction, "supported");
  assert.equal(result.graph?.careAlternative?.proof.clinicalApproval, false);
  assert.equal(result.graph?.careAlternative?.proof.binding.patientHash, sha256(message));
  assert.equal(result.graph?.careAlternative?.proof.binding.packetHash, sha256(JSON.stringify(result.graph?.careAlternative?.packet)));
  const revision = events.findIndex(event => event.kind === "care_revision"), reply = events.findIndex(event => event.kind === "patient_reply");
  assert.ok(revision > events.findIndex(event => event.kind === "action")); assert.ok(reply > revision);
  assert.equal(events.filter(event => event.kind === "care_revision").length, 1);
  const decoded = await readDispositionStream(response(result, events), message, () => {});
  assert.equal(decoded.answer?.patientMessage, sameDayMessage);
  assert.equal(decoded.reconciliation?.from.disposition, "EMERGENCY_NOW");
});

test("missing alternative proof and upstream judge failure cannot authorize full lower-care release", async () => {
  for (const mode of ["missing_alternative", "failed_review"] as const) {
    const { result, events, message } = await assess(mode);
    assert.equal(result.status, "review_required", mode);
    assert.equal(result.graph?.careAlternative, undefined);
    assert.equal(result.answer?.disposition, "EMERGENCY_NOW");
    assert.equal(events.some(event => event.kind === "patient_reply" || event.kind === "care_revision"), false);
    assert.equal((await readDispositionStream(response(result, events), message, () => {})).status, "review_required");
  }
});

test("EMS activation and active EMS continuation cannot use the ED-only alternative path", async () => {
  for (const mode of ["ems", "continue_ems"] as const) {
    const { result, events, message } = await assess(mode);
    assert.equal(result.status, "review_required", mode); assert.equal(result.graph?.careAlternative, undefined);
    assert.equal(result.answer?.disposition, "EMERGENCY_NOW");
    assert.equal(events.some(event => event.kind === "patient_reply" || event.kind === "care_revision"), false);
    if (mode === "continue_ems") assert.equal(result.answer?.patientMessage, CONTINUE_EMS_DIRECTIVE);
    else assert.match(result.answer!.patientMessage, /^Call 911 now/);
    const decoded = await readDispositionStream(response(result, events), message, () => {});
    assert.equal(decoded.answer?.patientMessage, result.answer?.patientMessage);
  }
});

test("accepted higher final care explicitly revises earlier undertriage before publishing the reply", async () => {
  const { result, events, message, reviewPackets, finalDraft } = await assess("upward");
  assert.equal(result.status, "complete", JSON.stringify(result.checks.filter(check => check.status === "fail")));
  assert.equal(result.graph?.judge?.earlyAction, "unsupported");
  assert.equal(result.graph?.judge?.verdict, "accept");
  assert.equal(result.answer?.disposition, "EMERGENCY_NOW");
  assert.equal(result.answer?.emergencyTransport?.mode, "activate_ems");
  assert.equal(result.reconciliation?.from.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(result.reconciliation?.to.disposition, "EMERGENCY_NOW");
  assert.equal(result.reconciliation?.reason, result.graph?.judge?.earlyCorrection?.reason);
  assert.deepEqual(result.agents?.filter(agent => agent.role === "critic").at(-1)?.reviewInputBinding, {
    patientHash: sha256(message), draftHash: sha256(JSON.stringify(finalDraft)), packetHash: sha256(JSON.stringify(reviewPackets.at(-1))),
  });
  const revision = events.findIndex(event => event.kind === "care_revision"), reply = events.findIndex(event => event.kind === "patient_reply");
  assert.ok(revision > events.findIndex(event => event.kind === "action")); assert.ok(reply > revision);
  assert.equal((await readDispositionStream(response(result, events), message, () => {})).answer?.emergencyTransport?.mode, "activate_ems");
});

test("all seven passing criteria never convert an overall revise into a complete answer", async () => {
  const { result, events } = await assess("revise_all_pass");
  assert.equal(result.status, "review_required");
  assert.equal(result.graph?.judge?.verdict, "revise");
  assert.ok(result.graph?.judge?.criteria.every(criterion => criterion.verdict === "pass"));
  assert.equal(result.graph?.careAlternative, undefined);
  assert.equal(events.some(event => event.kind === "patient_reply"), false);
});
