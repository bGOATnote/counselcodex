"use client";

import { useRef, useState } from "react";
import { currentV0Run, routePresentation, type V0Run, type V0Sample } from "../lib/v0-contract";
import { ClinicalEvidencePanel } from "./clinical-evidence-panel";
import { ResponseSafetyPanel } from "./response-safety-panel";

const stepNames: Record<string, string> = { "red-flag-checklist": "Emergency & same-day screen", "intent-history": "Intent & history", "hard-escalation-gate": "Escalation gate", "disposition-router": "Disposition router" };

export function V0Workbench({ samples }: { samples: V0Sample[] }) {
  const initial = samples.find(({ id }) => id === "C02") ?? samples[0];
  const [message, setMessage] = useState(initial?.message ?? "");
  const [selected, setSelected] = useState(initial?.id ?? "");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<V0Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const current = currentV0Run(result, message);
  const shown = samples.filter((sample) => `${sample.id} ${sample.message}`.toLowerCase().includes(query.toLowerCase()));

  function load(sample?: V0Sample) { setSelected(sample?.id ?? ""); setMessage(sample?.message ?? ""); setError(""); setResult(null); }
  async function run() {
    if (pending.current || !message.trim()) return;
    pending.current = true; setBusy(true); setError(""); setResult(null);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/v0", { method: "POST", headers: { "Content-Type": "application/json", "x-counsel-review": "local-v1" }, body: JSON.stringify({ message, syntheticOnly: true }), signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 429 ? "Another run is in progress. Please try again in a moment." : "The workflow could not complete. Your message is still here; try again.");
      const next = await response.json() as V0Run;
      if (next.version !== "v0-gui/v1" || next.message !== message || !routePresentation[next.route?.disposition]) throw new Error("The workflow returned an unexpected result. Please run again.");
      setResult(next);
    } catch (caught) { setError(caught instanceof Error && caught.name === "AbortError" ? "The run timed out. Your message has been kept; you can try again." : caught instanceof Error ? caught.message : "The workflow could not complete."); }
    finally { clearTimeout(timer); pending.current = false; setBusy(false); }
  }

  return <div className="v0-app">
    <header className="v0-header">
      <div className="flex items-center gap-4"><CounselFlowLogo /><div><h1 className="text-2xl">Disposition</h1><p className="mt-1 text-sm text-[#62685f]">V0 · rules-based Mastra workflow</p></div></div>
      <nav aria-label="Workspace" className="flex flex-wrap gap-5 text-sm"><span aria-current="page" className="font-semibold text-[#243866]">Live demo</span><a href="/">Case review</a><a href="/quality">Quality audit</a></nav>
    </header>
    <main className="v0-workspace">
      <p className="v0-notice">Synthetic demo only · Not validated for patient care · No model calls</p>
      <div className="v0-decision-layout">
        <section className="v0-panel p-5 sm:p-6" aria-labelledby="v0-message-heading">
          <div className="mb-4 flex items-center justify-between gap-3"><h2 id="v0-message-heading" className="text-2xl">Patient message</h2><button type="button" disabled={busy} onClick={() => load()} className="text-sm text-[#243866] underline underline-offset-4">New message</button></div>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Demo cases">{[["C02", "Chest pressure"], ["C04", "Foot wound"], ["C06", "Refill"], ["C01", "Cold symptoms"]].map(([id, label]) => {
            const sample = samples.find((item) => item.id === id);
            return sample && <button key={id} type="button" disabled={busy} aria-pressed={selected === id} onClick={() => load(sample)} className={`v0-case-chip ${selected === id ? "is-selected" : ""}`}>{id} · {label}</button>;
          })}</div>
          <details className="v0-sample-browser mb-5">
            <summary className="text-sm text-[#243866]">Browse all {samples.length} cases</summary>
            <label htmlFor="sample-search" className="sr-only">Find a sample</label><input id="sample-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find case or symptom" className="my-3 w-full rounded-lg border border-[#dcdcd4] bg-transparent px-3 py-2 text-sm" />
            <div className="max-h-48 overflow-y-auto">{shown.length === 0 && <p className="p-3 text-sm">No matching samples.</p>}{shown.map((sample) => <button key={sample.id} type="button" disabled={busy} aria-pressed={selected === sample.id} onClick={(event) => { load(sample); event.currentTarget.closest("details")?.removeAttribute("open"); }} className={`block w-full rounded-lg px-3 py-2 text-left text-sm leading-6 ${selected === sample.id ? "bg-[#e6edf7]" : "hover:bg-[#f6f4ed]"}`}><span className="font-semibold">{sample.id}</span> · {sample.message}</button>)}</div>
          </details>
          <form onSubmit={(event) => { event.preventDefault(); void run(); }}>
            <label htmlFor="v0-message" className="sr-only">Patient message</label>
            <textarea id="v0-message" value={message} disabled={busy} maxLength={12_000} onChange={(event) => { setMessage(event.target.value); setSelected(""); setError(""); }} rows={7} placeholder="Describe a fictional presentation…" className="min-h-48 w-full resize-y rounded-xl border border-[#d6d9d0] bg-[#fafaf6] p-4 text-base leading-7" />
            <div className="mb-5 mt-2 flex justify-between gap-3 text-xs text-[#62685f]"><span>No patient identifiers. Draft clears on reload.</span><span>{message.length.toLocaleString()} / 12,000</span></div>
            <button type="submit" disabled={busy || !message.trim()} className="w-full rounded-full bg-[#243866] px-5 py-3.5 font-medium text-white hover:bg-[#304b82]">{busy ? "Assessing…" : "Assess message"}</button>
            {error && <p role="alert" className="mt-4 rounded-lg border border-[#dfb5ae] bg-[#fff0eb] p-3 text-sm text-[#8f3028]">{error}</p>}
          </form>
          <p className="mt-4 text-xs leading-5 text-[#62685f]">Local execution. Nothing is sent to a patient or added to your reviews.</p>
        </section>
        <section aria-label="Workflow result" aria-busy={busy} className="min-w-0">
          <div className="v0-panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[#e4e2d9] px-5 py-4"><h2 className="text-2xl">Next step</h2><span role="status" className="text-sm text-[#62685f]">{busy ? "Assessing" : current ? "Complete" : error ? "Run failed" : result ? "Message changed" : "Ready"}</span></div>
            {!current || busy ? <div className="p-6 text-base leading-7 text-[#62685f]"><p>{busy ? "Running the routing workflow…" : error ? "No result from this run. Try again." : result ? "Assess the updated message to see a new decision." : "Choose a case, then assess the message."}</p></div> : <V0Result result={current} />}
          </div>
        </section>
      </div>
      <footer className="v0-footer">Independent take-home prototype · Not a Counsel service or endorsement. Counsel name and logo belong to their owner.</footer>
    </main>
  </div>;
}

