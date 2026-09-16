import { createHash } from "node:crypto";

const WORD_PATTERN = /[a-z0-9]+/g;
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "do", "for", "from",
  "have", "i", "in", "is", "it", "my", "of", "on", "or", "please", "the", "this", "to",
  "was", "what", "when", "where", "with", "would",
]);

function words(value) {
  return (value
    .normalize("NFKC")
    .toLowerCase()
    .match(WORD_PATTERN) ?? [])
    .filter((token) => !STOP_WORDS.has(token));
}

function wordFeatures(value) {
  const tokens = words(value);
  return [...tokens, ...tokens.slice(0, -1).map((token, index) => `${token}_${tokens[index + 1]}`)];
}

function characterFeatures(value) {
  const normalized = ` ${words(value).join(" ")} `;
  const features = [];
  for (let index = 0; index <= normalized.length - 3; index += 1) {
    features.push(normalized.slice(index, index + 3));
  }
  return features;
}

function frequencies(features) {
  const counts = new Map();
  for (const feature of features) counts.set(feature, (counts.get(feature) ?? 0) + 1);
  return counts;
}

function inverseDocumentFrequency(documents, featureExtractor) {
  const documentFrequency = new Map();
  for (const document of documents) {
    for (const feature of new Set(featureExtractor(document.searchText))) {
      documentFrequency.set(feature, (documentFrequency.get(feature) ?? 0) + 1);
    }
  }
  const idf = new Map();
  for (const [feature, count] of documentFrequency) {
    idf.set(feature, Math.log((documents.length + 1) / (count + 1)) + 1);
  }
  return idf;
}

function vector(value, featureExtractor, idf) {
  const counts = frequencies(featureExtractor(value));
  const result = new Map();
  for (const [feature, count] of counts) {
    const weight = count * (idf.get(feature) ?? Math.log(idf.size + 2));
    result.set(feature, weight);
  }
  return result;
}

function cosine(left, right) {
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (const value of left.values()) leftNorm += value * value;
  for (const value of right.values()) rightNorm += value * value;
  for (const [feature, value] of left) dot += value * (right.get(feature) ?? 0);
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / Math.sqrt(leftNorm * rightNorm);
}

function searchableDocument(document) {
  return {
    ...document,
    searchText: [document.title, document.topic, ...document.tags, document.text].join(" "),
  };
}

function stableSort(scored) {
  return scored.sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id));
}

function contentHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertRetrievalInputs(corpus, queries) {
  const documentIds = corpus.map(({ id }) => id);
  const queryIds = queries.map(({ id }) => id);
  if (new Set(documentIds).size !== documentIds.length) throw new Error("retrieval corpus IDs must be unique");
  if (new Set(queryIds).size !== queryIds.length) throw new Error("retrieval query IDs must be unique");
  const knownDocuments = new Set(documentIds);
  for (const query of queries) {
    if (typeof query.text !== "string" || !query.text.trim()) throw new Error(`${query.id} requires query text`);
    if (!Array.isArray(query.relevantIds) || !Array.isArray(query.forbiddenIds)) throw new Error(`${query.id} requires relevance arrays`);
    if (query.mustAbstain !== (query.relevantIds.length === 0)) throw new Error(`${query.id} abstention and relevance labels disagree`);
    for (const id of [...query.relevantIds, ...query.forbiddenIds]) {
      if (!knownDocuments.has(id)) throw new Error(`${query.id} references unknown document ${id}`);
    }
    if (query.relevantIds.some((id) => query.forbiddenIds.includes(id))) throw new Error(`${query.id} marks a document both relevant and forbidden`);
  }
}

function metadataCompatibility(document, query) {
  if (document.status !== "active") return -1;
  if ((document.domain ?? "human_health") !== (query.domain ?? "human_health")) return -1;
  if (document.routeIntent !== query.routeIntent) return -1;
  if (query.population && document.population !== "all" && document.population !== query.population) return -1;
  let score = 0;
  if (query.population && document.population === query.population) score += 0.06;
  score += 0.04;
  return score;
}

export function buildRetrievers(corpus) {
  const documents = corpus.map(searchableDocument);
  const active = documents.filter(({ status }) => status === "active");
  const wordIdf = inverseDocumentFrequency(active, wordFeatures);
  const characterIdf = inverseDocumentFrequency(active, characterFeatures);
  const wordVectors = new Map(active.map((document) => [document.id, vector(document.searchText, wordFeatures, wordIdf)]));
  const characterVectors = new Map(active.map((document) => [document.id, vector(document.searchText, characterFeatures, characterIdf)]));

  return {
    exact_metadata(query) {
      const matches = active
        .filter(({ routeIntent }) => routeIntent === query.routeIntent)
        .map((document) => ({ document, score: 1 }));
      return stableSort(matches);
    },
    sparse_vector(query) {
      const queryVector = vector(query.text, wordFeatures, wordIdf);
      return stableSort(active.map((document) => ({
        document,
        score: cosine(queryVector, wordVectors.get(document.id)),
      }))).filter(({ score }) => score >= 0.04);
    },
    governed_hybrid(query) {
      const wordQuery = vector(query.text, wordFeatures, wordIdf);
      const characterQuery = vector(query.text, characterFeatures, characterIdf);
      const candidates = [];
      for (const document of documents) {
        const metadataScore = metadataCompatibility(document, query);
        if (metadataScore < 0) continue;
        const wordScore = cosine(wordQuery, wordVectors.get(document.id));
        const characterScore = cosine(characterQuery, characterVectors.get(document.id));
        const score = (0.68 * wordScore) + (0.26 * characterScore) + metadataScore;
        const hasContentEvidence = wordScore >= 0.03 || characterScore >= 0.12;
        if (hasContentEvidence && score >= 0.09) {
          candidates.push({
            document,
            score,
            components: { word: wordScore, character: characterScore, metadata: metadataScore },
          });
        }
      }
      return stableSort(candidates);
    },
  };
}

