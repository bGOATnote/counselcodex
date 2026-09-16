import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  buildLocalBindingFixtures,
  localBindingInput,
  LOCAL_BINDING_FIXTURE_VERSION,
  LOCAL_BINDING_FIXTURE_SHA256,
} from "../src/evaluation/local-binding-fixtures.ts";

const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");

test("the frozen corpus contains 24 balanced minimal pairs across 12 families", () => {
  const rows = buildLocalBindingFixtures();
  assert.equal(LOCAL_BINDING_FIXTURE_VERSION, "local-binding-fixtures/v1");
  assert.equal(rows.length, 48);
  assert.equal(new Set(rows.map(row => row.id)).size, 48);
  assert.equal(new Set(rows.map(row => row.family)).size, 12);
  for (const split of ["development", "validation"] as const) {
    const partition = rows.filter(row => row.split === split);
    assert.equal(partition.length, 24);
    assert.equal(partition.filter(row => row.expected === "supported").length, 12);
    assert.equal(partition.filter(row => row.expected === "unsupported").length, 12);
  }
  for (const family of new Set(rows.map(row => row.family))) {
    const members = rows.filter(row => row.family === family);
    assert.equal(members.length, 4, family);
    for (const split of ["development", "validation"] as const) {
      const pair = members.filter(row => row.split === split);
      const control = pair.find(row => row.variant === "control")!;
      const defect = pair.find(row => row.variant === "defect")!;
      assert.equal(pair.length, 2, `${family}:${split}`);
      assert.equal(control.expected, "supported");
      assert.equal(defect.expected, "unsupported");
      assert.notEqual(control.input.claim, defect.input.claim);
      assert.deepEqual(
        { ...control.input, claim: undefined },
        { ...defect.input, claim: undefined },
        "the claim is the sole model-input change within each pair",
      );
      assert.deepEqual(control.provenance, defect.provenance);
    }
    assert.notEqual(members[0].input.patient, members[2].input.patient,
      "validation uses a different authored scenario, not the development patient text");
  }
});

test("model projection strips hidden labels, IDs and metadata including smuggled input properties", () => {
  const fixture = buildLocalBindingFixtures()[0];
  const sentinels = {
    id: "CASE_ID_MUST_STAY_OFFLINE",
    family: "FAMILY_MUST_STAY_OFFLINE",
    rationale: "RATIONALE_MUST_STAY_OFFLINE",
    physicianNotes: "PHYSICIAN_NOTE_MUST_STAY_OFFLINE",
    acceptedRoutes: ["ROUTE_LABEL_MUST_STAY_OFFLINE"],
  };
  const poisoned = {
    ...fixture,
    ...sentinels,
    input: {
      ...fixture.input,
      expected: "EXPECTED_LABEL_MUST_STAY_OFFLINE",
      caseId: "NESTED_CASE_ID_MUST_STAY_OFFLINE",
    },
  };
  const projected = localBindingInput(poisoned);
  assert.deepEqual(Object.keys(projected).sort(), ["claim", "patient", "sourceText"]);
  assert.deepEqual(projected, fixture.input);
  assert.doesNotMatch(JSON.stringify(projected), /MUST_STAY_OFFLINE/);
  projected.claim = "A caller changed the projected claim.";
  assert.notEqual(fixture.input.claim, projected.claim);
  assert.notEqual(poisoned.input.claim, projected.claim);
});

test("every provenance hash still matches its archived engineering source and each excerpt", () => {
  const sources = new Map<string, string>();
  for (const row of buildLocalBindingFixtures()) {
    assert.equal(row.provenance.kind, "engineering_authored");
    assert.equal(row.provenance.clinicalApproval, false);
    const { sourcePath, sourceSha256 } = row.provenance;
    assert.match(sourceSha256, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(sourcePath, /physician|\.csv$|results\//);
    if (!sources.has(sourcePath)) {
      const raw = readFileSync(new URL(`../${sourcePath}`, import.meta.url));
      assert.equal(sha256(raw), sourceSha256, `${sourcePath}: create a new corpus version if provenance changes`);
      sources.set(sourcePath, raw.toString("utf8"));
    }
    if (row.input.sourceText !== null) {
      assert.ok(sources.get(sourcePath)!.includes(row.input.sourceText),
        `${row.id}: the entire retained source excerpt must occur verbatim in the pinned module`);
    }
  }
  assert.equal(sources.size, 5);
});

test("the corpus stays short, label-free and reproducible without reading clinical gold", () => {
  const rows = buildLocalBindingFixtures();
  const module = readFileSync(new URL("../src/evaluation/local-binding-fixtures.ts", import.meta.url), "utf8");
  assert.doesNotMatch(module, /^import\b/m, "fixture construction has no runtime, filesystem, provider, or gold dependency");
  for (const row of rows) {
    const packet = JSON.stringify(localBindingInput(row));
    assert.ok(Buffer.byteLength(packet, "utf8") <= 4500, row.id);
    assert.ok(row.input.patient.length > 20);
    assert.ok(row.input.claim.length > 20);
    assert.ok(row.rationale.length > 40);
    assert.ok(!packet.includes(row.id));
    assert.doesNotMatch(packet, /acceptedRoutes|physicianNotes|clinicalApproval|sourceSha256|lbf-v1-|EMERGENCY_NOW|ASYNC_PHYSICIAN|SELF_CARE/);
  }
  assert.deepEqual(rows, buildLocalBindingFixtures());
  const original = JSON.stringify(rows);
  assert.equal(sha256(original), LOCAL_BINDING_FIXTURE_SHA256,
    "v1 text, labels, partitions and provenance are frozen before model evaluation");
  rows[0].input.patient = "A caller changed the first patient's text.";
  rows[0].provenance.sourceSha256 = "changed";
  assert.equal(JSON.stringify(buildLocalBindingFixtures()), original,
    "mutating one returned corpus cannot contaminate a later run");
});
