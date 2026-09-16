/** Offline presentation of saved evidence. Never imported by an inference path. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { parseCsv } from "../lib/csv.mjs";
import { verifyGeneration } from "../../scripts/stripped-3bucket-medgemma.mjs";
import { buildComparison } from "../../scripts/score-stripped-3bucket-medgemma.mjs";
import { loadRun, validateAdjudication } from "../../scripts/score-physician-adjudication-v3.mjs";
import { computeMetrics } from "../../scripts/score-fn-reduction.mjs";

const IDS = Array.from({ length: 50 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`);
const BUCKETS = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
const MEDGEMMA = "outputs/stripped-3bucket-medgemma-27b-q5-2026-09-16";
const FABLE = { key: "fableLow", path: "outputs/stripped-3bucket-fable-2026-09-15", provider: "anthropic", model: "claude-fable-5-1", effort: "low", taxonomy: "three_bucket" };
const REFERENCE = "data/evaluation/physician-adjudication-v3-2026-09-15.json";
const BASE = "data/evaluation/physician-system-reference-v2.json";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
const readJSON = path => JSON.parse(readFileSync(path, "utf8"));

function within(root, path) {
  assert(typeof path === "string" && !isAbsolute(path) && !path.includes("\\") && !path.split("/").includes(".."), "Repository-relative path required");
  const full = resolve(root, path);
  assert(!relative(root, full).startsWith(".."), "Path escapes repository");
  return full;
}

/** Both generation verifiers finish before labels are opened; no scorer writes. */
export function loadCaseReview(root) {
  const medgemma = verifyGeneration(within(root, MEDGEMMA));
  const fable = loadRun(FABLE);
  assert.equal(medgemma.manifest.csvSHA256, fable.manifest.csvSHA256);
  assert.equal(medgemma.manifest.promptSHA256, fable.manifest.promptSHA256);
  assert.equal(medgemma.manifest.systemPrompt, fable.manifest.systemPrompt);
  const audit = readJSON(within(root, `${MEDGEMMA}/scoring-audit.json`));
  assert.equal(audit.referencesReadAfterGenerationVerification, true);
  assert(Date.parse(audit.scoredAt) >= Date.parse(medgemma.complete.completedAt));
  const referenceBytes = readFileSync(within(root, REFERENCE)), baseBytes = readFileSync(within(root, BASE));
  assert.equal(sha256(referenceBytes), audit.referenceSHA256, "Reference differs from saved scoring");
  const reference = validateAdjudication(JSON.parse(referenceBytes), JSON.parse(baseBytes), baseBytes);
  const recomputed = buildComparison({ medgemma: medgemma.predictions, fable: fable.predictions.map(row => ({ ...row, parsed: { disposition: row.disposition, rationale: row.rationale }, failure: null })), reference });
  assert.deepEqual(recomputed.scorecard, readJSON(within(root, `${MEDGEMMA}/scorecard-A-physician-v3.json`)), "Saved scorecard differs from frozen evidence");
  assert.deepEqual(recomputed.comparison, readJSON(within(root, `${MEDGEMMA}/comparison-fable.json`)), "Saved comparison differs from frozen evidence");
  const csvBytes = readFileSync(within(root, "data/patient_messages.csv"));
  assert.equal(sha256(csvBytes), medgemma.manifest.csvSHA256, "Original CSV identity differs");
  const provenance = {};
  for (const path of [REFERENCE, BASE, "data/patient_messages.csv", ...[MEDGEMMA, FABLE.path].flatMap(path => [path + "/manifest.json", path + "/generation-complete.json"]), ...["scorecard-A-physician-v3.json", "comparison-fable.json", "scoring-audit.json"].map(name => `${MEDGEMMA}/${name}`)]) provenance[path] = sha256(readFileSync(within(root, path)));
  for (const [path, expected] of Object.entries(audit.scoringSourceHashes)) {
    assert.equal(sha256(readFileSync(within(root, path))), expected, "Frozen scoring source changed");
    provenance[path] = expected;
  }
  for (const path of [MEDGEMMA, FABLE.path]) {
    const complete = readJSON(within(root, path + "/generation-complete.json"));
    for (const [name, expected] of Object.entries(complete.artifactHashes)) {
      const key = `${path}/${name}`;
      assert.equal(sha256(readFileSync(within(root, key))), expected);
      provenance[key] = expected;
    }
  }
  return projectCaseReview({ comparison: recomputed.comparison, reference, base: JSON.parse(baseBytes), csvRows: parseCsv(csvBytes.toString("utf8")), provenance, completedAt: medgemma.complete.completedAt, scoredAt: audit.scoredAt, promptSHA256: medgemma.manifest.promptSHA256 });
}

