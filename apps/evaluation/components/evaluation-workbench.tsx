"use client";

import { ReviewDiskBackup } from "./review-disk-backup";
import { ClinicalEvidencePanel } from "./clinical-evidence-panel";
import { ResponseSafetyPanel } from "./response-safety-panel";
import { ComparisonAssessment } from "./comparison-assessment";
import { assessmentLabel, assessmentVerdict, isClinicalAssessment } from "../lib/comparison-assessment.ts";
import { comparisonEvidenceContext } from "@/lib/evidence-contract";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  toLegacyDisposition,
  type Disposition,
  type EvaluationCase,
  type LegacyDisposition,
} from "@/lib/case-contract";
import {
  clearIndexedCheckpoint,
  clearLocalCheckpoints,
  parseCheckpoint,
  readIndexedCheckpoint,
  readLocalCandidates,
  saveLocalCheckpoint,
  selectNewestCheckpoint,
  serializeCheckpoint,
  withTimeout,
  writeIndexedCheckpoint,
  type CheckpointCandidate,
} from "@/lib/durable-review-storage";
import {
  ATTESTATION_STATEMENT,
  appendEvent,
  comparisonErrors,
  createExportEnvelope,
  createWorkspace,
  judgmentFromDraft,
  MAX_IMPORT_BYTES,
  parseImportedWorkspace,
  recordStatus,
  stableStringify,
  summarizeWorkspace,
  timingByDisposition as timingByRoute,
  validateJudgment,
  workspaceCsv,
  type ActionTiming,
  type JudgmentDraft,
  type ReviewRecord,
  type ReviewStatus,
  type ReviewWorkspace,
} from "@/lib/review-state";
import { reviewOriginPlan } from "@/lib/review-origin";

type Dataset = {
  version: string;
  caseCount: number;
  synthetic: true;
  sourceHash: string;
  referenceProposalHash: string;
  predictionHash: string;
};

type View = "review" | "results" | "method" | "scale";
type Filter = "all" | "not_started" | "in_progress" | "independent_locked" | "complete";
type PersistenceState = {
  phase: "hydrating" | "saving" | "saved" | "degraded" | "error";
  label: string;
  detail: string;
  savedAt: string | null;
};

const routeMeta: Record<Disposition, { label: string; detail: string; classes: string }> = {
  SELF_CARE: {
    label: "Self care",
    detail: "Guidance without clinician action",
    classes: "border-[#b9dfcf] bg-[#e1f3eb] text-[#11684f]",
  },
  ASYNC_PHYSICIAN: {
    label: "Async physician",
    detail: "Physician review in the message thread",
    classes: "border-[#c9d9e9] bg-[#e9f0f8] text-[#315b87]",
  },
  SAME_DAY_IN_PERSON: {
    label: "Same-day in person",
    detail: "In-person assessment today",
    classes: "border-[#ead39e] bg-[#fff3d8] text-[#7b5719]",
  },
  EMERGENCY_NOW: {
    label: "Emergency now",
    detail: "Emergency pathway now",
    classes: "border-[#efc4c0] bg-[#fae8e5] text-[#9b3733]",
  },
};

const legacyUrgentMeta = {
  label: "URGENT_ESCALATION",
  detail: "Supplied legacy label: same-day or emergency",
  classes: "border-[#d9c9e8] bg-[#f2ecf8] text-[#674888]",
};

const timingMeta: Record<ActionTiming, { label: string; detail: string }> = {
  SELF_CARE_ONLY: { label: "Self care only", detail: "Reviewed guidance and return precautions" },
  ASYNC_SAME_DAY: { label: "Same-day async", detail: "Physician review within the same day" },
  ASYNC_ROUTINE: { label: "Routine async", detail: "Physician review can follow the routine queue" },
  SAME_DAY_IN_PERSON: { label: "Same-day in person", detail: "A locally capable service before the end of today; not the routine async queue" },
  EMERGENCY_NOW: { label: "Emergency now", detail: "Emergency, crisis, or obstetric response now; do not wait for a thread reply" },
};

const statusMeta: Record<ReviewStatus, { label: string; dot: string; classes: string }> = {
  not_started: { label: "Not started", dot: "bg-[#b5c1bd]", classes: "bg-[#edf1ef] text-[#647b76]" },
  in_progress: { label: "Draft", dot: "bg-[#bc812d]", classes: "bg-[#fff4df] text-[#80551a]" },
  independent_locked: { label: "Compare", dot: "bg-[#467ca8]", classes: "bg-[#e8f1f8] text-[#315f86]" },
  complete: { label: "Complete", dot: "bg-[#269575]", classes: "bg-[#e3f3ec] text-[#176650]" },
};

