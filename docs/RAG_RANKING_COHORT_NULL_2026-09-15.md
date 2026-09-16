# V25 retained-cohort ranking-only ablation: negative result

Date: 2026-09-15. Status: offline development diagnostic; **no promotion**.

Replacing V25 selection with the existing V26 ranker recovered no authored task-support witness and lost three. Source selection changes are not a neutral implementation detail: this candidate changes both passage membership and order. This result does not justify changing the live selector.

## Fixed comparison

Both selectors received the same 49 retained V25 retrieval-result arrays, with a nine-passage limit. V26 used the fixed `triage` intent for every case. No query hints, search, section expansion, index rebuild, embeddings, model generation, corpus changes or source rewriting were performed. Every reconstructed V25 packet matched its retained packet hash and guidance IDs.

The replay directory lacks C04; its historical admission is not repaired or reclassified. C25 is included because this is passage coverage, not physician-route agreement. Reference IDs/messages/hashes are used only to join artifacts to retrospective fixtures; accepted routes and fixture labels do not enter either selector.

| Selection count | V25 | V26 |
|---|---:|---:|
| Retained runs | 49 | 49 |
| Selected passage occurrences | 435 | 435 |
| Empty selections | 0 | 0 |
| Known witness roles present in selected chunk text | 11/14 | 8/14 |
| Known witness roles present including adjacent context | 12/14 | 9/14 |

V26 changed 38/49 passage sets and all 49 orders. There were 72 case-chunk additions and 72 removals, all from already retrieved candidates; these are not 72 new searches or globally distinct sources. There were zero V26 currency rejections or retained retrieval warnings. Both selectors returned nine passages for 46 runs, eight for C16/C19, and five for C28.

## Witness coverage and losses

Eight retrospectively labelled cases supply 16 witness roles. Fourteen roles have authored exact spans (15 spans because one role requires two); two explicitly have no authored witness and are not empty passes. All 14 known roles have corpus witnesses. The original retrieved chunk texts contain 11, and V25 already selected all 11.

| Authored role | Known roles | Retrieved chunk text | V25 selected | V26 selected |
|---|---:|---:|---:|---:|
| Diagnostic description | 7 | 7 | 7 | 5 |
| Diagnostic confirmation | 2 | 2 | 2 | 2 |
| Care-setting conditions | 2 | 1 | 1 | 1 |
| Medication safety | 1 | 1 | 1 | 0 |
| Follow-through | 2 | 0 | 0 | 0 |
| Total | 14 | 11 | 11 | 8 |

Zero labelled roles or individual exact spans were recovered. Three roles/spans were lost; none survives in V26's adjacent context:

| Case | Lost fixture witness | Source and passage |
|---|---|---|
| C22 | `ankle-sprain-description`: typical sprain symptoms | MedlinePlus 417, `737d60e96fde27fab6c6b4d2357314cb7846a7c96e35244d906e301563bac59f` |
| C38 | `sprain-recovery-description`: early treatment context | Same MedlinePlus passage; not ibuprofen dose/duration support |
| C34 | `allergy-medication-safety`: oral-decongestant cautions | OpenEM seasonal allergies, Pitfalls, `e46f0cfa5bb081a2fa6ea96179a9dbee2754d91bb6436a71ad8b3cea26afa401` |

The command below emits the exact lost quotations, complete original chunks, surrounding context and each fixture's interpretation boundary. Retained OpenEM synthesis claims are not endorsed medical advice.

C47's `insomnia-underlying-task` witness is visible only in adjacent context in both arms, not selected chunk text. This increases context-inclusive follow-through coverage to 1/2 and total role coverage to 12/14 versus 9/14; it does not create a directly selectable quote span. Individual exact-span coverage is 12/15 versus 9/15 in chunk text, or 13/15 versus 10/15 with adjacent context.