/** Only explicit disposition/rationale fields are copied; raw reasoning is omitted. */
export function projectCaseReview({ comparison, reference, base, csvRows, provenance, completedAt, scoredAt, promptSHA256 }) {
  for (const [label, rows] of Object.entries({ comparison: comparison.rows, reference: reference.cases, base: base.cases, csv: csvRows })) assert.deepEqual(rows.map(row => row.id), IDS, `${label}: 50 ordered cases required`);
  const cases = comparison.rows.map((row, index) => {
    const ref = reference.cases[index], old = base.cases[index], csv = csvRows[index];
    assert.equal(row.message, ref.message); assert.equal(row.message, old.message); assert.equal(row.message, csv.message);
    assert.equal(sha256(row.message), ref.inputSHA256);
    assert.deepEqual(row.acceptedBuckets, ref.acceptedBuckets);
    assert(BUCKETS.includes(csv.disposition), "Unexpected original CSV label");
    const amendment = reference.amendments.find(item => item.id === row.id);
    const decision = (value, path) => {
      assert.equal(value.id, row.id); assert.equal(value.message, row.message);
      assert.deepEqual(value.acceptedBuckets, row.acceptedBuckets);
      assert(value.disposition === null || BUCKETS.includes(value.disposition));
      assert.equal(value.agrees, ref.acceptedBuckets.includes(value.disposition));
      assert(value.rationale === null || typeof value.rationale === "string");
      return { disposition: value.disposition, rationale: value.rationale, failure: value.failure, agrees: value.agrees, clinicianAction: value.clinicianAction, urgentAction: value.urgentAction, parsedPath: `${path}/${row.id}-parsed.json`, rawPath: `${path}/${row.id}-raw.json` };
    };
    return { id: row.id, message: row.message, title: row.message.length > 102 ? row.message.slice(0, 99).trimEnd() + "…" : row.message,
      inputSHA256: ref.inputSHA256, physician: { acceptedBuckets: [...ref.acceptedBuckets], priorAcceptedRoutes: ref.previousAcceptedRoutes, source: ref.source,
        note: amendment?.explanation ?? old.reference.note ?? null },
      fable: decision(row.fable, FABLE.path), medgemma: decision(row.medgemma, MEDGEMMA), csv: { disposition: csv.disposition },
      dispositionDisagrees: row.fable.disposition !== row.medgemma.disposition };
  });
  assert.deepEqual(cases.filter(row => row.dispositionDisagrees).map(row => row.id), comparison.disagreementIds);
  const stats = metric => ({ agree: metric.agree, denominator: metric.denominator, failedOutputs: metric.failedOutputs,
    clinicianActionFN: metric.clinicianAction.FN, clinicianActionDenominator: metric.clinicianAction.positiveDenominator,
    urgentActionFN: metric.urgentAction.FN, urgentActionDenominator: metric.urgentAction.positiveDenominator });
  return { schema: "medgemma-case-review/v1", referenceId: reference.referenceId, cases,
    metrics: { fable: stats(comparison.baseline), medgemma: stats(comparison.candidate) }, disagreementIds: comparison.disagreementIds,
    completedAt, scoredAt, promptSHA256, provenance, inferenceEnabled: false, csvScored: false, independentClinicalValidation: false, automaticPromotion: false };
}

export const safeEmbeddedJSON = value => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

/** Ordinal mismatch is diagnostic against the accepted reference, not patient harm. */
export function escalationDirection(disposition, acceptedBuckets) {
  assert(acceptedBuckets.length > 0 && acceptedBuckets.every(value => BUCKETS.includes(value)));
  if (disposition === null) return "incomplete";
  assert(BUCKETS.includes(disposition));
  if (acceptedBuckets.includes(disposition)) return "aligned";
  const rank = BUCKETS.indexOf(disposition), acceptedRanks = acceptedBuckets.map(value => BUCKETS.indexOf(value));
  return rank < Math.min(...acceptedRanks) ? "under" : rank > Math.max(...acceptedRanks) ? "over" : "unaccepted";
}

export function addHistoricalModels(data, historical) {
  assert.deepEqual(historical.models.map(model => model.id).sort(), ["nano-r1", "nano-r2", "v25"]);
  const result = structuredClone(data);
  result.historicalModelNotes = {};
  const references = result.cases.map(row => ({ id: row.id, message: row.message, acceptedBuckets: row.physician.acceptedBuckets }));
  for (const model of historical.models) {
    assert.deepEqual(model.records.map(row => row.id), IDS, `${model.id}: 50 ordered records required`);
    const predictions = model.records.map((row, i) => {
      assert.equal(row.message, result.cases[i].message, `${model.id}/${row.id}: message differs`);
      assert(["complete", "incomplete"].includes(row.status));
      assert.equal(row.status === "incomplete", row.disposition === null);
      if (row.disposition !== null) { assert(BUCKETS.includes(row.disposition)); assert(typeof row.rationale === "string" && row.rationale.trim()); }
      else assert(typeof row.failureReason === "string" && row.failureReason.trim());
      assert(row.artifactPaths && typeof row.artifactPaths === "object" && !Array.isArray(row.artifactPaths));
      for (const path of Object.values(row.artifactPaths)) {
        within("/repo", path);
        assert.match(row.artifactHashes[path], /^[a-f0-9]{64}$/, "Source link lacks an admitted artifact hash");
        assert.equal(historical.provenance[path], row.artifactHashes[path], "Source link is not in provenance");
      }
      return { id: row.id, message: row.message, parsed: row.disposition === null ? null : { disposition: row.disposition, rationale: row.rationale }, failure: row.disposition === null ? row.failureReason : null };
    });
    const metrics = computeMetrics(predictions, references);
    result.metrics[model.id] = { agree: metrics.agree, denominator: metrics.denominator, failedOutputs: metrics.failedOutputs,
      clinicianActionFN: metrics.clinicianAction.FN, clinicianActionDenominator: metrics.clinicianAction.positiveDenominator,
      urgentActionFN: metrics.urgentAction.FN, urgentActionDenominator: metrics.urgentAction.positiveDenominator };
    result.historicalModelNotes[model.id] = model.referenceNote;
    for (const [i, row] of model.records.entries()) {
      const scored = metrics.rows[i];
      result.cases[i][model.id] = { disposition: row.disposition, rationale: row.disposition === null ? null : row.rationale, failure: row.failureReason ?? null,
        agrees: scored.agrees, clinicianAction: scored.clinicianAction, urgentAction: scored.urgentAction, status: row.status,
        originalDisposition: row.originalDisposition ?? null, artifactPaths: row.artifactPaths, earlyActions: row.earlyActions ?? [],
        escalation: escalationDirection(row.disposition, references[i].acceptedBuckets) };
    }
  }
  for (const row of result.cases) for (const key of ["fable", "medgemma"]) row[key].escalation = escalationDirection(row[key].disposition, row.physician.acceptedBuckets);
  for (const [path, hash] of Object.entries(historical.provenance ?? {})) {
    if (result.provenance[path]) assert.equal(result.provenance[path], hash);
    result.provenance[path] = hash;
  }
  result.schema = "disposition-case-review/v2";
  return result;
}