function human(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function RouteBadge({ disposition }: { disposition: Disposition | LegacyDisposition }) {
  const meta = disposition === "URGENT_ESCALATION" ? legacyUrgentMeta : routeMeta[disposition];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${meta.classes}`}>{meta.label}</span>;
}

function download(filename: string, body: string, type: string) {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([body], { type }));
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export function EvaluationWorkbench({ cases, dataset }: { cases: EvaluationCase[]; dataset: Dataset }) {
  const storageKey = `counsel-physician-review:${dataset.sourceHash}`;
  const caseIds = useMemo(() => cases.map(({ id }) => id), [cases]);
  const blankWorkspace = useMemo(() => createWorkspace(dataset, caseIds, new Date(0).toISOString()), [caseIds, dataset]);
  const [workspace, setWorkspace] = useState<ReviewWorkspace>(blankWorkspace);
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<View>("review");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState(cases[0]?.id ?? "");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [editingAfterReveal, setEditingAfterReveal] = useState(false);
  const [attestationChecked, setAttestationChecked] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [recoveryPayload, setRecoveryPayload] = useState<string | null>(null);
  const [showRecoveryHelp, setShowRecoveryHelp] = useState(false);
  const [recoveryOrigin, setRecoveryOrigin] = useState(false);
  const [canonicalUrl, setCanonicalUrl] = useState("/");
  const [legacyRecoveryUrl, setLegacyRecoveryUrl] = useState<string | null>(null);
  const [persistence, setPersistence] = useState<PersistenceState>({
    phase: "hydrating",
    label: "Restoring checkpoint",
    detail: "Checking both browser stores before showing the workspace.",
    savedAt: null,
  });
  const importInput = useRef<HTMLInputElement>(null);
  const revision = useRef(0);
  const workspaceRef = useRef(workspace);
  const lastSaveSucceeded = useRef(false);
  const writeConflict = useRef(false);
  const lastLocalRaw = useRef<string | null>(null);
  const indexedWriteQueue = useRef<Promise<void>>(Promise.resolve());

  workspaceRef.current = workspace;

  useEffect(() => {
    let cancelled = false;
    const origin = reviewOriginPlan(window.location.href);
    setCanonicalUrl(origin.canonicalUrl);
    if (origin.shouldRedirect) {
      window.location.replace(origin.canonicalUrl);
      return () => {
        cancelled = true;
      };
    }
    setRecoveryOrigin(origin.recoveryOrigin);
    setLegacyRecoveryUrl(origin.legacyRecoveryUrl);

    async function restore() {
      const candidates: CheckpointCandidate[] = [];
      const readErrors: string[] = [];
      try {
        const local = readLocalCandidates(window.localStorage, storageKey);
        candidates.push(...local.candidates);
        readErrors.push(...local.errors);
      } catch (error) {
        readErrors.push(`local storage: ${error instanceof Error ? error.message : "unavailable"}`);
      }

      try {
        const indexedRaw = await withTimeout(readIndexedCheckpoint(storageKey), 1500, "IndexedDB restore");
        if (indexedRaw !== null) candidates.push({ source: "indexeddb", raw: indexedRaw });
      } catch (error) {
        readErrors.push(`indexeddb: ${error instanceof Error ? error.message : "unavailable"}`);
      }

      if (cancelled) return;
      const restored = selectNewestCheckpoint(candidates, dataset, caseIds);
      const messages: string[] = [];
      if (restored.selected) {
        revision.current = restored.selected.revision;
        if (restored.selected.source === "local-primary") lastLocalRaw.current = restored.selected.raw;
        setWorkspace(restored.selected.workspace);
        if (restored.selected.source !== "local-primary") {
          messages.push(`Recovered revision ${restored.selected.revision} from ${restored.selected.source === "indexeddb" ? "the independent browser database" : "the rotating backup"}.`);
        } else if (restored.selected.legacy) {
          messages.push("Recovered the earlier browser-local format; it will be migrated to redundant checkpoints.");
        }
      } else {
        setWorkspace(createWorkspace(dataset, caseIds));
        if (candidates.length > 0) messages.push("No valid checkpoint could be restored; a new review was opened without deleting the damaged payload.");
      }

      if (restored.invalid.length > 0 || readErrors.length > 0) {
        const recovery = {
          schemaVersion: "counsel-physician-review-recovery/v1",
          capturedAt: new Date().toISOString(),
          storageKey,
          invalidCheckpoints: restored.invalid,
          readErrors,
        };
        setRecoveryPayload(stableStringify(recovery));
        messages.push("A recovery payload is available for any unreadable copy.");
      }
      if (origin.recoveryOrigin) {
        messages.push("Recovery-origin mode is active. Export this session, then import it at localhost so future checkpoints use the canonical origin.");
      }
      if (messages.length > 0) setNotice(messages.join(" "));
      setHydrated(true);
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, [caseIds, dataset.sourceHash, storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    if (writeConflict.current) {
      setPersistence({
        phase: "error",
        label: "Save paused — export or reload",
        detail: "Another tab has a competing checkpoint. Autosave is paused to prevent either review from silently replacing the other.",
        savedAt: null,
      });
      return;
    }
    const nextRevision = revision.current + 1;
    revision.current = nextRevision;
    const savedAt = new Date().toISOString();
    const raw = serializeCheckpoint(workspace, nextRevision, savedAt);
    setPersistence({ phase: "saving", label: "Saving", detail: "Writing redundant browser checkpoints.", savedAt: null });

    let localResult = { primarySaved: false, backupSaved: false, verified: false, conflict: false, errors: ["local storage is unavailable"] };
    try {
      localResult = saveLocalCheckpoint(window.localStorage, storageKey, raw, (existing) => {
        parseCheckpoint(existing, dataset, caseIds, "local-primary");
      });
    } catch (error) {
      localResult.errors = [error instanceof Error ? error.message : "local storage is unavailable"];
    }
    const localVerified = localResult.primarySaved && localResult.verified;
    lastSaveSucceeded.current = localVerified;
    if (localVerified) lastLocalRaw.current = raw;
    if (localResult.conflict) {
      writeConflict.current = true;
      lastSaveSucceeded.current = false;
      setPersistence({
        phase: "error",
        label: "Save paused — export or reload",
        detail: localResult.errors.join("; "),
        savedAt: null,
      });
      return;
    }

    const queuedWrite = indexedWriteQueue.current
      .catch(() => undefined)
      .then(() => withTimeout(writeIndexedCheckpoint(storageKey, raw), 2000, "IndexedDB save"));
    indexedWriteQueue.current = queuedWrite.then(() => undefined, () => undefined);

    void queuedWrite.then(() => {
      if (revision.current !== nextRevision) return;
      lastSaveSucceeded.current = true;
      if (localVerified) {
        setPersistence({ phase: "saved", label: "Saved in 2 stores", detail: "Primary storage was read-back verified and mirrored to IndexedDB.", savedAt });
      } else {
        setPersistence({
          phase: "degraded",
          label: "Saved with reduced redundancy",
          detail: `IndexedDB is current, but local storage failed: ${localResult.errors.join("; ")}`,
          savedAt,
        });
      }
    }).catch((error) => {
      if (revision.current !== nextRevision) return;
      if (error instanceof Error && /stale|conflict|another tab/i.test(error.message)) {
        writeConflict.current = true;
        lastSaveSucceeded.current = false;
        setPersistence({
          phase: "error",
          label: "Save paused — export or reload",
          detail: error.message,
          savedAt: null,
        });
        return;
      }
      if (localVerified) {
        lastSaveSucceeded.current = true;
        setPersistence({
          phase: "degraded",
          label: "Saved with reduced redundancy",
          detail: `The verified local checkpoint is current, but the IndexedDB mirror failed: ${error instanceof Error ? error.message : "unknown error"}`,
          savedAt,
        });
      } else {
        lastSaveSucceeded.current = false;
        setPersistence({
          phase: "error",
          label: "Checkpoint failed — export now",
          detail: [...localResult.errors, error instanceof Error ? error.message : "IndexedDB save failed"].join("; "),
          savedAt: null,
        });
      }
    });
  }, [caseIds, dataset.sourceHash, hydrated, storageKey, workspace]);

  useEffect(() => {
    if (!hydrated) return;
    const flushLocal = () => {
      if (writeConflict.current) {
        lastSaveSucceeded.current = false;
        return;
      }
      const nextRevision = revision.current + 1;
      revision.current = nextRevision;
      const raw = serializeCheckpoint(workspaceRef.current, nextRevision);
      try {
        const result = saveLocalCheckpoint(window.localStorage, storageKey, raw, (existing) => {
          parseCheckpoint(existing, dataset, caseIds, "local-primary");
        });
        lastSaveSucceeded.current = result.primarySaved && result.verified;
        if (lastSaveSucceeded.current) lastLocalRaw.current = raw;
        if (result.conflict) writeConflict.current = true;
      } catch {
        lastSaveSucceeded.current = false;
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || event.key !== storageKey) return;
      if (event.newValue === lastLocalRaw.current) return;
      try {
        if (event.newValue !== null) {
          const external = parseCheckpoint(event.newValue, dataset, caseIds, "local-primary");
          if (external.revision < revision.current) return;
        }
      } catch {
        // A damaged or deleted competing primary still requires explicit recovery.
      }
      writeConflict.current = true;
      lastSaveSucceeded.current = false;
      setPersistence({
        phase: "error",
        label: "Save paused — export or reload",
        detail: "Another tab changed this review checkpoint. Export this tab before reloading the newest stored revision.",
        savedAt: null,
      });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushLocal();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      flushLocal();
      if (!lastSaveSucceeded.current) {
        event.preventDefault();
        event.returnValue = true;
      }
    };
    window.addEventListener("pagehide", flushLocal);
    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushLocal);
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [caseIds, dataset.sourceHash, hydrated, storageKey]);

  const summary = useMemo(() => summarizeWorkspace(workspace, cases), [workspace, cases]);
  const filteredCases = useMemo(() => cases.filter((reviewCase) => {
    if (filter === "all") return true;
    return recordStatus(workspace.records[reviewCase.id]) === filter;
  }), [cases, filter, workspace.records]);
  const selected = filteredCases.find(({ id }) => id === selectedId) ?? filteredCases[0] ?? null;
  const selectedRecord = selected ? workspace.records[selected.id] : null;

  function updateRecord(caseId: string, update: (record: ReviewRecord) => ReviewRecord) {
    setWorkspace((current) => {
      const at = new Date().toISOString();
      const hadAttestation = Boolean(current.attestation);
      const next: ReviewWorkspace = {
        ...current,
        updatedAt: at,
        attestation: null,
        records: { ...current.records, [caseId]: update(current.records[caseId]) },
      };
      return hadAttestation ? appendEvent(next, caseId, "attestation_invalidated", at) : next;
    });
  }

  function updateDraft(field: keyof JudgmentDraft, value: string) {
    if (!selectedRecord || !selected) return;
    updateRecord(selected.id, (record) => ({ ...record, draft: { ...record.draft, [field]: value } }));
    setFormErrors([]);
  }

  function lockIndependentJudgment() {
    if (!selected || !selectedRecord) return;
    const errors = validateJudgment(selectedRecord.draft);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    const judgment = judgmentFromDraft(selectedRecord.draft);
    const at = new Date().toISOString();
    setWorkspace((current) => appendEvent({
      ...current,
      records: {
        ...current.records,
        [selected.id]: {
          ...current.records[selected.id],
          blindJudgment: judgment,
          finalJudgment: judgment,
          blindCommittedAt: at,
          completedAt: null,
        },
      },
      attestation: null,
    }, selected.id, "blind_judgment_committed", at));
    setFormErrors([]);
    setEditingAfterReveal(false);
  }

  function beginRevision() {
    if (!selected || !selectedRecord?.finalJudgment) return;
    updateRecord(selected.id, (record) => ({ ...record, draft: { ...record.finalJudgment! }, completedAt: null }));
    setEditingAfterReveal(true);
    setFormErrors([]);
  }

  function saveRevision() {
    if (!selected || !selectedRecord) return;
    const errors = validateJudgment(selectedRecord.draft);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    const judgment = judgmentFromDraft(selectedRecord.draft);
    const at = new Date().toISOString();
    setWorkspace((current) => appendEvent({
      ...current,
      records: {
        ...current.records,
        [selected.id]: {
          ...current.records[selected.id],
          finalJudgment: judgment,
          postRevealRevisedAt: at,
          completedAt: null,
        },
      },
      attestation: null,
    }, selected.id, "post_reveal_judgment_revised", at));
    setEditingAfterReveal(false);
    setFormErrors([]);
  }

  function completeCase() {
    if (!selected || !selectedRecord) return;
    const errors = comparisonErrors(selectedRecord);
    if (errors.length > 0) {
      setFormErrors(errors);
      return;
    }
    const at = new Date().toISOString();
    const nextId = cases.find(({ id }) => recordStatus(workspace.records[id]) !== "complete" && id !== selected.id)?.id;
    setWorkspace((current) => appendEvent({
      ...current,
      records: { ...current.records, [selected.id]: { ...current.records[selected.id], completedAt: at, comparisonEvidence: comparisonEvidenceContext(selected.clinicalEvidence, at, selected.responseSafety && selected.responseSafetyHash ? { version: selected.responseSafety.version, hash: selected.responseSafetyHash } : undefined) } },
      attestation: null,
    }, selected.id, "case_completed", at));
    setFormErrors([]);
    setEditingAfterReveal(false);
    if (nextId) {
      setFilter("all");
      setSelectedId(nextId);
    } else setView("results");
  }

  function updateComparison(field: "sourceAssessment" | "v0Assessment" | "comparisonNotes", value: string) {
    if (!selected) return;
    updateRecord(selected.id, (record) => ({ ...record, [field]: value, completedAt: null, comparisonEvidence: comparisonEvidenceContext(selected.clinicalEvidence, new Date().toISOString(), selected.responseSafety && selected.responseSafetyHash ? { version: selected.responseSafety.version, hash: selected.responseSafetyHash } : undefined) } as ReviewRecord));
    setFormErrors([]);
  }

  function changeFilter(next: Filter) {
    setFilter(next);
    const first = cases.find((reviewCase) => next === "all" || recordStatus(workspace.records[reviewCase.id]) === next);
    setSelectedId(first?.id ?? "");
    setFormErrors([]);
    setEditingAfterReveal(false);
  }

  async function exportJson() {
    const envelope = await createExportEnvelope(workspace, dataset);
    download(`counsel-physician-review-${summary.complete}of${summary.total}.json`, stableStringify(envelope), "application/json");
    setNotice(`Exported an integrity-hashed ${summary.complete}/${summary.total} review bundle.`);
  }

  function exportCsv() {
    download(`counsel-physician-review-${summary.complete}of${summary.total}.csv`, workspaceCsv(workspace, cases), "text/csv;charset=utf-8");
    setNotice(`Exported the ${summary.total}-row review table; incomplete cases remain explicitly blank.`);
  }

  function exportRecoveryPayload() {
    if (!recoveryPayload) return;
    download("counsel-review-storage-recovery.json", recoveryPayload, "application/json");
    setNotice("Downloaded the unreadable storage payload for recovery analysis. It was not treated as reviewed data.");
  }

  async function importJson(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error(`The review bundle exceeds the ${MAX_IMPORT_BYTES / (1024 * 1024)} MiB import limit.`);
      const imported = await parseImportedWorkspace(await file.text(), dataset, cases.map(({ id }) => id));
      setWorkspace(imported);
      setNotice(`Imported ${summarizeWorkspace(imported, cases).complete}/${cases.length} completed cases.`);
      setView("review");
    } catch (error) {
      setNotice(error instanceof Error ? `Import failed: ${error.message}` : "Import failed.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }

  function signAttestation() {
    const name = workspace.reviewer.name.trim();
    const credentials = workspace.reviewer.credentials.trim();
    if (summary.complete !== summary.total || !name || !credentials || !attestationChecked) return;
    const at = new Date().toISOString();
    setWorkspace((current) => appendEvent({
      ...current,
      attestation: { reviewerName: name, statement: ATTESTATION_STATEMENT, signedAt: at },
    }, null, "attestation_signed", at));
    setNotice("Review attestation signed. Export the JSON bundle to preserve the integrity digest.");
  }

  function updateReviewer(field: "name" | "credentials", value: string) {
    setWorkspace((current) => {
      const at = new Date().toISOString();
      const hadAttestation = Boolean(current.attestation);
      const next = { ...current, reviewer: { ...current.reviewer, [field]: value }, updatedAt: at, attestation: null };
      return hadAttestation ? appendEvent(next, null, "attestation_invalidated", at) : next;
    });
  }

  function resetWorkspace() {
    if (!window.confirm("Clear all browser-local physician review progress for these 50 cases? Export first if you need a recovery copy.")) return;
    let clearErrors: string[] = [];
    try {
      clearErrors = clearLocalCheckpoints(window.localStorage, storageKey);
    } catch (error) {
      clearErrors = [error instanceof Error ? error.message : "Local storage could not be cleared."];
    }
    indexedWriteQueue.current = indexedWriteQueue.current
      .catch(() => undefined)
      .then(() => withTimeout(clearIndexedCheckpoint(storageKey), 2000, "IndexedDB clear"))
      .catch(() => undefined);
    revision.current = 0;
    writeConflict.current = false;
    lastLocalRaw.current = null;
    setRecoveryPayload(null);
    setWorkspace(createWorkspace(dataset, caseIds));
    setSelectedId(cases[0]?.id ?? "");
    setFilter("all");
    setView("review");
    setAttestationChecked(false);
    setFormErrors([]);
    setEditingAfterReveal(false);
    setNotice(clearErrors.length === 0
      ? "Both local checkpoint copies were cleared. The instrument is back at 0/50."
      : `The new review is open, but some prior browser storage could not be cleared: ${clearErrors.join("; ")}`);
  }

  const persistenceClasses = persistence.phase === "saved"
    ? "border-[#b9dfcf] bg-[#e1f3eb] text-[#11684f]"
    : persistence.phase === "saving" || persistence.phase === "hydrating"
      ? "border-[#c9d9e9] bg-[#e9f0f8] text-[#315b87]"
      : persistence.phase === "degraded"
        ? "border-[#efd7ad] bg-[#fff8e8] text-[#78531f]"
        : "border-[#efc4c0] bg-[#fae8e5] text-[#9b3733]";

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[238px_1fr]">
      <aside className="border-b border-[#dfe7e3] bg-[#103936] text-white lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:border-[#2a4c49]">
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-6 lg:py-7">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#dff3e9] text-sm font-black text-[#135f4d]">CQ</div>
            <div><p className="text-sm font-bold">Counsel Quality</p><p className="text-[11px] text-[#acd0c5]">Physician review instrument</p></div>
          </div>
          <span className="rounded-full border border-[#47706a] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#bcd8d0] lg:hidden">Local</span>
        </div>
        <nav aria-label="Physician review workspace" className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:overflow-visible lg:px-3 lg:pb-0">
          {([
            ["review", "Review cases", `${summary.complete}/${summary.total}`],
            ["results", "Results", summary.complete > 0 ? String(summary.complete) : null],
            ["method", "Protocol", null],
            ["scale", "Scale plan", null],
          ] as Array<[View, string, string | null]>).map(([item, label, count]) => (
            <button key={item} type="button" onClick={() => setView(item)} className={`flex min-w-max items-center justify-between gap-4 rounded-xl px-3.5 py-2.5 text-left text-sm transition lg:w-full ${view === item ? "bg-white text-[#123d38] shadow-sm" : "text-[#c6ddd7] hover:bg-[#1a4743] hover:text-white"}`}>
              <span>{label}</span>{count && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${view === item ? "bg-[#e2f2eb] text-[#1a6d58]" : "bg-[#315853] text-[#c9e1da]"}`}>{count}</span>}
            </button>
          ))}
          <Link href="/v0" className="flex min-w-max rounded-xl px-3.5 py-2.5 text-sm text-[#c6ddd7] hover:bg-[#1a4743] hover:text-white focus-visible:outline-2">V0 live demo ↗</Link>
          <Link href="/quality" className="flex min-w-max rounded-xl px-3.5 py-2.5 text-sm text-[#c6ddd7] hover:bg-[#1a4743] hover:text-white focus-visible:outline-2">Quality audit ↗</Link>
        </nav>
        <div className="hidden px-5 lg:absolute lg:bottom-6 lg:block lg:w-[238px]">
          <div className="rounded-2xl border border-[#315853] bg-[#17443f] p-4">
            <p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#91beb1]">Local evidence</p>
            <p className="mt-2 text-xs leading-5 text-[#d0e4de]">No answer counts as reviewed until you lock an independent judgment and complete the revealed comparison.</p>
          </div>
        </div>
      </aside>

      <main className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#dfe7e3] bg-white/90 px-5 py-4 backdrop-blur sm:px-8">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#78908a]">Disposition V0 · synthetic development evaluation</p>
            <h1 className="mt-1 text-lg font-semibold tracking-[-.025em] text-[#173c39]">
              {view === "review" ? "Author the physician reference" : view === "results" ? "Measure only what was reviewed" : view === "method" ? "Evaluation protocol and role map" : "Clinical quality at 25M cases"}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setShowRecoveryHelp((current) => !current)} className="rounded-full border border-[#d4e1dc] bg-white px-3 py-2 text-xs font-bold text-[#41655e] hover:border-[#9eb8af]">Recovery</button>
            <button type="button" onClick={() => importInput.current?.click()} className="rounded-full border border-[#d4e1dc] bg-white px-3 py-2 text-xs font-bold text-[#41655e] hover:border-[#9eb8af]">Import</button>
            <button type="button" onClick={exportCsv} className="rounded-full border border-[#d4e1dc] bg-white px-3 py-2 text-xs font-bold text-[#41655e] hover:border-[#9eb8af]">Export CSV</button>
            <button type="button" onClick={exportJson} className="rounded-full bg-[#176b56] px-3.5 py-2 text-xs font-bold text-white hover:bg-[#115846]">Export audit bundle</button>
            <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => event.target.files?.[0] && importJson(event.target.files[0])} />
          </div>
        </header>

        {hydrated && <ReviewDiskBackup workspace={workspace} onRestore={(file) => void importJson(file)} />}

        <div className="border-b border-[#dfe7e3] bg-white px-5 py-4 sm:px-8">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="min-w-[180px] flex-1"><div className="flex items-center justify-between text-xs font-bold text-[#45645e]"><span>Physician review</span><span>{summary.complete}/{summary.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e5ece9]"><div className="h-full rounded-full bg-[#248d70] transition-all" style={{ width: `${(summary.complete / summary.total) * 100}%` }} /></div></div>
            <p className="text-xs text-[#6e837f]">{summary.independentLocked} ready to compare · {summary.inProgress} drafts · {summary.notStarted} not started</p>
            <span title={persistence.detail} className={`rounded-full border px-3 py-2 text-[10px] font-bold uppercase tracking-[.08em] ${persistenceClasses}`}>{persistence.label}</span>
            <span className="rounded-full border border-[#d7e5df] bg-[#f5faf7] px-3 py-2 text-[10px] font-bold uppercase tracking-[.1em] text-[#356258]">Synthetic · browser-local</span>
          </div>
        </div>

        {notice && <div role="status" className="border-b border-[#cde0d8] bg-[#eef8f3] px-5 py-3 text-sm text-[#315f55] sm:px-8"><div className="flex items-start justify-between gap-4"><p>{notice}</p><button type="button" onClick={() => setNotice(null)} className="font-bold" aria-label="Dismiss notice">×</button></div></div>}
        {persistence.phase === "error" && <div role="alert" className="border-b border-[#efc4c0] bg-[#fff1ef] px-5 py-3 text-sm text-[#863b36] sm:px-8"><div className="flex flex-wrap items-center justify-between gap-3"><p><strong>Browser checkpoint is not current.</strong> Your present screen is still available; export it before reloading. {persistence.detail}</p><div className="flex gap-2"><button type="button" onClick={exportJson} className="rounded-lg bg-[#963f38] px-3 py-2 text-xs font-bold text-white">Export this tab</button><button type="button" onClick={() => window.location.reload()} className="rounded-lg border border-[#c47b74] bg-white px-3 py-2 text-xs font-bold">Reload stored copy</button></div></div></div>}
        {recoveryOrigin && <div role="alert" className="border-b border-[#efd7ad] bg-[#fff8e8] px-5 py-3 text-sm text-[#78531f] sm:px-8"><strong>Recovery-origin mode.</strong> This address has storage separate from localhost. Export any restored work here, then <a className="font-bold underline" href={canonicalUrl}>return to the canonical workspace</a> and import it.</div>}
        {showRecoveryHelp && <div className="border-b border-[#c9d9e9] bg-[#f1f6fa] px-5 py-4 text-sm text-[#315b87] sm:px-8"><div className="flex flex-wrap items-start justify-between gap-4"><div className="max-w-3xl"><p className="font-bold">Crash recovery</p><p className="mt-1 leading-6">Every edit is read-back verified in local storage and mirrored to IndexedDB. A previous valid revision is rotated as a backup. JSON export remains the portable copy.</p>{legacyRecoveryUrl && <p className="mt-2">If an earlier session used 127.0.0.1, <a className="font-bold underline" href={legacyRecoveryUrl}>open that isolated recovery origin</a>, export there, and import at localhost.</p>}</div><div className="flex gap-2">{recoveryPayload && <button type="button" onClick={exportRecoveryPayload} className="rounded-lg border border-[#9db8cc] bg-white px-3 py-2 text-xs font-bold">Download damaged payload</button>}<button type="button" onClick={() => setShowRecoveryHelp(false)} className="rounded-lg border border-[#9db8cc] bg-white px-3 py-2 text-xs font-bold">Close</button></div></div></div>}
        {!hydrated ? <LoadingState /> : view === "method" ? <MethodView dataset={dataset} /> : view === "scale" ? <ScaleView /> : view === "results" ? (
          <ResultsView cases={cases} workspace={workspace} summary={summary} attestationChecked={attestationChecked} onAttestationChecked={setAttestationChecked} onReviewer={updateReviewer} onSign={signAttestation} onExport={exportJson} onReset={resetWorkspace} />
        ) : (
          <ReviewView cases={filteredCases} allCases={cases} workspace={workspace} selected={selected} selectedRecord={selectedRecord} filter={filter} onFilter={changeFilter} onSelect={(id) => { setSelectedId(id); setFormErrors([]); setEditingAfterReveal(false); }} onDraft={updateDraft} onLock={lockIndependentJudgment} onBeginRevision={beginRevision} onSaveRevision={saveRevision} editingAfterReveal={editingAfterReveal} onComparison={updateComparison} onComplete={completeCase} errors={formErrors} />
        )}
      </main>
    </div>
  );
}

