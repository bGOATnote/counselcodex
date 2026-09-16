import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { createReviewPacket } from "./response-review.ts";
import { createResponseReviewer } from "./response-review-runtime.ts";
import { responseReviewStore } from "./response-review-store.ts";
import type { DispositionRun } from "../disposition/contract.ts";

export function createReviewService(root: string) {
  const directory = join(root, "apps/evaluation/.local/response-review-v1");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "reviews.db");
  if (lstatSync(directory).isSymbolicLink() || (existsSync(path) && lstatSync(path).isSymbolicLink())) throw new Error("REVIEW_PATH_INVALID");
  const store = responseReviewStore(path);
  store.interruptExpired();
  let reviewer: ReturnType<typeof createResponseReviewer> | undefined;
  return {
    store,
    enqueue(run: DispositionRun) { return store.enqueue(createReviewPacket(run)); },
    loadRun(id: string): DispositionRun {
      if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("RUN_ID_INVALID");
      const file = join(root, "apps/evaluation/.local/disposition-agent-v3/runs", `${id}.json`);
      const stat = lstatSync(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1_000_000) throw new Error("RUN_ARTIFACT_INVALID");
      const run = JSON.parse(readFileSync(file, "utf8"));
      if (run.runId !== id) throw new Error("RUN_ID_MISMATCH");
      return run;
    },
    async process(id: string) {
      if (!process.env.OPENAI_API_KEY) {
        const envPath = join(root, ".env");
        if (existsSync(envPath)) process.env.OPENAI_API_KEY = parseEnv(readFileSync(envPath, "utf8")).OPENAI_API_KEY;
      }
      if (!process.env.OPENAI_API_KEY) { store.pendingError(id, "REVIEW_PROVIDER_NOT_CONFIGURED"); throw new Error("REVIEW_PROVIDER_NOT_CONFIGURED"); }
      let packet;
      try { packet = store.claim(id); } catch (error) { store.pendingError(id, (error as Error).message); throw error; }
      if (!packet) return;
      try {
        reviewer ??= createResponseReviewer(directory);
        store.finish(id, await reviewer(packet));
      } catch { store.finish(id, null, "INDEPENDENT_REVIEW_FAILED"); }
    },
  };
}
