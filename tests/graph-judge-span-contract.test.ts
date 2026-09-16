import test from "node:test";
import assert from "node:assert/strict";
import { createJudgeSpanContract, judgeSpanAliases, judgeSpanCatalog, judgeSpanPacket, judgeSpanPacketDiagnostics, restoreJudgeSpanUnits, JUDGE_SPAN_PROTOCOL, MAX_JUDGE_SPAN_PACKET_BYTES } from "../src/disposition/graph-judge-span-contract.ts";
import { graphJudgeSchema, validateGraphJudge, type GraphJudge } from "../src/disposition/clinical-graph.ts";
import { exactStructuredJudgeAnchor } from "../src/disposition/judge-anchors.ts";
import { sha256 } from "../src/evidence/rag/model.ts";

const contract = createJudgeSpanContract(graphJudgeSchema);
const patient = "My child is drinking okay and playful between fevers.";
const clause = "The clinician will review your medication history before prescribing.";
const patientMessage = `A preceding sentence. ${clause} Availability is not confirmed.`;
const draft = {
  patientMessage,
  reason: "Described as well-appearing with maintained hydration.",
  evidenceLimitations: 'Contains a "quoted value", a backslash \\ and\na new line.',
  first: "alpha", second: "beta", "escaped/key~": "Distinct pointer escaping.", questions: [],
};
const packet = {
  units: [
    { id: "patient", text: patient }, { id: "draft", text: JSON.stringify(draft) },
    { id: "issued_question", text: JSON.stringify([{ text: 'Did you mean "today" or yesterday?' }]) },
    { id: "source:one", text: "**Urgent assessment:** The complete condition must remain attached." },
    { id: "source:two", text: "An unrelated exact source sentence does not prove applicability." },
    { id: "early", text: "An early action is not an admissible draft-criterion anchor." },
  ],
  handoffFindings: [{ clause }], contractFindings: [], hasIssuedEarlyAction: false,
};
function wire(value = packet) {
  const prepared = judgeSpanPacket(value);
  const criterionIds = graphJudgeSchema.shape.criteria.element.shape.id.options;
  return {
    reviewScope: "draft-and-issued-question/v2" as const, verdict: "accept" as GraphJudge["verdict"],
    packetHash: prepared.packetHash, earlyAction: "none" as GraphJudge["earlyAction"], earlyCorrection: null,
    correction: "", evidenceQueries: [] as string[], repairTargets: [] as NonNullable<GraphJudge["repairTargets"]>,
    criteria: criterionIds.map(id => ({ id, verdict: "pass" as const as GraphJudge["criteria"][number]["verdict"], reason: "An explicit synthetic criterion explanation.", anchors: [{ spanId: judgeSpanAliases(value).find(span => span.unit === (id === "claim_support" ? "source:one" : "patient"))!.alias }] })),
  };
}

test("span resolution changes only anchors and preserves all negative decisions, reasons and repair requests", () => {
  const raw = wire(); raw.verdict = "revise"; raw.criteria[2].verdict = "fail";
  raw.criteria[2].reason = "Drinking okay is not proof of measured hydration.";
  raw.correction = "Keep the reported facts without adding measured findings.";
  raw.repairTargets = ["reason", "redFlags"]; raw.evidenceQueries = ["synthetic hydration question"];
  const span = judgeSpanAliases(packet).find(item => item.path === "/reason")!;
  raw.criteria[2].anchors = [{ spanId: span.alias }];
  const before = JSON.stringify({ raw, packet });
  const output = contract.resolve(raw, packet);
  assert.equal(output.verdict, "revise");
  assert.equal(output.criteria[2].verdict, "fail");
  assert.equal(output.criteria[2].reason, raw.criteria[2].reason);
  assert.deepEqual(output.repairTargets, raw.repairTargets); assert.deepEqual(output.evidenceQueries, raw.evidenceQueries);
  assert.equal(output.correction, raw.correction);
  assert.deepEqual(output.criteria[2].anchors, [{ unit: "draft", quote: draft.reason }]);
  assert.equal(validateGraphJudge(output, packet.units, true, null)?.verdict, "revise");
  assert.equal("packetHash" in output, false);
  assert.equal(JSON.stringify({ raw, packet }), before);
});

