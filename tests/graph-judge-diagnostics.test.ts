import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseGraphJudge, type GraphJudgeDiagnosticCode } from "../src/evaluation/graph-judge-diagnostics.ts";
import { graphJudgeSchema, validateGraphJudge, type GraphJudge } from "../src/disposition/clinical-graph.ts";
import type { SafetyNotice } from "../src/disposition/contract.ts";

const patient = "My usual headache started today. No fever.";
const sourceText = "A synthetic source sentence for exact identity testing.";
const draftText = 'This draft contains "quoted text" and an\nactual newline.';
const units = [
  { id: "patient", text: patient },
  { id: "draft", text: JSON.stringify({ patientMessage: draftText }) },
  { id: "source:fixture", text: sourceText },
  { id: "issued_question", text: JSON.stringify([{ text: 'Did you mean "today"?' }]) },
];
const notice: SafetyNotice = { disposition: "EMERGENCY_NOW", source: "emergency_agent", directive: "Synthetic fixture action only." };
function judge(): GraphJudge {
  return {
    reviewScope: "draft-and-issued-question/v2", verdict: "accept", earlyAction: "none", earlyCorrection: null,
    correction: "", evidenceQueries: [],
    criteria: graphJudgeSchema.shape.criteria.element.shape.id.options.map(id => ({
      id, verdict: "pass", reason: "Synthetic test criterion explanation.",
      anchors: [{ unit: id === "claim_support" ? "source:fixture" : "patient", quote: id === "claim_support" ? sourceText : "usual headache" }],
    })),
  };
}
function check(raw: unknown, expected: GraphJudgeDiagnosticCode[], options: { units?: typeof units; evidence?: boolean; notice?: SafetyNotice | null } = {}) {
  const packetUnits = options.units ?? units, evidence = options.evidence ?? true, action = options.notice ?? null;
  const before = JSON.stringify({ raw, packetUnits, action });
  const report = diagnoseGraphJudge(raw, packetUnits, evidence, action);
  assert.equal(report.runtimeContractConformant, validateGraphJudge(raw, packetUnits, evidence, action) !== null);
  assert.equal(report.diagnosticParity, true);
  assert.deepEqual([...new Set(report.issues.map(issue => issue.code))].sort(), [...expected].sort());
  assert.equal(report.runtimeContractConformant, expected.length === 0);
  assert.equal(report.clinicalValidation, false);
  assert.equal(report.bindingVerificationPerformed, false);
  assert.equal(report.diagnosticOnly, true);
  assert.equal("output" in report, false);
  assert.equal(JSON.stringify({ raw, packetUnits, action }), before, "diagnostics cannot repair or mutate the packet");
  return report;
}

test("diagnostics preserve valid negative reviews without approving their clinical content", () => {
  check(judge(), []);
  const negative = judge(); negative.verdict = "revise"; negative.criteria[0].verdict = "fail";
  check(negative, []);
  negative.verdict = "human_review"; negative.criteria[0].verdict = "abstain";
  check(negative, []);
  // Defaults permitted by the runtime are not added to the original object.
  const { evidenceQueries: _queries, ...withoutDefault } = judge();
  check(withoutDefault, []);
  assert.equal("evidenceQueries" in withoutDefault, false);
});

test("schema failures expose exact paths and duplicate criterion IDs are separate", () => {
  const invalid = { ...judge(), reviewScope: "unrelated-review" };
  const report = check(invalid, ["SCHEMA_INVALID"]);
  assert.deepEqual(report.issues[0].path, ["reviewScope"]);
  assert.equal(report.issues[0].schemaCode, "invalid_value");
  check({ ...judge(), extraField: true }, ["SCHEMA_INVALID"]);
  const duplicate = judge(); duplicate.criteria[3] = duplicate.criteria[0];
  const duplicateReport = check(duplicate, ["DUPLICATE_CRITERION", "MISSING_CRITERION"]);
  assert.deepEqual(duplicateReport.issues.find(issue => issue.code === "DUPLICATE_CRITERION")?.path, ["criteria", 3, "id"]);
  assert.equal(duplicateReport.issues.find(issue => issue.code === "MISSING_CRITERION")?.criterion, "claim_support");
  check({ ...judge(), criteria: judge().criteria.slice(1) }, ["SCHEMA_INVALID"]);
});