function ReviewView({ cases, allCases, workspace, selected, selectedRecord, filter, onFilter, onSelect, onDraft, onLock, onBeginRevision, onSaveRevision, editingAfterReveal, onComparison, onComplete, errors }: {
  cases: EvaluationCase[];
  allCases: EvaluationCase[];
  workspace: ReviewWorkspace;
  selected: EvaluationCase | null;
  selectedRecord: ReviewRecord | null;
  filter: Filter;
  onFilter: (value: Filter) => void;
  onSelect: (id: string) => void;
  onDraft: (field: keyof JudgmentDraft, value: string) => void;
  onLock: () => void;
  onBeginRevision: () => void;
  onSaveRevision: () => void;
  editingAfterReveal: boolean;
  onComparison: (field: "sourceAssessment" | "v0Assessment" | "comparisonNotes", value: string) => void;
  onComplete: () => void;
  errors: string[];
}) {
  const counts = Object.fromEntries((["not_started", "in_progress", "independent_locked", "complete"] as ReviewStatus[]).map((status) => [status, allCases.filter(({ id }) => recordStatus(workspace.records[id]) === status).length]));
  const filters: Array<[Filter, string, number]> = [["all", "All", allCases.length], ["not_started", "Not started", counts.not_started], ["in_progress", "Drafts", counts.in_progress], ["independent_locked", "Ready to compare", counts.independent_locked], ["complete", "Complete", counts.complete]];
  return (
    <>
      <div className="flex gap-2 overflow-x-auto border-b border-[#dfe7e3] bg-[#f7f9f7] px-5 py-3 sm:px-8">
        {filters.map(([value, label, count]) => <button key={value} type="button" onClick={() => onFilter(value)} className={`min-w-max rounded-full border px-3 py-1.5 text-xs font-bold transition ${filter === value ? "border-[#2c7564] bg-[#1b6554] text-white" : "border-[#d5e0dc] bg-white text-[#617a75] hover:border-[#9db5ae]"}`}>{label} <span className="ml-1 opacity-75">{count}</span></button>)}
      </div>
      <div className="grid min-h-[calc(100vh-210px)] xl:grid-cols-[310px_1fr]">
        <aside className="scrollbar-subtle max-h-[330px] overflow-y-auto border-b border-[#dfe7e3] bg-[#f3f6f3] xl:max-h-[calc(100vh-210px)] xl:border-b-0 xl:border-r">
          <div className="sticky top-0 z-10 border-b border-[#dfe7e3] bg-[#f3f6f3]/95 px-5 py-4 backdrop-blur"><div className="flex items-center justify-between"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#667f79]">Case queue</p><span className="text-xs font-semibold text-[#7d918d]">{cases.length}</span></div></div>
          <div className="p-2.5">{cases.map((reviewCase) => {
            const active = reviewCase.id === selected?.id;
            const status = recordStatus(workspace.records[reviewCase.id]);
            const meta = statusMeta[status];
            return <button key={reviewCase.id} type="button" onClick={() => onSelect(reviewCase.id)} className={`mb-1.5 w-full rounded-xl border px-3.5 py-3 text-left transition ${active ? "border-[#b8d4ca] bg-white shadow-[0_5px_16px_rgba(18,59,55,.07)]" : "border-transparent hover:border-[#dce6e2] hover:bg-white/70"}`}>
              <span className="flex items-center justify-between gap-3"><span className="text-xs font-bold text-[#315550]">{reviewCase.id}</span><span className="flex items-center gap-1.5 text-[10px] font-bold text-[#718781]"><span className={`size-2 rounded-full ${meta.dot}`} />{meta.label}</span></span>
              <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-[#6d817d]">{reviewCase.message}</span>
            </button>;
          })}</div>
        </aside>
        {selected && selectedRecord ? <CaseReviewer reviewCase={selected} record={selectedRecord} onDraft={onDraft} onLock={onLock} onBeginRevision={onBeginRevision} onSaveRevision={onSaveRevision} editingAfterReveal={editingAfterReveal} onComparison={onComparison} onComplete={onComplete} errors={errors} /> : <EmptyState />}
      </div>
    </>
  );
}

function CaseReviewer({ reviewCase, record, onDraft, onLock, onBeginRevision, onSaveRevision, editingAfterReveal, onComparison, onComplete, errors }: {
  reviewCase: EvaluationCase;
  record: ReviewRecord;
  onDraft: (field: keyof JudgmentDraft, value: string) => void;
  onLock: () => void;
  onBeginRevision: () => void;
  onSaveRevision: () => void;
  editingAfterReveal: boolean;
  onComparison: (field: "sourceAssessment" | "v0Assessment" | "comparisonNotes", value: string) => void;
  onComplete: () => void;
  errors: string[];
}) {
  const status = recordStatus(record);
  const locked = Boolean(record.blindCommittedAt);
  const formEnabled = !locked || editingAfterReveal;
  const draft = record.draft;
  return (
    <div className="animate-rise px-5 py-7 sm:px-8 xl:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[.13em] text-[#6f8881]">Case {reviewCase.ordinal} of 50 · {reviewCase.id}</p><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${statusMeta[status].classes}`}>{statusMeta[status].label}</span></div>
        <section className="mt-4 rounded-2xl border border-[#d8e3df] bg-[#fffefb] p-5 shadow-[0_10px_28px_rgba(18,59,55,.05)] sm:p-6">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-[#78908a]"><span className="grid size-6 place-items-center rounded-full bg-[#e5f2ed] text-[#1a6f59]">P</span>Patient message · synthetic</div>
          <blockquote className="balance mt-4 text-[18px] font-medium leading-8 tracking-[-.012em] text-[#1d403c]">“{reviewCase.message}”</blockquote>
        </section>

        <section className="mt-5 rounded-2xl border border-[#dbe5e1] bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[.13em] text-[#78908a]">Step 1 · independent clinical judgment</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Decide before seeing either label.</h2></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.1em] ${locked ? "bg-[#e8f1f8] text-[#315f86]" : "bg-[#fff3df] text-[#80551a]"}`}>{locked ? `Locked ${new Date(record.blindCommittedAt!).toLocaleString()}` : "Labels masked"}</span></div>
          {record.postRevealRevisedAt && <p className="mt-3 rounded-xl border border-[#efd7ad] bg-[#fff8e8] px-4 py-3 text-sm text-[#78531f]">The final judgment was revised after labels were revealed. The original blinded response remains in the audit export.</p>}
          <JudgmentForm key={reviewCase.id} draft={draft} enabled={formEnabled} onDraft={onDraft} />
          {errors.length > 0 && <ErrorList errors={errors} />}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#e4eae7] pt-5"><p className="max-w-xl text-xs leading-5 text-[#71847f]">Locking preserves your original judgment and reveals the supplied workflow label, V0 result, and unattested proposal. It is not an irreversible clinical decision.</p>{!locked ? <button type="button" onClick={onLock} className="rounded-xl bg-[#176b56] px-5 py-3 text-sm font-bold text-white hover:bg-[#115846]">Lock independent judgment</button> : editingAfterReveal ? <button type="button" onClick={onSaveRevision} className="rounded-xl bg-[#176b56] px-5 py-3 text-sm font-bold text-white hover:bg-[#115846]">Save post-reveal revision</button> : <button type="button" onClick={onBeginRevision} className="rounded-xl border border-[#b9cbc5] bg-white px-5 py-3 text-sm font-bold text-[#41655e] hover:border-[#7fa497]">Revise with audit trail</button>}</div>
        </section>

        {locked && !editingAfterReveal && <ComparisonPanel reviewCase={reviewCase} record={record} onComparison={onComparison} onComplete={onComplete} errors={errors} />}
      </div>
    </div>
  );
}

