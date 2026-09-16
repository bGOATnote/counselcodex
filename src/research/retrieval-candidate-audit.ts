/** Post-study, offline candidate discovery. No clinical labels, provider calls or runtime promotion. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import {
  canonicalJson, evidenceCardSetHash, evidenceEmbeddingText, evidenceSha256,
  parseEvidenceCards, renderEvidenceForPrompt, retrieveEvidence, verifyEvidencePacket,
  type EvidenceCard, type EvidencePacket, type FrozenDenseVectors,
} from './workflow-aware/evidence.ts';

export const AUDIT_SCHEMA = 'retrieval-candidate-audit/v1';
export const AUDIT_LIMITS = Object.freeze({ cards: 7, messages: 98, dimensions: 1536, topK: 3, rrfK: 60,
  messageBytes: 16_000, fileBytes: 16 * 1024 * 1024, totalReadBytes: 64 * 1024 * 1024 });
const MODEL = 'text-embedding-3-large';
const SOURCE_PATHS = ['src/research/workflow-aware/embeddings.ts', 'src/research/workflow-aware/evidence.ts',
  'src/research/workflow-aware/budget.ts', 'scripts/workflow-aware-evidence.ts'];
const MESSAGE_PATH = 'outputs/workflow-aware-disposition-2026-09-16/messages.json';
const CARD_PATH = 'data/research/workflow-aware-v1/evidence-cards.json';
const bytesHash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const sorted = (ids: string[]) => [...ids].sort(cmp);
const sameMembers = (a: string[], b: string[]) => canonicalJson(sorted(a)) === canonicalJson(sorted(b));
const hashPattern = /^[a-f0-9]{64}$/;
const packetStable = (packet: EvidencePacket) => ({ ...packet, elapsedMs: 0 });
export type AuditMessage = { id: string; message: string };
type Entry = { kind: 'card' | 'message'; id: string; text: string; textSHA256: string };
type Job = { id: string; entries: Entry[]; request: { model: string; dimensions: number; encoding_format: string; input: string[] }; requestSHA256: string; reservedUSD: number };
type Manifest = { schema: string; frozenAt: string; asOf: string; model: string; dimensions: number; revision: string;
  entries: Entry[]; jobs: Job[]; calls: number; retries: number; messagesPath: string; messagesSHA256: string;
  cardsPath: string; cardsSHA256: string; cardSetHash: string; sourceHashes: Record<string, string>;
  runtime: { lockPath: string; lockSHA256: string } };

function validVector(vector: unknown, dimensions: number): asserts vector is number[] {
  assert(Array.isArray(vector) && vector.length === dimensions && vector.every(v => typeof v === 'number' && Number.isFinite(v)), 'Invalid vector shape or nonfinite coordinate');
  const norm = Math.hypot(...vector);
  assert(norm > 0 && Number.isFinite(norm), 'Invalid vector norm');
}
export function cosineSimilarity(a: number[], b: number[]): number {
  assert(Number.isInteger(a.length) && a.length >= 2 && a.length <= AUDIT_LIMITS.dimensions, 'Invalid vector dimensions');
  validVector(a, a.length); validVector(b, a.length);
  const normA = Math.hypot(...a), normB = Math.hypot(...b);
  return a.reduce((sum, value, i) => sum + (value / normA) * (b[i] / normB), 0);
}
function validateDenseIdentity(message: string, cards: EvidenceCard[], dense: FrozenDenseVectors): void {
  assert.equal(dense.model, MODEL, 'Embedding model mismatch');
  assert(typeof dense.revision === 'string' && dense.revision.trim(), 'Missing embedding revision disclosure');
  assert(Number.isSafeInteger(dense.dimensions) && dense.dimensions >= 2 && dense.dimensions <= AUDIT_LIMITS.dimensions, 'Invalid dimensions');
  assert.equal(dense.queryHash, evidenceSha256(message), 'Query text hash mismatch');
  assert.equal(dense.cardSetHash, evidenceCardSetHash(cards), 'Card-set hash mismatch');
  assert.deepEqual(sorted(Object.keys(dense.cardVectors)), sorted(cards.map(card => card.id)), 'Card vector identity mismatch');
  validVector(dense.queryVector, dense.dimensions);
  for (const card of cards) {
    const entry = dense.cardVectors[card.id];
    assert.equal(entry.contentHash, card.contentHash, 'Card content hash mismatch');
    assert.equal(entry.embeddingTextHash, evidenceSha256(evidenceEmbeddingText(card)), 'Embedding text hash mismatch');
    validVector(entry.vector, dense.dimensions);
  }
}

/** Ungated means every archived card is a candidate, including cards excluded by the original policy.
 * These rankings cannot establish population compatibility, relevance or a clinical action. */
