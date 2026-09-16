/** Offline inspection artifact. Never imported by either live disposition application. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import { scoreWorkflowAware } from "../../scripts/score-workflow-aware.ts";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const pathSchema = z.string().min(1).refine(s => !isAbsolute(s) && !s.split(/[\\/]/).includes("..") && !s.includes("\\"), "Repository-relative path required");
const route = z.enum(["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"]);
const model = z.enum(["fable", "nano"]);
const arm = z.enum(["baseline", "async_context", "workflow_contract", "workflow_evidence"]);
const endpoint = z.enum(["TP", "FN", "FP", "TN", "AMBIGUOUS_REFERENCE", "FN_FAILED_OUTPUT", "FAILED_OUTPUT_NEGATIVE_REFERENCE"]);
const referenceStatus = z.enum(["single_physician_post_output_reassessment_of_known_development_set", "ai_authored_unreviewed"]);
const source = z.object({ id: z.string(), title: z.string(), publisher: z.string(), url: z.string().url().refine(s => s.startsWith("https://")),
  accessedOn: z.string(), sourceDate: z.string().nullable(), population: z.string(), clinicalReview: z.literal("unreviewed"), selectedText: z.string(), selectedTextHash: digest }).strict();
const evidence = z.object({ packetHash: digest, selectedIds: z.array(z.string()), excluded: z.array(z.object({ id: z.string(), reason: z.string() }).strict()) }).strict();
const caseSchema = z.object({ id: z.string(), message: z.string(), phase: z.string(), cohort: z.string(), referenceStatus,
  acceptedBuckets: z.array(route).min(1), inputSHA256: digest, evidence }).strict();
const record = z.object({ jobId: z.string(), caseId: z.string(), phase: z.string(), model, arm, replicate: z.number().int().positive(),
  disposition: route.nullable(), rationale: z.string().nullable(), failure: z.string().nullable(), agrees: z.boolean(), clinicianAction: endpoint, urgentAction: endpoint,
  requestPath: pathSchema, requestSHA256: digest, rawPath: pathSchema, rawSHA256: digest, parsedPath: pathSchema, parsedSHA256: digest, promptSHA256: digest }).strict();
const counts = z.object({ TP: z.number().int().nonnegative(), FN: z.number().int().nonnegative(), FP: z.number().int().nonnegative(), TN: z.number().int().nonnegative(),
  positiveDenominator: z.number().int().nonnegative(), ambiguousReferenceCount: z.number().int().nonnegative() }).strict();
const metric = z.object({ phase: z.string(), cohort: z.string(), model, arm, replicate: z.number().int().positive(), denominator: z.number().int().positive(),
  agree: z.number().int().nonnegative(), failedOutputs: z.number().int().nonnegative(), predictedSelfCare: z.number().int().nonnegative(),
  clinicianAction: counts, urgentAction: counts,
  falseOmission: z.object({ numerator: z.number().int().nonnegative(), denominator: z.number().int().nonnegative(), ambiguousReferenceSelfCare: z.number().int().nonnegative() }).strict() }).strict();

export const REVIEW_SCHEMA = z.object({ schema: z.literal("workflow-study-review/v1"), studyId: z.string(), frozenAt: z.string(), completedAt: z.string(),
  cases: z.array(caseSchema).min(1), records: z.array(record).min(1), metrics: z.array(metric).min(1), sources: z.array(source),
  provenance: z.record(pathSchema, digest), independentClinicalValidation: z.literal(false), automaticPromotion: z.literal(false), inferenceEnabled: z.literal(false) }).strict();
export type ReviewData = z.infer<typeof REVIEW_SCHEMA>;
type ReviewRecord = ReviewData["records"][number];
type ReviewMetric = ReviewData["metrics"][number];

function within(root: string, path: string) {
  pathSchema.parse(path);
  const result = resolve(root, path);
  assert(!relative(root, result).startsWith(".."), "Path escapes repository");
  return result;
}
function relativePath(root: string, path: string) { const result = relative(root, resolve(path)); pathSchema.parse(result); return result; }
const pickCounts = (x: ReviewMetric["clinicianAction"]) => ({ TP: x.TP, FN: x.FN, FP: x.FP, TN: x.TN, positiveDenominator: x.positiveDenominator, ambiguousReferenceCount: x.ambiguousReferenceCount });

/** Verify exact saved analysis, not merely an internally consistent projection. */
export function assertSavedAnalysis(saved: { scorecard: unknown; audit: unknown }, recomputed: { scorecard: unknown; audit: unknown }) {
  assert.deepEqual(saved.scorecard, recomputed.scorecard, "Saved scorecard does not match verified frozen generation and references");
  assert.deepEqual(saved.audit, recomputed.audit, "Saved scoring audit does not match verified frozen generation and references");
}

