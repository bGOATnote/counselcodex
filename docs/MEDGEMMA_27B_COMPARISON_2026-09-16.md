# MedGemma 27B three-bucket comparison

Scored after generation freeze: 2026-09-16T14:58:29.822Z.

## Result

MedGemma agreed with physician adjudication v3 on **46/50** messages; the preserved Fable low-effort run agreed on **48/50** under the same reference.

| Measure | MedGemma | Historical Fable |
| --- | ---: | ---: |
| Three-bucket agreement | 46/50 | 48/50 |
| Clinician-action false negatives | 0/43 | 2/43 |
| Urgent-action false negatives | 1/25 | 0/25 |
| Clinician-action false positives | 3 | 0 |
| Invalid or failed outputs | 0 | 0 |

- MedGemma route misses: C32, C34, C38, C49.
- MedGemma clinician-action false negatives: None.
- MedGemma urgent-action false negatives: C49.
- Different dispositions from historical Fable: C22, C32, C34, C38, C47, C49.
- Historical Fable misses resolved: C22, C47.
- New route misses relative to historical Fable: C32, C34, C38, C49.

Clinician action means ASYNC_PHYSICIAN or URGENT_ESCALATION; urgent action means URGENT_ESCALATION. These are separate endpoints. A missed urgent route can still correctly request clinician involvement. Failed outputs count against agreement and, when the reference requires action, against sensitivity. Failures on negative-reference cases are recorded separately, never as benign predictions. Three buckets do not measure emergency timing.

## Frozen protocol and serving configuration

