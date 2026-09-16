# Native-thinking Nano development results

V2 improves on v1 but **fails the prespecified offline utility gate**.
All 24 first attempts completed with valid JSON and literal spans. It detected
12/12 defects and correctly supported 9/12 controls, with 3/12 false alarms and
9/12 fully correct pairs. No abstentions, retries or paid calls occurred.
Validation and mining remain unrun at this checkpoint.

[Final development report](../outputs/local-nano-offline-v2-2026-09-15/report-2026-09-15T16-01-30.593Z.json).
An earlier report at 16:00:27 was an interim snapshot while a request was still
running; its started-without-result row is not the final outcome. All raw and
interim artifacts remain preserved. Freeze commit `74203a7` and plan
`e861c03140181ea21f4179c2fafb0e0c70b23e44a818cea94675472e31274ef0`.

The three false alarms concern correct statements that a fact was not supplied
or that a prerequisite was not established. The model recognizes the absence
of a report but then demands an explicit report of that absence. This confuses
a statement about the supplied record with a negative clinical finding.

Independent review of all 24 reasoning/final pairs found **no verdict flips**.
All terminal reasoning verdicts agree with the final schema output. The native
two-phase handler is not the cause of these observed verdict errors. A no-format
transport ablation is therefore not warranted by this evidence.

V2's mode and cap differ from v1 together; this does not isolate either effect.
See the [runtime accounting correction](LOCAL_NANO_RUNTIME_ACCOUNTING_2026-09-15.md)
for the per-phase budget and final-reported token-count limitations. The full
request deadline remains the bound on total execution.

## Explicit development-plan amendment

The initial preregistration permitted one development revision, consumed by v2.
We are adding **one additional development-only prompt revision** before any
validation outputs have been generated or inspected. This is a disclosed
deviation from that initial limit, not a retrospectively preregistered result.
The user authorized continued local engineering within four hours; this small
clarification directly addresses the demonstrated mechanism while preserving
one local model. No physician routing labels or case-specific rules are added.

V3 will distinguish absence of a report from absence of a finding, recognize
patient text as evidence for what the patient reports, and permit ordinary
paraphrases/direct comparisons. No patient examples, condition names or fixture
IDs are added. Weights, native thinking, generation settings, schema, packets,
labels, task order, utility thresholds and first-attempt accounting stay fixed.

Run v3 development once, then freeze selection. No more prompt/model selection
after validation. The 24 validation rows still test newly authored variants in
the same families; multiple development configurations and small sample size
limit generalization. Local utility never establishes clinical promotion.
