import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { resolveDeckCaseLabels } from './deck-case-mapping.mjs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Presentation-only runtime. Do not add these dependencies to the clinical app.
const { RUNTIME_NODE_MODULES, PRESENTATION_SKILL_DIR: skill, RUNTIME_PYTHON: python } = process.env;
if (!RUNTIME_NODE_MODULES || !skill || !python) throw new Error('Use the bundled presentation runtime paths.');
const requireRuntime = createRequire(path.join(RUNTIME_NODE_MODULES, 'package.json'));
const { Presentation, PresentationFile, FileBlob } = await import(pathToFileURL(requireRuntime.resolve('@oai/artifact-tool')));
const { resolvePresentationFont, finalizePresentation, makeNativeBulletParagraphs } = await import(pathToFileURL(path.join(skill, 'container_tools/artifact_tool_utils.mjs')));
const root = path.resolve(process.env.COUNSEL_REPO_DIR ?? process.cwd());
const output = path.join(root, 'output/presentation');
await fs.mkdir(path.join(root, '.build'), { recursive: true });
const work = await fs.mkdtemp(path.join(root, '.build/presentation-continuation-'));
const font = resolvePresentationFont();
const p = Presentation.create({ slideSize: { width: 1280, height: 720 } });
const cream = '#F7F4EB', navy = '#243866', ink = '#252D31', muted = '#586469', rule = '#C7CECF';
const sourcePaths = [
  'docs/CONTINUATION_VERIFICATION_2026-09-14.md',
  'docs/CURRENT_PIPELINE.md',
  'docs/CLINICAL_DISPOSITION_POLICY.md',
  'docs/PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md',
  'outputs/continuation-gui-2026-09-14/capture-final/summary.json',
  'outputs/continuation-gui-2026-09-14/capture-end8/summary.json',
  'outputs/safety-serialization-v22-live-2026-09-14/summary.json',
  'outputs/grounding-first-plan-2026-09-14/summary.json',
  'src/disposition/clinical-graph.ts',
  'src/disposition/graph-prompts.ts',
  'apps/evaluation/public/counsel-symbol.svg',
  'data/patient_messages.csv',
  'output/presentation/deck-case-mapping.mjs',
];
const sources = await Promise.all(sourcePaths.map(async relative => {
  const bytes = await fs.readFile(path.join(root, relative));
  return { path: relative, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}));
const gui = JSON.parse(await fs.readFile(path.join(root, sourcePaths[4]), 'utf8'));
const end = JSON.parse(await fs.readFile(path.join(root, sourcePaths[5]), 'utf8'));
const serialization = JSON.parse(await fs.readFile(path.join(root, sourcePaths[6]), 'utf8'));
const grounding = JSON.parse(await fs.readFile(path.join(root, sourcePaths[7]), 'utf8'));
if (gui.attempts !== 7 || gui.complete !== 7 || gui.rows.some(r => r.version !== 'evidence-graph/v22')) throw new Error('Unexpected locked GUI window. Reconcile content before building.');
if (grounding.calls !== 16 || grounding.byArm.baseline.releaseEligible !== 3 || grounding.byArm.grounding_first.releaseEligible !== 0) throw new Error('Reconcile completed grounding study.');
if (end.attempts !== 9 || end.complete !== 9 || !end.capacityExceeded) throw new Error('Reconcile later run-window deviation.');

function text(s, value, x, y, w, h, size = 25, color = ink, bold = false) {
  const shape = s.shapes.add({ geometry: 'textbox', position: { left: x, top: y, width: w, height: h }, fill: 'none', line: { fill: 'none', width: 0 } });
  shape.text = value;
  shape.text.style = { typeface: font, fontSize: size, color, bold, autoFit: 'none' };
  return shape;
}
function slide(title, subtitle, notes) {
  const s = p.slides.add(); s.background.fill = cream;
  text(s, title, 64, 45, 1152, 70, 44, navy, true);
  if (subtitle) text(s, subtitle, 64, 130, 1152, 64, 25, muted);
  text(s, String(p.slides.items.length), 1165, 673, 45, 24, 16, muted);
  s.speakerNotes.textFrame.setText(notes);
  return s;
}
function table(s, values, widths, y, h, size = 24) {
  const t = s.tables.add({ rows: values.length, columns: values[0].length, left: 64, top: y, width: 1152, height: h, columnWidths: widths, values });
  t.cells.block({ row: 0, column: 0, rowCount: values.length, columnCount: values[0].length }).assign({ fill: cream, textStyle: { typeface: font, fontSize: size, color: ink }, margins: { left: 13, right: 13, top: 9, bottom: 9 } });
  t.cells.block({ row: 0, column: 0, rowCount: 1, columnCount: values[0].length }).assign({ fill: navy, textStyle: { typeface: font, fontSize: size, bold: true, color: '#FFFFFF' } });
  t.borders.assign({ style: 'solid', fill: rule, width: 0.7 });
  return t;
}
function bullets(s, items, y, h, size = 29) {
  const shape = text(s, '', 64, y, 1152, h, size);
  shape.text = makeNativeBulletParagraphs(items, { marginLeftPoints: 21, hangingPoints: 10, spaceAfterPoints: 20 });
  return shape;
}
function seconds(ms) { return ms == null ? 'None issued' : `${(ms / 1000).toFixed(1)} s`; }
const route = r => ({ SELF_CARE: 'Self care', EMERGENCY_NOW: 'Emergency now', SAME_DAY_IN_PERSON: 'In-person today' }[r.disposition] ?? (r.reviewPriority === 'priority' ? 'Priority async' : 'Standard async'));

let s = p.slides.add(); s.background.fill = cream;
s.images.add({ blob: new Uint8Array(await fs.readFile(path.join(root, 'apps/evaluation/public/counsel-symbol.svg'))), contentType: 'image/svg+xml', alt: 'Counsel C symbol', fit: 'contain', position: { left: 66, top: 65, width: 70, height: 71.4 } });
text(s, 'Evidence-based\ndisposition', 64, 220, 1135, 185, 72, navy, true);
text(s, 'Physician AI Engineer take-home', 67, 445, 1080, 52, 32, ink);
text(s, 'Candidate v22\n14 September 2026', 67, 571, 1080, 68, 24, muted);
s.speakerNotes.textFrame.setText('Independent take-home prototype informed by Counsel public work. The clinical scope is triage and thread routing with an evidence-linked reply. This is not an official Counsel service, prescribing system, dispatch integration or claim of production clinical readiness. Original C logo asset: apps/evaluation/public/counsel-symbol.svg, preserved with its original proportions. The deck describes candidate evidence-graph/v22. Historical incumbent results are not current-candidate validation.');

s = slide('Five routes and their clinical boundaries', 'Refill is a work type. Urgency determines queue priority and care setting.', 'Sources: docs/CLINICAL_DISPOSITION_POLICY.md and docs/CURRENT_PIPELINE.md. These are the physician-selected development policy definitions, not an assertion about Counsel private service-level guarantees. Async destinations are Counsel clinician handoff stubs. Service availability is unconnected. Priority and Standard are both async clinician routes. Emergency transport can be new EMS activation, continuation of explicitly active EMS, or immediate ED attendance.');
table(s, [
  ['Route', 'Decision boundary'],
  ['Self care', 'Guidance only. No current clinician task.'],
  ['Priority async', 'Time-sensitive Counsel clinician assessment or prescribing.'],
  ['Standard async', 'Lower queue priority during available service hours.'],
  ['In-person today', 'Physical examination, testing or treatment needed today.'],
  ['Emergency now', 'Immediate EMS or ED care. Preserve active EMS response.'],
], [340, 812], 219, 360);
text(s, 'Both async routes have a prompt same-day target, subject to real availability.\nThe prototype does not send, book or guarantee a clinician response.', 64, 601, 1152, 66, 24, navy);

s = slide('Mastra orchestration', 'Safety and context begin in parallel. Retrieval and review have separate responsibilities.', 'Sources: docs/CURRENT_PIPELINE.md; src/disposition/clinical-graph.ts; src/disposition/graph-prompts.ts. Haiku safety and context, Opus producer, Astra judge. Normally four calls, six with one repair. Confirmed failures can add bounded recovery calls, which are retained. Optional upgrade graph is shadow-only and disabled here. No original CSV label or physician reference enters the producer prompts. Public inspiration: https://mastra.ai/customers/counsel-health and https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges. This is our design, not a reproduction of private Counsel topology or performance.');
table(s, [
  ['Component', 'Input', 'Responsibility'],
  ['Haiku safety', 'Patient and updates', 'Typed early care and exact quoted basis'],
  ['Haiku context', 'Patient and updates', 'Attributed facts and retrieval queries'],
  ['Evidence layer', 'Queries and sources', 'Hybrid PostgreSQL and vector retrieval'],
  ['Opus producer', 'Patient and passages', 'Disposition, reply and cited claims'],
  ['Astra judge', 'Exact draft and evidence', 'Review and scoped repair feedback'],
], [256, 343, 553], 221, 360, 24);
text(s, 'Early action is model-derived with standard rendering. It is not a cached case answer.\nThe independent producer does not inherit the early route or reference label.', 64, 603, 1152, 65, 24, navy);

s = slide('Care preservation when an explanation fails', 'Preserved care must retain its exact input and decision provenance.', 'Sources: docs/CURRENT_PIPELINE.md; docs/CONTINUATION_VERIFICATION_2026-09-14.md; src/disposition/clinical-graph.ts; apps/evaluation/lib/preserved-care.ts. Hash consistency is not clinical truth or resistance to a malicious server fabricating all records. Failure preservation was exercised with deterministic injected faults, separate from current live complete runs. Stronger independently reviewed care may survive failed repair only with matching patient, producer, evidence, patch and judge bindings. Rejected prose/citations are never copied. Later adverse care review and cancellation cannot borrow an older approval. Live streaming of newly reviewed care before a still-running patch completes is not yet implemented. Current 600-second allowance is an engineering bound, not a clinical response target.');
table(s, [
  ['Condition', 'Permitted result'],
  ['Admitted early action', 'Keep the instruction visible if generation fails.'],
  ['Stronger care independently reviewed', 'Carry forward only with exact current bindings.'],
  ['Rejected care, stale review or cancellation', 'No new recommendation from an old approval.'],
  ['Failed explanation or citations', 'Do not attach rejected content to preserved care.'],
], [505, 647], 219, 319, 24);
text(s, 'Run journals and Mastra spans retain outputs, failures, source identity and timing.\nThese are tested consistency controls, not HIPAA certification or clinical validation.', 64, 571, 1152, 83, 25, navy);

s = slide('Reference agreement and candidate evidence', 'The original labels, physician review and current candidate answer different questions.', 'Sources: docs/PHYSICIAN_REVIEW_SCORECARD_2026-09-13.md; data/evaluation/physician-system-reference-v2.json; outputs/continuation-gui-2026-09-14/capture-final/summary.json; capture-end8/summary.json. Physician-engineer reported reviewing all 50 incumbent outputs after iterative development, agreeing with 49 and qualifying C25 DVT as defensible alternative/over-escalation concern. This is an attributable development reference, not independent held-out truth. First seven controlled v22 GUI runs comprise four original cohort inputs (C30,C02,C50,C04) and three off-cohort updates. All-window later capture has five exact eligible cohort targets out of 49, with 45/50 originals unattempted including qualified C25. The fifth original is an unattributed C01 run, not part of the controlled operator sequence. The later C02 retest adds no new original-case coverage. No new physician criterion attestation is inferred.');
table(s, [
  ['Evidence', 'What it supports'],
  ['Counsel original 50 labels', 'An unchanged baseline to audit.'],
  ['Physician-reviewed incumbent', '49 agreements and one qualified DVT judgment.'],
  ['Controlled v22 GUI window', 'Four original cases and three follow-up tests.'],
  ['Independent clinical validation', 'Not yet performed on new, blinded cases.'],
], [425, 727], 221, 324, 24);
text(s, 'Exact agreement, defensible alternatives, missed emergencies and unnecessary escalation\nremain distinct outcomes. Current model approval is not physician approval.', 64, 589, 1152, 77, 25, navy);

const guiRuns = await Promise.all(gui.rows.map(async row => {
  const bytes = await fs.readFile(path.join(root, 'outputs/continuation-gui-2026-09-14/capture-final/runs', `${row.runId}.json`));
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== row.runSHA256) throw new Error(`Changed captured run ${row.runId}`);
  const run = JSON.parse(bytes);
  if (run.runId !== row.runId || run.inputHash !== row.inputHash) throw new Error(`Run identity mismatch ${row.runId}`);
  return run;
}));
const caseLabels = resolveDeckCaseLabels(await fs.readFile(path.join(root, 'data/patient_messages.csv'), 'utf8'), guiRuns);
const labels = caseLabels.map(item => item.label);
s = slide('Seven controlled GUI assessments', 'All seven completed. Four required a repair before final release.', `Sources: outputs/continuation-gui-2026-09-14/capture-final/summary.json and matching raw runs/events. Locked observed window ${gui.from} to ${gui.until}. All seven v22 completed and had persisted trace and event log. Every run remains clinicalApproval=false. Displayed seconds are rounded server events, not browser paint. No early action means none issued, not a low-risk classification. C04 emitted a question at 9.518 seconds, not an early care instruction. C02 first early instruction was delayed 9.423 seconds. Later controlled C02 retest 673b7b70-4c56-4838-9218-c9667610912a: early 10.283s and final63.580s, one patientMessage patch. Extended capture contains nine starts: eight controlled plus actor-unattributed C01 822e69ce-65e2-4810-9e4e-64e86ef9b4eb. CapacityExceeded=true relative to max8 is retained. No later attempts omitted from source report. These selected sequential rehearsals do not establish clinical readiness, a general latency distribution or 50-case validation.`);
table(s, [['Input', 'Final care', 'Early action', 'Final answer'], ...gui.rows.map((r, i) => [labels[i], route(r), seconds(r.earlyActionMs), seconds(r.durationMs)])], [329, 319, 253, 251], 205, 400, 23);
text(s, 'Later C02 retest: 10.3 s early, 63.6 s final. One unattributed C01 start is retained separately.\nThe extended nine-start window exceeded the planned eight-run count.', 64, 637, 1090, 58, 19, muted);

