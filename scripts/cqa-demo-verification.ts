import assert from "node:assert/strict";

type Demo = { manifest: Record<string, unknown>; [key: string]: unknown };
const hash = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Only implementation identity may differ from the immutable historical run.
 * Every behavioral result, input, rubric and other manifest field stays exact.
 */
export function verifyScriptedDemo(current: Demo, historical: Demo, implementationSha256: string) {
  assert.ok(hash(implementationSha256), "Invalid current implementation hash");
  assert.equal(current.manifest.implementationSha256, implementationSha256, "Current artifact does not identify the executed implementation");
  assert.ok(hash(historical.manifest.implementationSha256), "Invalid historical implementation hash");
  assert.equal(current.manifest.mode, "scripted", "Verification must not use provider results");
  const behavior = (value: Demo) => ({ ...value, manifest: { ...value.manifest, implementationSha256: undefined } });
  assert.deepEqual(behavior(current), behavior(historical), "Scripted behavior differs from the historical fixture");
  return { behaviorVerified: true, implementationSha256, historicalImplementationSha256: historical.manifest.implementationSha256,
    implementationChanged: implementationSha256 !== historical.manifest.implementationSha256 };
}
