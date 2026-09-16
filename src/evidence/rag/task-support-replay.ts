/** Read-only replay over retained v25 source packets; stdout only, no providers.
 * Case IDs join offline artifacts only. They never enter a query or selector.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./model.ts";
import { createTaskSupportAuditor, TASK_SUPPORT_AUDIT_VERSION, type AuditPacket } from "./task-support-audit.ts";
import { TASK_SUPPORT_FIXTURES } from "./task-support-fixtures.ts";

export function replayTaskSupport(root = process.cwd()) {
  const inputs: Record<string,string> = {};
  const read = (path: string) => { const bytes = readFileSync(resolve(root, path)); inputs[path] = sha256(bytes); return JSON.parse(bytes.toString()); };
  const corpusPath = "apps/evaluation/.local/clinical-rag-v8/corpus.json", corpus = read(corpusPath);
  const referencePath = "data/evaluation/physician-system-reference-v2.json", reference = read(referencePath);
  const directory = "outputs/v25-path-b-complete-replay-2026-09-15/runs";
  // Inspect identity before selecting the unique immutable run. Only chosen
  // source files enter the result manifest; outputs are never rewritten.
  const runs = readdirSync(resolve(root, directory)).sort().filter(f => f.endsWith(".json")).map(f => ({
    path: `${directory}/${f}`, run: JSON.parse(readFileSync(resolve(root, directory, f), "utf8")),
  }));
  const audit = createTaskSupportAuditor(corpus), rows = [];
  for (const fixture of TASK_SUPPORT_FIXTURES) {
    let runId: string | null = null, status = "artifact_unavailable";
    let packet: AuditPacket = { retrieval: [], expectedQueries: [], selected: [], citations: [], responsePublished: false, errors: [] };
    try {
      const cases = reference.cases.filter((c: { id: string }) => c.id === fixture.caseId);
      if (cases.length !== 1) throw new Error("TASK_REFERENCE_IDENTITY_INVALID");
      const matches = runs.filter(r => r.run.message === cases[0].message && r.run.inputHash === cases[0].inputHash);
      if (matches.length !== 1) throw new Error("TASK_UNIQUE_RUN_REQUIRED");
      const run = read(matches[0].path); runId = run.runId; status = run.status;
      packet = { retrieval: run.graph?.retrieval ?? [], expectedQueries: run.graph?.context?.queries ?? [],
        selected: run.guidance ?? [], citations: run.graph?.citations ?? [],
        responsePublished: run.status === "complete" && run.answer !== null, errors: [] };
    } catch (error) { packet.errors.push(error instanceof Error ? error.message : "TASK_ARTIFACT_ERROR"); }
    for (const witness of fixture.witnesses) rows.push({ caseId: fixture.caseId, runId, status, ...audit(witness, packet) });
  }
  const known = rows.filter(r => r.witnessStatus === "authored_exact_spans"), published = known.filter(r => r.responsePublished);
  return { version: TASK_SUPPORT_AUDIT_VERSION, design: "Retrospective author-labelled task-role witnesses, not physician gold or held-out clinical evaluation",
    corpusHash: corpus.hash, inputs, inputManifestHash: sha256(JSON.stringify(inputs)),
    sourceHashes: Object.fromEntries(["task-support-audit.ts", "task-support-fixtures.ts", "task-support-replay.ts", "task-support-audit.test.ts", "disposition-support.ts", "v26.ts"].map(file =>
      [file, sha256(readFileSync(resolve(root, "src/evidence/rag", file)))])),
    attempts: TASK_SUPPORT_FIXTURES.length, witnessRows: rows.length, incompleteRows: rows.filter(r => !r.complete).length,
    unpublishedCases: [...new Set(rows.filter(r => !r.responsePublished).map(r => r.caseId))],
    labelledWitnessRows: known.length, noAuthoredWitnessRows: rows.length - known.length,
    corpusWitnessesPresent: known.filter(r => r.corpusOpportunity).length,
    retrievedWitnessesPresent: known.filter(r => r.retrievedOpportunity).length,
    selectedWitnessesPresent: known.filter(r => r.selectedOpportunity).length,
    publishedLabelledRows: published.length, quotedWitnessesPresent: published.filter(r => r.quotedWitness).length,
    paidCalls: 0, embeddingCalls: 0, indexBuilds: 0, runtimeChanged: false,
    generatedClaimSupport: "not_assessed", patientEligibility: "not_assessed", clinicalCorrectness: "not_assessed", rows };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) console.log(JSON.stringify(replayTaskSupport(), null, 2));
