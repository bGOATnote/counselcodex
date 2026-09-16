import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

for (const [label, start, end, error] of [
  ["future window", "2020-01-01T00:00:00Z", new Date(Date.now() + 86_400_000).toISOString(), "FUTURE_WINDOW_NOT_OBSERVED"],
  ["reversed window", "2020-01-02T00:00:00Z", "2020-01-01T00:00:00Z", "INVALID_WINDOW"],
  ["invalid start", "unknown", "2020-01-01T00:00:00Z", "INVALID_WINDOW"],
]) {
  test(`GUI capture rejects ${label} before creating an artifact`, () => {
    const dir = mkdtempSync(join(tmpdir(), "gui-capture-test-"));
    const plan = join(dir, "plan.json"), out = join(dir, "capture");
    writeFileSync(plan, JSON.stringify({ createdAt: start }));
    const result = spawnSync(process.execPath, ["--experimental-strip-types", "scripts/capture-graph-gui.ts", plan, out, end], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, new RegExp(error));
    assert.equal(existsSync(out), false);
  });
}
