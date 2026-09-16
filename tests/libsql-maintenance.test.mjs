import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LibSQLStore } from "@mastra/libsql";

const workflowName = "dependency-storage-regression";
const snapshot = (runId) => ({
  runId, status: "running", value: {}, context: {}, serializedStepGraph: [],
  activePaths: [], activeStepsPath: {}, suspendedPaths: {}, resumeLabels: {}, waitingPaths: {}, timestamp: 1,
});

// LibSQL 1.22.5 repairs in-memory table loss after an interactive transaction.
// Keep this on the public storage API and disposable, nonclinical data only.
for (const kind of ["memory", "file"]) {
  test(`LibSQL ${kind} retains workflow rows across consecutive transactions and concurrent access`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "counsel-libsql-maintenance-"));
    const url = kind === "memory" ? ":memory:" : `file:${join(directory, "test.db")}`;
    let store = new LibSQLStore({ id: `maintenance-${kind}`, url });
    try {
      await store.init();
      let workflows = await store.getStore("workflows");
      assert.ok(workflows);
      await workflows.persistWorkflowSnapshot({ workflowName, runId: "first", snapshot: snapshot("first") });
      await workflows.persistWorkflowSnapshot({ workflowName, runId: "second", snapshot: snapshot("second") });

      // Each update opens and commits an interactive transaction. Both rows and
      // their table must still exist after the first transaction completes.
      await workflows.updateWorkflowState({ workflowName, runId: "first", opts: { status: "suspended" } });
      await workflows.updateWorkflowState({ workflowName, runId: "second", opts: { status: "success", result: { sequence: 2 } } });
      assert.equal((await workflows.loadWorkflowSnapshot({ workflowName, runId: "first" })).status, "suspended");
      assert.deepEqual((await workflows.loadWorkflowSnapshot({ workflowName, runId: "second" })).result, { sequence: 2 });

      // Concurrent callers must be queued safely; reading the unchanged second
      // row alongside two transactions must not throw TRANSACTION_ACTIVE.
      const [, , readback] = await Promise.all([
        workflows.updateWorkflowState({ workflowName, runId: "first", opts: { status: "success", result: { sequence: 1 } } }),
        workflows.updateWorkflowState({ workflowName, runId: "second", opts: { status: "success", result: { sequence: 2 } } }),
        workflows.loadWorkflowSnapshot({ workflowName, runId: "second" }),
      ]);
      assert.deepEqual(readback.result, { sequence: 2 });
      assert.deepEqual((await workflows.loadWorkflowSnapshot({ workflowName, runId: "first" })).result, { sequence: 1 });

      if (kind === "file") {
        await store.close();
        store = new LibSQLStore({ id: "maintenance-reopen", url });
        await store.init();
        workflows = await store.getStore("workflows");
        assert.ok(workflows);
        for (const [runId, sequence] of [["first", 1], ["second", 2]]) {
          const saved = await workflows.loadWorkflowSnapshot({ workflowName, runId });
          assert.equal(saved.status, "success");
          assert.deepEqual(saved.result, { sequence });
        }
      }
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
