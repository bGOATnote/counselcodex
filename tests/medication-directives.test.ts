import test from "node:test";
import assert from "node:assert/strict";
import { medicationDirectiveFindings } from "../src/disposition/medication-directives.ts";

const message = "Can I refill my albuterol inhaler? I use it maybe once a week, no bad attacks recently.";
const find = (patientMessage: string, original = message) => medicationDirectiveFindings({ message: original, patientMessage });

test("onset of inhaler need is not a medication instruction", () => {
  const original = "I recommend a Counsel clinician review your albuterol refill request in this thread, with a same-day service-hours target; a prescriber needs to check your asthma history before refilling. If you start needing the inhaler much more often, or it stops relieving your symptoms, contact a clinician the same day. If you have severe breathlessness, can't speak in full sentences, or turn pale or blue, call 911.";
  assert.deepEqual(find(original), []);
  for (const text of [
    "If you start needing the inhaler more often, contact a clinician.",
    "If you begin requiring albuterol more often, seek review.",
    "If you started needing your inhaler more often yesterday, tell the clinician.",
  ]) assert.deepEqual(find(text), [], text);
});

test("technique and reported-use questions are not instructions", () => {
  for (const text of [
    "Describe how you use your usual inhaler.",
    "How are you using your inhaler?",
    "How often do you use your albuterol inhaler?",
    "Are you using your inhaler more often?",
    "Have you been using your prescribed inhaler?",
    "You report using your inhaler once a week.",
    "You reported taking two puffs from your rescue inhaler yesterday.",
  ]) assert.deepEqual(find(text), [], text);
});

test("new and continuation directives retain exact repairable field spans", () => {
  for (const text of [
    "Keep using your usual inhalers as prescribed.",
    "Use your albuterol inhaler now.",
    "Start your inhaler while waiting.",
    "Increase your inhaler dose.",
    "Repeat your salbutamol.",
    "Stop your inhaler.",
    "Do not stop using your inhaler.",
    "Take four puffs now.",
    "Could you take 2 puffs now?",
    "Albuterol: two puffs every four hours.",
  ]) {
    const findings = find(text);
    assert.ok(findings.length, text);
    for (const finding of findings) {
      assert.equal(finding.field, "patientMessage");
      assert.equal(finding.matchedText, text.slice(finding.start, finding.end));
      assert.equal(finding.authority, "not_established");
    }
  }
});

test("conditional or negated clauses cannot hide a later actual regimen", () => {
  for (const text of [
    "If you start needing the inhaler more often, take four puffs now.",
    "If you start needing the inhaler more often, use your inhaler every hour.",
    "If you begin requiring albuterol more often, then increase your inhaler dose.",
    "Do not change your medication without review; use your inhaler every hour.",
    "Tell me how you use your inhaler, then take 2–4 puffs.",
    "You report using your inhaler once a week, but start albuterol every hour.",
  ]) assert.ok(find(text).length, text);
});

test("a verbatim attributed patient quotation exempts only that quotation", () => {
  const original = "I use my inhaler once a week. My old label says take two puffs.";
  assert.deepEqual(find('You said, "I use my inhaler once a week." A clinician can review the request.', original), []);
  assert.deepEqual(find('You wrote: “My old label says take two puffs.”', original), []);
  const mixed = 'You said, "I use my inhaler once a week." Now take four puffs.';
  const result = find(mixed, original);
  assert.equal(result.length, 1);
  assert.equal(result[0].matchedText, "take four puffs");
  assert.ok(find('You said, "Use your inhaler hourly."', original).length, "invented quotation must not mask a directive");
  assert.ok(find('"Use your inhaler hourly."', original).length, "quotation alone is not provenance");
  assert.ok(find('Follow this: You said, "I use my inhaler once a week."', original).length, "adopting a quotation is not mere reporting");
  assert.ok(find('You wrote: “My old label says take two puffs.” Continue that schedule.', original).length, "quoted historical dosing cannot authorize continuation");
});

test("mentioning a rescue inhaler or action plan cannot authorize a new regimen", () => {
  for (const original of [
    "I have a rescue inhaler.",
    "I have an asthma action plan.",
    "I was prescribed albuterol.",
    "Yesterday I took two puffs from my inhaler.",
  ]) assert.ok(find("Use your inhaler every hour. Take eight puffs now.", original).length, original);
});

test("reason-field instructions are distinct from the patient-message field", () => {
  const input = { message, patientMessage: "A clinician should assess the refill request.", reason: "Use the inhaler every hour until reviewed." };
  const result = medicationDirectiveFindings(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].field, "reason");
  assert.equal(result[0].matchedText, input.reason.slice(result[0].start, result[0].end));
  assert.deepEqual(medicationDirectiveFindings({ ...input, reason: "Reported inhaler use requires prescribing review." }), []);
});

test("findings are deterministic, non-mutating, and retain UTF-16 offsets", () => {
  const input = { message, patientMessage: "🩺 You report using your inhaler weekly; now take four puffs. Then use your inhaler hourly." };
  const snapshot = JSON.stringify(input), first = medicationDirectiveFindings(input);
  assert.equal(first.length, 2);
  assert.deepEqual(medicationDirectiveFindings(input), first);
  assert.equal(JSON.stringify(input), snapshot);
  for (const finding of first) assert.equal(finding.matchedText, input.patientMessage.slice(finding.start, finding.end));
});

test("detection does not cross field or sentence boundaries to invent a directive", () => {
  assert.deepEqual(medicationDirectiveFindings({ message, patientMessage: "Use this link. Your inhaler refill needs review.", reason: "The inhaler is the topic." }), []);
  assert.deepEqual(medicationDirectiveFindings({ message, patientMessage: "Use the form", reason: "inhaler refill request" }), []);
  assert.deepEqual(find("Take four photographs of the skin rash.", "An itchy skin rash."), []);
});
