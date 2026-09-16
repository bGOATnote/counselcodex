# Exact study implementation

After the six calls completed, all 123 implementation files were checked against
the prospective manifest before creating `source-code-snapshot.tar.gz`.
SHA-256: `2b46f3b14680ed2fb2d298d224bb6a78b22f462e7483bc96a6067b58d4c351af`.

Only the explicit manifest's TypeScript/JavaScript sources, study test and
package/lockfile are included. No environment file, key, database or runtime
storage is included. Subsequent registration of the study test in package.json
changes that file's hash; it does not change the frozen study or silently
relabel its implementation. The exact original package is in this archive.
