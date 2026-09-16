import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const SCRIPT = resolve(dirname(fileURLToPath(import.meta.url)), "../scripts/check-public-content.py");
// Fictional test phrase only. No real person's name belongs in these fixtures.
const PHRASE = "Fixture Orchard";
const HASH = createHash("sha256").update("fixture orchard").digest("hex");
const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: "utf8", ...options });

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "public-content-fixture-"));
  const repo = join(directory, "repo"), config = join(directory, "name-hashes.json");
  mkdirSync(repo);
  assert.equal(run("git", ["init", "--quiet", repo]).status, 0);
  writeFileSync(config, JSON.stringify({ schema: "public-content-name-hashes/v1", normalization: "nfkd-casefold-markless-alnum-v1", hashes: [{ tokens: 2, sha256: HASH }] }));
  const put = (path, data) => { mkdirSync(dirname(join(repo, path)), { recursive: true }); writeFileSync(join(repo, path), data); };
  const add = (...paths) => { const r = run("git", ["-C", repo, "add", "--", ...paths]); assert.equal(r.status, 0, r.stderr); };
  const check = (...args) => {
    const r = run("python3", [SCRIPT, "--repo", repo, "--index", "--name-hashes", config, ...args]);
    assert.equal(r.stderr, "", "Scanner must not echo extractor errors or source values");
    return { status: r.status, report: JSON.parse(r.stdout), text: r.stdout };
  };
  const office = (path, members) => {
    const r = run("python3", ["-c", "import json,sys,zipfile\na=json.load(sys.stdin)\nwith zipfile.ZipFile(a['path'],'w',zipfile.ZIP_DEFLATED) as z:\n for name,text in a['members'].items(): z.writestr(name,text)"], { input: JSON.stringify({ path: join(repo, path), members: { "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>', ...members } }) });
    assert.equal(r.status, 0, r.stderr);
  };
  return { directory, repo, config, put, add, check, office, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

const codes = r => r.report.errors.map(x => x.code);

test("index scan includes staged additions and reads exact staged rather than worktree bytes", () => {
  const f = fixture(); try {
    f.put("new.md", PHRASE); f.add("new.md"); f.put("new.md", "safe unstaged replacement");
    f.put("untracked.md", PHRASE);
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.counts.files, 1);
    assert.equal(r.report.files[0].stagedChange, true); assert.equal(r.report.coverage.inspectionComplete, true);
    assert.equal(r.report.files[0].sha256, createHash("sha256").update(PHRASE).digest("hex"));
    assert(!r.text.includes(PHRASE)); assert(!r.text.includes("untracked.md"));
    f.add("new.md"); assert.equal(f.check().status, 0);
  } finally { f.cleanup(); }
});

test("normalization detects JSON escapes, fullwidth, combining accents, invisible controls and HTML entities", () => {
  const f = fixture(); try {
    f.put("escaped.json", '{"message":"\\uFF26\\uFF29\\uFF38\\uFF34\\uFF35\\uFF32\\uFF25 O\\u0301r\\u200Bchard"}');
    f.put("entities.md", "Fixture Or&#99;hard");
    f.put("nested.json", JSON.stringify({ responseText: '{"message":"Fixture \\u004frchard"}' }));
    f.add("escaped.json", "entities.md", "nested.json");
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.findings.length, 3);
    assert(r.report.files.filter(x => x.extraction.decodedJsonScanned).length === 2);
    assert(!r.text.includes(PHRASE)); assert(!r.text.includes(HASH));
  } finally { f.cleanup(); }
});

test("Office joins split runs, separately spaced runs and core property values", () => {
  const f = fixture(); try {
    f.office("slides.pptx", {
      "ppt/slides/slide1.xml": '<root><p>Unrelated preceding paragraph</p><p><r><t>Fix</t></r><r><t>ture </t></r><r><t>Orchard</t></r></p></root>',
      "ppt/slides/slide2.xml": '<root><r><t>Fixture</t></r><r><t>Orchard</t></r></root>',
      "docProps/core.xml": '<root><creator>Fixture Orchard</creator></root>',
    }); f.add("slides.pptx");
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.files[0].extraction.xmlMembersScanned, 4);
    assert.equal(r.report.findings.length, 3); assert(!r.text.includes(PHRASE));
  } finally { f.cleanup(); }
});

test("forbidden environment, local state, private key and private note paths fail without content values", () => {
  const f = fixture(); try {
    const paths = [".env.production", "local.sqlite", "signing.key", "notes/private-notes.md"];
    for (const path of paths) f.put(path, "safe synthetic text");
    f.put(".env.example", "SYNTHETIC_PLACEHOLDER=");
    f.add(...paths, ".env.example");
    const r = f.check(); assert.equal(r.status, 1);
    assert.deepEqual(r.report.findings.map(x => x.path).sort(), paths.sort());
    assert(r.report.findings.every(x => x.code === "forbidden_publication_path"));
  } finally { f.cleanup(); }
});

test("configured phrases in filenames are redacted from every report location", () => {
  const f = fixture(); try {
    f.put(`${PHRASE}.md`, "safe"); f.add(`${PHRASE}.md`);
    const r = f.check(); assert.equal(r.status, 1); assert(!r.text.includes(PHRASE));
    assert.equal(r.report.files[0].path, "[redacted-sensitive-path]");
    assert.match(r.report.files[0].pathSHA256, /^[0-9a-f]{64}$/);
  } finally { f.cleanup(); }
});

test("missing PDF extraction fails clearly instead of silently approving the file", () => {
  const f = fixture(); try {
    f.put("slides.pdf", "%PDF-1.7\nfixture"); f.add("slides.pdf");
    const r = f.check("--pdftotext", join(f.directory, "missing"), "--pdfinfo", join(f.directory, "also-missing"));
    assert.equal(r.status, 2); assert(codes(r).includes("required_pdf_extractor_unavailable"));
    assert.equal(r.report.files[0].coverage, "failed");
  } finally { f.cleanup(); }
});

test("PDF text and both metadata forms are scanned with no OCR claim or error-content leakage", () => {
  const f = fixture(); try {
    f.put("slides.pdf", "%PDF-1.7\nfixture"); f.add("slides.pdf");
    const extractor = join(f.directory, "extractor");
    writeFileSync(extractor, '#!/bin/sh\nif [ "$1" = "-meta" ]; then\n printf "<root><author>Fixture Orchard</author></root>"\nelse\n printf "safe extracted text"\nfi\nprintf "PRIVATE EXTRACTOR DIAGNOSTIC" >&2\n'); chmodSync(extractor, 0o700);
    const r = f.check("--pdftotext", extractor, "--pdfinfo", extractor);
    assert.equal(r.status, 1); assert.equal(r.report.files[0].extraction.xmpMetadataScanned, true);
    assert.equal(r.report.coverage.ocrPerformed, false); assert(!r.text.includes(PHRASE));
    assert(!r.text.includes("PRIVATE EXTRACTOR DIAGNOSTIC"));
  } finally { f.cleanup(); }
});

test("binary extraction coverage distinguishes images, unsupported binaries and disguised text", () => {
  const f = fixture(); try {
    f.put("figure.png", Buffer.from([137,80,78,71,13,10,26,10,0,255]));
    f.put("unknown.bin", Buffer.from([0,255,128])); f.put("disguised.png", PHRASE);
    f.add("figure.png", "unknown.bin", "disguised.png");
    const r = f.check(); assert.equal(r.status, 2);
    assert(codes(r).includes("unsupported_text_encoding_or_binary")); assert(codes(r).includes("image_signature_mismatch"));
    const figure = r.report.files.find(x => x.path === "figure.png");
    assert.equal(figure.coverage, "manual_review_required"); assert.equal(figure.extraction.contentScanned, false);
    assert.equal(r.report.coverage.manualImageReviewRequired, true);
  } finally { f.cleanup(); }
});

test("bounded Office extraction rejects expansion limits, active declarations and unsupported embedded files", () => {
  const f = fixture(); try {
    f.office("large.docx", { "word/document.xml": `<root>${"x".repeat(500)}</root>` });
    f.add("large.docx");
    const r = f.check("--max-member-bytes", "200"); assert.equal(r.status, 2); assert(codes(r).includes("archive_expansion_limit_exceeded"));
    f.office("large.docx", { "word/document.xml": '<!DOCTYPE root [<!ENTITY x "secret">]><root>&x;</root>' }); f.add("large.docx");
    const x = f.check(); assert.equal(x.status, 2); assert(codes(x).includes("xml_declarations_not_supported"));
    f.office("large.docx", { "word/embeddings/unknown.bin": "safe" }); f.add("large.docx");
    const b = f.check(); assert.equal(b.status, 2); assert(codes(b).includes("unsupported_office_embedded_binary"));
    assert.equal(b.report.files[0].coverage, "partial");
  } finally { f.cleanup(); }
});

test("resource limits and config failures report incomplete coverage and never a pass", () => {
  const f = fixture(); try {
    f.put("large.txt", "x".repeat(200)); f.add("large.txt");
    const r = f.check("--max-file-bytes", "100"); assert.equal(r.status, 2); assert.equal(r.report.coverage.inspectionComplete, false);
    assert(codes(r).includes("file_or_total_byte_limit_exceeded"));
    writeFileSync(f.config, '{"plaintext":"Fixture Orchard"}');
    const c = f.check(); assert.equal(c.status, 2); assert(!c.text.includes(PHRASE));
    assert.equal(c.report.coverage.inventoryComplete, false); assert(codes(c).includes("invalid_or_unreadable_name_hash_config"));
  } finally { f.cleanup(); }
});


test("symlinks are rejected without following untracked external content", () => {
  const f = fixture(); try {
    writeFileSync(join(f.directory, "external.txt"), PHRASE);
    symlinkSync(join(f.directory, "external.txt"), join(f.repo, "link.txt")); f.add("link.txt");
    const r = f.check(); assert.equal(r.status, 2); assert(codes(r).includes("symlink_or_submodule_not_supported"));
    assert.equal(r.report.findings.length, 0); assert(!r.text.includes(PHRASE));
  } finally { f.cleanup(); }
});

test("PDF extraction output is bounded and extractor failure cannot become clean coverage", () => {
  const f = fixture(); try {
    f.put("slides.pdf", "%PDF-1.7\nfixture"); f.add("slides.pdf");
    const extractor = join(f.directory, "extractor");
    writeFileSync(extractor, '#!/bin/sh\ni=0\nwhile [ "$i" -lt 200 ]; do printf "0123456789"; i=$((i+1)); done\n'); chmodSync(extractor, 0o700);
    const r = f.check("--pdftotext", extractor, "--pdfinfo", extractor, "--max-extracted-bytes", "100");
    assert.equal(r.status, 2); assert(codes(r).some(x => x.startsWith("pdf_extractor_failed") || x === "pdf_extracted_text_limit_exceeded"));
    assert.equal(r.report.files[0].coverage, "failed");
  } finally { f.cleanup(); }
});
