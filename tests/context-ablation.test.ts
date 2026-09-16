import test from "node:test";
import assert from "node:assert/strict";
import { contextAblationInputs } from "../src/evaluation/context-ablation.ts";

const packet = {
  patient: "I can put some weight on it if I'm careful.",
  context: { queries: ["ankle injury"], findings: [{ finding: "Can bear weight", quote: "some weight" }], question: null },
  outputInstructions: "Return the unchanged response contract.",
  sources: [{ id: "retained-source", quoteSpans: [{ id: "q0", text: "Conditional fictional passage." }] }],
};
test("removes generated context only, preserving patient, evidence order and output responsibilities", () => {
  const before = JSON.stringify(packet), r = contextAblationInputs(packet);
  assert.equal(r.withoutContext.patient, packet.patient);
  assert.equal(r.withoutContext.outputInstructions, packet.outputInstructions);
  assert.deepEqual(r.withoutContext.sources, packet.sources);
  assert.equal(Object.hasOwn(r.withoutContext, "context"), false);
  assert.deepEqual(r.withContext, packet);
  assert.equal(JSON.stringify(packet), before);
});
test("does not repair generated findings, change queries or introduce gold labels", () => {
  const r = contextAblationInputs(packet);
  assert.deepEqual(r.withContext.context, packet.context);
  assert.throws(() => contextAblationInputs({ ...packet, acceptedRoutes: ["SELF_CARE"] } as typeof packet), /UNEXPECTED_PRODUCER_INPUT/);
  assert.throws(() => contextAblationInputs({ ...packet, safety: "EMERGENCY_NOW" } as typeof packet), /UNEXPECTED_PRODUCER_INPUT/);
  assert.equal(r.commonInputHash, contextAblationInputs({ ...packet, context: null }).commonInputHash);
});
test("returns independent copies and rejects malformed input", () => {
  const r = contextAblationInputs(packet);
  r.withoutContext.sources.push({ id: "extra", quoteSpans: [] });
  assert.equal(packet.sources.length, 1); assert.equal(r.withContext.sources.length, 1);
  assert.throws(() => contextAblationInputs({ ...packet, sources: null } as unknown as typeof packet), /UNEXPECTED_PRODUCER_INPUT/);
});
