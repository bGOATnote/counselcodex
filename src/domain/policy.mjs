import { retrievalMetadata } from "./retrieval-contract.mjs";

const GUIDELINES = Object.freeze({
  refill: { id: "demo-refill-v0", summary: "Stable refills require prescriber review but are not emergency disposition by default." },
  results: { id: "demo-results-v0", summary: "Routine result interpretation belongs on the asynchronous physician bench." },
  navigation: { id: "demo-navigation-v0", summary: "Testing and referral navigation can be handled asynchronously when no red flag is present." },
  self_care: { id: "demo-self-care-v0", summary: "Only named low-risk phenotypes may route to self-care; unknowns require physician review." },
  clinical: { id: "demo-residual-v0", summary: "Residual clinical messages default to asynchronous physician review." },
});

export function guidelineFor(intent) {
  const guideline = GUIDELINES[intent] ?? GUIDELINES.clinical;
  return {
    ...guideline,
    source: "local_demo_policy",
    retrievedAt: null,
    retrieval: retrievalMetadata(`local_demo_policy:${guideline.id}`),
  };
}
