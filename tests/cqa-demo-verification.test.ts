import test from "node:test";
import assert from "node:assert/strict";
import { verifyScriptedDemo } from "../scripts/cqa-demo-verification.ts";

const historical = { manifest: { mode: "scripted", implementationSha256: "a".repeat(64), inputSha256: "input", rubricSha256: "rubric" }, cases: [{ verdict: "PASS" }], providerCallsMade: 0 };
const currentHash = "b".repeat(64);
const current = () => ({ ...structuredClone(historical), manifest: { ...historical.manifest, implementationSha256: currentHash } });
test("CQA demo verifies exact historical behavior without requiring the historical implementation", () => {
  const original = JSON.stringify(historical);
  assert.deepEqual(verifyScriptedDemo(current(), historical, currentHash), { behaviorVerified: true, implementationSha256: currentHash, historicalImplementationSha256: "a".repeat(64), implementationChanged: true });
  assert.equal(JSON.stringify(historical), original);
});
test("CQA demo verification rejects behavior, rubric, inputs and stale or malformed implementation identity", () => {
  for (const mutate of [
    (value: ReturnType<typeof current>) => { value.cases[0].verdict = "FAIL"; },
    (value: ReturnType<typeof current>) => { value.manifest.inputSha256 = "changed"; },
    (value: ReturnType<typeof current>) => { value.manifest.rubricSha256 = "changed"; },
    (value: ReturnType<typeof current>) => { value.providerCallsMade = 1; },
    (value: ReturnType<typeof current>) => { value.manifest.implementationSha256 = "a".repeat(64); },
    (value: ReturnType<typeof current>) => { value.manifest.mode = "provider"; },
  ]) { const value = current(); mutate(value); assert.throws(() => verifyScriptedDemo(value, historical, currentHash)); }
  assert.throws(() => verifyScriptedDemo(current(), historical, "invalid"));
  assert.throws(() => verifyScriptedDemo(current(), { ...historical, manifest: { ...historical.manifest, implementationSha256: "invalid" } }, currentHash));
});
