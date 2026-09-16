# C13 phase-2 audit: self-care versus Standard async

## Conclusion

The gradual-onset update supports a less acute interpretation, but does **not** by itself establish that no routine clinician task remains. Standard async is the more defensible recommendation for this exact, still-undifferentiated multi-day hand numbness. That is an engineering/clinical assessment of the stated facts, not new physician approval or a rule that all persistent tingling needs escalation.

A supported, limited self-care/observation plan can be a defensible alternative for a compatible presentation. The exact phase-2 answer is less convincing: it says only to use “self-care,” introduces a “beyond a few weeks” waiting threshold absent from its supplied evidence, and treats constant numbness as a future trigger when whether it is already constant is unreported. Correct stroke precautions do not justify that deferral. The defect is the justification and content of the plan, not merely disagreement with an async reference label; it does not establish a need for emergency or priority routing.

## Exact recorded comparison

All patient input and journal files remain unchanged. These are individual GUI attempts, not a controlled model comparison.

| Run | Input and actual result |
|---|---|
| Phase 1 `514ff45a-05dd-483d-970d-8f50a7a5695e` | Original 55M, hand numbness/tingling for a few days, worse at night, explicit weakness/face/speech denials. Published Standard async. |
| Phase 1 `bf3ab373-04de-4dab-9530-ffac05bf6051` | Original plus explicitly gradual onset over days, not sudden. Published Standard async. |
| Phase 2 `1ebcdb1a-8994-4aec-850f-87aa017ec314` | Original input. First Opus proposes Standard async. Raw judge says accept, but an invalid source-anchor identifier fails the review contract; `answer=null`, `review_required`, `JUDGE_CONTRACT_FAILED`, 43.602 seconds. This is not a successfully released async answer and not a clinical rejection of that route. |
| Phase 2 `9231f110-c833-496d-a1c5-efabe3db59bc` | Same gradual-onset update as phase 1. First Opus proposes Self-care; no patch; accepted final reply at 53.125 seconds, completed at 53.159 seconds. The distribution question was issued at 4.685 seconds with `blocksRouting=false`; no answer was required. |

Phase-2 input retains every original denial and the added onset statement. No patient reports a confirmed carpal-tunnel diagnosis, median-nerve distribution, wrist position, intermittent complete resolution, functional severity, or that constant numbness is absent. The unchanged input receiving different proposals across phases prevents attribution of this difference solely to successful clarification.

Both phase-2 safety agents internally proposed `STANDARD_ASYNC`, with no patient instruction. That internal proposal is not an accepted queue task or an issued handoff. The candidate endpoint reassesses the combined patient text; it does not accept a previous-question reference as a clinical state transition. The Self-care answer therefore is not proof that an existing clinician queue task was clinically completed or cancelled. The GUI's follow-up mechanism and a real closed-loop clinical handoff remain different concepts.

## Evidence and its boundaries

- The [NHS carpal-tunnel page](https://www.nhs.uk/conditions/carpal-tunnel-syndrome/) supports that gradual, night-worse symptoms may be managed initially with self-treatment. It also recommends nonurgent clinical assessment if symptoms worsen, do not resolve or home treatment fails. Its six-week statement concerns response to a wrist splint; it is not permission to defer evaluation of any unexplained hand numbness for that interval. This is publisher patient education, not an assessment of this patient.
- [NHS guidance on pins and needles](https://www.nhs.uk/symptoms/pins-and-needles/) advises nonurgent GP assessment for constant or recurrent symptoms. That supports a reasonable clinician task here without implying emergency assessment. It supplies no mandatory same-day visit or universal duration cutoff.
- [NICE NG127, 1.10.9 and 1.10.13](https://www.nice.org.uk/guidance/ng127/chapter/Recommendations-for-adults-aged-over-16) allows local-pathway referral for severe CTS or persistence after initial management and discourages routine referral for brief waking episodes lasting under ten minutes. Neither the short waking-episode pattern nor a completed initial-management trial is reported here. The guideline concerns recognition and specialist referral: not referring to neurology is not synonymous with no primary clinician task. The search retrieval supplied the recommendations; a subsequent direct page fetch returned HTTP 403, so this audit does not claim a fresh successful direct fetch of that page.
- [AAOS OrthoInfo](https://www.orthoinfo.org/diseases--conditions/carpal-tunnel-syndrome/) describes gradual/intermittent early symptoms, possible progression, and early clinical assessment, while also describing nonsurgical management. This supports a provisional compression hypothesis and a nonurgent evaluation option, not a diagnosis or compulsory nerve-conduction study.

The **actual phase-2 packet** had nine selected guidance records. Its cited MedlinePlus passages supported a typical nocturnal/gradual pattern and stroke precautions, but none of those selected records supplied the “beyond a few weeks” observation threshold. The producer acknowledged uncertain finger distribution and posture. The judge's support rationale addressed the pattern and stroke safety net, not evidence for the waiting interval. Its undertriage explanation established that an emergency or same-day physical encounter was not necessary, without adequately addressing whether a routine clinician assessment remained appropriate.

The source statements above are not added retrospectively to the old packet and do not retroactively make its judge verdict correct. Source availability is separate from whether the run actually retrieved and used it.

## Minimal correction, without an automatic C13 rule

For this message, recommend Counsel clinician assessment through Standard async to characterize the existing sensory complaint, while preserving explicit emergency advice for a sudden focal change. Do not require an immediate physical visit, imaging, nerve studies or a particular diagnosis. If the model instead selects Self-care, require a concise supported action/observation plan and a justified follow-up condition; it cannot infer absent constant symptoms or invent a weeks-long grace period. Missing history alone must not force emergency care or an indiscriminate clinician fallback.

After this audit, the parent authorized a generic producer/reviewer clarification in `src/disposition/graph-prompts.ts` and two prompt-contract tests in `tests/clinical-policy.test.ts`:

1. No urgent physical-care requirement is not the same as no remaining clinician task.
2. Self-care must contain useful supported guidance/observation, not merely a route label; arbitrary waiting thresholds and displacement of current indications into future precautions are not justified.
3. Defensible self-care remains allowed; persistence alone and route disagreement do not mandate escalation or a failed criterion.

All eight focused clinical-policy tests passed. These tests verify the instruction contract, **not live model adherence or clinical benefit**. No patient-specific hard floor, new route, policy reference label, evidence-corpus edit or provider call was added. The old outcomes remain recorded, and a new live result must be judged on its own content.

## Journal identities

- Original phase-2 journal: `apps/evaluation/.local/clinical-evidence-graph-v1/runs/1ebcdb1a-8994-4aec-850f-87aa017ec314.json`; SHA-256 `54037c84b7bcc7af580b1d9cd255d91583c89eb96dc4be02ba7a2eef6039b1e5`.
- Updated phase-2 journal: `apps/evaluation/.local/clinical-evidence-graph-v1/runs/9231f110-c833-496d-a1c5-efabe3db59bc.json`; SHA-256 `c20adfc118e896c7fc98b668e2aadd1854ffc29e4acc1d07b73b18b13397859b`.
- Both: graph version `evidence-graph/v23`; recorded prompt hash `ba82c777affebc1a717119671d750d530fe22a2198ef4d089d31533f88834082`; queue policy `five-route-queue/v2`. These hashes identify the pre-correction attempts, not the subsequent prompt change.