export function rankCandidates(input: { message: string; cards: unknown; dense: FrozenDenseVectors; asOf: string; topK?: number; rrfK?: number }) {
  const { message, dense, asOf } = input;
  const topK = input.topK ?? AUDIT_LIMITS.topK, rrfK = input.rrfK ?? AUDIT_LIMITS.rrfK;
  assert(typeof message === 'string' && message.trim() && Buffer.byteLength(message) <= AUDIT_LIMITS.messageBytes && !message.includes('\0'), 'Invalid message');
  assert(Number.isSafeInteger(topK) && topK >= 1 && topK <= AUDIT_LIMITS.topK, 'Invalid topK');
  assert(Number.isSafeInteger(rrfK) && rrfK >= 1 && rrfK <= 1000, 'Invalid RRF constant');
  const cards = parseEvidenceCards(input.cards);
  assert(cards.length <= AUDIT_LIMITS.cards, 'Card limit exceeded');
  validateDenseIdentity(message, cards, dense);
  const originalLexical = retrieveEvidence(message, cards, { asOf, limit: topK });
  const originalHybrid = retrieveEvidence(message, cards, { asOf, limit: topK, dense });
  const lexicalIds = originalLexical.selected.map(card => card.id), originalIds = originalHybrid.selected.map(card => card.id);
  const denseRanking = cards.map(card => ({ id: card.id, cosine: cosineSimilarity(dense.queryVector, dense.cardVectors[card.id].vector) }))
    .sort((a, b) => b.cosine - a.cosine || cmp(a.id, b.id));
  const denseIds = denseRanking.slice(0, topK).map(card => card.id);
  const unionIds = [...new Set([...lexicalIds, ...denseIds])];
  const unionRanking = unionIds.map(id => ({ id,
    lexicalRank: lexicalIds.includes(id) ? lexicalIds.indexOf(id) + 1 : null,
    denseTopKRank: denseIds.includes(id) ? denseIds.indexOf(id) + 1 : null,
    rrfScore: (lexicalIds.includes(id) ? 1 / (rrfK + lexicalIds.indexOf(id) + 1) : 0)
      + (denseIds.includes(id) ? 1 / (rrfK + denseIds.indexOf(id) + 1) : 0),
  })).sort((a, b) => b.rrfScore - a.rrfScore || cmp(a.id, b.id));
  const rrfIds = unionRanking.slice(0, topK).map(card => card.id);
  const rankedCards = [...cards].sort((a, b) => cmp(a.id, b.id)).map(card => {
    const denseEntry = denseRanking.find(entry => entry.id === card.id)!;
    const unionEntry = unionRanking.find(entry => entry.id === card.id);
    return { sourceCardId: card.id, title: card.title, sourceURL: card.url, cardHash: card.contentHash,
      population: card.population, sourceCardStatus: card.status, clinicalReview: 'unreviewed' as const,
      originalExclusion: originalHybrid.excluded.find(entry => entry.id === card.id)?.reason ?? null,
      originalLexicalRank: lexicalIds.includes(card.id) ? lexicalIds.indexOf(card.id) + 1 : null,
      originalHybridRank: originalIds.includes(card.id) ? originalIds.indexOf(card.id) + 1 : null,
      denseRank: denseRanking.findIndex(entry => entry.id === card.id) + 1, cosine: denseEntry.cosine,
      unionRRFRank: unionEntry ? unionRanking.indexOf(unionEntry) + 1 : null, unionRRFScore: unionEntry?.rrfScore ?? null,
      selected: { originalLexical: lexicalIds.includes(card.id), originalHybrid: originalIds.includes(card.id),
        ungatedDenseTopK: denseIds.includes(card.id), unionRRFTopK: rrfIds.includes(card.id) },
      newCandidateAgainstOriginalHybrid: { ungatedDenseTopK: denseIds.includes(card.id) && !originalIds.includes(card.id),
        unionRRFTopK: rrfIds.includes(card.id) && !originalIds.includes(card.id) },
    };
  });
  return { inputSHA256: evidenceSha256(message), originalLexicalIds: lexicalIds, originalHybridIds: originalIds,
    originalNoSelection: originalIds.length === 0, ungatedDenseTopKIds: denseIds, unionCandidateIds: unionRanking.map(x => x.id),
    unionRRFTopKIds: rrfIds, denseMembershipChanged: !sameMembers(originalIds, denseIds),
    unionRRFMembershipChanged: !sameMembers(originalIds, rrfIds),
    addedDenseIds: denseIds.filter(id => !originalIds.includes(id)), addedUnionRRFIds: rrfIds.filter(id => !originalIds.includes(id)),
    droppedDenseIds: originalIds.filter(id => !denseIds.includes(id)), droppedUnionRRFIds: originalIds.filter(id => !rrfIds.includes(id)),
    cards: rankedCards };
}

