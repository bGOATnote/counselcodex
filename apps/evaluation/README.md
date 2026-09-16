# Counsel Quality physician review instrument

A local Next.js and Tailwind interface that creates the take-home's actual
single-clinician development evaluation. It answers four practical questions:

1. What route and operational timing does the physician choose independently?
2. What deciding facts and relevant uncertainty justify it?
3. Where do the supplied workflow and V0 disagree with that judgment?
4. Who reviewed each case, when, and was anything revised after unblinding?

The independent choice is four-level: `SELF_CARE`, `ASYNC_PHYSICIAN`,
`SAME_DAY_IN_PERSON`, or `EMERGENCY_NOW`. The supplied
`URGENT_ESCALATION` label remains visible only as a combined legacy comparator.

The workbench joins three immutable repository artifacts by case ID:

- `data/patient_messages.csv`: the supplied synthetic messages and labels;
- `data/clinician_development_review.csv`: a legacy-named, unattested reference
  proposal revealed only after the independent judgment is locked; and
- `outputs/predictions.csv`: the current deterministic V0 output and trace
  summary.

The application has a loopback-only disk-backup endpoint, but no identity
service or clinical database. Every edit is wrapped in a versioned checkpoint, read-back verified
in local storage, mirrored to IndexedDB, and preceded by a rotating valid local
backup. Storage failures are caught and shown rather than crashing the review.
Page-hide and visibility changes trigger a synchronous checkpoint, and the UI
shows whether both stores are current. Stale and same-revision competing writes
are rejected; a second tab pauses autosave and requires export/reload instead of
silently replacing either review. JSON import/export remains the portable
backup; the export preserves blind originals, revisions, timestamps, dataset
hashes, reviewer attestation, and a SHA-256 integrity digest. CSV export is
formula-injection safe, labels incomplete records, and exports the pre-reveal
reference separately from the final post-comparison reference. Only completed
records with a locked judgment are eligible for the primary evaluation.
Imports are size-bounded and must match the exact source, proposal, V0, case
inventory, workflow state, and audit-event invariants. The digest detects change;
it does not authenticate the self-asserted reviewer identity.

Workspace V2 binds the source, proposal, and prediction hashes. V1 checkpoints
are migrated without guessing: independently locked judgments and narrative
work remain, while stale post-reveal comparisons and attestation are cleared so
the reviewer can compare against the new four-level V0 honestly.

## Start locally

From the repository root:

```bash
npm ci
npm run review:dev
```

Open `http://localhost:4120`.

Always use `localhost`: browser storage is scoped by origin. Before restoring or
writing a checkpoint, the client moves ordinary `127.0.0.1` sessions once to
that canonical origin; the server does not issue a cacheable redirect. To look
for progress created by an older version at the other origin, open
`http://127.0.0.1:4120/?originRecovery=1`, export any recovered bundle, return
to `http://localhost:4120`, and import it. The in-app Recovery panel links this
flow and can download unreadable checkpoint payloads without counting them as
reviewed data.

```bash
npm run review:test
npm run review:build
npm run review:status
```

The status output keeps the claim boundary machine-readable: repository defaults
contain zero completed physician reviews; the 50-row proposal is unattested; no
clinical performance or deployment-readiness estimate is available.

Browser-local redundancy does not survive intentional site-data deletion,
private-session teardown or browser-profile loss. The new disk copy does:
after 1.2 seconds without edits, the app writes a content-addressed audit bundle
under `apps/evaluation/.local/review-backups/` (using the standard npm launch).
The GUI separately confirms disk write/read-back verification. **Save disk copy
now** flushes the current snapshot; **Recover disk copy** lists the latest 20
copies and requires confirmation before restoring through the validated import
path. It never silently adopts another tab's review. Neither reset nor restore
deletes disk history. The folder is Git-ignored, mode 0700, with 0600 files.

Writes are fsynced and atomically published without replacement. Corrupt files
and interrupted partials are retained; neither is treated as a valid backup.
A 1,000-file/200-MiB local cap refuses further writes without evicting history.
The API requires the exact loopback host, matching origin for POST and a custom
request header; there is no CORS sharing. Payloads are stream-limited to 8 MiB,
schema/provenance checked, and errors do not disclose reviews or paths. This is
not authentication against other software running on the same computer, nor a
network/multi-user/clinical deployment design. Do not expose this server through
a tunnel or change its loopback binding.