test("anchor diagnostics distinguish source quote mismatches, missing units and prohibited early units", () => {
  const wrongSource = judge(); wrongSource.criteria[3].anchors[0].quote = "usual headache";
  const report = check(wrongSource, ["SOURCE_ANCHOR_QUOTE_MISMATCH"]);
  assert.equal(report.issues[0].unit, "source:fixture");
  assert.deepEqual(report.issues[0].path, ["criteria", 3, "anchors", 0, "quote"]);
  const missing = judge(); missing.criteria[3].anchors[0].unit = "source:absent";
  check(missing, ["ANCHOR_UNIT_MISSING"]);
  const invented = judge(); invented.criteria[0].anchors[0].unit = "invented";
  check(invented, ["ANCHOR_UNIT_DISALLOWED", "ANCHOR_UNIT_MISSING"]);
  const early = judge(); early.criteria[0].anchors = [{ unit: "early", quote: "Synthetic fixture action" }];
  check(early, ["ANCHOR_UNIT_DISALLOWED"], { units: [...units, { id: "early", text: notice.directive }] });
  const absentQuote = judge(); absentQuote.criteria[0].anchors[0].quote = "not in the patient message";
  check(absentQuote, ["ANCHOR_QUOTE_MISMATCH"]);
});

test("structured draft/question quotes use the runtime leaf matcher without decoding source/patient prose", () => {
  const decoded = judge(); decoded.criteria[0].anchors = [{ unit: "draft", quote: draftText }];
  decoded.criteria[1].anchors = [{ unit: "issued_question", quote: 'Did you mean "today"?' }];
  check(decoded, []);
  decoded.criteria[0].anchors = [{ unit: "source:encoded", quote: draftText }];
  check(decoded, ["SOURCE_ANCHOR_QUOTE_MISMATCH"], { units: [...units, { id: "source:encoded", text: JSON.stringify({ text: draftText }) }] });
  decoded.criteria[0].anchors = [{ unit: "draft", quote: "alphabeta" }];
  check(decoded, ["ANCHOR_QUOTE_MISMATCH"], { units: units.map(unit => unit.id === "draft" ? { id: "draft", text: JSON.stringify({ first: "alpha", second: "beta" }) } : unit) });
});

test("claim-support pass requires the same evidence flag and source anchor as the runtime", () => {
  check(judge(), ["CLAIM_PASS_WITHOUT_EVIDENCE"], { evidence: false });
  const wrongUnit = judge(); wrongUnit.criteria[3].anchors = [{ unit: "patient", quote: "usual headache" }];
  check(wrongUnit, ["CLAIM_PASS_WITHOUT_SOURCE_ANCHOR"]);
  check(wrongUnit, ["CLAIM_PASS_WITHOUT_SOURCE_ANCHOR", "CLAIM_PASS_WITHOUT_EVIDENCE"], { evidence: false });
  wrongUnit.verdict = "revise"; wrongUnit.criteria[3].verdict = "abstain";
  check(wrongUnit, [], { evidence: false });
});

test("early review presence, corrections and patient quote identity mirror the runtime", () => {
  check(judge(), ["EARLY_ACTION_PRESENCE_MISMATCH"], { notice });
  const early = judge(); early.earlyAction = "supported";
  check(early, ["EARLY_ACTION_PRESENCE_MISMATCH"]);
  check(early, [], { notice });
  early.earlyAction = "unsupported"; early.verdict = "revise";
  check(early, ["EARLY_CORRECTION_MISSING"], { notice });
  early.earlyCorrection = { reason: "Synthetic test correction justification.", patientQuotes: ["not actually present"], triggerMisattributedOrCorrected: true };
  check(early, ["EARLY_CORRECTION_PATIENT_QUOTE_MISMATCH"], { notice });
  early.earlyCorrection.patientQuotes = ["usual headache"];
  check(early, [], { notice });
  // First patient unit semantics matter for correction quotes even when the
  // normal anchor matcher could find another same-ID unit.
  check(early, ["EARLY_CORRECTION_PATIENT_QUOTE_MISMATCH"], { notice, units: [{ id: "patient", text: "Unrelated first patient unit." }, ...units] });
});

test("accept/review contradictions remain rejected; unresolved negative reviews remain records", () => {
  const inconsistent = judge(); inconsistent.criteria[0].verdict = "fail";
  check(inconsistent, ["ACCEPT_WITH_NONPASS_CRITERION"]);
  inconsistent.criteria[0].verdict = "abstain";
  check(inconsistent, ["ACCEPT_WITH_NONPASS_CRITERION"]);
  const unresolved = judge(); unresolved.earlyAction = "unresolved";
  check(unresolved, ["ACCEPT_WITH_UNRESOLVED_EARLY_ACTION"], { notice });
  unresolved.verdict = "human_review";
  check(unresolved, [], { notice });
});

test("contract-only diagnostics do not silently add transport or clinical admission rules", () => {
  const transport = judge();
  transport.transportReview = { mode: "continue_ems", verdict: "supported", draftQuote: "Not present in the draft", activation: null };
  // Separate runtime care admission, not validateGraphJudge, evaluates this.
  check(transport, []);
});