function reader(root: string) {
  let total = 0;
  const hashes: Record<string, string> = {};
  function read(path: string): Buffer {
    const absolute = resolve(root, path), rel = relative(root, absolute);
    assert(!isAbsolute(path) && rel && !rel.startsWith('..') && !isAbsolute(rel), 'Path outside audit root');
    assert(!lstatSync(absolute).isSymbolicLink() && realpathSync(absolute) === absolute, 'Symlink inputs are not supported');
    const size = lstatSync(absolute).size;
    assert(size <= AUDIT_LIMITS.fileBytes && total + size <= AUDIT_LIMITS.totalReadBytes, 'Input byte limit exceeded');
    const data = readFileSync(absolute); total += data.length;
    assert.equal(data.length, size, 'Input changed during read'); hashes[rel] = bytesHash(data); return data;
  }
  return { read, json: (path: string) => JSON.parse(read(path).toString('utf8')), hashes };
}

/** Fixed input allowlist prevents a manifest from redirecting this audit to clinical reference files. */
export function loadFrozenRetrieval(rootInput: string, retrievalDir = 'outputs/workflow-aware-disposition-2026-09-16/retrieval') {
  const root = realpathSync(rootInput), io = reader(root);
  assert.equal(retrievalDir, 'outputs/workflow-aware-disposition-2026-09-16/retrieval', 'Unexpected frozen retrieval directory');
  const name = (file: string) => `${retrievalDir}/${file}`;
  const completion = io.json(name('generation-complete.json')) as { schema: string; calls: number; completedAt: string; artifactHashes: Record<string, string> };
  assert.equal(completion.schema, 'workflow-aware-embeddings-complete/v1'); assert.equal(completion.calls, 2);
  const expected = ['manifest.json', 'plan-complete.json', 'runtime/package-lock.json', 'lexical-inventory.json',
    'embedding-1-raw.json', 'embedding-1-receipt.json', 'embedding-2-raw.json', 'embedding-2-receipt.json'];
  assert.deepEqual(sorted(Object.keys(completion.artifactHashes)), sorted(expected), 'Incomplete frozen artifact hash coverage');
  const artifacts = new Map<string, Buffer>();
  for (const file of expected) {
    const bytes = io.read(name(file)); assert(hashPattern.test(completion.artifactHashes[file]));
    assert.equal(bytesHash(bytes), completion.artifactHashes[file], 'Frozen artifact hash mismatch'); artifacts.set(file, bytes);
  }
  const json = (file: string) => JSON.parse(artifacts.get(file)!.toString('utf8'));
  const manifest = json('manifest.json') as Manifest;
  assert.equal(manifest.schema, 'workflow-aware-embeddings/v1'); assert.equal(manifest.model, MODEL);
  assert.equal(manifest.dimensions, AUDIT_LIMITS.dimensions); assert.equal(manifest.calls, 2); assert.equal(manifest.retries, 0);
  assert.equal(manifest.messagesPath, MESSAGE_PATH, 'Message path is outside reference-free allowlist');
  assert.equal(manifest.cardsPath, CARD_PATH, 'Card path is outside reference-free allowlist');
  assert.equal(manifest.runtime.lockPath, 'runtime/package-lock.json');
  assert.equal(manifest.runtime.lockSHA256, completion.artifactHashes['runtime/package-lock.json']);
  assert(Number.isFinite(Date.parse(manifest.frozenAt)) && Date.parse(completion.completedAt) >= Date.parse(manifest.frozenAt), 'Invalid freeze chronology');
  const plan = json('plan-complete.json'); assert.equal(plan.schema, 'workflow-aware-embedding-plan-freeze/v1');
  assert.equal(plan.manifestSHA256, completion.artifactHashes['manifest.json']);
  assert.equal(plan.lexicalInventorySHA256, completion.artifactHashes['lexical-inventory.json']);
  assert.deepEqual(sorted(Object.keys(manifest.sourceHashes)), sorted(SOURCE_PATHS), 'Incomplete frozen source set');
  for (const path of SOURCE_PATHS) assert.equal(bytesHash(io.read(path)), manifest.sourceHashes[path], 'Frozen retrieval source hash mismatch');
  const messageBytes = io.read(MESSAGE_PATH), cardBytes = io.read(CARD_PATH);
  assert.equal(bytesHash(messageBytes), manifest.messagesSHA256, 'Input message file hash mismatch');
  assert.equal(bytesHash(cardBytes), manifest.cardsSHA256, 'Input card file hash mismatch');
  const messages = JSON.parse(messageBytes.toString('utf8')) as AuditMessage[];
  assert(Array.isArray(messages) && messages.length === AUDIT_LIMITS.messages, 'Expected exactly 98 frozen messages');
  assert.equal(new Set(messages.map(row => row.id)).size, messages.length, 'Duplicate message identifier');
  for (const row of messages) {
    assert.deepEqual(sorted(Object.keys(row)), ['id', 'message'], 'Message-only input contract violated');
    assert(typeof row.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(row.id), 'Invalid case identifier');
    assert(typeof row.message === 'string' && row.message.trim() && Buffer.byteLength(row.message) <= AUDIT_LIMITS.messageBytes && !row.message.includes('\0'), 'Invalid message text');
  }
  const cards = parseEvidenceCards(JSON.parse(cardBytes.toString('utf8')));
  assert.equal(cards.length, AUDIT_LIMITS.cards, 'Expected exactly seven frozen cards');
  assert.equal(evidenceCardSetHash(cards), manifest.cardSetHash);
  const entries: Entry[] = [...cards.map(card => ({ kind: 'card' as const, id: card.id, text: evidenceEmbeddingText(card) })),
    ...messages.map(row => ({ kind: 'message' as const, id: row.id, text: row.message }))].map(entry => ({ ...entry, textSHA256: evidenceSha256(entry.text) }));
  assert.deepEqual(manifest.entries, entries, 'Embedding input or text-hash mismatch');
  assert(Array.isArray(manifest.jobs) && manifest.jobs.length === 2, 'Unexpected embedding job count');
  const vectors = new Map<string, number[]>();
  for (const [i, job] of manifest.jobs.entries()) {
    assert.equal(job.id, `embedding-${i + 1}`);
    assert.deepEqual(job.entries, entries.slice(i * 64, (i + 1) * 64), 'Embedding batch input mismatch');
    const request = { model: MODEL, dimensions: AUDIT_LIMITS.dimensions, encoding_format: 'float', input: job.entries.map(entry => entry.text) };
    assert.deepEqual(job.request, request, 'Embedding request mismatch'); assert.equal(job.requestSHA256, evidenceSha256(JSON.stringify(request)));
    const raw = json(`${job.id}-raw.json`), receipt = json(`${job.id}-receipt.json`);
    assert.equal(raw.jobId, job.id); assert.equal(raw.requestSHA256, job.requestSHA256); assert.equal(raw.status, 200); assert.equal(raw.failure, null);
    assert(typeof raw.responseText === 'string' && Buffer.byteLength(raw.responseText) <= AUDIT_LIMITS.fileBytes);
    const response = JSON.parse(raw.responseText); assert.equal(response.model, MODEL, 'Embedding response model mismatch');
    assert(Array.isArray(response.data) && response.data.length === job.entries.length, 'Embedding vector count mismatch');
    const ordered: number[][] = Array(job.entries.length), indices = new Set<number>();
    for (const entry of response.data) {
      assert(Number.isSafeInteger(entry.index) && entry.index >= 0 && entry.index < job.entries.length && !indices.has(entry.index), 'Embedding index mismatch');
      validVector(entry.embedding, AUDIT_LIMITS.dimensions); indices.add(entry.index); ordered[entry.index] = entry.embedding;
    }
    assert.equal(receipt.jobId, job.id); assert.equal(receipt.rawSHA256, completion.artifactHashes[`${job.id}-raw.json`]);
    assert.equal(receipt.valid, true); assert.equal(receipt.failure, null);
    assert.deepEqual(receipt.entries, job.entries.map((entry, index) => ({ kind: entry.kind, id: entry.id, textSHA256: entry.textSHA256, vector: ordered[index] })), 'Raw-to-receipt vector parity mismatch');
    job.entries.forEach((entry, index) => vectors.set(`${entry.kind}:${entry.id}`, ordered[index]));
  }
  assert.equal(vectors.size, entries.length, 'Incomplete vector inventory');
  const cardVectors = Object.fromEntries(cards.map(card => [card.id, { contentHash: card.contentHash,
    embeddingTextHash: evidenceSha256(evidenceEmbeddingText(card)), vector: vectors.get(`card:${card.id}`)! }]));
  const denseFor = (row: AuditMessage): FrozenDenseVectors => ({ model: manifest.model, revision: manifest.revision, dimensions: manifest.dimensions,
    cardSetHash: manifest.cardSetHash, queryHash: evidenceSha256(row.message), queryVector: vectors.get(`message:${row.id}`)!, cardVectors });
  const lexicalInventory = json('lexical-inventory.json');
  assert.equal(lexicalInventory.status, 'unreviewed-retrieval-inventory-not-clinical-targets');
  assert.equal(lexicalInventory.rows.length, messages.length);
  // These derived files are not independently sealed by embedding-complete; reconstruct all selections and prompt packets.
  const comparison = io.json(name('retrieval-comparison.json'));
  const packets = io.json(name('evidence-packets.json'));
  assert.equal(comparison.schema, 'workflow-aware-retrieval-comparison/v1'); assert.equal(comparison.messages, messages.length);
  assert.equal(comparison.rows.length, messages.length); assert.equal(packets.schema, 'workflow-aware-evidence-packets/v1');
  const expectedPackets: unknown[] = [];
  for (const [i, row] of messages.entries()) {
    const dense = denseFor(row); validateDenseIdentity(row.message, cards, dense);
    const lexical = retrieveEvidence(row.message, cards, { asOf: manifest.asOf });
    const hybrid = retrieveEvidence(row.message, cards, { asOf: manifest.asOf, dense });
    const original = comparison.rows[i];
    verifyEvidencePacket(original.lexical); verifyEvidencePacket(original.hybrid); verifyEvidencePacket(lexicalInventory.rows[i].packet);
    assert.equal(lexicalInventory.rows[i].id, row.id);
    assert.deepEqual(packetStable(lexicalInventory.rows[i].packet), packetStable(lexical));
    assert.deepEqual({ ...original, lexical: packetStable(original.lexical), hybrid: packetStable(original.hybrid) }, {
      id: row.id, inputSHA256: evidenceSha256(row.message), lexical: packetStable(lexical), hybrid: packetStable(hybrid),
      selectedOrderChanged: lexical.selected.map(x => x.id).join(',') !== hybrid.selected.map(x => x.id).join(','), evidenceText: renderEvidenceForPrompt(hybrid),
    }, 'Original retrieval selection does not reconstruct');
    expectedPackets.push({ inputSHA256: evidenceSha256(row.message), evidenceText: renderEvidenceForPrompt(hybrid), evidenceMetadata: {
      mode: hybrid.mode, packetHash: hybrid.packetHash, cardSetHash: hybrid.cardSetHash, selectedIds: hybrid.selected.map(x => x.id),
      embeddingCompletionSHA256: io.hashes[name('generation-complete.json')],
    } });
  }
  assert.equal(comparison.hybridNoHit, comparison.rows.filter((row: { hybrid: EvidencePacket }) => row.hybrid.selected.length === 0).length);
  assert.equal(comparison.selectedOrderChanged, comparison.rows.filter((row: { selectedOrderChanged: boolean }) => row.selectedOrderChanged).length);
  assert.deepEqual(packets, { schema: 'workflow-aware-evidence-packets/v1', packets: expectedPackets }, 'Frozen prompt evidence mismatch');
  return { messages, cards, denseFor, manifest, inputHashes: io.hashes };
}

