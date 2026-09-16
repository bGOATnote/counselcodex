import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCorpus, sha256, type Hit, type Retrieval, type ClinicalDocument } from "./model.ts";
import { dispositionQueryHint, selectDispositionEvidence, accountClaimLinks } from "./v26.ts";

function hit(id:string,title:string,text:string,kind:ClinicalDocument["kind"]="patient_summary",section="Overview"):Hit {
  const d:ClinicalDocument={id,title,url:`https://example.org/${id}`,publisher:"Test",kind,license:"CC0-1.0",licenseUrl:"https://creativecommons.org/publicdomain/zero/1.0/",attribution:"Synthetic retrieval-test material",sourceVersion:"test/v1",rawHash:sha256(text),retrievedAt:"2026-09-15T00:00:00.000Z",publicationDate:null,reviewStatus:"agent_compiled",reviewDate:null,currency:"not_assessed",scope:"Fictional test content, not medical advice",aliases:[],concepts:[],related:[],sections:[{title:section,text}]};
  const c=buildCorpus([d]);const {sections,...document}=d;
  return {chunk:c.chunks[0],document,score:.01,channels:["lexical"],context:{before:"",after:""}};
}
function packet(query:string,hits:Hit[]):Retrieval {return {query,hits,corpusHash:"a".repeat(64),mode:"lexical",timings:{},warnings:[],embeddingTokens:0,embeddingCacheHit:false};}
test("V26 hints preserve queries/negation, never truncate, and leave education unchanged",()=>{
  const raw="no chest pain; history of migraine only";
  assert.ok(dispositionQueryHint(raw,"triage").query.startsWith(raw+" "));
  assert.equal(dispositionQueryHint("x".repeat(290),"triage").query,"x".repeat(290));
  assert.equal(dispositionQueryHint(raw,"education").query,raw);
  assert.throws(()=>dispositionQueryHint("abc\n","triage"),/INVALID/);
});
test("topic and explicit patient-summary instructions beat unrelated guideline/heading",()=>{
  const right=hit("stroke","Stroke","Stroke warning signs. Call 9-1-1 for emergency care."),wrong=hit("migraine","Migraine","Migraine disposition outpatient follow-up.","primary_guideline","Disposition");
  const result=selectDispositionEvidence([packet("stroke weakness",[wrong,right])],"triage",1);
  assert.equal(result.hits[0],right);assert.equal(result.audit.ranking[0].sourcePrior,0);
  assert.equal(result.audit.claimSupport,"not_assessed");assert.equal(result.audit.applicability,"not_assessed");
});
test("source prior is small, demotes only soft summaries and gives synthesis no authority bonus",()=>{
  const soft=hit("soft","Topic","Topic overview."),action=hit("action","Topic","Topic seek medical care now."),synth=hit("synth","Topic","Topic overview.","research_synthesis");
  const r=selectDispositionEvidence([packet("Topic",[soft,action,synth])],"management");
  assert.equal(r.audit.ranking.find(x=>x.id===soft.chunk.id)?.sourcePrior,-.1);
  assert.equal(r.audit.ranking.find(x=>x.id===action.chunk.id)?.sourcePrior,0);
  assert.equal(r.audit.ranking.find(x=>x.id===synth.chunk.id)?.sourcePrior,0);
});
test("semantic-only hits are not excluded by lexical overlap; queries retain representation",()=>{
  const a=hit("aaa","First topic","First topic exact clinical content."),b=hit("bbb","Synonym","An alternate phrase." );b.channels=["vector"];
  const r=selectDispositionEvidence([packet("First topic",[a]),packet("lexically different",[b])],"triage",2);
  assert.equal(r.hits.length,2);assert.ok(r.audit.queryCoverage.every(c=>c.selected===1));
});
test("duplicates preserve exact hits; metadata conflict or altered quote rejects",()=>{
  const h=hit("dup","Topic","Do not defer assessment unless criteria hold."),other={...h,score:.02,channels:["vector"]};
  const p=[packet("Topic",[h]),packet("assessment",[other])],before=JSON.stringify(p);
  const result=selectDispositionEvidence(p,"triage");
  assert.equal(result.hits.length,1);assert.ok(result.hits[0]===h||result.hits[0]===other);assert.equal(JSON.stringify(p),before);
  const bad=structuredClone(other);bad.document.sourceVersion="test/v2";
  assert.throws(()=>selectDispositionEvidence([p[0],packet("Topic",[bad])],"triage"),/CONFLICTING/);
  bad.document.sourceVersion=h.document.sourceVersion;bad.chunk.text="tampered";
  assert.throws(()=>selectDispositionEvidence([packet("Topic",[bad])],"triage"),/INTEGRITY/);
});
test("corpus mixing, invalid limits and conflicting retracted duplicates reject",()=>{
  const h=hit("dup","Topic","Source text."),invalid=structuredClone(h);invalid.document.currency="retracted";
  assert.throws(()=>selectDispositionEvidence([packet("Topic",[invalid]),packet("Topic",[h])],"triage"),/CONFLICTING/);
  assert.equal(selectDispositionEvidence([packet("Topic",[invalid])],"triage").hits.length,0);
  assert.throws(()=>selectDispositionEvidence([packet("Topic",[h]),{...packet("Topic",[h]),corpusHash:"b".repeat(64)}],"triage"),/MIXED/);
  assert.throws(()=>selectDispositionEvidence([],"triage",0),/LIMIT/);
});
test("canonical duplicate identity ignores key order but quote accounting rejects ambiguity",()=>{
  const h=hit("same-id","Topic","A sentence with qualifiers."),reordered=structuredClone(h);
  reordered.document=Object.fromEntries(Object.entries(h.document).reverse()) as Hit["document"];
  reordered.chunk=Object.fromEntries(Object.entries(h.chunk).reverse()) as Hit["chunk"];
  assert.equal(selectDispositionEvidence([packet("Topic",[h,reordered])],"triage").hits.length,1);
  assert.equal(accountClaimLinks([h,reordered],[{id:"claim",references:[{passageId:h.chunk.id,quote:h.chunk.text}]}]).claims[0].unboundReferences,0);
  const conflicting=structuredClone(h);conflicting.chunk.text="A different valid passage.";
  conflicting.chunk.hash=sha256(conflicting.chunk.text);conflicting.chunk.end=conflicting.chunk.start+conflicting.chunk.text.length;
  assert.throws(()=>accountClaimLinks([h,conflicting],[{id:"claim",references:[{passageId:h.chunk.id,quote:h.chunk.text}]}]),/CONFLICTING/);
  conflicting.chunk.hash="invalid";assert.throws(()=>accountClaimLinks([conflicting],[]),/INTEGRITY/);
});
test("selection is deterministic/bounded and quote references never become semantic support",()=>{
  const h=hit("one","Topic","A source sentence with important conditions."),p=[packet("Topic",[h])];
  assert.deepEqual(selectDispositionEvidence(p,"triage"),selectDispositionEvidence(p,"triage"));
  assert.equal(selectDispositionEvidence([],"triage").audit.emptyPacket,true);
  const a=accountClaimLinks([h],[{id:"bound",references:[{passageId:h.chunk.id,quote:h.chunk.text}]},{id:"missing",references:[]},{id:"invented",references:[{passageId:h.chunk.id,quote:"Not in this source"}]}]);
  assert.equal(a.claims[0].support,"not_assessed");assert.equal(a.claims[1].missingReferences,true);assert.equal(a.claims[2].unboundReferences,1);
  assert.equal(a.unsupportedClaims,"not_assessed");assert.throws(()=>accountClaimLinks([], [{id:"same",references:[]},{id:"same",references:[]}]),/DUPLICATE/);
});
test("V25 live producer and verifier do not import V26",()=>{
  for(const path of ["src/disposition/clinical-graph.ts","src/disposition/gates-release.ts","src/disposition/graph-runtime.ts"]) assert.doesNotMatch(readFileSync(path,"utf8"),/v26/);
});
