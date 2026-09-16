export const RETRIEVAL_CONTRACT = Object.freeze({
  schemaVersion: "counsel-retrieval-context/v1",
  mode: "exact_policy_lookup",
  authority: "context_only",
  corpusVersion: "demo-policy-v0",
  provenanceRequired: true,
  canChangeDisposition: false,
  canDowngradeUrgency: false,
});

export function retrievalMetadata(sourceId) {
  if (typeof sourceId !== "string" || !sourceId.trim()) {
    throw new TypeError("retrieval sourceId must be a non-empty string");
  }
  return { ...RETRIEVAL_CONTRACT, sourceId };
}

export function assertContextOnlyRetrieval(guideline) {
  const metadata = guideline?.retrieval;
  const contractMatches = Object.entries(RETRIEVAL_CONTRACT).every(
    ([key, expected]) => metadata?.[key] === expected,
  );
  if (!contractMatches || typeof metadata?.sourceId !== "string" || !metadata.sourceId.trim()) {
    throw new TypeError("retrieved context must satisfy the context-only retrieval contract");
  }
  return guideline;
}
