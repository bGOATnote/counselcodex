import { parseStoredWorkspace, stableStringify, type DatasetIdentity, type ReviewWorkspace } from "./review-state.ts";

export const CHECKPOINT_SCHEMA_VERSION = "counsel-physician-review-checkpoint/v1" as const;
export const LOCAL_BACKUP_SUFFIX = ":backup";

const INDEXED_DB_NAME = "counsel-review-durability-v1";
const INDEXED_DB_STORE = "workspaces";

export type CheckpointSource = "local-primary" | "local-backup" | "indexeddb";

export type CheckpointCandidate = {
  source: CheckpointSource;
  raw: string;
};

export type ParsedCheckpoint = CheckpointCandidate & {
  revision: number;
  writtenAt: string;
  workspace: ReviewWorkspace;
  legacy: boolean;
};

export type InvalidCheckpoint = CheckpointCandidate & {
  error: string;
};

export type StorageReadResult = {
  candidates: CheckpointCandidate[];
  errors: string[];
};

export type LocalSaveResult = {
  primarySaved: boolean;
  backupSaved: boolean;
  verified: boolean;
  conflict: boolean;
  errors: string[];
};

export type CheckpointWriteDecision = "write" | "unchanged" | "stale" | "conflict";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type CheckpointEnvelope = {
  schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
  revision: number;
  writtenAt: string;
  workspace: ReviewWorkspace;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown browser storage error";
}

function sourcePriority(source: CheckpointSource) {
  if (source === "local-primary") return 3;
  if (source === "indexeddb") return 2;
  return 1;
}

function checkpointRevision(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null || !("schemaVersion" in parsed)
    || (parsed as { schemaVersion?: unknown }).schemaVersion !== CHECKPOINT_SCHEMA_VERSION) return 0;
  const revision = (parsed as { revision?: unknown }).revision;
  if (!Number.isSafeInteger(revision) || Number(revision) < 0) throw new Error("Checkpoint revision is invalid.");
  return Number(revision);
}

export function decideCheckpointWrite(existingRaw: string, incomingRaw: string): CheckpointWriteDecision {
  if (existingRaw === incomingRaw) return "unchanged";
  const existingRevision = checkpointRevision(existingRaw);
  const incomingRevision = checkpointRevision(incomingRaw);
  if (existingRevision > incomingRevision) return "stale";
  if (existingRevision === incomingRevision) return "conflict";
  return "write";
}

export function backupStorageKey(storageKey: string) {
  return `${storageKey}${LOCAL_BACKUP_SUFFIX}`;
}

export function serializeCheckpoint(workspace: ReviewWorkspace, revision: number, writtenAt = new Date().toISOString()) {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new Error("Checkpoint revision must be a non-negative safe integer.");
  const checkpoint: CheckpointEnvelope = {
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    revision,
    writtenAt,
    workspace,
  };
  return stableStringify(checkpoint);
}

export function parseCheckpoint(
  raw: string,
  expectedDataset: DatasetIdentity,
  expectedCaseIds: string[],
  source: CheckpointSource,
): ParsedCheckpoint {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "object" && parsed !== null && "schemaVersion" in parsed
    && (parsed as { schemaVersion?: unknown }).schemaVersion === CHECKPOINT_SCHEMA_VERSION) {
    const checkpoint = parsed as Partial<CheckpointEnvelope>;
    if (!Number.isSafeInteger(checkpoint.revision) || Number(checkpoint.revision) < 0) {
      throw new Error("Checkpoint revision is invalid.");
    }
    if (typeof checkpoint.writtenAt !== "string" || Number.isNaN(Date.parse(checkpoint.writtenAt))) {
      throw new Error("Checkpoint timestamp is invalid.");
    }
    if (!checkpoint.workspace) throw new Error("Checkpoint workspace is missing.");
    return {
      source,
      raw,
      revision: Number(checkpoint.revision),
      writtenAt: checkpoint.writtenAt,
      workspace: parseStoredWorkspace(stableStringify(checkpoint.workspace), expectedDataset, expectedCaseIds),
      legacy: false,
    };
  }

  const workspace = parseStoredWorkspace(raw, expectedDataset, expectedCaseIds);
  return {
    source,
    raw,
    revision: 0,
    writtenAt: workspace.updatedAt,
    workspace,
    legacy: true,
  };
}

export function selectNewestCheckpoint(
  candidates: CheckpointCandidate[],
  expectedDataset: DatasetIdentity,
  expectedCaseIds: string[],
) {
  const valid: ParsedCheckpoint[] = [];
  const invalid: InvalidCheckpoint[] = [];

  for (const candidate of candidates) {
    try {
      valid.push(parseCheckpoint(candidate.raw, expectedDataset, expectedCaseIds, candidate.source));
    } catch (error) {
      invalid.push({ ...candidate, error: errorMessage(error) });
    }
  }

  valid.sort((left, right) => {
    if (left.revision !== right.revision) return right.revision - left.revision;
    const timestampDifference = Date.parse(right.writtenAt) - Date.parse(left.writtenAt);
    if (timestampDifference !== 0) return timestampDifference;
    return sourcePriority(right.source) - sourcePriority(left.source);
  });

  return { selected: valid[0] ?? null, valid, invalid };
}

