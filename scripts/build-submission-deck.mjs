#!/usr/bin/env node
/**
 * Build the editable take-home deck from its reviewed narrative JSON.
 * Uses the bundled Codex @oai/artifact-tool runtime. No model/API calls.
 * Copy this file into a private build directory with a node_modules link to
 * RUNTIME_NODE_MODULES before execution, or set that variable explicitly.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
function option(name, fallback) {
  const i = args.indexOf(name);
  return i < 0 ? fallback : args[i + 1];
}
const repo = option('--repo', process.cwd());
const contentPath = option('--content', path.join(repo, 'output/submission-2026-09-15/content/deck.json'));
const workspaceDir = option('--work-dir', '/private/tmp/counsel-submission-deck');
const revision = option('--revision', '01');
const runtime = process.env.RUNTIME_ROOT || '/Users/kiteboard/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const modules = process.env.RUNTIME_NODE_MODULES || path.join(runtime, 'node/node_modules');
process.env.RUNTIME_NODE_MODULES = modules;
const runtimePython = process.env.RUNTIME_PYTHON || path.join(runtime, 'python/bin/python3');
const skillDir = process.env.PRESENTATIONS_SKILL_DIR || '/Users/kiteboard/.codex/plugins/cache/openai-primary-runtime/presentations/26.909.12148/skills/presentations';
const runtimeRequire = createRequire(path.join(modules, '_resolver.cjs'));
const { Presentation, PresentationFile } = await import(pathToFileURL(runtimeRequire.resolve('@oai/artifact-tool')).href);
const { resolvePresentationFont, finalizePresentation, applyPresentationChartFont } = await import(pathToFileURL(path.join(skillDir, 'container_tools/artifact_tool_utils.mjs')).href);
const { createCanvas, GlobalFonts } = runtimeRequire('@napi-rs/canvas');
if (!GlobalFonts.families.some(f => f.family === 'Arial')) throw new Error('Arial is unavailable in the supplied runtime');
const family = resolvePresentationFont({ fontFamily: 'Arial' });
const measure = createCanvas(1, 1).getContext('2d');
const colors = { background: '#F6F4ED', navy: '#243866', text: '#28354A', muted: '#667084', rule: '#DBDCD6', teal: '#286B68', risk: '#8D541C', white: '#FFFFFF', light: '#EBEEE9' };
const spec = JSON.parse(await fs.readFile(contentPath, 'utf8'));
const slides = Array.isArray(spec) ? spec : spec.slides;
if (!Array.isArray(slides) || !slides.length) throw new Error('Narrative JSON must contain slides');
const presentation = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const tableOwners = [];
const chartOwners = [];
const staging = path.join(workspaceDir, `build-${revision}`);
const output = path.join(workspaceDir, `final-${revision}`);
await fs.mkdir(staging, { recursive: true });
await fs.mkdir(output, { recursive: true });
const layoutMetadata = [];

function lineCount(text, width, size, bold = false) {
  measure.font = `${bold ? 'bold ' : ''}${size}px ${family}`;
  let lines = 0;
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/)) {
      const test = line ? `${line} ${word}` : word;
      if (line && measure.measureText(test).width > width) { lines++; line = word; } else line = test;
    }
    lines++;
  }
  return lines;
}
function text(slide, value, x, y, w, h, size = 28, settings = {}) {
  const shape = slide.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  shape.text = String(value ?? '');
  shape.text.style = { typeface: family, fontSize: size, color: colors.text, autoFit: 'none', verticalAlignment: 'top', wrap: 'square', insets: { top: 0, right: 0, bottom: 0, left: 0 }, ...settings };
  return shape;
}
function itemText(item) {
  if (typeof item === 'string') return item;
  return [item.heading || item.label || item.title, item.text || item.body || item.description].filter(Boolean).join('\n');
}
function paragraphs(slide, items, x, y, width, availableHeight, opts = {}) {
  const size = opts.size || 29;
  const gap = opts.gap ?? 24;
  const values = (Array.isArray(items) ? items : [items]).filter(Boolean).map(itemText);
  const heights = values.map(value => lineCount(value, width, size) * size * 1.22 + 4);
  const total = heights.reduce((a, b) => a + b, 0) + Math.max(0, values.length - 1) * gap;
  if (total > availableHeight + 1) throw new Error(`Text exceeds allotted height (${Math.round(total)} > ${availableHeight}): ${values[0]}`);
  values.forEach((value, i) => {
    const shape = text(slide, value, x, y, width, heights[i], size, opts.style || {});
    const line = value.split('\n')[0];
    if (value.includes('\n')) shape.text.get(line).bold = true;
    y += heights[i] + gap;
  });
  return y;
}
function nativeTable(slide, source, owner, y = 190, height = 408) {
  const headers = source.headers || source.columns;
  const rows = source.rows || source.values;
  const values = headers ? [headers, ...rows] : rows;
  if (!Array.isArray(values) || !values.length) throw new Error('Empty table');
  const columns = values[0].length;
  if (values.some(row => row.length !== columns)) throw new Error('Non-rectangular table');
  const widths = source.widths || source.columnWidths || Array(columns).fill(1120 / columns);
  const normalized = widths.map(w => 1120 * w / widths.reduce((a, b) => a + b, 0));
  const size = source.fontSize || (columns > 4 ? 23 : 25);
  const rowHeights = values.map((row, i) => Math.max(...row.map((v, c) => lineCount(v, normalized[c] - 28, size, i === 0))) * size * 1.23 + 20);
  const naturalHeight = rowHeights.reduce((a, b) => a + b, 0);
  if (naturalHeight > height + 1) throw new Error(`Table on slide ${owner} needs ${Math.round(naturalHeight)}px, only ${height}px available`);
  const table = slide.tables.add({ rows: values.length, columns, left: 80, top: y, width: 1120, height: naturalHeight, columnWidths: normalized, values });
  table.styleOptions = { headerRow: true, bandedRows: false };
  table.borders.assign({ style: 'solid', fill: colors.rule, width: 0.6 });
  table.cells.block({ row: 0, column: 0, rowCount: values.length, columnCount: columns }).assign({ fill: colors.background, textStyle: { typeface: family, fontSize: size, color: colors.text, bold: false }, margins: { left: 14, right: 14, top: 8, bottom: 8 }, anchor: 'center' });
  table.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: columns }).assign({ fill: colors.navy, textStyle: { typeface: family, fontSize: size, color: colors.white, bold: true } });
  for (let i = 0; i < values.length; i++) table.rows[i].height = rowHeights[i];
  if (source.highlightRows) for (const r of source.highlightRows) table.cells.block({ row: r, column: 0, rowCount: 1, columnCount: columns }).fill = colors.light;
  tableOwners.push(owner);
  return y + naturalHeight;
}

for (const [index, data] of slides.entries()) {
  const slide = presentation.slides.add();
  slide.background.fill = colors.background;
  const number = index + 1;
  const type = data.type || (data.table ? 'table' : data.columns ? 'columns' : index === 0 ? 'cover' : 'body');
  const title = data.title;
  if (!title) throw new Error(`Slide ${number} has no title`);
  const notes = [data.notes, data.sources?.length ? `Sources\n${data.sources.map(s => typeof s === 'string' ? s : `${s.title || s.label || ''}\n${s.url || s.path || ''}`).join('\n\n')}` : ''].filter(Boolean).join('\n\n');
  slide.speakerNotes.textFrame.setText(notes);
  if (type === 'cover') {
    text(slide, data.eyebrow || 'COUNSEL PHYSICIAN AI ENGINEER TAKE-HOME', 80, 54, data.logo ? 900 : 1120, 35, 19, { bold: true, color: colors.muted });
    if (data.logo) slide.images.add({ blob: new Uint8Array(await fs.readFile(path.resolve(repo, data.logo.path))), contentType: 'image/png', alt: data.logo.alt, fit: 'contain', position: { left: 1030, top: 40, width: 170, height: 71 } });
    text(slide, title, 80, 124, 1110, 170, 68, { bold: true, color: colors.navy });
    if (data.subtitle) text(slide, data.subtitle, 84, 325, 1060, 76, 30, { color: colors.text });
    if (data.body) paragraphs(slide, data.body, 84, 415, 1090, 123, { size: 24, gap: 17 });
    if (data.presenter) {
      text(slide, data.presenter.name, 84, 405, 1090, 37, 30, { color: colors.navy, bold: true });
      text(slide, data.presenter.title, 84, 448, 1090, 31, 23);
    }
    if (data.demoLink) {
      text(slide, data.demoLink.url, 84, 492, 1090, 31, 24, { color: colors.teal });
      text(slide, data.demoLink.label, 84, 531, 1090, 26, 18, { color: colors.muted });
    }
    if (data.emphasis) text(slide, data.emphasis, 84, 563, 1080, 70, 27, { color: colors.teal, bold: true });
    if (data.footnote || data.footer) text(slide, data.footnote || data.footer, 84, 646, 1070, 35, 18, { color: colors.muted });
  } else {
    const titleSize = title.length > 65 ? 43 : 47;
    const titleHeight = lineCount(title, 1120, titleSize, true) * titleSize * 1.14 + 8;
    text(slide, title, 80, 51, 1120, titleHeight, titleSize, { bold: true, color: colors.navy });
    let y = Math.max(170, 51 + titleHeight + 27);
    if (data.subtitle) { text(slide, data.subtitle, 80, y, 1120, 68, 24, { color: colors.muted }); y += 79; }
    const bottom = data.emphasis ? 563 : data.footnote || data.takeaway ? 598 : 635;
    if (data.imageLayout === 'historical-architecture') {
      const source = data.images?.[0];
      if (!source || data.images.length !== 1) throw new Error('Architecture layout requires one image');
      slide.images.add({ blob: new Uint8Array(await fs.readFile(path.resolve(repo, source.path))), contentType: source.contentType, alt: source.alt, fit: 'contain', position: { left: 80, top: 136, width: 780, height: 439 } });
      if (data.imageCaption) text(slide, data.imageCaption, 895, 153, 305, 153, 26, { color: colors.teal, bold: true });
      if (data.roadmap) text(slide, data.roadmap, 895, 345, 305, 222, 24);
    } else if (data.imageLayout === 'illustration') {
      if (data.images?.length !== 1 || data.subtitle || data.emphasis) throw new Error('Illustration layout requires one image and no subtitle or emphasis');
      const source = data.images[0];
      const illustration = slide.images.add({
        blob: new Uint8Array(await fs.readFile(path.resolve(repo, source.path))),
        contentType: source.contentType || 'image/jpeg',
        alt: source.alt,
        fit: 'contain',
        position: { left: 80, top: y, width: 1120, height: 420 },
      });
      illustration.lockAspectRatio = true;
      if (data.imageCaption) text(slide, data.imageCaption, 80, y - 38, 1120, 30, 20, { color: colors.muted });
    } else if (data.images) {
      if (data.images.length !== 2 || data.subtitle) throw new Error('Photo layout requires two images and no subtitle');
      const photoWidth = 364;
      const photoHeight = Math.min(352, bottom - y - 42);
      for (const [i, source] of data.images.entries()) {
        const imagePath = path.resolve(repo, source.path);
        const photo = slide.images.add({
          blob: new Uint8Array(await fs.readFile(imagePath)),
          contentType: source.contentType || 'image/jpeg',
          alt: source.alt,
          fit: 'contain',
          position: { left: 80 + i * 388, top: y, width: photoWidth, height: photoHeight },
        });
        photo.lockAspectRatio = true;
      }
      if (data.imageSidebarTitle) text(slide, data.imageSidebarTitle, 870, y, 330, 40, 25, { color: colors.teal, bold: true });
      paragraphs(slide, data.body, 870, y + 49, 330, photoHeight - 49, { size: 23, gap: 22 });
      if (data.imageCaption) text(slide, data.imageCaption, 80, y + photoHeight + 14, 752, 35, 21, { color: colors.muted });
    } else if (data.table) {
      const tableSpec = { ...data.table };
      if (!tableSpec.fontSize) tableSpec.fontSize = data.body ? 23 : 24;
      if (!tableSpec.widths && tableSpec.headers.length === 2) tableSpec.widths = [0.4, 0.6];
      let remainingBody = 0;
      if (data.body) remainingBody = data.body.reduce((total, item) => total + lineCount(itemText(item), 1090, 24) * 24 * 1.22 + 4, 0) + (data.body.length - 1) * 13 + 20;
      const tableBottom = nativeTable(slide, tableSpec, number, y, bottom - y - remainingBody);
      if (data.body) paragraphs(slide, data.body, 80, tableBottom + 20, 1090, bottom - tableBottom - 20, { size: 24, gap: 13 });
    } else if (data.chart) {
      const chart = slide.charts.add(data.chart.type || 'bar', { position: { left: 95, top: y, width: 1090, height: bottom - y }, ...data.chart.options });
      applyPresentationChartFont(chart, { fontFamily: family });
      chartOwners.push(number);
    } else if (type === 'flow') {
      const width = 1120 / data.flow.length;
      data.flow.forEach((stage, i) => {
        text(slide, String(i + 1).padStart(2, '0'), 80 + i * width, y, width - 28, 50, 37, { color: colors.teal, bold: true });
        text(slide, stage, 80 + i * width, y + 60, width - 30, 82, 28, { color: colors.navy, bold: true });
      });
      paragraphs(slide, data.body, 80, y + 185, 1090, bottom - y - 185, { size: 27, gap: 22 });
    } else if (type === 'comparison') {
      data.metrics.forEach((metric, i) => {
        const x = 80 + i * 580;
        text(slide, metric.value, x, y, 530, 125, 96, { color: colors.navy, bold: true });
        text(slide, metric.label, x, y + 140, 520, 85, 28, { color: colors.teal });
      });
      paragraphs(slide, data.body, 80, y + 270, 1090, bottom - y - 270, { size: 28, gap: 20 });
    } else if (data.columns) {
      const gap = 70;
      const width = (1120 - gap * (data.columns.length - 1)) / data.columns.length;
      data.columns.forEach((column, i) => {
        const x = 80 + i * (width + gap);
        const heading = column.heading || column.title || column.label;
        let cy = y;
        if (heading) { text(slide, heading, x, cy, width, 80, 31, { bold: true, color: colors.teal }); cy += 92; }
        paragraphs(slide, column.items || column.bullets || column.body || column.text, x, cy, width, bottom - cy, { size: column.fontSize || data.fontSize || 27, gap: 22 });
      });
    } else {
      paragraphs(slide, data.items || data.bullets || data.body || data.text, 80, y, 1090, bottom - y, { size: data.fontSize || (type === 'prompt' ? 28 : 30), gap: data.gap ?? 26 });
    }
    if (data.emphasis) text(slide, data.emphasis, 80, 584, 1090, data.harm ? 32 : 62, 25, { bold: true, color: data.harm ? colors.risk : colors.teal });
    if (data.harm) text(slide, data.harm, 80, 620, 1090, 32, 23, { color: colors.risk });
    if (data.emphasis && data.footnote) text(slide, data.footnote, 80, data.harm ? 663 : 654, 1060, data.harm ? 34 : 49, 17, { color: colors.muted });
    else if (data.takeaway) text(slide, data.takeaway, 80, 613, 1090, 61, 24, { bold: true, color: colors.teal });
    else if (data.footnote) text(slide, data.footnote, 80, 618, 1060, 54, 18, { color: colors.muted });
  }
  text(slide, String(number).padStart(2, '0'), 1186, 672, 38, 24, 17, { color: colors.muted, alignment: 'right' });
  layoutMetadata.push({ number, type, title });
}

const candidate = path.join(staging, 'candidate.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
const links = slides.flatMap((slide, index) => slide.demoLink ? [{ slide: index + 1, url: slide.demoLink.url }] : []);
if (links.length) {
  // Artifact Tool authors the deck; add the requested native OOXML hyperlinks
  // before the structural validator and final export inspect the package.
  const linked = spawnSync(runtimePython, ['-c', String.raw`
import json,sys,zipfile,xml.etree.ElementTree as ET
file,links=sys.argv[1],json.loads(sys.argv[2])
ns={'a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ET.register_namespace('a',ns['a']);ET.register_namespace('r',ns['r']);ET.register_namespace('p','http://schemas.openxmlformats.org/presentationml/2006/main')
with zipfile.ZipFile(file) as z: entries={i.filename:(i,z.read(i.filename)) for i in z.infolist()}
for link in links:
 name=f"ppt/slides/slide{link['slide']}.xml"; rel=f"ppt/slides/_rels/slide{link['slide']}.xml.rels"
 root=ET.fromstring(entries[name][1]); runs=[r for r in root.findall('.//a:r',ns) if r.find('a:t',ns) is not None and r.find('a:t',ns).text==link['url']]
 assert len(runs)==1, 'Expected one exact visible URL'
 props=runs[0].find('a:rPr',ns)
 if props is None: props=ET.Element('{'+ns['a']+'}rPr');runs[0].insert(0,props)
 rid='rIdLocalDemo';ET.SubElement(props,'{'+ns['a']+'}hlinkClick',{'{'+ns['r']+'}id':rid})
 relationships=ET.fromstring(entries[rel][1]); uri='http://schemas.openxmlformats.org/package/2006/relationships'
 assert all(x.attrib.get('Id')!=rid for x in relationships)
 ET.SubElement(relationships,'{'+uri+'}Relationship',{'Id':rid,'Type':ns['r']+'/hyperlink','Target':link['url'],'TargetMode':'External'})
 entries[name]=(entries[name][0],ET.tostring(root,encoding='utf-8',xml_declaration=True));entries[rel]=(entries[rel][0],ET.tostring(relationships,encoding='utf-8',xml_declaration=True))
with zipfile.ZipFile(file,'w') as z:
 for info,data in entries.values():z.writestr(info,data)
`, candidate, JSON.stringify(links)], { encoding: 'utf8', timeout: 30000 });
  if (linked.status !== 0) throw new Error(`Native hyperlink creation failed: ${linked.stderr || linked.stdout}`);
}
const finalPath = path.join(output, 'counsel-disposition-take-home.pptx');
await finalizePresentation({
  workspaceDir, candidatePath: candidate, finalPath,
  pythonExecutable: runtimePython,
  integrityValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath: path.join(skillDir, 'container_tools/inspect_presentation_layout_geometry.py'),
  explicitTotalSlideCount: slides.length,
  requiredNativeTableOwnerSlides: tableOwners,
  requiredNativeChartOwnerSlides: chartOwners,
  materializeLiteralChartWorkbooks: chartOwners.length > 0,
  layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-heading-fit', '--validate-bullet-geometry', ...tableOwners.flatMap(n => ['--require-native-table-slide', String(n)])],
  fontPolicy: { basis: 'design', families: [family] },
  verifyArtifactToolImport: true,
  receiptPath: path.join(staging, 'validation.json'),
});
await fs.writeFile(path.join(staging, 'slide-index.json'), JSON.stringify(layoutMetadata, null, 2));
const previews = path.join(staging, 'previews');
await fs.mkdir(previews, { recursive: true });
for (let i = 0; i < slides.length; i++) {
  const slide = presentation.slides.getItem(i);
  const png = await presentation.export({ slide, format: 'png', scale: 1 });
  await fs.writeFile(path.join(previews, `slide-${String(i + 1).padStart(2, '0')}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await slide.export({ format: 'layout' });
  await fs.writeFile(path.join(previews, `slide-${String(i + 1).padStart(2, '0')}.json`), await layout.text());
}
const soffice = process.env.RUNTIME_SOFFICE || path.join(runtime, 'bin/override/soffice');
const profile = path.join(staging, 'lo-profile');
const converted = spawnSync(soffice, [`-env:UserInstallation=${pathToFileURL(profile).href}`, '--headless', '--convert-to', 'pdf', '--outdir', output, finalPath], { encoding: 'utf8', timeout: 120000 });
if (converted.status !== 0) throw new Error(`PDF conversion failed: ${converted.stderr || converted.stdout}`);
const pdfPath = finalPath.replace(/\.pptx$/, '.pdf');
await fs.access(pdfPath);
console.log(JSON.stringify({ finalPath, pdfPath, previews, receipt: path.join(staging, 'validation.json'), slides: slides.length, tableOwners, chartOwners }, null, 2));
