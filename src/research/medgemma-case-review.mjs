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

const LOGO_PATH = "output/submission-2026-09-15/content/assets/counsel-logo.svg";
const LOGO_SHA256 = "e6579fc6183427cbab85b0d3e928cfcf59df22df5dafd2ac21bc283705172d92";
const logoBytes = readFileSync(new URL("../../" + LOGO_PATH, import.meta.url));
assert.equal(sha256(logoBytes), LOGO_SHA256, "Reviewed Counsel wordmark changed");
const counselLogo = logoBytes.toString("utf8").replace("<svg ", '<svg role="img" aria-label="Counsel" ');

const CSS = `
:root{color-scheme:light;--paper:#f6f5f0;--white:#fffefa;--ink:#172f3d;--muted:#526673;--teal:#146d70;--teal-soft:#e5f0ed;--line:#dce2dd;--red:#a2372c;--red-soft:#faeae4;--gold:#826229;--gold-soft:#f4eddf;--header-space:102px}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}a{color:var(--teal);text-underline-offset:3px}button,input,select{font:inherit;color:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.4}button,a,input,select,summary{outline-offset:4px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid var(--teal)}[hidden]{display:none!important}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.skip{position:fixed;top:-80px;left:20px;background:white;padding:12px;z-index:30}.skip:focus{top:10px}
header{position:sticky;top:0;z-index:20;background:var(--ink);color:white;border-bottom:1px solid #334b57;box-shadow:0 3px 15px #172f3d12}.topline{display:flex;align-items:center;justify-content:space-between;gap:24px;max-width:1360px;margin:auto;padding:14px 32px}.brand{display:flex;align-items:center;gap:16px;color:white;text-decoration:none}.brand h1{font-size:19px;font-weight:600;margin:0;white-space:nowrap}.recipient-logo{background:var(--white);padding:3px 9px;border-radius:5px;flex-shrink:0}.recipient-logo svg{display:block;width:84px;height:35px}.header-tools{display:flex;align-items:center;gap:9px}.header-tools a,.header-tools button{font-size:12px;color:white;text-decoration:none;border:1px solid #627984;border-radius:6px;padding:8px 11px;background:transparent;white-space:nowrap}.header-tools a:hover,.header-tools button:not(:disabled):hover{background:#284754}.header-tools .index-return{background:var(--white);color:var(--ink);border-color:var(--white);font-weight:650}.header-tools .index-return:hover{background:var(--teal-soft)}
.layout{max-width:1280px;margin:auto;padding:30px 32px 36px}.index{max-width:1050px;margin:auto}.index-head{margin-bottom:22px}.index-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.index-title h2{font:29px/1.2 Georgia,serif;margin:0}.count{font-size:12px;color:var(--muted)}.index-controls{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.search{width:340px;max-width:100%;border:1px solid #bccbc5;border-radius:7px;padding:11px 13px;background:var(--white);font-size:13px}.filters{display:flex;gap:6px;flex-wrap:wrap}.filter{background:transparent;border:1px solid #c5d1cd;border-radius:6px;padding:7px 9px;font-size:11px}.filter[aria-pressed=true]{color:var(--teal);border-color:var(--teal);background:var(--teal-soft)}.clear-filters{border:0;background:transparent;padding:5px 0;font-size:12px;color:var(--teal);text-decoration:underline;text-underline-offset:3px}.case-list{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:10px}.case-list li{min-width:0}.case-link{height:100%;display:grid;grid-template-columns:34px 1fr;gap:12px;color:var(--ink);text-decoration:none;padding:17px 18px;background:var(--white);border:1px solid var(--line);border-radius:8px}.case-link:hover,.case-link.is-selected{background:var(--teal-soft);border-color:#b7d4ce}.case-id{font-size:12px;font-weight:700;color:var(--teal);padding-top:2px}.case-brief{font-size:13px;line-height:1.6}.empty{padding:22px;color:var(--muted);grid-column:1/-1}
.detail{min-width:0}.case-top{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:17px}.case-kicker{font-size:18px;font-weight:650;margin:0;scroll-margin-top:var(--header-space)}.case-nav{display:flex;gap:7px}.case-nav button{background:transparent;border:1px solid #bdccc5;border-radius:6px;padding:7px 10px;font-size:12px}.case-nav button:not(:disabled):hover{background:var(--white)}.message-card{background:var(--white);border:1px solid var(--line);border-radius:10px;padding:22px 26px}.card-label{font-size:11px;font-weight:650;margin:0 0 8px;color:var(--muted)}.message{font:23px/1.55 Georgia,"Times New Roman",serif;white-space:pre-wrap;margin:0;overflow-wrap:anywhere}.alert-strip{padding:10px 13px;border-left:3px solid var(--red);background:var(--red-soft);border-radius:0 5px 5px 0;margin:14px 0;color:var(--red);font-size:12px;font-weight:600}.reference-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:18px 0}.reference-card{border:1px solid #cadbd2;background:#edf4ee;border-radius:8px;padding:15px 18px}.reference-card.csv{background:transparent;border-color:var(--line)}.reference-route{font-size:14px;font-weight:700;overflow-wrap:anywhere;margin:0}.models-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:24px 0 12px}.models-head h2{font:23px Georgia,serif;margin:0}.repeat-label{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--muted)}.repeat-label select{background:var(--white);border:1px solid #bdccc5;padding:6px 8px;border-radius:5px;font-size:11px}
.models{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;align-items:start}.model-card{min-width:0;background:var(--white);border:1px solid var(--line);border-radius:9px;overflow:hidden}.model-card.fn{border-color:#dcb0a7}.model-card.over{border-color:#d7c9ad}.model-top{padding:19px 20px 15px;border-bottom:1px solid var(--line)}.model-name{font-size:16px;font-weight:650;margin:0 0 10px}.model-route{font-size:14px;font-weight:700;overflow-wrap:anywhere;margin:0 0 9px}.pill{display:inline-flex;align-items:center;border-radius:4px;background:var(--teal-soft);color:var(--teal);padding:4px 7px;font-size:10px;font-weight:650;line-height:1.5}.pill.alert{background:var(--red-soft);color:var(--red)}.pill.warning{background:var(--gold-soft);color:var(--gold)}.pill.neutral{background:#edf0eb;color:var(--muted)}.model-body{padding:17px 20px 19px}.rationale{white-space:pre-wrap;margin:0 0 15px;font-size:14px;line-height:1.75;overflow-wrap:anywhere}.record-details,.early-actions{font-size:11px;color:var(--muted)}summary{cursor:pointer}.record-details summary,.early-actions summary{color:var(--teal)}.record-details p,.early-actions p{margin:9px 0}.source-link{display:inline-block;font-size:11px;margin:5px 12px 0 0}.caption{font-size:11px;color:var(--muted);margin:8px 0;line-height:1.6}.early-actions{margin:10px 0 16px}
.historical-pipeline{border:1px solid var(--line);border-radius:8px;margin-top:22px;background:#eef0eb}.historical-pipeline>summary{padding:15px 18px;font-size:12px;font-weight:600}.historical-body{padding:0 18px 18px}.historical-body>p{font-size:12px;color:var(--muted);line-height:1.7;margin:0 0 14px;max-width:850px}.technical{width:calc(100% - 64px);max-width:1216px;margin:0 auto 32px;padding:16px 0 0;border-top:1px solid var(--line);color:var(--muted);font-size:12px}.technical summary{font-size:12px}.technical p{margin:12px 0;max-width:960px}.technical code{font:10px ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}.technical a{margin-right:12px}#index-heading,#search,.technical{scroll-margin-top:var(--header-space)}.presentation .message{font-size:28px}.presentation .rationale{font-size:17px}.presentation .model-name{font-size:19px}.presentation .model-route{font-size:16px}
@media(max-width:1000px){.models{grid-template-columns:1fr}.model-name{font-size:18px}.rationale{font-size:16px}.case-list{grid-template-columns:1fr}.technical{margin-left:32px;margin-right:32px}}
@media(max-width:800px){:root{--header-space:140px}.topline{padding:10px 16px;gap:10px;flex-wrap:wrap}.brand{gap:13px}.brand h1{font-size:17px}.recipient-logo svg{width:72px;height:30px}.header-tools{width:100%;gap:7px}.header-tools a,.header-tools button{font-size:11px;padding:7px 9px}.index-return{margin-right:auto}.layout{padding:22px 16px 28px}.index-title h2{font-size:25px}.index-controls{gap:10px}.search{width:100%}.case-link{padding:15px}.case-top{margin-bottom:14px}.message-card{padding:18px 20px}.message{font-size:21px}.reference-grid{gap:10px}.reference-card{padding:13px}.reference-route{font-size:12px}.card-label{font-size:10px}.models-head h2{font-size:21px}.model-top,.model-body{padding:18px}.technical{width:auto;margin:0 16px 24px}.presentation .message{font-size:24px}.presentation .rationale{font-size:17px}}
@media print{header,.case-nav,.record-details,.technical{display:none!important}.layout{padding:0}.models{grid-template-columns:1fr 1fr}.message-card,.model-card,.reference-card{break-inside:avoid}.message{font-size:18px}.rationale{font-size:12px}body{background:white;padding:20px}}
`;

