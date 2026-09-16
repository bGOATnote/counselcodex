import test from "node:test";
import assert from "node:assert/strict";
import { routeMessage } from "../src/workflows/disposition-workflow.mjs";
import { stringifyCsv } from "../src/lib/csv.mjs";

test("hard gate locks a named emergency", async () => {
  const result = await routeMessage({ id: "T1", message: "Worst headache of my life, out of nowhere. It hit like a thunderclap." });
  assert.equal(result.disposition, "EMERGENCY_NOW");
  assert.equal(result.overrideBlocked, true);
  assert.equal(result.subtype, "ed_911");
  assert.equal(result.guideline, null);
});

test("hard gate wins when a message also contains a refill intent", async () => {
  const result = await routeMessage({ id: "T1b", message: "I need a refill, but right now I have crushing chest pressure into my left arm and I am sweaty." });
  assert.equal(result.disposition, "EMERGENCY_NOW");
  assert.equal(result.overrideBlocked, true);
});

test("hard gate recognizes crushing chest pain with plain-language dyspnea", async () => {
  const result = await routeMessage({ message: "I have crushing chest pain and trouble breathing." });
  assert.equal(result.disposition, "EMERGENCY_NOW");
  assert.equal(result.overrideBlocked, true);
  assert.equal(result.subtype, "ed_911");
});

test("same-day in-person is a distinct locked operational route", async () => {
  const result = await routeMessage({ message: "After a long flight, one calf is painful, warm, and swollen. I have no chest pain or shortness of breath." });
  assert.equal(result.disposition, "SAME_DAY_IN_PERSON");
  assert.equal(result.overrideBlocked, true);
  assert.equal(result.subtype, "same_day_inperson");
});

test("an emergency match outranks a simultaneous same-day match", async () => {
  const result = await routeMessage({ message: "After a long flight my calf is painful, warm, and swollen, and now I have sudden shortness of breath and chest pain." });
  assert.equal(result.disposition, "EMERGENCY_NOW");
  assert.equal(result.subtype, "ed_911");
});

test("stable refill reaches async physician", async () => {
  const result = await routeMessage({ id: "T2", message: "Please refill my stable losartan. No symptoms and blood pressure is controlled." });
  assert.equal(result.disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.overrideBlocked, false);
  assert.equal(result.subtype, "refill");
});

test("named low-risk phenotype may route to self care", async () => {
  const result = await routeMessage({ id: "T3", message: "Runny nose and mild sore throat for two days. No fever and eating and drinking fine." });
  assert.equal(result.disposition, "SELF_CARE");
  assert.equal(result.overrideBlocked, false);
});

test("unknown never defaults to self care", async () => {
  const result = await routeMessage({ id: "T4", message: "Something feels different and I would like someone to review it." });
  assert.equal(result.disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.layer, "policy_default");
});

test("parallel branches appear before the hard gate in the trace", async () => {
  const result = await routeMessage({ id: "T5", message: "Could someone explain my cholesterol results?" });
  const ids = result.trace.map(({ step }) => step);
  assert.deepEqual(new Set(ids.slice(0, 2)), new Set(["emergencySupervisor", "intentHistory"]));
  assert.deepEqual(ids.slice(2), ["hardEscalationGate", "dispositionRouter"]);
});

test("empty messages are rejected at the boundary", async () => {
  await assert.rejects(() => routeMessage({ message: "  " }), /non-empty string/);
});

test("negated red flags do not fire the emergency gate", async () => {
  const result = await routeMessage({ message: "No crushing chest pressure, no left arm pain, and I am not sweaty." });
  assert.equal(result.disposition, "ASYNC_PHYSICIAN");
  assert.equal(result.overrideBlocked, false);
});

test("format characters cannot split a named emergency token", async () => {
  const result = await routeMessage({ message: "Worst headache of my life. It hit like a thunder\u200Bclap." });
  assert.equal(result.disposition, "EMERGENCY_NOW");
});

test("local trace excludes raw message and external case id", async () => {
  const result = await routeMessage({ id: "CASE_CANARY", message: "Routine question TRACE_CANARY" });
  assert.equal(JSON.stringify(result.trace).includes("TRACE_CANARY"), false);
  assert.equal(JSON.stringify(result.trace).includes("CASE_CANARY"), false);
  for (const span of result.trace) {
    assert.equal("rationale" in span.output, false);
    assert.equal("patientDirective" in span.output, false);
    assert.equal("summary" in span.output, false);
  }
});

test("CSV exports neutralize spreadsheet formulas from untrusted fields", () => {
  const csv = stringifyCsv([{ message: "=HYPERLINK(\"https://attacker.invalid\")" }]);
  assert.equal(csv, "message\n\"'=HYPERLINK(\"\"https://attacker.invalid\"\")\"\n");
});
