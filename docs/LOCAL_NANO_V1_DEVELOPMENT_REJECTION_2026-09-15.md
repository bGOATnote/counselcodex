# Nano non-thinking development pass: rejected

The frozen v1 configuration is **not useful as an offline binder critic** on
this development set. Validation remains unrun. No clinical candidate changed.

Freeze commit: `312d755`; plan
`f4fb7cb23d14cb1b20ac78d36e844810961dfc35a5ea400cabdc3c76b905b450`.
[Machine report](../outputs/local-nano-offline-v1-2026-09-15/report-2026-09-15T15-52-11.816Z.json).

| Development measure | Result |
| --- | ---: |
| First attempts | 24/24 |
| Schema-valid | 24/24 |
| Literal span integrity | 22/24 |
| Usable defect detections | 9/12 |
| Clean controls explicitly supported | 2/12 |
| False unsupported alarms on controls | 10/12 |
| Both members of a pair correct | 2/12 |
| Abstentions / transport failures | 0 / 0 |

The verdict errors are substantive. It required an external source to accept
the patient's own fever statement, treated "unreported" as a denial, rejected
two weeks being shorter than three months, said a four-year-old was outside
the source's older-than-two population, and confused the brother with the
patient. Two outputs placed patient quotes into the absent source field.
All failures remain saved; schema success does not imply reasoning success.

One control has an authored-label ambiguity: an empty sumatriptan box does not
strictly exclude another supply elsewhere. Keep the frozen label and result;
disclose this limitation. Even removing that control leaves nine clear false
alarms among the other eleven controls, so it does not change the decision.

Runtime inspection found native `RENDERER nemotron-3-nano` and
`PARSER nemotron-3-nano` in the archived Modelfile. `TEMPLATE {{ .Prompt }}`
alone was not evidence of a malformed import. The model digest matches the
imported GGUF. Native chat and structured output succeeded as configured.

Cold first attempt: 11.825 seconds, including 8.986 seconds loading. Warm 23:
median 1.875 seconds, nearest-rank p95 2.831 seconds. Total request wall time
59.055 seconds; 7,890 input tokens and 2,962 output tokens, zero thinking
characters. Ollama reported 26,330,278,132 bytes (24.52 GiB) model memory at
8,192 context. System swap used was 5696.94 MiB before and after, with no
observed swap-in/out growth. These are sampled runtime/system observations,
not exact peak RSS or proof of a sustained-load memory limit.

Paid provider calls: **0**. The run was fast but failed the predeclared utility
threshold. A single separate development revision is allowed by the original
plan. It must be frozen before generation; validation remains untouched until
selection. Do not introduce a new local model or change gold to fix this score.
