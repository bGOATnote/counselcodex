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


function compressedFixture(f, path, options) {
  const code = `import base64,gzip,io,json,sys,tarfile
x=json.load(sys.stdin)
if 'members' in x:
 b=io.BytesIO()
 with tarfile.open(fileobj=b,mode='w',format=tarfile.PAX_FORMAT) as t:
  for m in x['members']:
   i=tarfile.TarInfo(m['name']); d=base64.b64decode(m['base64']) if 'base64' in m else m.get('text','').encode(); i.size=len(d)
   if m.get('link'): i.type=tarfile.SYMTYPE; i.linkname=m['link']; i.size=0
   if m.get('device'): i.type=tarfile.CHRTYPE; i.size=0
   if m.get('pax'): i.pax_headers=m['pax']
   t.addfile(i,io.BytesIO(d))
 data=b.getvalue()
else: data=x.get('text','').encode()
b=io.BytesIO()
with gzip.GzipFile(fileobj=b,mode='wb',filename=x.get('filename','')) as g: g.write(data)
raw=b.getvalue()
if x.get('truncate'): raw=raw[:-6]
if x.get('concat'): raw+=gzip.compress(b'hidden extra')
open(x['path'],'wb').write(raw)
`;
  const r = run("python3", ["-c", code], { input: JSON.stringify({ path: join(f.repo, path), ...options }) });
  assert.equal(r.status, 0, r.stderr); f.add(path);
}

test("root Office relationships and embedded SVG text/attributes are inspected", () => {
  const f = fixture(); try {
    f.office("slides.pptx", {
      "_rels/.rels": '<Relationships><Relationship Target="Fixture Orchard"/></Relationships>',
      "ppt/media/image.svg": '<svg xmlns="http://www.w3.org/2000/svg"><text><tspan>Fixture</tspan><tspan>Orchard</tspan></text></svg>',
    }); f.add("slides.pptx");
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.errors.length, 0);
    assert.equal(r.report.files[0].extraction.xmlMembersScanned, 3); assert.equal(r.report.findings.length, 2);
    assert(r.report.warnings.some(x => x.code === "svg_visual_content_not_ocr_scanned")); assert(!r.text.includes(PHRASE));
  } finally { f.cleanup(); }
});

test("gzip JSON decoding and original filename metadata detect configured phrases", () => {
  const f = fixture(); try {
    compressedFixture(f, "payload.json.gz", { text: '{"name":"Fixture \\u004frchard"}' });
    compressedFixture(f, "metadata.txt.gz", { text: 'safe', filename: 'Fixture Orchard.txt' });
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.findings.length, 2);
    assert(r.report.files.every(x => x.extraction.metadataScanned)); assert(!r.text.includes(PHRASE));
  } finally { f.cleanup(); }
});

test("tar gzip inspects file contents, member names and PAX metadata without disk extraction", () => {
  const f = fixture(); try {
    compressedFixture(f, "source.tar.gz", { members: [
      { name: 'source/file.json', text: '{"author":"Fixture Orchard"}' },
      { name: 'Fixture Orchard.txt', text: 'safe' },
      { name: 'meta.txt', text: 'safe', pax: { comment: 'Fixture Orchard' } },
    ] });
    const r = f.check(); assert.equal(r.status, 1); assert.equal(r.report.errors.length, 0);
    assert.equal(r.report.files[0].extraction.filesScanned, 3); assert.equal(r.report.findings.length, 3);
    assert(!r.text.includes(PHRASE));
  } finally { f.cleanup(); }
});

test("compressed artifacts reject malformed streams, concatenation, traversal, links and nested archives", () => {
  const f = fixture(); try {
    const cases = [
      [{ text: 'safe', truncate: true }, 'truncated_gzip'],
      [{ text: 'safe', concat: true }, 'concatenated_or_trailing_gzip_data'],
      [{ text: 'not a tar archive' }, 'invalid_tar'],
      [{ members: [{ name: '../escape.txt', text: 'safe' }] }, 'unsafe_archive_member_path'],
      [{ members: [{ name: 'link.txt', link: 'target.txt' }] }, 'archive_links_devices_or_sparse_not_supported'],
      [{ members: [{ name: 'nested.zip', text: 'safe' }] }, 'nested_or_unsupported_archive'],
      [{ members: [{ name: 'device', device: true }] }, 'archive_links_devices_or_sparse_not_supported'],
      [{ members: [{ name: 'same.txt', text: 'one' }, { name: 'same.txt', text: 'two' }] }, 'duplicate_archive_members'],
    ];
    for (const [options, expected] of cases) {
      compressedFixture(f, 'check.tar.gz', options);
      const r = f.check(); assert.equal(r.status, 2); assert(codes(r).includes(expected), `${expected}: ${JSON.stringify(codes(r))}`);
    }
    compressedFixture(f, 'check.tar.gz', { members: [{ name: '.env', text: 'safe' }] });
    const p = f.check(); assert.equal(p.status, 1); assert(p.report.findings.some(x => x.code === 'forbidden_publication_path'));
  } finally { f.cleanup(); }
});