const CSS = `
:root{color-scheme:light;--paper:#f6f5f0;--white:#fffefa;--ink:#172f3d;--muted:#526673;--teal:#146d70;--teal-soft:#e5f0ed;--line:#dce2dd;--red:#a2372c;--red-soft:#faeae4;--gold:#826229;--gold-soft:#f4eddf;--shadow:0 15px 42px #132d3b08}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--teal);text-underline-offset:3px}button,input,select{font:inherit;color:inherit}button,a,input,summary{outline-offset:4px}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid var(--teal)}button{cursor:pointer}button:disabled{cursor:default;opacity:.42}button:disabled:hover{background:transparent}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip{position:fixed;top:-80px;left:20px;background:white;padding:12px;z-index:20}.skip:focus{top:10px}header{background:var(--ink);color:white;padding:28px 40px 24px}.topline{display:flex;align-items:center;justify-content:space-between;gap:20px;max-width:1540px;margin:auto}.brand{display:flex;align-items:center;gap:14px}.mark{width:34px;height:34px;border:1px solid #9fbabc;border-radius:50%;display:grid;place-items:center;font:22px Georgia,serif;color:#d8e8e0}.eyebrow{text-transform:uppercase;font-weight:700;font-size:10px;letter-spacing:.16em}.brand .eyebrow{color:#c0d6d5}.brand strong{font-size:15px;letter-spacing:.015em}.header-tools{display:flex;align-items:center;gap:10px}.header-tools a,.header-tools button{font-size:12px;color:#eff6f2;text-decoration:none;border:1px solid #5e737e;border-radius:7px;padding:8px 12px;background:transparent}.header-tools button:hover,.header-tools a:hover{background:#284754}.hero{max-width:1540px;margin:22px auto 0;display:flex;justify-content:space-between;gap:28px;align-items:end}h1{font:38px/1.1 Georgia,"Times New Roman",serif;letter-spacing:-.025em;margin:0 0 9px}.hero p{margin:0;color:#c3d3d8;font-size:13px}.hero-note{font-size:11px;color:#c3d3d8;max-width:270px;text-align:right}.metrics{display:flex;align-items:stretch;max-width:1620px;margin:auto;padding:22px 40px;gap:0}.metric{padding:0 25px;border-right:1px solid var(--line);min-width:0}.metric:first-child{padding-left:0}.metric:last-child{border:0}.metric .value{font:30px/1.2 Georgia,serif;letter-spacing:-.025em}.metric .value small{font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--muted)}.metric .label{font-size:11px;color:var(--muted);margin-top:4px}.metric.context{max-width:410px;font-size:11px;color:var(--muted);margin-left:auto;align-self:center;line-height:1.5}.layout{display:grid;grid-template-columns:294px minmax(0,1fr);gap:26px;max-width:1620px;margin:auto;padding:0 40px 40px}.index{align-self:start;background:var(--white);border:1px solid var(--line);border-radius:12px;overflow:hidden;position:sticky;top:18px}.index-head{padding:19px 17px 14px;border-bottom:1px solid var(--line)}.index-head h2{font-size:15px;margin:0 0 13px}.count{float:right;color:var(--muted);font-size:11px;font-weight:400;padding-top:3px}.search{width:100%;border:1px solid #c3d0cb;border-radius:7px;padding:10px 11px;background:white;font-size:12px}.filters{display:flex;gap:5px;flex-wrap:wrap;margin-top:10px}.filter{background:none;border:1px solid var(--line);border-radius:5px;padding:5px 7px;font-size:10px;font-weight:650}.filter[aria-pressed=true]{color:var(--teal);border-color:var(--teal);background:var(--teal-soft)}.case-list{list-style:none;margin:0;padding:6px;overflow:auto;max-height:calc(100vh - 226px);min-height:200px}.case-link{display:grid;grid-template-columns:31px 1fr;gap:9px;color:var(--ink);text-decoration:none;padding:12px 11px;border-radius:7px;border:1px solid transparent;margin:2px 0}.case-link:hover{background:#f0f3ef}.case-link[aria-current=page]{background:var(--teal-soft);border-color:#b7d4ce}.case-id{font-size:11px;font-weight:750;color:var(--muted);padding-top:1px}.case-link[aria-current=page] .case-id{color:var(--teal)}.case-brief{font-size:11px;line-height:1.5}.case-flags{display:block;margin-top:5px;font-size:9px;font-weight:700;color:var(--teal);letter-spacing:.015em}.case-flags.fn{color:var(--red)}.empty{padding:18px;color:var(--muted);font-size:13px}.detail{min-width:0}.case-top{display:flex;justify-content:space-between;gap:15px;align-items:center;margin:0 0 15px}.case-kicker{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--teal)}.case-nav{display:flex;gap:6px;align-items:center}.case-nav button,.case-nav a{background:transparent;border:1px solid #c5d1cd;border-radius:6px;padding:7px 10px;font-size:11px;text-decoration:none;color:var(--ink)}.case-nav button:hover,.case-nav a:hover{background:white}.message-card{background:var(--white);border:1px solid var(--line);border-radius:12px;padding:25px 29px;box-shadow:var(--shadow)}.message-heading{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:14px}.message-heading h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0;font-weight:650}.pill{display:inline-flex;align-items:center;border-radius:4px;background:var(--teal-soft);color:var(--teal);padding:4px 7px;font-size:10px;font-weight:700;line-height:1.4}.pill.alert{background:var(--red-soft);color:var(--red)}.pill.neutral{background:#edf0eb;color:var(--muted)}.message{font:23px/1.5 Georgia,"Times New Roman",serif;white-space:pre-wrap;margin:0;overflow-wrap:anywhere}.message-foot{font-size:10px;color:var(--muted);margin:14px 0 0}.alert-strip{padding:12px 15px;border-left:3px solid var(--red);background:var(--red-soft);border-radius:0 6px 6px 0;margin:16px 0;font-size:12px;line-height:1.6;color:#733b31}.alert-strip strong{color:var(--red)}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:19px 0}.reference-card{border:1px solid #c5d8d0;background:#edf4ee;border-radius:9px;padding:17px 20px}.reference-card.csv{background:transparent;border-color:var(--line)}.card-label{font-size:10px;font-weight:750;letter-spacing:.08em;text-transform:uppercase;margin:0 0 8px}.reference-route{font-size:14px;font-weight:750;letter-spacing:.02em;overflow-wrap:anywhere;margin:0 0 5px}.caption{font-size:11px;color:var(--muted);margin:4px 0;line-height:1.6}.reference-card details{font-size:11px;margin-top:8px}.reference-card summary{cursor:pointer;font-weight:650;color:var(--teal)}.reference-card details p{margin:6px 0}.models-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:22px 0 11px}.models-head h2{font:21px Georgia,serif;margin:0}.models-head span{font-size:10px;color:var(--muted)}.models{display:grid;grid-template-columns:1fr 1fr;gap:16px}.model-card{min-width:0;background:var(--white);border:1px solid var(--line);border-radius:10px;overflow:hidden;box-shadow:var(--shadow)}.model-card.fn{border-color:#dcb0a7}.model-top{padding:20px 22px 16px;border-bottom:1px solid var(--line)}.model-name{font-size:15px;font-weight:700;margin:0}.model-version{font-size:10px;color:var(--muted);margin:3px 0 15px}.model-route{font-size:15px;font-weight:750;letter-spacing:.015em;overflow-wrap:anywhere;margin:0 0 9px}.model-body{padding:18px 22px 21px}.model-body .eyebrow{font-size:9px;color:var(--muted)}.rationale{white-space:pre-wrap;margin:9px 0 18px;font-size:14px;line-height:1.7;overflow-wrap:anywhere}.endpoints{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 14px}.endpoint{font-size:10px;padding:4px 6px;background:#edf2ee;color:#42564e;border-radius:4px}.endpoint.fn{color:var(--red);background:var(--red-soft);font-weight:700}.endpoint.fp{color:var(--gold);background:var(--gold-soft)}.source-link{font-size:10px;margin-right:12px}.case-footer{font-size:11px;color:var(--muted);line-height:1.6;margin:18px 0 0;display:flex;gap:20px;justify-content:space-between}.case-footer p{margin:0;max-width:780px}.technical{margin:22px 0 0;border-top:1px solid var(--line);padding-top:14px;color:var(--muted);font-size:11px}.technical summary{cursor:pointer}.technical p{margin:10px 0}.technical code{font:10px ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.technical a{margin-right:12px}.focus .index,.focus .metrics,.focus .hero-note{display:none}.focus .layout{grid-template-columns:1fr;max-width:1380px;padding-top:26px}.focus header{padding:17px 30px}.focus .hero{margin-top:13px}.focus h1{font-size:28px}.focus .message{font-size:25px}.focus .rationale{font-size:16px}.focus .model-name{font-size:18px}.focus .model-route{font-size:17px}[hidden]{display:none!important}@media(min-width:1500px){.message{font-size:25px}.rationale{font-size:15px}}@media(max-width:1100px){header{padding:23px}.metrics{padding:20px 23px}.layout{padding:0 23px 30px;grid-template-columns:245px minmax(0,1fr);gap:18px}.metric{padding:0 16px}.metric.context{max-width:245px}.model-top,.model-body{padding:17px}.message-card{padding:22px}.message{font-size:21px}.reference-card{padding:15px}.model-route{font-size:13px}.hero-note{display:none}}@media(max-width:800px){h1{font-size:30px}.layout{grid-template-columns:1fr}.index{position:static}.case-list{max-height:220px;min-height:100px}.index-head{padding:15px}.index-head h2{margin-bottom:10px}.case-link{padding:9px}.case-brief{font-size:12px}.metrics{flex-wrap:wrap;row-gap:12px}.metric.context{max-width:none;margin-left:0;padding-left:0;border:0;flex-basis:100%}.hero{margin-top:20px}.header-tools a{display:none}.case-footer{display:block}.focus .layout{padding:20px}.reference-grid{gap:10px}.models{gap:12px}}@media(max-width:520px){header{padding:21px 18px}.topline{align-items:start}.brand{gap:10px}.brand strong{font-size:13px}.brand .eyebrow{font-size:8px}.header-tools button{font-size:10px;padding:7px}.header-tools .print{display:none}.mark{width:28px;height:28px}.hero p{font-size:11px}.metrics{padding:18px}.metric{padding:0 16px}.metric .value{font-size:26px}.metric .label{font-size:9px}.layout{padding:0 16px 24px}.case-top{align-items:start;gap:10px}.case-kicker{font-size:10px}.case-nav{gap:4px}.case-nav button,.case-nav a{font-size:10px;padding:5px 7px}.message-card{padding:20px}.message{font-size:21px}.message-heading{align-items:start}.message-heading h2{font-size:10px}.reference-grid,.models{grid-template-columns:1fr}.model-route{font-size:16px}.rationale{font-size:14px}.models-head span{max-width:120px;text-align:right}.focus .message{font-size:22px}}@media(prefers-reduced-motion:no-preference){.case-link,button{transition:background .15s ease}}@media print{header{background:white;color:var(--ink);padding:0 0 16px}.brand .eyebrow,.hero p{color:var(--muted)}.header-tools,.index,.metrics,.case-nav,.technical,.hero-note,.source-link{display:none!important}.layout,.focus .layout{display:block;padding:0;max-width:none}.hero{margin-top:15px}.message-card,.model-card{box-shadow:none;break-inside:avoid}.message{font-size:18px}.rationale{font-size:12px}.models,.reference-grid{gap:12px}body{background:white;padding:20px}.model-top,.model-body{padding:12px}.case-footer{font-size:9px}}
`;

