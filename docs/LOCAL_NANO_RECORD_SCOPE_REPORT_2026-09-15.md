# Record-scope revision: no utility promotion

The final v3 development pass also **fails the offline utility gate**.
It completed 24/24 requests with schema-valid output; 22/24 had valid exact
spans. Usable detections were 11/12 defects and 8/12 controls, with three false
alarms and eight fully correct pairs. Two source quotations spliced text or
otherwise failed exact passage identity. All failed outputs remain preserved.

[Final development report](../outputs/local-nano-record-scope-2026-09-15/report-2026-09-15T16-12-32.745Z.json).
Freeze commit `9b8e6cb`, plan
`151845ef082fc3d61200da065f9c524112fecaf8f89958572d32dab87e544758`.
This evaluated configuration is distinct from the two zero-call wording-review
preflights. No validation example has been executed.

The second development revision was a disclosed amendment beyond the initial
limit. It did not improve utility. We will not add more prompt revisions or
relax thresholds. The best measured Nano configuration remains native thinking
with the original v1 prompt (v2), which nevertheless failed on three controls.

## Justified optional-model comparison

The user explicitly allowed the on-disk Cascade 8B when needed. Persistent
false alarms after the bounded Nano work justify **one model comparison**.
Use the same prompt, schema, reasoning setting, per-phase budget, temperature,
seed, packets/order, labels and utility gate as the best Nano arm, v2. Change
only the model identity/digest, and run the 24 development requests once.
Keep one model loaded and one worker. No downloads or paid calls are needed.

Freeze the 8B plan after import metadata confirms local compatibility. If it
passes, select it before the one authored validation pass and the separately
reviewed mining/negative tasks. If it fails, report that neither tested model
earned automatic offline-critic utility; any further mining remains exploratory
and human-reviewed, not a post-hoc validation win. No prompt/model shopping
after validation and no clinical/live promotion follow from this comparison.