export function CounselFlowLogo() {
  return <div className="counsel-flow-brand">
    <span className="counsel-c-art">
      <img src="/counsel-symbol.svg" width="50" height="51" alt="Counsel C symbol" />
    </span>
  </div>;
}

export function V0Decision({ result }: { result: V0Run }) {
  return <section aria-label="Routing rationale"><h3 className="text-sm font-semibold text-[#243866]">Why this route</h3><p className="mt-2 text-base leading-7 text-[#535d55]">{result.route.rationale}</p>{result.route.questions.length > 0 && <div className="mt-4"><h3 className="text-sm font-semibold text-[#243866]">Clarify next{result.route.disposition === "EMERGENCY_NOW" ? " · do not delay emergency action" : ""}</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-base leading-7">{result.route.questions.map((question) => <li key={question}>{question}</li>)}</ul></div>}</section>;
}

export function V0ClinicalBrief({ result }: { result: V0Run }) {
  const packet = result.clinicalEvidence;
  if (!packet) return <p className="text-sm leading-6 text-[#62685f]">No case-bound differential for this message. V0 does not generate one.</p>;
  return <section aria-label="Brief clinical context">
    <h3 className="text-sm font-semibold text-[#243866]">{packet.differential.length ? "Consider" : "Review focus"} <span className="font-normal text-[#62685f]">· curated research, not V0 reasoning</span></h3>
    {packet.differential.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-base leading-6">{packet.differential.map((item) => <li key={item}>{item}</li>)}</ul>}
    <p className="mt-2 text-sm leading-6 text-[#535d55]">{packet.decisionPoint}</p>
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">{packet.sources.map((source) => <li key={source.id}><a href={source.url} title={source.title} aria-label={source.title} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="text-[#243866] underline underline-offset-4">{source.publisher}</a><span className="ml-1 text-[#62685f]">· {source.linkCheck?.status.startsWith("reachable_") ? "link checked" : source.linkCheck ? "access unverified" : "not checked"}</span></li>)}</ul>
    <p className="mt-2 text-xs leading-5 text-[#62685f]">Links are point-in-time checks, not verification of these clinical claims. Full titles, dates and limitations below.</p>
  </section>;
}

export function V0Result({ result }: { result: V0Run }) {
  const route = routePresentation[result.route.disposition];
  const mentioned = result.safetyReview.vitalSigns.filter((vital) => vital.status === "reported_requires_interpretation").map((vital) => vital.label);
  return <div className="v0-answer">
    <section aria-label="Action and timing" className={`v0-action ${route.tone}`}><h2 className="text-3xl">{route.title}</h2><p className="mt-1 text-sm">{route.timing}</p><p className="mt-4 text-lg leading-7">{result.route.patientDirective}</p><p className="mt-3 text-xs">Exact V0 instruction · not sent to a patient</p></section>
    <div className="space-y-5 p-5 sm:p-6">
      <V0Decision result={result} />
      <V0ClinicalBrief result={result} />
      <p className="border-l-2 border-[#c5a062] pl-3 text-sm leading-6 text-[#685332]">Safety is not established by this limited screen. {mentioned.length ? `Vital mentions to verify: ${mentioned.join(", ")}.` : "No numeric vital readings extracted."}{result.route.disposition === "EMERGENCY_NOW" ? " Do not delay emergency action to obtain readings." : ""}</p>
      <details className="v0-detail"><summary>Safety & sources</summary><ResponseSafetyPanel review={result.safetyReview} revealed /><ClinicalEvidencePanel packet={result.clinicalEvidence} revealed context="demo" /></details>
      <details className="v0-detail"><summary>Execution details <span className="ml-2 font-normal text-[#62685f]">{result.durationMs} ms · {result.modelCalls} model calls</span></summary><div className="pt-4"><p className="mb-3 text-sm">{result.route.locked ? "Escalation locked · downgrade blocked" : "No escalation lock"}</p><V0Execution result={result} /></div></details>
    </div>
  </div>;
}

export function V0Execution({ result }: { result: V0Run }) {
  return <><p className="mb-5 text-base leading-7 text-[#666d66]">Observed steps from this Mastra execution. The first two branches run in parallel; step timing is measured, not simulated.</p><ol className="space-y-3">{result.steps.map((step, index) => <li key={step.id} className="flex items-start gap-3 rounded-xl border border-[#e0e2d9] p-4"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e6edf7] text-sm text-[#243866]">{index + 1}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{stepNames[step.id] ?? step.id}</p><p className="mt-1 text-xs text-[#687466]">{step.status} · {step.durationMs === null ? "timing unavailable" : `${step.durationMs} ms`}</p></div></li>)}</ol><dl className="mt-6 space-y-3 break-all text-sm"><div><dt className="text-[#757a70]">Workflow</dt><dd>{result.workflowId}</dd></div><div><dt className="text-[#757a70]">Run ID</dt><dd>{result.runId}</dd></div><div><dt className="text-[#757a70]">Completed</dt><dd>{result.completedAt}</dd></div></dl><p className="mt-5 text-sm leading-6 text-[#687466]">This demo returns an ephemeral execution receipt. It does not persist clinical payloads or write to the adjudication store.</p></>;
}
