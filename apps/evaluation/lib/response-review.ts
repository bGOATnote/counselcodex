import "server-only";
import { repositoryRoot } from "../../../src/disposition/runtime.ts";
import { createReviewService } from "../../../src/evaluation/response-review-service.ts";
const context = globalThis as typeof globalThis & { counselResponseReview?: ReturnType<typeof createReviewService> };
export function getResponseReview() { return context.counselResponseReview ??= createReviewService(repositoryRoot()); }
