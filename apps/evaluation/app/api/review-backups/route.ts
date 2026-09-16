import { resolve } from "node:path";
import { dataset, evaluationCases } from "../../../lib/cases.ts";
import { reviewBackupStore } from "../../../lib/review-backup-store.ts";
import { createReviewBackupHandler } from "../../../lib/review-backup-handler.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const store = reviewBackupStore(resolve(process.cwd(), ".local/review-backups"), dataset, evaluationCases.map(({ id }) => id));
const handle = createReviewBackupHandler(store);
export const GET = handle;
export const POST = handle;