const EXTRA_CSS = `.decision-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:8px;overflow:hidden;margin-bottom:16px}.summary-cell{padding:12px;background:var(--white);min-width:0}.summary-cell.under{background:var(--red-soft)}.summary-cell.over{background:var(--gold-soft)}.summary-cell.incomplete{background:#edf0ee}.summary-name{display:block;color:var(--muted);font-size:10px;margin-bottom:5px}.summary-route{font-size:10px;line-height:1.6;display:block;overflow-wrap:anywhere}.summary-cell.under .summary-route{color:var(--red)}.summary-cell.over .summary-route{color:var(--gold)}.repeat-label{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}.repeat-label select{background:var(--white);border:1px solid #c5d1cd;padding:6px 8px;border-radius:5px;font-size:11px}.pill.warning{background:var(--gold-soft);color:var(--gold)}.model-card.over{border-color:#d7c9ad}.case-flags.over{color:var(--gold)}.case-flags.incomplete{color:#65706d;font-weight:500}.early-actions{font-size:11px;margin:8px 0 14px}.early-actions summary{cursor:pointer;color:var(--teal);font-weight:650}.models{align-items:start}.focus .model-top{padding:15px 18px}.focus .model-body{padding:14px 18px}.focus .model-version{margin-bottom:10px}.focus .rationale{font-size:14px;line-height:1.6;margin-bottom:12px}.focus .model-route{font-size:15px}.focus .message{font-size:23px}.focus .message-card{padding:20px 25px}.focus .reference-grid{margin:15px 0}.focus .models-head{margin-top:16px}@media(max-width:520px){.decision-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.summary-route{font-size:11px}.models-head{align-items:center}}@media print{.repeat-label{display:none}.decision-summary{break-inside:avoid}.model-card{break-inside:avoid}}`;

