import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { performance } from "node:perf_hooks";
import { RETRIEVAL_POLICY, restoreCorpus, sha256, type Corpus, type Chunk, type ClinicalDocument, type Hit, type Retrieval } from "./model.ts";

export const EMBEDDING_POLICY = { model: "text-embedding-3-large", dimensions: 1536, inputPricePerMillion: 0.13, version: "openai-large1536/v1" } as const;
export type EmbeddingResult = { vectors: number[][]; tokens: number };
export type Embed = (texts: string[], signal: AbortSignal) => Promise<EmbeddingResult>;
export function validateVectors(vectors: number[][], count: number, dimensions: number) {
  if (vectors.length !== count || vectors.some(v => v.length !== dimensions || v.some(x => !Number.isFinite(x)) || v.every(x => x === 0))) throw new Error("INVALID_EMBEDDING_RESPONSE");
}
export function openAiEmbed(apiKey: string, dimensions: number = EMBEDDING_POLICY.dimensions): Embed {
  if (!apiKey) throw new Error("OPENAI_API_KEY_MISSING");
  return async (texts, signal) => {
    if (!texts.length || texts.length > 64 || texts.some(t => !t.trim() || Buffer.byteLength(t) > 16_000)) throw new Error("EMBEDDING_INPUT_BOUND");
    const response = await fetch("https://api.openai.com/v1/embeddings", { method: "POST", signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_POLICY.model, dimensions, encoding_format: "float", input: texts }) });
    // Never put the provider body (or credentials) in an error or audit record.
    if (!response.ok) throw new Error(`EMBEDDING_HTTP_${response.status}`);
    const raw = await response.json() as { model?: string; data?: { index: number; embedding: number[] }[]; usage?: { total_tokens: number } };
    if (raw.model !== EMBEDDING_POLICY.model || !Array.isArray(raw.data) || new Set(raw.data.map(x => x.index)).size !== texts.length || raw.data.some(x => !Number.isInteger(x.index) || x.index < 0 || x.index >= texts.length)) throw new Error("EMBEDDING_IDENTITY_MISMATCH");
    const vectors = raw.data.sort((a, b) => a.index - b.index).map(x => x.embedding);
    validateVectors(vectors, texts.length, dimensions);
    const tokens = raw.usage?.total_tokens;
    if (!Number.isInteger(tokens) || tokens! < 0) throw new Error("EMBEDDING_USAGE_MISSING");
    return { vectors, tokens: tokens! };
  };
}

