// Models select source spans; they do not retype source quotations. The full
// passage stays available to the reviewer, including contextual qualifiers.
export function quoteSpans(text: string) {
  const spans: { id: string; start: number; end: number; text: string }[] = [];
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const sentence of segmenter.segment(text)) {
    let start = sentence.index, end = start + sentence.segment.length;
    while (start < end) {
      let stop = Math.min(end, start + 580);
      if (stop < end) {
        const space = text.lastIndexOf(" ", stop);
        if (space > start + 100) stop = space;
      }
      const piece = text.slice(start, stop), clean = piece.trim();
      if (clean.length > 0) {
        const left = start + piece.indexOf(clean);
        spans.push({ id: `q${spans.length}`, start: left, end: left + clean.length, text: clean });
      }
      start = stop;
    }
  }
  return spans;
}
export function sourceWithQuoteSpans(source: { id: string; text: string; [key: string]: unknown }) {
  const { text, ...metadata } = source;
  return { ...metadata, quoteSpans: quoteSpans(text).map(s => ({ ...s, selectable: s.text.length >= 10 })) };
}
export function resolveSourceQuoteReferences<T extends { citations: { passageId: string; quoteId: string; [key: string]: unknown }[] }>(wire: T, sources: { id: string; text: string }[]) {
  return { ...wire, citations: wire.citations.map(c => {
    const source = sources.find(s => s.id === c.passageId);
    const span = source && quoteSpans(source.text).find(s => s.id === c.quoteId);
    if (!source || !span || span.text.length < 10 || source.text.slice(span.start, span.end) !== span.text) throw new Error("INVALID_SOURCE_QUOTE_REFERENCE");
    const { quoteId: _quoteId, ...rest } = c;
    return { ...rest, quote: span.text };
  }) };
}
