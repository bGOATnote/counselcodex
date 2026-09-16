"use client";
import { ResponseReview } from "./response-review";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { CounselFlowLogo } from "./v0-workbench";
import { routePresentation, type V0Sample } from "../lib/v0-contract";
import { careTiming, type DispositionRun, type ResponseEvent, type SafetyNotice } from "../../../src/disposition/contract";
import { readDispositionStream } from "../lib/disposition-stream";
import { appendPatientUpdate, createLatestAssessment, currentIssuedCare, recordFirstResponseReceipt, retainPriorCare, priorCareUnreconciled, type ClientResponseTiming, type RetainedCare } from "../lib/latest-assessment";
import { intakeSourceIds } from "../../../src/disposition/intake";
import { legacyNotes as intakeSourceNotes } from "../../../src/evidence/legacy-notes";
import type { ClarificationReference } from "../../../src/disposition/conversation";
import { routingTiming, routingLabel } from "../../../src/disposition/routing-policy";
import { RoutingHandoff } from "./routing-handoff";

export function DispositionWorkbench({ samples, candidate = false }: { samples: V0Sample[]; candidate?: boolean }) {
  // Server-rendered controls must not accept a case change before React can
  // handle it; otherwise hydration can restore the default and submit C04.
  const [ready, setReady] = useState(false);
  useEffect(() => { setReady(true); }, []);
  const [message, setMessage] = useState(samples.find((sample) => sample.id === "C04")?.message ?? "");
  const [result, setResult] = useState<DispositionRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<SafetyNotice | null>(null);
  const [priorCare, setPriorCare] = useState<RetainedCare | null>(null);
  const [events, setEvents] = useState<ResponseEvent[]>([]);
  const [eventInput, setEventInput] = useState("");
  const pending = useRef(createLatestAssessment());
  const clarificationReference = useRef<ClarificationReference | undefined>(undefined);
  const [update, setUpdate] = useState("");
  const [clientTiming, setClientTiming] = useState<ClientResponseTiming>({});
  const current = result?.message === message ? result : null;
  const visibleEvents = eventInput === message ? events : [];
  const issuedCare = currentIssuedCare(message, current, visibleEvents, notice);
  const unreconciledPriorCare = priorCareUnreconciled(priorCare, issuedCare?.care ?? null, issuedCare?.reconciliation);
  const emergencyActive = issuedCare?.care.disposition === "EMERGENCY_NOW" || Boolean(unreconciledPriorCare && priorCare?.notice.disposition === "EMERGENCY_NOW");
  const needsAnswer = current?.status === "awaiting_input" || (!current && visibleEvents.some(event => event.kind === "intake_question" && event.decisionChanging));
  function editMessage(value: string) { pending.current.cancel(); clarificationReference.current = undefined; setBusy(false); setMessage(value); setResult(null); setNotice(null); setPriorCare(null); setEvents([]); setUpdate(""); setError(""); }
  async function assess(input = message, reference = clarificationReference.current) {
    if (!input.trim()) return;
    const request = pending.current.begin();
    const started = performance.now();
    setPriorCare(retainPriorCare(priorCare, issuedCare?.care ?? null, message, input, issuedCare?.runId, issuedCare?.reconciliation, issuedCare?.provenance));
    setBusy(true); setResult(null); setNotice(null); setEvents([]); setEventInput(input); setError(""); setClientTiming({});
    // Provider/workflow deadlines and explicit user cancellation own lifetime.
    // A second, shorter browser timer must not kill a valid reconciliation.
    try {
      const response = await fetch(candidate ? "/api/candidate" : "/api/disposition", { method: "POST", headers: { "Content-Type": "application/json", "x-counsel-review": "local-v1" }, body: JSON.stringify({ message: input, syntheticOnly: true, clarificationReference: reference }), signal: request.signal });
      if (!response.ok) throw new Error(response.status === 429 ? "Two runs are already active. Please try later." : "The assessment could not complete. No disposition has been approved.");
      const run = await readDispositionStream(response, input, (item) => { if (request.current()) setNotice(item); }, (event, timing) => {
        if (!request.current()) return;
        setEvents((previous) => [...previous, event]);
        if (event.kind === "care_revision") {
          const next = event.reconciliation.to;
          setNotice(next.disposition === "EMERGENCY_NOW" || next.disposition === "SAME_DAY_IN_PERSON" ? { disposition: next.disposition, directive: next.directive, source: "emergency_agent" } : null);
        }
        if (event.kind === "patient_reply") setClientTiming((old) => ({ ...old, replyPublishedMs: Math.round(timing.publishedAtMs - started) }));
      }, (event, receivedAtMs) => {
        if (request.current() && (event.kind === "action" || event.kind === "intake_question" || event.kind === "patient_reply")) setClientTiming((old) => recordFirstResponseReceipt(old, event.kind, receivedAtMs - started));
      });
      if (request.current()) { setResult(run); setClientTiming((old) => ({ ...old, completedMs: Math.round(performance.now() - started) })); }
    } catch (caught) { if (request.current()) setError(caught instanceof Error && caught.name === "AbortError" ? "Assessment canceled. No unfinished answer is approved; any emergency instruction still applies." : caught instanceof Error ? caught.message : "Assessment failed."); }
    finally { if (request.current()) setBusy(false); }
  }
  return <div className="v0-app">
    <header className="v0-header"><div className="flex items-center gap-4"><CounselFlowLogo /><div><h1 className="text-2xl">Disposition agent</h1><p className="mt-1 text-sm text-[#62685f]">One message. One care recommendation.</p></div></div></header>
    <main className="v0-workspace">
      <div className="v0-decision-layout"><section className="v0-panel p-6" aria-labelledby="message-heading"><h2 id="message-heading" className="mb-4 text-2xl">Patient message</h2>
        <label htmlFor="case-picker" className="text-sm">Counsel’s {samples.length} sample messages</label><select id="case-picker" disabled={!ready} value={samples.find((sample) => sample.message === message)?.id ?? ""} onChange={(event) => editMessage(samples.find((sample) => sample.id === event.target.value)?.message ?? "")} className="mb-5 mt-2 w-full rounded-lg border p-3"><option value="">New message</option>{samples.map((sample) => <option key={sample.id} value={sample.id}>{sample.id} · {sample.message.slice(0, 80)}</option>)}</select>
        <form onSubmit={(event) => { event.preventDefault(); if (ready) void assess(); }}><label htmlFor="agent-message" className="sr-only">Message to assess</label><textarea id="agent-message" disabled={!ready} rows={5} maxLength={12_000} value={message} onChange={(event) => editMessage(event.target.value)} className="w-full rounded-xl border border-[#d6d9d0] bg-[#fafaf6] p-4 leading-7" />
          <button disabled={!ready || busy || !message.trim()} className="mt-4 w-full rounded-full bg-[#243866] px-5 py-3.5 font-medium text-white disabled:opacity-50">{busy ? "Assessing…" : "Assess message"}</button>
        </form>{(current || issuedCare || unreconciledPriorCare || visibleEvents.some((event) => event.kind === "intake_question")) && <PatientUpdatePanel needsAnswer={needsAnswer} emergencyActive={emergencyActive}><form className="pt-4" onSubmit={(event) => { event.preventDefault(); try {
          const question = visibleEvents.filter((item) => item.kind === "intake_question").at(-1);
          if (question?.decisionChanging && !question.runId) throw new Error("The question could not be linked to its saved assessment. Please reassess before answering it.");
          const reference = question?.decisionChanging && question.runId ? { runId: question.runId, questionId: question.questionId } : undefined;
          const input = appendPatientUpdate(message, update);
          clarificationReference.current = reference; setMessage(input); setUpdate(""); void assess(input, reference);
        } catch (error) { setError((error as Error).message); } }}>{emergencyActive && <p className="mb-3 text-sm font-medium">Optional status update only. Follow the emergency instruction first; do not delay care to answer or wait for another response.</p>}<label htmlFor="patient-update" className="text-sm font-medium">Add an answer or a change in symptoms</label><textarea id="patient-update" rows={3} className="mt-2 w-full rounded-lg border p-3" value={update} onChange={(event) => setUpdate(event.target.value)} placeholder="Describe what is happening in a short sentence." /><button className="mt-2 rounded-full border border-[#243866] px-4 py-2" disabled={!update.trim()}>Update assessment</button><p className="mt-2 text-xs">Your original message stays in context. An update replaces the pending assessment.</p></form></PatientUpdatePanel>}{error && <p role="alert" className="mt-4 text-[#8f3028]">{error}</p>}
      </section><section className="v0-panel overflow-hidden" aria-label="System response"><div className="border-b px-6 py-4"><h2 className="text-2xl">System response</h2></div>{unreconciledPriorCare && priorCare && <RetainedCareNotice care={priorCare} />}{!current && <ProgressiveResponse events={visibleEvents} notice={notice} busy={busy} />}{busy ? <p role="status" className="p-6">{visibleEvents.length ? "Completing the assessment and supporting explanation…" : "Checking your message and care timing…"}</p> : current ? <DispositionResult result={current} clientTiming={clientTiming} /> : !notice && !priorCare && visibleEvents.length === 0 && <p className="p-6 text-[#62685f]">Choose a case or enter a message to begin.</p>}</section></div>
      <footer className="v0-footer">Research prototype · Not for patient care or an official Counsel service.{candidate && <details className="mt-2"><summary>About this prototype</summary><p className="mt-2">Evidence-graph candidate · Live model-driven routing with versioned release checks. <a className="underline" href="/">Open existing version</a></p></details>}</footer>
    </main>
  </div>;
}

