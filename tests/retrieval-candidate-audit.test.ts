import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { AUDIT_LIMITS, buildCandidateAudit, buildReviewWorksheet, cosineSimilarity, loadFrozenRetrieval, rankCandidates, writeAuditOutputs } from '../src/research/retrieval-candidate-audit.ts';
import { evidenceCardSetHash, evidenceEmbeddingText, evidenceSha256, parseEvidenceCards, type FrozenDenseVectors } from '../src/research/workflow-aware/evidence.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cards = parseEvidenceCards(JSON.parse(readFileSync(join(root, 'data/research/workflow-aware-v1/evidence-cards.json'), 'utf8')));
const asOf = '2026-09-16';
const fixedMessage = 'I rolled my ankle today.';
function dense(message = fixedMessage): FrozenDenseVectors {
  return { model: 'text-embedding-3-large', revision: 'test-vector-fixture-only', dimensions: 2,
    cardSetHash: evidenceCardSetHash(cards), queryHash: evidenceSha256(message), queryVector: [1, 0],
    cardVectors: Object.fromEntries(cards.map((card, index) => [card.id, { contentHash: card.contentHash,
      embeddingTextHash: evidenceSha256(evidenceEmbeddingText(card)), vector: [1, index / 10] }])) };
}
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');

test('cosine rejects malformed, zero, overflow, nonfinite and dimension-mismatched vectors', () => {
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [-1, 0]), -1);
  for (const value of [[0, 0], [NaN, 1], [Infinity, 1], [Number.MAX_VALUE, Number.MAX_VALUE], [1], [1, 2, 3]])
    assert.throws(() => cosineSimilarity([1, 0], value));
  assert.throws(() => cosineSimilarity(Array(1537).fill(1), Array(1537).fill(1)));
});

test('ranking checks model, query/card/text hashes and complete vector identity', () => {
  const cases = [
    (v: FrozenDenseVectors) => { v.model = 'different-model'; },
    (v: FrozenDenseVectors) => { v.queryHash = '0'.repeat(64); },
    (v: FrozenDenseVectors) => { v.cardSetHash = '0'.repeat(64); },
    (v: FrozenDenseVectors) => { v.cardVectors[cards[0].id].contentHash = '0'.repeat(64); },
    (v: FrozenDenseVectors) => { v.cardVectors[cards[0].id].embeddingTextHash = '0'.repeat(64); },
    (v: FrozenDenseVectors) => { delete v.cardVectors[cards[0].id]; },
    (v: FrozenDenseVectors) => { v.cardVectors[cards[0].id].vector = [0, 0]; },
  ];
  for (const change of cases) { const v = dense(); change(v); assert.throws(() => rankCandidates({ message: fixedMessage, cards, dense: v, asOf })); }
});

test('top-k, RRF, message and vector dimensions have strict bounds', () => {
  for (const topK of [0, 4, 1.5, Infinity]) assert.throws(() => rankCandidates({ message: fixedMessage, cards, dense: dense(), asOf, topK }));
  for (const rrfK of [0, 1001, NaN]) assert.throws(() => rankCandidates({ message: fixedMessage, cards, dense: dense(), asOf, rrfK }));
  const huge = 'x'.repeat(AUDIT_LIMITS.messageBytes + 1);
  assert.throws(() => rankCandidates({ message: huge, cards, dense: dense(huge), asOf }));
  const v = dense(); v.dimensions = 1537; assert.throws(() => rankCandidates({ message: fixedMessage, cards, dense: v, asOf }));
});

test('equal cosines and RRF ties use card ID independent of source array order', () => {
  const v = dense(); Object.values(v.cardVectors).forEach(entry => { entry.vector = [1, 0]; });
  const a = rankCandidates({ message: fixedMessage, cards, dense: v, asOf });
  const b = rankCandidates({ message: fixedMessage, cards: [...cards].reverse(), dense: v, asOf });
  assert.deepEqual(a, b);
  assert.deepEqual(a.ungatedDenseTopKIds, cards.map(c => c.id).sort().slice(0, 3));
});

test('union preserves lexical-only and dense-only candidates with absent-list score zero', () => {
  const v = dense();
  const lexicalIds = ['adult-ankle-imaging', 'sprain-care'];
  const denseOnly = cards.map(c => c.id).filter(id => !lexicalIds.includes(id)).sort().slice(0, 3);
  for (const [id, entry] of Object.entries(v.cardVectors)) entry.vector = denseOnly.includes(id) ? [1, denseOnly.indexOf(id) / 10] : [-1, 0];
  const audit = rankCandidates({ message: fixedMessage, cards, dense: v, asOf });
  assert.deepEqual(new Set(audit.unionCandidateIds), new Set([...lexicalIds, ...denseOnly]));
  assert.equal(audit.unionCandidateIds.length, 5);
  const lexicalFirst = audit.cards.find(c => c.sourceCardId === audit.originalLexicalIds[0])!;
  const denseFirst = audit.cards.find(c => c.sourceCardId === audit.ungatedDenseTopKIds[0])!;
  assert.equal(lexicalFirst.unionRRFScore, 1 / 61); assert.equal(denseFirst.unionRRFScore, 1 / 61);
  assert.equal(audit.unionRRFTopKIds.length, 3);
});

