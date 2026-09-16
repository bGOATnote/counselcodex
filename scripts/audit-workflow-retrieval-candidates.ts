import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildCandidateAudit, buildReviewWorksheet, loadFrozenRetrieval, writeAuditOutputs } from '../src/research/retrieval-candidate-audit.ts';

const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 1 && args[0] === '--verify'), 'Use no arguments to create outputs, or --verify for read-only verification; inputs remain fixed.');
const verifyOnly = args[0] === '--verify';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const sourceFiles = ['src/research/retrieval-candidate-audit.ts', 'scripts/audit-workflow-retrieval-candidates.ts'];
const sourceHashes = Object.fromEntries(sourceFiles.map(name => [name, sha(readFileSync(join(root, name)))]));
const audit = buildCandidateAudit(loadFrozenRetrieval(root));
const artifacts = { 'candidate-comparison.json': audit, 'clinician-review-worksheet.json': buildReviewWorksheet(audit) };
for (const [name, expected] of Object.entries({ ...audit.provenance.inputHashes, ...sourceHashes }))
  assert.equal(sha(readFileSync(join(root, name))), expected, 'Audit source/input changed during computation');
const complete = { schema: 'retrieval-candidate-audit-complete/v1', status: 'offline-diagnostic-only',
  sourceHashes,
  artifactHashes: Object.fromEntries(Object.entries(artifacts).map(([name, value]) => [name, sha(`${JSON.stringify(value, null, 2)}\n`)])),
  inputHashes: audit.provenance.inputHashes, providerCalls: 0 };
const status = writeAuditOutputs(join(root, 'outputs/retrieval-candidate-audit-2026-09-16'), { ...artifacts, 'audit-complete.json': complete }, { verifyOnly });
console.log(JSON.stringify({ status, ...audit.summary, providerCalls: 0 }));