function discountedGain(rank, relevant) {
  return relevant ? 1 / Math.log2(rank + 2) : 0;
}

export function evaluateRetriever(queries, retrieve) {
  let reciprocalRank = 0;
  let hitAtOne = 0;
  let recallAtThree = 0;
  let ndcgAtThree = 0;
  let abstainedWhenRequired = 0;
  let forbiddenSelections = 0;
  const rows = [];

  for (const query of queries) {
    const ranked = retrieve(query);
    const ids = ranked.map(({ document }) => document.id);
    const relevant = new Set(query.relevantIds);
    const firstRelevant = ids.findIndex((id) => relevant.has(id));
    const topThree = ids.slice(0, 3);
    const expectedGain = [...relevant].slice(0, 3)
      .reduce((total, _id, index) => total + discountedGain(index, true), 0);
    const actualGain = topThree.reduce(
      (total, id, index) => total + discountedGain(index, relevant.has(id)),
      0,
    );
    const forbidden = ids.slice(0, 3).filter((id) => query.forbiddenIds.includes(id));

    if (firstRelevant >= 0) reciprocalRank += 1 / (firstRelevant + 1);
    if (relevant.has(ids[0])) hitAtOne += 1;
    if (topThree.some((id) => relevant.has(id))) recallAtThree += 1;
    if (expectedGain > 0) ndcgAtThree += actualGain / expectedGain;
    if (query.mustAbstain && ids.length === 0) abstainedWhenRequired += 1;
    forbiddenSelections += forbidden.length;
    rows.push({
      id: query.id,
      topIds: ids.slice(0, 3),
      topScores: ranked.slice(0, 3).map(({ score }) => Number(score.toFixed(6))),
      topComponents: ranked.slice(0, 3).map(({ components }) => components
        ? Object.fromEntries(Object.entries(components).map(([key, value]) => [key, Number(value.toFixed(6))]))
        : null),
      firstRelevantRank: firstRelevant < 0 ? null : firstRelevant + 1,
      mustAbstain: query.mustAbstain,
      forbiddenTopThree: forbidden,
    });
  }

  const answerable = queries.filter(({ mustAbstain }) => !mustAbstain).length;
  const abstentionCases = queries.length - answerable;
  return {
    queryCount: queries.length,
    answerableCount: answerable,
    hitAtOne: hitAtOne / answerable,
    recallAtThree: recallAtThree / answerable,
    meanReciprocalRank: reciprocalRank / answerable,
    ndcgAtThree: ndcgAtThree / answerable,
    abstentionAccuracy: abstentionCases === 0 ? null : abstainedWhenRequired / abstentionCases,
    forbiddenTopThreeRate: forbiddenSelections / (queries.length * 3),
    rows,
  };
}

function seededShuffle(values, seed) {
  const shuffled = [...values];
  let state = seed >>> 0;
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    state = ((state * 1_664_525) + 1_013_904_223) >>> 0;
    const target = state % (index + 1);
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

function rankingFingerprint(report) {
  return createHash("sha256")
    .update(JSON.stringify(report.rows.map(({ id, topIds }) => [id, topIds])))
    .digest("hex");
}

export function runRetrievalBenchmark(corpus, queries, { trialSeeds = [11, 23, 47, 83, 131] } = {}) {
  assertRetrievalInputs(corpus, queries);
  const algorithms = Object.keys(buildRetrievers(corpus));
  const results = {};
  for (const algorithm of algorithms) {
    const trials = trialSeeds.map((seed) => {
      const shuffledCorpus = seededShuffle(corpus, seed);
      const retriever = buildRetrievers(shuffledCorpus)[algorithm];
      const report = evaluateRetriever(queries, retriever);
      return { seed, fingerprint: rankingFingerprint(report), ...report };
    });
    results[algorithm] = {
      stableAcrossCorpusOrder: new Set(trials.map(({ fingerprint }) => fingerprint)).size === 1,
      trials: trials.map(({ seed, fingerprint }) => ({ seed, fingerprint })),
      summary: Object.fromEntries(Object.entries(trials[0]).filter(([key]) => !["seed", "fingerprint", "rows"].includes(key))),
      developmentRows: trials[0].rows,
    };
  }
  return {
    schemaVersion: "counsel-retrieval-admission/v1",
    corpusVersion: "synthetic-policy-corpus-v1",
    querySetVersion: "synthetic-retrieval-challenges-v1",
    corpusSha256: contentHash(corpus),
    querySetSha256: contentHash(queries),
    clinicalPerformanceEstimate: null,
    externalModelCalls: 0,
    externalSpendUsd: 0,
    trialSeeds,
    results,
  };
}
