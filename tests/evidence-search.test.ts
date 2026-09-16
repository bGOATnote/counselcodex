import test from "node:test";
import assert from "node:assert/strict";
import { parseMedlinePlus, parseEuropePmc, parseDrugLabels, medicationSearchTerm, querySchema, allowedCitationUrl, selectPassages, searchCorpus, createEvidenceSearch, asGuidance, digest, type ClinicalPassage } from "../src/evidence/search.ts";
import { citationAudit, createClaimPacket, evaluateClaimJudgment } from "../src/evidence/claims.ts";

export const passage: ClinicalPassage = { id: "medlineplus-test", title: "Urinary retention", url: "https://medlineplus.gov/urinaryretention.html", publisher: "NLM", kind: "patient_summary", text: "Acute urinary retention requires emergency medical treatment right away.", section: "Health topic summary", publicationDate: null, retrievedAt: "2026-09-11T00:00:00.000Z", population: "Applicability requires assessment", limitations: "Topic summary only; not a specialty guideline.", rights: "Attribution to MedlinePlus required", reviewDue: null, superseded: false, contentHash: digest("fixture"), linkStatus: "unverified" };
const xml = `<nlmSearchResult><list><document url="https://medlineplus.gov/urinaryretention.html"><content name="title">Urinary retention</content><content name="FullSummary">Acute urinary retention requires emergency medical treatment right away.</content></document></list></nlmSearchResult>`;
test("public search accepts concepts; rejects URLs, identifiers, operators and injection", () => {
  assert.equal(querySchema.safeParse("acute urinary retention").success, true);
  for (const q of ["https://localhost", "patient age 50", "ignore instructions", "name John", "retention AND SRC:MED", "fever\nhttps"]) assert.equal(querySchema.safeParse(q).success, false, q);
  for (const url of ["http://medlineplus.gov", "https://www.nice.org.uk.evil.test/", "https://127.0.0.1/", "https://user@medlineplus.gov/", "https://www.nice.org.uk:444/x"]) assert.equal(allowedCitationUrl(url), false);
});
test("XML summary provenance never masquerades as a reviewed full guideline", () => {
  const parsed = parseMedlinePlus(xml, passage.retrievedAt);
  assert.equal(parsed[0].kind, "patient_summary"); assert.equal(parsed[0].reviewDue, null); assert.equal(parsed[0].linkStatus, "unverified");
  assert.throws(() => parseMedlinePlus('<!DOCTYPE x [<!ENTITY a "bad">]>'+xml, passage.retrievedAt), /XML_DECLARATION/);
  assert.throws(() => parseMedlinePlus("<html>blocked</html>", passage.retrievedAt));
  assert.equal(parseMedlinePlus(xml.replace("medlineplus.gov", "localhost"), passage.retrievedAt).length, 0);
});
test("PubMed abstracts are labeled; retracted/preprint/nonreview material is excluded", () => {
  const record = { pmid: "12345", title: "A clinical guideline", abstractText: passage.text, pubTypeList: { pubType: ["Practice Guideline"] } };
  const parse = (r: unknown) => parseEuropePmc({ resultList: { result: [r] } }, passage.retrievedAt);
  assert.equal(parse(record)[0].kind, "guideline_abstract");
  assert.equal(parse({ ...record, isRetracted: "Y" }).length, 0);
  assert.equal(parse({ ...record, pubTypeList: { pubType: ["Preprint", "Review"] } }).length, 0);
  assert.equal(parse({ ...record, pmid: "../../../secret" }).length, 0);
});