/** The only filesystem admission path: completed verification precedes every analysis read. */
export function loadVerifiedReviewData(options: { root: string; studyDir: string; referenceFreezePath: string }): ReviewData {
  const root = resolve(options.root), studyDir = resolve(options.studyDir), referenceFreezePath = resolve(options.referenceFreezePath);
  relativePath(root, studyDir); relativePath(root, referenceFreezePath);
  // This scorer calls the full frozen-generation verifier before opening references.
  // write:false is essential: this builder may not create or rewrite a study artifact.
  const recomputed = scoreWorkflowAware(studyDir, { root, referenceFreezePath, write: false });
  const saved = { scorecard: read(resolve(studyDir, "scorecard-workflow-aware.json")), audit: read(resolve(studyDir, "scoring-audit-workflow-aware.json")) };
  assertSavedAnalysis(saved, recomputed);
  const manifest = read(resolve(studyDir, "manifest.json")), complete = read(resolve(studyDir, "generation-complete.json"));
  const packets = read(within(root, manifest.inputs.evidencePath));
  const comparisonPath = resolve(dirname(within(root, manifest.inputs.evidencePath)), "retrieval-comparison.json");
  // Input hashes were authenticated by the frozen verifier; retain this explicit admission assertion.
  assert.equal(hash(readFileSync(comparisonPath)), manifest.inputFiles[relativePath(root, comparisonPath)], "Retrieval comparison is not a frozen input");
  const comparison = read(comparisonPath);
  const provenance: Record<string, string> = {};
  for (const name of ["manifest.json", "generation-complete.json", "scorecard-workflow-aware.json", "scoring-audit-workflow-aware.json"])
    provenance[relativePath(root, resolve(studyDir, name))] = hash(readFileSync(resolve(studyDir, name)));
  for (const file of [referenceFreezePath, within(root, manifest.inputs.evidencePath), comparisonPath]) provenance[relativePath(root, file)] = hash(readFileSync(file));
  const freeze = read(referenceFreezePath);
  for (const file of [freeze.known.path, freeze.challenge.path, "scripts/score-workflow-aware.ts", "src/research/workflow-aware/protocol.ts", "data/research/workflow-aware-v1/evidence-cards.json"])
    provenance[file] = hash(readFileSync(within(root, file)));
  return projectReviewData({ manifest, complete, scorecard: saved.scorecard, packets, comparison, studyPath: relativePath(root, studyDir), provenance });
}