test("C07 extra-word and C22 dropped-Markdown quotes cannot be supplied through the ID-only schema", () => {
  const raw = wire();
  const source = judgeSpanCatalog(packet).find(span => span.unit === "source:one")!;
  const output = contract.resolve(raw, packet);
  assert.equal(output.criteria[3].anchors[0].quote, source.text);
  assert.ok(source.text.startsWith("**Urgent assessment:**"));
  assert.throws(() => contract.resolve({ ...raw, criteria: raw.criteria.map((criterion, i) => i === 2 ? { ...criterion, anchors: [{ spanId: criterion.anchors[0].spanId, quote: "well-appearing with maintained hydration nutrition" }] } : criterion) }, packet));
  assert.throws(() => contract.resolve({ ...raw, criteria: raw.criteria.map((criterion, i) => i === 3 ? { ...criterion, anchors: [{ unit: "source:one", quote: source.text.replaceAll("**", "") }] } : criterion) }, packet));
  assert.ok(!judgeSpanCatalog(packet).some(span => span.text.includes("hydration nutrition")));
});

test("packet hash binds patient, draft, source order/content and non-unit review context", () => {
  const raw = wire();
  for (const altered of [
    { ...packet, units: packet.units.map((unit, i) => i === 0 ? { ...unit, text: unit.text + " New information." } : unit) },
    { ...packet, units: packet.units.map((unit, i) => i === 1 ? { ...unit, text: JSON.stringify({ ...draft, reason: "Changed current draft." }) } : unit) },
    { ...packet, units: [...packet.units].reverse() },
    { ...packet, contractFindings: [{ id: "new-finding" }] },
    { ...packet, units: packet.units.map(unit => unit.id === "source:one" ? { ...unit, text: "Updated source text." } : unit) },
  ]) assert.throws(() => contract.resolve(raw, altered), /STALE_JUDGE_SPAN_PACKET/);
  const changed = { ...packet, units: packet.units.map(unit => unit.id === "source:one" ? { ...unit, text: "Updated source text." } : unit) };
  // IDs are deliberately packet-local. Only the exact original packet hash
  // binds a provider response; replacing both hash and ID is a new response.
  assert.throws(() => contract.resolve(raw, changed), /STALE_JUDGE_SPAN_PACKET/);
  assert.throws(() => contract.resolve({ ...raw, packetHash: "0".repeat(64) }, packet), /STALE_JUDGE_SPAN_PACKET/);
});

test("unknown IDs, cross-unit spoofing and altered client catalogs cannot rebind a quote", () => {
  const raw = wire(); raw.criteria[0].anchors = [{ spanId: "szzzzzzzz" }];
  assert.throws(() => contract.resolve(raw, packet), /UNKNOWN_JUDGE_SPAN_ID/);
  const correct = wire();
  assert.throws(() => contract.resolve({ ...correct, criteria: correct.criteria.map((criterion, i) => i === 0 ? { ...criterion, anchors: [{ ...criterion.anchors[0], unit: "source:one" }] } : criterion) }, packet));
  const presented = judgeSpanPacket(packet); presented.units[0].text.value = { $text: ["Attacker-provided replacement"] };
  const output = contract.resolve(correct, packet);
  assert.equal(output.criteria[0].anchors[0].unit, "patient");
  assert.equal(output.criteria[0].anchors[0].quote, patient);
  assert.equal(judgeSpanPacket(packet).anchorProtocol, JUDGE_SPAN_PROTOCOL);
  assert.throws(() => contract.resolve({ ...correct, anchorSpans: presented.units }, packet));
});

test("all seven distinct criteria and clinical contract still require validateGraphJudge after resolution", () => {
  const raw = wire();
  assert.throws(() => contract.resolve({ ...raw, criteria: raw.criteria.slice(1) }, packet));
  const duplicates = structuredClone(raw); duplicates.criteria[1] = duplicates.criteria[0];
  assert.equal(validateGraphJudge(contract.resolve(duplicates, packet), packet.units, true, null), null);
  const crossUnit = structuredClone(raw); crossUnit.criteria[3].anchors = crossUnit.criteria[0].anchors;
  const output = contract.resolve(crossUnit, packet);
  assert.equal(output.criteria[3].anchors[0].unit, "patient");
  assert.equal(validateGraphJudge(output, packet.units, true, null), null);
  assert.equal(validateGraphJudge(contract.resolve(raw, packet), packet.units, false, null), null);
  const contradiction = structuredClone(raw); contradiction.criteria[0].verdict = "fail";
  assert.equal(validateGraphJudge(contract.resolve(contradiction, packet), packet.units, true, null), null);
  // Identity does not establish clinical entailment: an unrelated source is
  // still exact. A calibrated reviewer must judge relevance/applicability.
  const unrelated = structuredClone(raw); unrelated.criteria[3].anchors = [{ spanId: judgeSpanAliases(packet).find(span => span.unit === "source:two")!.alias }];
  assert.notEqual(validateGraphJudge(contract.resolve(unrelated, packet), packet.units, true, null), null);
});

