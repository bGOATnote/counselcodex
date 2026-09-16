import { createV0Handler } from "../../../lib/v0-handler.ts";
import { runV0Message } from "../../../lib/v0-service.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const POST = createV0Handler(runV0Message);
