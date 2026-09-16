import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { verifyCandidateArtifact } from "../scripts/verify-candidate-artifact.mjs";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "candidate-artifact-test-"));
  const directory = join(root, "apps/evaluation/.next");
  const put = (name, value) => { const file = join(directory, name); mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)); };
  put("BUILD_ID", "synthetic-build-only");
  put("package.json", { type: "commonjs" });
  put("required-server-files.json", { version: 1, files: [".next/package.json"] });
  put("server/app-paths-manifest.json", { "/api/candidate/route": "app/api/candidate/route.js", "/candidate/page": "app/candidate/page.js" });
  // Throwing bodies prove verification reads files rather than importing them.
  put("server/app/api/candidate/route.js", 'throw new Error("MUST_NOT_EXECUTE_ARTIFACT");');
  put("server/app/candidate/page.js", 'throw new Error("MUST_NOT_EXECUTE_ARTIFACT");');
  put("server/app/api/candidate/route.js.nft.json", { version: 1, files: ["../../node_modules/@mastra/core/package.json", "../../node_modules/@electric-sql/pglite/package.json"] });
  return { root, directory, put };
}
test("candidate artifact gate verifies real manifest entries without claiming runtime or clinical correctness", () => {
  const f = fixture(), result = verifyCandidateArtifact({ projectDirectory: f.root });
  assert.equal(result.status, "verified"); assert.equal(result.runtimeExecutionVerified, false); assert.equal(result.clinicalApproval, false);
  assert.equal(result.entries["/api/candidate/route"], "app/api/candidate/route.js");
  assert.match(result.artifactIdentity, /^[a-f0-9]{64}$/);
  f.put("server/app/api/candidate/route.js", 'throw new Error("CHANGED_NOT_EXECUTED");');
  assert.notEqual(verifyCandidateArtifact({ projectDirectory: f.root }).artifactIdentity, result.artifactIdentity);
});
for (const [name, path, value, error] of [
  ["missing candidate", "server/app-paths-manifest.json", { "/page": "app/page.js" }, /CANDIDATE_ENTRY_MISSING/],
  ["wrong candidate target", "server/app-paths-manifest.json", { "/api/candidate/route": "app/api/disposition/route.js" }, /CANDIDATE_ENTRY_MISSING/],
  ["unsupported manifest", "required-server-files.json", { version: 2, files: [".next/package.json"] }, /CANDIDATE_REQUIRED_FILES_INVALID/],
  ["missing generated file", "required-server-files.json", { version: 1, files: [".next/not-present.json"] }, /CANDIDATE_ARTIFACT_FILE_MISSING/],
  ["outside build path", "required-server-files.json", { version: 1, files: [".next/../../.env"] }, /CANDIDATE_ARTIFACT_PATH_INVALID/],
  ["untraced Mastra", "server/app/api/candidate/route.js.nft.json", { version: 1, files: [] }, /CANDIDATE_TRACED_DEPENDENCY_MISSING/],
  ["unsupported trace", "server/app/api/candidate/route.js.nft.json", { version: 2, files: [] }, /CANDIDATE_TRACE_INVALID/],
]) test("candidate artifact gate rejects " + name, () => { const f = fixture(); f.put(path, value); assert.throws(() => verifyCandidateArtifact({ projectDirectory: f.root }), error); });
test("default build covers both surfaces once and compatibility aliases do not recurse", () => {
  const root = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
  const workspace = JSON.parse(readFileSync(new URL("../apps/evaluation/package.json", import.meta.url), "utf8")).scripts;
  assert.equal(root.build, "npm run build:candidate && npm run build:mastra");
  assert.equal(root["build:candidate"], "npm run build --workspace @counselcodex/evaluation && npm run build:candidate:verify");
  assert.equal(root["build:mastra"], "MASTRA_TELEMETRY_DISABLED=true mastra build && npm run build:mastra:verify");
  assert.equal(root["review:build"], "npm run build:candidate");
  assert.equal(workspace.build, "next build --webpack");
  assert.ok(!root.validate.includes("review:build"));
});

test("entry fingerprint hashes original bytes, not UTF-8 decode/reencode replacements", () => {
  const f = fixture();
  const first = Buffer.from([0x80]), second = Buffer.from([0x81]);
  assert.equal(first.toString("utf8"), second.toString("utf8"));
  f.put("server/app/api/candidate/route.js", first);
  const a = verifyCandidateArtifact({ projectDirectory: f.root });
  f.put("server/app/api/candidate/route.js", second);
  const b = verifyCandidateArtifact({ projectDirectory: f.root });
  assert.notEqual(a.artifactIdentity, b.artifactIdentity);
  assert.equal(b.runtimeExecutionVerified, false, "byte identity does not declare malformed code runnable");
});
test("symlinks cannot escape the artifact or project root", () => {
  const f = fixture(), outside = fixture(), target = join(f.directory, "server/app/api/candidate/route.js");
  renameSync(target, target + ".saved");
  symlinkSync(join(outside.directory, "server/app/api/candidate/route.js"), target);
  assert.throws(() => verifyCandidateArtifact({ projectDirectory: f.root }), /CANDIDATE_ARTIFACT_PATH_INVALID/);
  const rootEscape = fixture();
  renameSync(rootEscape.directory, rootEscape.directory + ".saved");
  symlinkSync(outside.directory, rootEscape.directory, "dir");
  assert.throws(() => verifyCandidateArtifact({ projectDirectory: rootEscape.root }), /CANDIDATE_ARTIFACT_PATH_INVALID/);
});
test("blank build identity, malformed JSON and environment-file paths are rejected", () => {
  for (const [name, value, code] of [
    ["BUILD_ID", " \n", /CANDIDATE_BUILD_ID_INVALID/],
    ["server/app-paths-manifest.json", "null", /CANDIDATE_ARTIFACT_MANIFEST_INVALID/],
    ["server/app-paths-manifest.json", "{", /CANDIDATE_ARTIFACT_MANIFEST_INVALID/],
    ["required-server-files.json", { version: 1, files: [".next/.env.local"] }, /CANDIDATE_ARTIFACT_PATH_INVALID/],
    ["required-server-files.json", { version: 1, files: [".next/../.next-extra/file"] }, /CANDIDATE_ARTIFACT_PATH_INVALID/],
    ["server/app/api/candidate/route.js.nft.json", { version: 1, files: [null] }, /CANDIDATE_TRACE_INVALID/],
  ]) {
    const f = fixture(); f.put(name, value);
    assert.throws(() => verifyCandidateArtifact({ projectDirectory: f.root }), code);
  }
});
