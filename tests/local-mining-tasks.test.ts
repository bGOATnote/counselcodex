import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildLocalMiningTasks, LOCAL_MINING_MAX_INPUT_BYTES, localMiningInput } from "../src/evaluation/local-mining-tasks.ts";

test("bounded archived mining inputs retain full fields and source identity without gold", () => {
  const tasks = buildLocalMiningTasks();
  assert.equal(tasks.length, 12);
  assert.equal(tasks.filter(t => t.kind === "mine").length, 8);
  assert.equal(tasks.filter(t => t.kind === "hard_negative").length, 4);
  assert.equal(new Set(tasks.map(t => t.id)).size, tasks.length);
  for (const task of tasks) {
    assert.equal(task.provenance.clinicalApproval, false);
    assert.ok(Buffer.byteLength(JSON.stringify(task.input), "utf8") <= LOCAL_MINING_MAX_INPUT_BYTES);
    for (const dependency of task.provenance.dependencies) {
      assert.doesNotMatch(dependency.sourcePath, /physician|reference|report|evaluation\.json|plan\.json/);
      assert.equal(createHash("sha256").update(readFileSync(dependency.sourcePath)).digest("hex"), dependency.sourceSha256);
    }
    assert.doesNotMatch(JSON.stringify(task.input), /acceptedRoutes|physicianFeedback|expectedVerdict|C\d{2}-(?:candidate|baseline)|NO PROMOTE/);
    if (task.input.sourceText !== null) {
      assert.equal(createHash("sha256").update(task.input.sourceText).digest("hex"), task.provenance.sourcePassageSha256);
      assert.ok(task.provenance.excerptLocations.source);
    } else {
      assert.equal(task.provenance.sourcePassageSha256, null);
    }
  }
  assert.deepEqual(buildLocalMiningTasks(), tasks);
});

test("projection excludes injected metadata at both task and input levels", () => {
  const original = buildLocalMiningTasks()[0];
  const extra = {
    ...original, acceptedRoutes: ["DO_NOT_SEND"], expectedVerdict: "DO_NOT_SEND",
    input: { ...original.input, physicianFeedback: "DO_NOT_SEND", provenance: "DO_NOT_SEND" },
  };
  const input = localMiningInput(extra);
  assert.deepEqual(Object.keys(input), ["patient", "draft", "sourceText"]);
  assert.deepEqual(input, original.input);
  assert.doesNotMatch(JSON.stringify(input), /DO_NOT_SEND/);
  input.patient = "Edited local copy";
  assert.notEqual(original.input.patient, input.patient);
});

test("excerpts preserve original structured findings and full citation qualifications", () => {
  for (const task of buildLocalMiningTasks()) {
    const source = JSON.parse(readFileSync(task.provenance.sourcePath, "utf8"));
    const original = task.provenance.excerptLocations.draft.split(".").reduce((value, key) => value[key], source);
    if (typeof original === "string") assert.equal(task.input.draft, original);
    else if (task.provenance.excerptLocations.draft.includes("citations")) {
      assert.deepEqual(JSON.parse(task.input.draft), { claim: original.claim, applicability: original.applicability, limitation: original.limitation });
    } else assert.deepEqual(JSON.parse(task.input.draft), original);
    const runDependency = task.provenance.dependencies.at(-1)!;
    const run = JSON.parse(readFileSync(runDependency.sourcePath, "utf8"));
    assert.equal(task.input.patient, run.message);
    if (task.provenance.excerptLocations.source) {
      const originalText = task.provenance.excerptLocations.source.split(".").reduce((value, key) => value[key], run);
      assert.equal(task.input.sourceText, originalText);
    }
  }
});
