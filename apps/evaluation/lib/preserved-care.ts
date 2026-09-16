import { adaptiveAnswerSchema, checkAnswerForFullReview as checkAnswer, type DispositionRun } from "../../../src/disposition/contract.ts";
import { PRESERVED_CARE_COPY, boundEmergencyTransport, isEmsInstruction, reducesEmergencyTransport, urgentCareDirective, type ReviewedEmergencyTransport } from "../../../src/disposition/care-setting.ts";
import { exactStructuredJudgeAnchor } from "../../../src/disposition/judge-anchors.ts";
import { asyncAction, routingFieldsValid } from "../../../src/disposition/routing-policy.ts";
import type { GraphJudge } from "../../../src/disposition/clinical-graph.ts";
import { draftSchema, wireDraftSchema } from "../../../src/disposition/graph-output.ts";
import { resolveSourceQuoteReferences } from "../../../src/disposition/source-quote-refs.ts";
import { sameRepairValue } from "../../../src/disposition/repair-values.ts";
import { verifyJudgeSourceRepairBindingSteps } from "../../../src/disposition/judge-source-repair-binding.ts";

const digest = async (text: string) => Array.from(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))), b => b.toString(16).padStart(2, "0")).join("");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const careCriteria = ["undertriage", "overtriage", "patient_grounding", "safety_net", "clarification_delay", "ownership"];

// The same reconstruction serves browser Web Crypto and the synchronous
// offline scorer. Yielded values are exact serialized hash inputs, not I/O.
export function* reconstructReviewedProducerSteps(run: DispositionRun, hashes: string[], targetHash: string): Generator<string, { index: number; draft: ReturnType<typeof draftSchema.parse> } | null, string> {
  const records = run.agents ?? [];
  const direct = records.findIndex((a,i)=>a.role==="disposition"&&!a.failure&&hashes[i]===targetHash);
  if(direct>=0)return {index:direct,draft:draftSchema.parse(records[direct].output)};
  const audit=run.graph?.repair;
  if(!audit||audit.status!=="applied"||audit.failure!==null||audit.resultDraftHash!==targetHash)return null;
  // Historical v1 results keep their original admission semantics. New v2
  // records must prove the exact changed/no-op partition, not just final hash.
  const normalizedNoops=audit.protocol==="field-local-repair/v2";
  if(!normalizedNoops&&audit.protocol!=="field-local-repair/v1")return null;
  if(normalizedNoops&&!Array.isArray(audit.noopFields))return null;
  const baseIndex=records.findIndex((a,i)=>a.role==="disposition"&&!a.failure&&hashes[i]===audit.baseDraftHash);
  if(baseIndex<0)return null;
  const index=records.findIndex((a,i)=>i>baseIndex&&a.role==="disposition"&&!a.failure&&a.repairInputBinding?.baseDraftHash===audit.baseDraftHash
    &&a.repairInputBinding.evidenceHash===audit.evidenceHash&&same(a.repairInputBinding.allowedFields,audit.allowedFields));
  if(index<0||records.slice(baseIndex+1,index).some(a=>a.role==="disposition"))return null;
  const patch=records[index].output as {baseDraftHash:string;evidenceHash:string;edits:{field:string;value:unknown}[]};
  if(!patch||!same(Object.keys(patch).sort(),["baseDraftHash","edits","evidenceHash"])||patch.baseDraftHash!==audit.baseDraftHash||patch.evidenceHash!==audit.evidenceHash
    ||!Array.isArray(patch.edits)||!patch.edits.length||patch.edits.length>9||new Set(patch.edits.map(e=>e.field)).size!==patch.edits.length)return null;
  const sources=run.guidance.map(g=>{
    const h=run.graph!.retrieval.flatMap(r=>r.hits).find(h=>h.chunk.id===g.id&&h.chunk.text===g.summary);
    if(!h)throw new Error("Missing repair evidence");
    return {id:g.id,kind:h.document.kind,scope:h.document.scope,text:g.summary};
  });
  if((yield JSON.stringify(sources))!==audit.evidenceHash)return null;
  const next:Record<string,unknown>=structuredClone(draftSchema.parse(records[baseIndex].output)),changed:string[]=[],noops:string[]=[];
  const routingKeys=["disposition","reviewPriority","workType","transportIntent"];
  const routingSchema=draftSchema.pick({disposition:true,reviewPriority:true,workType:true,transportIntent:true});
  for(const edit of patch.edits){
    if(!same(Object.keys(edit).sort(),["field","value"])||!audit.allowedFields.includes(edit.field as typeof audit.allowedFields[number])
      ||!["routing","patientMessage","reason","differential","redFlags","vitalSigns","questions","evidenceLimitations","citations"].includes(edit.field))return null;
    // Validate wire values before resolving/equality, including no-op fields.
    let value=edit.value;
    if(normalizedNoops){
      const parsed=edit.field==="routing"?routingSchema.safeParse(edit.value):wireDraftSchema.shape[edit.field as keyof typeof wireDraftSchema.shape].safeParse(edit.value);
      if(!parsed.success)return null;
      value=parsed.data;
    }
    const before=edit.field==="routing"?Object.fromEntries(routingKeys.map(k=>[k,next[k]])):next[edit.field];
    const after=edit.field==="citations"?resolveSourceQuoteReferences({citations:value as {passageId:string;quoteId:string}[]},sources).citations:value;
    if(normalizedNoops?sameRepairValue(before,after):same(before,after)){
      if(normalizedNoops){noops.push(edit.field);continue;}
      if(["patientMessage","reason"].includes(edit.field)&&patch.edits.some(e=>e.field==="routing"))continue;return null;
    }
    if(edit.field==="routing"){
      if(!after||!same(Object.keys(after).sort(),[...routingKeys].sort()))return null;
      Object.assign(next,after);
    }else next[edit.field]=after;
    changed.push(edit.field);
  }
  if(normalizedNoops&&(!changed.length||!same(noops,audit.noopFields)))return null;
  if(!same(changed,audit.changedFields)||changed.includes("routing")&&!["patientMessage","reason"].every(f=>patch.edits.some(e=>e.field===f)))return null;
  const draft=draftSchema.parse(next);
  return (yield JSON.stringify(draft))===targetHash?{index,draft}:null;
}