type Row = { id: string; chunk: Chunk; document: ClinicalDocument; score: number };
export class ClinicalRagStore {
  private db: PGlite;
  private dimensions: number;
  private queryCache = new Map<string, { at: number; vector: number[] }>();
  private constructor(db: PGlite, dimensions: number) { this.db = db; this.dimensions = dimensions; }
  static async open(directory?: string, dimensions: number = EMBEDDING_POLICY.dimensions) {
    if (!Number.isInteger(dimensions) || dimensions < 2 || dimensions > 2000) throw new Error("INVALID_VECTOR_DIMENSIONS");
    const db = await PGlite.create({ ...(directory ? { dataDir: directory } : {}), extensions: { vector } });
    await db.exec(`CREATE EXTENSION IF NOT EXISTS vector;
      CREATE TABLE IF NOT EXISTS rag_meta (key text PRIMARY KEY, value jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS rag_docs (id text PRIMARY KEY, document jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS rag_chunks (id text PRIMARY KEY, doc_id text REFERENCES rag_docs(id), chunk jsonb NOT NULL, search tsvector NOT NULL, embedding vector(${dimensions}), embedding_key text NOT NULL);
      CREATE INDEX IF NOT EXISTS rag_fts ON rag_chunks USING gin(search);
      CREATE TABLE IF NOT EXISTS rag_edges (source text REFERENCES rag_docs(id), target text REFERENCES rag_docs(id), relation text NOT NULL, provenance text NOT NULL, PRIMARY KEY(source,target,relation));
      CREATE TABLE IF NOT EXISTS rag_embedding_cache (key text PRIMARY KEY, vector jsonb NOT NULL);
      CREATE TABLE IF NOT EXISTS rag_usage (id bigserial PRIMARY KEY, at timestamptz DEFAULT now(), kind text NOT NULL, input_count integer NOT NULL, tokens integer, status text NOT NULL);`);
    const policy = { ...EMBEDDING_POLICY, dimensions };
    const existing = await db.query<{ value: unknown }>("SELECT value FROM rag_meta WHERE key='embedding_policy'");
    if (existing.rows.length) {
      // jsonb key order differs from JS insertion order; compare named fields.
      const p = existing.rows[0].value as typeof policy;
      if (p.model !== policy.model || p.dimensions !== dimensions || p.version !== policy.version) { await db.close(); throw new Error("INDEX_EMBEDDING_POLICY_MISMATCH"); }
    }
    if (!existing.rows.length) await db.query("INSERT INTO rag_meta VALUES ('embedding_policy',$1)", [JSON.stringify(policy)]);
    return new ClinicalRagStore(db, dimensions);
  }
  async close() { await this.db.close(); }
  async reuseEmbeddings(previousDirectory: string) {
    const previous = await ClinicalRagStore.open(previousDirectory, this.dimensions);
    let count = 0;
    try {
      for (let offset = 0;; offset += 64) {
        const rows = await previous.db.query<{ key: string; vector: number[] }>("SELECT key,vector FROM rag_embedding_cache ORDER BY key OFFSET $1 LIMIT 64", [offset]);
        if (!rows.rows.length) break;
        await this.db.transaction(async tx => { for (const row of rows.rows) { validateVectors([row.vector], 1, this.dimensions); await tx.query("INSERT INTO rag_embedding_cache VALUES ($1,$2) ON CONFLICT DO NOTHING", [row.key, JSON.stringify(row.vector)]); count++; } });
      }
    } finally { await previous.close(); }
    return count;
  }
  async build(corpus: Corpus) {
    // Re-derive eligible chunks at the indexing boundary, including on resume.
    corpus = restoreCorpus(corpus);
    const previous = await this.db.query<{ value: { hash: string } }>("SELECT value FROM rag_meta WHERE key='corpus'");
    if (previous.rows.length) {
      if (previous.rows[0].value.hash !== corpus.hash) throw new Error("CORPUS_IMMUTABLE_USE_NEW_DIRECTORY");
      return this.stats();
    }
    await this.db.transaction(async tx => {
      for (const d of corpus.documents) await tx.query("INSERT INTO rag_docs VALUES ($1,$2)", [d.id, JSON.stringify(d)]);
      const ids = new Set(corpus.chunks.map(c => c.documentId));
      for (const d of corpus.documents) if (ids.has(d.id)) for (const e of d.related) if (ids.has(e.target)) await tx.query("INSERT INTO rag_edges VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING", [d.id, e.target, e.relation, e.source]);
      for (const c of corpus.chunks) {
        const d = corpus.documents.find(d => d.id === c.documentId)!;
        await tx.query(`INSERT INTO rag_chunks VALUES ($1,$2,$3,
          setweight(to_tsvector('english',$4),'A') || setweight(to_tsvector('english',$5),'B') || setweight(to_tsvector('english',$6),'C'),NULL,$7)`,
        [c.id, c.documentId, JSON.stringify(c), [d.title, ...d.aliases].join(" "), c.sectionTitle, c.text, sha256(`${EMBEDDING_POLICY.version}:${this.dimensions}:${c.embeddingText}`)]);
      }
      await tx.query("INSERT INTO rag_meta VALUES ('corpus',$1)", [JSON.stringify({ hash: corpus.hash, version: corpus.version, documents: corpus.documents.length, chunks: corpus.chunks.length,
        ...(corpus.quarantine ? { quarantinePolicyHash: corpus.quarantine.policyHash, excludedDocumentIds: corpus.quarantine.excludedDocumentIds, eligibleDocuments: ids.size } : {}) })]);
    });
    return this.stats();
  }
  async stats() {
    const rows = await this.db.query<{ chunks: number; embedded: number }>("SELECT count(*)::int chunks,count(embedding)::int embedded FROM rag_chunks");
    const docs = await this.db.query<{ kind: string; review: string; count: number }>("SELECT document->>'kind' kind,document->>'reviewStatus' review,count(*)::int count FROM rag_docs GROUP BY 1,2 ORDER BY 1,2");
    const edges = await this.db.query<{ count: number }>("SELECT count(*)::int count FROM rag_edges");
    const usage = await this.db.query("SELECT kind,status,sum(tokens)::int tokens,sum(input_count)::int inputs FROM rag_usage GROUP BY kind,status");
    const corpus = await this.db.query<{ value: unknown }>("SELECT value FROM rag_meta WHERE key='corpus'");
    return { ...rows.rows[0], documents: docs.rows, edges: edges.rows[0].count, usage: usage.rows, corpus: corpus.rows[0]?.value ?? null };
  }
  async embedMissing(embed: Embed, signal: AbortSignal, onBatch: (record: unknown) => void, inputByteLimit = 8_000_000) {
    let reserved = 0;
    await this.db.exec("UPDATE rag_chunks c SET embedding=k.vector::text::vector FROM rag_embedding_cache k WHERE c.embedding IS NULL AND k.key=c.embedding_key");
    for (;;) {
      signal.throwIfAborted();
      const rows = await this.db.query<{ id: string; chunk: Chunk; embedding_key: string }>("SELECT id,chunk,embedding_key FROM rag_chunks WHERE embedding IS NULL ORDER BY id LIMIT 64");
      if (!rows.rows.length) break;
      const missing: typeof rows.rows = [];
      for (const row of rows.rows) {
        const cached = await this.db.query<{ vector: number[] }>("SELECT vector FROM rag_embedding_cache WHERE key=$1", [row.embedding_key]);
        if (cached.rows.length) {
          validateVectors([cached.rows[0].vector], 1, this.dimensions);
          await this.db.query("UPDATE rag_chunks SET embedding=$2::vector WHERE id=$1", [row.id, JSON.stringify(cached.rows[0].vector)]);
        } else missing.push(row);
      }
      if (!missing.length) continue;
      reserved += missing.reduce((n, r) => n + Buffer.byteLength(r.chunk.embeddingText), 0);
      if (reserved > inputByteLimit) throw new Error("EMBEDDING_BUILD_INPUT_LIMIT");
      const reservation = await this.db.query<{ id: number }>("INSERT INTO rag_usage(kind,input_count,status) VALUES ('index',$1,'started') RETURNING id", [missing.length]);
      try {
        const result = await embed(missing.map(r => r.chunk.embeddingText), signal);
        validateVectors(result.vectors, missing.length, this.dimensions);
        await this.db.transaction(async tx => {
          for (const [i, row] of missing.entries()) {
            await tx.query("INSERT INTO rag_embedding_cache VALUES($1,$2) ON CONFLICT DO NOTHING", [row.embedding_key, JSON.stringify(result.vectors[i])]);
            await tx.query("UPDATE rag_chunks SET embedding=$2::vector WHERE id=$1", [row.id, JSON.stringify(result.vectors[i])]);
          }
          await tx.query("UPDATE rag_usage SET status='complete',tokens=$2 WHERE id=$1", [reservation.rows[0].id, result.tokens]);
        });
        onBatch({ inputs: missing.length, tokens: result.tokens });
      } catch (error) { await this.db.query("UPDATE rag_usage SET status='failed' WHERE id=$1", [reservation.rows[0].id]); throw error; }
    }
    await this.db.exec("CREATE INDEX IF NOT EXISTS rag_vector ON rag_chunks USING hnsw(embedding vector_cosine_ops)");
    return this.stats();
  }
  async search(query: string, options: { mode?: Retrieval["mode"]; embed?: Embed; signal?: AbortSignal; limit?: number } = {}): Promise<Retrieval> {
    if (query.length < 3 || query.length > 300 || /[\u0000-\u001f]/.test(query)) throw new Error("INVALID_RAG_QUERY");
    const signal = options.signal ?? new AbortController().signal, mode = options.mode ?? "hybrid";
    const limit = Math.max(1, Math.min(8, options.limit ?? 6)), began = performance.now();
    signal.throwIfAborted();
    const meta = await this.db.query<{ value: { hash: string } }>("SELECT value FROM rag_meta WHERE key='corpus'");
    if (!meta.rows.length) throw new Error("RAG_INDEX_NOT_BUILT");
    const corpusHash = meta.rows[0].value.hash, warnings: string[] = [], timings: Record<string, number> = {};
    // Ranked disjunction avoids treating natural-language concept queries as
    // mandatory AND clauses. Lexemes are generated/quoted inside PostgreSQL;
    // user query text is never interpolated into SQL or tsquery syntax.
    const sql = `WITH q AS (SELECT to_tsquery('english',string_agg(quote_literal(word),' | ')) query FROM unnest(tsvector_to_array(to_tsvector('english',$1))) words(word)) SELECT c.id,c.chunk,d.document,ts_rank_cd(c.search,q.query) score FROM rag_chunks c JOIN rag_docs d ON d.id=c.doc_id CROSS JOIN q WHERE c.search @@ q.query ORDER BY score DESC,c.id LIMIT 96`;
    const lexical = await this.db.query<Row>(sql, [query]);
    timings.lexicalMs = performance.now() - began;
    let semantic: Row[] = [], embeddingTokens = 0, embeddingCacheHit = false;
    if (mode !== "lexical") {
      const check = await this.db.query<{ missing: number }>("SELECT count(*)::int missing FROM rag_chunks WHERE embedding IS NULL");
      if (check.rows[0].missing) warnings.push("INCOMPLETE_VECTOR_INDEX_LEXICAL_ONLY");
      else if (!options.embed) warnings.push("EMBEDDING_PROVIDER_UNAVAILABLE_LEXICAL_ONLY");
      else {
        const at = performance.now();
        try {
          const key = sha256(`${corpusHash}:${query.toLowerCase().trim()}`), cached = this.queryCache.get(key);
          let v: number[];
          if (cached && Date.now() - cached.at < 3600_000) { v = cached.vector; embeddingCacheHit = true; }
          else {
            const result = await options.embed([query], signal); validateVectors(result.vectors, 1, this.dimensions); v = result.vectors[0]; embeddingTokens = result.tokens;
            if (this.queryCache.size >= 128) this.queryCache.delete(this.queryCache.keys().next().value!);
            this.queryCache.set(key, { at: Date.now(), vector: v });
          }
          timings.embeddingMs = performance.now() - at;
          const searchAt = performance.now();
          semantic = (await this.db.query<Row>(`SELECT c.id,c.chunk,d.document,(1-(c.embedding <=> $1::vector)) score FROM rag_chunks c JOIN rag_docs d ON d.id=c.doc_id ORDER BY c.embedding <=> $1::vector,c.id LIMIT 96`, [JSON.stringify(v)])).rows;
          timings.vectorMs = performance.now() - searchAt;
        } catch (error) { if (signal.aborted) throw error; warnings.push("QUERY_EMBEDDING_FAILED_LEXICAL_ONLY"); }
      }
    }
    // Reciprocal rank fusion combines retrieval order, not clinical confidence.
    const fused = new Map<string, { row: Row; score: number; channels: string[] }>();
    for (const [channel, rows] of [["lexical", lexical.rows], ["vector", semantic]] as const) rows.forEach((row, i) => {
      const item = fused.get(row.id) ?? { row, score: 0, channels: [] }; item.score += 1 / (60 + i + 1); item.channels.push(channel); fused.set(row.id, item);
    });
    let ordered = [...fused.values()].sort((a, b) => b.score - a.score || a.row.id.localeCompare(b.row.id));
    if (mode === "hybrid-graph" && ordered.length) {
      const at = performance.now();
      // One hop, query-matching neighbors only; one reserved passage slot.
      // Merely being a differential never makes a disease present or urgent.
      const seeds = [...new Set(ordered.slice(0, 3).map(x => x.row.chunk.documentId))];
      const graph = await this.db.query<Row>(`SELECT c.id,c.chunk,d.document,ts_rank_cd(c.search,websearch_to_tsquery('english',$2)) score FROM rag_chunks c JOIN rag_docs d ON d.id=c.doc_id WHERE c.doc_id IN (SELECT target FROM rag_edges WHERE source=ANY($1::text[])) AND c.search @@ websearch_to_tsquery('english',$2) ORDER BY score DESC,c.id LIMIT 2`, [seeds, query]);
      const neighbor = graph.rows.find(row => !ordered.slice(0, limit).some(x => x.row.chunk.documentId === row.chunk.documentId));
      if (neighbor) {
        ordered = ordered.filter(x => x.row.id !== neighbor.id);
        ordered.splice(Math.max(0, limit - 1), 0, { row: neighbor, score: 0, channels: ["graph_related_query_match"] });
      }
      timings.graphMs = performance.now() - at;
    }
    const perDoc = new Map<string, number>(), hits: Hit[] = [];
    for (const { row, score, channels } of ordered) {
      if ((perDoc.get(row.chunk.documentId) ?? 0) >= 2) continue;
      const { sections, ...document } = row.document, section = sections[row.chunk.section];
      if (!section || section.text.slice(row.chunk.start, row.chunk.end) !== row.chunk.text || sha256(row.chunk.text) !== row.chunk.hash) throw new Error("RETRIEVED_PASSAGE_INTEGRITY_FAILURE");
      perDoc.set(row.chunk.documentId, (perDoc.get(row.chunk.documentId) ?? 0) + 1);
      hits.push({ chunk: row.chunk, document, score, channels, context: { before: section.text.slice(Math.max(0, row.chunk.start - 300), row.chunk.start), after: section.text.slice(row.chunk.end, row.chunk.end + 300) } });
      if (hits.length >= limit) break;
    }
    signal.throwIfAborted();
    timings.totalMs = performance.now() - began;
    return { corpusHash, retrievalPolicy: RETRIEVAL_POLICY, query, mode, hits, timings, warnings, embeddingTokens, embeddingCacheHit };
  }
}