/** Pure, strict projection. Financial/raw reasoning fields are never copied into the review. */
export function projectReviewData(input: {
  manifest: any; complete: any; scorecard: any; packets: any; comparison: any; studyPath: string; provenance: Record<string, string>;
}): ReviewData {
  const { manifest, complete, scorecard, packets, comparison, studyPath, provenance } = input;
  assert.equal(manifest.schema, "workflow-aware-manifest/v1");
  assert.equal(complete.schema, "workflow-aware-generation-freeze/v1");
  assert.equal(scorecard.schema, "workflow-aware-scorecard/v1");
  assert.equal(packets.schema, "workflow-aware-evidence-packets/v1");
  assert.equal(comparison.schema, "workflow-aware-retrieval-comparison/v1");
  assert.equal(complete.studyId, manifest.studyId); assert.equal(scorecard.studyId, manifest.studyId);
  assert.equal(complete.plannedJobs, manifest.jobs.length); assert.equal(complete.providerCalls, manifest.jobs.length);
  assert.equal(scorecard.independentClinicalValidation, false); assert.equal(scorecard.automaticPromotion, false);
  const caseMap = new Map<string, ReviewData["cases"][number]>(), sourceMap = new Map<string, z.infer<typeof source>>();
  const recordMap = new Map<string, ReviewRecord>(), metrics: ReviewMetric[] = [];
  const jobMap = new Map<string, any>(manifest.jobs.map((j: any) => [j.jobId, j]));
  assert.equal(jobMap.size, manifest.jobs.length, "Duplicate planned job");
  const messageMap = new Map<string, string>(manifest.messages.map((m: any) => [m.id, m.message]));
  assert.equal(messageMap.size, manifest.messages.length, "Duplicate planned case");
  for (const m of Object.values(scorecard.metrics) as any[]) {
    assert.notEqual(m.phase, "ALL_PHASES", "Overlapping cohort summaries may not be projected");
    assert.equal(m.rows.length, m.denominator); assert.equal(m.plannedDenominator, m.denominator);
    metrics.push({ phase: m.phase, cohort: m.cohort, model: m.model, arm: m.arm, replicate: m.replicate, denominator: m.denominator,
      agree: m.agree, failedOutputs: m.failedOutputs, predictedSelfCare: m.predictedSelfCare, clinicianAction: pickCounts(m.clinicianAction), urgentAction: pickCounts(m.urgentAction),
      falseOmission: { numerator: m.falseOmission.numerator, denominator: m.falseOmission.denominator, ambiguousReferenceSelfCare: m.falseOmission.ambiguousReferenceSelfCare } });
    for (const row of m.rows) {
      const jobId = `${m.phase}-${row.id}-${m.model}-${m.arm}-r${m.replicate}`, job = jobMap.get(jobId);
      assert(job, `Unplanned score row: ${jobId}`); assert(!recordMap.has(jobId), "Duplicate score row");
      assert.equal(row.message, messageMap.get(row.id)); assert.equal(hash(row.message), job.inputSHA256);
      assert.equal(job.caseId, row.id); assert.equal(job.phase, m.phase); assert.equal(job.model, m.model); assert.equal(job.arm, m.arm); assert.equal(job.replicate, m.replicate);
      const packet = packets.packets.find((p: any) => p.inputSHA256 === job.inputSHA256); assert(packet, "Missing frozen evidence packet");
      const rendered = JSON.parse(packet.evidenceText), retrieval = comparison.rows.find((r: any) => r.id === row.id);
      assert(retrieval, "Missing retrieval record"); assert.equal(retrieval.inputSHA256, job.inputSHA256); assert.equal(retrieval.evidenceText, packet.evidenceText);
      assert.equal(rendered.packetHash, packet.evidenceMetadata.packetHash);
      assert.deepEqual(rendered.sources.map((s: any) => s.id), packet.evidenceMetadata.selectedIds);
      for (const item of rendered.sources) {
        const selected = source.parse(item); assert.equal(hash(selected.selectedText), selected.selectedTextHash, "Selected source text hash differs");
        const prior = sourceMap.get(selected.id); if (prior) assert.deepEqual(selected, prior, "Source identity differs between packets"); else sourceMap.set(selected.id, selected);
      }
      const c = caseSchema.parse({ id: row.id, message: row.message, phase: m.phase, cohort: m.cohort, referenceStatus: m.referenceStatus,
        acceptedBuckets: row.acceptedBuckets, inputSHA256: job.inputSHA256, evidence: { packetHash: rendered.packetHash, selectedIds: packet.evidenceMetadata.selectedIds, excluded: retrieval.hybrid.excluded } });
      const prior = caseMap.get(row.id); if (prior) assert.deepEqual(prior, c, "Case reference or packet differs across arms"); else caseMap.set(row.id, c);
      const requestPath = `${studyPath}/${job.requestPath}`, rawPath = `${studyPath}/raw/${jobId}.json`, parsedPath = `${studyPath}/parsed/${jobId}.json`;
      assert.equal(complete.artifactHashes[job.requestPath], job.requestSHA256, "Request hash not bound by completion");
      recordMap.set(jobId, record.parse({ jobId, caseId: row.id, phase: m.phase, model: m.model, arm: m.arm, replicate: m.replicate,
        disposition: row.disposition, rationale: row.rationale, failure: row.failure, agrees: row.agrees, clinicianAction: row.clinicianAction, urgentAction: row.urgentAction,
        requestPath, requestSHA256: job.requestSHA256, rawPath, rawSHA256: complete.artifactHashes[`raw/${jobId}.json`], parsedPath, parsedSHA256: complete.artifactHashes[`parsed/${jobId}.json`], promptSHA256: job.promptSHA256 }));
    }
  }
  assert.equal(recordMap.size, manifest.jobs.length, "Incomplete projected schedule"); assert.equal(caseMap.size, manifest.messages.length);
  const data = REVIEW_SCHEMA.parse({ schema: "workflow-study-review/v1", studyId: manifest.studyId, frozenAt: manifest.frozenAt, completedAt: complete.completedAt,
    cases: [...caseMap.values()].sort((a, b) => a.id.localeCompare(b.id)), records: [...recordMap.values()].sort((a, b) => a.jobId.localeCompare(b.jobId)),
    metrics: metrics.sort((a, b) => `${a.phase}/${a.model}/${a.arm}/${a.replicate}`.localeCompare(`${b.phase}/${b.model}/${b.arm}/${b.replicate}`)),
    sources: [...sourceMap.values()].sort((a, b) => a.id.localeCompare(b.id)), provenance, independentClinicalValidation: false, automaticPromotion: false, inferenceEnabled: false });
  for (const r of data.records) pairedBaseline(data, r.jobId);
  return data;
}