export function readLocalCandidates(storage: StorageLike, storageKey: string): StorageReadResult {
  const candidates: CheckpointCandidate[] = [];
  const errors: string[] = [];
  const keys: Array<[CheckpointSource, string]> = [
    ["local-primary", storageKey],
    ["local-backup", backupStorageKey(storageKey)],
  ];

  for (const [source, key] of keys) {
    try {
      const raw = storage.getItem(key);
      if (raw !== null) candidates.push({ source, raw });
    } catch (error) {
      errors.push(`${source}: ${errorMessage(error)}`);
    }
  }
  return { candidates, errors };
}

export function saveLocalCheckpoint(
  storage: StorageLike,
  storageKey: string,
  raw: string,
  validateExisting: (rawValue: string) => void,
): LocalSaveResult {
  const result: LocalSaveResult = { primarySaved: false, backupSaved: false, verified: false, conflict: false, errors: [] };

  try {
    const previous = storage.getItem(storageKey);
    if (previous !== null) {
      try {
        validateExisting(previous);
        const decision = decideCheckpointWrite(previous, raw);
        if (decision === "unchanged") {
          result.primarySaved = true;
          result.verified = true;
          return result;
        }
        if (decision === "stale" || decision === "conflict") {
          result.conflict = true;
          result.errors.push(decision === "stale"
            ? "checkpoint write rejected because a newer revision already exists"
            : "checkpoint write rejected because another tab wrote a different checkpoint at the same revision");
          return result;
        }
        storage.setItem(backupStorageKey(storageKey), previous);
        result.backupSaved = true;
      } catch (error) {
        result.errors.push(`backup rotation: ${errorMessage(error)}`);
      }
    }
  } catch (error) {
    result.errors.push(`primary read: ${errorMessage(error)}`);
  }

  try {
    storage.setItem(storageKey, raw);
    result.primarySaved = true;
  } catch (error) {
    result.errors.push(`primary write: ${errorMessage(error)}`);
    return result;
  }

  try {
    result.verified = storage.getItem(storageKey) === raw;
    if (!result.verified) result.errors.push("primary read-back did not match the written checkpoint");
  } catch (error) {
    result.errors.push(`primary verification: ${errorMessage(error)}`);
  }
  return result;
}

export function clearLocalCheckpoints(storage: StorageLike, storageKey: string) {
  const errors: string[] = [];
  for (const key of [storageKey, backupStorageKey(storageKey)]) {
    try {
      storage.removeItem(key);
    } catch (error) {
      errors.push(`${key}: ${errorMessage(error)}`);
    }
  }
  return errors;
}

function openCheckpointDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser."));
      return;
    }
    const request = indexedDB.open(INDEXED_DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INDEXED_DB_STORE)) {
        request.result.createObjectStore(INDEXED_DB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
    request.onblocked = () => reject(new Error("IndexedDB upgrade was blocked by another tab."));
  });
}

export async function readIndexedCheckpoint(storageKey: string) {
  const database = await openCheckpointDatabase();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(INDEXED_DB_STORE, "readonly");
      const request = transaction.objectStore(INDEXED_DB_STORE).get(storageKey);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error ?? new Error("Could not read the IndexedDB checkpoint."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB read was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function writeIndexedCheckpoint(storageKey: string, raw: string) {
  const database = await openCheckpointDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
      const store = transaction.objectStore(INDEXED_DB_STORE);
      const request = store.get(storageKey);
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      request.onsuccess = () => {
        const existing = typeof request.result === "string" ? request.result : null;
        if (existing !== null) {
          try {
            const decision = decideCheckpointWrite(existing, raw);
            if (decision === "unchanged") return;
            if (decision === "stale" || decision === "conflict") {
              fail(new Error(decision === "stale"
                ? "IndexedDB rejected a stale checkpoint because a newer revision already exists."
                : "IndexedDB rejected a same-revision checkpoint conflict from another tab."));
              transaction.abort();
              return;
            }
          } catch {
            // A corrupt mirror is replaced by the validated in-memory checkpoint.
          }
        }
        store.put(raw, storageKey);
      };
      request.onerror = () => fail(request.error ?? new Error("Could not inspect the IndexedDB checkpoint."));
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      transaction.onerror = () => fail(transaction.error ?? new Error("Could not write the IndexedDB checkpoint."));
      transaction.onabort = () => fail(transaction.error ?? new Error("IndexedDB write was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function clearIndexedCheckpoint(storageKey: string) {
  const database = await openCheckpointDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(INDEXED_DB_STORE, "readwrite");
      transaction.objectStore(INDEXED_DB_STORE).delete(storageKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not clear the IndexedDB checkpoint."));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB clear was aborted."));
    });
  } finally {
    database.close();
  }
}

export async function withTimeout<T>(operation: Promise<T>, milliseconds: number, label: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds} ms.`)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
