// Build display context from recorded submissions, not from an LLM summary or
// a delimiter found inside arbitrary patient text. Original records stay intact.
export type ThreadContext = { original: string; updates: string[]; verified: boolean };
export const UPDATE_PREFIX = "\n\nAdditional patient information: ";
export function recordedThreadContext(messages: string[], current: string): ThreadContext {
  const first = messages[0];
  if (!first) return { original: current, updates: [], verified: false };
  const updates: string[] = [];
  let previous = first;
  for (const message of messages.slice(1)) {
    if (message === previous) continue;
    if (!message.startsWith(previous + UPDATE_PREFIX)) return { original: current, updates: [], verified: false };
    updates.push(message.slice((previous + UPDATE_PREFIX).length));
    previous = message;
  }
  return previous === current ? { original: first, updates, verified: true } : { original: current, updates: [], verified: false };
}

// Explicit provenance for our recorded browser rehearsal, never inferred from
// symptoms or applied to the user's own reviews. See the dated build report.
export const recordedRehearsals: Record<string, string> = {
  "b47d5d87-e601-46f1-a297-983c44097f30": "Engineering test: standard-async finasteride; simulated response and follow-up lifecycle, no clinical care or outreach",
  "f05a589e-a66c-4b7d-af79-7e0593731c9e": "Engineering test: migraine followed by new weakness and slurred speech",
  "12ab1fa3-f984-4f5f-b233-4c6b73d8bc18": "Engineering test: original migraine refill",
  "3b535d16-1186-48b2-bf64-30323cd3f318": "Engineering test: albuterol with added history",
  "b7d5cd69-e68a-4557-8cdc-6737e295cccb": "Engineering test: migraine followed by new weakness and slurred speech; independent-review rehearsal",
};
