import { retrieveEvidence } from "../evidence/retrieval.ts";
import { evidenceLibrary } from "../evidence/library.ts";

// Compatibility export for existing trace hashes. No case-specific briefs or labels.
export const guidanceCorpus = evidenceLibrary.recommendations.map((r) => ({ ...r, url: evidenceLibrary.sources.find((s) => s.id === r.sourceId)!.url }));
export function retrieveGuidance(message: string) { return retrieveEvidence(message).guidance; }
