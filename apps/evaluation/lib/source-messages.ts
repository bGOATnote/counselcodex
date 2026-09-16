import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseCsv } from "./source-csv.ts";

// Active demo depends only on Counsel's source CSV, not old predictions,
// development adjudications or prewritten case briefs. Labels stay server-side.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sample = z.object({ id: z.string().min(1), message: z.string().min(1).max(12_000) });
export const sampleMessages = parseCsv(readFileSync(resolve(root, "data/patient_messages.csv"), "utf8")).map((row) => sample.parse(row));
