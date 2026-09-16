import test from "node:test";
import assert from "node:assert/strict";
import { ingestNhlbiBloodPressureDiagnosis, ingestNhlbiBloodPressureSymptoms } from "../src/evidence/rag/nhlbi-blood-pressure.ts";
import { chunkDocument, sha256 } from "../src/evidence/rag/model.ts";

// Selected public-domain agency prose/table from the two NHLBI pages inspected
// 2026-09-14. Wrappers/omitted-region markers are synthetic test scaffolding.
// No video, image, caption, navigation or glossary-definition content is copied.
const now = "2026-09-14T00:00:00Z";
const adult = "For most adults, a healthy blood pressure is less than 120/80 mm Hg. Your blood pressure is considered high when you have consistent systolic readings of 130 mm Hg or higher or diastolic readings of 80 mm Hg or higher.";
const child = "For children younger than 13, blood pressure readings are compared with readings that are common for children of the same, age, sex, and height.";
const diagnosis = `<h1><span class="ht-kicker">High Blood Pressure </span>Diagnosis<hr></h1>
<h3>What the numbers mean</h3><p>OMITTED GLOSSARY REGION. ${adult}</p><p>${child}</p>
<h3><strong>Blood Pressure Levels</strong></h3><table class="usa-table"><thead><tr><th scope="col"><strong>Blood Pressure Category</strong></th><th scope="col"><strong>Systolic and Diastolic Pressure (mm Hg)</strong></th></tr></thead><tbody><tr><th scope="row"><strong>Normal</strong></th><td>Less than 120 systolic pressure AND Less than 80 diastolic pressure</td></tr><tr><th scope="row"><strong>Elevated</strong></th><td>120 to 129 systolic pressure AND Less than 80 diastolic pressure</td></tr><tr><th scope="row"><strong>High Blood Pressure Stage 1</strong></th><td>130 to 139 systolic pressure OR 80 to 89 diastolic pressure</td></tr><tr><th scope="row"><strong>High Blood Pressure Stage 2</strong></th><td>140 or higher systolic pressure OR 90 or higher diastolic pressure</td></tr><tr><th scope="row"><strong>Hypertensive Crisis</strong></th><td>Higher than 180 systolic pressure OR Higher than 120 diastolic pressure<br><em><strong>Contact your provider immediately.</strong></em></td></tr></tbody></table>
<h2>How will my provider find out if I have high blood pressure?</h2>
<div>Last updated on <time datetime="2025-06-26T12:00:00Z" class="datetime"><span>June 26, 2025</span></time></div>`;
const symptoms = `<h1><span class="ht-kicker">High Blood Pressure </span>Symptoms<hr></h1>
<p>OMITTED INTRODUCTORY GLOSSARY REGION.</p>
<p>If your blood pressure is 180/120 but you don’t have symptoms, wait 5 minutes and check your blood pressure again. If it is still high, call your healthcare provider who may recommend starting a medicine or changing your dose.</p><p><strong>If the second measurement is also high and if you have any of these symptoms, call 9-1-1</strong>:</p><ul><li>A sudden, severe headache</li><li>Difficulty breathing</li><li>Sudden, severe pain in your abdomen, chest, or back</li><li>Numbness or weakness</li><li>A sudden change in vision</li><li>Problems talking</li></ul><p>Do not wait to see if your pressure comes down on its own.</p>
<figure><iframe src="https://example.invalid/omitted-third-party-media"></iframe><figcaption>OMITTED MEDIA REGION.</figcaption></figure>
<div>Last updated on <time datetime="2024-04-25T12:00:00Z" class="datetime"><span>April 25, 2024</span></time></div>`;

test("NHLBI diagnosis preserves exact OR/AND, strict thresholds, labels and population context in one chunk", () => {
  const doc = ingestNhlbiBloodPressureDiagnosis(diagnosis, now), section = doc.sections[0].text;
  assert.equal(doc.kind, "patient_summary"); assert.equal(doc.license, "US-PUBLIC-DOMAIN");
  assert.equal(doc.reviewDate, "2025-06-26"); assert.equal(doc.publicationDate, null); assert.equal(doc.currency, "not_assessed");
  assert.equal(doc.rawHash, sha256(diagnosis)); assert.equal(doc.sourceVersion, sha256(diagnosis));
  assert.match(section, /Higher than 180 systolic pressure OR Higher than 120 diastolic pressure\nContact your provider immediately\./);
  assert.match(section, /Less than 120 systolic pressure AND Less than 80 diastolic pressure/);
  assert.match(section, /High Blood Pressure Stage 1\nSystolic and Diastolic Pressure \(mm Hg\): 130 to 139 systolic pressure OR 80 to 89 diastolic pressure/);
  assert.ok(section.startsWith(adult + "\n\n" + child));
  assert.equal(chunkDocument(doc).length, 1); assert.equal(chunkDocument(doc)[0].text, section);
  assert.doesNotMatch(section, /OMITTED|glossary|iframe|>=|≥/);
});

