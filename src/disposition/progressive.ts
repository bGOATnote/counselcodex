import { z } from "zod";
import { routingConsequenceSchema } from "./clarification-policy.ts";
import { reconciliationSchema } from "./reconciliation.ts";
import { checkAnswer, hasImmediateEmsDirective, reviewedEmergencyTransportSchema, routes, type DispositionAnswer, type ResponseEvent, type SafetyNotice } from "./contract.ts";

export const SAME_DAY_DIRECTIVE = "Arrange an in-person assessment today. Do not wait for an asynchronous reply. If you cannot arrange this, seek an urgent in-person service today.";
export const higherRoute = (a: string | null, b: string | null) => (routes as readonly (string | null)[]).indexOf(a) >= (routes as readonly (string | null)[]).indexOf(b) ? a : b;

export const responseEventSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("care_revision"), reconciliation: reconciliationSchema, elapsedMs: z.number().nonnegative().optional(), sequence: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal("intake_question"), questionId: z.string().max(60), quote: z.string().min(3).max(160), text: z.string().min(10).max(700), why: z.string().max(400).optional(), decisionChanging: z.boolean().optional(), blocksRouting: z.literal(false).optional(), routingConsequence: routingConsequenceSchema.nullable().optional(), interimInstruction: z.string().max(1600).optional(), elapsedMs: z.number().nonnegative().optional(), sequence: z.number().int().positive().optional(), runId: z.string().uuid().optional() }).strict().refine(event => event.blocksRouting === undefined || event.decisionChanging === undefined && event.routingConsequence === undefined && event.interimInstruction === undefined, { message: "Nonblocking questions cannot declare a routing hold or decision-changing verdict." }),
  z.object({ kind: z.literal("action"), notice: z.object({ disposition: z.enum(["EMERGENCY_NOW", "SAME_DAY_IN_PERSON"]), directive: z.string().min(10).max(1000), source: z.enum(["initial_screen", "emergency_agent"]), elapsedMs: z.number().nonnegative().optional() }).strict(), elapsedMs: z.number().nonnegative().optional(), sequence: z.number().int().positive().optional() }).strict(),
  z.object({ kind: z.literal("patient_reply"), disposition: z.enum(routes), text: z.string().min(20).max(1600), emergencyTransport: reviewedEmergencyTransportSchema.optional(), elapsedMs: z.number().nonnegative().optional(), sequence: z.number().int().positive().optional() }).strict().refine(event => !event.emergencyTransport || event.disposition === "EMERGENCY_NOW" && event.emergencyTransport.directive === event.text, { message: "Reviewed transport must bind the exact emergency reply." }),
  z.object({ kind: z.literal("opening"), quote: z.string().min(3).max(160), text: z.string().max(500), elapsedMs: z.number().nonnegative().optional(), sequence: z.number().int().positive().optional() }).strict(),
]);

// The fast model selects a reported span, never an unrestricted first medical answer.
// The visible sentence is rendered here; instructions inside a quote remain data.
export function openingFromQuote(quote: unknown, message: string): Extract<ResponseEvent, { kind: "opening" }> | null {
  if (typeof quote !== "string" || quote.trim().length < 3 || quote.length > 160 || !message.includes(quote)) return null;
  return { kind: "opening", quote, text: `I’m reviewing what you reported: “${quote}”. I’m checking the appropriate care and timing.` };
}

// Apply the SAME existing patient-prose checks before release. These are bounded
// contract checks, not semantic validation or a clinical safety certificate.
export function patientReplyFailures(disposition: DispositionAnswer["disposition"], patientMessage: string, floor: string | null): string[] {
  const fields: DispositionAnswer = {
    disposition, patientMessage, reason: "Clinical explanation is still being prepared.",
    differential: ["Pending clinical assessment"], redFlags: [{ concern: "Unassessed concerns", status: "unknown", quote: "" }],
    vitalSigns: "Measurements not yet assessed.", questions: [], evidence: [], evidenceLimitations: "Evidence review pending.",
  };
  return checkAnswer(fields, "", [], floor).filter((check) => check.status === "fail" && check.id !== "research_support").map((check) => check.id);
}

