import { createHash } from "node:crypto";
import { constants, closeSync, fstatSync, openSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { responseEventSchema } from "./progressive.ts";
import type { SafetyNotice } from "./contract.ts";

export const PATIENT_UPDATE_SEPARATOR = "\n\nAdditional patient information: ";
export const clarificationReferenceSchema = z.object({
  runId: z.string().uuid(),
  questionId: z.string().regex(/^adaptive-[a-f0-9]{16}$/),
}).strict();
export type ClarificationReference = z.infer<typeof clarificationReferenceSchema>;
export type RecordedSafetyFloor = { disposition: "EMERGENCY_NOW" | "SAME_DAY_IN_PERSON"; directive: string; requiresEms: boolean };
export type TrustedClarification = ClarificationReference & { question: string; answer: string; priorSafetyFloor: RecordedSafetyFloor | null };

// This reads controlled, persisted action notices, not arbitrary patient prose.
// An introductory explanation must not hide an unconditional ambulance action.
// It differs from the final-answer requirement that EMS action come FIRST.
export function hasUnconditionalEmsNotice(notice: Pick<SafetyNotice, "disposition" | "directive">): boolean {
  return notice.disposition === "EMERGENCY_NOW" && notice.directive.split(/[.!?]/).some((sentence) => {
    const tail = /^(?:please\s+)?call\s+(?:911|emergency services)\b(.*)$/i.exec(sentence.trim())?.[1].trim();
    return tail !== undefined && (tail === "" || /^(?:now|immediately|and)\b/i.test(tail)) && !/^(?:(?:now|immediately)\s+)?(?:if|unless|when)\b/i.test(tail);
  });
}

const MAX_CONTEXT_TURNS = 8;
const MAX_EVENT_BYTES = 512 * 1024;
const hash = (value: unknown) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const inputSchema = z.string().min(1).max(12_000).refine((value) => value.trim().length > 0);
const startSchema = z.object({
  type: z.literal("start"), runId: z.string().uuid(), message: inputSchema,
  inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  clarificationReference: clarificationReferenceSchema.optional(),
});
const questionSchema = z.object({
  kind: z.literal("intake_question"), questionId: z.string().regex(/^adaptive-[a-f0-9]{16}$/),
  quote: z.string().min(3).max(160), text: z.string().min(10).max(350),
  why: z.string().min(10).max(400), decisionChanging: z.boolean(),
  sequence: z.number().int().positive(), runId: z.string().uuid().optional(),
});

function readEvents(directory: string, runId: string): unknown[] {
  // runId is schema-validated before path construction. Refuse symlinks and
  // non-regular/oversized files; an in-progress run needs only its flushed log.
  const descriptor = openSync(join(directory, "events", `${runId}.jsonl`), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_EVENT_BYTES) throw new Error("INVALID_EVENT_FILE");
    const bytes = readFileSync(descriptor, "utf8");
    if (!bytes.endsWith("\n")) throw new Error("INCOMPLETE_EVENT_RECORD");
    return bytes.slice(0, -1).split("\n").map((line) => JSON.parse(line));
  } finally { closeSync(descriptor); }
}

/**
 * Resolve assistant text ONLY from server-owned, already-emitted event records.
 * Patient text is never parsed for role delimiters or removed from the screen.
 * Hashes detect inconsistent local records; they are not signatures, access
 * control, or protection against an attacker able to rewrite the event store.
 */
export function resolveClarificationContext(directory: string, message: string, reference?: unknown): TrustedClarification[] {
  if (reference === undefined) return [];
  const seen = new Set<string>();
  function resolve(currentMessage: string, value: unknown): TrustedClarification[] {
    const ref = clarificationReferenceSchema.parse(value);
    inputSchema.parse(currentMessage);
    if (seen.size >= MAX_CONTEXT_TURNS || seen.has(ref.runId)) throw new Error("INVALID_CONTEXT_CHAIN");
    seen.add(ref.runId);
    const records = readEvents(directory, ref.runId);
    const start = startSchema.parse(records[0]);
    if (start.runId !== ref.runId || start.inputHash !== hash(start.message)) throw new Error("INVALID_RUN_IDENTITY");
    const prefix = start.message + PATIENT_UPDATE_SEPARATOR;
    if (!currentMessage.startsWith(prefix)) throw new Error("INVALID_UPDATE_LINEAGE");
    const answer = currentMessage.slice(prefix.length);
    if (answer.length < 10 || answer !== answer.trim()) throw new Error("INVALID_PATIENT_UPDATE");
    // Select the last emitted question, not a model's unapproved draft or a
    // client-supplied question. Reject a reference to a superseded question.
    const events = records.filter((record): record is { type: string; event: unknown } => Boolean(record && typeof record === "object" && (record as { type?: unknown }).type === "response_event"));
    const questions = events.map((record) => record.event).filter((event) => event && typeof event === "object" && (event as { kind?: unknown }).kind === "intake_question");
    const question = questionSchema.parse(questions.at(-1));
    if (question.questionId !== ref.questionId || (question.runId !== undefined && question.runId !== ref.runId)) throw new Error("INVALID_QUESTION_IDENTITY");
    const canonical = { question: question.text, why: question.why, quote: question.quote };
    if (question.questionId !== `adaptive-${hash(canonical).slice(0, 16)}` || !start.message.includes(question.quote)) throw new Error("INVALID_QUESTION_PROVENANCE");
    const previous = start.clarificationReference === undefined ? [] : resolve(start.message, start.clarificationReference);
    // Each entry carries the effective action after replaying its lineage, not
    // just this run's additions. Explicit revisions can retire an older action.
    let priorSafetyFloor: RecordedSafetyFloor | null = previous.at(-1)?.priorSafetyFloor ?? null;
    for (const record of events) {
      if (!record.event || typeof record.event !== "object" || !["action", "care_revision"].includes(String((record.event as { kind?: unknown }).kind))) continue;
      const event = responseEventSchema.parse(record.event);
      if (event.kind === "care_revision") {
        const r = event.reconciliation;
        if (r.status !== "revised" || !priorSafetyFloor || r.from.disposition !== priorSafetyFloor.disposition || r.from.directive !== priorSafetyFloor.directive) throw new Error("INVALID_CARE_REVISION");
        priorSafetyFloor = r.to.disposition === "EMERGENCY_NOW" || r.to.disposition === "SAME_DAY_IN_PERSON" ? { ...r.to, disposition: r.to.disposition, requiresEms: hasUnconditionalEmsNotice({ disposition: r.to.disposition, directive: r.to.directive }) } : null;
        continue;
      }
      if (event.kind !== "action") throw new Error("INVALID_ACTION_EVENT");
      const next: RecordedSafetyFloor = { disposition: event.notice.disposition, directive: event.notice.directive, requiresEms: hasUnconditionalEmsNotice(event.notice) };
      if (!priorSafetyFloor || (priorSafetyFloor.disposition !== "EMERGENCY_NOW" && next.disposition === "EMERGENCY_NOW") || (next.disposition === priorSafetyFloor.disposition && (!priorSafetyFloor.requiresEms || next.requiresEms))) priorSafetyFloor = next;
    }
    return [...previous, { ...ref, question: question.text, answer, priorSafetyFloor }];
  }
  try { return resolve(message, reference); }
  catch { throw new Error("CLARIFICATION_CONTEXT_INVALID"); }
}
