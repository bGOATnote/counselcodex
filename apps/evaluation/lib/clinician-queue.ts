import "server-only";
import { mkdirSync, lstatSync, existsSync } from "node:fs";
import { join } from "node:path";
import { repositoryRoot } from "../../../src/disposition/runtime.ts";
import { clinicianQueueStore } from "./clinician-queue-store.ts";
let store: ReturnType<typeof clinicianQueueStore> | undefined;
export function getClinicianQueue() {
  if (store) return store;
  const directory = join(repositoryRoot(), "apps/evaluation/.local/clinician-queue-v1");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, "queue.db");
  if (lstatSync(directory).isSymbolicLink() || (existsSync(path) && lstatSync(path).isSymbolicLink())) throw new Error("QUEUE_PATH_INVALID");
  store = clinicianQueueStore(path);
  return store;
}