export async function reconstructReviewedProducer(run: DispositionRun, hashes: string[], targetHash: string) {
  const steps = reconstructReviewedProducerSteps(run, hashes, targetHash);
  let state = steps.next();
  while (!state.done) state = steps.next(await digest(state.value));
  return state.value;
}

/** A pre-repair review can legitimately use a different source selection from
 * final guidance. Verify its retained packet, never substitute the later one. */
async function preservedSourceRepairBound(run: DispositionRun, patient: string, draft: ReturnType<typeof draftSchema.parse>, criticIndex: number): Promise<boolean> {
  const critic = run.agents![criticIndex], packet = critic.judgeSourceRepair?.packet;
  if (packet) {
    if (!Array.isArray(packet.units) || new Set(packet.units.map(unit => unit.id)).size !== packet.units.length) return false;
    const events = run.responseEvents ?? [], notice = events.filter(event => event.kind === "action").at(-1)?.notice ?? null;
    const questions = events.filter(event => event.kind === "intake_question");
    const expected = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) },
      ...(notice ? [{ id: "early", text: JSON.stringify({ notice, basis: run.graph!.safety?.basis }) }] : []),
      ...(questions.length ? [{ id: "issued_question", text: JSON.stringify(questions) }] : [])];
    for (const unit of packet.units.filter(unit => unit.id.startsWith("source:"))) {
      const matches = run.graph!.retrieval.flatMap(retrieval => retrieval.hits).filter(hit => unit.id === `source:${hit.chunk.id}`
        && unit.text === `${hit.document.kind}; ${hit.document.scope}; publication: ${hit.document.publicationDate ?? "unknown"}\n${hit.chunk.text}`);
      if (!matches.length || matches.some(hit => hit.chunk.hash !== matches[0].chunk.hash)
        || await digest(matches[0].chunk.text) !== matches[0].chunk.hash) return false;
      expected.push({ ...unit });
    }
    if (!sameRepairValue(packet.units, expected) || packet.hasIssuedEarlyAction !== Boolean(notice)) return false;
  }
  const steps = verifyJudgeSourceRepairBindingSteps(critic, packet);
  let state = steps.next(); while (!state.done) state = steps.next(await digest(state.value));
  return state.value;
}

