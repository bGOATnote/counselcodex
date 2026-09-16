# Actual-browser verification — phase 1

Observed in the in-app browser at `http://localhost:4120/candidate` on 2026-09-14. Each sample was selected and its full message inspected before submission. These are selected development-case checks, not a random or held-out cohort. The eight complete run records and event journals are preserved under `capture-phase1/`. No failed run was dropped. The separately preserved timestamp amendment establishes the capture boundary before the first submission.

All eight used `evidence-graph/v23`, prompt hash `418202b680a3d05d5e78a7b7da739994f005529f09e96b3533709cf3a53f7f71`, Opus low and the full quoted judge. Times below are server-event measurements unless explicitly labeled browser receipt; they are not paint measurements.

| Case | Run | Observed behavior | Final time |
|---|---|---|---:|
| C13 | `514ff45a-05dd-483d-970d-8f50a7a5695e` | Standard async. A question about finger distribution appeared at 5.219 s but did not block routing. | 45.524 s |
| C13 update | `bf3ab373-04de-4dab-9530-ffac05bf6051` | Typed a gradual-onset update through the GUI. Original message remained in context. Standard async remained unchanged; no new question. | 41.292 s |
| C02 | `882be813-2bad-487f-9d54-ce39cd8860c3` | Call-911 instruction at 3.214 s remained prominent while the final emergency response completed. Visually inspected the early alert. | 42.030 s |
| C06 | `08665c39-4707-4cb7-9426-e2f9abbd4885` | Standard async after one patient-message repair added a medication-access fallback. Displayed the new NHLBI source and single-reading limitations. | 67.175 s |
| C07 | `6195de7e-979d-4f0c-9740-9c32b653bcb9` | Self care after one repair, with a nonblocking question at 3.745 s. Final message retained return precautions and unreported vaccination status. | 77.419 s |
| C16 | `dc307e46-b9dc-4aee-b95a-bd80c1b7a60f` | Early ED action at 3.993 s. An explicit revision then explained a defensible same-day pediatric assessment alternative with access/ED fallback. This is model-supported alternative evidence, not new physician agreement. | 50.238 s |
| C48 | `bee723c7-fd70-463f-afb0-bcef69e6374e` | **Early same-day advice at 7.235 s was inadequate for the reported post-fall severe hip pain and inability to bear weight.** Final EMS advice appeared with an explicit correction; the early defect remains part of the record. | 79.613 s |
| C30 | `eccd69f4-feef-4938-b31a-e185854bff61` | Self care after one repair. Local expected rash evolution did not itself trigger async priority or emergency routing. | 70.55 s |

The exact C13 update entered was: “It came on gradually over several days, not suddenly. There is still no weakness or trouble speaking.”

Browser receipt displayed approximately 4.00 s early / 50.25 s final for C16, 7.25 s early / 79.62 s final for C48, and 70.57 s final for C30. These include HTTP overhead, not measured rendering time. Other client times were not transcribed and are not inferred from server times. A slow automation click on C07 is not reported as clinical latency.

All eight traces and event journals persisted. Known token-price estimate: **$3.457649**, before the sprint's conservative accounting contingency; zero unknown-usage attempts. Eight completed UI runs do not establish clinical accuracy, reliability, or acceptable latency. C48 motivated a separately frozen safety-role comparison; no retrospective alteration of this phase is allowed.

Additional content requiring caution: C06's phrase “two stable years” may overstate two years of medication use plus a current home reading; C30's statement of a rash limited to the forearms must not imply that unreported examination findings were assessed. Neither passing software checks nor a model judge resolves those clinical questions.