test("decoded JSON leaves and escaped paths stay separate; early units never become draft anchors", () => {
  const spans = judgeSpanCatalog(packet);
  assert.ok(spans.some(span => span.path === "/escaped~1key~0"));
  assert.ok(!spans.some(span => span.unit === "early" || span.text.includes("alphabeta")));
  for (const span of spans) {
    assert.ok(exactStructuredJudgeAnchor(packet.units.find(unit => unit.id === span.unit)!, span.text));
    if (span.unit === "draft") {
      const key = span.path.slice(1).replaceAll("~1", "/").replaceAll("~0", "~") as keyof typeof draft;
      const leaf = draft[key]; assert.equal(typeof leaf, "string");
      assert.equal((leaf as string).slice(span.start, span.end), span.text);
    }
  }
  const quoted = spans.find(span => span.path === "/evidenceLimitations")!;
  assert.ok(quoted.text.includes('"quoted value"'));
  assert.ok(quoted.text.includes("\\"));
  assert.throws(() => judgeSpanCatalog({ units: [{ id: "draft", text: "invalid JSON" }] }));
  assert.throws(() => judgeSpanCatalog({ units: [packet.units[0], packet.units[0]] }), /DUPLICATE_JUDGE_UNIT/);
});

test("whole ownership clauses bind exact patientMessage offsets, never a different field", () => {
  const spans = judgeSpanCatalog(packet), matched = spans.find(span => span.text === clause)!;
  assert.equal(matched.path, "/patientMessage");
  assert.equal(matched.start, patientMessage.indexOf(clause));
  assert.equal(patientMessage.slice(matched.start, matched.end), clause);
  const bad = { ...packet, units: packet.units.map(unit => unit.id === "draft" ? { ...unit, text: JSON.stringify({ patientMessage: "No handoff stated here.", reason: clause }) } : unit) };
  assert.throws(() => judgeSpanCatalog(bad), /UNBOUND_HANDOFF_CLAUSE/);
  assert.throws(() => judgeSpanCatalog({ ...packet, handoffFindings: [{ clause: "Absent full clause." }] }), /UNBOUND_HANDOFF_CLAUSE/);
  const longClause = "The clinician will review " + "x".repeat(310);
  assert.throws(() => judgeSpanCatalog({ units: [{ id: "draft", text: JSON.stringify({ patientMessage: longClause }) }], handoffFindings: [{ clause: longClause }] }), /INVALID_JUDGE_SPAN/);
});

test("300-character boundaries and short tails preserve exact Unicode substrings without losing meaningful characters", () => {
  for (const text of ["x".repeat(300), "x".repeat(301), "x".repeat(302), "x".repeat(299) + "🫀" + "z", "🫀".repeat(151), "A sufficiently long sentence. No", ("long-word ").repeat(80) + "OK", "   " + "x".repeat(301) + "   "]) {
    const spans = judgeSpanCatalog({ units: [{ id: "source:test", text }] });
    const covered = new Set<number>();
    for (const span of spans) {
      assert.ok(span.text.length >= 3 && span.text.length <= 300);
      assert.equal(span.text, text.slice(span.start, span.end));
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(span.text)), span.text);
      for (let i = span.start; i < span.end; i++) covered.add(i);
    }
    for (let i = 0; i < text.length; i++) if (!/\s/.test(text[i])) assert.ok(covered.has(i), `Dropped code unit ${i} of ${text.length}`);
    assert.deepEqual(judgeSpanCatalog({ units: [{ id: "source:test", text }] }), spans);
  }
  assert.deepEqual(judgeSpanCatalog({ units: [{ id: "source:test", text: "  " }] }), []);
});