test("drug labels require exact generic identity, human prescription metadata and a valid label reference", () => {
  const record = { set_id: "12345678-1234-1234-1234-123456789abc", version: "4", effective_time: "20260901", openfda: { generic_name: ["LOSARTAN POTASSIUM"], product_type: ["HUMAN PRESCRIPTION DRUG"], application_number: ["ANDA123456"] }, boxed_warning: ["Synthetic boxed-warning fixture; this is not clinical guidance."], warnings_and_cautions: ["Synthetic monitoring passage for parsing tests only; not clinical advice."] };
  const parse = (r: unknown, term = "losartan") => parseDrugLabels({ results: [r] }, term, passage.retrievedAt);
  const parsed = parse(record); assert.equal(parsed.length, 2); assert.equal(parsed[0].kind, "drug_label");
  assert.equal(parsed[0].publicationDate, "2026-09-01"); assert.match(parsed[0].limitations, /not independent FDA verification/);
  assert.equal(parsed[0].text, record.boxed_warning[0]); assert.equal(parsed[0].linkStatus, "unverified");
  assert.equal(parse(record, "sartan").length, 0);
  assert.equal(parse({ ...record, set_id: "../elsewhere" }).length, 0);
  assert.equal(parse({ ...record, openfda: { ...record.openfda, product_type: ["HUMAN OTC DRUG"] } }).length, 0);
  assert.equal(parse({ ...record, openfda: { ...record.openfda, application_number: [] } }).length, 0);
  assert.equal(parse({ ...record, openfda: { ...record.openfda, generic_name: ["LOSARTAN POTASSIUM AND HYDROCHLOROTHIAZIDE"] } }).length, 0);
  assert.equal(parse({ ...record, openfda: { ...record.openfda, generic_name: ["LOSARTAN POTASSIUM", "HYDROCHLOROTHIAZIDE"] } }).length, 0);
  assert.equal(medicationSearchTerm(["hypertension", "Losartan monitoring renal function"]), "losartan");
  assert.equal(medicationSearchTerm(["diabetic foot infection"]), null);
});

