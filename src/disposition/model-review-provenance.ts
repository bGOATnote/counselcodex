/** Configured model identity is provenance, not proof of independent errors.
 * Provider namespaces can expose aliases or the same underlying model. */
export type ModelReviewRelationship = "same_model" | "same_provider" | "different_provider" | "unknown";
export type ModelReviewProvenance = {
  producerModel: string | null;
  reviewerModel: string | null;
  relationship: ModelReviewRelationship;
};

function modelIdentity(value: string | null | undefined) {
  return typeof value === "string" && /^[a-z][a-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._:/-]{0,150}$/.test(value) ? value : null;
}

export function modelReviewProvenance(producer: string | null | undefined, reviewer: string | null | undefined): ModelReviewProvenance {
  const producerModel = modelIdentity(producer), reviewerModel = modelIdentity(reviewer);
  const relationship: ModelReviewRelationship = !producerModel || !reviewerModel ? "unknown"
    : producerModel === reviewerModel ? "same_model"
      : producerModel.split("/", 1)[0] === reviewerModel.split("/", 1)[0] ? "same_provider" : "different_provider";
  return { producerModel, reviewerModel, relationship };
}

export function modelReviewDetail(accepted: boolean, producer: string | null | undefined, reviewer: string | null | undefined) {
  const provenance = modelReviewProvenance(producer, reviewer);
  const label = { same_model: "same model ID", same_provider: "same provider ID", different_provider: "different provider IDs", unknown: "model relationship unknown" }[provenance.relationship];
  const pair = `Producer: ${provenance.producerModel ?? "not recorded"}; reviewer: ${provenance.reviewerModel ?? "not recorded"} (${label}).`;
  return accepted
    ? `Model review accepted this draft against seven criteria. ${pair} Separate calls do not establish independent errors or clinical approval; application release checks remain separate.`
    : `No accepted model review; clinician assessment is required. ${pair}`;
}