test("single-copy fragments retain every original field, value and exact unit byte", () => {
  const prepared = judgeSpanPacket(packet);
  assert.deepEqual(restoreJudgeSpanUnits(prepared), packet.units);
  assert.deepEqual(prepared.handoffFindings, packet.handoffFindings);
  assert.equal("anchorSpans" in prepared, false);
  const complex = { units: [{ id: "draft", text: JSON.stringify({ text: " 🫀 \\\n\"x\"  ", n: 7, no: false, nil: null, array: ["string", 2, null] }) }, { id: "patient", text: "a".repeat(301) + " 🫀 " }] };
  assert.deepEqual(restoreJudgeSpanUnits(judgeSpanPacket(complex)), complex.units);
  assert.throws(() => judgeSpanPacket({ units: [{ id: "draft", text: '{ "text": "value" }' }] }), /NONCANONICAL_JUDGE_UNIT/);
  assert.throws(() => judgeSpanPacket({ units: [{ id: "draft", text: JSON.stringify({ $text: "reserved" }) }] }), /RESERVED_JUDGE_SPAN_KEY/);
});

test("every selectable ID appears exactly once, including overlapping whole clauses and short tails", () => {
  const clause = "the clinician will review your history";
  const value = { units: [{ id: "draft", text: JSON.stringify({ patientMessage: `Before prescribing, ${clause}, but no handoff has occurred.`, note: "x".repeat(302) }) }, { id: "source:unicode", text: "🫀".repeat(151) }], handoffFindings: [{ clause }] };
  const prepared = judgeSpanPacket(value), found: { id: string; text: string }[] = [];
  const visit = (item: unknown) => {
    if (Array.isArray(item)) item.forEach(visit);
    else if (item !== null && typeof item === "object") {
      if ("$text" in item) for (const part of item.$text as (string | [string, string])[]) { if (Array.isArray(part)) found.push({ id: part[0], text: part[1] }); }
      else Object.values(item).forEach(visit);
    }
  };
  visit(prepared.units); found.push(...prepared.overlapAnchors);
  assert.ok(prepared.overlapAnchors.some(anchor => anchor.text === clause));
  assert.deepEqual(found.map(item => item.id).sort(), judgeSpanAliases(value).map(item => item.alias).sort());
  for (const span of judgeSpanAliases(value)) assert.equal(found.find(item => item.id === span.alias)?.text, span.text);
  assert.deepEqual(restoreJudgeSpanUnits(prepared), value.units);
});

test("UTF-8 byte diagnostics preserve the 60k prompt guard without truncating or substituting context", () => {
  const base = { ...packet, externalContext: "" };
  const baseline = judgeSpanPacketDiagnostics(base);
  assert.equal(baseline.originalPacketBytes, Buffer.byteLength(JSON.stringify(base)));
  assert.equal(baseline.packetBytes, Buffer.byteLength(JSON.stringify(judgeSpanPacket(base))));
  assert.equal(baseline.addedBytes, baseline.packetBytes - baseline.originalPacketBytes);
  assert.equal(baseline.spanCount, judgeSpanCatalog(base).length);
  const exact = { ...base, externalContext: "x".repeat(MAX_JUDGE_SPAN_PACKET_BYTES - baseline.packetBytes) };
  assert.equal(judgeSpanPacketDiagnostics(exact).packetBytes, MAX_JUDGE_SPAN_PACKET_BYTES);
  assert.equal(judgeSpanPacketDiagnostics(exact).withinLimit, true);
  assert.equal(Buffer.byteLength(JSON.stringify(judgeSpanPacket(exact))), MAX_JUDGE_SPAN_PACKET_BYTES);
  assert.throws(() => judgeSpanPacket({ ...exact, externalContext: exact.externalContext + "x" }), /JUDGE_SPAN_PROMPT_LIMIT_EXCEEDED/);
  const unicode = { ...base, externalContext: "🫀".repeat(16_000) };
  assert.ok(JSON.stringify(unicode).length < MAX_JUDGE_SPAN_PACKET_BYTES);
  assert.equal(judgeSpanPacketDiagnostics(unicode).withinLimit, false);
  const before = JSON.stringify(unicode);
  assert.throws(() => judgeSpanPacket(unicode), /JUDGE_SPAN_PROMPT_LIMIT_EXCEEDED/);
  assert.equal(JSON.stringify(unicode), before);
});