s = slide('Two prompt optimizations were not promoted', 'Fixed-input experiments retained negative outcomes and every failed attempt.', 'Sources: outputs/safety-serialization-v22-live-2026-09-14/manifest.json and summary.json; outputs/grounding-first-plan-2026-09-14/manifest.json and summary.json. Serialization: 12 authored cases, two trials each, full unchanged safety schema and canonical admission, AB/BA scheduling, 48 complete calls, no transport/admission failures. Baseline action+transport target24/24 versus succinct23/24. Target miss is internal Standard async on C30 hypothetical, not demonstrated patient-facing overtriage. Succinct also invented a two-day duration in an unselected basis. Paired median latency difference is -97 ms; marginal medians are not that paired effect. Grounding-first: four selected fixed producer/evidence inputs, one sample each arm, 8 producers+8 judges. Baseline3/4 release-eligible versus candidate0/4; candidate one judge-contract failure. Producer medians17.131s versus17.090s, producer+judge medians37.847s versus37.342s including the failed review. Both are development experiments, not held-out clinical accuracy. Action-only matching and model acceptance are incomplete endpoints.');
table(s, [
  ['Experiment', 'Observed result', 'Decision'],
  ['Succinct safety\n48 calls', 'Action targets 24/24 vs 23/24.\nPaired median gain only 0.097 s.', 'Keep full prompt.\nInternal grounding defects remain.'],
  ['Grounding-first producer\n16 calls', 'Release-eligible 3/4 vs 0/4.\nOne candidate review failed.', 'Keep baseline.\nNo demonstrated benefit.'],
], [348, 459, 345], 223, 287, 24);
text(s, 'Neither faster text nor a passed action label establishes safer routing.\nThe next comparison must measure errors corrected and introduced in the full workflow.', 64, 559, 1152, 90, 27, navy);