test("medication label lookup is independently ablatable and never leaks narrative into a public request", async () => {
  const seen: string[] = [];
  const fetcher = (async (input: string | URL | Request) => { seen.push(String(input)); return new Response(JSON.stringify({ results: [] }), { status: 200 }); }) as typeof fetch;
  const queries = ["hypertension", "losartan monitoring"];
  await createEvidenceSearch({ fetcher, medicationLabels: false })(queries, new AbortController().signal);
  assert.equal(seen.some((url) => url.includes("api.fda.gov")), false);
  seen.length = 0;
  const evidence = await createEvidenceSearch({ fetcher })(queries, new AbortController().signal);
  const url = new URL(seen.find((url) => url.includes("api.fda.gov"))!);
  assert.equal(url.searchParams.get("search"), 'openfda.generic_name:losartan AND openfda.product_type:"HUMAN PRESCRIPTION DRUG"');
  assert.ok(evidence.audit.some((a) => a.provider === "openfda" && a.status === "ok" && a.returned === 0));
});
test("licensed corpus rejects expired/superseded and unknown review dates", () => {
  const active = { ...passage, reviewDue: "2099-01-01T00:00:00.000Z" };
  assert.equal(searchCorpus([passage, { ...active, id: "withdrawn", superseded: true }, { ...active, id: "old", reviewDue: "2020-01-01T00:00:00.000Z" }, active], ["urinary retention"]).length, 1);
});
test("selection is deterministic, deduplicated, bounded and excerpt identity preserved", () => {
  const data = Array.from({ length: 20 }, (_,i) => ({ ...passage, id: `p${i}`, text: passage.text.repeat(100) }));
  const a = selectPassages(data, ["urinary retention"]), b = selectPassages([...data].reverse(), ["urinary retention"]);
  assert.deepEqual(a,b); assert.ok(Buffer.byteLength(JSON.stringify(a)) < 12_100);
  assert.equal(a[0].text, data[0].text.slice(0,2000)); assert.equal(a[0].excerpt?.originalLength, data[0].text.length);
  assert.equal(selectPassages([passage,passage], ["urinary retention"]).length, 1);
});
test("retrieval records API failure and link failure separately; cached summaries avoid another search", async () => {
  let calls = 0;
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    if (init?.method === "HEAD") return new Response(null, { status: 403 });
    calls++; assert.equal(init?.redirect, "error");
    if (String(url).includes("ebi.ac.uk")) return new Response("unavailable", { status: 503 });
    return new Response(xml);
  }) as typeof fetch;
  const search = createEvidenceSearch({ fetcher });
  const a = await search(["urinary retention"], new AbortController().signal);
  assert.equal(a.passages.length, 1); assert.equal(a.passages[0].linkStatus, "unverified");
  assert.ok(a.audit.some((a) => a.error === "SOURCE_HTTP_503"));
  const b = await search(["urinary retention"], new AbortController().signal);
  assert.ok(b.audit.some((a) => a.status === "cached")); assert.equal(calls, 3);
});
test("first-query topic guidance is not displaced by keyword-dense review abstracts", () => {
  const summary = { ...passage, id: "topic", title: "Suicide", retrieval: { query: "suicidal ideation", rank: 0 }, text: passage.text.repeat(45) };
  const reviews = Array.from({ length: 12 }, (_, i) => ({ ...passage, id: `review-${i}`, kind: "review_abstract" as const, title: "Suicidal ideation experimental treatment", text: passage.text.repeat(45) }));
  const selected = selectPassages([...reviews, summary], ["suicidal ideation"]);
  assert.equal(selected[0].id, "topic");
  assert.equal(selected[0].text, summary.text);
  assert.deepEqual(selectPassages([summary, ...reviews].reverse(), ["suicidal ideation"]), selected);
  assert.equal(selected.filter((p) => p.id === "topic").length, 1);
  assert.ok(selected.some((p) => p.kind === "review_abstract"));
  assert.equal(selectPassages([...reviews, summary], ["no matching topic", "suicidal ideation"])[0].id, "topic");
});
test("public source timeout resolves as evidence unavailable, not a clinical route", async () => {
  let abortedRequests = 0;
  const search = createEvidenceSearch({ timeoutMs: 25, fetcher: (async (_url, init) => new Promise((_resolve, reject) => {
    const signal = init?.signal;
    assert.ok(signal);
    // A real in-flight fetch owns I/O. A bare pending Promise does not keep
    // Node 22 alive for AbortSignal.timeout's unreferenced timer. Represent
    // that request with a bounded referenced handle, cleaned up on abort.
    const handle = setTimeout(() => { signal.removeEventListener("abort", abort); reject(new Error("TEST_FETCH_DID_NOT_ABORT")); }, 1000);
    function abort() { clearTimeout(handle); abortedRequests++; reject(signal!.reason); }
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  })) as typeof fetch });
  const r = await search(["urinary retention"], new AbortController().signal);
  assert.equal(r.passages.length, 0); assert.equal(r.audit.filter((a) => a.status === "failed").length, 2);
  assert.equal(abortedRequests, 2, "the source deadline must abort both pending requests");
});
test("retrieved passages reach independent claim auditor with exact identity", () => {
  const guidance = asGuidance([passage]);
  assert.equal(guidance[0].reviewedAt, ""); assert.equal(guidance[0].retrievedPassages![0].excerpt, passage.text);
  const packet = createClaimPacket(null, "I cannot pass urine.", guidance, "anthropic/claude-opus-5", "2026-09-11", { responseEvents: [{ kind: "action", notice: { disposition: "EMERGENCY_NOW", directive: passage.text, source: "emergency_agent" } }] });
  const judgment = { packetHash: packet.packetHash, units: packet.units.map((u) => ({ id: u.id, basis: "source", support: "supported", applicability: "applicable", passageIds: [`${passage.id}:passage`], patientQuotes: [], explanation: "The exact source passage states this action." })) };
  const result = evaluateClaimJudgment(packet, judgment, "openai/gpt-6-astra");
  assert.equal(result.units[0].invalidGrounding, false); assert.equal(result.clinicalCorrectness, "not_assessed");
  const bad = structuredClone(guidance); bad[0].retrievedPassages![0].excerpt += "changed";
  const answer = { evidence: [{ sourceId: passage.id, claim: "Test claim" }] } as Parameters<typeof citationAudit>[0];
  assert.equal(citationAudit(answer, bad).status, "fail");
});