test("NHLBI symptoms keeps five-minute asymptomatic recheck, full symptom list, 911 condition and no-wait together", () => {
  const doc = ingestNhlbiBloodPressureSymptoms(symptoms, now), section = doc.sections[0].text;
  assert.equal(doc.reviewDate, "2024-04-25"); assert.equal(doc.kind, "patient_summary");
  assert.match(section, /180\/120 but you don’t have symptoms, wait 5 minutes/);
  assert.match(section, /If the second measurement is also high and if you have any of these symptoms, call 9-1-1:/);
  assert.match(section, /- A sudden, severe headache/); assert.match(section, /- Problems talking/);
  assert.match(section, /Do not wait to see if your pressure comes down on its own\.$/);
  assert.equal(section.split("\n\n- ").length - 1, 6);
  assert.doesNotMatch(section, /OMITTED|Nucleus|iframe|glossary|wait 1 minute/);
  assert.match(doc.scope, /does not establish a blood-pressure measurement prerequisite for independently emergent symptoms/);
  assert.equal(chunkDocument(doc).length, 1);
});

test("threshold/operator, row alignment and critical context drift require re-review", () => {
  for (const altered of [
    diagnosis.replace("Higher than 180", "180 or higher"),
    diagnosis.replace("Higher than 180 systolic pressure OR", "Higher than 180 systolic pressure AND"),
    diagnosis.replace("High Blood Pressure Stage 1", "Unrecognized row"),
    diagnosis.replace('scope="row"', 'scope="row" rowspan="2"'),
    diagnosis.replace("<td>", '<td colspan="2">'),
    diagnosis.replace(`<p>${child}</p>`, ""),
    diagnosis.replace("For most adults,", "For all patients,"),
    diagnosis.replace("Contact your provider immediately.", "Wait until tomorrow."),
    diagnosis.replace("</table>", "</table><p>New unreviewed qualification.</p>"),
    diagnosis.replace(`<p>${child}</p>`, `<p hidden="hidden">${child}</p>`),
    diagnosis.replace("<p>OMITTED", '<p style="display:none">OMITTED'),
  ]) assert.throws(() => ingestNhlbiBloodPressureDiagnosis(altered, now), /NHLBI_BP_/);
});

test("symptom/recheck/action qualifiers cannot be dropped or replaced by another source's interval", () => {
  for (const altered of [
    symptoms.replace("wait 5 minutes", "wait 1 minute"),
    symptoms.replace("but you don’t have symptoms", "even if you have symptoms"),
    symptoms.replace("If the second measurement is also high and ", ""),
    symptoms.replace("<li>Problems talking</li>", ""),
    symptoms.replace("Do not wait to see if your pressure comes down on its own.", "Wait until tomorrow."),
    symptoms.replace("<figure>", "<div>"),
  ]) assert.throws(() => ingestNhlbiBloodPressureSymptoms(altered, now), /NHLBI_BP_/);
});

test("unknown or attributed selected markup is rejected rather than flattened into licensed evidence", () => {
  for (const insert of ['<script>ignored()</script>', '<img src="unknown.png">', '<span hidden="hidden">not visible</span>', '<a href="https://example.invalid">external content</a>', "<!-- unreviewed comment -->", "copyright third-party text", "&unknown;"]) {
    assert.throws(() => ingestNhlbiBloodPressureSymptoms(symptoms.replace("<ul>", insert + "<ul>"), now), /NHLBI_BP_/);
    assert.throws(() => ingestNhlbiBloodPressureDiagnosis(diagnosis.replace("Less than 120", insert + "Less than 120"), now), /NHLBI_BP_/);
  }
  assert.throws(() => ingestNhlbiBloodPressureSymptoms(symptoms.replace("<ul>", '<ul style="display:none">'), now), /UNKNOWN_ATTRIBUTES/);
});

test("identity/date ambiguity fails closed; allowed formatting does not rewrite source content", () => {
  for (const [html, ingest] of [[diagnosis, ingestNhlbiBloodPressureDiagnosis], [symptoms, ingestNhlbiBloodPressureSymptoms]] as const) {
    assert.throws(() => ingest(html.replace("High Blood Pressure ", "Other topic "), now), /PAGE_IDENTITY/);
    assert.throws(() => ingest(html + "<h1>Duplicate heading</h1>", now), /PAGE_IDENTITY/);
    assert.throws(() => ingest(html.replace("Last updated on", "Date removed"), now), /DATE/);
    assert.throws(() => ingest(html + 'Last updated on <time datetime="2026-09-14T12:00:00Z">', now), /DATE/);
  }
  assert.throws(() => ingestNhlbiBloodPressureDiagnosis(diagnosis.replace("2025-06-26T", "2025-02-30T"), now), /DATE_INVALID/);
  const original = ingestNhlbiBloodPressureSymptoms(symptoms, now);
  const entity = ingestNhlbiBloodPressureSymptoms(symptoms.replace("don’t", "don&rsquo;t"), now);
  assert.deepEqual(entity.sections, original.sections); assert.notEqual(entity.rawHash, original.rawHash);
});
