/** Read-only, $0 replay. Retrospective development witnesses, not clinical lift.
 * Runs unchanged saved queries at the same nine-passage budget; never ingests
 * expected routes or case IDs. No provider, index rebuild or result-file write.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256, type Hit, type Retrieval } from "./model.ts";
import { createSupportSectionExpander, SECTION_EXPANSION_POLICY, type SectionReplacementMode } from "./support-section-expansion.ts";
import { selectDispositionEvidence } from "./v26.ts";
import { V26_CHALLENGES } from "./v26-challenges.ts";
import { DISPOSITION_SUPPORT_PROBES, SAVED_PROBE_SUPPORT } from "./disposition-support-fixtures.ts";
import { measureSupportOpportunity } from "./disposition-support.ts";

export function replaySectionExpansion(root = process.cwd(), replacementMode: SectionReplacementMode = "capacity_only") {
  const corpusRaw = readFileSync(resolve(root, "apps/evaluation/.local/clinical-rag-v8/corpus.json"), "utf8");
  const corpus = JSON.parse(corpusRaw), began = performance.now(), expand = createSupportSectionExpander(corpus), preparationMs = performance.now() - began;
  const inputs: Record<string,string> = {}, rows = [];
  for (const mode of ["lexical", "hybrid"] as const) for (const variant of ["raw", "hinted"] as const) for (const probe of V26_CHALLENGES) {
    const file = `outputs/v26-rag-${mode}-2026-09-15/${probe.id}-${variant}-retrieval.json`;
    let baseline: Hit[] = [], selected: Hit[] = [], errors: string[] = [], expansion: ReturnType<typeof expand>["audit"] | null = null, durationMs: number | null = null;
    try {
      const bytes = readFileSync(resolve(root, file)); inputs[file] = sha256(bytes);
      const saved = JSON.parse(bytes.toString());
      if (!Array.isArray(saved.queries) || !saved.queries.length || !Array.isArray(saved.results) || !Array.isArray(saved.errors)
        || saved.errors.some((e: unknown) => typeof e !== "string") || saved.results.length + saved.errors.length !== saved.queries.length) throw new Error("SAVED_QUERY_ACCOUNTING_INVALID");
      const packets: Retrieval[] = saved.results; errors = [...saved.errors];
      if (packets.some(p => p.corpusHash !== corpus.hash)) throw new Error("SAVED_CORPUS_MISMATCH");
      if (mode === "hybrid" && packets.some(p => p.warnings.some(w => /LEXICAL_ONLY/.test(w)))) errors.push("DEGRADED_RETRIEVAL");
      baseline = selectDispositionEvidence(packets, probe.intent, 9).hits;
      const start = performance.now(), result = expand(packets, probe.intent, 9, replacementMode); durationMs = performance.now() - start;
      selected = result.hits; expansion = result.audit;
    } catch (error) { errors.push(error instanceof Error ? error.message : "REPLAY_FAILED"); }
    const witnessId = SAVED_PROBE_SUPPORT.find(m => m.retrievalProbe === probe.id)?.supportProbe;
    const witness = DISPOSITION_SUPPORT_PROBES.find(p => p.id === witnessId);
    const targets = (hits: Hit[]) => probe.targets.map(t => ({ ...t, found: hits.some(h => h.document.id === t.document && h.chunk.sectionTitle.includes(t.section)) }));
    rows.push({ id: `${mode}:${variant}:${probe.id}`, mode, variant, queriesUnchanged: true, errors, complete: errors.length === 0,
      baselineTargets: targets(baseline), expandedTargets: targets(selected),
      supportBefore: witness ? measureSupportOpportunity(witness, baseline, errors) : null,
      supportAfter: witness ? measureSupportOpportunity(witness, selected, errors) : null,
      baselinePassageIds: baseline.map(h => h.chunk.id), selectedPassageIds: selected.map(h => h.chunk.id), expansion, localSelectionMs: durationMs });
  }
  const witnesses = rows.filter(r => r.supportBefore), changed = witnesses.filter(r => r.supportBefore!.supportOpportunity !== r.supportAfter!.supportOpportunity);
  return { policy: SECTION_EXPANSION_POLICY, replacementMode, design: "Retrospective authored span opportunities; not held-out, generated-claim entailment, patient applicability or clinical accuracy",
    paidCalls: 0, embeddingCalls: 0, indexBuilds: 0, packetLimit: 9, corpusHash: corpus.hash, corpusFileHash: sha256(corpusRaw), preparationMs,
    sourceHashes: Object.fromEntries(["support-section-expansion.ts", "support-section-expansion.test.ts", "support-section-expansion-replay.ts", "v26.ts", "v26-challenges.ts", "disposition-support-fixtures.ts", "disposition-support.ts"].map(file => [file, sha256(readFileSync(resolve(root, "src/evidence/rag", file)))])),
    inputs, inputManifestHash: sha256(JSON.stringify(inputs)), attempted: rows.length, incomplete: rows.filter(r => !r.complete).length,
    selectedEmpty: rows.filter(r => !r.selectedPassageIds.length).length, witnessAttempts: witnesses.length,
    supportBefore: witnesses.filter(r => r.supportBefore!.supportOpportunity).length, supportAfter: witnesses.filter(r => r.supportAfter!.supportOpportunity).length,
    supportChanges: changed.map(r => ({ id: r.id, before: r.supportBefore!.supportOpportunity, after: r.supportAfter!.supportOpportunity })),
    targetRegressions: rows.filter(r => r.baselineTargets.some((t,i) => t.found && !r.expandedTargets[i].found)).map(r => r.id),
    publicActionPreservationFailures: rows.filter(r => r.expansion && !r.expansion.originalExplicitActionsPreserved).map(r => r.id), rows };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2] ?? "capacity_only";
  if (mode !== "capacity_only" && mode !== "same_document") throw new Error("Usage: support-section-expansion-replay.ts [capacity_only|same_document]");
  console.log(JSON.stringify(replaySectionExpansion(process.cwd(), mode), null, 2));
}