/** Verify retained care provenance, NOT clinical truth or server authenticity.
 * A failed later explanation cannot rebind transport to an unreviewed draft.
 * No Mastra, Node or provider dependency is loaded into the browser.
 */
export async function verifyPreservedCare(run: DispositionRun, patient: string): Promise<boolean> {
  try {
    const graph = run.graph, proof = graph?.preservedCare, answer = run.answer;
    if (!graph || !proof || !answer || run.profile !== "evidence-graph-opus" || run.status !== "review_required"
      || run.origin !== "validation_safeguard" || run.failure === "RUN_CANCELLED" || graph.release !== "clinician_required"
      || proof.patientHash !== await digest(patient) || run.message !== patient
      || !same(run.safetyFloor, { disposition: proof.disposition, directive: proof.directive })
      || answer.disposition !== proof.disposition || answer.patientMessage !== proof.directive
      || answer.differential.length || answer.redFlags.length || answer.questions.length || answer.evidence.length
      || !proof.reviewInputBinding
      || answer.reason !== (graph.careCorrectionReleased ? PRESERVED_CARE_COPY.correctedReason : PRESERVED_CARE_COPY.reason) || answer.vitalSigns !== PRESERVED_CARE_COPY.vitalSigns
      || answer.evidenceLimitations !== PRESERVED_CARE_COPY.evidenceLimitations) return false;
    if (proof.origin === "pre_repair_review") {
      if (proof.disposition === "ASYNC_PHYSICIAN" || !graph.corrections || graph.judge !== null || graph.careCarryForward?.used !== true
        || !same({ ...proof, origin: undefined }, { ...graph.careCarryForward, used: undefined })) return false;
    } else if (proof.origin !== "current_review" || !graph.judge || await digest(JSON.stringify(graph.judge)) !== proof.judgeHash) return false;
    const records = run.agents ?? [];
    const hashes = await Promise.all(records.map(a => digest(JSON.stringify(a.output))));
    const producer = await reconstructReviewedProducer(run, hashes, proof.draftHash);
    const producerIndex = producer?.index ?? -1;
    const criticIndex = records.findIndex((a, i) => i > producerIndex && a.role === "critic" && !a.failure && hashes[i] === proof.judgeHash
      && same(a.reviewInputBinding, proof.reviewInputBinding));
    if (producerIndex < 0 || criticIndex < 0 || proof.reviewInputBinding.patientHash !== proof.patientHash
      || proof.reviewInputBinding.draftHash !== proof.draftHash || !/^[a-f0-9]{64}$/.test(proof.reviewInputBinding.packetHash)
      || records.slice(producerIndex + 1, criticIndex).some(a => a.role === "disposition")
      || records.slice(criticIndex + 1).some(a => a.role === "critic" && !a.failure && a.output)) return false;
    const draft = producer!.draft;
    if (!await preservedSourceRepairBound(run, patient, draft, criticIndex)) return false;
    const judge = records[criticIndex].output as GraphJudge;
    if (graph.careCorrectionReleased && (proof.origin !== "current_review" || judge.earlyAction !== "unsupported"
      || !judge.earlyCorrection || !judge.earlyCorrection.patientQuotes.every(q=>patient.includes(q))
      || run.reconciliation?.status !== "revised" || run.reconciliation.reason !== judge.earlyCorrection.reason
      || run.reconciliation.to.disposition !== proof.disposition || run.reconciliation.to.directive !== proof.directive)) return false;
    const { citations: _citations, transportIntent: _intent, ...base } = draft;
    const checkedDraft = { ...base, evidence: [] };
    if (!adaptiveAnswerSchema.safeParse(checkedDraft).success || !routingFieldsValid(draft) || draft.disposition !== proof.disposition
      || judge.reviewScope !== "draft-and-issued-question/v2" || judge.criteria.length !== 7
      || new Set(judge.criteria.map(c => c.id)).size !== 7 || !careCriteria.every(id => judge.criteria.find(c => c.id === id)?.verdict === "pass")) return false;
    if (proof.disposition === "ASYNC_PHYSICIAN") {
      if (!graph.careCorrectionReleased || proof.origin !== "current_review" || answer.reviewPriority !== draft.reviewPriority || answer.workType !== draft.workType
        || proof.reviewPriority !== draft.reviewPriority || proof.workType !== draft.workType) return false;
    } else if (answer.reviewPriority !== null || answer.workType !== null) return false;
    const units = [{ id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) },
      ...graph.retrieval.flatMap(r => r.hits.map(h => ({ id: `source:${h.chunk.id}`, text: `${h.document.kind}; ${h.document.scope}; publication: ${h.document.publicationDate ?? "unknown"}\n${h.chunk.text}` }))),
      { id: "issued_question", text: JSON.stringify((run.responseEvents ?? []).filter(e => e.kind === "intake_question")) }];
    if (judge.criteria.filter(c => careCriteria.includes(c.id)).some(c => !c.anchors.length
      || c.anchors.some(a => !units.some(u => u.id === a.unit && exactStructuredJudgeAnchor(u, a.quote))))) return false;
    let transport: ReviewedEmergencyTransport | undefined;
    if (draft.transportIntent) {
      const intent = draft.transportIntent, review = judge.transportReview;
      if (draft.disposition !== "EMERGENCY_NOW" || !review || review.verdict !== "supported" || review.mode !== intent.mode || !draft.patientMessage.includes(review.draftQuote)) return false;
      if (intent.mode === "continue_ems") {
        if (!intent.activationQuote || !patient.includes(intent.activationQuote) || review.activation?.quote !== intent.activationQuote
          || !review.activation.currentPatient || !review.activation.currentEpisode || !review.activation.active) return false;
      } else if (!["activate_ems", "ed_now"].includes(intent.mode) || intent.activationQuote !== null || review.activation !== null) return false;
      transport = { ...intent, directive: draft.patientMessage, review: "independent_model" };
    }
    const directive = draft.disposition === "ASYNC_PHYSICIAN" ? asyncAction(draft) : urgentCareDirective(draft.disposition, draft.patientMessage, transport);
    const rebound = transport ? { ...transport, directive: directive! } : undefined;
    const checks = checkAnswer({ ...checkedDraft, ...(transport ? { emergencyTransport: transport } : {}) }, patient, [], null);
    if (graph.careCorrectionReleased) {
      const from = run.reconciliation!.from;
      const issued = (run.responseEvents ?? []).some(e => e.kind === "action" && e.notice.disposition === from.disposition && e.notice.directive === from.directive);
      const transportOnly = reducesEmergencyTransport(from, { disposition: draft.disposition, directive: draft.patientMessage, emergencyTransport: transport });
      if (!issued || judge.verdict !== "revise"
        || !transportOnly && !["ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON"].includes(draft.disposition)
        || from.disposition !== "EMERGENCY_NOW" && draft.disposition !== "ASYNC_PHYSICIAN"
        || !transportOnly && isEmsInstruction(from.directive) && !judge.earlyCorrection!.triggerMisattributedOrCorrected
        || !["quoted_patient_evidence", "action_timing_present", "no_blanket_clearance", "no_unconfirmed_handoff"].every(id => checks.find(c => c.id === id)?.status === "pass")
        || checks.some(c => c.status === "fail" && !["citation_provenance", "research_support", "response_concision"].includes(c.id))) return false;
    }
    return directive === proof.directive && same(rebound, proof.emergencyTransport) && same(rebound, answer.emergencyTransport)
      && (!rebound || boundEmergencyTransport(rebound, directive, patient))
      && (graph.careCorrectionReleased || draft.redFlags.some(f => f.status === "reported" && f.quote.length > 2 && patient.includes(f.quote)))
      && ["quoted_patient_evidence", "action_timing_present", "no_blanket_clearance"].every(id => checks.find(c => c.id === id)?.status === "pass");
  } catch { return false; }
}