The ankle-fracture-assessment and ibuprofen-product-safety fixtures have no authored corpus witness. They remain unassessed, not proven corpus absences. Other unlabelled gains/losses are not clinically adjudicated. Exact reference identity, semantic claim support, patient applicability and clinical correctness remain distinct; no routing, safety, latency or clinical lift was measured.

## Reproduce: read-only, stdout only

Run from the repository root. The command checks run/packet identity, uses the existing selectors and auditor, and verifies that all read input/source files remain unchanged. It makes no provider calls and writes no files.

```sh
node --experimental-strip-types --input-type=module <<'JS'
import {readFileSync as rf,readdirSync} from "node:fs";
import assert from "node:assert/strict";
import {sha256} from "./src/evidence/rag/model.ts";
import {selectGraphEvidence as v25} from "./src/evidence/rag/selection.ts";
import {selectDispositionEvidence as v26} from "./src/evidence/rag/v26.ts";
import {createTaskSupportAuditor} from "./src/evidence/rag/task-support-audit.ts";
import {TASK_SUPPORT_FIXTURES as fixtures} from "./src/evidence/rag/task-support-fixtures.ts";
const hashes={}, read=p=>{const b=rf(p);hashes[p]=sha256(b);return JSON.parse(b);};
for(const p of ["src/evidence/rag/selection.ts","src/evidence/rag/v26.ts","src/evidence/rag/task-support-audit.ts","src/evidence/rag/task-support-fixtures.ts","src/evidence/rag/disposition-support.ts","src/evidence/rag/model.ts"]) hashes[p]=sha256(rf(p));
const corpus=read("apps/evaluation/.local/clinical-rag-v8/corpus.json"), audit=createTaskSupportAuditor(corpus);
const ref=read("data/evaluation/physician-system-reference-v2.json");
const dir="outputs/v25-path-b-complete-replay-2026-09-15/runs", rows=[], witnesses=[];
for(const file of readdirSync(dir).filter(f=>f.endsWith(".json")).sort()){
  const r=read(dir+"/"+file), matches=ref.cases.filter(c=>c.message===r.message&&c.inputHash===r.inputHash);
  assert.equal(matches.length,1);
  const id=matches[0].id, a=v25(r.graph.retrieval,9), ranked=v26(r.graph.retrieval,"triage",9), b=ranked.hits;
  assert.equal(sha256(JSON.stringify(a)),r.graph.frozenPacketHash);
  assert.deepEqual(a.map(h=>h.chunk.id),r.guidance.map(g=>g.id));
  const removed=a.filter(h=>!b.some(x=>x.chunk.id===h.chunk.id)).length;
  rows.push({id,a:a.length,b:b.length,removed,added:b.filter(h=>!a.some(x=>x.chunk.id===h.chunk.id)).length,
    reordered:JSON.stringify(a.map(h=>h.chunk.id))!==JSON.stringify(b.map(h=>h.chunk.id)),rejected:ranked.audit.rejected.length});
  for(const w of fixtures.find(f=>f.caseId===id)?.witnesses??[]){
    const check=hits=>audit(w,{retrieval:r.graph.retrieval,expectedQueries:r.graph.context?.queries??[],
      selected:hits.map(h=>({id:h.chunk.id,summary:h.chunk.text})),citations:[],responsePublished:false,errors:[]});
    const x=check(a),y=check(b);assert.ok(x.complete&&y.complete);
    const visible=hits=>w.spans===null?null:w.spans.every(s=>hits.some(h=>h.document.id===s.documentId&&(h.context.before+h.chunk.text+h.context.after).includes(s.quote)));
    const lostSpans=(w.spans??[]).filter(s=>a.some(h=>h.document.id===s.documentId&&h.chunk.text.includes(s.quote))&&!b.some(h=>h.document.id===s.documentId&&h.chunk.text.includes(s.quote))).map(s=>{
      const h=a.find(h=>h.document.id===s.documentId&&h.chunk.text.includes(s.quote));
      return {...s,passageId:h.chunk.id,section:h.chunk.sectionTitle,context:h.context,fullChunk:h.chunk.text,boundary:w.boundary};
    });
    witnesses.push({caseId:id,id:w.id,role:w.role,known:w.spans!==null,retrieved:x.retrievedOpportunity,a:x.selectedOpportunity,b:y.selectedOpportunity,visibleA:visible(a),visibleB:visible(b),lostSpans});
  }
}
assert.equal(rows.length,49);assert.equal(new Set(rows.map(r=>r.id)).size,49);assert.equal(witnesses.length,16);
const count=(ws,k)=>ws.filter(w=>w[k]===true).length, known=witnesses.filter(w=>w.known);
const roles=Object.fromEntries([...new Set(known.map(w=>w.role))].sort().map(role=>{const ws=known.filter(w=>w.role===role);return[role,{n:ws.length,retrieved:count(ws,"retrieved"),v25:count(ws,"a"),v26:count(ws,"b"),visibleV25:count(ws,"visibleA"),visibleV26:count(ws,"visibleB")}];}));
assert.ok(Object.entries(hashes).every(([p,h])=>sha256(rf(p))===h));
console.log(JSON.stringify({runs:rows.length,missing:ref.cases.filter(c=>!rows.some(r=>r.id===c.id)).map(c=>c.id),
  selected:rows.reduce((n,r)=>n+r.a,0),selectedV26:rows.reduce((n,r)=>n+r.b,0),emptyV25:rows.filter(r=>!r.a).length,emptyV26:rows.filter(r=>!r.b).length,
  changedSets:rows.filter(r=>r.removed||r.added).length,changedOrders:rows.filter(r=>r.reordered).length,removed:rows.reduce((n,r)=>n+r.removed,0),added:rows.reduce((n,r)=>n+r.added,0),rejected:rows.reduce((n,r)=>n+r.rejected,0),
  labelled:known.length,noAuthoredWitness:witnesses.filter(w=>!w.known).map(w=>w.id),roles,
  recovered:known.filter(w=>!w.a&&w.b).map(w=>w.id),lost:known.filter(w=>w.a&&!w.b).map(w=>({caseId:w.caseId,id:w.id,spans:w.lostSpans})),
  contextOnly:known.filter(w=>w.visibleA!==w.a||w.visibleB!==w.b),inputHashes:hashes,paidCalls:0,clinicalLift:"not_assessed"},null,2));
JS
```