Disk copies depend on the local server being up and do not protect against disk
or device failure. The final keystrokes before a crash may exist only in browser
storage until disk verification appears. Export the JSON bundle at milestones
and keep a copy outside this computer if you need device-loss recovery.

## How this review advances the assignment

The supplied PDF asks for a defensible definition of the right answer and the
system's score against it. Its 20-message description differs from the actual
50-row attachment; all 50 IDs, messages and original labels match the GUI data
byte-for-byte (SHA-256 `d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`).

Your route/timing and rationale define the single-clinician development
reference. Missing information, must-not-miss concerns and risk if wrong expose
requirements for the V0 and future regression cases. The revealed comparison
documents flaws in the supplied labels and the built system separately.
You can pause at any draft; no answer is prefilled and no case counts as
completed until you lock and compare it.

Primary scores and matrices use the locked **pre-reveal** response on completed
cases. Final post-comparison scores and the number of revised cases are shown
separately, preventing agreement after seeing V0 from inflating the primary
score. CSV exports have explicit pre-reveal columns and an eligibility flag;
JSON preserves every field of both judgments plus draft text and audit events.
These cases and labels have already been visible during development. The new
attestation says labels were hidden **for this pass**, not that the cases were
previously unseen. Older signed exports remain readable without rewriting their
statement. None of this turns the 50 cases into an external or blinded holdout.

Short, specific clinical answers are sufficient. No second or third reviewer is
required for this take-home. The judge-framework PDF concerns full threads,
notes and orders; reviewing these opening messages does not validate those
separate retrospective quality judges. Engineering tests and external failure
analysis can continue while you review.

## Focused review form

The main form requires **disposition + one short reason** (eight characters
minimum; this is an empty-answer guard, not a clinical-quality grade).
Timing is derived from the selected route for self-care, same-day in-person and
emergency-now. Only async physician review requires another choice: same-day or
routine. An explicitly contradictory saved timing is rejected, never silently
replaced during import or locking.

Uncertainty is optional. The former evidence, must-not-miss, missing-information,
harm and confidence fields are retained in a collapsed **Additional notes**
section; its heading indicates when entries already exist. There is no required
“None” entry or automatic confidence assignment. Existing narratives remain in
their original fields, rather than being merged or rewritten by an AI.

Disposition determines the agreement score; rationale makes it inspectable.
Optional uncertainty is reported with its recording denominator, but does not
exclude cases or alter the score. Extra notes can help author regressions; no
benefit from requiring repetitive notes on every case has been demonstrated.
This reduces mandatory entry burden; it is not evidence of better clinical
decisions or a measured usability improvement.

New locks/revisions carry `formVersion: "focused/v1"`. Prior answers keep their
original shape and timestamps, with no form-version marker added retroactively.
The V2 workspace envelope and storage key remain unchanged; old drafts, detailed
judgments, checkpoints and signed exports still load. Empty optional fields mean
**not recorded**, not “no risk,” “sufficient evidence,” or certainty. JSON keeps
all fields; CSV includes pre-reveal uncertainty and both judgment form versions.

## Why this is not an adjudication product

The assignment evaluates one clinician-engineer's clinical, product, and
technical judgment. Requiring two independent reviewers and a third adjudicator
would leave the requested evaluation artificially incomplete and would spend
time on a workflow the candidate cannot execute.

For a later external performance study, multi-clinician overlap can calibrate
the rubric and resolve high-stakes ambiguity on a sampled subset. At production
scale, deterministic safety checks and validated rubric judges can inspect every
thread, while physician review remains risk-stratified: inspect all serious near
misses and incidents, use probability samples for unbiased quality estimates,
use uncertainty and disagreement sampling to discover failures, and run frozen
sentinels on every release. Do not manually adjudicate 25 million cases.

## Boundary

Synthetic data only. The interface is an evaluation artifact, not a medical
device, patient-care surface, clinical reference standard, or production
security boundary.
