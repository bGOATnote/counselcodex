import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyArtifactManifests, verifyMastraArtifact } from "../scripts/verify-mastra-artifact.mjs";

const fixture = () => ({
  generated: { dependencies: { "@mastra/core": "1.64.0", hono: "4.13.7" } },
  lock: { lockfileVersion: 3, packages: {
    "": { dependencies: { "@mastra/core": "1.64.0", hono: "4.13.7" } },
    "node_modules/@mastra/core": { version: "1.64.0" }, "node_modules/hono": { version: "4.13.7" },
  } },
  project: { dependencies: { "@mastra/core": "1.64.0" } },
  projectLock: { packages: { "node_modules/@mastra/core": { version: "1.64.0" }, "node_modules/hono": { version: "4.13.7" } } },
});

test("generated runtime dependency pins match both locks, including externalized transitives", () => {
  assert.deepEqual(verifyArtifactManifests(fixture()), ["@mastra/core", "hono"]);
});

for (const [name, mutate, code] of [
  ["missing generated lock", (f) => { f.lock = {}; }, "LOCK_INVALID"],
  ["unpinned dependency", (f) => { f.generated.dependencies.hono = "^4.13.7"; }, "UNPINNED_DEPENDENCY"],
  ["manifest/lock mismatch", (f) => { f.lock.packages[""].dependencies.hono = "4.13.6"; }, "LOCK_MISMATCH"],
  ["resolved lock version mismatch", (f) => { f.lock.packages["node_modules/hono"].version = "4.13.6"; }, "LOCK_MISMATCH"],
  ["source drift", (f) => { f.projectLock.packages["node_modules/hono"].version = "4.13.6"; }, "SOURCE_VERSION_MISMATCH"],
  ["extra generated lock dependency", (f) => { f.lock.packages[""].dependencies.extra = "1.0.0"; }, "LOCK_MISMATCH"],
]) test(`artifact gate rejects ${name}`, () => {
  const f = fixture(); mutate(f);
  assert.throws(() => verifyArtifactManifests(f), new RegExp(code));
});

test("artifact verification requires files and an actual matching local install", () => {
  const directory = mkdtempSync(join(tmpdir(), "counsel-artifact-test-"));
  const output = join(directory, ".mastra/output");
  const f = fixture();
  const write = (path, value) => writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  mkdirSync(output, { recursive: true });
  write(join(directory, "package.json"), f.project);
  write(join(directory, "package-lock.json"), f.projectLock);
  write(join(output, "package.json"), f.generated);
  assert.throws(() => verifyMastraArtifact({ projectDirectory: directory }), /FILE_MISSING/);
  write(join(output, "package-lock.json"), f.lock);
  for (const file of ["index.mjs", "mastra.mjs", "tools.mjs"]) write(join(output, file), "export {};\n");
  for (const [name, version] of Object.entries(f.generated.dependencies)) {
    mkdirSync(join(output, "node_modules", name), { recursive: true });
    write(join(output, "node_modules", name, "package.json"), { name, version });
  }
  assert.equal(verifyMastraArtifact({ projectDirectory: directory }).status, "verified");
  write(join(output, "node_modules/hono/package.json"), { name: "hono", version: "4.13.6" });
  assert.throws(() => verifyMastraArtifact({ projectDirectory: directory }), /INSTALL_MISMATCH/);
});