export function buildCandidateAudit(input: ReturnType<typeof loadFrozenRetrieval>) {
  const rows = input.messages.map(row => ({ id: row.id, message: row.message,
    ...rankCandidates({ message: row.message, cards: input.cards, dense: input.denseFor(row), asOf: input.manifest.asOf }) }));
  return { schema: AUDIT_SCHEMA, status: 'post-study-exploratory-candidate-discovery-not-clinical-validation',
    operations: { providerCalls: 0, clinicalReferenceFilesRead: 0, runtimeOrPromptChanges: 0 },
    algorithm: { topK: AUDIT_LIMITS.topK, rrfK: AUDIT_LIMITS.rrfK, densePool: 'all-seven-cards-without-lexical-or-applicability-gates',
      unionPool: 'deduplicated-original-lexical-top3-plus-ungated-dense-top3',
      rrfScore: 'sum of 1/(60+one-based-rank) only for appearance in each top3 list', tieBreak: 'ascending-ASCII-card-id',
      threshold: null, abstentionRule: null },
    embedding: { model: input.manifest.model, revision: input.manifest.revision, dimensions: input.manifest.dimensions },
    provenance: { inputHashes: input.inputHashes, cardSetHash: input.manifest.cardSetHash },
    summary: { messages: rows.length, cards: input.cards.length, originalNoSelection: rows.filter(row => row.originalNoSelection).length,
      denseMembershipChanged: rows.filter(row => row.denseMembershipChanged).length,
      unionRRFMembershipChanged: rows.filter(row => row.unionRRFMembershipChanged).length,
      additionalDenseCandidateMemberships: rows.reduce((sum, row) => sum + row.addedDenseIds.length, 0),
      additionalUnionRRFCandidateMemberships: rows.reduce((sum, row) => sum + row.addedUnionRRFIds.length, 0),
      removedDenseCandidateMemberships: rows.reduce((sum, row) => sum + row.droppedDenseIds.length, 0),
      removedUnionRRFCandidateMemberships: rows.reduce((sum, row) => sum + row.droppedUnionRRFIds.length, 0),
      denseNonempty: rows.filter(row => row.ungatedDenseTopKIds.length > 0).length,
      originalSelectionCounts: Object.fromEntries([0, 1, 2, 3].map(n => [String(n), rows.filter(row => row.originalHybridIds.length === n).length])),
      denseVersusUnionRRFMembershipChanged: rows.filter(row => !sameMembers(row.ungatedDenseTopKIds, row.unionRRFTopKIds)).length,
      denseVersusUnionRRFOrderChanged: rows.filter(row => row.ungatedDenseTopKIds.join(',') !== row.unionRRFTopKIds.join(',')).length,
      clinicallyReviewedQueryCardPairs: 0, relevantRecoveryMeasured: false, clinicalPerformanceMeasured: false },
    limitations: [
      'All-card top-k returns candidates whenever cards exist; a nonempty ranking is not a retrieval hit or evidence of relevance.',
      'Membership changes are algorithmic, not recovered clinical evidence. Original scope exclusions remain visible.',
      'Seven engineering-authored, clinically unreviewed cards are not a comprehensive clinical corpus.',
      'No relevance labels, clinical dispositions, reference scores, intervention outcomes or promotion decisions are used or produced.',
      'This diagnostic was designed after the registered study; it is not a preregistered ablation.',
    ], rows };
}
export function buildReviewWorksheet(audit: ReturnType<typeof buildCandidateAudit>) {
  return { schema: 'retrieval-candidate-review-worksheet/v1', status: 'blank-review-template-not-clinical-approval',
    instructions: 'Review each candidate against the exact message and full source conditions. Record irrelevant, uncertain and population-incompatible candidates. Leave fields blank until a qualified reviewer assesses them. Rankings are discovery signals only.',
    rows: audit.rows.flatMap(row => row.cards.map(card => ({ caseId: row.id, message: row.message, inputSHA256: row.inputSHA256,
      sourceCardId: card.sourceCardId, sourceURL: card.sourceURL, cardHash: card.cardHash, originalExclusion: card.originalExclusion,
      rankSignals: { originalHybridRank: card.originalHybridRank, denseRank: card.denseRank, cosine: card.cosine, unionRRFRank: card.unionRRFRank },
      review: { reviewer: null, reviewedAt: null, relevance: null, populationApplicability: null,
        missingInformation: null, sourceConditionsPreserved: null, disagreementOrUncertainty: null, comments: null } }))) };
}