// One gate per run. A slower history cannot delay action; a slower independent
// supervisor DOES block release of generated advice. Never forward raw tokens.
export function createProgressiveGate(emit: (event: ResponseEvent) => void) {
  let floor: string | null = null;
  let supervised = false;
  let candidate: Extract<ResponseEvent, { kind: "patient_reply" }> | null = null;
  let published: Extract<ResponseEvent, { kind: "patient_reply" }> | null = null;
  let opened = false;
  let ems = false;
  const publish = () => {
    if (!supervised || !candidate || published || (ems && !hasImmediateEmsDirective(candidate.text)) || patientReplyFailures(candidate.disposition, candidate.text, floor).length) return;
    published = candidate; emit(candidate);
  };
  return {
    action(notice: SafetyNotice) {
      // Delayed same-day callbacks must never replace an earlier emergency.
      if (higherRoute(floor, notice.disposition) !== notice.disposition) return;
      floor = higherRoute(floor, notice.disposition);
      ems ||= notice.disposition === "EMERGENCY_NOW" && hasImmediateEmsDirective(notice.directive);
      emit({ kind: "action", notice });
    },
    supervisor(route: string, valid: boolean) { floor = higherRoute(floor, route); supervised = valid; publish(); },
    opening(quote: unknown, message: string) {
      if (opened || floor || published) return;
      const event = openingFromQuote(quote, message);
      if (event) { opened = true; emit(event); }
    },
    reply(value: unknown) {
      if (!value || typeof value !== "object") return;
      // Called only with CLOSED fields by the transport parser, or a full object.
      const obj = value as Record<string, unknown>;
      if (typeof obj.patientMessage !== "string" || obj.patientMessage.length < 20 || obj.patientMessage.length > 1600 || !(routes as readonly unknown[]).includes(obj.disposition)) return;
      candidate = { kind: "patient_reply", disposition: obj.disposition as DispositionAnswer["disposition"], text: obj.patientMessage };
      publish();
    },
    get published() { return published; },
  };
}

// Delimit complete TOP-LEVEL JSON members, respecting strings, escapes and nested
// arrays/objects. JSON.parse verifies each closed member. Never infer completion
// from objectStream partial strings or assumed schema property order.
export function createClosedReplyParser(onReply: (value: unknown) => void) {
  let buffer = "", depth = 0, inString = false, escaped = false, start = -1, ended = false;
  const fields: Record<string, unknown> = Object.create(null);
  return (chunk: string) => {
    if (buffer.length + chunk.length > 128_000) throw new Error("STREAM_LIMIT_EXCEEDED");
    const offset = buffer.length; buffer += chunk;
    for (let i = offset; i < buffer.length; i++) {
      const char = buffer[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (depth === 0) {
        if (/\s/.test(char)) continue;
        if (char !== "{" || ended) throw new Error("INVALID_STREAM_OBJECT");
        depth = 1; start = i + 1; continue;
      }
      if (char === '"') { inString = true; continue; }
      if (depth === 1 && (char === "," || char === "}")) {
        const member = buffer.slice(start, i).trim();
        if (member) {
          const object = JSON.parse("{" + member + "}") as Record<string, unknown>;
          const keys = Object.keys(object);
          if (keys.length !== 1 || Object.hasOwn(fields, keys[0])) throw new Error("DUPLICATE_STREAM_FIELD");
          fields[keys[0]] = object[keys[0]];
          if (Object.hasOwn(fields, "disposition") && Object.hasOwn(fields, "patientMessage")) onReply({ disposition: fields.disposition, patientMessage: fields.patientMessage });
        } else if (char === ",") throw new Error("INVALID_STREAM_MEMBER");
        start = i + 1;
        if (char === "}") { depth = 0; ended = true; }
      } else if (char === "{" || char === "[") depth++;
      else if (char === "}" || char === "]") depth--;
    }
  };
}