/** Self-contained browser code. Patient, model and reference text use textContent. */
export function caseReviewClient() {
  "use strict";
  const data = JSON.parse(document.getElementById("case-data").textContent);
  const el = id => document.getElementById(id);
  const node = (tag, text, className) => { const value = document.createElement(tag); if (text !== undefined) value.textContent = text; if (className) value.className = className; return value; };
  const missed = value => value === "FN" || value === "FN_FAILED_OUTPUT";
  let nanoId = "nano-r1", current = null, activeFilter = "all", shown = [];
  const modelsFor = row => [row.fable, row.medgemma, row[nanoId]].filter(Boolean);
  const direction = (row, value) => {
    if (value.disposition === null) return "incomplete";
    if (row.physician.acceptedBuckets.includes(value.disposition)) return "aligned";
    const rank = ["SELF_CARE", "ASYNC_PHYSICIAN", "URGENT_ESCALATION"];
    const predicted = rank.indexOf(value.disposition), accepted = row.physician.acceptedBuckets.map(item => rank.indexOf(item));
    return predicted < Math.min(...accepted) ? "under" : predicted > Math.max(...accepted) ? "over" : "unaccepted";
  };
  const sourceURL = path => "https://github.com/bGOATnote/counselcodex/blob/main/" + path.split("/").map(encodeURIComponent).join("/");
  function select(id, focus = false) {
    const row = data.cases.find(item => item.id === id);
    if (!row) { showIndex(focus); return; }
    const changedCase = current?.id !== row.id;
    current = row;
    el("case-index").hidden = true; el("case-detail").hidden = false;
    el("case-link").hidden = false; el("focus-mode").disabled = false;
    el("case-provenance").hidden = false;
    el("case-heading").textContent = row.id;
    el("message").textContent = row.message;
    el("physician-route").textContent = row.physician.acceptedBuckets.join(" or ");
    el("physician-note").textContent = row.physician.note || "No additional physician explanation was recorded for this case.";
    el("prior-route").textContent = row.physician.priorAcceptedRoutes ? "Earlier accepted route: " + row.physician.priorAcceptedRoutes.join(" or ") + "." : "Earlier reference unresolved; the accepted bucket was specified in v3.";
    el("csv-route").textContent = row.csv.disposition;
    el("input-hash").textContent = row.inputSHA256;
    el("reference-case").textContent = row.id + " reference notes";
    el("status").textContent = row.id + " selected. Case index hidden.";
    const urgent = [], clinician = [];
    for (const [name, value] of [["Fable", row.fable], ["MedGemma", row.medgemma], ["Nemotron", row[nanoId]]]) {
      if (!value || value.disposition === null) continue;
      if (missed(value.urgentAction)) urgent.push(name);
      else if (missed(value.clinicianAction)) clinician.push(name);
    }
    const alerts = [];
    if (urgent.length) alerts.push("Missed urgent escalation: " + urgent.join(", ") + ".");
    if (clinician.length) alerts.push("Missed clinician assessment: " + clinician.join(", ") + ".");
    el("alert").hidden = alerts.length === 0;
    el("alert").textContent = alerts.join(" ");
    renderModel("fable", row.fable, "Fable 5.1", "Historical hosted run · low effort · 15 Sep 2026");
    renderModel("medgemma", row.medgemma, "MedGemma 27B", "Text instruction model · local Q5_K_M · 16 Sep 2026");
    if (row[nanoId]) renderModel("nano", row[nanoId], "Nemotron Nano", "Unchanged baseline A · Q5_K_M · repetition " + (nanoId === "nano-r1" ? "1" : "2"));
    if (row.v25) renderModel("v25", row.v25, "Historical V25", "Complex pipeline · five routes collapsed after generation");
    el("nano").hidden = !row[nanoId]; el("v25").hidden = !row.v25;
    el("historical-pipeline").hidden = !row.v25;
    if (changedCase) { el("historical-pipeline").open = false; el("study-details").open = false; }
    renderIndex();
    if (focus) { el("case-heading").scrollIntoView({ block: "start" }); el("case-heading").focus({ preventScroll: true }); }
  }
  function renderModel(id, value, name, version) {
    const escalation = direction(current, value), incomplete = value.disposition === null;
    const card = el(id); card.replaceChildren(); card.className = "model-card" + (escalation === "under" ? " fn" : escalation === "over" ? " over" : "");
    const top = node("div", undefined, "model-top");
    const state = { aligned: "Agrees with physician", under: "Under-escalation", over: "Over-escalation", incomplete: "Incomplete · not a disposition", unaccepted: "Unaccepted route · reference spans both directions" };
    top.append(node("h3", name, "model-name"), node("p", value.disposition || "NO COMPLETED DISPOSITION", "model-route"), node("span", state[escalation], "pill " + (escalation === "under" ? "alert" : escalation === "over" ? "warning" : incomplete ? "neutral" : "")));
    const body = node("div", undefined, "model-body");
    body.append(node("p", value.rationale ?? value.failure ?? "No rationale recorded.", "rationale"));
    if (value.originalDisposition && value.originalDisposition !== value.disposition) body.append(node("p", "Native five-way route: " + value.originalDisposition, "caption"));
    if (value.earlyActions?.length) {
      const details = node("details", undefined, "early-actions"); details.append(node("summary", "Separately recorded early actions"));
      for (const action of value.earlyActions) details.append(node("p", (action.originalDisposition || action.disposition || "Action") + (action.directive ? ": " + action.directive : ""), "caption"));
      details.append(node("p", "An early action is not a completed final disposition.", "caption")); body.append(details);
    }
    const record = node("details", undefined, "record-details"); record.append(node("summary", "Record details"), node("p", version));
    const links = value.artifactPaths ? Object.entries(value.artifactPaths).slice(0, 3).map(([label, path]) => [label + " ↗", path]) : [["Saved parsed output ↗", value.parsedPath], ["Raw record ↗", value.rawPath]];
    for (const [label, path] of links) { const link = node("a", label, "source-link"); link.href = sourceURL(path); link.target = "_blank"; link.rel = "noopener noreferrer"; record.append(link); }
    body.append(record); card.append(top, body);
  }
  function matches(row) {
    const query = el("search").value.trim().toLowerCase();
    const searchable = [row.id, row.message, ...row.physician.acceptedBuckets, ...modelsFor(row).flatMap(value => [value.disposition, value.rationale]), row.csv.disposition].join(" ").toLowerCase();
    return (!query || searchable.includes(query)) && (activeFilter === "all" || (activeFilter === "disagree" ? row.dispositionDisagrees : modelsFor(row).some(value => direction(row, value) === activeFilter)));
  }
  function renderIndex() {
    shown = data.cases.filter(matches); const list = el("case-list"); list.replaceChildren();
    el("count").textContent = shown.length === 50 ? "50 cases" : shown.length + " of 50 cases";
    for (const filter of document.querySelectorAll("[data-filter]")) {
      const key = filter.dataset.filter, label = { all: "All", disagree: "Fable ≠ MedGemma", under: "Under", over: "Over" }[key];
      const count = key === "all" ? 50 : data.cases.filter(row => key === "disagree" ? row.dispositionDisagrees : modelsFor(row).some(value => direction(row, value) === key)).length;
      filter.textContent = label + " · " + count;
    }
    for (const row of shown) {
      const item = node("li"), link = node("a", undefined, "case-link" + (current?.id === row.id ? " is-selected" : "")); link.href = "#" + row.id;
      link.setAttribute("aria-label", row.id + ": " + row.title);
      link.append(node("span", row.id, "case-id"), node("span", row.title, "case-brief")); item.append(link); list.append(item);
      link.addEventListener("click", event => { if (isPlainClick(event)) { event.preventDefault(); navigate(row.id, true); } });
    }
    if (!shown.length) list.append(node("li", "No cases match your search.", "empty"));
    el("clear-filters").hidden = !el("search").value && activeFilter === "all";
    const index = shown.findIndex(row => row.id === current?.id);
    el("previous").disabled = index <= 0;
    el("next").disabled = index < 0 || index === shown.length - 1;
  }
  function isPlainClick(event) { return !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey; }
  function navigate(id, focus) {
    if (location.hash !== "#" + id) history.pushState(null, "", "#" + id);
    select(id, focus);
  }
  function setPresentationMode(enabled) {
    document.body.classList.toggle("presentation", enabled);
    el("focus-mode").textContent = enabled ? "Exit presentation" : "Presentation view";
    el("focus-mode").setAttribute("aria-pressed", String(enabled));
  }
  function showIndex(focus = false) {
    setPresentationMode(false);
    el("case-index").hidden = false; el("case-detail").hidden = true;
    el("case-link").hidden = true; el("focus-mode").disabled = true;
    el("case-provenance").hidden = true; el("study-details").open = false;
    renderIndex();
    el("status").textContent = "Case index. " + shown.length + " cases shown.";
    if (focus) { el("index-heading").scrollIntoView({ block: "start" }); el("search").focus({ preventScroll: true }); }
  }
  function returnToIndex() {
    if (location.hash !== "#index") history.pushState(null, "", "#index");
    showIndex(true);
  }
  function move(delta) { if (el("case-detail").hidden) return; const index = shown.findIndex(row => row.id === current?.id); if (index >= 0 && shown[index + delta]) navigate(shown[index + delta].id, true); }
  el("previous").addEventListener("click", () => move(-1)); el("next").addEventListener("click", () => move(1));
  el("search").addEventListener("input", renderIndex);
  el("nano-repeat").addEventListener("change", () => { nanoId = el("nano-repeat").value; if (current) select(current.id); });
  for (const filter of document.querySelectorAll("[data-filter]")) filter.addEventListener("click", () => { activeFilter = filter.dataset.filter; for (const item of document.querySelectorAll("[data-filter]")) item.setAttribute("aria-pressed", String(item === filter)); renderIndex(); });
  for (const link of document.querySelectorAll("[data-index-link]")) link.addEventListener("click", event => { if (isPlainClick(event)) { event.preventDefault(); returnToIndex(); } });
  el("clear-filters").addEventListener("click", () => {
    el("search").value = ""; activeFilter = "all";
    for (const filter of document.querySelectorAll("[data-filter]")) filter.setAttribute("aria-pressed", String(filter.dataset.filter === "all"));
    renderIndex(); el("search").focus();
  });
  el("focus-mode").addEventListener("click", () => { if (el("case-detail").hidden) return; setPresentationMode(!document.body.classList.contains("presentation")); el("case-heading").scrollIntoView({ block: "start" }); el("case-heading").focus({ preventScroll: true }); });
  document.querySelector(".skip").addEventListener("click", event => { event.preventDefault(); const target = el("case-detail").hidden ? el("search") : el("case-heading"); target.focus(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !el("case-detail").hidden) { event.preventDefault(); returnToIndex(); return; }
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (event.key === "ArrowLeft") { event.preventDefault(); move(-1); }
    if (event.key === "ArrowRight") { event.preventDefault(); move(1); }
    if (event.key === "/") { event.preventDefault(); returnToIndex(); }
  });
  function loadHash(focus = false) {
    if (/^#C(?:0[1-9]|[1-4][0-9]|50)$/.test(location.hash)) select(location.hash.slice(1), focus);
    else { if (location.hash !== "#index") history.replaceState(null, "", "#index"); showIndex(focus); }
  }
  window.addEventListener("popstate", () => loadHash(true)); window.addEventListener("hashchange", () => loadHash(true));
  el("prompt-hash").textContent = data.promptSHA256;
  el("freeze-time").textContent = data.completedAt;
  el("reference-link").href = sourceURL("data/evaluation/physician-adjudication-v3-2026-09-15.json");
  el("csv-link").href = sourceURL("data/patient_messages.csv");
  loadHash();
}

export function renderCaseReview(data) {
  const client = `(${caseReviewClient.toString()})();`;
  const scriptHash = createHash("sha256").update(client).digest("base64");
  const styleHash = createHash("sha256").update(CSS).digest("base64");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'sha256-${styleHash}'; connect-src 'none'; img-src 'none'; font-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><title>Disposition Study</title><style>${CSS}</style></head>
<body><a class="skip" href="#index-heading">Skip to content</a>
<header><div class="topline"><a class="brand" href="#index" data-index-link aria-label="Disposition Study — case index"><div class="recipient-logo">${counselLogo}</div><h1>Disposition Study</h1></a><nav class="header-tools" aria-label="Study navigation"><a id="case-link" class="index-return" href="#index" data-index-link hidden>← Case index</a><a href="https://github.com/bGOATnote/counselcodex" target="_blank" rel="noopener noreferrer">Repository ↗</a><button type="button" id="focus-mode" aria-pressed="false" disabled>Presentation view</button></nav></div></header>
<main class="layout">
<section id="case-index" class="index" aria-label="Case index"><div class="index-head"><div class="index-title"><h2 id="index-heading" tabindex="-1">Case index</h2><span id="count" class="count">50 cases</span></div><div class="index-controls"><label class="sr-only" for="search">Search cases and model responses</label><input id="search" class="search" type="search" placeholder="Search cases…" autocomplete="off"><div class="filters" aria-label="Case filters"><button class="filter" data-filter="all" aria-pressed="true">All · 50</button><button class="filter" data-filter="disagree" aria-pressed="false">Fable ≠ MedGemma · 6</button><button class="filter" data-filter="under" aria-pressed="false">Under</button><button class="filter" data-filter="over" aria-pressed="false">Over</button></div><button id="clear-filters" class="clear-filters" type="button" hidden>Clear filters</button></div></div><ol id="case-list" class="case-list"></ol></section>
<section id="case-detail" class="detail" aria-label="Selected case" hidden><div class="case-top"><h2 id="case-heading" class="case-kicker" tabindex="-1"></h2><nav class="case-nav" aria-label="Case navigation"><button type="button" id="previous" aria-label="Previous matching case">← Previous</button><button type="button" id="next" aria-label="Next matching case">Next →</button></nav></div><article class="message-card"><h3 class="card-label">Patient message</h3><blockquote id="message" class="message"></blockquote></article>
<div id="alert" class="alert-strip" hidden></div><div class="reference-grid"><section class="reference-card"><h3 class="card-label">Physician Gold</h3><p id="physician-route" class="reference-route"></p></section><section class="reference-card csv"><h3 class="card-label">Original CSV disposition</h3><p id="csv-route" class="reference-route"></p></section></div>
<div class="models-head"><h2>Model responses</h2><label class="repeat-label" for="nano-repeat">Nemotron <select id="nano-repeat"><option value="nano-r1">Repeat 1</option><option value="nano-r2">Repeat 2</option></select></label></div><div class="models"><article id="fable" class="model-card" aria-label="Fable response"></article><article id="medgemma" class="model-card" aria-label="MedGemma response"></article><article id="nano" class="model-card" aria-label="Nemotron response"></article></div>
<details id="historical-pipeline" class="historical-pipeline"><summary>Historical pipeline · V25</summary><div class="historical-body"><p>Different five-route, multi-stage protocol. <strong>27 of 50 runs completed.</strong> Its original 21/49 score uses the earlier reference and is not a direct comparison with the three models above.</p><article id="v25" class="model-card" aria-label="Historical V25 response"></article></div></details></section></main>
<details id="study-details" class="technical"><summary>About the study</summary><p>Independent research demonstration by Brandon Dent, MD, prepared for Counsel. The Counsel wordmark identifies the intended audience, not sponsorship or institutional endorsement. Synthetic messages and saved outputs only; not for patient care.</p><p>Physician Gold refers to physician v3, a single-physician, unblinded post-output reassessment of this known 50-message development set. Agreement does not establish clinical safety or validate model rationales. No patient outcomes were measured. Original CSV labels are separate discussion context and are not included in physician scoring.</p><p>Frozen generation records are verified before display. Fable and MedGemma used identical instruction text and message-only user content. Nemotron baseline A and V25 are separately preserved configurations; V25 adds multi-stage processing context. Model family, inference date, runtime, quantization and decoding differ. Historical Fable is not a contemporaneous control. Model configuration and source links are under each card’s Record details. No clinical superiority or promotion is claimed.</p><p>Under/over filters compare the three primary models with physician v3, using the selected Nemotron repetition. Fable ≠ MedGemma is a pairwise filter. Nemotron defaults to unchanged baseline A repeat 1; repeat 2 remains available without selecting a better response. V25 is excluded from these filters and alerts. Incomplete V25 releases and separately issued early actions remain distinct from completed dispositions.</p><p>The source scorecards retain separate endpoints for missed clinician involvement and missed urgent escalation. Care-setting agreement is not a patient-harm measurement. Full messages and model rationales are displayed verbatim.</p><div id="case-provenance" hidden><h3 id="reference-case"></h3><p id="physician-note"></p><p id="prior-route"></p><p>Input SHA-256: <code id="input-hash"></code></p></div><p>MedGemma generation frozen: <span id="freeze-time"></span><br>Instruction SHA-256: <code id="prompt-hash"></code></p><p><a id="reference-link" target="_blank" rel="noopener noreferrer">Physician reference ↗</a><a id="csv-link" target="_blank" rel="noopener noreferrer">Original CSV ↗</a><a href="https://github.com/bGOATnote/counselcodex/blob/main/docs/MEDGEMMA_27B_COMPARISON_2026-09-16.md" target="_blank" rel="noopener noreferrer">Full report ↗</a></p><p>Case index, Escape or / returns to the index, preserving search, filters and Nemotron selection. Left/right arrows move between matching cases. Presentation view enlarges the selected case. Browser Back and Forward restore index/case navigation. Source links require internet; this saved viewer does not.</p></details>
<p id="status" role="status" aria-live="polite" class="sr-only"></p><noscript><p>This saved viewer requires JavaScript. Read the comparison report in the repository for a text version.</p></noscript><script type="application/json" id="case-data">${safeEmbeddedJSON(data)}</script><script>${client}</script></body></html>\n`;
}

export function caseReviewArtifacts(data, sourceHashes) {
  const html = renderCaseReview(data);
  const readme = `# Disposition model case review

[Open the hosted case viewer](https://bgoatnote.github.io/counselcodex/#index), or download [index.html](https://github.com/bGOATnote/counselcodex/raw/refs/heads/main/publication/medgemma-case-review/index.html) and open it directly in a browser. The file works offline and opens the case index. A case deep link opens only that case. All 50 synthetic messages, saved model rationales, physician v3 accepted dispositions and original CSV labels are embedded. Selecting a case hides the index. The index and case details are separate screens; only one is visible at a time.

## Review controls

- Search by case ID, symptom, disposition or rationale. Each index link includes an exact message excerpt.
- Filter to the six Fable/MedGemma disagreements, under-escalations or over-escalations. Filters and case alerts use the three primary models and selected Nemotron repetition; V25 is separate historical context.
- Deep links include \`index.html#C22\`, \`index.html#C47\` and \`index.html#C49\`.
- Nemotron defaults to unchanged baseline A repetition 1. Repetition 2 is selectable; no best-response selection occurs.
- The sticky header’s **Case index** link returns to the index from any scroll position. Search, filters and Nemotron selection are preserved. **Clear filters** returns all 50 case links.
- The index is always hidden while a case is open. **Presentation view** enlarges the case text. Left/right arrows move through matching cases; Escape or / returns to the index. Browser Back and Forward restore index/case navigation.
- Three primary cards show a bucket, one comparison label and the saved rationale. The collapsed **Historical pipeline · V25** section preserves its response, completion status, early actions and source links.
- **Record details** contains each model configuration and source links. **About the study** contains provenance, reference notes and interpretation limits. Reference cards show only their labels and dispositions.

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

Fable is the preserved historical low-effort run. MedGemma is the recorded local Q5_K_M configuration. Nemotron uses the registered unchanged three-bucket baseline A, with two repetitions shown separately. V25 is retained in a collapsed historical section because it used a different five-route multi-stage pipeline, rather than the simple three-bucket protocol. Its original 21/49 all-case result and 21/27 completed-release agreement are distinct from this post-hoc three-bucket physician-v3 display. Only 27/50 V25 cases had an eligible completed release; 23 remain incomplete. Rejected proposals and separately issued early actions are never displayed as completed dispositions.

Under/over-escalation compares completed route order SELF_CARE < ASYNC_PHYSICIAN < URGENT_ESCALATION against accepted physician v3 buckets. It is not a patient-harm measurement. Incomplete output is a separate operational status, never a self-care prediction. The source scorecards retain the two false-negative endpoints, distinguishing omitted clinician involvement from omitted urgent escalation. Repeated endpoint pills are omitted from the cards. Rationale accuracy and care delivery are not validated by route agreement.

Model families, inference dates, runtime, quantization, decoding and pipeline scope differ. This inspection tool is not a controlled ranking, clinical validation or model promotion. It does not expose hidden reasoning or submit patient messages.

The reviewed Counsel wordmark is embedded unchanged. About the study identifies Counsel as the intended audience of this independent project, not a sponsor or endorser.

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
