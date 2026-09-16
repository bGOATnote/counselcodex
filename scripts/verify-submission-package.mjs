/** Offline publication checks. Reads artifacts; never generates or rescores model output. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/lib/csv.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = "output/submission-2026-09-15";
const read = (path) => readFileSync(resolve(root, path));
const json = (path) => JSON.parse(read(path));
const manifest = json(`${packagePath}/manifest.json`);
const deck = json(`${packagePath}/content/deck.json`);
const canonicalURL = "http://localhost:4120/stripped";
const guideURL = "https://github.com/bGOATnote/counselcodex/blob/main/docs/GUI_ACCESS.md";

for (const [path, expected] of Object.entries(manifest.artifacts)) {
  const localPath = relative(root, resolve(root, path));
  assert.ok(!isAbsolute(path) && localPath !== ".." && !localPath.startsWith("../"), `Artifact escapes repository: ${path}`);
  const bytes = read(path);
  assert.equal(bytes.length, expected.bytes, `Artifact size changed: ${path}`);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256, `Artifact hash changed: ${path}`);
}
for (const file of ["content/deck.json", "counsel-disposition-take-home.pptx", "counsel-disposition-take-home.pdf", "counsel-disposition-google-slides.pptx"]) {
  assert.ok(manifest.artifacts[`${packagePath}/${file}`], `Required deliverable absent from manifest: ${file}`);
}
assert.equal(deck.slides.length, manifest.presentation.slides);
assert.equal(deck.mainSlides, manifest.presentation.mainSlides);
assert.equal(deck.slides.slice(0, deck.mainSlides).reduce((sum, slide) => sum + slide.minutes, 0), deck.presentationMinutes);
assert.equal(deck.slides[0].demoLink.url, canonicalURL);
assert.equal(deck.slides[0].reviewerLink.url, guideURL);
assert.equal(manifest.presentation.localDemoURL, canonicalURL);
assert.equal(manifest.repository.canonicalLocalGUI, canonicalURL);
assert.equal(manifest.repository.guiAccessGuide, guideURL);
assert.deepEqual(manifest.presentation.coverLinks, [canonicalURL, guideURL]);
assert.deepEqual(manifest.presentation.falseNegativeSlides, { C22: 2, C47: 3 });
assert.equal(manifest.presentation.historicalArchitectureSlide, 4);

// Only visible slide text counts as a reproduced case message, not speaker notes.
const cases = new Map(parseCsv(read("data/patient_messages.csv").toString()).map((row) => [row.id, row.message]));
let quotedCases = 0;
for (const [id, pages] of Object.entries(manifest.presentation.verbatimCaseMessages)) {
  assert.ok(cases.has(id), `Unknown quoted case: ${id}`);
  for (const page of pages) {
    const slide = deck.slides[page - 1];
    const visible = [...(slide.body ?? []), ...(slide.table?.rows.flat() ?? [])];
    assert.ok(visible.includes(cases.get(id)), `${id} is not verbatim on slide ${page}`);
  }
  quotedCases += 1;
}
assert.equal(quotedCases, manifest.presentation.verbatimCaseMessageCount);
for (const slide of deck.slides) {
  for (const source of slide.sources ?? []) {
    if (/^(docs|src|tests|apps|data|outputs|output)\//.test(source) || /^[A-Z_]+\.md$/.test(source)) read(source);
  }
}
execFileSync(process.execPath, [resolve(root, "scripts/build-submission-narrative.mjs"), "--verify"], { stdio: "inherit" });
console.log(`Submission verified: ${Object.keys(manifest.artifacts).length} artifact hashes, ${deck.slides.length} slides, ${quotedCases} exact case messages and canonical demo links. No provider calls.`);
