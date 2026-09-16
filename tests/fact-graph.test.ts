import test from "node:test";
import assert from "node:assert/strict";
import { GRAPH, Edge, FACT_GRAPH_HASH, floorFromGraph, matchPaths, shadowGraph, runFactGraphShadow, type FactId, type Observation } from "../src/disposition/fact-graph.ts";
import { resolveGraphConfig, DEFAULT_GRAPH_MODELS } from "../src/disposition/graph-config.ts";
import { graphPromptHash } from "../src/disposition/clinical-graph.ts";

const message = "Suddenly my face drooped. I have diabetes and a foot ulcer with fever and redness. I need dosing clarification for my localized rash.";
const quotes: Partial<Record<FactId, string>> = { focal_neuro_deficit: "my face drooped", sudden_onset: "Suddenly", diabetes: "diabetes", foot_ulcer: "foot ulcer", fever: "fever", foot_local_inflammation: "redness", dosing_clarification_request: "dosing clarification", localized_rash: "localized rash" };
const obs = (factId: FactId, patch: Partial<Observation> = {}): Observation => ({ factId, status: "present", subject: "patient", episodeId: "now", temporality: "current", quote: quotes[factId]!, ...patch });
test("AND requires every operand; diabetes alone cannot select in-person care", () => {
  const facts = [obs("diabetes"), obs("foot_ulcer"), obs("fever")];
  for (let mask = 0; mask < 8; mask++) {
    const subset = facts.filter((_, i) => mask & (1 << i));
    assert.equal(floorFromGraph(message, subset), mask === 7 ? "EMERGENCY_NOW" : null);
  }
  assert.equal(floorFromGraph(message, [obs("diabetes"), obs("foot_ulcer"), obs("foot_local_inflammation")]), "SAME_DAY_IN_PERSON");
});
test("sudden focal deficit qualifies, including recently resolved; free IDs cannot", () => {
  const facts = [obs("focal_neuro_deficit"), obs("sudden_onset")];
  assert.equal(floorFromGraph(message, facts), "EMERGENCY_NOW");
  assert.equal(floorFromGraph(message, facts.map(o => ({ ...o, temporality: "recent_resolved" }))), "EMERGENCY_NOW");
  assert.equal(floorFromGraph(message, [obs("focal_neuro_deficit")]), null);
  assert.equal(floorFromGraph(message, ["focal_neuro_deficit", "sudden_onset"]), null);
});
test("emergency beats same-day irrespective of edge/fact order; suggestions never set a floor", () => {
  const facts = [obs("diabetes"), obs("foot_ulcer"), obs("foot_local_inflammation"), obs("fever"), obs("localized_rash")];
  assert.equal(floorFromGraph(message, facts), "EMERGENCY_NOW");
  assert.equal(shadowGraph(message, [...facts].reverse(), [...GRAPH].reverse()).candidateFloor, "EMERGENCY_NOW");
  for (const id of ["localized_rash", "dosing_clarification_request"] as const) {
    const r = shadowGraph(message, [obs(id)]);
    assert.equal(r.paths.length, 1); assert.equal(r.candidateFloor, null); assert.equal(r.suggestions.length, 1);
    assert.equal(r.affectedRouting, false);
  }
});
test("historical, hypothetical, denied, unknown and unrelated-person findings never satisfy edges", () => {
  for (const patch of [{ temporality: "historical" }, { temporality: "hypothetical" }, { temporality: "unknown" }, { status: "absent" }, { status: "unknown", quote: "" }, { subject: "other" }, { subject: "unknown" }] as Partial<Observation>[]) {
    assert.equal(floorFromGraph(message, [obs("focal_neuro_deficit", patch), obs("sudden_onset")]), null);
  }
  const rash = "The leaflet says anaphylaxis. I have no allergic symptoms.";
  assert.equal(floorFromGraph(rash, [obs("anaphylaxis_pattern", { temporality: "hypothetical", quote: "anaphylaxis" })]), null);
});
test("AND cannot combine people or episodes; contradictory observations are explicit, not majority-voted", () => {
  const facts = [obs("diabetes"), obs("foot_ulcer"), obs("fever")];
  assert.equal(floorFromGraph(message, [facts[0], facts[1], { ...facts[2], episodeId: "old" }]), null);
  assert.equal(floorFromGraph(message, [facts[0], facts[1], { ...facts[2], subject: "other" }]), null);
  const r = shadowGraph(message, [...facts, obs("fever", { status: "absent" })]);
  assert.equal(r.candidateFloor, null); assert.ok(r.violations.some(x => x.startsWith("CONFLICT:")));
});
test("invented or ambiguous quotations reject the packet; offsets and input identity are bound", () => {
  const facts = [obs("focal_neuro_deficit"), obs("sudden_onset")];
  assert.equal(floorFromGraph(message, [...facts, obs("fever", { quote: "not in input" })]), null);
  assert.equal(floorFromGraph(message + " Suddenly", facts), null);
  assert.equal(floorFromGraph(message, [{ ...facts[0], factId: "made_up" }, facts[1]]), null);
  const r = shadowGraph(message, facts);
  for (const f of r.observations) assert.equal(message.slice(f.start!, f.end!), f.quote);
  assert.equal(r.graphHash, FACT_GRAPH_HASH);
  assert.notEqual(shadowGraph(message + " More context.", facts).inputHash, r.inputHash);
});
test("empty matches never mean home care; schema prevents vacuous AND, duplicates and fact destinations", () => {
  assert.equal(floorFromGraph(message, []), null);
  assert.equal(Edge.safeParse({ ...GRAPH[0], from: [] }).success, false);
  assert.equal(Edge.safeParse({ ...GRAPH[0], from: ["diabetes", "diabetes"] }).success, false);
  assert.equal(Edge.safeParse({ ...GRAPH[0], to: "focal_neuro_deficit" }).success, false);
  assert.throws(() => shadowGraph(message, [], [GRAPH[0], GRAPH[0]]), /DUPLICATE_EDGE/);
  assert.throws(() => GRAPH[0].from.push("fever"), TypeError);
});
test("repeating a fact cannot fabricate an AND match or amplify its priority", () => {
  assert.equal(floorFromGraph(message, Array.from({ length: 8 }, () => obs("diabetes"))), null);
  assert.equal(matchPaths(message, [obs("focal_neuro_deficit"), obs("sudden_onset"), obs("sudden_onset")]).length, 1);
});
test("exact quotations cannot prove extractor semantics: shadow never authorizes the false match", () => {
  // Deliberately dishonest extractor. Mechanical identity cannot detect that
  // it labelled an explicitly denied finding as present. This is WHY enforcement
  // is unavailable, not a passing clinical-classification example.
  const text = "I deny anaphylaxis signs.";
  const r = shadowGraph(text, [obs("anaphylaxis_pattern", { quote: "anaphylaxis signs" })]);
  assert.equal(r.candidateFloor, "EMERGENCY_NOW");
  assert.equal(r.semanticValidation, "not_assessed"); assert.equal(r.affectedRouting, false);
});
test("role env configuration preserves defaults and cannot activate mandatory graph routing", () => {
  const off = resolveGraphConfig(); assert.deepEqual(off.models, DEFAULT_GRAPH_MODELS); assert.equal(off.factGraphMode, "off");
  const shadow = resolveGraphConfig({ COUNSEL_FACT_GRAPH_MODE: "shadow" });
  assert.notEqual(graphPromptHash(off), graphPromptHash(shadow));
  const swapped = resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: "openai/test-model" });
  assert.equal(swapped.models.disposition, "openai/test-model"); assert.notEqual(graphPromptHash(off), graphPromptHash(swapped));
  assert.throws(() => resolveGraphConfig({ COUNSEL_FACT_GRAPH_MODE: "enforce" }));
  assert.throws(() => resolveGraphConfig({ COUNSEL_GRAPH_DISPOSITION_MODEL: "https://untrusted.test/model" }));
});
test("shadow matcher and audit failures remain diagnostic, not clinical branch exceptions", () => {
  const failed = runFactGraphShadow(message, [], undefined, () => { throw new Error("injected matcher failure"); });
  assert.deepEqual(failed.violations, ["SHADOW_EXECUTION_FAILED"]);
  assert.equal(failed.candidateFloor, null); assert.equal(failed.affectedRouting, false);
  const unlogged = runFactGraphShadow(message, [], () => { throw new Error("injected audit failure"); });
  assert.deepEqual(unlogged.violations, ["SHADOW_AUDIT_FAILED"]);
  assert.equal(unlogged.affectedRouting, false);
});
