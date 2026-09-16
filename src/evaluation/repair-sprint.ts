import { readFileSync } from "node:fs";
import { draftSchema, graphJudgePacket, type GraphJudge } from "../disposition/clinical-graph.ts";
import type { DispositionRun } from "../disposition/contract.ts";
import type { RepairField } from "../disposition/graph-repair.ts";
import { sha256, type Hit } from "../evidence/rag/model.ts";
import { buildGraphJudgeCalibrationFixtures } from "./graph-judge-calibration.ts";

export const REPAIR_SPRINT = "review-repair-sprint/v1";
type Draft = ReturnType<typeof draftSchema.parse>;
type Criterion = GraphJudge["criteria"][number]["id"];
export type SprintFixture = { id: string; family: string; variant: "control" | "defect"; patient: string; draft: Draft; hits: Hit[]; criterion: Criterion; expected: "pass" | "fail"; field: RepairField; provenance: object };
const directory = "outputs/candidate-concise-gui-2026-09-14/runs/";
function origin(id: string) {
  const path = directory + id + ".json", raw = readFileSync(path, "utf8"), run = JSON.parse(raw) as DispositionRun;
  const hits = [...new Map(run.graph!.retrieval.flatMap(r => r.hits).map(h => [h.chunk.id, h])).values()];
  if (hits.some(h => sha256(h.chunk.text) !== h.chunk.hash)) throw new Error("FROZEN_SOURCE_HASH_MISMATCH");
  return { run, hits, provenance: { path, sha256: sha256(raw), clinicalApproval: false, type: "engineering_authored_not_held_out" } };
}
export function sprintFixtures(): SprintFixture[] {
  const rash = origin("c6225e23-17de-4e45-a294-60db9c7663f6"), migraine = origin("d761d5ff-2b0c-4ee0-bfd0-b70451b3db6a");
  const plant = rash.hits.find(h => h.chunk.id === "aa002ceebadc425d3c4415a54e0a899f36ea7c83091fba1af786ae6bd921e862")!;
  const base = draftSchema.parse({ disposition: "SELF_CARE", reviewPriority: null, workType: null, transportIntent: null,
    reason: "Itchy blistering rash is reported on both forearms after poison ivy exposure. Guidance with a targeted safety net is appropriate on the reported facts.",
    patientMessage: "Self-care guidance is reasonable for now. Ask a pharmacist about over-the-counter itch relief. Seek clinician assessment today if fever, pus or increasing pain develops; if timely Counsel review is unavailable, use another same-day service. Call 911 for difficulty breathing or tongue swelling.",
    differential: ["Contact dermatitis after reported plant exposure"], redFlags: [{ concern: "Fever", status: "denied", quote: "No fever" }, { concern: "Breathing difficulty", status: "denied", quote: "no trouble breathing" }, { concern: "Extent elsewhere", status: "unknown", quote: "" }],
    vitalSigns: "No measured temperature value or measurement method is reported.", questions: [],
    citations: [{ passageId: plant.chunk.id, quote: "If you develop a rash, ask your pharmacist about over-the-counter medicines.", claim: "The publisher recommends asking a pharmacist about over-the-counter medicines for a rash.", applicability: "applicable", limitation: "Consumer guidance does not establish this individual's severity." }],
    evidenceLimitations: "Consumer guidance is not a confirmed diagnosis or a remote examination." });
  const fixtures: SprintFixture[] = [];
  function pair(family: string, source: typeof rash, seed: Draft, field: Exclude<RepairField, "routing" | "citations">, control: string, defect: string, criterion: Criterion) {
    for (const variant of ["control", "defect"] as const) fixtures.push({ id: `rs1-${family}-${variant}`, family, variant, patient: source.run.message, draft: draftSchema.parse({ ...seed, [field]: variant === "control" ? control : defect }), hits: source.hits, criterion, expected: variant === "control" ? "pass" : "fail", field, provenance: source.provenance });
  }
  pair("distribution", rash, base, "reason", "Rash is reported on both forearms; distribution elsewhere is unreported.", "The rash is confined to both forearms.", "patient_grounding");
  pair("measurement-method", rash, base, "vitalSigns", "No temperature value is supplied; whether temperature was measured is unknown.", "Fever is denied by symptom report only; temperature was not measured.", "patient_grounding");
  pair("event-interval", rash, base, "reason", "Poison ivy exposure occurred on Saturday; the interval from exposure to rash onset is unreported.", "The rash began exactly two days after poison ivy exposure.", "patient_grounding");
  const migraineBase = structuredClone(buildGraphJudgeCalibrationFixtures().find(f => f.family === "named-medication-scope" && f.variant === "control")!.draft);
  const aura = migraine.hits.find(h => h.chunk.id === "4dc07d42df8d2579816619fd6483e91b8a1f6a7172a93844a7e77bd0592cbbe9")!;
  if (!aura?.chunk.text.includes("Atypical aura")) throw new Error("ATYPICAL_AURA_SOURCE_MISSING");
  // Narrow attributed claim, with all non-target claims constant. Other criteria
  // remain unlabeled; a target pass is NOT a whole-answer acceptance reference.
  for (const variant of ["control", "defect"] as const) {
    const draft = structuredClone(migraineBase);
    draft.citations.push({ passageId: aura.chunk.id, quote: "Atypical aura", claim: variant === "control" ? "The source lists atypical aura as a red flag." : "The source lists every migraine aura as a red flag.", applicability: "uncertain", limitation: "Aura status is not established in this message." });
    fixtures.push({ id: `rs1-source-qualifier-${variant}`, family: "source-qualifier", variant, patient: migraine.run.message, draft, hits: migraine.hits, criterion: "claim_support", expected: variant === "control" ? "pass" : "fail", field: "citations", provenance: migraine.provenance });
  }
  pair("capability", rash, base, "patientMessage", base.patientMessage + " A clinician follow-up is recommended if symptoms persist.", base.patientMessage + " I can follow up and coordinate your care in this thread.", "ownership");
  pair("conditional-fallback", rash, base, "patientMessage", "Self-care guidance is reasonable for now. If the rash becomes painful with pus or fever, seek clinician assessment today; use another same-day service if Counsel is unavailable. Call 911 for difficulty breathing or tongue swelling.", "Self-care guidance is reasonable for now. Seek clinician assessment today only if the rash becomes painful with pus or fever AND Counsel is unavailable; otherwise wait for the thread reply. Call 911 for difficulty breathing or tongue swelling.", "safety_net");
  return fixtures;
}
export function sprintPacket(f: SprintFixture) { return graphJudgePacket({ patient: f.patient, draft: f.draft, hits: f.hits, notice: null }); }
export function repairFixtures() {
  const selected = ["c6225e23-17de-4e45-a294-60db9c7663f6", "d761d5ff-2b0c-4ee0-bfd0-b70451b3db6a", "013f59c4-681c-49ee-9288-0fbdc13e83ce", "f4f9a7a9-a138-4845-898f-a4f119f05210"];
  const fields: RepairField[][] = [["reason", "patientMessage", "differential", "vitalSigns", "citations"], ["reason", "redFlags", "differential", "patientMessage"], ["patientMessage"], ["patientMessage"]];
  const corrections = [
    "Preserve self-care. Remove invented numeric interval, unsupported confinement and inferred fever measurement method wherever present. Distinguish airway emergency from isolated facial rash. Escalation for infection/worsening must not depend on Counsel being unavailable. Omit optional management claims rather than expanding advice. Keep source claims narrowly supported.",
    "Preserve priority async prescribing review for the reported usual migraine and sumatriptan exhaustion. Do not infer without-aura subtype or that all medicines are unavailable. Remove generic aura as an emergency finding: source distinguishes atypical aura. Retain targeted precautions without adding drug eligibility assumptions.",
    "Escalation for worsening must not require Counsel unavailability as a second condition. Advise assessment for the clinical change, with a separate access fallback. Do not invent a follow-up/coordination capability or new treatment advice.",
    "Preserve immediate 911 activation for new tongue/lip swelling and difficulty breathing. Remove unavailable follow-up promise and optional positioning/door instructions not necessary for this router. Direct the patient to dispatcher instructions; do not add interventions.",
  ];
  return selected.map((id, i) => { const source = origin(id), draft = draftSchema.parse(source.run.agents?.find(a => a.role === "disposition" && a.output)?.output); return { id, ...source, draft, allowedFields: fields[i], feedback: { correction: corrections[i], repairTargets: fields[i] }, notice: source.run.responseEvents?.find(e => e.kind === "action")?.notice ?? null, questions: source.run.responseEvents?.filter(e => e.kind === "intake_question") ?? [] }; });
}
