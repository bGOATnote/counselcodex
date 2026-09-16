import { executeStripped } from "../../../../../src/stripped/service.ts";
import { createStrippedHandler } from "../../../lib/stripped-handler.ts";

export const runtime = "nodejs";
export const maxDuration = 200;
export const POST = createStrippedHandler(executeStripped);