## Source code SHA-256

These are the implementations and authored fixtures used for this result. The command prints their current hashes alongside the retained input hashes.

| File | SHA-256 |
|---|---|
| `src/evidence/rag/selection.ts` | `b90cb02b6f77620307e452a884ca7335d7f818ed822d0ef80a3d0c2dd252c9c7` |
| `src/evidence/rag/v26.ts` | `d4ac515bd3d63ed7d333b59b498425869064438e00cd161d74aaeed4d18c7529` |
| `src/evidence/rag/task-support-audit.ts` | `3298615c56ea8a6d0593bfd58dbe2b270a5916b3912ed12e370246609917f78b` |
| `src/evidence/rag/task-support-fixtures.ts` | `2444d5530635fd4a7c1aecf51f71c82a589d96d8c41eb98c5c3420b9fdd89fac` |
| `src/evidence/rag/disposition-support.ts` | `4d86a5020425fc6cf12820930c49f5b00741f7fffd795c9651ef6c8c7b38c296` |
| `src/evidence/rag/model.ts` | `3d45f32c995771a9f9e42b2a7b2a0d803ae5bcff6cd477ed868a1599732f156c` |

Retained corpus identity: `af7e4a8c239c4b084525aba008d56ce833b3a08144cea6237319bf996aa30dbd`. Corpus-file SHA-256: `8da96a0ecaf1f1e314f4194a2fadd37887785fb2cd028bce17815a96a85bf635`.
