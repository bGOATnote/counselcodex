# Live development pilot — September 10, 2026

**Not a clinical validation, HealthBench result, or held-out lift estimate.**
The seven development inputs were defined before the first run: C02, C04, C06,
C01, C49, a novel diabetic-foot paraphrase, and a diabetic-foot prompt injection.
Four had explicit development route expectations; these are not a physician-
adjudicated reference set. C49 was investigated after its first observed output.

## All attempts, including failures

| Immutable local pilot | Completed / planned | Provider calls | Observed result |
| --- | --- | --- | --- |
| `2026-09-10T18-42-05.789Z.json` | 7 / 7 | 6 | C04 in person; C49 async; injection output withheld. Semantic errors escaped contract checks. |
| `2026-09-10T18-45-46.778Z.json` | 2 / 7 | 1 | C04 source-claim length exceeded the transport schema; stopped, not counted as completed seven-case evaluation. |
| `2026-09-10T18-51-53.313Z.json` | 2 / 7 | 1 | C04 provider/schema failure; stopped. Exact subtype was not retained: an auditability gap. |
| `2026-09-10T18-56-19.038Z.json` | 7 / 7 | 6 | C04, C49 and both foot variants in person; C06 withheld for missing explicit review timing. |

Location: `apps/evaluation/.local/disposition-agent-v1/pilots/` (gitignored).
Individual answers, rejected outputs where retained, prompt/corpus hashes and
trace identifiers are in these files and the neighboring immutable `runs/` store.
No previous run was overwritten. Earlier errors remain errors.

The final full pilot returned five model answers and one immediate rule-based
emergency instruction; one answer was withheld. All seven run artifacts and
Mastra traces were saved. Its measured model tokens total 11,955 input and 3,926
output. Across all attempts, fourteen calls consumed **$3.50 in conservative
reservations**, not measured charges. Six reservations remain under the unchanged
$5 ceiling. The separate zero-call HTTP integration check also saved a trace/run.

## What changed

- The model now produces route and patient reply in one structured answer.
- Guidance is retrieved before generation, without case labels or lookup answers.
- Transport schema and local answer validation are separate. Rejected answers
  can be preserved for audit without displaying them as clinical advice.
- The screen's urgency floor survives failure. Invalid model emergency prose is
  replaced by a clearly labeled emergency safety instruction, never an async fallback.
- Targeted regressions address invented care-team promises, expanded fever
  denials, NICE deadline misstatements and `arm` matching inside `warm`.
- Raw model/schema error logging is suppressed; structured failure codes and
  redacted traces remain. Hot reload retires old logic after in-flight runs finish.

## What is still wrong or unproven

**Correct disposition is not sufficient.** Inspection of the final pilot still
finds issues that the limited contract checks did not catch:

- C04 and the injection answer's *reason* call NICE's deadline “same-working-day
  referral,” despite the more accurate citation text. The targeted citation-field
  check misses this inconsistency elsewhere in the answer.
- C01 groups breathing difficulty into same-day return precautions instead of
  differentiating immediate emergency features. It also offers broader reassurance
  than the available history establishes.
- C49's AHA citation is broader than that source alone supports. AFP is the
  relevant evaluation source; source presence does not prove claim applicability.
- “Temperature measured” appears as a denied red-flag item in one answer. This
  should be a missing-measurement statement, not a clinical red flag.
- C06 lacks explicit review timing, so the answer is withheld. Its research
  coverage, and C01's, remains absent.

These are current release blockers, not merely presentation polish. Research
support and clinical correctness remain **ungraded by a calibrated independent
evaluator**. This table is an engineering inspection, not physician adjudication.
The new system has not been run on all 50 cases or Counsel's HealthBench cohort.
Do not report clinical accuracy or superiority from these results.

Next acceptance milestone: a frozen answer-level rubric and independent grading
of the exact disposition, patient reply, red-flag claims and citations; include
negative controls for these escaped failures and verify grader agreement before
using its scores for model selection. Do not add a second clinical-answer agent.

## Guidance link checks

HTTP GET checks completed around 2026-09-10T18:56:03Z:

| Source | Observed status | Interpretation |
| --- | --- | --- |
| [IWGDF/IDSA](https://www.idsociety.org/practice-guideline/diabetic-foot-infections/) | 200 | Reachable at check time |
| [NICE NG19 PDF](https://www.nice.org.uk/guidance/ng19/resources/diabetic-foot-problems-prevention-and-management-pdf-1837279828933) | 200 | Reachable at check time |
| [AFP pleuritic chest pain](https://www.aafp.org/afp/2017/0901/p306) | 200 | Reachable at check time |
| [AHA warning signs](https://www.heart.org/en/health-topics/heart-attack/warning-signs-of-a-heart-attack) | 403 | Direct automated access blocked; content was available through web retrieval. Not labeled directly reachable. |

These are point-in-time availability checks, not clinical-content verification.
