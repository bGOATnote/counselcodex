# Local binding fixture and Cascade import audit

## What the 48 fixtures establish

This is a frozen **engineering-authored textual regression corpus**, not a
physician-approved benchmark or a clinical holdout. Its purpose is to test
whether a local critic distinguishes a narrowly supported claim from a nearby
unsupported claim using only the supplied patient message and source excerpt.
`supported` does not endorse a diagnosis, treatment, disposition, complete
response, or deployment decision.

The corpus is defined in
[`local-binding-fixtures.ts`](../src/evaluation/local-binding-fixtures.ts).
Version: `local-binding-fixtures/v1`. SHA256 of
`JSON.stringify(buildLocalBindingFixtures())`, including labels and provenance:

```text
c3bc16292275afd0d35677b496b2665bf3a0c6384b7366369ae3947f8f8edcb1
```

There are 24 minimal pairs across 12 families. Each family contributes one
development pair and one distinct authored-validation pair. Each split has
24 rows: 12 supported controls and 12 unsupported defects. Within a pair,
**only the claim changes**; patient text and source text remain identical.
The families cover omitted versus denied facts, person and time attribution,
continuing versus new symptoms, reports versus measurements, named versus all
medications, source qualifiers, conditional eligibility, diagnostic definitions
versus assessment, functional impact, onset scope, and source contradiction.

The validation split changes wording and scenario within the same known
families. Shared authorship, family structure and label conventions limit its
independence. It measures transfer to these authored scenarios, not unseen
clinical failure classes, prospective patient performance or physician
alignment. Paired rows are related observations; a 48-row score should not be
presented as 48 independent clinical cases. Report controls, defects, valid
outputs and fully correct pairs separately. An abstention does not establish
support, and matching the authored label does not certify label correctness.

### Provenance and input boundary

Patient messages were newly written synthetic examples. Existing project
modules supplied engineering failure classes and, where present, retained
source excerpts. No physician routing labels, gold CSV rows or physician notes
were used to construct the corpus. Provenance records
`kind: engineering_authored` and `clinicalApproval: false` for every row.
The five pinned source snapshots are:

| Source | SHA256 |
| --- | --- |
| `src/disposition/fact-graph.ts` | `0e35b184627707c6807deb226311047ab8e4712e198943720c8a310c1245f5ac` |
| `src/evaluation/graph-judge-calibration.ts` | `ed5b80a3e0a9c086fcd8be0adf2bf126cb823f06d12042478079dd70219fb4f2` |
| `src/evidence/rag/source-application.ts` | `6f65cb0ec03f5e62251c98f4e96a64b2db31664aded09c316ec46bd612be5570` |
| `tests/onset-denial-admission.test.ts` | `17766407df52331692826f13416533a3616ea5cae994c9892e2530c9d82d4f67` |
| `src/evidence/rag/nhlbi-insomnia-candidate.ts` | `098672be26badf84cfeca38d73dcb516544cfea1e5c5ff542e5ad0b616a609f2` |

These hashes identify engineering snapshots; they are not evidence of current
clinical authority or clinician attestation. Tests require each supplied source
excerpt to occur verbatim in its pinned module.

`localBindingInput()` explicitly projects only `patient`, `claim` and
`sourceText`. IDs, family, split, variant, expected label, rationale and
provenance stay outside the model request. The corpus module imports nothing
and performs no file reads or model calls. The
[`fixture tests`](../tests/local-binding-fixtures.test.ts) lock the corpus hash,
pair balance, sole-claim changes, distinct split scenarios, source hashes,
literal excerpts and a 4,500-byte maximum serialized input. They also verify
that injected metadata properties cannot escape through the input projection.

### Known label ambiguity: development control 021

The stable fixture ID is
`lbf-v1-named-versus-all-medication-development-control`; the study serializes
it as `binding-021`. Its patient text says that the sumatriptan box is empty
and that other medicines have not been listed. The control claims: “The
patient has run out of sumatriptan.” The frozen authored label is `supported`.

That label uses an ordinary conversational inference from an empty named box
to an exhausted supply. Strict textual entailment permits another reading:
an empty box does not exclude additional sumatriptan elsewhere. A critic that
flags this gap may be applying a stricter evidence standard, rather than
confusing one medicine with every medicine. The matched defect broadens the
claim to every headache medicine, which the message does not establish.

Keep the frozen label and denominator unchanged, and disclose this ambiguity
when interpreting errors. Do not rescue a model's gate by relabeling or
dropping the row after observing results. A future corpus version can state
explicitly that no sumatriptan remains, or restrict the control to the empty
box, following independent review and a new predeclared study. This audit
changes no fixture, source, study or score.

## Cascade 8B import: no template correction needed

The existing `counsel-cascade-8b-q5` import has model digest
`9f4b89cbee529c485cbd37415e3ca8b59578557253e0fdf5a4a043f388575fdd`
and GGUF model-layer digest
`a2665d1e69930e45e5357530732a541bbe804957b57d5173038d02c80eb04feb`.
A read-only metadata comparison found its 4,621-byte embedded chat template
**byte-identical** to
[NVIDIA's pinned Thinking tokenizer config](https://huggingface.co/nvidia/Nemotron-Cascade-8B-Thinking/blob/3cdba69842230d125fbe7ca8ccc708931edd7af8/tokenizer_config.json).
Both template strings have SHA256:

```text
1d357aa3a95cc57d98140d0ecbff42761eb749ef73eb9766535878259887b4d8
```

The import has no Go template layer or renderer/parser directive. In
[Ollama v0.32.1 routing](https://github.com/ollama/ollama/blob/v0.32.1/server/routes.go#L2362),
that GGUF configuration selects native llama-server chat handling, with Jinja
enabled. The displayed default `TEMPLATE {{ .Prompt }}` does not establish
missing formatting. Preserve the import and use `think:true`:
[NVIDIA describes this model as thinking-only](https://huggingface.co/nvidia/Nemotron-Cascade-8B-Thinking#chat-template),
with ChatML and a leading-space ` /think` appended to the latest user message.

An attempted template probe used `debug_render_only`, omitting the underscore
in the actual
[`_debug_render_only` API field](https://github.com/ollama/ollama/blob/v0.32.1/api/types.go#L183).
The unrecognized field was ignored, so the request generated an arithmetic
answer: approximately 4.298 seconds server total, 2.430 seconds load, 29 prompt
tokens and 104 generated tokens. Preserve it as one incidental local smoke,
excluded from scored study counts; do not describe it as a token-free render
check. It used no paid provider and warmed the model before the scored run.
See the [frozen Cascade plan](LOCAL_CASCADE8B_PLAN_2026-09-15.md) for the
comparison contract and latency limitation. No additional inference was made
for this audit.