export function pairedBaseline(data: ReviewData, jobId: string) {
  const current = data.records.find(r => r.jobId === jobId); assert(current, "Unknown review record");
  const baseline = data.records.find(r => r.caseId === current.caseId && r.phase === current.phase && r.model === current.model && r.replicate === current.replicate && r.arm === "baseline");
  assert(baseline, "No same-case/model/repetition baseline");
  const missed = (value: string) => value === "FN" || value === "FN_FAILED_OUTPUT";
  return { current, baseline, changed: current.disposition !== baseline.disposition,
    newClinicianFN: missed(current.clinicianAction) && !missed(baseline.clinicianAction),
    resolvedClinicianFN: !missed(current.clinicianAction) && missed(baseline.clinicianAction),
    newUrgentFN: missed(current.urgentAction) && !missed(baseline.urgentAction),
    resolvedUrgentFN: !missed(current.urgentAction) && missed(baseline.urgentAction) };
}

export function safeEmbeddedJSON(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

const CSS = `:root{color-scheme:light;--ink:#152a36;--muted:#50616c;--line:#cbd7df;--paper:#f2f6f8;--accent:#075f68;--warn:#8b2e25}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.5 system-ui,sans-serif;overflow-wrap:anywhere}header,main,footer{max-width:1280px;margin:auto;padding:24px}header{padding-bottom:8px}h1{font-size:2rem;margin:5px 0 12px;line-height:1.15}h2{font-size:1.25rem;margin:0 0 12px}h3{font-size:1rem;margin:16px 0 5px}.eyebrow{font-size:.78rem;font-weight:750;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)}p{margin:8px 0}.muted,.caption{color:var(--muted);font-size:.9rem}.notice{border-left:5px solid var(--accent);padding:12px 16px;background:#e5f1f2}.controls,.card{background:white;border:1px solid var(--line);border-radius:8px;padding:18px;margin:0 0 18px}.controls{display:grid;grid-template-columns:1.3fr 1fr 1.5fr .8fr;gap:14px}label{font-size:.88rem;font-weight:650;display:block}select,button{font:inherit;padding:10px;border:1px solid #889da9;border-radius:5px;background:white;color:var(--ink);width:100%}button{width:auto;cursor:pointer}button:hover,button:focus-visible{background:#e5f1f2}select:focus-visible,button:focus-visible,summary:focus-visible{outline:3px solid #0d8795;outline-offset:2px}.quick{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.grid .card{height:100%;margin:0;min-width:0}.controls>label{min-width:0}select{max-width:100%}.grid{margin-bottom:18px}.message{white-space:pre-wrap;font-size:1.12rem;line-height:1.65;margin:12px 0;padding:15px;background:#f5f8fa;border-left:3px solid #526f80}.rationale{white-space:pre-wrap;line-height:1.6}.route{font-size:1.05rem;font-weight:800;color:var(--accent);overflow-wrap:anywhere}.badge{display:inline-block;background:#e9f2f3;border-radius:4px;padding:3px 7px;margin:5px 5px 0 0;font-size:.82rem}.bad{background:#fbe9e6;color:var(--warn);font-weight:700}.good{background:#e6f1eb;color:#245b3c}.table-wrap{overflow-x:auto;max-width:100%;min-width:0}.table-wrap table{min-width:620px}table{border-collapse:collapse;width:100%;font-size:.88rem}caption{text-align:left;font-weight:650;margin:0 0 10px}th,td{text-align:left;border-bottom:1px solid var(--line);padding:9px;vertical-align:top}th{background:#edf3f6}tr.selected td{background:#e8f3f4}td button{padding:4px 7px;font-size:.85rem}details{margin-top:14px}summary{cursor:pointer;font-weight:650;padding:6px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 ui-monospace,monospace;background:#f1f5f7;padding:12px;border-radius:4px}code{font-size:.83rem;overflow-wrap:anywhere}footer{font-size:.85rem;color:var(--muted)}.status{font-weight:650}.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kpi p{padding:10px;background:#f2f6f8;border-radius:5px;font-size:.92rem}.kpi strong{display:block;font-size:1.15rem}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:850px){.grid,.controls{grid-template-columns:1fr 1fr}.kpi{grid-template-columns:1fr}header,main,footer{padding:16px}}@media(max-width:550px){.grid,.controls{grid-template-columns:1fr}h1{font-size:1.7rem}}@media print{.controls,.quick,button{display:none}body{background:white}.card{break-inside:avoid}header,main,footer{max-width:none}details{display:block}}`;

// Static script only. Every data-derived string enters the DOM with textContent.
const CLIENT = `"use strict";
const data=JSON.parse(document.getElementById("review-data").textContent);
const el=id=>document.getElementById(id);
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const armNames={baseline:"A · Baseline",async_context:"B · Async context",workflow_contract:"C · Workflow contract",workflow_evidence:"D · Workflow + evidence"};
const modelNames={fable:"Fable 5.1 · low effort",nano:"Nemotron Nano · local Q5 · think:false"};
const statusNames={TP:"Required action retained",FN:"Reference-defined false negative",FP:"Additional action vs reference",TN:"No required positive action",AMBIGUOUS_REFERENCE:"Reference permits alternatives; excluded from this binary endpoint",FN_FAILED_OUTPUT:"Failed output; required reference action missed",FAILED_OUTPUT_NEGATIVE_REFERENCE:"Failed output; no benign route inferred"};
const cohortName=c=>c.cohort==="knownDevelopment"?"Known development cases":"AI-authored challenge";
const refName=c=>c.referenceStatus==="ai_authored_unreviewed"?"AI-authored targets; not clinical gold":"Single physician, post-output reassessment; familiar development set";
function fill(id,values,label){const s=el(id);for(const v of values){const o=node("option",label(v));o.value=String(v);s.append(o)}}
fill("case",data.cases,c=>c.id+" · "+cohortName(c));for(let i=0;i<data.cases.length;i++)el("case").options[i].value=data.cases[i].id;
fill("model",[...new Set(data.records.map(r=>r.model))],m=>modelNames[m]);
fill("arm",["baseline","async_context","workflow_contract","workflow_evidence"].filter(a=>data.records.some(r=>r.arm===a)),a=>armNames[a]);
fill("replicate",[...new Set(data.records.map(r=>r.replicate))].sort(),r=>"Repeat "+r);
const initial=data.cases.some(c=>c.id==="C22")?"C22":data.cases[0].id;el("case").value=initial;el("arm").value=data.records.some(r=>r.arm==="workflow_evidence")?"workflow_evidence":"baseline";
for(const id of ["case","model","arm","replicate"])el(id).addEventListener("change",render);
for(const id of ["C22","C47","WP16B"]){if(!data.cases.some(c=>c.id===id))continue;const b=node("button","Inspect "+id);b.type="button";b.addEventListener("click",()=>{el("case").value=id;render()});el("quick").append(b)}
function baseline(r){return data.records.find(b=>b.caseId===r.caseId&&b.phase===r.phase&&b.model===r.model&&b.replicate===r.replicate&&b.arm==="baseline")}
function badges(parent,r){parent.append(node("span",r.agrees?"Route agrees with saved reference":"Route disagrees with saved reference","badge "+(r.agrees?"good":"bad")));for(const [label,key] of [["Clinician action","clinicianAction"],["Urgent route","urgentAction"]])parent.append(node("p",label+": "+statusNames[r[key]],r[key]==="FN"?"badge bad":"caption"))}
function decision(parent,r,title){parent.replaceChildren(node("h2",title),node("p",modelNames[r.model]+" · "+armNames[r.arm]+" · repeat "+r.replicate,"caption"),node("p",r.disposition||"FAILED OUTPUT","route"));badges(parent,r);parent.append(node("h3","Saved short rationale"),node("p",r.rationale||r.failure||"No rationale","rationale"));const d=node("details");d.append(node("summary","Artifact identities"));for(const k of ["jobId","promptSHA256","requestPath","requestSHA256","rawPath","rawSHA256","parsedPath","parsedSHA256"])d.append(node("p",k,"caption"),node("code",r[k]));parent.append(d)}
function metricFor(r){return data.metrics.find(m=>m.phase===r.phase&&m.model===r.model&&m.arm===r.arm&&m.replicate===r.replicate)}
function render(){const c=data.cases.find(c=>c.id===el("case").value),r=data.records.find(r=>r.caseId===c.id&&r.model===el("model").value&&r.arm===el("arm").value&&r.replicate===Number(el("replicate").value));if(!r){el("status").textContent="This combination was not planned.";return}const b=baseline(r),m=metricFor(r);el("case-title").textContent=c.id+" · "+cohortName(c);el("message").textContent=c.message;el("reference").textContent="Saved accepted route(s): "+c.acceptedBuckets.join(" or ")+". "+refName(c)+".";el("status").textContent=c.id+" · "+modelNames[r.model]+" · "+armNames[r.arm]+" · repeat "+r.replicate;
decision(el("current"),r,"Selected saved decision");decision(el("baseline"),b,"Own contemporaneous baseline");
const delta=el("delta");delta.replaceChildren(node("h2","Paired change for this exact case"));delta.append(node("p",r.arm==="baseline"?"Baseline selected: the two panels show the same record.":b.disposition+" → "+r.disposition+(b.disposition===r.disposition?" · bucket unchanged":" · bucket changed"),"status"));for(const [label,key] of [["Clinician-action FN","clinicianAction"],["Urgent-reference FN","urgentAction"]]){const old=b[key]==="FN",now=r[key]==="FN";delta.append(node("p",label+": "+(old&&now?"persists":old?"resolved in this saved comparison":now?"new in this saved comparison":"absent in both records"),now?"badge bad":"caption"))}delta.append(node("p","Matched on case, model, phase and repetition. This is descriptive; no causal or patient-outcome claim.","caption"));
const kp=el("metrics");kp.replaceChildren();for(const [label,value] of [["Route agreement",m.agree+" / "+m.denominator],["Clinician action retained",m.clinicianAction.TP+" / "+m.clinicianAction.positiveDenominator],["Urgent route retained",m.urgentAction.TP+" / "+m.urgentAction.positiveDenominator],["Clinician-action false negatives",m.clinicianAction.FN+" / "+m.clinicianAction.positiveDenominator],["Urgent-reference false negatives",m.urgentAction.FN+" / "+m.urgentAction.positiveDenominator],["False omissions among self-care",m.falseOmission.numerator+" / "+m.falseOmission.denominator]]){const p=node("p",label);p.append(node("strong",value));kp.append(p)}el("metric-caption").textContent=cohortName(c)+" · selected model/arm/repetition only. "+(m.denominator-m.predictedSelfCare-m.failedOutputs)+" clinician-route selections / "+m.denominator+"; "+m.failedOutputs+" failed outputs. Ambiguous references excluded from binary endpoints: clinician "+m.clinicianAction.ambiguousReferenceCount+", urgent "+m.urgentAction.ambiguousReferenceCount+". Self-care with ambiguous reference: "+m.falseOmission.ambiguousReferenceSelfCare+" (excluded from the false-omission denominator). Repetitions and variants are not additional independent patients.";
const table=el("matrix-body");table.replaceChildren();for(const a of Object.keys(armNames))for(const mo of Object.keys(modelNames)){const tr=node("tr");tr.append(node("td",armNames[a]),node("td",modelNames[mo]));for(const rep of [1,2]){const cell=node("td"),v=data.records.find(v=>v.caseId===c.id&&v.model===mo&&v.arm===a&&v.replicate===rep);if(v){const button=node("button",v.disposition||"FAILED OUTPUT");button.type="button";button.addEventListener("click",()=>{el("model").value=mo;el("arm").value=a;el("replicate").value=String(rep);render()});cell.append(button);if(v.clinicianAction==="FN")cell.append(node("p","Clinician-action FN","badge bad"));if(v.urgentAction==="FN")cell.append(node("p","Urgent-reference FN","badge bad"));if(v.jobId===r.jobId)tr.className="selected"}else cell.textContent="Not planned";tr.append(cell)}table.append(tr)}
const e=el("evidence");e.replaceChildren(node("h2","Source packet for this case"));e.append(node("p",r.arm==="workflow_evidence"?"The selected decision received this frozen packet.":"The selected decision did not receive source cards. The packet below was supplied only in arm D for this case.","notice"));e.append(node("p","Packet SHA-256: "+c.evidence.packetHash,"caption"));if(!c.evidence.selectedIds.length)e.append(node("p","Empty packet: no source card was supplied. An empty retrieval result does not establish safety.","status"));for(const id of c.evidence.selectedIds){const s=data.sources.find(s=>s.id===id),d=node("details");d.open=true;d.append(node("summary",s.id+" · "+s.title));d.append(node("p",s.publisher+" · population: "+s.population+" · inspected "+s.accessedOn+" · clinical review: "+s.clinicalReview,"caption"),node("p",s.url,"caption"),node("pre",s.selectedText),node("p","Selected text SHA-256: "+s.selectedTextHash,"caption"));e.append(d)}const excluded=node("details");excluded.append(node("summary","Retrieval exclusions (not clinical findings)"));for(const x of c.evidence.excluded)excluded.append(node("p",x.id+": "+x.reason,"caption"));e.append(excluded,node("p","Cards are engineering-authored summaries with short anchors and unreviewed clinical applicability. Arm D also adds source-handling instructions; differences cannot be attributed to source text alone.","caption"));
const changed=el("changed-body");changed.replaceChildren();let n=0;for(const cur of data.records.filter(v=>v.phase===r.phase&&v.model===r.model&&v.arm===r.arm&&v.replicate===r.replicate)){const base=baseline(cur);if(cur.disposition===base.disposition)continue;n++;const tr=node("tr"),td=node("td"),button=node("button",cur.caseId);button.type="button";button.addEventListener("click",()=>{el("case").value=cur.caseId;render()});td.append(button);tr.append(td,node("td",base.disposition||"FAILED OUTPUT"),node("td",cur.disposition||"FAILED OUTPUT"),node("td",statusNames[cur.clinicianAction]),node("td",statusNames[cur.urgentAction]));changed.append(tr)}el("changed-caption").textContent=n+" bucket changes vs the same model's baseline, same cohort and repetition. Select a case to inspect its exact message.";
}
el("provenance").textContent="Study "+data.studyId+"\\nProtocol frozen "+data.frozenAt+"\\nGeneration completed "+data.completedAt+"\\n"+data.cases.length+" unique messages; "+data.records.length+" saved decisions.\\n\\n"+Object.entries(data.provenance).map(([p,h])=>p+"\\n  SHA-256 "+h).join("\\n");
render();
`;

export function renderReviewHTML(input: ReviewData): string {
  const data = REVIEW_SCHEMA.parse(input), embedded = safeEmbeddedJSON(data);
  const scriptHash = createHash("sha256").update(CLIENT).digest("base64"), styleHash = createHash("sha256").update(CSS).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; media-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Disposition study · offline case review</title><style>${CSS}</style></head>
<body><header><div class="eyebrow">Completed development study · offline inspection</div><h1>Inspect the message, decision and evidence</h1><p>A saved-result review aid. No inference, patient interaction or clinical approval.</p><div class="notice"><strong>Read the reference before interpreting a miss.</strong><p>Known cases use one physician's post-output reassessment of familiar development messages. Challenge targets are AI-authored and unreviewed; they are not clinical gold. The historical 48/50 demonstration is not the contemporaneous control shown here.</p><p>Async assessment can be prompt or same-day. An urgent-reference disagreement does not prove delayed care. No patient outcomes, completed care or emergency timing were measured. No model or application is promoted by this review.</p></div></header>
<main><noscript><p class="notice">This downloaded file uses a small local script to inspect embedded records. Enable JavaScript to use the selectors; no network connection is needed.</p></noscript>
<section aria-label="Review selectors"><div class="quick" id="quick"></div><div class="controls"><label>Case<select id="case"></select></label><label>Model<select id="model"></select></label><label>Arm<select id="arm"></select></label><label>Repetition<select id="replicate"></select></label></div><p id="status" class="caption" aria-live="polite"></p></section>
<section class="card"><h2 id="case-title"></h2><p id="reference" class="caption"></p><div id="message" class="message"></div></section>
<div class="grid"><section id="current" class="card"></section><section id="baseline" class="card"></section></div>
<section id="delta" class="card"></section>
<section class="card"><h2>Selected group · reference-based endpoints</h2><div id="metrics" class="kpi"></div><p id="metric-caption" class="caption"></p><p class="caption">Clinician-action positive means every accepted route requires a clinician (async or urgent). Urgent positive means every accepted route is urgent. FN means the saved output omitted that reference-defined action. Ambiguous accepted alternatives are excluded from that binary endpoint. A failed output is never self-care.</p></section>
<section class="card"><h2>All saved contrasts for this message</h2><p class="caption">Select any result to compare its rationale with its own baseline. Neither model is a clinical reference.</p><div class="table-wrap"><table><thead><tr><th scope="col">Arm</th><th scope="col">Model</th><th scope="col">Repeat 1</th><th scope="col">Repeat 2</th></tr></thead><tbody id="matrix-body"></tbody></table></div></section>
<section id="evidence" class="card"></section>
<section class="card"><h2>Exact paired bucket changes in this group</h2><p id="changed-caption" class="caption"></p><div class="table-wrap"><table><thead><tr><th scope="col">Case</th><th scope="col">Own baseline</th><th scope="col">Selected arm</th><th scope="col">Clinician endpoint</th><th scope="col">Urgent endpoint</th></tr></thead><tbody id="changed-body"></tbody></table></div></section>
<section class="card"><h2>Provenance and interpretation</h2><p>Short rationales are saved model outputs, not hidden chain of thought or independently verified explanations. Exact source text and artifact hashes support inspection; a citation is not proof of appropriate care.</p><details><summary>Study and source artifact SHA-256 identities</summary><pre id="provenance"></pre></details></section></main>
<footer>Single-file offline artifact. No external requests, telemetry, credentials or provider controls. All messages are synthetic. This page makes no recommendation for an actual patient.</footer>
<script id="review-data" type="application/json">${embedded}</script><script>${CLIENT}</script></body></html>\n`;
}

const README = `# Offline workflow-study review

Download \`index.html\` and open it in a browser. The file contains its own data, styling and script. No server, account or network connection is needed. Source URLs and repository artifact paths are displayed as text; the page makes no external requests.

Select a case, model, arm and repetition. Compare the exact message, saved rationale and reference-defined endpoints with that model's contemporaneous baseline. Quick links surface C22, C47 and WP16B. The matrix makes every arm and repetition available. Arm D's source packet is shown with provenance, complete selected text and retrieval exclusions; other arms did not receive that packet.

Known references are one physician's post-output reassessment of familiar development cases. Authored challenge targets are unreviewed and are not clinical gold. The historical 48/50 result is not the new baseline. Repeated calls and paired variants do not create additional independent patients. This artifact measures no clinical outcomes, completed care or emergency timing and does not promote any model or runtime.

The build first verifies the entire completed generation, native-response/parsed parity, frozen inputs and reference hashes through the existing offline scorer. It recomputes the scorecard without writes and requires exact saved-scorecard and scoring-audit parity. Only an allowlisted projection is embedded: messages, routes, short rationales, reference-based endpoints, selected source cards and artifact identities. Provider accounting, credentials and raw reasoning are not embedded.

Patient and source text is inserted with DOM \`textContent\`. JSON escapes HTML delimiters; the page has a restrictive hash-based Content Security Policy and no external resources, event-handler attributes or HTML insertion sinks. This is a bounded inspection aid, not a security guarantee for arbitrary future changes.

Build from the repository root with the supported Node runtime:

\`\`\`sh
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/build-workflow-review.ts
MASTRA_TELEMETRY_DISABLED=true node --experimental-strip-types scripts/build-workflow-review.ts --verify
\`\`\`

Build refuses to overwrite different existing artifacts. Verification recomputes the deterministic output and checks exact bytes without writing. The manifest binds the HTML, this README, embedded-data hash, builder source hashes and input artifact hashes. No study files are modified.
`;

export function reviewArtifacts(data: ReviewData, builderSources: Record<string, string>) {
  REVIEW_SCHEMA.parse(data); z.record(pathSchema, digest).parse(builderSources);
  const html = renderReviewHTML(data);
  const manifest = { schema: "workflow-study-review-publication/v1", studyId: data.studyId, generatedFromCompletedAt: data.completedAt,
    dataSHA256: hash(JSON.stringify(data)), uniqueMessages: data.cases.length, savedDecisions: data.records.length,
    sourceArtifacts: data.provenance, builderSources, artifacts: { "index.html": hash(html), "README.md": hash(README) },
    independentClinicalValidation: false, automaticPromotion: false, inferenceEnabled: false };
  return { "index.html": html, "README.md": README, "manifest.json": JSON.stringify(manifest, null, 2) + "\n" };
}

export function publishReviewArtifacts(directory: string, artifacts: ReturnType<typeof reviewArtifacts>, verify = false) {
  const names = Object.keys(artifacts).sort();
  if (verify || existsSync(directory)) {
    assert(existsSync(directory), "Review artifact directory is missing");
    assert.deepEqual(readdirSync(directory).sort(), names, "Unexpected or incomplete publication artifact set");
    for (const name of names) assert.equal(readFileSync(resolve(directory, name), "utf8"), artifacts[name as keyof typeof artifacts], `Publication artifact mismatch: ${name}`);
    return;
  }
  mkdirSync(directory, { recursive: true });
  for (const name of names) writeFileSync(resolve(directory, name), artifacts[name as keyof typeof artifacts], { flag: "wx" });
}
