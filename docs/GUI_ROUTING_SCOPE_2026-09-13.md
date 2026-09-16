# Disposition GUI: routing boundary, not a task-management product

## Scope

The take-home asks for a lightweight disposition agent and an evaluation. The
clinician queue is a downstream integration boundary, not an additional product
the interviewer needs to operate. This change follows the applicant's explicit
request to stub that integration and simplify the header.

- Priority async and Standard async retain the same destination: Counsel clinician
  queue. Their internal priorities remain distinct.
- Completed async responses show that destination and priority, with an explicit
  unconnected-integration notice. Ownership and follow-up details are expandable.
- New GUI assessments no longer create or update local clinician-queue episodes.
  The original disposition, priority, and work-type fields remain available for a
  future adapter; there is no claim of successful transmission or acceptance.
- `/queue` is a small explanation of the stub. The retired queue API returns
  `501 QUEUE_INTEGRATION_NOT_CONNECTED` for GET and POST, including stale clients.
- The main header has only the original Counsel C symbol, title, and tagline.
  The logo is static. Queue navigation, previous-version review navigation, and
  animation playback controls are removed.
- Historical queue records and physician reviews are preserved. The review page
  remains accessible directly, but is not part of the main demo navigation.

No model, clinical prompt, evidence pool, care-setting taxonomy, queue policy,
or independent-review policy was changed. This is an interface/integration-scope
change, not an intervention claiming clinical lift.

## Verification

Passed: `npm run lint`, `npm run typecheck`, `npm test`, `npm run review:test`
(129 GUI tests), `npm run review:build`, and `npm run build`. Regression tests
cover both async priorities, absence of misleading handoff receipts, non-async
routes, header simplification, static logo, and retired API behavior.

After rebuilding and restarting the production app, the following consecutive
assessments were submitted through the actual browser at `http://localhost:4120/`.
All three completed; there were no failed assessment attempts in this rehearsal.
These are observed outputs, not physician-adjudicated reference answers.

| Input | Observed route | Final server time | Run ID |
|---|---|---:|---|
| Unchanged C50 usual migraine refill | Priority async | 21.480 s | `96a4ade8-59c9-45ba-a8f9-285d457eb881` |
| Same C50 thread plus fictional new arm weakness and slurred speech | Emergency now | 17.735 s | `ef4015bd-f88e-49d7-88a3-3b539b320f6c` |
| Unchanged C46 finasteride refill | Standard async | 16.759 s | `82ea3f49-b2c1-42c6-9683-30d18adbcfe7` |

The emergency update displayed an early 911 instruction while generation
continued and no async queue stub. The two async results displayed the same
destination with their respective priorities. The ownership disclosure and
the `/queue` stub were opened in the browser. The static, simplified header
was visually checked. Raw run artifacts are retained under
`apps/evaluation/.local/disposition-agent-v3/runs/`.

The existing independent-review pilot allocation was exhausted. The UI reported
that limitation; no new independent judge scores were obtained, and that
allocation was not increased for this interface change. Generation still used
Haiku intake and Opus assessment. Clinical wording and latency remain separate
evaluation concerns; successful completion is not clinical approval.

## Preservation checks

The supplied-case CSV SHA-256 remained
`d17771ed706c6866d2b13f2d7f5344824acf51aaf281b8af6368637586d71a15`.
All 55 files in `apps/evaluation/.local/review-backups/` were unchanged across
the live rehearsal. Their aggregate SHA-256 was
`986de7c1275d68bbe92b5fbf78c43fa1e4d9817c0d635b068a9164224f286baf`.
The aggregate hashes sorted `filename:SHA256(file bytes)` entries joined by a
newline. No physician answer was created or amended during GUI testing.