s = slide('Release gaps and the next clinical proof', 'The main remaining burden is a reliable, concise answer with demonstrable clinical benefit.', 'Sources: docs/CONTINUATION_VERIFICATION_2026-09-14.md; docs/CURRENT_PIPELINE.md; current immutable GUI and fixed study artifacts. Strategic priorities are recommendations from the observed defects, not assertions about what any specific interviewer privately expects. Public context: https://www.counselhealth.com/blog/the-importance-of-practicality-in-medical-ai and https://www.counselhealth.com/blog/scaling-clinical-quality-assurance-with-ai-judges. Judge calibration must include false release and false withholding, materiality, action necessity, feasible actor, source entailment and patient grounding. Prospective validation needs independent physician adjudication on unseen cases with allowable alternatives and original failures retained. Clinic delivery, scheduling and follow-up integrations remain stubs. No current clinical readiness or end-to-end agent-lift claim.');
bullets(s, [
  'Reduce C02’s time to early action and the review/repair delay without weakening context checks.',
  'Calibrate the judge on missed contradictions, unnecessary care burden and false withholding.',
  'Compare a simpler baseline on new physician-adjudicated cases, with the same evidence and sampling.',
  'Report emergency misses, over-escalation, claim support, all-attempt latency and unfinished runs.',
], 234, 340, 29);
text(s, 'Independent clinical accuracy and net agent benefit remain unproven.', 64, 631, 1152, 41, 25, navy);

