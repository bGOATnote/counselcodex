# External spend ledger

Scope: four-hour architecture, trace, and evaluation pass requested September 5,
2026. Maximum authorized external spend: **$100 USD**.

| Activity | Calls | Actual spend | Decision |
|---|---:|---:|---|
| OpenAI model API | 0 | $0.00 | No credential present; not run |
| Anthropic model API | 0 | $0.00 | No credential present; not run |
| LLM-as-judge | 0 | $0.00 | Not justified without candidate outputs and clinician calibration |
| Deterministic reference ablation | 300 routes | $0.00 | Run locally |
| Deterministic red-team ablation | 210 routes | $0.00 | Run locally |
| Retrieval admission benchmark | 300 query-algorithm-seed evaluations | $0.00 | Run locally; sparse vectors only |
| Frozen retrieval holdout | 360 query-algorithm-seed evaluations | $0.00 | Governed hybrid not admitted; no post-hoc tuning |
| Agent-grader meta-evaluation | 12 planted/control cases × 7 graders | $0.00 | Run locally |
| Frozen agent orchestration holdout | 8 cases × 11 gates | $0.00 | Passed scripted Agent/tool/workflow contract only |
| Metamorphic reliability | 440 routes | $0.00 | Run locally |
| Mastra/local validation | local only | $0.00 | Run locally |
| Clinical benchmark deep research and executable readiness policy | primary/official sources; no inference | $0.00 | HealthBench, NOHARM, MedAgentBench, and adjacent instruments scoped; no benchmark score fabricated |
| HealthBench Consensus emergency reconstruction | 3 × 103 explicit-route evaluations | $0.00 | Always-emergency, never-emergency, and deterministic supervisor executed; all failed the joint safety/discernment gate |
| Clinical judge control plane | 9 deterministic scorers + 15 planted-mutation cases | $0.00 | Independent Mastra scorers, composite review lanes, imbalance/abstention/version-bias meta-evaluation; clinical LLM packs remain disabled |
| **Total** |  | **$0.00** | **Within $100 cap** |

The GPT/Claude bakeoff remains `proposed-not-run`. Before any paid run, record
provider pricing and model snapshots, estimate the entire trial matrix, set a
lower pilot cap, configure Mastra token-cost control as a best-effort tripwire,
set provider/account limits as the hard boundary, and reconcile usage afterward.
