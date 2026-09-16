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
assert.deepEqual(manifest.presentation.falseNegativeSlides, { C22: 2, C47: 3, C49: 4 });
assert.equal(manifest.presentation.historicalArchitectureSlide, 5);
const reviewURL = "https://bgoatnote.github.io/counselcodex/#C49";
assert.equal(deck.slides[3].caseReviewLink.url, reviewURL);
assert.equal(deck.slides[8].caseReviewLink.url, reviewURL);
const c49 = json("outputs/stripped-3bucket-medgemma-27b-q5-2026-09-16/comparison-fable.json").rows.find(row => row.id === "C49");
assert.equal(deck.slides[3].body[0], c49.message);
for (const [index, model] of ["fable", "medgemma"].entries()) {
  assert.equal(deck.slides[3].comparisons[index].disposition, c49[model].disposition);
  assert.equal(deck.slides[3].comparisons[index].rationale, c49[model].rationale);
}
assert.deepEqual(c49.acceptedBuckets, ["URGENT_ESCALATION"]);

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
const researchMessages = new Map(json("outputs/workflow-aware-disposition-2026-09-16/messages.json").map((row) => [row.id, row.message]));
const authoredQuotes = manifest.presentation.verbatimAuthoredMessages;
assert.equal(Object.keys(authoredQuotes).length, manifest.presentation.verbatimAuthoredMessageCount);
for (const [id, pages] of Object.entries(authoredQuotes)) {
  assert.ok(/^WP\d{2}[AB]$/.test(id) && researchMessages.has(id), `Unknown authored case: ${id}`);
  for (const page of pages) {
    const slide = deck.slides[page - 1];
    const visible = [...(slide.body ?? []), ...(slide.table?.rows.flat() ?? [])];
    assert.ok(visible.includes(researchMessages.get(id)), `${id} is not verbatim on slide ${page}`);
  }
}
const mentionedCases = new Set(JSON.stringify(deck.slides).match(/(?<![A-Za-z0-9])(?:C\d{2}|WP\d{2}[AB])(?![A-Za-z0-9])/g) ?? []);
assert.deepEqual([...mentionedCases].sort(), [...Object.keys(manifest.presentation.verbatimCaseMessages), ...Object.keys(authoredQuotes)].sort(), "Every discussed case must have its exact message visible");
for (const slide of deck.slides) {
  for (const source of slide.sources ?? []) {
    if (/^(docs|src|tests|apps|data|outputs|output)\//.test(source) || /^[A-Z_]+\.md$/.test(source)) read(source);
  }
}
execFileSync(process.execPath, [resolve(root, "scripts/build-submission-narrative.mjs"), "--verify"], { stdio: "inherit" });
console.log(`Submission verified: ${Object.keys(manifest.artifacts).length} artifact hashes, ${deck.slides.length} slides, ${quotedCases} assignment and ${Object.keys(authoredQuotes).length} authored messages, and canonical demo links. No provider calls.`);
