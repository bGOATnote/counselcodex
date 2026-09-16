# Actual GUI verification — phase 4

Five sequential, prospectively declared browser starts; four complete and one
withheld. All five raw journals and terminal runs are preserved alongside this
report. This is development verification, not a new physician score or a
replacement for the frozen 50-case cohort.

Production build `6FB29K6DhaScKy4MveF9S`; prompt
`1a86dc27cadf7dad4faa66c89b295968a6c4d822881c53570d60791eb7b5a867`.
Plan fingerprint `067372fadca3b6a5ec555a658363badedfed97397c97a2c9695d3fd7bd18387e`.
The original message and cleared previous response were checked before each
submission in the actual candidate GUI. The C50 update retained the original
message and explicitly attributed additional patient information.

| Case | Run | Browser observation | Receipt time |
|---|---|---|---|
| C10 | `8cf480b5-4c33-4a9b-a9a1-b67feb386a6d` | Standard async; Counsel clinician review, availability fallback, sources and trace rendered | Reply/final 73.26 s |
| C36 | `6a816488-b8e9-40c9-9d1e-18c8752b82ad` | Standard async; menstrual-cycle question did not block routing; no prescription authorized | Question 3.95 s; reply/final 62.86 s |
| C02 | `b0f8253c-97a0-4acb-9858-e6ddd124ba41` | Early 911/no-driving card was visually observed while generation continued; final EMS instruction and sources rendered | Action 3.38 s; reply/final 44.30 s |
| C50 | `76d9433d-3218-4349-9413-0e93e69ff516` | Priority async for the usual migraine/refill; no early emergency instruction; conditional safety net | Reply/final 65.30 s |
| C50 update | `d00e9457-0c05-43f9-9492-dc5e64f4c4e2` | Withheld: application rejected a genuine gradual-onset statement despite the final review accepting it | Terminal failure 62.68 s; no published reply |

Times above are displayed browser receipt/publication observations, **not paint
instrumentation**. Exact server times and hashes remain in `summary.json` and
individual runs. No direct HTTP response was substituted for a browser start.

## Failure and limits

The update was: “It came on gradually, like my usual migraines. No new weakness
or trouble speaking.” The final draft remained priority async. An initial
clinical review correctly narrowed a broader neurologic-denial claim and an
overstatement about the medication gap. After that repair, all seven final
judge criteria passed. The sole remaining failure was the application's
`usual_pattern_not_onset_denial`: its quote contained “usual” and lacked a
literal “not sudden”, even though the patient explicitly described gradual
onset. This is an admission defect, not evidence that “usual migraine” alone
excludes sudden onset. The original failure is retained; a correction requires
its own version and prospective retest.

C10 completed despite a rejected context extraction; bounded query hints were
retained but rejected clinical facts were not admitted. Completion does not
mean every stage was valid. This run used service-hours wording and therefore
does not reproduce the exact old C10 literal-timing defect; archived-packet
regression tests cover that wording.

C36 did not reproduce the exact prior vital-field repair branch. Its accepted
wording said that no readings were reported and that measurements were not
needed for this routing decision. A different wording bypassed the narrow
existing check. The deterministic historical-packet test establishes the
repair-permission fix, not a new clinical judgment about vital-sign necessity.
The broader materiality and brittle-language issues remain open.

These 44–73-second final responses do not meet the desired responsive final
experience. Preserving an early emergency instruction solves a different
requirement; it does not erase final-answer latency or a failed ordinary reply.

Five known-use attempts cost $2.608652 at the frozen full-rate token estimates.
The sprint accounting rule adds 25% plus $0.002 per assessment: **$3.270815**.
The generic capture summary's `knownUSD` and `conservativeAccountedUSD` fields
are base estimates; they are not the contingency-adjusted sprint total.
