import { createHash } from "node:crypto";
import { z } from "zod";
import type { ClinicalDocument } from "./model.ts";

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export const LOCAL_QUARANTINE_VERSION = "local-evidence-quarantine/v1";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const httpsUrl = z.url().refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password && !url.port;
}, "An HTTPS source URL without credentials or a custom port is required");
const identitySchema = z.object({
  documentId: z.string().trim().min(3), sourceVersion: z.string().trim().min(3), rawHash: hash,
}).strict();
export const quarantineEntrySchema = identitySchema.extend({
  status: z.literal("quarantined"),
  reasonCode: z.literal("engineering_source_discrepancy"),
  reason: z.string().trim().min(20),
  sourceUrl: httpsUrl,
  reviewedAgainst: z.array(httpsUrl).min(1),
}).strict();
export const localQuarantineManifestSchema = z.object({
  version: z.literal(LOCAL_QUARANTINE_VERSION),
  recordedOn: z.iso.date(),
  authority: z.object({
    kind: z.literal("engineering_source_review"),
    clinicalApproval: z.literal(false),
    publisherRetraction: z.literal(false),
  }).strict(),
  scope: z.string().trim().min(20),
  entries: z.array(quarantineEntrySchema).min(1),
}).strict();
export type LocalQuarantineManifest = z.infer<typeof localQuarantineManifestSchema>;
export type QuarantineEntry = z.infer<typeof quarantineEntrySchema>;

export function validateLocalQuarantineManifest(raw: unknown): LocalQuarantineManifest {
  const manifest = localQuarantineManifestSchema.parse(raw);
  if (new Set(manifest.entries.map(entry => entry.documentId)).size !== manifest.entries.length) {
    throw new Error("DUPLICATE_QUARANTINE_DOCUMENT");
  }
  return manifest;
}

// The hash binds policy content, not JSON whitespace/key order or entry order.
// It establishes policy identity, not the medical correctness of the decision.
function policyHash(manifest: LocalQuarantineManifest): string {
  return sha256(JSON.stringify({ ...manifest, entries: manifest.entries
    .map(entry => ({ ...entry, reviewedAgainst: [...entry.reviewedAgainst].sort() }))
    .sort((a, b) => a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0) }));
}

/**
 * A corpus builder must explicitly call this before indexing, retain
 * excluded originals, and bind the returned policy hash into its new bundle.
 * No source text, upstream review status or publisher currency is rewritten.
 * This is a local engineering hold, not physician approval or a retraction.
 */
export function applyLocalQuarantine<T extends Pick<ClinicalDocument, "id" | "sourceVersion" | "rawHash">>(
  documents: readonly T[], rawManifest: unknown,
): {
  policyVersion: typeof LOCAL_QUARANTINE_VERSION;
  policyHash: string;
  activeDocuments: T[];
  excluded: { document: T; quarantine: QuarantineEntry }[];
  notPresent: QuarantineEntry[];
} {
  const manifest = validateLocalQuarantineManifest(rawManifest);
  const entries = new Map(manifest.entries.map(entry => [entry.documentId, entry]));
  const seen = new Set<string>();
  const activeDocuments: T[] = [];
  const excluded: { document: T; quarantine: QuarantineEntry }[] = [];
  for (const document of documents) {
    identitySchema.parse({ documentId: document.id, sourceVersion: document.sourceVersion, rawHash: document.rawHash });
    if (seen.has(document.id)) throw new Error("DUPLICATE_DOCUMENT");
    seen.add(document.id);
    const quarantine = entries.get(document.id);
    if (!quarantine) { activeDocuments.push(document); continue; }
    // A refreshed version/hash of the same ID is not evidence that the issue
    // was fixed. Abort the build until a new explicit review binds that copy.
    if (document.sourceVersion !== quarantine.sourceVersion || document.rawHash !== quarantine.rawHash) {
      throw new Error(`QUARANTINE_SOURCE_CHANGED_REVIEW_REQUIRED:${document.id}`);
    }
    excluded.push({ document, quarantine });
  }
  return { policyVersion: LOCAL_QUARANTINE_VERSION, policyHash: policyHash(manifest), activeDocuments, excluded,
    notPresent: manifest.entries.filter(entry => !seen.has(entry.documentId)) };
}
