import test from "node:test";
import assert from "node:assert/strict";
import { recordedThreadContext, UPDATE_PREFIX } from "../lib/thread-context.ts";
import { queuePreview } from "../lib/clinician-queue-presentation.ts";
import type { QueueTask } from "../lib/clinician-queue-store.ts";
test("preview shows decisive latest update while preserving original migraine context", () => {
  const original = "Usual migraine, refill requested.", update = "New right arm weakness and slurred speech.";
  const message = original + UPDATE_PREFIX + update;
  const inputContext = recordedThreadContext([original, original, message], message);
  assert.equal(inputContext.original, original); assert.deepEqual(inputContext.updates, [update]); assert.equal(inputContext.verified, true);
  assert.equal(queuePreview({ message, inputContext } as QueueTask).text, update);
});
test("delimiter inside an original message is not invented update provenance", () => {
  const original = "A quote:" + UPDATE_PREFIX + "not a recorded continuation";
  assert.deepEqual(recordedThreadContext([original], original).updates, []);
});
test("broken or stale history is not silently reinterpreted", () => {
  assert.equal(recordedThreadContext(["A", "B"], "B").verified, false);
  assert.equal(recordedThreadContext(["A"], "A" + UPDATE_PREFIX + "B").verified, false);
});