/** New directory only; repeat invocation validates bytes without rewriting. Partial/extraneous files block completion. */
export function writeAuditOutputs(outputDir: string, files: Record<string, unknown>, options: { verifyOnly?: boolean } = {}): 'created' | 'verified-existing' {
  assert(Object.keys(files).length > 0 && Object.keys(files).length <= 8);
  const bytes = Object.fromEntries(Object.entries(files).map(([name, value]) => {
    assert(/^[a-z][a-z0-9-]*\.json$/.test(name), 'Invalid audit artifact filename');
    const data = Buffer.from(`${JSON.stringify(value, null, 2)}\n`); assert(data.length <= AUDIT_LIMITS.fileBytes, 'Output byte limit exceeded'); return [name, data];
  }));
  if (existsSync(outputDir)) {
    assert(lstatSync(outputDir).isDirectory() && !lstatSync(outputDir).isSymbolicLink(), 'Invalid existing output directory');
    assert.deepEqual(sorted(readdirSync(outputDir)), sorted(Object.keys(bytes)), 'Partial or extraneous existing audit artifacts');
    for (const [name, data] of Object.entries(bytes)) {
      assert(!lstatSync(join(outputDir, name)).isSymbolicLink(), 'Output symlinks prohibited');
      assert(readFileSync(join(outputDir, name)).equals(data), 'Existing audit differs; never overwrite immutable results');
    }
    return 'verified-existing';
  }
  assert(!options.verifyOnly, 'Read-only verification requires existing audit outputs; nothing was created');
  mkdirSync(dirname(outputDir), { recursive: true }); mkdirSync(outputDir);
  for (const [name, data] of Object.entries(bytes)) writeFileSync(join(outputDir, name), data, { flag: 'wx', mode: 0o644 });
  return 'created';
}
