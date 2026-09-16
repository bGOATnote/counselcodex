# Same-document expansion: current-cohort null addendum

## Decision

Do not wire the isolated section-expansion experiment into the live pipeline, even behind a flag. Replaying all 49 saved V25 run artifacts produced **zero added passages**. There is no demonstrated current-cohort benefit, generated-claim lift or clinical improvement to justify another runtime component. Historical reports and isolated experiments remain unchanged and reproducible.

This is a $0 structural replay of saved packets, not a new 50-case clinical evaluation. It performs no model, embedding or network calls and does not rebuild the corpus/index.

## Result and important confound

| Measure | Result |
| --- | --- |
| Saved JSON run artifacts inspected | 49 |
| V25 packets already at the nine-passage limit | 46 |
| V25 packets below the limit | 3 |
| Packets with expansion additions | 0 |
| Total added passages | 0 |
| Replay errors | 0 |
| V25 ordering/selection differing from the expander's V26 baseline | 49 |

The expander internally calls `selectDispositionEvidence` (V26); live V25 calls `selectGraphEvidence`. Therefore simply integrating this helper would mix **a selector change with expansion**, even when expansion adds nothing. The 49 ordering/selection differences are neither demonstrated improvements nor regressions. Exact packet/release reconstruction would also need consistent provenance and hashing; that integration is not warranted by this result.

The earlier authored-probe gain was one migraine treatment-review witness found in two retrospective query variants, not two independent patient gains. No experiment here demonstrates better use of those passages in a generated answer. The capacity-only arm preserves its own V26 baseline; this must not be misrepresented as preserving V25 selection.

## Reproduce

Run from the repository root with the retained local corpus and saved artifacts available. The command only prints results and input identities; `triage` is the selector intent, while original stored queries remain unchanged.

```bash
node --experimental-strip-types - <<'NODE'
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createSupportSectionExpander } from './src/evidence/rag/support-section-expansion.ts';
import { selectGraphEvidence } from './src/evidence/rag/selection.ts';
const corpus = JSON.parse(readFileSync('apps/evaluation/.local/clinical-rag-v8/corpus.json', 'utf8'));
const expand = createSupportSectionExpander(corpus);
const dir = 'outputs/v25-path-b-complete-replay-2026-09-15/runs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let total = 0, full = 0, capacity = 0, swapped = 0, adds = 0, errors = 0;
const changed = [], manifest = [];
for (const f of readdirSync(dir).sort().filter(f => f.endsWith('.json'))) {
  const path = `${dir}/${f}`, bytes = readFileSync(path);
  const run = JSON.parse(bytes.toString());
  manifest.push([path, sha(bytes)]); total++;
  try {
    const before = selectGraphEvidence(run.graph.retrieval, 9);
    const after = expand(run.graph.retrieval, 'triage', 9, 'capacity_only');
    if (before.length === 9) full++; else capacity++;
    if (JSON.stringify(before.map(h => h.chunk.id)) !==
        JSON.stringify(after.hits.slice(0, after.audit.baselineCount).map(h => h.chunk.id))) swapped++;
    if (after.audit.additions.length) {
      adds += after.audit.additions.length;
      changed.push({ runId: run.runId, additions: after.audit.additions.map(x => x.id) });
    }
  } catch (e) { errors++; console.log('ERROR', f, e.message); }
}
console.log(JSON.stringify({
  total, fullV25Packets: full, underCapacityV25Packets: capacity,
  baselineOrderingOrSelectionChangedByV26: swapped,
  expansionAddedPassages: adds, expansionChangedRuns: changed, errors,
  scope: 'Offline packet structure only, no generated claim or clinical outcome test',
  inputManifestSha256: sha(JSON.stringify(manifest)), corpusHash: corpus.hash
}, null, 2));
NODE
```

Frozen identities for this replay:

- Sorted `[repository-relative path, file-byte SHA-256]` manifest, JSON-encoded without whitespace: `88067015cfeb0b1b7445d24f5ed2a3b23e3c24bd562e5f6b0231c45785b0a310`.
- Corpus content hash: `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`.
- `support-section-expansion.ts` SHA-256: `a72b46754b0a2a31dfdfabbbac60d42250d6064070da4c2e6d8fc45926556061`.
- `v26.ts` SHA-256: `d4ac515bd3d63ed7d333b59b498425869064438e00cd161d74aaeed4d18c7529`.
- `selection.ts` SHA-256: `b90cb02b6f77620307e452a884ca7335d7f818ed822d0ef80a3d0c2dd252c9c7`.

No live flag, model setting, runtime source, physician reference, original CSV, historical report or saved output was changed. Offline experiment modules are not live imports; keep any future diagnostic work clearly separate from the production path. A reproducible null finding is sufficient reason not to add architecture.
