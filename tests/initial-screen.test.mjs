import test from "node:test";
import assert from "node:assert/strict";
import { currentPatternHits, screenCurrentRedFlags } from "../src/disposition/initial-screen.mjs";

// Authored context regressions, not a held-out clinical accuracy benchmark.
const negatives = [
  "I do not have crushing chest pain or left arm pain. I need a refill.",
  "I have no chest pressure, sweating or nausea. My usual migraine needs a refill.",
  "My father had slurred speech and a drooping face ten years ago. I need my usual migraine refill.",
  "I had slurred speech and a drooping face in 2012. No new symptoms; I need records.",
  "What if I develop slurred speech and a drooping face?",
  "I am reading about slurred speech and a drooping face.",
  "The leaflet says 'call 911 for slurred speech and face droop'. I need my usual refill.",
  "My doctor asked me whether I had 'slurred speech and face droop'. I did not.",
  "I deny being suicidal. I would like a counseling referral.",
  "An article describes feeling everyone would be better off without me.",
  "I was suicidal years ago. I want my records from that hospitalization.",
  "I have never had blue lips or trouble breathing.",
  "I am not struggling to breathe. I need a finasteride refill.",
  "What if I have blue lips or cannot breathe?",
  "I read about symptoms of an overdose.",
  "I had an overdose years ago. I need a copy of my medical records.",
  "My overdose-prevention training scenario included too many pills.",
  "I am hanging a curtain and dust got into my eye.",
  "My eye doctor sells curtain fabric. I have itchy eyes.",
  "I bought a battleship model after I fell behind at work and can't put it together.",
  "I take warfarin and have my usual mild headache. No injury.",
  "I take Eliquis and have thrown up once. I have not hit my head.",
  "I do not have black and tarry stools or lightheadedness.",
  "Black and tarry stools and lightheadedness are not present.",
  "An article describes black and tarry stools with lightheadedness.",
  "I do not have a seizure lasting five minutes.",
  "What if I have a seizure lasting five minutes?",
  "I need a slurred-speech therapy appointment for my father, who had face droop years ago.",
];
for (const text of negatives) test(`no automatic emergency for context-only phrase: ${text}`, () => assert.equal(screenCurrentRedFlags(text), null));

const positives = [
  ["I have crushing chest pressure, pain in my left arm and feel sweaty.", "acs"],
  ["My speech got slurred and my face felt droopy ten minutes ago. It has resolved now.", "tia_stroke"],
  ["My mother has slurred speech and a drooping face right now.", "tia_stroke"],
  ["I do not have slurred speech usually. But now my speech got slurred and my face felt droopy.", "tia_stroke"],
  ["I had slurred speech years ago. Today my speech got slurred and my face felt droopy again.", "tia_stroke"],
  ["I am struggling to breathe.", "respiratory_distress"],
  ["I am not sure what is happening; I cannot breathe.", "respiratory_distress"],
  ["I cannot breathe without help.", "respiratory_distress"],
  ["I have blue lips now.", "respiratory_distress"],
  ["I took a whole bottle of pills just now.", "overdose_or_poisoning"],
  ["I have black and tarry stools and feel lightheaded when I stand up.", "gi_bleed"],
  ["I lost vision in my left eye suddenly.", "retinal_or_amaurosis"],
  ["A curtain coming down over my eye started suddenly.", "retinal_or_amaurosis"],
  ["I take warfarin, fell and hit my head yesterday and have a headache.", "ich_on_anticoag"],
  ["I take Eliquis and hit my head today. I have no headache or vomiting.", "ich_on_anticoag"],
  ["My wife says 'I cannot breathe'.", "respiratory_distress"],
  ["I am not diabetic and I cannot breathe.", "respiratory_distress"],
  ["I read about breathing problems but now I am struggling to breathe.", "respiratory_distress"],
  ["I have no fever and I have crushing chest pressure and pain in my left arm.", "acs"],
  ["My child has seizures back to back without waking.", "prolonged_or_recurrent_seizure"],
  ["Everyone would be better off without me.", "postpartum_or_si_crisis"],
];
for (const [text, rule] of positives) test(`retains current emergency concern: ${rule}: ${text}`, () => assert.equal(screenCurrentRedFlags(text)?.name, rule));
test("repeated matching examines later affirmed occurrences and enforces word boundaries", () => {
  assert.equal(currentPatternHits("No blue lips. Now I have blue lips.", [/blue lips/i]).length, 1);
  assert.equal(currentPatternHits("My township membership expired.", [/hip/i]).length, 0);
});
test("isolated DVT suspicion is not an automatic pre-model emergency", () => {
  assert.equal(screenCurrentRedFlags("42F. I flew back from Europe two days ago and now my left calf is painful, swollen, and warm compared to the other one."), null);
});
test("stroke screen does not invent resolution and keeps ambulance action even after symptoms stop", () => {
  for (const text of ["My speech got slurred and my face felt droopy. It has stopped now.", "I now have slurred speech and a drooping face."]) {
    const notice = screenCurrentRedFlags(text);
    assert.match(notice.directive, /Call 911 now/);
    assert.doesNotMatch(notice.directive, /^Resolved/);
  }
});