export function PatientUpdatePanel({ needsAnswer, emergencyActive, children }: { needsAnswer: boolean; emergencyActive: boolean; children: ReactNode }) {
  // Optional input must not displace an issued care instruction on narrow screens.
  // The native disclosure remains keyboard accessible and can always be opened.
  return <details key={emergencyActive ? "emergency" : needsAnswer ? "clarification" : "optional"} className="mt-5 border-t pt-4" open={needsAnswer && !emergencyActive}><summary className="cursor-pointer text-sm font-medium">{needsAnswer && !emergencyActive ? "Answer the clarification question" : "Add information or changed symptoms"}</summary>{children}</details>;
}

export function RetainedCareNotice({ care }: { care: RetainedCare }) {
  return <div role="alert" className={`v0-action ${routePresentation[care.notice.disposition].tone}`} data-prior-care-run={care.runId ?? "previous-incomplete-run"} data-prior-care-origin={care.provenance?.origin ?? "legacy_notice"}><h3 className="text-xl">Earlier care instruction — retained</h3><p className="mt-3 leading-7">{care.notice.directive}</p><p className="mt-3 text-sm">Not generated by this run and not included in its response timing. This run has not reconciled a reduction in the earlier instruction; clinician review is needed before treating different advice as a correction.</p></div>;
}

