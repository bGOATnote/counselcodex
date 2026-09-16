import { buildCorpus, sha256, type ClinicalDocument, type Hit, type Retrieval } from "../../src/evidence/rag/model.ts";
import { draftSchema } from "../../src/disposition/graph-output.ts";
import { asyncAction } from "../../src/disposition/routing-policy.ts";

// Authored software fixture, NOT medical evidence or a live model response.
export const patient = "My usual migraine started today. I need a refill. No fever.";
export const sourceText = "Migraine may cause throbbing pain and light sensitivity. Prescription renewal requires clinician review.";
const document: ClinicalDocument = { id: "gates-test", title: "Synthetic software-test passage", url: "https://example.org/software-test",
  publisher: "Test", kind: "patient_summary", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  attribution: "Authored test fixture", sourceVersion: "test-v1", rawHash: sha256(sourceText), retrievedAt: "2026-09-15T00:00:00Z",
  publicationDate: null, reviewDate: null, reviewStatus: "agent_compiled", currency: "not_assessed", scope: "Software verification only, not clinical support.",
  aliases: [], concepts: [], related: [], sections: [{ title: "Fixture", text: sourceText }] };
const corpus = buildCorpus([document]), { sections: _sections, ...meta } = document;
export const hit: Hit = { document: meta, chunk: corpus.chunks[0], score: 1, channels: ["lexical"], context: { before: "", after: "" } };
export const retrieval: Retrieval = { query: "test query", corpusHash: corpus.hash, mode: "hybrid", hits: [hit], timings: { totalMs: 1 }, warnings: ["Authored test fixture"], embeddingTokens: 0, embeddingCacheHit: false };
export const context = { queries: ["test query"], findings: [], question: null };
export const none = { action: "NONE", basis: [], reason: "No early action proposed by this software fixture.", patientMessage: "" };
export const draft = draftSchema.parse({ disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority", workType: "medication_request",
  patientMessage: asyncAction({ disposition: "ASYNC_PHYSICIAN", reviewPriority: "priority" }) + " Seek emergency care if sudden severe headache or new weakness develops.",
  reason: "A time-sensitive medication request needs Counsel clinician prescribing review.", differential: ["Reported usual migraine"],
  redFlags: [{ concern: "Fever", status: "denied", quote: "No fever" }, { concern: "Other symptoms", status: "unknown", quote: "" }],
  vitalSigns: "No measured vital signs supplied; their context remains unknown.", questions: [],
  citations: [{ passageId: hit.chunk.id, quote: sourceText, claim: "Migraine can cause throbbing pain and light sensitivity.", applicability: "uncertain", limitation: "Synthetic software fixture only." }],
  evidenceLimitations: "This synthetic passage tests software provenance, not clinical correctness." });
export const usage = { inputTokens: 0, outputTokens: 0 };