function JudgmentForm({ draft, enabled, onDraft }: { draft: JudgmentDraft; enabled: boolean; onDraft: (field: keyof JudgmentDraft, value: string) => void }) {
  const timingOptions = draft.disposition ? timingByRoute[draft.disposition] : [];
  const savedDetails = [draft.decisiveEvidence, draft.mustNotMiss, draft.missingInformation, draft.riskIfWrong, draft.confidence].filter((value) => value.trim()).length;
  return <div className={`mt-5 space-y-5 ${enabled ? "" : "opacity-75"}`}>
    <fieldset><legend className="text-sm font-bold text-[#2b514b]">Disposition <span className="text-[#a64c45]">*</span></legend><div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{(Object.keys(routeMeta) as Disposition[]).map((route) => <button key={route} type="button" disabled={!enabled} aria-pressed={draft.disposition === route} onClick={() => {
      onDraft("disposition", route);
      onDraft("actionTiming", timingByRoute[route].length === 1 ? timingByRoute[route][0] : draft.disposition === route ? draft.actionTiming : "");
    }} className={`rounded-xl border p-3 text-left transition ${draft.disposition === route ? "border-[#38806d] bg-[#eff8f4] ring-2 ring-[#c9e4d9]" : "border-[#dce5e2] bg-[#fbfcfb] hover:border-[#a8beb7]"}`}><span className="text-base font-semibold text-[#274d47]">{routeMeta[route].label}</span><span className="mt-1 block text-sm leading-5 text-[#6c817d]">{routeMeta[route].detail}</span></button>)}</div></fieldset>
    {timingOptions.length > 1 && <fieldset><legend className="text-sm font-bold text-[#2b514b]">When should the physician review? <span className="text-[#a64c45]">*</span></legend><div className="mt-3 flex flex-wrap gap-3">{timingOptions.map((timing) => <button key={timing} type="button" disabled={!enabled} aria-pressed={draft.actionTiming === timing} onClick={() => onDraft("actionTiming", timing)} className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${draft.actionTiming === timing ? "border-[#4b8676] bg-[#eff8f4]" : "border-[#dce5e2] hover:border-[#abc0b9]"}`}>{timingMeta[timing].label}</button>)}</div></fieldset>}
    <TextField label="Why this route?" value={draft.clinicalRationale} onChange={(value) => onDraft("clinicalRationale", value)} placeholder="One short sentence: the deciding facts and any uncertainty that changes your decision." required rows={3} disabled={!enabled} />
    <div className="max-w-md"><SelectField label="Uncertainty" value={draft.evidenceSufficiency} onChange={(value) => onDraft("evidenceSufficiency", value)} options={[["sufficient", "Enough information for this route"], ["borderline", "Borderline / another route may be defensible"], ["insufficient", "Not enough information to choose confidently"]]} disabled={!enabled} /></div>
    <details className="rounded-xl border border-[#dce5e2] bg-[#f8faf9] px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold text-[#41655e]">Additional notes · optional{savedDetails > 0 ? ` · ${savedDetails} saved` : ""}</summary>
      <p className="mt-3 text-sm leading-6 text-[#617974]">Only add detail that helps explain this case. Existing entries are preserved; blank fields mean not recorded, not “none.”</p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <TextField label="Supporting evidence" value={draft.decisiveEvidence} onChange={(value) => onDraft("decisiveEvidence", value)} placeholder="Only if the short reason needs more detail." rows={2} disabled={!enabled} />
        <TextField label="Must-not-miss concern" value={draft.mustNotMiss} onChange={(value) => onDraft("mustNotMiss", value)} placeholder="Only if relevant to this decision." rows={2} disabled={!enabled} />
        <TextField label="Decision-changing missing information" value={draft.missingInformation} onChange={(value) => onDraft("missingInformation", value)} placeholder="What would actually change the route?" rows={2} disabled={!enabled} />
        <TextField label="Harm if misrouted" value={draft.riskIfWrong} onChange={(value) => onDraft("riskIfWrong", value)} placeholder="Only if it adds to the reason above." rows={2} disabled={!enabled} />
        <SelectField label="Confidence" value={draft.confidence} onChange={(value) => onDraft("confidence", value)} options={[["high", "High"], ["medium", "Medium"], ["low", "Low"]]} disabled={!enabled} />
      </div>
    </details>
  </div>;
}

function ComparisonPanel({ reviewCase, record, onComparison, onComplete, errors }: { reviewCase: EvaluationCase; record: ReviewRecord; onComparison: (field: "sourceAssessment" | "v0Assessment" | "comparisonNotes", value: string) => void; onComplete: () => void; errors: string[] }) {
  return <section className="mt-5 rounded-2xl border border-[#cbded6] bg-[#f5faf7] p-5 sm:p-6">
    <div><p className="text-xs font-bold uppercase tracking-[.13em] text-[#67847c]">Step 2 · clinical review</p><h2 className="mt-2 text-xl font-semibold tracking-[-.03em]">Does the system recommend the right care, at the right time?</h2><p className="mt-2 max-w-3xl text-base leading-7 text-[#647b76]">Your independent decision is preserved. Judge clinical adequacy—not agreement with the supplied label.</p></div>
    <div className="mt-5">
      <DecisionCard title="V0 · frozen evaluation output" disposition={reviewCase.v0.disposition} detail={human(reviewCase.v0.layer)}><p>{reviewCase.v0.rationale}</p><p className="mt-3 border-l-2 border-[#90b5a7] pl-3"><span className="font-semibold">Generated patient instruction: </span>{reviewCase.v0.patientDirective || "No patient instruction captured in this artifact."}</p><p className="mt-2 text-xs text-[#647b76]">Judge this saved output. It is not a live rerun or evidence of delivered care.</p>{reviewCase.v0.redFlags.length > 0 && <p className="mt-3 rounded-xl bg-[#fff1ef] px-3 py-2 text-sm font-semibold text-[#91423d]">Safety rule: {reviewCase.v0.redFlags.join(", ")}</p>}</DecisionCard>
      <div className="mt-4 rounded-xl border border-[#d9e4df] bg-white px-4 py-3 text-sm leading-6"><span className="font-semibold">Original dataset label: </span><code>{reviewCase.suppliedDisposition}</code><p className="mt-1 text-[#647b76]">{reviewCase.suppliedDisposition === "URGENT_ESCALATION" ? "Assignment definition: needs same-day in-person evaluation or emergency care. This label alone does not specify which action or timing was delivered." : "Source data to audit, not a clinical reference answer or evidence of delivered care."}</p></div>
    </div>
    <ClinicalEvidencePanel packet={reviewCase.clinicalEvidence} revealed={Boolean(record.blindCommittedAt && record.blindJudgment)} compact />
    <details className="mt-4 rounded-xl border border-[#d9e4df] px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-[#41655e]">Safety inventory · reported, denied and unknown</summary><ResponseSafetyPanel review={reviewCase.responseSafety} revealed={Boolean(record.blindCommittedAt && record.blindJudgment)} /></details>
    {record.completedAt && !record.comparisonEvidence && <p className="mt-4 text-sm text-[#8b5a1e]">Earlier comparison preserved. It predates this evidence view; no source review has been attributed to you.</p>}
    <div className="mt-5 grid gap-4 xl:grid-cols-2"><ComparisonAssessment legend="Original label" value={record.sourceAssessment} onChange={(value) => onComparison("sourceAssessment", value)} /><ComparisonAssessment legend="V0 recommendation" value={record.v0Assessment} onChange={(value) => onComparison("v0Assessment", value)} /></div>
    <p className="mt-3 text-xs leading-5 text-[#617974]">Same criteria for both: right care, channel and timing. “Wrong” is a definitive judgment; “Cannot judge” is for uncertainty. A broad label can be wrong because its action or timing is inadequate.</p>
    <details open={record.comparisonNotes.trim().length > 0 || undefined} className="mt-4 rounded-xl border border-[#d9e4df] px-4 py-3 text-sm"><summary className="cursor-pointer font-semibold text-[#41655e]">Add a correction note · optional for new ratings</summary><div className="mt-3"><TextField label="What should change?" value={record.comparisonNotes} onChange={(value) => onComparison("comparisonNotes", value)} placeholder="Only add what your original reason does not cover. Earlier rating options still require their original comparison note." rows={2} maxLength={8000} /></div></details>
    <p className="mt-3 text-xs leading-5 text-[#617974]">Your route and reason define the reference. These two ratings populate Results and exports separately for the original workflow and V0; they do not automatically train or change the system.</p>
    <details className="mt-5 rounded-xl border border-[#d9e4df] px-4 py-3 text-sm leading-6"><summary className="cursor-pointer font-semibold text-[#41655e]">Development provenance · optional</summary><p className="mt-3">The earlier project-authored proposal is not a physician-adjudicated reference and is not the system output: <code>{reviewCase.referenceProposal.disposition}</code>. {reviewCase.referenceProposal.rationale}</p><p className="mt-2 text-[#647b76]">V0 metadata reports {reviewCase.v0.confidence} confidence. This is rule-assigned, not a calibrated probability of clinical correctness.</p></details>
    {errors.length > 0 && <ErrorList errors={errors} />}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#d7e5df] pt-5"><p className="text-xs leading-5 text-[#6a817b]">Completing the case records the comparison timestamp. You can still revise later; that revision remains visible.</p><button type="button" onClick={onComplete} className="rounded-xl bg-[#176b56] px-5 py-3 text-sm font-bold text-white hover:bg-[#115846]">{record.completedAt ? "Re-complete case" : "Complete case and continue"}</button></div>
  </section>;
}

function TextField({ label, value, onChange, placeholder, required = false, rows = 3, disabled = false, maxLength = 4000 }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; required?: boolean; rows?: number; disabled?: boolean; maxLength?: number }) {
  return <label className="block"><span className="text-sm font-bold text-[#2b514b]">{label} {required && <span className="text-[#a64c45]">*</span>}</span><textarea rows={rows} required={required} disabled={disabled} maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 w-full resize-y rounded-xl border border-[#d5e1dc] bg-white px-4 py-3 text-base leading-6 text-[#284b46] placeholder:text-[#9aaba7] focus:border-[#5e9485] disabled:bg-[#f5f7f6]" /></label>;
}

function SelectField({ label, value, onChange, options, disabled = false }: { label: string; value: string; onChange: (value: string) => void; options: Array<[string, string]>; disabled?: boolean }) {
  return <label className="block"><span className="text-sm font-bold text-[#2b514b]">{label} <span className="font-normal text-[#718580]">· optional</span></span><select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e1dc] bg-white px-4 py-3 text-base text-[#284b46] disabled:bg-[#f5f7f6]"><option value="">Not recorded</option>{options.map(([option, text]) => <option key={option} value={option}>{text}</option>)}</select></label>;
}

function ErrorList({ errors }: { errors: string[] }) {
  return <div role="alert" className="mt-5 rounded-xl border border-[#efc9c5] bg-[#fff1ef] px-4 py-3 text-sm text-[#8f403a]"><p className="font-bold">Complete the required clinical judgment:</p><ul className="mt-2 list-disc space-y-1 pl-5">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>;
}

function DecisionCard({ title, disposition, detail, children }: { title: string; disposition: Disposition | LegacyDisposition; detail: string; children?: React.ReactNode }) {
  return <section className="rounded-2xl border border-[#dfe7e3] bg-white p-5 shadow-[0_8px_24px_rgba(22,61,56,.04)]"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#6b837e]">{title}</p><RouteBadge disposition={disposition} /></div><p className="mt-3 text-xs font-semibold text-[#6f8580]">{detail}</p>{children && <div className="mt-4 text-sm leading-6 text-[#365651]">{children}</div>}</section>;
}

function ResultsView({ cases, workspace, summary, attestationChecked, onAttestationChecked, onReviewer, onSign, onExport, onReset }: { cases: EvaluationCase[]; workspace: ReviewWorkspace; summary: ReturnType<typeof summarizeWorkspace>; attestationChecked: boolean; onAttestationChecked: (value: boolean) => void; onReviewer: (field: "name" | "credentials", value: string) => void; onSign: () => void; onExport: () => void; onReset: () => void }) {
  const completed = summary.complete;
  const sourceRate = completed ? `${summary.independentSourceMatches}/${completed}` : "—";
  const v0Rate = completed ? `${summary.independentV0Matches}/${completed}` : "—";
  const canSign = completed === summary.total && workspace.reviewer.name.trim() && workspace.reviewer.credentials.trim() && attestationChecked;
  const matrices = useMemo(() => ({ source: confusionMatrix(cases, workspace, "source"), v0: confusionMatrix(cases, workspace, "v0") }), [cases, workspace]);
  return <div className="px-5 py-9 sm:px-8 xl:px-10"><div className="mx-auto max-w-6xl">
    <span className="rounded-full bg-[#fff3df] px-3 py-1.5 text-xs font-bold text-[#80551a]">Development evidence · no population claim</span>
    <h2 className="balance mt-5 max-w-4xl text-4xl font-semibold tracking-[-.05em] text-[#173b38]">The score appears only as your reference is authored.</h2>
    <p className="mt-4 max-w-3xl text-base leading-7 text-[#5f7772]">Primary scores and matrices use your locked pre-reveal judgment, on completed cases only. These cases and labels were previously visible; hiding them for this pass does not create a blinded holdout or establish clinical generalization.</p>
    <p className="mt-3 text-sm leading-6 text-[#5f7772]">Post-comparison reference: supplied-label agreement {summary.exactSourceMatches}/{completed}; V0 agreement {summary.exactV0Matches}/{completed}. {summary.revisedAfterReveal} completed cases revised after reveal. Both references remain in the audit bundle.</p>
    <p className="mt-2 text-sm leading-6 text-[#5f7772]">Reference uncertainty: {summary.uncertainReference} flagged; recorded on {summary.uncertaintyRecorded}/{completed} completed cases. Unrecorded is not certainty. Flagged cases remain in the primary denominator.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Reviewed" value={`${completed}/${summary.total}`} detail="locked + compared" /><Metric label="Source projected agreement" value={sourceRate} detail="legacy 3-level · completed only" /><Metric label="V0 exact agreement" value={v0Rate} detail="full 4-level · completed only" /><Metric label="V0 judged wrong" value={String(summary.v0Verdicts.wrong)} detail="new clinician verdicts · after reveal" alert={summary.v0Verdicts.wrong > 0} /></div>
    <AssessmentResults cases={cases} workspace={workspace} summary={summary} />
    <div className="mt-8 grid gap-5 xl:grid-cols-2"><ConfusionMatrix title="Supplied workflow vs physician" matrix={matrices.source} denominator={completed} /><ConfusionMatrix title="V0 vs physician" matrix={matrices.v0} denominator={completed} /></div>
    <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.25fr]">
      <section className="rounded-2xl border border-[#d9e4df] bg-white p-6"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#748b85]">Review identity</p><h3 className="mt-3 text-xl font-semibold tracking-[-.03em]">Name the accountable reviewer.</h3><div className="mt-5 space-y-4"><label className="block"><span className="text-sm font-bold text-[#31544e]">Name</span><input maxLength={200} value={workspace.reviewer.name} onChange={(event) => onReviewer("name", event.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e1dc] px-4 py-3 text-sm" placeholder="Reviewer name" /></label><label className="block"><span className="text-sm font-bold text-[#31544e]">Clinical credentials and context</span><input maxLength={400} value={workspace.reviewer.credentials} onChange={(event) => onReviewer("credentials", event.target.value)} className="mt-2 w-full rounded-xl border border-[#d5e1dc] px-4 py-3 text-sm" placeholder="e.g. MD, emergency medicine" /></label></div></section>
      <section className="rounded-2xl border border-[#b9d3c9] bg-[#f2f9f6] p-6"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#5f7f76]">Final attestation</p><h3 className="mt-3 text-xl font-semibold tracking-[-.03em]">Convert completion into evidence.</h3>{workspace.attestation ? <div className="mt-5 rounded-xl border border-[#abd1c1] bg-white px-4 py-4"><p className="text-sm font-bold text-[#23644f]">Signed by {workspace.attestation.reviewerName}</p><p className="mt-2 text-xs leading-5 text-[#617974]">{workspace.attestation.statement}</p><p className="mt-2 font-mono text-[10px] text-[#7a8f89]">{workspace.attestation.signedAt}</p></div> : <><label className={`mt-5 flex gap-3 rounded-xl border px-4 py-4 ${completed === summary.total ? "cursor-pointer border-[#c5d9d1] bg-white" : "border-[#e0e6e3] bg-[#f4f6f5] opacity-60"}`}><input type="checkbox" disabled={completed !== summary.total} checked={attestationChecked} onChange={(event) => onAttestationChecked(event.target.checked)} className="mt-1 accent-[#176b56]" /><span className="text-sm leading-6 text-[#45645e]">{ATTESTATION_STATEMENT}</span></label><button type="button" disabled={!canSign} onClick={onSign} className="mt-4 rounded-xl bg-[#176b56] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">Sign review attestation</button></>}</section>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#173e3a] px-6 py-5 text-white"><div><p className="text-sm font-bold">Preserve the evidence outside this browser.</p><p className="mt-1 text-xs text-[#c7ded7]">The JSON bundle contains every response, the blinded original, revisions, timestamps, provenance, and a SHA-256 integrity digest.</p></div><button type="button" onClick={onExport} className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-[#17463f]">Export JSON bundle</button></div>
    <div className="mt-5 flex justify-end"><button type="button" onClick={onReset} className="rounded-xl border border-[#e3c7c3] bg-white px-4 py-2.5 text-sm font-bold text-[#93443e] hover:bg-[#fff4f2]">Reset local review</button></div>
  </div></div>;
}

export function AssessmentResults({ cases, workspace, summary }: { cases: EvaluationCase[]; workspace: ReviewWorkspace; summary: ReturnType<typeof summarizeWorkspace> }) {
  const flagged = cases.filter(({ id }) => {
    const record = workspace.records[id];
    return record?.completedAt && [record.sourceAssessment, record.v0Assessment].some((value) => assessmentVerdict(value) === "wrong");
  });
  const legacy = cases.filter(({ id }) => {
    const record = workspace.records[id];
    return record?.completedAt && [record.sourceAssessment, record.v0Assessment].some((value) => value && !isClinicalAssessment(value));
  });
  return <section className="mt-6 rounded-2xl border border-[#d9e4df] bg-white p-5">
    <h3 className="text-lg font-semibold">Clinician verdicts · after reveal</h3>
    <p className="mt-2 text-sm leading-6 text-[#617974]">Completed reviews only. These classify failures; agreement scores above still use your locked route. No training or automatic model update occurs.</p>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-[#d9e4df]"><th scope="col" className="p-2">Assessed</th>{["Appropriate", "Wrong", "Cannot judge", "Earlier ratings"].map((heading) => <th key={heading} scope="col" className="p-2">{heading}</th>)}</tr></thead><tbody>{([["Original label", summary.sourceVerdicts], ["V0 recommendation", summary.v0Verdicts]] as const).map(([label, counts]) => <tr key={label} className="border-b border-[#edf1ef]"><th scope="row" className="p-2 font-medium">{label}</th><td className="p-2">{counts.appropriate}</td><td className="p-2 font-semibold text-[#91423d]">{counts.wrong}</td><td className="p-2">{counts.cannotJudge}</td><td className="p-2">{counts.legacy}</td></tr>)}</tbody></table></div>
    {flagged.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Failure review queue · {flagged.length} cases</summary><ul className="mt-3 space-y-3">{flagged.map(({ id }) => {
      const record = workspace.records[id];
      return <li key={id} className="rounded-xl bg-[#f7faf8] p-3 text-sm leading-6"><strong>{id}</strong> · Original: {assessmentLabel(record.sourceAssessment)} · V0: {assessmentLabel(record.v0Assessment)}<p>Clinician route: {record.finalJudgment ? routeMeta[record.finalJudgment.disposition].label : "Not recorded"}. {record.finalJudgment?.clinicalRationale}</p>{record.comparisonNotes && <p>Correction: {record.comparisonNotes}</p>}</li>;
    })}</ul></details>}
    {legacy.length > 0 && <details className="mt-4"><summary className="cursor-pointer text-sm font-semibold">Earlier ratings preserved · {legacy.length} cases</summary><p className="mt-2 text-xs leading-5 text-[#617974]">Not converted into the new verdicts. In particular, “possible under-triage” has not become confirmed under-triage.</p><ul className="mt-2 space-y-1 text-sm">{legacy.map(({ id }) => <li key={id}>{id} · Original: {assessmentLabel(workspace.records[id].sourceAssessment)} · V0: {assessmentLabel(workspace.records[id].v0Assessment)}</li>)}</ul></details>}
  </section>;
}

function Metric({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className="rounded-2xl border border-[#d9e4df] bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#748b85]">{label}</p><p className={`mt-3 text-3xl font-semibold tracking-[-.05em] ${alert ? "text-[#a3453f]" : "text-[#173c39]"}`}>{value}</p><p className="mt-1 text-xs text-[#718783]">{detail}</p></div>;
}

function confusionMatrix(cases: EvaluationCase[], workspace: ReviewWorkspace, comparator: "source" | "v0") {
  const routes = comparator === "source"
    ? (["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"] as const)
    : (["SELF_CARE", "ASYNC_PHYSICIAN", "SAME_DAY_IN_PERSON", "EMERGENCY_NOW"] as const);
  const labels = comparator === "source" ? ["Self", "Async", "Combined"] : ["Self", "Async", "Same day", "Emergency"];
  const matrix = routes.map((reference) => routes.map((predicted) => cases.filter((reviewCase) => {
    const record = workspace.records[reviewCase.id];
    const comparison = comparator === "source" ? reviewCase.suppliedDisposition : reviewCase.v0.disposition;
    const clinician = record.blindJudgment?.disposition;
    const normalizedClinician = clinician && comparator === "source" ? toLegacyDisposition(clinician) : clinician;
    return record.completedAt && normalizedClinician === reference && comparison === predicted;
  }).length));
  return { matrix, labels };
}

function ConfusionMatrix({ title, matrix: result, denominator }: { title: string; matrix: { matrix: number[][]; labels: string[] }; denominator: number }) {
  const { matrix, labels } = result;
  return <section className="overflow-hidden rounded-2xl border border-[#d9e4df] bg-white"><div className="border-b border-[#e2e9e6] px-5 py-4"><h3 className="text-sm font-bold text-[#31544e]">{title}</h3><p className="mt-1 text-xs text-[#7a8e89]">Rows: physician reference · columns: compared route · n={denominator}</p></div><div className="grid text-center text-xs" style={{ gridTemplateColumns: `repeat(${labels.length + 1}, minmax(0, 1fr))` }}><span className="bg-[#f7faf8] p-3" />{labels.map((label) => <span key={label} className="bg-[#f7faf8] p-3 font-bold text-[#607973]">{label}</span>)}{matrix.flatMap((row, rowIndex) => [<span key={`r-${rowIndex}`} className="bg-[#f7faf8] p-3 font-bold text-[#607973]">{labels[rowIndex]}</span>, ...row.map((value, columnIndex) => <span key={`${rowIndex}-${columnIndex}`} className={`border-l border-t border-[#edf1ef] p-3 text-sm font-bold ${rowIndex === columnIndex ? "bg-[#eaf5f0] text-[#176650]" : value ? "bg-[#fff0ee] text-[#9a403b]" : "text-[#8ca09a]"}`}>{value}</span>)])}</div></section>;
}

function MethodView({ dataset }: { dataset: Dataset }) {
  const mappings = [
    ["Disposition + conditional timing", "Define the reference answer; ask timing separately only for async review", "Clinical fluency · product contract"],
    ["One short reason", "Connect the route to the deciding facts and relevant uncertainty", "Clinical reasoning · clarity"],
    ["Optional uncertainty + notes", "Flag ambiguous references and capture extra detail only when useful", "Resolving ambiguity · failure analysis"],
    ["Original-label and V0 verdicts", "Appropriate / wrong / cannot judge; separate failure summaries and export, not automatic training", "Experimentalism · evaluation design"],
    ["Pre-reveal lock + audit trail", "Preserve original answers, revisions and self-attested reviewer identity", "Accountability · traceability"],
  ];
  return <div className="px-5 py-9 sm:px-8 xl:px-10"><div className="mx-auto max-w-6xl"><span className="rounded-full bg-[#e3f2ec] px-3 py-1.5 text-xs font-bold text-[#17634f]">Assignment loop · reference answer → comparison → score</span><h2 className="balance mt-5 max-w-4xl text-4xl font-semibold tracking-[-.05em] text-[#173b38]">Record the decision. Explain what changes it.</h2><p className="mt-4 max-w-3xl text-base leading-7 text-[#5f7772]">Route and one short reason are required; async timing is asked only when it adds a choice. Extra notes are optional. Original pre-reveal answers remain separate from revisions made after comparison.</p>
    <div className="mt-9 overflow-hidden rounded-2xl border border-[#dce5e2] bg-white"><div className="hidden grid-cols-[220px_1fr_260px] gap-5 border-b border-[#e3e9e7] bg-[#f7faf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#758b86] sm:grid"><span>Captured field</span><span>Take-home purpose</span><span>Role evidence</span></div>{mappings.map(([field, purpose, role]) => <div key={field} className="grid gap-2 border-b border-[#edf1ef] px-5 py-5 last:border-b-0 sm:grid-cols-[220px_1fr_260px] sm:gap-5"><h3 className="text-sm font-bold text-[#234b46]">{field}</h3><p className="text-sm leading-6 text-[#657d78]">{purpose}</p><p className="text-sm font-semibold leading-6 text-[#365f57]">{role}</p></div>)}</div>
    <div className="mt-8 grid gap-4 md:grid-cols-3"><EvidenceItem label="Source cases" value={`${dataset.caseCount} synthetic messages`} detail={`SHA-256 ${dataset.sourceHash.slice(0, 16)}…`} /><EvidenceItem label="Prior proposal" value="Unattested and revealed later" detail={`SHA-256 ${dataset.referenceProposalHash.slice(0, 16)}…`} /><EvidenceItem label="Clinical performance" value="Not estimated" detail="Visible development set; no holdout" /></div>
  </div></div>;
}

function ScaleView() {
  const lanes = [["Screen every thread", "Deterministic escalation checks plus validated rubric judges", "100% automated coverage"], ["Always inspect", "Severe near misses, emergency overrides, incidents, new routes and policy changes", "100% physician review"], ["Estimate quality", "Risk-stratified probability sample across condition, language, channel, subgroup and time", "Weighted metrics + intervals"], ["Find failures", "Disagreement, low confidence, novelty, drift and clinician override signals", "Active-learning queue"], ["Prevent regression", "Frozen sentinels and every resolved critical failure", "Every release"]];
  return <div className="px-5 py-9 sm:px-8 xl:px-10"><div className="mx-auto max-w-6xl"><span className="rounded-full bg-[#e3f2ec] px-3 py-1.5 text-xs font-bold text-[#17634f]">25 million cases · automation plus targeted review</span><h2 className="balance mt-5 max-w-3xl text-4xl font-semibold tracking-[-.05em] text-[#173b38]">Do not scale this form linearly.</h2><p className="mt-4 max-w-3xl text-base leading-7 text-[#5f7772]">The 50-case exercise proves the candidate can author and defend an evaluation. Production needs distinct review streams for incident response, unbiased estimation, failure discovery, and release regression.</p><div className="mt-8 overflow-hidden rounded-2xl border border-[#dce5e2] bg-white"><div className="hidden grid-cols-[170px_1fr_210px] gap-5 border-b border-[#e3e9e7] bg-[#f7faf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#758b86] sm:grid"><span>Review lane</span><span>Selection rule</span><span>Output</span></div>{lanes.map(([lane, rule, output]) => <div key={lane} className="grid gap-2 border-b border-[#edf1ef] px-5 py-5 last:border-b-0 sm:grid-cols-[170px_1fr_210px] sm:gap-5"><h3 className="text-sm font-bold text-[#234b46]">{lane}</h3><p className="text-sm leading-6 text-[#657d78]">{rule}</p><p className="text-sm font-semibold leading-6 text-[#365f57]">{output}</p></div>)}</div><div className="mt-8 grid gap-4 md:grid-cols-2"><section className="rounded-2xl border border-[#d9e4df] bg-white p-6"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#748b85]">More clinicians</p><h3 className="mt-3 text-xl font-semibold tracking-[-.03em]">Calibrate a sampled instrument.</h3><p className="mt-3 text-sm leading-6 text-[#617974]">Use blinded overlap to measure reliability and resolve consequential ambiguity—not to review all 25 million messages.</p></section><section className="rounded-2xl bg-[#173e3a] p-6 text-white"><p className="text-xs font-bold uppercase tracking-[.12em] text-[#a9cec3]">Unit of success</p><h3 className="mt-3 text-xl font-semibold tracking-[-.03em]">A completed safe handoff.</h3><p className="mt-3 text-sm leading-6 text-[#d1e4df]">Monitor urgent completion time, severe false negatives, workload, overrides, subgroup drift, latency, access, and clinical outcomes.</p></section></div></div></div>;
}

function EvidenceItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="rounded-2xl border border-[#d9e4df] bg-white p-5"><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#748b85]">{label}</p><p className="mt-3 text-lg font-semibold tracking-[-.02em]">{value}</p><p className="mt-2 font-mono text-[10px] text-[#78908a]">{detail}</p></div>;
}

function LoadingState() {
  return <div className="grid min-h-[60vh] place-items-center"><p className="text-sm font-semibold text-[#6e837f]">Loading local review progress…</p></div>;
}

function EmptyState() {
  return <div className="grid min-h-[55vh] place-items-center px-6"><div className="max-w-sm text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e2f2eb] text-xl text-[#1a705a]">✓</div><h2 className="mt-4 text-xl font-semibold tracking-[-.03em]">No cases in this slice</h2><p className="mt-2 text-sm leading-6 text-[#708782]">Choose another review filter.</p></div></div>;
}
