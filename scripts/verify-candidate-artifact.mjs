import { createHash } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (code) => { throw new Error(code); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const entries = {
  "/api/candidate/route": "app/api/candidate/route.js",
  "/candidate/page": "app/candidate/page.js",
};

/** Inclusion/manifest evidence only; never imports the server or starts a model/index. */
export function verifyCandidateArtifact({ projectDirectory = process.cwd() } = {}) {
  const directory = resolve(projectDirectory, "apps/evaluation/.next");
  const hashes = {};
  const read = name => {
    const path = resolve(directory, name);
    if (relative(directory, path).startsWith("..") || isAbsolute(relative(directory, path))
      || name.split(/[\\/]/).some(part => part === ".env" || part.startsWith(".env."))) fail("CANDIDATE_ARTIFACT_PATH_INVALID");
    try {
      const base = realpathSync(directory), baseRel = relative(realpathSync(projectDirectory), base);
      const actual = realpathSync(path), rel = relative(base, actual);
      if (baseRel.startsWith("..") || isAbsolute(baseRel) || rel.startsWith("..") || isAbsolute(rel) || !statSync(actual).isFile()) fail("CANDIDATE_ARTIFACT_PATH_INVALID");
      const bytes = readFileSync(actual);
      if (!bytes.length) fail("CANDIDATE_ARTIFACT_EMPTY");
      hashes[name] = sha256(bytes);
      return bytes;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("CANDIDATE_")) throw error;
      fail("CANDIDATE_ARTIFACT_FILE_MISSING");
    }
  };
  const parse = name => { try { return JSON.parse(read(name).toString("utf8")); } catch (error) {
    if (error instanceof Error && error.message.startsWith("CANDIDATE_")) throw error;
    fail("CANDIDATE_ARTIFACT_MANIFEST_INVALID");
  } };
  const buildId = read("BUILD_ID").toString("utf8").trim();
  if (!buildId) fail("CANDIDATE_BUILD_ID_INVALID");
  const required = parse("required-server-files.json");
  if (!required || required.version !== 1 || !Array.isArray(required.files) || !required.files.length) fail("CANDIDATE_REQUIRED_FILES_INVALID");
  for (const file of required.files) {
    if (typeof file !== "string" || !file.startsWith(".next/")) fail("CANDIDATE_REQUIRED_FILES_INVALID");
    read(file.slice(".next/".length));
  }
  const paths = parse("server/app-paths-manifest.json");
  if (!paths || typeof paths !== "object" || Array.isArray(paths)) fail("CANDIDATE_ARTIFACT_MANIFEST_INVALID");
  for (const [route, file] of Object.entries(entries)) {
    if (paths[route] !== file) fail("CANDIDATE_ENTRY_MISSING");
    read("server/" + file);
  }
  const trace = parse("server/app/api/candidate/route.js.nft.json");
  if (!trace || trace.version !== 1 || !Array.isArray(trace.files) || trace.files.some(file => typeof file !== "string")) fail("CANDIDATE_TRACE_INVALID");
  for (const dependency of ["@mastra/core", "@electric-sql/pglite"]) {
    if (!trace.files.some(file => file.replaceAll("\\", "/").endsWith("/node_modules/" + dependency + "/package.json"))) fail("CANDIDATE_TRACED_DEPENDENCY_MISSING");
  }
  const files = Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)));
  return { status: "verified", surface: "next-hosted-mastra-candidate", scope: "entry-manifest-and-traced-dependency-inclusion-only",
    buildId, entries, files, artifactIdentity: sha256(JSON.stringify(files)), runtimeExecutionVerified: false, clinicalApproval: false };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyCandidateArtifact(), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