/** Self-contained browser code. Patient, model and reference text use textContent. */
export function caseReviewClient() {
  "use strict";
  const data = JSON.parse(document.getElementById("case-data").textContent);
  const el = id => document.getElementById(id);
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const missed = value => value === "FN" || value === "FN_FAILED_OUTPUT";
  let nanoId = "nano-r1";
  const modelsFor = row => [row.fable, row.medgemma, row[nanoId], row.v25].filter(Boolean);
  const direction = (row, value) => {
    if (value.disposition === null) return "incomplete";
    if (row.physician.acceptedBuckets.includes(value.disposition)) return "aligned";
    const rank = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
    const predicted = rank.indexOf(value.disposition), accepted = row.physician.acceptedBuckets.map(item => rank.indexOf(item));
    return predicted < Math.min(...accepted) ? "under" : predicted > Math.max(...accepted) ? "over" : "unaccepted";
  };
  const hasFN = row => modelsFor(row).some(value => value.disposition !== null && (missed(value.clinicianAction) || missed(value.urgentAction)));
  const sourceURL = path => "https://github.com/bGOATnote/counselcodex/blob/main/" + path.split("/").map(encodeURIComponent).join("/");
  let current = null, activeFilter = "all", shown = [];
  function select(id, focus = false) {
    const row = data.cases.find(item => item.id === id) || data.cases.find(item => item.id === "C49");
    current = row;
    el("case-heading").textContent = row.id + " / 50  ·  Saved comparison";
    el("message").textContent = row.message;
    el("case-label").textContent = row.dispositionDisagrees ? "Fable / MedGemma differ" : "Fable / MedGemma match";
    el("case-label").className = "pill " + (hasFN(row) ? "alert" : row.dispositionDisagrees ? "" : "neutral");
    el("physician-route").textContent = row.physician.acceptedBuckets.join(" or ");
    el("physician-note").textContent = row.physician.note || "No additional physician explanation was recorded for this case. The accepted route is retained from the versioned reference.";
    el("prior-route").textContent = row.physician.priorAcceptedRoutes ? "Earlier accepted route: " + row.physician.priorAcceptedRoutes.join(" or ") + "." : "Earlier reference unresolved; the accepted bucket was specified in v3.";
    el("csv-route").textContent = row.csv.disposition;
    el("case-link").href = "#" + row.id;
    el("input-hash").textContent = row.inputSHA256;
    el("status").textContent = row.id + " selected. " + (row.dispositionDisagrees ? "Fable and MedGemma dispositions differ." : "Fable and MedGemma dispositions match.");
    const alerts = [];
    for (const [name, value] of [["Fable", row.fable], ["MedGemma", row.medgemma], ["Nemotron", row[nanoId]], ["Historical V25", row.v25]]) {
      if (!value || value.disposition === null) continue;
      if (missed(value.urgentAction)) alerts.push(name + " misses the urgent disposition accepted by the physician reference. Clinician referral alone does not satisfy this endpoint.");
      else if (missed(value.clinicianAction)) alerts.push(name + " misses clinician involvement accepted by the physician reference. Self-care may delay a needed assessment.");
    }
    el("alert").hidden = alerts.length === 0;
    el("alert").replaceChildren();
    if (alerts.length) { el("alert").append(node("strong", "False negative · "), document.createTextNode(alerts.join(" "))); }
    renderModel("fable", row.fable, "Fable 5.1", "Historical hosted run · low effort · 15 Sep 2026");
    renderModel("medgemma", row.medgemma, "MedGemma 27B", "Text instruction model · local Q5_K_M · 16 Sep 2026");
    if (row[nanoId]) renderModel("nano", row[nanoId], "Nemotron Nano", "Unchanged baseline A · Q5_K_M · repetition " + (nanoId === "nano-r1" ? "1" : "2"));
    if (row.v25) renderModel("v25", row.v25, "Historical V25", "Complex pipeline · five routes collapsed after generation");
    el("nano").hidden = !row[nanoId]; el("v25").hidden = !row.v25;
    const summary = el("decision-summary"); summary.replaceChildren();
    for (const [name, value] of [["Fable", row.fable], ["MedGemma", row.medgemma], ["Nemotron", row[nanoId]], ["V25", row.v25]]) if (value) {
      const group = node("div", undefined, "summary-cell " + direction(row, value));
      group.append(node("span", name, "summary-name"), node("strong", value.disposition || "NO COMPLETED DISPOSITION", "summary-route"));
      summary.append(group);
    }
    renderIndex();
    const selectedLink = el("case-list").querySelector('[aria-current="page"]');
    if (selectedLink) {
      const list = el("case-list"), top = selectedLink.offsetTop - list.offsetTop;
      if (top < list.scrollTop || top + selectedLink.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = Math.max(0, top - 60);
    }
    if (focus) el("case-heading").focus({ preventScroll: true });
  }
  function renderModel(id, value, name, version) {
    const escalation = direction(current, value), incomplete = value.disposition === null;
    const card = el(id); card.replaceChildren(); card.className = "model-card" + (escalation === "under" ? " fn" : escalation === "over" ? " over" : "");
    const top = node("div", undefined, "model-top");
    const state = { aligned: "Agrees with physician v3", under: "Under-escalation vs physician v3", over: "Over-escalation vs physician v3", incomplete: "Incomplete · not a disposition", unaccepted: "Unaccepted route · reference spans both directions" };
    top.append(node("h3", name, "model-name"), node("p", version, "model-version"), node("p", value.disposition || "NO COMPLETED DISPOSITION", "model-route"), node("span", state[escalation], "pill " + (escalation === "under" ? "alert" : escalation === "over" ? "warning" : incomplete ? "neutral" : "")));
    const body = node("div", undefined, "model-body"); body.append(node("div", incomplete ? "Recorded completion failure" : "Saved short rationale · verbatim", "eyebrow"), node("p", value.rationale ?? value.failure ?? "No rationale recorded.", "rationale"));
    if (value.originalDisposition && value.originalDisposition !== value.disposition) body.append(node("p", "Native five-way route: " + value.originalDisposition, "caption"));
    const endpoints = node("div", undefined, "endpoints");
    for (const [label, result] of incomplete ? [] : [["Clinician action", value.clinicianAction], ["Urgent action", value.urgentAction]]) {
      const names = { TP: "true positive", TN: "true negative", FP: "false positive", FN: "false negative", FN_FAILED_OUTPUT: "false negative · failed output", FAILED_OUTPUT_NEGATIVE_REFERENCE: "failed output", AMBIGUOUS_REFERENCE: "ambiguous reference" };
      endpoints.append(node("span", label + ": " + (names[result] || result), "endpoint" + (missed(result) ? " fn" : result === "FP" ? " fp" : "")));
    }
    if (incomplete) endpoints.append(node("span", "Operationally incomplete; no ordinal under/over label assigned", "endpoint"));
    body.append(endpoints);
    if (value.earlyActions?.length) {
      const details = node("details", undefined, "early-actions"); details.append(node("summary", "Separately recorded early actions"));
      for (const action of value.earlyActions) { details.append(node("p", (action.originalDisposition || action.disposition || "Action") + (action.directive ? ": " + action.directive : ""), "caption")); }
      details.append(node("p", "An early action is not a completed final disposition.", "caption")); body.append(details);
    }
    const links = value.artifactPaths ? Object.entries(value.artifactPaths).slice(0, 3).map(([label, path]) => [label + " ↗", path]) : [["Saved parsed output ↗", value.parsedPath], ["Raw record ↗", value.rawPath]];
    for (const [label, path] of links) { const link = node("a", label, "source-link"); link.href = sourceURL(path); link.target = "_blank"; link.rel = "noopener noreferrer"; body.append(link); }
    card.append(top, body);
  }
  function matches(row) {
    const query = el("search").value.trim().toLowerCase();
    const searchable = [row.id, row.message, ...row.physician.acceptedBuckets, ...modelsFor(row).flatMap(value => [value.disposition, value.rationale]), row.csv.disposition].join(" ").toLowerCase();
    return (!query || searchable.includes(query)) && (activeFilter === "all" || (activeFilter === "disagree" ? row.dispositionDisagrees : activeFilter === "fn" ? hasFN(row) : modelsFor(row).some(value => direction(row, value) === activeFilter)));
  }
  function renderIndex() {
    shown = data.cases.filter(matches); const list = el("case-list"); list.replaceChildren();
    el("count").textContent = shown.length + " of 50";
    for (const filter of document.querySelectorAll("[data-filter]")) {
      const key = filter.dataset.filter, label = { all: "All", disagree: "Fable ≠ MedGemma", under: "Under", over: "Over", incomplete: "Incomplete" }[key];
      const count = key === "all" ? 50 : data.cases.filter(row => key === "disagree" ? row.dispositionDisagrees : modelsFor(row).some(value => direction(row, value) === key)).length;
      filter.textContent = label + " · " + count;
    }
    for (const row of shown) {
      const item = node("li"); const link = node("a", undefined, "case-link"); link.href = "#" + row.id;
      link.setAttribute("aria-label", row.id + ": " + row.title);
      if (current.id === row.id) link.setAttribute("aria-current", "page");
      const text = node("span", row.title, "case-brief");
      if (hasFN(row)) text.append(node("span", "Under-escalation / false negative", "case-flags fn"));
      else if (modelsFor(row).some(value => direction(row, value) === "over")) text.append(node("span", "Over-escalation", "case-flags over"));
      else if (row.dispositionDisagrees) text.append(node("span", "Fable / MedGemma differ", "case-flags"));
      if (modelsFor(row).some(value => value.disposition === null)) text.append(node("span", "V25 incomplete", "case-flags incomplete"));
      link.append(node("span", row.id, "case-id"), text); item.append(link); list.append(item);
      link.addEventListener("click", event => { if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate(row.id, true); } });
    }
    if (!shown.length) list.append(node("li", "No cases match. Try a symptom, case ID or disposition.", "empty"));
    const index = shown.findIndex(row => row.id === current.id);
    el("previous").disabled = index <= 0;
    el("next").disabled = index < 0 || index === shown.length - 1;
    el("filter-status").textContent = index < 0 ? current.id + " is outside this filter; select a listed case." : "";
  }
  function navigate(id, focus) {
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    select(id, focus);
  }
  function move(delta) { const index = shown.findIndex(row => row.id === current.id); if (index >= 0 && shown[index + delta]) navigate(shown[index + delta].id, true); }
  el("previous").addEventListener("click", () => move(-1)); el("next").addEventListener("click", () => move(1));
  el("search").addEventListener("input", renderIndex);
  el("nano-repeat").addEventListener("change", () => { nanoId = el("nano-repeat").value; select(current.id); });
  for (const filter of document.querySelectorAll("[data-filter]")) filter.addEventListener("click", () => { activeFilter = filter.dataset.filter; for (const item of document.querySelectorAll("[data-filter]")) item.setAttribute("aria-pressed", String(item === filter)); renderIndex(); });
  el("focus-mode").addEventListener("click", () => { const enabled = document.body.classList.toggle("focus"); el("focus-mode").textContent = enabled ? "Show case index" : "Presentation view"; el("focus-mode").setAttribute("aria-pressed", String(enabled)); });
  el("print").addEventListener("click", () => window.print());
  document.querySelector(".skip").addEventListener("click", event => { event.preventDefault(); el("case-heading").focus(); });
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "/") { event.preventDefault(); el("search").focus(); }
    if (event.key === "Escape" && document.body.classList.contains("focus")) el("focus-mode").click();
  });
  function loadHash() { const id = /^#C(?:0[1-9]|[1-4][0-9]|50)$/.test(location.hash) ? location.hash.slice(1) : "C49"; if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id); select(id); }
  window.addEventListener("popstate", loadHash); window.addEventListener("hashchange", loadHash);
  el("fable-score").textContent = data.metrics.fable.agree;
  el("medgemma-score").textContent = data.metrics.medgemma.agree;
  el("difference-count").textContent = data.disagreementIds.length;
  el("prompt-hash").textContent = data.promptSHA256;
  el("freeze-time").textContent = data.completedAt;
  el("reference-link").href = sourceURL("data/evaluation/physician-adjudication-v3-2026-09-15.json");
  el("csv-link").href = sourceURL("data/patient_messages.csv");
  loadHash();
}