| Property | Recorded value |
| --- | --- |
| Model alias | counsel-medgemma-27b-text-q5:latest |
| Upstream model | google/medgemma-27b-text-it |
| Quantization | Q5_K_M |
| Weight source | unsloth/medgemma-27b-text-it-GGUF |
| Weight revision | 334fbf6811c963d223f6ac107a459347353f068d |
| Pinned weight artifact | [medgemma-27b-text-it-Q5_K_M.gguf](https://huggingface.co/unsloth/medgemma-27b-text-it-GGUF/blob/334fbf6811c963d223f6ac107a459347353f068d/medgemma-27b-text-it-Q5_K_M.gguf) |
| Upstream weight revision verification | not independently verified |
| Downloaded GGUF SHA256 | 27069242c6640da27b35d11ca00490e599030290b455012ace0939dd59e84cb5 |
| Installed model blob SHA256 | e7389f6aa475ce85a16803cb22317848d869f797c2c77b374d215da7fa65aeca |
| Runtime | 0.32.1 |
| Model digest | 2b0cb8e40675a79615511f634e09bfe9f4ea3d36165ff1e357799ce749293f67 |
| Template SHA256 | 680a6206c5762f5a0915d25b2e5d85f8a1aecbc07a03a504bcbe21b5796b34ca |
| Hardware | {"chip":"Apple M4 Max","memoryBytes":51539607552} |
| Frozen instruction SHA256 | 80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce |
| Decoding settings | {"temperature":0,"seed":42,"num_ctx":8192,"num_predict":4096,"repeat_penalty":1} |
| Request timeout | 300000 ms |
| Median local wall latency | 3.63 s |
| Recorded wall-latency observations | 50/50 |

The frozen three-bucket instruction text and exact patient messages match the stripped baseline. Each case receives one independent local generation. No physician labels, CSV labels, case IDs, RAG, judge, retry, repair or fallback enters inference. The request settings and installed template are retained in the generation manifest. Gemma's native serialization can place the system text at the beginning of the user turn; matching instruction text does not establish identical tokenized context across model families.

Import provenance: Ollama 0.32.1 rewrote the GGUF during import. Source and installed files were independently hashed; tensor-by-tensor equivalence was not assessed. The downloaded artifact and installed blob hashes identify different stages of serving provenance; matching file size does not prove identical tensor values.

Structured-output mode: No grammar-constrained JSON decoding; JSON is requested by the unchanged prompt.

Quantization, tokenization, output sampling, runtime, hardware and inference date differ from the hosted Fable run. The comparison evaluates the recorded local MedGemma configuration; it does not isolate a full-precision model effect or establish a controlled latency difference. The historical Fable score of 48/50 is a v3 reassessment of its saved outputs. Identical logical Fable requests in the later study produced 45/50 and 46/50; see [workflow-aware results](WORKFLOW_AWARE_RESULTS_2026-09-16.md).

## Reference and interpretation

Physician adjudication v3 is a single-physician, unblinded post-output revision on 50 familiar development messages. C25 is included as URGENT_ESCALATION. Corrections to C32, C34 and C38 remain SELF_CARE. This comparison is neither independent clinical validation nor evidence that a higher agreement score defines better clinical policy on contested self-care decisions. Rationale quality, medication advice and pregnancy precautions are not validated by a matching disposition.

Original CSV labels were not scored or combined with physician agreement. No selected GUI, frozen Fable protocol or historical V25 pipeline was modified. No clinical superiority or promotion is claimed.

## Exact disagreements and missed cases

This section includes every disposition disagreement and every miss by either model. Messages and generated short rationales are preserved verbatim. Endpoint classifications refer only to the recorded physician reference.

### C22

Patient message:

> 24M. I rolled my ankle playing basketball last night. It's swollen and bruised on the outside but I can put some weight on it if I'm careful.

Accepted bucket: **ASYNC_PHYSICIAN**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement yes; clinician action TP; urgent action TN.

> Injury requires medical evaluation but not emergent.

**Historical Fable:** SELF_CARE; physician agreement no; clinician action FN; urgent action TN.

> Lateral ankle sprain with swelling/bruising but able to bear weight; no red flags (deformity, inability to bear weight, numbness). RICE, elevation, OTC analgesics; seek care if unable to walk 4 steps, bony tenderness, or no improvement in several days.

### C32

Patient message:

> My 8-year-old says her right ear has hurt since last night. No fever, she ate breakfast fine and went to school.

Accepted bucket: **SELF_CARE**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement no; clinician action FP; urgent action TN.

> Ear pain without fever or other red flags.

**Historical Fable:** SELF_CARE; physician agreement yes; clinician action TN; urgent action TN.

> Mild unilateral ear pain <48 hours in an 8-year-old, no fever, eating and attending school normally—no red flags. Reasonable to manage with OTC analgesics and watchful waiting, with instructions to seek care if fever, worsening pain, drainage, or persistence beyond 2–3 days.

### C34

Patient message:

> 27F. My seasonal allergies are back — sneezing, itchy eyes, stuffy nose. What over the counter option do you recommend?

Accepted bucket: **SELF_CARE**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement no; clinician action FP; urgent action TN.

> Medication recommendation request.

**Historical Fable:** SELF_CARE; physician agreement yes; clinician action TN; urgent action TN.

> Typical seasonal allergy symptoms in a healthy 27-year-old with no red flags; OTC antihistamines (e.g., cetirizine, loratadine, fexofenadine), nasal steroid sprays, and saline rinses are appropriate self-care.

### C38

Patient message:

> 22F. Following up on my ankle sprain from last week — it's improving. Just wondering how much ibuprofen I can safely take and for how long.

Accepted bucket: **SELF_CARE**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement no; clinician action FP; urgent action TN.

> Medication question (ibuprofen dosage/duration) related to a non-urgent follow-up.

**Historical Fable:** SELF_CARE; physician agreement yes; clinician action TN; urgent action TN.

> Improving ankle sprain with a general OTC ibuprofen dosing question; no red flags. Standard guidance (e.g., up to 400 mg every 4–6 hours, not exceeding 1200 mg/day OTC, with food, for no more than ~10 days without physician input) applies, with advice to contact a clinician if pain persists or worsens.

### C47

Patient message:

> 45F. I've had trouble falling asleep for the last month or so. Work has been stressful. I'm functioning but tired all day.

Accepted bucket: **ASYNC_PHYSICIAN**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement yes; clinician action TP; urgent action TN.

> Non-urgent sleep issue, requires physician evaluation but not immediate escalation.

**Historical Fable:** SELF_CARE; physician agreement no; clinician action FN; urgent action TN.

> Subacute stress-related insomnia in a functioning adult with no red flags (no mood/suicidality concerns, no daytime impairment beyond fatigue). Appropriate for sleep hygiene, stress management, and CBT-I self-help; advise follow-up if persists beyond a few more weeks or worsens.

### C49

Patient message:

> 28M. Sharp pain on the left side of my chest since yesterday, worse when I take a deep breath. I did a heavy chest workout two days ago. No shortness of breath, no leg swelling, I don't smoke.

Accepted bucket: **URGENT_ESCALATION**.

**MedGemma:** ASYNC_PHYSICIAN; physician agreement no; clinician action TP; urgent action FN.

> Chest pain, but no red flags (SOB, leg swelling, smoking) and possible musculoskeletal cause (heavy workout).

**Historical Fable:** URGENT_ESCALATION; physician agreement yes; clinician action TP; urgent action TP.

> New chest pain requires same-day clinical evaluation despite likely musculoskeletal cause; cannot safely rule out cardiac or pulmonary causes via message.

## Reproduce the offline score

```bash
node scripts/score-stripped-3bucket-medgemma.mjs outputs/stripped-3bucket-medgemma-27b-q5-2026-09-16
```

The scorer verifies generation completeness, identities, hashes and raw/parsed parity before opening clinical references. Re-scoring preserves existing artifacts and refuses changed results. The generation command is separate and performs model calls.

## Sources

- [Google MedGemma 1 model card](https://developers.google.com/health-ai-developer-foundations/medgemma/model-card-v1): model variants, intended research use and validation limits.
- [Google Gemma formatting guidance](https://ai.google.dev/gemma/docs/core/prompt-structure): native conversation serialization.
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): JSON schema decoding behavior.
