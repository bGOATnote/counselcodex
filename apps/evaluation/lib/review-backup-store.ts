import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createExportEnvelope, MAX_IMPORT_BYTES, parseImportedWorkspace, parseStoredWorkspace, stableStringify, type DatasetIdentity } from "./review-state.ts";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const validId = (id: string) => /^[a-f0-9]{64}$/.test(id);
export type BackupReceipt = { id: string; savedAt: string; complete: number; started: number; attested: boolean };

// Single-user local recovery. No deletion, overwrite, cloud sync or automatic
// adoption of a competing browser's checkpoint. Not a clinical datastore.
export function reviewBackupStore(directory: string, dataset: DatasetIdentity, caseIds: string[], limits = { files: 1000, bytes: 200 * 1024 * 1024 }) {
  function entries() {
    if (!existsSync(directory)) return [];
    if (lstatSync(directory).isSymbolicLink() || !lstatSync(directory).isDirectory()) throw new Error("BACKUP_DIRECTORY_INVALID");
    return readdirSync(directory).filter((name) => /^[a-f0-9]{64}\.json$/.test(name));
  }
  function read(id: string) {
    if (!validId(id)) throw new Error("BACKUP_ID_INVALID");
    entries();
    const path = join(directory, `${id}.json`);
    if (!existsSync(path)) throw new Error("BACKUP_NOT_FOUND");
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_IMPORT_BYTES) throw new Error("BACKUP_INVALID");
    return readFileSync(path, "utf8");
  }
  async function inspect(id: string) {
    const raw = read(id);
    const workspace = await parseImportedWorkspace(raw, dataset, caseIds);
    if (sha(stableStringify(workspace)) !== id) throw new Error("BACKUP_ID_MISMATCH");
    const records = Object.values(workspace.records);
    const receipt: BackupReceipt = { id, savedAt: JSON.parse(raw).exportedAt, complete: records.filter((r) => r.completedAt).length,
      started: records.filter((r) => r.blindCommittedAt || Object.values(r.draft).some(Boolean)).length, attested: Boolean(workspace.attestation) };
    return { raw, receipt };
  }
  return {
    async save(raw: string) {
      const workspace = parseStoredWorkspace(raw, dataset, caseIds);
      const id = sha(stableStringify(workspace));
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      entries();
      if (existsSync(join(directory, `${id}.json`))) return (await inspect(id)).receipt;
      const envelope = stableStringify(await createExportEnvelope(workspace, dataset));
      if (Buffer.byteLength(envelope) > MAX_IMPORT_BYTES) throw new Error("BACKUP_TOO_LARGE");
      if (existsSync(join(directory, `${id}.json`))) return (await inspect(id)).receipt;
      // Recheck synchronously after hashing, at the publication boundary.
      entries();
      const allNames = readdirSync(directory);
      const bytes = allNames.reduce((sum, name) => sum + lstatSync(join(directory, name)).size, 0);
      if (allNames.length >= limits.files || bytes + Buffer.byteLength(envelope) > limits.bytes) throw new Error("BACKUP_CAPACITY_REACHED");
      const pending = join(directory, `${randomUUID()}.partial`);
      const fd = openSync(pending, "wx", 0o600);
      try { writeFileSync(fd, envelope); fsyncSync(fd); } finally { closeSync(fd); }
      try {
        // Atomic publication refuses replacement. Interrupted partials are
        // ignored, never offered as completed recovery copies.
        try { linkSync(pending, join(directory, `${id}.json`)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
      } finally { unlinkSync(pending); }
      const dirFd = openSync(directory, "r");
      try { fsyncSync(dirFd); } finally { closeSync(dirFd); }
      return (await inspect(id)).receipt;
    },
    async list() {
      const names = entries().sort((a, b) => lstatSync(join(directory, b)).mtimeMs - lstatSync(join(directory, a)).mtimeMs).slice(0, 20);
      const backups: BackupReceipt[] = [];
      let unreadable = 0;
      for (const name of names) {
        try { backups.push((await inspect(name.slice(0, -5))).receipt); }
        catch { unreadable++; } // Preserve damaged files for explicit recovery.
      }
      return { backups, unreadable };
    },
    async load(id: string) { return (await inspect(id)).raw; },
  };
}

export function requireLocalReviewRequest(request: Request) {
  const url = new URL(request.url);
  const allowed = new Set(["http://localhost:4120", "http://127.0.0.1:4120"]);
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (!allowed.has(url.origin) || request.headers.get("host") !== url.host
    || request.headers.get("x-counsel-review") !== "local-v1"
    || (site && site !== "same-origin") || (origin && origin !== url.origin)
    || (request.method === "POST" && origin !== url.origin)) throw new Error("LOCAL_ORIGIN_REQUIRED");
}

export async function readBoundedReviewBody(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") throw new Error("JSON_REQUIRED");
  if (Number(request.headers.get("content-length")) > MAX_IMPORT_BYTES) throw new Error("BACKUP_TOO_LARGE");
  if (!request.body) throw new Error("BODY_REQUIRED");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_IMPORT_BYTES) { await reader.cancel(); throw new Error("BACKUP_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
