import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exactVersion = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const read = (path) => {
  try { return readFileSync(path, "utf8"); }
  catch { return fail("MASTRA_ARTIFACT_FILE_MISSING", path); }
};

/** A built server must ship an installable lock, not silently fall back to fresh resolution. */
export function verifyArtifactManifests({ generated, lock, project, projectLock }) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) fail("MASTRA_ARTIFACT_LOCK_INVALID", "Expected npm lockfile v3 with a root package");
  const dependencies = generated.dependencies;
  if (!dependencies || !Object.keys(dependencies).length) fail("MASTRA_ARTIFACT_DEPENDENCIES_MISSING", "No runtime dependencies");
  const locked = lock.packages[""].dependencies ?? {};
  if (JSON.stringify(Object.keys(dependencies).sort()) !== JSON.stringify(Object.keys(locked).sort())) fail("MASTRA_ARTIFACT_LOCK_MISMATCH", "Root dependency names differ");
  for (const [name, version] of Object.entries(dependencies)) {
    if (!exactVersion.test(version)) fail("MASTRA_ARTIFACT_UNPINNED_DEPENDENCY", name);
    if (locked[name] !== version || lock.packages[`node_modules/${name}`]?.version !== version) fail("MASTRA_ARTIFACT_LOCK_MISMATCH", name);
    // Mastra may externalize a transitive package (for example Hono). Pin it to
    // the reviewed project lock as well as checking explicitly declared deps.
    const declared = project.dependencies?.[name] ?? project.devDependencies?.[name];
    const projectVersion = projectLock.packages?.[`node_modules/${name}`]?.version;
    if ((declared && declared !== version) || projectVersion !== version) fail("MASTRA_ARTIFACT_SOURCE_VERSION_MISMATCH", name);
  }
  return Object.keys(dependencies).sort();
}

export function verifyMastraArtifact({ projectDirectory = process.cwd(), outputDirectory = resolve(projectDirectory, ".mastra/output") } = {}) {
  const manifestText = read(resolve(outputDirectory, "package.json"));
  const lockText = read(resolve(outputDirectory, "package-lock.json"));
  const generated = JSON.parse(manifestText);
  const lock = JSON.parse(lockText);
  const names = verifyArtifactManifests({
    generated, lock,
    project: JSON.parse(read(resolve(projectDirectory, "package.json"))),
    projectLock: JSON.parse(read(resolve(projectDirectory, "package-lock.json"))),
  });
  for (const file of ["index.mjs", "mastra.mjs", "tools.mjs"]) {
    const path = resolve(outputDirectory, file);
    if (!read(path).trim() || !statSync(path).isFile()) fail("MASTRA_ARTIFACT_ENTRY_INVALID", file);
  }
  for (const name of names) {
    const installed = JSON.parse(read(resolve(outputDirectory, "node_modules", name, "package.json")));
    if (installed.name !== name || installed.version !== generated.dependencies[name]) fail("MASTRA_ARTIFACT_INSTALL_MISMATCH", name);
  }
  return {
    status: "verified", scope: "dependency-artifact-only",
    directDependencies: names.length, lockedPackages: Object.keys(lock.packages).length - 1,
    packageSHA256: sha256(manifestText), lockSHA256: sha256(lockText),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(verifyMastraArtifact(), null, 2)); }
  catch (error) {
    console.error(error.message);
    console.error("Mastra installs generated runtime dependencies during build. Cold installs need registry access; a missing lock/install is a failed build, not deployment-ready output. Retry npm run build in a network-enabled build environment. Do not bypass this gate or change model timeouts.");
    process.exitCode = 1;
  }
}