export function EmergencyNotice({ notice, busy }: { notice: NonNullable<DispositionRun["safetyFloor"]> & { source?: SafetyNotice["source"] }; busy: boolean }) {
  if (notice.disposition !== "EMERGENCY_NOW" && notice.disposition !== "SAME_DAY_IN_PERSON") return null;
  return <div role="alert" className={`v0-action ${routePresentation[notice.disposition].tone}`}><h3 className="text-2xl">{notice.disposition === "EMERGENCY_NOW" ? "Emergency action now" : "In-person assessment today"}</h3><p className="mt-3 text-lg leading-7">{notice.directive}</p><p className="mt-3 text-sm">{busy ? "The clinical explanation is still being prepared. Do not wait for it to act." : "The full assessment did not finish. This care instruction still applies."}</p></div>;
}

export function ProgressiveResponse({ events, notice, busy }: { events: ResponseEvent[]; notice: SafetyNotice | null; busy: boolean }) {
  const revision = events.find(event => event.kind === "care_revision");
  if (revision?.kind === "care_revision") return <div role="status" className="p-6 leading-7"><h3 className="font-semibold">Care recommendation revised after review</h3><p className="mt-2">{revision.reconciliation.reason}</p><p className="mt-3 whitespace-pre-line">{revision.reconciliation.to.directive}</p></div>;
  const reply = events.find((event) => event.kind === "patient_reply");
  const opening = events.find((event) => event.kind === "opening");
  const question = events.filter((event) => event.kind === "intake_question").at(-1);
  const questionSources = intakeSourceNotes.filter((source) => intakeSourceIds(question?.kind === "intake_question" ? question.questionId : "").includes(source.id));
  // A newly discovered emergency immediately takes precedence over earlier prose.
  const compatible = reply?.kind === "patient_reply" && (!notice || notice.disposition === reply.disposition);
  return <>{notice && <EmergencyNotice notice={notice} busy={busy} />}{compatible ? <div className="p-6" role="status"><p className="mb-3 text-sm">{busy ? "Reply received · saving assessment" : "Incomplete assessment · this reply was not finalized"}</p><p className="whitespace-pre-line text-lg leading-7">{reply.text}</p></div> : !notice && question?.kind === "intake_question" ? <div role="status" className="p-6 leading-7"><h3 className="mb-2 font-semibold">{question.decisionChanging ? "A question that could change your care" : "A question while I assess this"}</h3><p>{question.text}</p><p className="mt-3 text-sm text-[#62685f]">{question.decisionChanging ? question.why : "The care recommendation does not wait for your answer."}</p>{question.interimInstruction && <p className="mt-3 rounded border p-3 text-sm">{question.interimInstruction}</p>}{questionSources.length > 0 && <details className="mt-2 text-sm"><summary>Why these questions?</summary>{questionSources.map((source) => <a key={source.id} className="block underline" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title}</a>)}</details>}</div> : !notice && opening?.kind === "opening" && <p role="status" className="p-6 leading-7">{opening.text}</p>}</>;
}

