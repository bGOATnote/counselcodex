# Source-reference aliases: deferred

Decision: retain canonical passage IDs. Replacing 64-character source IDs with
packet-local `s0`, `s1`, … saves only 1.694% of the measured user-input bytes.
No demonstrated SHA-ID transcription failures in the completed full-output arms
currently justify another mapping and request-binding boundary. Two packets can
both contain `s0/q0`; safe decoding would require immutable mappings, exact quote
offset checks and application-owned packet provenance, not aliases alone.

An isolated draft codec and tests were created, then removed before commit:
their added mapping complexity did not earn a place in the repository. No live
workflow or study imported them. This measured decision and its reproduction
remain; no paid calls were made for this check.

## Mechanical size check

The 50 frozen V25 first-producer inputs were reconstructed from the completed
network-replication plan; output sizes use the original V25 raw producer objects
linked by that plan. Replacing only passage-ID fields gives:

| Serialized JSON | Original bytes | Aliased bytes | Reduction |
|---|---:|---:|---:|
| 50 user-input payloads, 444 source entries | 1,625,090 | 1,597,562 | 27,528 bytes (1.694%) |
| 50 original wire outputs, 96 citations | 112,508 | 106,556 | 5,952 bytes (5.290%) |

These are UTF-8 JSON bytes, not token counts. Input totals exclude system
instructions and provider schema/framing; those make the whole-request
percentage smaller. Application-only mapping/journal storage is additional and
excluded from model payload sizes. The measurements are deterministic string
substitution, not new model outputs or proof of fewer identity errors.

There is no demonstrated token, latency, cost, model-quality or safety benefit.
Revisit only if observed identity failures or a measured token-budget constraint
make the additional boundary worthwhile. Quote identity is not semantic support.

## Exact reproduction

Run from the repository root. This reads existing artifacts only, changes only
ID fields in memory, and fails if an original citation is not in its source packet.

```sh
node --input-type=module -e '
import fs from "node:fs";
const p = JSON.parse(fs.readFileSync("outputs/routing-brief-network-replication-2026-09-15/plan.json"));
let original = 0, compact = 0, sourceN = 0;
for (const c of p.cases) {
  original += Buffer.byteLength(JSON.stringify(c.packets.full));
  const candidate = {...c.packets.full, sources: c.packets.full.sources.map((s, i) => ({...s, id: "s" + i}))};
  compact += Buffer.byteLength(JSON.stringify(candidate));
  sourceN += c.packets.full.sources.length;
}
let oldOut = 0, newOut = 0, refs = 0;
for (const c of p.cases) {
  const r = JSON.parse(fs.readFileSync(c.path));
  const e = r.agents.find(a => a.role === "disposition").rawOutput;
  oldOut += Buffer.byteLength(JSON.stringify(e));
  const index = new Map(c.sources.map((s, i) => [s.id, "s" + i]));
  const next = {...e, citations: e.citations.map(q => {
    if (!index.has(q.passageId)) throw Error("UNBOUND");
    refs++;
    return {...q, passageId: index.get(q.passageId)};
  })};
  newOut += Buffer.byteLength(JSON.stringify(next));
}
console.log(JSON.stringify({
  cases: p.cases.length, sourceN,
  inputBytes: original, aliasedInputBytes: compact,
  inputBytesSaved: original - compact,
  inputReductionPct: 100 * (original - compact) / original,
  refs, outputBytes: oldOut, aliasedOutputBytes: newOut,
  outputBytesSaved: oldOut - newOut,
  outputReductionPct: 100 * (oldOut - newOut) / oldOut
}, null, 2));
'
```
