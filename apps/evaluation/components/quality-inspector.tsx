"use client";

import { useState } from "react";
import Link from "next/link";
import type { Criterion, Episode } from "../../../src/cqa/contracts";
import type { AuditReport } from "../../../src/cqa/engine";

const human = (value: string) => value.replaceAll("_", " ");
const verdictClass = { PASS: "bg-[#e1f3eb] text-[#11684f]", FAIL: "bg-[#fae8e5] text-[#9b3733]", ABSTAIN: "bg-[#fff3d8] text-[#7b5719]", NOT_APPLICABLE: "bg-slate-100 text-slate-600" };
type Case = { title: string; episode: Episode; report: AuditReport };

export function QualityInspector({ cases, rubric }: { cases: Case[]; rubric: readonly Criterion[] }) {
  const [selected, setSelected] = useState(0);
  const [citation, setCitation] = useState<{ sourceId: string; start: number; end: number } | null>(null);
  const current = cases[selected];
  if (!current) return <main className="p-8"><h1>Quality audit unavailable</h1><p>Regenerate the synthetic research demo before inspection.</p><Link href="/">Return to disposition review</Link></main>;
  const { episode, report } = current;
  const cutoff = Date.parse(episode.decisionAt);
  return <main className="min-h-screen">
    <header className="border-b border-[#dfe7e3] bg-white px-5 py-5 sm:px-8">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
        <div><p className="text-sm font-semibold text-[#41605d]">Counselcodex · research workbench</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Clinical quality, with the evidence attached</h1></div>
        <Link href="/" className="rounded-lg border border-[#dfe7e3] px-4 py-2 text-sm font-semibold hover:bg-[#f6f8f5] focus-visible:outline-2">Disposition review ↗</Link>
      </div>
    </header>
    <div className="border-b border-[#ead39e] bg-[#fff3d8] px-5 py-3 text-sm leading-relaxed text-[#684d20] sm:px-8" role="note">
      Scripted synthetic demonstration · No provider calls or measured clinical accuracy. Findings require physician review; this system takes no patient action.
    </div>
    <div className="mx-auto grid max-w-[1664px] gap-6 p-5 sm:p-8 xl:grid-cols-[270px_minmax(0,1fr)]">
      <label className="block text-sm font-semibold text-[#41605d] xl:hidden">Synthetic audit case
        <select aria-label="Synthetic audit case" value={selected} onChange={(event) => { setSelected(Number(event.target.value)); setCitation(null); }} className="mt-2 w-full rounded-lg border border-[#dfe7e3] bg-white p-3 text-base text-[#102f2d]">
          {cases.map((item, index) => <option key={item.episode.episodeId} value={index}>{item.episode.episodeId} · {item.title}</option>)}
        </select>
      </label>
      <nav aria-label="Synthetic audit cases" className="hidden space-y-2 xl:block">
        <p className="mb-3 text-sm font-semibold text-[#41605d]">Eight failure-focused examples</p>
        {cases.map((item, index) => <button key={item.episode.episodeId} aria-current={selected === index ? "true" : undefined} onClick={() => { setSelected(index); setCitation(null); }} className={`w-full rounded-xl border p-4 text-left transition-colors ${selected === index ? "border-[#167a61] bg-[#102f2d] text-white" : "border-[#dfe7e3] bg-white hover:border-[#167a61]"}`}>
          <span className={`block text-xs font-semibold ${selected === index ? "text-[#acd0c5]" : "text-[#41605d]"}`}>{item.episode.episodeId}</span>
          <span className="mt-1 block text-sm leading-relaxed">{item.title}</span>
        </button>)}
      </nav>
      <section aria-label="Selected audit" className="min-w-0">
        <div className="mb-5 rounded-xl border border-[#dfe7e3] bg-white p-5">
          <p className="text-sm font-medium capitalize text-[#41605d]">{human(report.triage)}</p>
          <h2 className="mt-1 text-xl font-semibold">{current.title}</h2>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <div><dt className="text-[#41605d]">Decision cutoff · UTC</dt><dd className="mt-1 font-mono">{new Date(episode.decisionAt).toISOString().replace("T", " ").replace(".000Z", "")}</dd></div>
            <div><dt className="text-[#41605d]">Record</dt><dd className="mt-1 capitalize">{episode.recordCompleteness} · revision {episode.revision}</dd></div>
            <div><dt className="text-[#41605d]">Excluded future sources</dt><dd className="mt-1 font-semibold">{report.excludedFutureSources}</dd></div>
          </dl>
          <a href="#finding-heading" className="mt-4 inline-block text-sm font-semibold text-[#0f5948] underline underline-offset-4">Inspect findings · {report.counts.fail} flagged · {report.counts.abstain} abstained ↓</a>
        </div>
        <div className="grid items-start gap-5 2xl:grid-cols-2">
          <section aria-labelledby="source-heading" className="min-w-0 rounded-xl border border-[#dfe7e3] bg-white p-5">
            <h3 id="source-heading" className="text-lg font-semibold">Decision-time record</h3>
            <p className="mt-1 text-sm leading-relaxed text-[#41605d]">Later information remains visible here but is withheld from every judge. Select a citation to inspect its exact span.</p>
            <div className="mt-5 space-y-4">
              {episode.sources.map((source) => {
                const excluded = Date.parse(source.occurredAt) > cutoff || Date.parse(source.availableAt) > cutoff;
                const focused = citation?.sourceId === source.id;
                return <article tabIndex={-1} id={`source-${source.id}`} key={source.id} className={`scroll-mt-5 rounded-lg border-l-4 p-4 ${excluded ? "border-slate-300 bg-slate-100" : focused ? "border-[#167a61] bg-[#e1f3eb]" : "border-[#dfe7e3] bg-[#f6f8f5]"}`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#41605d]"><span>{human(source.kind)}</span><span>· {source.id}</span>{source.id === episode.decisionSourceId && <span className="rounded bg-[#102f2d] px-2 py-1 text-white">Decision under review</span>}{excluded && <span className="rounded bg-slate-700 px-2 py-1 text-white">Excluded: after cutoff</span>}</div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-base leading-relaxed">{focused && citation ? <>{source.text.slice(0, citation.start)}<mark className="bg-[#b7e2cf] text-[#102f2d]">{source.text.slice(citation.start, citation.end)}</mark>{source.text.slice(citation.end)}</> : source.text}</p>
                  <p className="mt-3 text-xs leading-relaxed text-[#41605d]">Occurred {source.occurredAt} · available {source.availableAt}{source.kind === "order" ? ` · ${source.orderStatus}` : ""}</p>
                </article>;
              })}
            </div>
          </section>
          <section aria-labelledby="finding-heading" className="min-w-0">
            <h3 id="finding-heading" className="mb-3 text-lg font-semibold">Five independent criteria</h3>
            <div className="space-y-3">
              {report.findings.map((finding) => {
                const criterion = rubric.find(({ id }) => id === finding.criterionId)!;
                return <article key={finding.criterionId} className="rounded-xl border border-[#dfe7e3] bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3"><h4 className="max-w-[28rem] font-semibold">{criterion.title}</h4><span className={`rounded-md px-2 py-1 text-xs font-bold ${verdictClass[finding.verdict]}`}>{human(finding.verdict)}</span></div>
                  <p className="mt-3 text-sm leading-relaxed text-[#41605d]">{finding.rationale}</p>
                  {finding.evidence.length > 0 && <div className="mt-3 flex flex-wrap gap-2" aria-label="Finding citations">{finding.evidence.map((evidence, index) => <a key={`${evidence.sourceId}-${index}`} href={`#source-${evidence.sourceId}`} onClick={() => setCitation(evidence)} className="rounded-md border border-[#bad5c9] px-2 py-1 text-sm font-medium text-[#0f5948] underline decoration-[#bad5c9] underline-offset-4 focus-visible:outline-2">{evidence.sourceId} [{evidence.start}:{evidence.end}]</a>)}</div>}
                  {finding.missingInformation.length > 0 && <p className="mt-3 text-sm leading-relaxed text-[#7b5719]">Review needed: {finding.missingInformation.join(" · ")}</p>}
                  <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium text-[#41605d]">Criterion and provenance</summary><p className="mt-3 whitespace-pre-wrap leading-relaxed">{criterion.instruction}</p><p className="mt-3 break-all font-mono text-xs">{finding.code} · {finding.model ?? "deterministic eligibility"}</p><div className="mt-3 flex flex-wrap gap-3">{criterion.references.map((href, index) => <a key={href} href={href} target="_blank" rel="noreferrer" className="text-[#0f5948] underline">Source {index + 1} ↗</a>)}</div></details>
                </article>;
              })}
            </div>
          </section>
        </div>
        <p className="mt-5 break-all text-xs leading-relaxed text-[#41605d]">Input SHA-256 {report.inputSha256}<br />Rubric {report.rubricVersion} · {report.rubricSha256}</p>
      </section>
    </div>
  </main>;
}