export function assessmentFailure(result: DispositionRun) {
  if (result.graph?.release === "clinician_required") return { title: "Clinician review required", detail: "The full response was not released after release checks. This is an unresolved assessment—not a finding that your symptoms became more urgent. I recommend review by a Counsel clinician. No request has been sent and clinician acceptance is not connected. Any care instruction above still applies." };
  if (result.failure === "ROUTING_DISAGREEMENT_UNRESOLVED") return { title: "Care recommendations need clinician review", detail: "The early screen and final assessment disagree. The proposed reduction in urgency was not released. Follow the earlier instruction until a clinician resolves the disagreement." };
  if (result.failure === "MODEL_TIMEOUT") return { title: "Model explanation timed out", detail: result.safetyFloor ? "The model did not finish its explanation within the time limit. Follow the care instruction above; do not wait for a retry." : "The model did not finish within the time limit. No care recommendation was completed. This message needs clinician assessment; retrying the model must not delay care." };
  if (result.failure === "ANSWER_SCHEMA_FAILED") return { title: "Response format could not be read", detail: "The model returned an invalid response structure. The affected fields are listed under Evaluation of this exact response. No rejected draft was released; any earlier care instruction still applies." };
  if (result.failure === "ANSWER_CONTRACT_FAILED") return { title: "Response withheld by validation", detail: "The model returned a draft, but it failed a required response check. That draft was not approved. The specific failures are listed under Evaluation of this exact response; this is not a provider-credit problem." };
  if (result.failure === "MODEL_BUDGET_EXHAUSTED") return { title: "Local demo allowance reached", detail: "The app has used its local run allowance—not necessarily your provider credit. Reconcile project spending before authorizing more runs; refreshing or buying provider credits will not reset this allowance." };
  if (result.failure === "PROVIDER_REQUEST_REJECTED" || (result.failure === "MODEL_OR_SCHEMA_FAILURE" && result.agents?.some(agent => agent.failureDetails?.httpStatus === 400))) return { title: "Model request rejected", detail: "The provider rejected the request (HTTP 400). Check the model request and output schema. This error does not establish that API credit is exhausted." };
  if (result.failure === "PROVIDER_AUTH_FAILED") return { title: "Provider authentication failed", detail: "Check the configured API key and its access permissions." };
  if (result.failure === "PROVIDER_RATE_LIMITED") return { title: "Provider request limit reached", detail: "The provider returned HTTP 429. Check its rate and usage limits before retrying; this is separate from the app’s local run allowance." };
  return { title: "Assessment unavailable", detail: "The assessment could not complete. A clinician must assess the message; any care instruction already issued still applies." };
}