const candidate = path.join(work, 'candidate-r4b.pptx');
await (await PresentationFile.exportPptx(p)).save(candidate);
const final = path.resolve(root, process.env.DECK_OUTPUT_FILE ?? 'output/presentation/counsel-disposition-current-2026-09-14-r4b-verified.pptx');
const receipt = path.join(work, 'validation-r4b.json');
await finalizePresentation({ explicitTotalSlideCount: 8, workspaceDir: root, candidatePath: candidate, finalPath: final, pythonExecutable: python, integrityValidatorPath: path.join(skill, 'container_tools/inspect_presentation_package_integrity.py'), layoutValidatorPath: path.join(skill, 'container_tools/inspect_presentation_layout_geometry.py'), layoutArgs: ['--expected-slide-size-emu', '12192000,6858000', '--validate-bullet-geometry', '--validate-heading-fit', '--cover-role', 'cover', ...[2, 3, 4, 5, 6, 7].flatMap(n => ['--require-native-table-slide', String(n)])], requiredNativeTableOwnerSlides: [2, 3, 4, 5, 6, 7], fontPolicy: { basis: 'design', families: [font] }, verifyArtifactToolImport: true, receiptPath: receipt });
const imported = await PresentationFile.importPptx(await FileBlob.load(final));
const renders = path.join(work, 'final-renders'); await fs.mkdir(renders);
for (const [i, item] of imported.slides.items.entries()) {
  const png = await imported.export({ slide: item, format: 'png', scale: 1 });
  await fs.writeFile(path.join(renders, `slide-${i + 1}.png`), new Uint8Array(await png.arrayBuffer()));
  const layout = await item.export({ format: 'layout' });
  await fs.writeFile(path.join(renders, `slide-${i + 1}.layout.json`), await layout.text());
}
const report = { final, renders, receipt, slides: 8, font, sourceSnapshots: sources, guiWindow: { from: gui.from, until: gui.until, attempts: 7 }, laterObservedStarts: end.attempts, laterCapacityExceeded: end.capacityExceeded, serializationManifest: serialization.fingerprint ?? null, groundingCalls: grounding.calls, limitation: 'ArtifactTool final import/render and native table/layout checks. PowerPoint or Google Slides not opened. No clinical readiness claim.' };
await fs.writeFile(path.join(work, 'source-manifest-r4b.json'), JSON.stringify(report, null, 2));
const publicAssets = path.join(output, 'continuation-r4b');
await fs.mkdir(publicAssets);
await fs.cp(renders, path.join(publicAssets, 'renders'), { recursive: true, errorOnExist: true, force: false });
const validation = JSON.parse(await fs.readFile(receipt, 'utf8'));
const portableValidation = { schemaVersion: 'presentation-portable-validation/v1', artifact: path.basename(final), finalSha256: validation.finalSha256, byteCount: validation.byteCount, slideCount: 8, nativeTableCount: validation.nativeTableArithmetic.native_table_count, packageIntegrity: validation.packageIntegrity, layout: validation.presentationLayout, nativeTableArithmetic: validation.nativeTableArithmetic, firstPartyImport: { performed: validation.firstPartyImport.performed, passed: validation.firstPartyImport.passed, slideCount: validation.firstPartyImport.slideCount }, visualReview: 'Pending final slide-by-slide inspection', applicationBoundary: 'PowerPoint and Google Slides execution not tested. This record summarizes the private finalizer receipt; it is not clinical validation.' };
await fs.writeFile(path.join(publicAssets, 'validation.json'), JSON.stringify(portableValidation, null, 2));
const portableManifest = { ...report, final: `../${path.basename(final)}`, renders: 'renders/', receipt: 'validation.json', caseLabels, supersedes: 'r4 verified export, whose diabetic-foot label was mistakenly C19 instead of C04' };
await fs.writeFile(path.join(publicAssets, 'source-manifest.json'), JSON.stringify(portableManifest, null, 2));
console.log(JSON.stringify({ ...report, publicAssets, caseLabels }, null, 2));
