# Python compatibility CLI

This directory preserves a compatibility CLI. It delegates every disposition to
the authoritative TypeScript workflow and contains no independent clinical
rules. This avoids silent drift between implementations.

```bash
python3 dispo_agent.py
python3 evaluate.py
```

Node.js 22.18 or newer is therefore required. Only synthetic data is supported.

`evaluate.py` reports a development replay and label-audit diagnostics. It does
not report clinical performance: the 50 cases were visible during implementation
and the clinician-development labels are not an independent consensus reference.

`build_workbook.py` copies the canonical evidence-bounded clinical-review workbook
to `python/outputs/Counsel_Dispo_Evaluation.xlsx`. The retired workbook builder
called one reviewer's labels “clinician gold”; that path was removed so the
invalid claim cannot silently reappear. The workbook is complete for the
single-clinician take-home evaluation while keeping clinical performance blank.