test('ungated discovery exposes original population exclusions instead of implying admissibility', () => {
  const message = 'My 10-year-old twisted her ankle while playing.';
  const v = dense(message);
  for (const [id, entry] of Object.entries(v.cardVectors)) entry.vector = id === 'adult-ankle-imaging' ? [1, 0] : [0, 1];
  const audit = rankCandidates({ message, cards, dense: v, asOf });
  const candidate = audit.cards.find(card => card.sourceCardId === 'adult-ankle-imaging')!;
  assert.equal(candidate.originalExclusion, 'explicit-pediatric-scope');
  assert.equal(candidate.selected.originalHybrid, false);
  assert.equal(candidate.selected.ungatedDenseTopK, true);
  assert.equal(candidate.clinicalReview, 'unreviewed');
});

test('ungated top-k returns candidates for an unrelated no-selection query without asserting relevance', () => {
  const message = 'Please correct the spelling on my billing receipt.';
  const audit = rankCandidates({ message, cards, dense: dense(message), asOf });
  assert.deepEqual(audit.originalHybridIds, []); assert.equal(audit.ungatedDenseTopKIds.length, 3);
  assert(audit.cards.every(card => card.originalExclusion === 'no-topic-match'));
  assert(audit.cards.every(card => card.clinicalReview === 'unreviewed'));
});

function fixture() {
  const temp = mkdtempSync(join(tmpdir(), 'retrieval-audit-test-'));
  const retrieval = 'outputs/workflow-aware-disposition-2026-09-16/retrieval';
  const names = ['generation-complete.json', 'manifest.json', 'plan-complete.json', 'runtime/package-lock.json', 'lexical-inventory.json',
    'embedding-1-raw.json', 'embedding-1-receipt.json', 'embedding-2-raw.json', 'embedding-2-receipt.json', 'retrieval-comparison.json', 'evidence-packets.json'].map(name => `${retrieval}/${name}`);
  names.push('outputs/workflow-aware-disposition-2026-09-16/messages.json', 'data/research/workflow-aware-v1/evidence-cards.json',
    'src/research/workflow-aware/embeddings.ts', 'src/research/workflow-aware/evidence.ts', 'src/research/workflow-aware/budget.ts', 'scripts/workflow-aware-evidence.ts');
  for (const name of names) { const dest = join(temp, name); mkdirSync(dirname(dest), { recursive: true }); copyFileSync(join(root, name), dest); }
  const path = (name: string) => join(temp, retrieval, name);
  const read = (name: string) => JSON.parse(readFileSync(path(name), 'utf8'));
  const write = (name: string, value: unknown) => writeFileSync(path(name), `${JSON.stringify(value, null, 2)}\n`);
  const reseal = () => { const completion = read('generation-complete.json'); for (const name of Object.keys(completion.artifactHashes)) completion.artifactHashes[name] = hash(readFileSync(path(name))); write('generation-complete.json', completion); };
  return { temp, path, read, write, reseal, cleanup: () => rmSync(temp, { recursive: true, force: true }) };
}

test('frozen input authentication rejects archive and source drift before ranking', () => {
  const f = fixture();
  try {
    const raw = f.read('embedding-1-raw.json'); raw.status = 500; f.write('embedding-1-raw.json', raw);
    assert.throws(() => loadFrozenRetrieval(f.temp), /Frozen artifact hash mismatch/);
    copyFileSync(join(root, 'outputs/workflow-aware-disposition-2026-09-16/retrieval/embedding-1-raw.json'), f.path('embedding-1-raw.json'));
    writeFileSync(join(f.temp, 'src/research/workflow-aware/evidence.ts'), 'changed');
    assert.throws(() => loadFrozenRetrieval(f.temp), /Frozen retrieval source hash mismatch/);
  } finally { f.cleanup(); }
});

test('even rehashed malicious receipt/vector and manifest input changes are rejected', () => {
  const f = fixture();
  try {
    const receipt = f.read('embedding-1-receipt.json'); receipt.entries[0].vector[0] += 0.1; f.write('embedding-1-receipt.json', receipt); f.reseal();
    assert.throws(() => loadFrozenRetrieval(f.temp), /Raw-to-receipt vector parity/);
    const manifest = f.read('manifest.json'); manifest.messagesPath = 'data/evaluation/forbidden-clinical-reference.json'; f.write('manifest.json', manifest); f.reseal();
    assert.throws(() => loadFrozenRetrieval(f.temp), /reference-free allowlist/);
  } finally { f.cleanup(); }
});

test('model and malformed vectors are rejected after artifact rehash', () => {
  const f = fixture();
  try {
    const raw = f.read('embedding-1-raw.json'), response = JSON.parse(raw.responseText); response.model = 'different-model'; raw.responseText = JSON.stringify(response); f.write('embedding-1-raw.json', raw); f.reseal();
    assert.throws(() => loadFrozenRetrieval(f.temp), /Embedding response model mismatch/);
    response.model = 'text-embedding-3-large'; response.data[0].embedding = Array(1536).fill(0); raw.responseText = JSON.stringify(response); f.write('embedding-1-raw.json', raw); f.reseal();
    assert.throws(() => loadFrozenRetrieval(f.temp), /Invalid vector norm/);
  } finally { f.cleanup(); }
});