test("gzip expansion and tar member limits remain enforced", () => {
  const f = fixture(); try {
    compressedFixture(f, 'large.json.gz', { text: 'x'.repeat(1000) });
    const r = f.check('--max-archive-bytes', '100'); assert.equal(r.status, 2); assert(codes(r).includes('archive_expansion_limit_exceeded'));
    compressedFixture(f, 'large.json.gz', { text: '{}' });
    compressedFixture(f, 'source.tar.gz', { members: [{ name: 'large.txt', text: 'x'.repeat(500) }] });
    const m = f.check('--max-member-bytes', '100'); assert.equal(m.status, 2); assert(codes(m).includes('archive_expansion_limit_exceeded'));
  } finally { f.cleanup(); }
});


test("archive processing has a wall-clock deadline, independently of byte limits", () => {
  const code = `import runpy,sys,time
from types import SimpleNamespace
m=runpy.run_path(sys.argv[1])
g=m['Guard'](SimpleNamespace(pdftotext='pdftotext',pdfinfo='pdfinfo',extract_timeout=1))
try:
 with g.archive_timeout(): time.sleep(3)
except m['CheckError'] as e:
 print(str(e))
else: raise AssertionError('deadline did not fire')`;
  const r = run("python3", ["-c", code, SCRIPT]);
  assert.equal(r.status, 0); assert.equal(r.stdout.trim(), "archive_processing_timed_out"); assert.equal(r.stderr, "");
});


test("Office ZIP container/member comments are scanned and binary extra fields remain disclosed", () => {
  const f = fixture(); try {
    f.office('comments.pptx', {});
    const code = `import sys,zipfile
p=sys.argv[1]
with zipfile.ZipFile(p,'a') as z:
 z.comment=b'Fixture Orchard'
 i=zipfile.ZipInfo('docProps/core.xml'); i.comment=b'Fixture Orchard'; i.extra=bytes([153,153,1,0,120]); z.writestr(i,'<root/>')`;
    const z = run('python3',['-c',code,join(f.repo,'comments.pptx')]); assert.equal(z.status,0,z.stderr); f.add('comments.pptx');
    const r=f.check(); assert.equal(r.status,1); assert.equal(r.report.findings.length,2); assert(!r.text.includes(PHRASE));
    const file=r.report.files[0]; assert.equal(file.extraction.containerCommentScanned,true); assert.equal(file.extraction.memberCommentsScanned,1);
    assert.equal(file.extraction.extraFieldBytesNotDecoded,10); assert.equal(file.extraction.centralDirectoryExtraBytes,5); assert.equal(file.extraction.localHeaderExtraBytes,5); assert.equal(file.extraction.arbitraryBinaryMetadataDecoded,false);
    assert.equal(file.coverage,'scanned_with_manual_review'); assert(r.report.warnings.some(x=>x.code==='zip_extra_fields_not_decoded'));
  } finally { f.cleanup(); }
});

