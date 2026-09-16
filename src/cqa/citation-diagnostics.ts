import { asOfDecision, judgmentSchema, verifyJudgment, type Episode } from "./contracts.ts";

// OFFLINE ONLY. This is a paired engineering ablation, not a runtime repair or
// clinical grader. Never add missing citations, match fuzzily, or use future
// sources. Even a successfully located quote does not establish entailment.
export function diagnoseCitations(raw: unknown, episode: Episode) {
  const judgment = judgmentSchema.parse(raw);
  const snapshot = asOfDecision(episode).episode;
  const spans = judgment.evidence.map((citation) => {
    const source = snapshot.sources.find(({ id }) => id === citation.sourceId);
    const matches: number[] = [];
    if (source) {
      let start = source.text.indexOf(citation.quote);
      // Advance one UTF-16 unit: overlapping occurrences are ambiguous too.
      while (start !== -1) {
        matches.push(start);
        start = source.text.indexOf(citation.quote, start + 1);
      }
    }
    return {
      sourceId: citation.sourceId,
      suppliedRange: [citation.start, citation.end],
      suppliedRangeValid: Boolean(source && citation.end > citation.start && citation.end <= source.text.length && source.text.slice(citation.start, citation.end) === citation.quote),
      exactMatchCount: matches.length,
      uniqueRange: matches.length === 1 ? [matches[0], matches[0] + citation.quote.length] : null,
      status: !source ? "SOURCE_NOT_AVAILABLE" : matches.length === 0 ? "QUOTE_NOT_FOUND" : matches.length > 1 ? "QUOTE_AMBIGUOUS" : "UNIQUE_EXACT_QUOTE",
    };
  });
  const verify = (candidate: unknown) => {
    try { verifyJudgment(candidate, episode); return "PROVENANCE_SPANS_VERIFIED"; }
    catch (error) { return error instanceof Error ? error.message : "INVALID"; }
  };
  const canAlign = spans.every(({ uniqueRange }) => uniqueRange !== null);
  const counterfactual = canAlign ? {
    ...judgment,
    evidence: judgment.evidence.map((citation, index) => ({ ...citation, start: spans[index].uniqueRange![0], end: spans[index].uniqueRange![1] })),
  } : null;
  return {
    version: "exact-unique-quote-diagnostic/v1", runtimeChanged: false,
    originalCode: verify(judgment), spans,
    counterfactualCode: counterfactual ? verify(counterfactual) : "ALIGNMENT_REFUSED",
    changedRanges: counterfactual ? spans.filter(({ suppliedRange, uniqueRange }) => suppliedRange[0] !== uniqueRange![0] || suppliedRange[1] !== uniqueRange![1]).length : 0,
    clinicalCorrectnessMeasured: false,
  };
}