function independentReviewText(graph: NonNullable<DispositionRun["graph"]>) {
  if (graph.release === "gates_only") return "Released after deterministic checks. No model judge ran; clinical correctness and claim support are not independently established.";
  if (graph.mode === "gates-release") return "The response did not satisfy release checks. No model judge ran. Any issued care instruction is preserved; clinician review is required.";
  if (graph.release === "model_reviewed") return "A separate model review accepted this response. Separate calls do not establish independent errors or clinical approval; model identities are recorded in the response checks.";
  if (graph.judge?.verdict === "accept") return "The model reviewer accepted the draft, but application checks withheld the full response. Clinician review is required; inspect the failed response checks.";
  if (!graph.judge) return "No valid model review was completed. Clinician assessment is required.";
  return "The model review did not approve release. Clinician assessment is required.";
}

export function DispositionResult({ result, clientTiming }: { result: DispositionRun; clientTiming?: ClientResponseTiming }) {
  const answer = result.answer;
  // A technical review fallback is not a model-approved clinical priority.
  // Keep independently supported care instructions, never the rejected draft.
  const withheld = result.graph?.release === "clinician_required";
  const failure = assessmentFailure(result);
  const failed = result.checks.filter((check) => check.status === "fail");
  const unassessed = result.checks.filter((check) => check.status === "not_assessed");
  const passed = result.checks.filter((check) => check.status === "pass");
  const evidenceIds = [...new Set(answer?.evidence.map(citation => citation.sourceId) ?? [])];
  const excludedSources = result.adaptive?.support?.filter((s) => s.applicability !== "applicable" && !answer?.evidence.some((c) => c.sourceId === s.sourceId)) ?? [];
  const checkList = (checks: typeof result.checks) => <ul className="mt-3 space-y-3 text-sm">{checks.map((check) => <li key={check.id}><strong>{check.id.replaceAll("_", " ")}</strong><p>{check.detail}</p></li>)}</ul>;
  function download() { const url = URL.createObjectURL(new Blob([JSON.stringify({ ...result, clientTiming }, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = `disposition-${result.runId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <div>{result.reconciliation?.status === "revised" && <aside role="status" className="border-b p-6 text-sm"><strong>Early recommendation revised after review</strong><p className="mt-2">{result.reconciliation.reason}</p></aside>}{result.status === "awaiting_input" && result.clarification ? <div role="status" className="p-6"><h3 className="text-xl">One detail before settling the recommendation</h3><p className="mt-3 text-lg">{result.clarification.question}</p><p className="mt-3 text-sm text-[#62685f]">{result.clarification.why}</p><p className="mt-3 text-sm">Answer on the left to reassess. No final disposition has been issued.</p>{result.pendingInstruction && <p className="mt-3 rounded border p-3 text-sm">{result.pendingInstruction}</p>}{result.clarification.routingConsequence && <details className="mt-3 text-sm"><summary>Why the answer could change routing</summary><p className="mt-2">These are proposed alternatives, not findings: {result.clarification.routingConsequence.alternatives.map(branch => `${branch.answer} → ${branch.route.replaceAll("_", " ")}`).join("; ")}.</p></details>}</div> : !answer ? <>{result.safetyFloor && <EmergencyNotice notice={{ ...result.safetyFloor, source: "emergency_agent" }} busy={false} />}<div role="alert" className="p-6"><h3 className="text-xl">{failure.title}</h3><p className="mt-3">{failure.detail}</p><p className="mt-3 text-sm">No completed assessment. This failure is not a low-risk disposition.</p></div></> : <>
    {withheld ? <>
      {result.safetyFloor && <EmergencyNotice notice={result.safetyFloor} busy={false} />}
      {result.graph?.careCorrectionReleased && answer.disposition !== "EMERGENCY_NOW" && answer.disposition !== "SAME_DAY_IN_PERSON" && <div role="status" className="p-6"><h3 className="text-xl">Reviewed care correction · {routingLabel(answer)}</h3><p className="mt-3">{answer.patientMessage}</p></div>}
      <div role="alert" className="p-6"><h3 className="text-xl">Clinician review required</h3><p className="mt-3">The full response was not released after release checks. This is an unresolved assessment—not a finding that your symptoms became more urgent.</p><p className="mt-3 text-sm">I recommend review by a Counsel clinician. No request has been sent and clinician acceptance is not connected. Any care instruction above still applies.</p></div>
    </> : <>
    <div className={`v0-action ${routePresentation[answer.disposition].tone}`}><h3 className="text-3xl">{routingLabel(answer)}</h3><p className="mt-2 text-sm">{routingTiming(answer, careTiming[answer.disposition])}</p><p className="mt-5 whitespace-pre-line text-lg leading-7">{answer.patientMessage}</p>{result.origin !== "agent" && <p className="mt-3 text-sm">Emergency instruction preserved; the full model explanation is unavailable.</p>}</div>
    <RoutingHandoff result={result} />
    <div className="space-y-5 p-6">
      <p className="text-sm leading-6" data-evidence-summary="true"><span className="font-medium">Evidence sources: </span>{evidenceIds.length ? evidenceIds.map((id, index) => { const source = result.guidance.find(item => item.id === id); return <span key={id}>{index > 0 && " · "}{source ? <a className="underline text-[#243866]" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title}</a> : <strong>Unrecognized citation — not verified.</strong>}</span>; }) : result.graph?.retrieval.some(r => r.hits.length > 0) ? "Evidence was retrieved, but no supported final explanation was released." : "No supporting research retrieved. This is an evidence-coverage failure."}</p>
      <details className="v0-detail" data-clinical-detail="true"><summary>Clinical detail &amp; evidence</summary><div className="mt-4 space-y-5"><section><h4 className="font-semibold">Why this route</h4><p className="mt-2 leading-7">{answer.reason}</p></section>{answer.differential.length > 0 && <section><h4 className="font-semibold">Brief differential</h4><p className="mt-2 leading-7">{answer.differential.join(" · ")}</p></section>}
      {answer.questions.length > 0 && <section><h4 className="font-semibold">Clarify next{answer.disposition === "EMERGENCY_NOW" ? " — never before emergency action" : ""}</h4><ul className="mt-2 list-disc space-y-1 pl-5">{answer.questions.map((question) => <li key={question}>{question}</li>)}</ul></section>}
      <section><h4 className="font-semibold">Evidence used</h4>{answer.evidence.length === 0 ? <p className="mt-2 text-sm">{result.graph?.retrieval.some(r => r.hits.length > 0) ? "Evidence was retrieved, but no supported final explanation was released." : "No supporting research retrieved. This is an evidence-coverage failure."}</p> : <ul className="mt-2 space-y-3">{answer.evidence.map((citation, index) => { const source = result.guidance.find((item) => item.id === citation.sourceId); return <li key={index} className="text-sm leading-6">{citation.claim}{source ? <> <a className="underline text-[#243866]" href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{source.title}</a> <span>({source.section})</span>{result.graph && <details className="mt-1"><summary>Source check and applicability</summary>{result.graph.citations?.filter(c => c.passageId === citation.sourceId).map((c, i) => <div key={i}><p>Exact passage match · {c.applicability === "uncertain" ? "applicability uncertain" : "model-assessed applicability"}</p><blockquote>{c.quote}</blockquote><p>{c.limitation}</p></div>)}<p>Snapshot integrity is checked. Link availability and currentness are separate from clinical support.</p></details>}{result.adaptive && <details className="mt-1"><summary>Source check and applicability</summary><p>{result.adaptive.evidence.passages.find((p) => p.id === citation.sourceId)?.linkStatus === "reachable" ? "Link reached during retrieval; not a clinical verification." : "Link availability unverified."}</p>{result.adaptive.support?.filter((s) => s.sourceId === citation.sourceId).map((support, i) => <div key={i}><p className="font-medium">{support.applicability === "uncertain" ? "Applicability uncertain — needs review" : support.applicability === "inapplicable" ? "Inapplicable — not supporting evidence" : "Model-assessed applicability — not independently verified"}</p><blockquote>{support.quote}</blockquote><p>{support.explanation}</p></div>)}<p>Applicability is the responding model’s assessment, not an independent grade.</p></details>}</> : <strong> Unrecognized citation — not verified.</strong>}</li>; })}</ul>}{answer.evidenceLimitations.length > 500 ? <details className="mt-2 text-sm text-[#62685f]"><summary>Evidence limitations</summary><p className="mt-2">{answer.evidenceLimitations}</p></details> : <p className="mt-2 text-sm text-[#62685f]">{answer.evidenceLimitations}</p>}</section>
      {result.graph && <p className="text-xs leading-5">Agency sources: CDC; MedlinePlus, US National Library of Medicine; National Heart, Lung, and Blood Institute, National Institutes of Health, U.S. Department of Health and Human Services. Material is available without charge on the linked agency sites. Use and links do not imply endorsement by these agencies, HHS or the United States Government.</p>}
      <section><h4 className="font-semibold">Red flags &amp; vital signs</h4><ul className="mt-4 space-y-3 text-sm">{answer.redFlags.map((flag, index) => <li key={index}><strong>{flag.status.toUpperCase()}</strong> · {flag.concern}{flag.quote && <blockquote className="mt-1 border-l-2 pl-3">“{flag.quote}”</blockquote>}</li>)}</ul><p className="mt-4 text-sm leading-6">{answer.vitalSigns}</p></section>
      </div></details>
    </div></>}</>}
    <div className="space-y-4 border-t p-6"><details className="v0-detail"><summary>Evaluation of this exact response</summary><p className="mt-3 text-sm">{failed.length ? `${failed.length} failed checks.` : "No targeted contract failures detected."} Clinical correctness and claim support still require independent assessment; this is not a clinical pass.</p>{failed.length > 0 && <section className="mt-3" aria-label="Failed response checks"><h4 className="font-semibold text-[#8f3028]">Needs correction</h4>{checkList(failed)}</section>}{unassessed.length > 0 && <section className="mt-3" aria-label="Unassessed response checks"><h4 className="font-semibold">Not yet established</h4>{checkList(unassessed)}</section>}{excludedSources.length > 0 && <details className="mt-4 text-sm"><summary>{excludedSources.length} source candidates excluded — not supporting evidence</summary>{excludedSources.map((s, i) => <div key={i}><p>{result.guidance.find((g) => g.id === s.sourceId)?.title} · {s.applicability}</p><p>{s.explanation}</p></div>)}</details>}<details className="mt-4 text-sm"><summary>{passed.length} technical checks passed — inspect</summary>{checkList(passed)}</details>{Boolean(result.responseEvents?.length) && <details className="mt-4 text-sm"><summary>Earlier messages — also part of evaluation</summary><ol className="mt-3 space-y-3">{result.responseEvents!.map((event) => <li key={event.sequence}>{((event.elapsedMs ?? 0) / 1000).toFixed(2)} s · {event.kind.replaceAll("_", " ")}<p>{event.kind === "action" ? event.notice.directive : event.kind === "care_revision" ? event.reconciliation.reason : event.text}</p></li>)}</ol></details>}</details>
      {result.graph ? <details className="v0-detail"><summary>Model review & retrieval</summary><p className="mt-3 text-sm">{independentReviewText(result.graph)}</p><ul className="mt-3 space-y-2 text-sm">{result.graph.judge?.criteria.map(c => <li key={c.id}><strong>{c.id.replaceAll("_", " ")} · {c.verdict}</strong><p>{c.reason}</p></li>)}</ul><p className="mt-3 text-sm">{result.graph.corrections} revision(s). Retrieval and corpus versions are recorded with this run.</p>{result.graph.retrieval.map((r, i) => <details key={i} className="mt-3 text-sm"><summary>{r.query} · {r.mode} · {Math.round(r.timings.totalMs)} ms</summary><p>{r.warnings.join("; ")}</p>{r.hits.map(h => <div className="mt-3" key={h.chunk.id}><a className="underline" href={h.document.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{h.document.title}</a><p>{h.document.kind} · {h.document.license} · {h.document.reviewStatus.replaceAll("_", " ")}</p><p>{h.document.scope}</p><blockquote className="mt-1 border-l-2 pl-3">{h.chunk.text}</blockquote><p className="mt-1 text-xs">Retrieved {h.document.retrievedAt.slice(0, 10)}; currentness not independently established. Exact passage hash: {h.chunk.hash}</p></div>)}</details>)}</details> : <ResponseReview key={result.runId} runId={result.runId} />}
      <details className="v0-detail"><summary>Execution details</summary><p className="mt-3 text-sm">{result.model} · {result.modelCalls} model calls · {(result.durationMs / 1000).toFixed(1)} s</p><ul className="mt-3 space-y-2 text-sm">{result.agents?.map((agent, index) => <li key={`${agent.role}-${index}`}>{agent.role}{agent.attempt ? ` · attempt ${agent.attempt.number}${agent.attempt.selected ? " · selected" : ""}` : ""} · {agent.failure === "GENERATION_SUPERSEDED" ? "cancelled after another attempt completed" : agent.failure ?? "output received"} · {agent.durationMs == null ? "duration not recorded" : `${(agent.durationMs / 1000).toFixed(2)} s`} · {agent.usage.inputTokens ?? "?"} input / {agent.usage.outputTokens ?? "?"} output tokens</li>)}</ul><ol className="mt-3 space-y-2 text-sm">{result.steps.map((step) => <li key={step.id}>{step.id} · {step.status} · {step.durationMs ?? "—"} ms</li>)}</ol><p className="mt-4 break-all text-xs">Run: {result.runId}<br />Trace: {result.traceId}<br />Trace saved: {String(result.tracePersisted)} · response saved: {String(result.artifactPersisted)}<br />Tokens: {result.usage.inputTokens ?? "unknown"} input / {result.usage.outputTokens ?? "unknown"} output<br />Answer hash: {result.answerHash ?? "no accepted answer"}</p>
      {result.graph?.contextAdmission && <p className="mt-3 text-sm">Retrieval query admission: {result.graph.contextAdmission.querySource.replaceAll("_", " ")}. {result.graph.contextAdmission.clinicalContextAccepted ? "Clinical extraction met the quotation contract; this does not establish clinical correctness." : "Clinical extraction was rejected and not passed to the disposition model. Query hints are search inputs, not accepted patient facts."}</p>}
      {result.version === "disposition-agent/v3" && <p className="text-sm">Server timing — early action: {result.firstActionMs == null ? "not emitted" : `${(result.firstActionMs / 1000).toFixed(2)} s`} · First reply: {result.firstPatientReplyMs == null ? "not emitted" : `${(result.firstPatientReplyMs / 1000).toFixed(2)} s`} · Finished: {(result.durationMs / 1000).toFixed(2)} s</p>}
      {clientTiming?.completedMs !== undefined && <p className="text-sm" data-client-timing={JSON.stringify(clientTiming)}>Browser receipt — action: {clientTiming.actionMs == null ? "not emitted" : `${(clientTiming.actionMs / 1000).toFixed(2)} s`} · question: {clientTiming.questionMs == null ? "not emitted" : `${(clientTiming.questionMs / 1000).toFixed(2)} s`} · reply: {clientTiming.replyMs == null ? "not emitted" : `${(clientTiming.replyMs / 1000).toFixed(2)} s`} · reply published after validation: {clientTiming.replyPublishedMs == null ? "not published" : `${(clientTiming.replyPublishedMs / 1000).toFixed(2)} s`} · finished: {(clientTiming.completedMs / 1000).toFixed(2)} s. Includes network/HTTP overhead; not a paint measurement.</p>}
      </details>
      {(!result.tracePersisted || !result.artifactPersisted || result.eventLogPersisted === false) && <p role="alert" className="text-sm text-[#8f3028]">Logging is incomplete. Download this run to preserve it.</p>}<button type="button" onClick={download} className="text-sm underline text-[#243866]">Download response, checks & trace identifiers</button>
    </div>
  </div>;
}