test("SVG inside gzip and TAR keeps manual visual-review coverage on the containing artifact", () => {
  const f=fixture(); try {
    compressedFixture(f,'figure.svg.gz',{text:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'});
    compressedFixture(f,'source.tar.gz',{members:[{name:'figure.svg',text:'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'}]});
    const r=f.check(); assert.equal(r.status,0); assert.equal(r.report.warnings.length,2);
    assert(r.report.files.every(x=>x.coverage==='scanned_with_manual_review' && x.extraction.manualReviewRequired));
    assert.equal(r.report.coverage.ocrPerformed,false);
  } finally { f.cleanup(); }
});


function appleDouble(attributes) {
  const encoded = attributes.map(([name, value]) => ({ name: Buffer.from(name + '\0'), value: Buffer.isBuffer(value) ? value : Buffer.from(value) }));
  const dataStart = 120 + encoded.reduce((sum, a) => sum + ((11 + a.name.length + 3) & ~3), 0);
  const total = dataStart + encoded.reduce((sum, a) => sum + a.value.length, 0);
  const data = Buffer.alloc(total);
  data.writeUInt32BE(0x00051607, 0); data.writeUInt32BE(0x00020000, 4); data.writeUInt16BE(2, 24);
  data.writeUInt32BE(9, 26); data.writeUInt32BE(50, 30); data.writeUInt32BE(total - 50, 34);
  data.writeUInt32BE(2, 38); data.writeUInt32BE(total, 42);
  data.write('ATTR', 84); data.writeUInt32BE(total, 92); data.writeUInt32BE(dataStart, 96); data.writeUInt32BE(total - dataStart, 100); data.writeUInt16BE(encoded.length, 118);
  let cursor=120, offset=dataStart;
  for(const a of encoded) {
    data.writeUInt32BE(offset,cursor); data.writeUInt32BE(a.value.length,cursor+4); data.writeUInt8(a.name.length,cursor+10); a.name.copy(data,cursor+11); a.value.copy(data,offset);
    cursor += (11+a.name.length+3)&~3; offset += a.value.length;
  }
  return data;
}

test("AppleDouble parses known ATTR layout, scans textual metadata, and rejects opaque payloads", () => {
  const f=fixture(); try {
    f.put('._fixture',appleDouble([['com.apple.provenance',Buffer.alloc(11)],['com.example.comment',PHRASE]])); f.add('._fixture');
    const r=f.check(); assert.equal(r.status,2); assert(codes(r).includes('opaque_appledouble_attribute')); assert.equal(r.report.findings.length,1);
    assert(!r.text.includes(PHRASE)); assert.equal(r.report.files[0].extraction.attributesInspected,2); assert.equal(r.report.files[0].coverage,'partial');
    assert.equal(r.report.errors.find(x=>x.code==='opaque_appledouble_attribute').attributeType,'apple_provenance');
    f.put('._fixture',appleDouble([['com.example.comment',PHRASE]])); f.add('._fixture');
    const t=f.check(); assert.equal(t.status,1); assert.equal(t.report.errors.length,0);
  } finally { f.cleanup(); }
});

test("AppleDouble rejects malformed version, entry overlap, attribute ranges and hidden padding", () => {
  const f=fixture(); try {
    const mutations=[
      b=>b.writeUInt32BE(3,4),
      b=>{b.writeUInt32BE(51,42);b.writeUInt32BE(1,46);},
      b=>b.writeUInt32BE(119,120),
      b=>b.writeUInt32BE(0xffffffff,124),
      b=>b.writeUInt32BE(1,104),
      b=>b.writeUInt16BE(4097,118),
    ];
    for(const mutate of mutations) {
      const b=appleDouble([['com.example.comment','safe']]); mutate(b); f.put('._fixture',b);f.add('._fixture');
      const r=f.check(); assert.equal(r.status,2); assert.equal(r.report.files[0].coverage,'failed');
      assert(r.report.errors.some(x=>x.code.includes('appledouble')));
    }
    f.put('._fixture','ordinary opaque sidecar'); f.add('._fixture'); assert.equal(f.check().status,2);
  } finally { f.cleanup(); }
});

test("opaque AppleDouble attributes do not hide later text attributes or regular TAR files", () => {
  const f=fixture(); try {
    compressedFixture(f,'source.tar.gz',{members:[
      {name:'._source',base64:appleDouble([['com.apple.provenance',Buffer.alloc(11)],['com.example.comment',PHRASE]]).toString('base64')},
      {name:'source/message.txt',text:PHRASE},
      {name:'source/safe.txt',text:'safe'},
    ]});
    const r=f.check(); assert.equal(r.status,2); assert.equal(r.report.findings.length,2);assert(!r.text.includes(PHRASE));
    const e=r.report.files[0].extraction; assert.equal(e.regularMemberInspectionComplete,true);assert.equal(e.filesInspected,3);assert.equal(e.filesScanned,2);assert.equal(e.metadataFilesInspected,1);assert.equal(e.unsupportedMembers,1);
  } finally { f.cleanup(); }
});


test("AppleDouble attribute names are inspected even when the corresponding payload is opaque", () => {
  const f=fixture(); try {
    f.put('._fixture',appleDouble([[PHRASE,Buffer.alloc(3)]]));f.add('._fixture');
    const r=f.check();assert.equal(r.status,2);assert.equal(r.report.findings.length,1);assert(!r.text.includes(PHRASE));
    assert(codes(r).includes('opaque_appledouble_attribute'));
  } finally {f.cleanup();}
});

test("archive deadline errors propagate through per-member and metadata recovery", () => {
  const code = `import base64,io,runpy,sys,tarfile
from types import SimpleNamespace
m=runpy.run_path(sys.argv[1])
args=SimpleNamespace(pdftotext='pdftotext',pdfinfo='pdfinfo',max_archive_entries=10,max_member_bytes=1024,max_archive_bytes=4096)
def timeout(*args): raise m['CheckError']('archive_processing_timed_out')
buffer=io.BytesIO()
with tarfile.open(fileobj=buffer,mode='w') as archive:
 for name in ('first.txt','second.txt'):
  member=tarfile.TarInfo(name); member.size=4
  archive.addfile(member,io.BytesIO(b'safe'))
for operation in ('tar','appledouble'):
 guard=m['Guard'](args)
 if operation=='tar':
  guard.member_content=timeout
  inspect=lambda:guard.tar_content(buffer.getvalue(),'source.tar')
 else:
  guard.metadata_text=timeout
  inspect=lambda:guard.appledouble(base64.b64decode(sys.argv[2]),'._source')
 try: inspect()
 except m['CheckError'] as error: assert str(error)=='archive_processing_timed_out'
 else: raise AssertionError(operation+' swallowed deadline')
 assert not guard.errors
print('both deadlines propagated')`;
  const r = run("python3", ["-c", code, SCRIPT, appleDouble([['com.example.comment','safe']]).toString('base64')], { timeout: 5000 });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "both deadlines propagated"); assert.equal(r.stderr, "");
});
