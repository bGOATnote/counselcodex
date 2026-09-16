import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { assertNoUnsupportedClearance, buildResponseSafetyReview } from "../../../src/clinical/response-safety.ts";
import { evaluationCases } from "../lib/cases.ts";

const patient = (content: string) => ({ role: "patient" as const, content });
const flag = (content: string, id: string) => buildResponseSafetyReview([patient(content)]).redFlags.find((item) => item.id === id)!;

test("silence is not denial; explicit current denials are quoted and not disease clearance", () => {
  assert.equal(flag("I need a refill.", "chest").status, "not_assessed");
  const review = buildResponseSafetyReview([patient("No chest pain. I do not have shortness of breath.")]);
  assert.equal(review.redFlags.find((item) => item.id === "chest")!.status, "explicit_denial_recorded");
  assert.equal(review.redFlags.find((item) => item.id === "breathing")!.status, "explicit_denial_recorded");
  assert.deepEqual(review.redFlags.find((item) => item.id === "chest")!.evidence, [{ turn: 1, quote: "No chest pain." }]);
  assert.equal(review.clinicalClearanceEstablished, false);
});

test("hypothetical, quoted, third-person, historical and ambiguous negation cannot clear a flag", () => {
  for (const content of ["If I have no chest pain, am I safe?", "My dad has no chest pain.", "Yesterday I had no chest pain.", 'The instruction says "No chest pain."', "I have no chest pain but I have crushing chest pressure.", "No chest pain or shortness of breath.", "No chest pain?", "I never said I have no chest pain."]) {
    assert.notEqual(flag(content, "chest").status, "explicit_denial_recorded", content);
  }
});

test("per-turn reconciliation never carries a stale denial forward as current clearance", () => {
  const initial = patient("No chest pain.");
  const second = buildResponseSafetyReview([initial, { role: "clinician", content: "Any change?" }, patient("I feel worse.")]);
  assert.equal(second.assessedThroughTurn, 3);
  assert.equal(second.redFlags.find((item) => item.id === "chest")!.status, "prior_denial_needs_recheck");
  const onset = buildResponseSafetyReview([initial, patient("I have chest pain.")]);
  assert.equal(onset.redFlags.find((item) => item.id === "chest")!.status, "reported");
  const resolved = buildResponseSafetyReview([patient("I have chest pain."), patient("No chest pain.")]);
  assert.equal(resolved.redFlags.find((item) => item.id === "chest")!.status, "prior_positive_now_denied");
  assert.equal(flag("I have chest pain. No chest pain.", "chest").status, "conflicting_reports");
  assert.equal(initial.content, "No chest pain.");
});

test("clinician questions are not patient negatives or measurements", () => {
  const review = buildResponseSafetyReview([{ role: "clinician", content: "No chest pain. BP 120/80. Pulse 75." }, patient("I don't know.")]);
  assert.equal(review.redFlags.find((item) => item.id === "chest")!.status, "not_assessed");
  assert.ok(review.vitalSigns.every((item) => item.status === "not_available"));
});

test("vital mentions preserve source context without inventing current normality or units", () => {
  const content = "Yesterday my dad's BP 85/50. My pulse is 140. Temperature 103. SpO2 89%. RR 30.";
  const review = buildResponseSafetyReview([patient(content)]);
  for (const vital of review.vitalSigns) {
    assert.equal(vital.status, "reported_requires_interpretation", vital.id);
    for (const observation of vital.observations) assert.ok(content.includes(observation.quote));
  }
  assert.ok(review.vitalSigns.find((item) => item.id === "blood_pressure")!.observations[0].quote.includes("dad"));
  assert.equal("normal" in review, false);
  assert.equal("NEWS2" in review, false);
});

test("every development case has a non-clearing safety inventory bound to verbatim source evidence", () => {
  for (const row of evaluationCases) {
    assert.ok(row.responseSafety);
    assert.equal(row.responseSafety.clinicalClearanceEstablished, false);
    assert.equal(row.responseSafety.vitalSigns.length, 5);
    for (const flag of row.responseSafety.redFlags) for (const evidence of flag.evidence) assert.ok(row.message.includes(evidence.quote));
  }
});

test("clearance guard rejects unsupported reassurance but allows an honest uncertainty statement", () => {
  for (const claim of ["No red flags.", "Vitals are normal.", "Vital signs stable.", "Hemodynamically stable.", "Without any red flags."]) assert.throws(() => assertNoUnsupportedClearance(claim), /UNSUPPORTED_SAFETY_CLEARANCE/);
  assert.doesNotThrow(() => assertNoUnsupportedClearance("No measurements were provided; physiologic stability is not established."));
});

test("real safety panel is hidden before the independent decision and visibly distinguishes missing vitals", async () => {
  const { transform, loadBindings } = createRequire(import.meta.url)("next/dist/build/swc");
  await loadBindings();
  const { code } = await transform(readFileSync(new URL("../components/response-safety-panel.tsx", import.meta.url), "utf8"), { filename: "response-safety-panel.tsx", jsc: { parser: { syntax: "typescript", tsx: true }, target: "es2022", transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const module = { exports: {} as { ResponseSafetyPanel: (props: Record<string, unknown>) => ReturnType<typeof createElement> } };
  new Function("require", "module", "exports", code)(createRequire(import.meta.url), module, module.exports);
  const Component = module.exports.ResponseSafetyPanel;
  const review = buildResponseSafetyReview([patient("No fever.")]);
  assert.equal(renderToStaticMarkup(createElement(Component, { review, revealed: false })), "");
  const html = renderToStaticMarkup(createElement(Component, { review, revealed: true }));
  assert.match(html, /Denial recorded · category not cleared/);
  assert.match(html, /No fever/);
  assert.match(html, /No numeric reading extracted/);
  assert.match(html, /not a complete clinical screen/);
});