export function renderCaseReview(data) {
  const client = `(${caseReviewClient.toString()})();`;
  const scriptHash = createHash("sha256").update(client).digest("base64");
  const style = CSS + EXTRA_CSS;
  const styleHash = createHash("sha256").update(style).digest("base64");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Case review · Four disposition models</title><style>${style}</style></head>
<body><a class="skip" href="#case-heading">Skip to selected case</a><header><div class="topline"><div class="brand"><span class="mark" aria-hidden="true">c</span><div><div class="eyebrow">Independent disposition study</div><strong>Clinical case review</strong></div></div><div class="header-tools"><a href="https://github.com/bGOATnote/counselcodex" target="_blank" rel="noopener noreferrer">Repository ↗</a><button type="button" id="print" class="print">Print case</button><button type="button" id="focus-mode" aria-pressed="false">Presentation view</button></div></div><div class="hero"><div><h1>Same message. Different decisions.</h1><p>Fable · MedGemma · Nemotron · historical V25</p></div><div class="hero-note">50 synthetic messages. Saved outputs only.<br>No model calls. No patient care.</div></div></header>
<section class="metrics" aria-label="Saved cohort overview"><div class="metric"><div class="value"><span id="fable-score">48</span><small> / 50</small></div><div class="label">Historical Fable agreement</div></div><div class="metric"><div class="value"><span id="medgemma-score">46</span><small> / 50</small></div><div class="label">MedGemma Q5 agreement</div></div><div class="metric"><div class="value" id="difference-count">6</div><div class="label">Fable / MedGemma disagreements</div></div><div class="metric context">Physician v3 is a single-physician, unblinded reassessment of known development cases. Agreement is not clinical validation.</div></section>
<main class="layout"><aside class="index" aria-label="Case index"><div class="index-head"><h2>Case index <span id="count" class="count">50 of 50</span></h2><label class="sr-only" for="search">Search cases and model responses</label><input id="search" class="search" type="search" placeholder="Search cases, symptoms or routes…" autocomplete="off"><div class="filters" aria-label="Case filters"><button class="filter" data-filter="all" aria-pressed="true">All 50</button><button class="filter" data-filter="disagree" aria-pressed="false">Disagreements 6</button><button class="filter" data-filter="under" aria-pressed="false">Under</button><button class="filter" data-filter="over" aria-pressed="false">Over</button><button class="filter" data-filter="incomplete" aria-pressed="false">Incomplete</button></div><p id="filter-status" class="caption" role="status"></p></div><ol id="case-list" class="case-list"></ol></aside>
<section class="detail" aria-label="Selected case"><div class="case-top"><div id="case-heading" class="case-kicker" tabindex="-1">C49 / 50 · Saved comparison</div><nav class="case-nav" aria-label="Case navigation"><button type="button" id="previous" aria-label="Previous visible case">← Previous</button><button type="button" id="next" aria-label="Next visible case">Next →</button><a id="case-link" href="#C49" aria-label="Link to this case">Case link ↗</a></nav></div><article class="message-card"><div class="message-heading"><h2>Full patient message</h2><span id="case-label" class="pill">Fable / MedGemma differ</span></div><blockquote id="message" class="message"></blockquote><p class="message-foot">Original assignment message · verbatim · V25 includes multi-stage processing context</p></article>
<div id="alert" class="alert-strip" hidden></div><div class="reference-grid"><section class="reference-card"><h2 class="card-label">Physician Gold · v3</h2><p id="physician-route" class="reference-route"></p><p class="caption">Accepted disposition used for scoring all 50 cases.</p><details><summary>Reference basis and limitations</summary><p id="physician-note"></p><p id="prior-route"></p><p>Post-output physician reassessment; not blinded, independent or held out.</p></details></section><section class="reference-card csv"><h2 class="card-label">Original CSV disposition</h2><p id="csv-route" class="reference-route"></p><p class="caption">Original assignment label, shown for discussion.<br>Separate from physician scoring; not a clinical target.</p></section></div>
<div class="models-head"><h2>Model responses</h2><label class="repeat-label" for="nano-repeat">Nemotron <select id="nano-repeat"><option value="nano-r1">Repeat 1</option><option value="nano-r2">Repeat 2</option></select></label></div><div id="decision-summary" class="decision-summary" aria-label="Disposition comparison"></div><div class="models"><article id="fable" class="model-card" aria-label="Fable response"></article><article id="medgemma" class="model-card" aria-label="MedGemma response"></article><article id="nano" class="model-card" aria-label="Nemotron response"></article><article id="v25" class="model-card" aria-label="Historical V25 response"></article></div>
<div class="case-footer"><p>False negatives are assessed separately: <strong>clinician action</strong> means async or urgent; <strong>urgent action</strong> means urgent. These buckets do not establish emergency timing. Under/over-escalation describes completed route order against physician v3, not measured patient harm. Incomplete V25 runs are shown separately; early actions are not a completed answer.</p></div><details class="technical"><summary>Method, provenance and keyboard controls</summary><p>Frozen generation records are verified before display. Fable and MedGemma used identical instruction text and message-only user content. Nemotron baseline A and V25 are separately preserved configurations; V25 adds multi-stage processing context. Model family, inference date, runtime, quantization and decoding differ. Historical Fable is not a contemporaneous control. Nemotron shows unchanged baseline A; repeat 1 is the default, and repeat 2 remains available without selecting the better response. V25 was a different five-route multi-stage experiment: its original 21/49 result is not directly comparable with these v3 /50 scores. Only completed V25 routes are collapsed for case review; rejected proposals and early actions remain separate. No clinical superiority or promotion is claimed.</p><p>MedGemma generation frozen: <span id="freeze-time"></span></p><p>Input SHA-256: <code id="input-hash"></code><br>Instruction SHA-256: <code id="prompt-hash"></code></p><p><a id="reference-link" target="_blank" rel="noopener noreferrer">Physician reference ↗</a><a id="csv-link" target="_blank" rel="noopener noreferrer">Original CSV ↗</a><a href="https://github.com/bGOATnote/counselcodex/blob/main/docs/MEDGEMMA_27B_COMPARISON_2026-09-16.md" target="_blank" rel="noopener noreferrer">Full report ↗</a></p><p>← / →: previous or next visible case · /: search · Escape: leave presentation view. Browser Back and Forward restore case selection. Source links require internet; this case viewer does not.</p><p>Independent research demonstration by Brandon Dent, MD. No institutional or vendor endorsement. Synthetic messages only; not for patient care.</p></details></section></main><p id="status" role="status" aria-live="polite" class="sr-only"></p><noscript><p>This offline viewer requires JavaScript to display the embedded saved records. Read the comparison report in the repository for a text version.</p></noscript>
<script type="application/json" id="case-data">${safeEmbeddedJSON(data)}</script><script>${client}</script></body></html>\n`;
}

export function caseReviewArtifacts(data, sourceHashes) {
  const html = renderCaseReview(data);
  const readme = `# Four-model disposition case review

[Open the hosted case viewer](https://bgoatnote.github.io/counselcodex/#C49), or download [index.html](https://github.com/bGOATnote/counselcodex/raw/refs/heads/main/publication/medgemma-case-review/index.html) and open it directly in a browser. The file works offline and starts at C49. All 50 synthetic messages, saved model rationales, physician v3 accepted dispositions and original CSV labels are embedded. Selecting a case replaces the previous case; no other full patient message remains in the detail panel.

## Review controls

- Search by case ID, symptom, disposition or rationale. Each index link includes an exact message excerpt.
- Filter to the six Fable/MedGemma disagreements, under-escalations, over-escalations or incomplete results. Filters use the selected Nemotron repetition.
- Deep links include \`index.html#C22\`, \`index.html#C47\` and \`index.html#C49\`.
- Nemotron defaults to unchanged baseline A repetition 1. Repetition 2 is selectable; no best-response selection occurs.
- Presentation view hides the index. Left/right arrows move through the filtered list. Escape restores the index. Browser Back and Forward restore selection.
- Print exports only the selected case. Source links open the repository separately.

## Build and verify

From the repository root with the supported Node runtime:

\`\`\`bash
node scripts/build-medgemma-case-review.mjs
node scripts/build-medgemma-case-review.mjs --verify
node --test tests/medgemma-case-review.test.mjs tests/historical-case-review.test.mjs
\`\`\`

Build replaces only these derived presentation files. Verify requires exact saved bytes and makes no changes. Neither command makes provider calls. The builder checks frozen generation, raw/parsed parity, the original V25 score replay, and the saved Fable/MedGemma comparison. The manifest binds admitted sources and renderer files. Original experiment artifacts and references remain unchanged.

## Interpretation

Physician v3 is a single-physician, unblinded post-output reassessment of a known 50-message development set. It is not independent clinical validation. Original CSV labels are discussion context and are not combined with physician scores.

Fable is the preserved historical low-effort run. MedGemma is the recorded local Q5_K_M configuration. Nemotron uses the registered unchanged three-bucket baseline A, with two repetitions shown separately. V25 is a different five-route multi-stage historical pipeline. Its original 21/49 all-case result and 21/27 completed-release agreement are distinct from this post-hoc three-bucket physician-v3 display. Only 27/50 V25 cases had an eligible completed release; 23 remain incomplete. Rejected proposals and separately issued early actions are never displayed as completed dispositions.

Under/over-escalation compares completed route order SELF_CARE < ASYNC_PHYSICIAN < URGENT_ESCALATION against accepted physician v3 buckets. It is not a patient-harm measurement. Incomplete output is a separate operational status, never a self-care prediction. The two false-negative endpoints distinguish omitted clinician involvement from omitted urgent escalation. Rationale accuracy and care delivery are not validated by route agreement.

Model families, inference dates, runtime, quantization, decoding and pipeline scope differ. This inspection tool is not a controlled ranking, clinical validation or model promotion. It does not expose hidden reasoning or submit patient messages.

All case and model text is rendered as text, not executable markup. The standalone document blocks network connections and external assets with a Content Security Policy. Internet access is needed only when a reviewer chooses an external source link.
`;
  const manifest = { schema: "medgemma-case-review-manifest/v1", caseCount: data.cases.length, disagreementIds: data.disagreementIds,
    generationCompletedAt: data.completedAt, scoredAt: data.scoredAt, inferenceEnabled: false, csvScored: false,
    independentClinicalValidation: false, sourceHashes, provenance: data.provenance,
    artifacts: { "index.html": sha256(html), "README.md": sha256(readme) } };
  return { "index.html": html, "README.md": readme, "manifest.json": JSON.stringify(manifest, null, 2) + "\n" };
}

export function publishCaseReview(directory, artifacts, verify = false) {
  if (!verify) mkdirSync(directory, { recursive: true });
  for (const [name, text] of Object.entries(artifacts)) {
    const path = within(directory, name);
    if (verify) assert.equal(readFileSync(path, "utf8"), text, `Stale case viewer: ${name}`);
    else writeFileSync(path, text);
  }
}
