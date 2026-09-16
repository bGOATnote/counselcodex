# Mastra dependency build verification — 2026-09-14

## Finding

The earlier sandboxed install stall was a **build-environment registry-access problem**, not evidence that live Mastra orchestration was unavailable. The installed Mastra CLI is `1.27.3`; `@mastra/core` is `1.64.0`. No package versions or project lockfile were changed for this correction.

Mastra's documented build creates a server bundle and installs its external runtime dependencies in `.mastra/output`. That install is separate from the workspace's `npm ci`. The inspected installed deployer implementation then runs a second lockfile-generation command. A network-restricted cold build cannot fetch missing packages or registry metadata. [Mastra server build process](https://mastra.ai/docs/deployment/mastra-server).

The installed implementation is at `node_modules/@mastra/deployer/dist/bundler/index.js`: `installDependencies()` invokes the package manager, and `generateNpmLockfile()` runs `npm install --package-lock-only --force`. The latter catches failures and merely warns that deployment will fall back to `npm install`. That permissive fallback was a genuine release-verification gap: a CLI success should not be sufficient when the deployable dependency lock is absent.

## Correction

- `npm run build` still runs the real Mastra CLI, then runs `npm run build:verify`.
- The new verifier requires all three generated JavaScript entry files, an npm v3 lock, exact generated direct dependency versions matching both the artifact lock and reviewed project lock, and an actual matching install in the artifact's own `node_modules`.
- CI now independently runs `npm ci --prefix .mastra/output --omit=dev --no-audit --no-fund`, then verifies the result again. It does not reuse the workspace dependency tree as proof that the output can be installed.
- Failures give an explicit build-environment explanation. They do not change clinical routing, provider configuration, runtime deadlines, or sandbox permissions.

`npm ci` installs from an existing lock and fails rather than updating a manifest/lock mismatch. Root and generated locks serve different deployment units. The generated lock must travel with the built artifact. [npm CI semantics](https://docs.npmjs.com/cli/commands/npm-ci/).

## Verification

All experiments were isolated from the running GUI and performed without model calls:

1. Copied the generated `package.json` and `package-lock.json` to a fresh temporary directory; used a separate, initially empty npm cache. Offline clean install failed immediately with `ENOTCACHED` for a missing package. This is an honest cold-cache failure, not a dependency-resolution or clinical-workflow error.
2. Installed the same locked artifact with registry access: **205 packages installed in 2 seconds** as reported by npm. All seven direct dependencies imported successfully from that isolated install.
3. Repeated `npm ci --offline` against the now-populated cache: **205 packages installed in 2 seconds**. This demonstrates cache-dependent offline installation, not a promise that cold builds work without network access. No offline build default was added.
4. Ran the full network-enabled `npm run build`: Mastra bundled successfully, installed 205 packages in **21 seconds**, generated the deployment lock, and passed the new artifact gate. The logged analyze-to-success interval was approximately **25 seconds**; this is build time, not patient-response latency.
5. Eight authored verifier tests passed, including absent lock, unpinned dependency, manifest/lock mismatch, source-lock drift, and missing/wrong installed package cases. The full `npm test` command, lint, and TypeScript checks also passed.

Verified artifact:

```
direct dependencies: 7
locked packages: 205
package.json SHA-256: dab5b0c76a5e97234fb15b94400d143e8855d18f90a55e030fe38a51fa9f21ef
package-lock.json SHA-256: 69c2acaa0c2c1a69f228ec0db2afd4c402630e2e014fe54facc022f5f27ceb69
```

## Boundaries

This gate proves dependency-artifact consistency and a separately exercised clean installation. It does **not** establish full application deployment readiness, cross-platform native compatibility, model availability, evidence availability, or clinical correctness. Mastra still resolves a generated output tree during build; a bit-for-bit rebuild over time is not established by this check. The CI clean install freezes the generated tree for that artifact, not all future builds.

The current `/candidate` GUI embeds Mastra in Next.js. Mastra officially supports both a standalone server and embedding in an existing web framework. The legacy standalone entry in `src/mastra/index.ts` still locates the repository at runtime (`repositoryRoot()`), so copying only `.mastra/output` is not a verified deployment of this complete application. Do not present that CLI message as proof of a self-contained candidate deployment. Application data/storage configuration and a real server startup/health test belong to the separate deployment-readiness work. [Mastra deployment options](https://mastra.ai/docs/deployment/overview).

Counsel's use of Mastra as a framework does not by itself establish that Counsel deploys on Mastra Cloud or reveal its exact hosting topology. This change keeps the supported framework path intact without making that assumption.
