/** Evaluation-only, author-labelled claim/span pairs from existing sources.
 * Not physician gold, patient facts, or retrieval instructions. These assertions
 * measure source coverage under a declared interpretation, not clinical safety. */
import type { SupportProbe } from "./disposition-support.ts";

export const DISPOSITION_SUPPORT_PROBES: SupportProbe[] = [
  { id: "suspected-heart-attack-action", claim: "Suspected heart attack warrants calling 911 even when the person is uncertain.",
    spans: [{ documentId: "nhlbi:heart-attack-symptoms", quote: "Call 9-1-1 for emergency medical care, even if you are not sure that you’re having a heart attack." }],
    boundary: "Action advice for suspected heart attack; does not diagnose every chest symptom as heart attack." },
  { id: "stroke-signs-action", claim: "Sudden unilateral numbness or weakness is among the stroke symptoms for which CDC advises calling 911 right away.",
    spans: [{ documentId: "cdc:stroke", quote: "Sudden numbness or weakness in the face, arm, or leg, especially on one side of the body." },
      { documentId: "cdc:stroke", quote: "Call 9-1-1 right away if you or someone else has any of these symptoms." }],
    boundary: "Both symptom qualifier and action are required; a symptom list alone is not transport guidance." },
  { id: "vte-testing-task", claim: "Suspected DVT or PE needs clinical testing, not diagnosis from symptoms alone.",
    spans: [{ documentId: "cdc:vte", quote: "The diagnosis of DVT or PE requires special tests that can only be performed by a doctor." }],
    boundary: "Supports clinical testing; does not specify a queue priority, service availability, or universal ambulance requirement." },
  { id: "migraine-treatment-review", claim: "When migraine treatment outcomes are suboptimal, review diagnosis, treatment strategy, dosing and adherence.",
    spans: [{ documentId: "pmc:PMC8321897", quote: "When outcomes are suboptimal, review the diagnosis, treatment strategy, dosing and adherence." }],
    boundary: "Supports a clinician review task; does not require examination today or establish a refill as safe." },
  { id: "vertigo-warning-conjunction", claim: "Sudden or severe dizziness with vision problems, slurred speech or weakness needs emergency help.",
    spans: [{ documentId: "medlineplus:216", quote: "Get emergency help right away if you have sudden or severe dizziness or vertigo along with vision problems, slurred speech or weakness." }],
    boundary: "Keep the associated-neurological-feature condition. A definition of vertigo does not support this warning claim." },
];

// Frozen correspondence to previously authored retrieval probes, not cohort
// patients or route labels. Saved packets can be replayed without paid queries.
export const SAVED_PROBE_SUPPORT = [
  { retrievalProbe: "R01", supportProbe: "suspected-heart-attack-action" },
  { retrievalProbe: "R02", supportProbe: "stroke-signs-action" },
  { retrievalProbe: "R03", supportProbe: "vte-testing-task" },
  { retrievalProbe: "R06", supportProbe: "migraine-treatment-review" },
] as const;
