import { after } from "next/server";
import { getResponseReview } from "@/lib/response-review";
import { responseReviewHandlers } from "@/lib/response-review-handler";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const { GET, POST } = responseReviewHandlers(getResponseReview, after);
