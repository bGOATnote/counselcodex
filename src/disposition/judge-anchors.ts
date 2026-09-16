/** Exact evidence binding, not clinical entailment or fuzzy text matching. */
export function exactStructuredJudgeAnchor(unit: { id: string; text: string }, quote: string): boolean {
  if (unit.text.includes(quote)) return true;
  // Only these units are application-serialized JSON. Patient/source prose is
  // never decoded, and distinct fields are never joined into a synthetic quote.
  if (!["draft", "issued_question"].includes(unit.id)) return false;
  const contains = (value: unknown): boolean => typeof value === "string" ? value.includes(quote) : Array.isArray(value) ? value.some(contains) : value !== null && typeof value === "object" ? Object.values(value).some(contains) : false;
  try { return contains(JSON.parse(unit.text)); } catch { return false; }
}