test('unsealed comparison files must still reconstruct from authenticated inputs', () => {
  const f = fixture();
  try {
    const comparison = f.read('retrieval-comparison.json');
    comparison.rows[0].selectedOrderChanged = !comparison.rows[0].selectedOrderChanged;
    f.write('retrieval-comparison.json', comparison);
    assert.throws(() => loadFrozenRetrieval(f.temp), /Original retrieval selection does not reconstruct/);
  } finally { f.cleanup(); }
});

test('full audit reproduces original selection without clinical-reference or disposition-response inputs', () => {
  const input = loadFrozenRetrieval(root), first = buildCandidateAudit(input), second = buildCandidateAudit(input);
  assert.deepEqual(first, second); assert.equal(first.rows.length, 98); assert.equal(first.rows[0].cards.length, 7);
  assert.equal(first.operations.providerCalls, 0); assert.equal(first.summary.relevantRecoveryMeasured, false);
  assert(Object.keys(input.inputHashes).every(path => !/(?:physician|reference-freeze|review-target|scorecard|study\/parsed|study\/raw|\.env)/i.test(path)));
  assert.equal(first.provenance.inputHashes['data/research/workflow-aware-v1/challenge-review-targets.json'], undefined);
  const renamed = { ...input, messages: input.messages.map(row => ({ ...row, id: `renamed-${row.id}` })) };
  // Dense vectors are keyed by the original message identity in the loader; carry them by message text when IDs change.
  const byText = new Map(input.messages.map(row => [row.message, input.denseFor(row)]));
  const rerun = buildCandidateAudit({ ...renamed, denseFor: row => byText.get(row.message)! });
  assert.deepEqual(first.rows.map(({ id: _id, ...row }) => row), rerun.rows.map(({ id: _id, ...row }) => row));
  const worksheet = buildReviewWorksheet(first); assert.equal(worksheet.rows.length, 686);
  assert(worksheet.rows.every(row => Object.values(row.review).every(value => value === null)));
});

test('output is deterministic, exclusively created and existing bytes are verified without replacement', () => {
  const temp = mkdtempSync(join(tmpdir(), 'retrieval-audit-output-')), out = join(temp, 'output');
  try {
    assert.equal(writeAuditOutputs(out, { 'audit.json': { a: 1 } }), 'created');
    assert.equal(writeAuditOutputs(out, { 'audit.json': { a: 1 } }), 'verified-existing');
    assert.throws(() => writeAuditOutputs(out, { 'audit.json': { a: 2 } }), /never overwrite/);
    assert.deepEqual(JSON.parse(readFileSync(join(out, 'audit.json'), 'utf8')), { a: 1 });
    writeFileSync(join(out, 'extra.json'), '{}');
    assert.throws(() => writeAuditOutputs(out, { 'audit.json': { a: 1 } }), /Partial or extraneous/);
    assert.throws(() => writeAuditOutputs(join(temp, 'invalid'), { '../escape.json': {} }), /artifact filename/);
    assert(!existsSync(join(temp, 'invalid')));
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('read-only verification refuses missing outputs and does not rewrite existing bytes', () => {
  const temp = mkdtempSync(join(tmpdir(), 'retrieval-audit-verify-')), out = join(temp, 'missing', 'output');
  try {
    assert.throws(() => writeAuditOutputs(out, { 'audit.json': { a: 1 } }, { verifyOnly: true }), /requires existing audit outputs/);
    assert(!existsSync(join(temp, 'missing')), 'Verification must not even create parent directories');
    writeAuditOutputs(out, { 'audit.json': { a: 1 } });
    const before = statSync(join(out, 'audit.json'));
    assert.equal(writeAuditOutputs(out, { 'audit.json': { a: 1 } }, { verifyOnly: true }), 'verified-existing');
    const after = statSync(join(out, 'audit.json'));
    assert.equal(after.mtimeMs, before.mtimeMs); assert.equal(after.ino, before.ino);
    assert.throws(() => writeAuditOutputs(out, { 'audit.json': { a: 2 } }, { verifyOnly: true }), /never overwrite/);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test('audit implementation has no clinical-reference or provider-module dependency', () => {
  for (const name of ['src/research/retrieval-candidate-audit.ts', 'scripts/audit-workflow-retrieval-candidates.ts']) {
    const source = readFileSync(join(root, name), 'utf8');
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(match => match[1]);
    assert(imports.every(path => path.startsWith('node:') || path.endsWith('/workflow-aware/evidence.ts') || path.endsWith('/research/retrieval-candidate-audit.ts')));
    assert.doesNotMatch(source, /\bfetch\s*\(|process\.env|parseEnv|generateEmbeddings|acceptedRoutes|acceptedBuckets/);
  }
});
