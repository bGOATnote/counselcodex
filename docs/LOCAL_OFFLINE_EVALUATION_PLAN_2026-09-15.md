# Local Nano offline evaluation: preregistration

## Decision this experiment can change

Can the already loaded Nano Q5 provide useful **offline** claim-binding critiques,
fixture leads and proposed hard negatives at zero paid-provider cost? Passing
does not authorize live release, local disposition production, physician gold
changes or clinical-readiness claims. The take-home remains a small asynchronous
router with auditable evaluation; this work improves its development loop.

The four-hour user window began 2026-09-15 15:37:46 UTC and ends 19:37:46 UTC.
All local dispatches in this study honor that end time. No paid run is needed
to answer this question. Reconciled prior $95 mission: $21.607845 accounted,
$73.392155 remaining, zero unknown holds; that ceiling is not renewed here.

## Frozen experiments

1. **Binding development:** 12 defect/control pairs (24 first attempts).
2. **Binding validation:** 12 distinct defect/control pairs (24 first attempts)
   in the same 12 failure families. This is newly authored engineering transfer
   testing, not a held-out clinical cohort or physician-blind evaluation.
3. **Saved-output mining:** eight selected actual archived response excerpts.
   No preassigned accuracy denominator; independently review proposed issues.
4. **Hard-negative drafting:** four intact archived seed excerpts. Generated
   pairs are hypotheses, never automatically accepted labels.
5. **Deterministic gold replay:** completed separately with no model calls.
   V25 and application-study scorecards reproduce byte-for-byte. Historical
   physician agreement is not rescored by Nano.

The 48-example fixture corpus was authored and hash-locked before generation:
`c3bc16292275afd0d35677b496b2665bf3a0c6384b7366369ae3947f8f8edcb1`.
Only the claim changes within each pair. Validation wording/scenarios differ
from development, but authors know both sets; no blinded-author claim is made.
Mining uses 17 hash-pinned raw archived files, complete selected source chunks,
original patient messages and complete selected draft fields/qualifiers.

Model input is a strict allowlist: patient text, one claim or draft excerpt,
and source text. Task IDs, expected labels, family/variant, rationale, source
filenames, physician feedback, acceptedRoutes and original CSV labels never
enter the request. Provenance and labels are stored in separate sidecars.

## Model and execution

- Ollama 0.32.1, `counsel-nano-q5`, digest
  `36896b6271148892f83130812cb14116beeb2a518f98a0a17b469250b84901c8`.
- Native loopback API only; redirects rejected, no provider keys, no fallback.
- Fixed prompt v1; temperature 0, seed 42, thinking disabled, context 8192,
  output maximum 768, request timeout 120 seconds bounded by window remaining.
- One serial worker across studies enforced by an exclusive local run lock.
- Conservative UTF-8 byte bound reserves output and template space. Oversized
  inputs fail rather than truncate source qualifiers or patient context.
- Exclusive first-attempt claims; errors and interrupted attempts are retained
  and never reissued during resume. No rerun-until-pass or best-of selection.
- Raw API body, normalized result, settings, request/model hashes, token timing,
  cold load, sampled model memory and system swap/VM statistics are retained.
  These are sampled process/system observations, not a measured true peak RSS.

## Selection and prespecified offline utility gate

Inspect development results first. The default is to keep v1. At most one
explicitly documented development revision may be proposed before validation;
any changed prompt/settings need a new frozen study identity and separate
results. Do not tune against validation outputs. The selected frozen identity
gets one validation pass; no 8B or download is added unless Nano shows a
specific capacity/quality problem that would change the decision.

Primary validation denominators remain all 12 defects and all 12 controls.
Timeouts, parse errors, missing outputs, quote-integrity failures and abstentions
do not count as correct. Report abstentions separately; they are not free
successes on known defects. Report complete-pair accuracy and raw family counts.

For **offline utility only**, require all of:

- At least 10/12 defects explicitly identified as unsupported.
- At least 10/12 controls explicitly judged supported.
- At most 1/12 unsupported verdicts on clean controls (false alarms).
- At least 23/24 schema-valid first responses.
- At least 23/24 responses with valid literal target/patient/source spans.
- Every counted correct result has valid spans; textual support and clinical
  correctness remain separate.

This is a small screening threshold chosen for human-reviewed offline leads,
not an acceptable clinical error rate. Report confidence limits/raw counts and
avoid extrapolating across untested patients, sources or failure families.

The critic output has supported/unsupported/uncertain plus literal quotations
and a short explanation. Supported refers only to this textual relation; global
clinicalCorrectness stays not_assessed. Missing evidence may justify an empty
quote array, but any supplied quote must exist exactly in its source field.

## Mining and negative review

Mechanically validate literal draft/control and evidence spans; reject unchanged
negative claims. Independently review whether the proposed mismatch is supported
by the provided texts and whether a negative is a meaningful single-claim edit.
No automatic physician attestation, corpus promotion or repair execution follows.
Report rejected/no-issue candidates along with useful leads. This selected sample
cannot estimate error prevalence or clinical accuracy.

## Interpretation and next decision

If the gate and reviewed mining examples support utility, keep Nano as an offline
assistant and document the validated scope. If not, report the misses and reject
that use or make the single development-only revision. Do not add agents,
models or paid cohorts simply to fill the four-hour window.

A later paid comparison needs a specific decision-changing implementation
hypothesis and predeclared same-input promotion criteria. None is assumed here.
V25 stays frozen unless such a separate comparison earns promotion. Report all
costs as actual local provider cost $0; any avoided paid spend is hypothetical
unless measured on the identical task with the paid provider.
