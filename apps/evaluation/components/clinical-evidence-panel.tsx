import type { EvidencePacket } from "../lib/evidence-contract.ts";

export function ClinicalEvidencePanel({ packet, revealed, context = "comparison", compact = false }: { packet?: EvidencePacket | null; revealed: boolean; context?: "comparison" | "demo"; compact?: boolean }) {
  if (!revealed) return null;
  if (!packet) return <p className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">No case-bound clinical evidence brief is available. Do not infer that this response has been source-checked.</p>;
  return <section aria-label="Clinical research support" className="mt-5 rounded-2xl border border-[#bcd7cd] bg-white p-5">
    <p className="text-xs font-bold uppercase tracking-wider text-[#5c7b72]">Research support · not part of the scored V0 response</p>
    <h3 className="mt-2 text-lg font-semibold">{packet.differential.length ? "Brief differential" : "Clinical review focus"}</h3>
    {packet.differential.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-base leading-6">{packet.differential.map((item) => <li key={item}>{item}</li>)}</ul>}
    <p className="mt-3 text-base leading-7 text-[#365651]">{packet.decisionPoint}</p>
    <p className="mt-3 text-sm leading-6 text-[#667d75]">{compact ? "Project-authored research, not a diagnosis or V0 reasoning." : "Project-authored clinical inference for physician review—not a confirmed diagnosis, an adjudicated reference or evidence that V0 reasoned this way. Sources inform this brief; they do not independently validate the proposed route."}</p>
    {compact && <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">{packet.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="font-semibold text-[#146d59] underline underline-offset-4">{source.publisher} ↗</a>)}</div>}
    <details open={!compact || undefined} className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-[#62786f]">Source details, link checks and provenance</summary>
    <ul className="mt-4 space-y-3 border-t border-[#deebe4] pt-4">{packet.sources.map((source) => {
      const check = source.linkCheck;
      const reachable = check?.status.startsWith("reachable_");
      return <li key={source.id} className="text-sm leading-6">
        <a href={source.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="font-semibold text-[#146d59] underline underline-offset-4">{source.title} ↗</a>
        <p className="text-[#62786f]">{source.publisher} · {source.kind} · {source.publication}</p>
        <p className={reachable ? "text-[#62786f]" : "font-medium text-[#8b5a1e]"}>{check ? `${reachable ? "HTTP reachable; content/claim support not automatically verified" : `Link check: ${check.status.replaceAll("_", " ")}`} · ${check.checkedAt.slice(0, 10)}${check.httpStatus ? ` · HTTP ${check.httpStatus}` : ""}` : "Link not checked for this catalog version"}</p>
        <details><summary className="cursor-pointer text-xs text-[#62786f]">Review scope and provenance</summary><p className="mt-1">{source.accessScope}. Research review: {source.reviewedAt}. A check is a point-in-time observation, not a guarantee of future access or source currency.</p></details>
      </li>;
    })}</ul>
    <p className="mt-4 break-all text-xs text-[#71867d]">{packet.version} · catalog {packet.catalogHash.slice(0, 12)} · link report {packet.reportHash?.slice(0, 12) ?? "unavailable"}. {context === "comparison" ? "New comparison exports record this context, not an assertion that you read or endorsed every source." : "This demo does not record a clinician review or source endorsement."}</p>
    </details>
  </section>;
}
