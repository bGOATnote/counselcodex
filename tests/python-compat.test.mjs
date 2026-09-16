import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("Python compatibility CLI delegates to the authoritative workflow", () => {
  const message = "Worst headache of my life, out of nowhere. It hit like a thunderclap.";
  const result = spawnSync("python3", ["python/dispo_agent.py", "--id", "PY-TEST", "--message", message], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.id, "PY-TEST");
  assert.equal(output.disposition, "EMERGENCY_NOW");
  assert.equal(output.layer, "hard_escalation_gate");
});

test("Python CSV compatibility path neutralizes spreadsheet formulas", () => {
  const result = spawnSync("python3", [
    "-c",
    "from python.dispo_agent import neutralize_spreadsheet_formula as n; print(n('=1+1'))",
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "'=1+1");
});
