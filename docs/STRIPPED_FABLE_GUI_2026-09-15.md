# Fable disposition GUI

The `/stripped` page connects a minimal TypeScript interface to the frozen **Fable 5.1 low-effort three-bucket protocol**. One submitted message produces one disposition and a short rationale through one Mastra workflow step and one native Anthropic Messages API call.

## Run locally

```bash
npm ci
npm run review:build
npm run start --workspace @counselcodex/evaluation
```

Open <http://localhost:4120/stripped>. Put `ANTHROPIC_API_KEY` in the repository-root `.env`, or supply it in the server environment. The key stays on the server. During this handoff, the new demo runs at <http://localhost:4121/stripped> alongside the existing server on port 4120.

Choose a synthetic sample, edit its text if desired, and click **Get disposition**. Editing clears the prior result; each submission is independent. Open **Request & response trace** to see the exact request body, final response text, run/provider IDs, usage, estimated cost, and latency. **Download trace JSON** saves the same record with browser receipt time. Traces omit hidden reasoning and signatures; the short rationale is the model's explanation.

## Frozen protocol

| Setting | Value |
| --- | --- |
| Model | `claude-fable-5-1` |
| Effort | `low` |
| Thinking | `adaptive` |
| Maximum output tokens | `4096` |
| System prompt SHA-256 | `80810b85df956d779709a71dbc0d85534f5847e2563b0be5235048cb254a03ce` |
| Buckets | `SELF_CARE`, `ASYNC_PHYSICIAN`, `URGENT_ESCALATION` |
| Provider calls | One per submitted message; zero retries or fallbacks |

The TS builder is tested against **all 50 frozen request JSON bodies**, including exact message bytes. Its parser reproduces all 50 stored parsed responses. The server receives only `{ message }`; the sample picker uses an existing projection of CSV IDs and messages. No physician reference, CSV label, case ID, prior conversation, tools, RAG, reply generator, queue, or clinical gate enters the provider request.

Mastra runs a standalone `stripped-fable-5-1` workflow with one `one-disposition` step. The native fetch call preserves the original payload. Neither the incumbent runtime nor the V25 graph is imported. Existing `/` and `/candidate` source files and historical artifacts remain unchanged.

## What the scores mean

| Frozen experiment | Physician scorecard A | CSV scorecard B |
| --- | --- | --- |
| Fable 5.1 low effort — used here | **44/49** | **31/50** |
| Fable 5.1 max effort | 42/49 | 31/50 |

The GUI preserves the configuration that produced 44/49; it does not rerun or replace that scorecard. Live calls can vary. The physician denominator excludes C25. CSV labels remain a separate score. See [three-bucket comparison](STRIPPED_3BUCKET_COMPARISON_2026-09-15.md) and [max-effort ablation](STRIPPED_3BUCKET_FABLE_MAX_2026-09-15.md).

**Higher agreement does not establish better clinical policy on the contested OTC/self-care gold labels.** This is a synthetic disposition demonstration, not a clinical-readiness or V25 promotion claim.

## Local accounting

An independent $2 demo allowance is earmarked within the prior reconciled $71.35035 remaining allocation. Each started request reserves a conservative worst-case token amount before dispatch. Completed calls record conservative usage charges; failed or unknown-usage calls retain their reservation. Records are append-only under `apps/evaluation/.local/stripped-disposition/` and survive browser cancellation and server restart. Do not delete those records to reset accounting. Historical budget ledgers are unchanged.

The HTTP adapter accepts local same-origin JSON requests, bounds message size, and limits concurrent calls to two. These transport and spend limits do not alter dispositions or queue clinical work. Pricing estimates reuse the frozen experiment's rates, not an invoice: $10/M input, $50/M output, $0.25/M cache reads, and conservative $20/M cache writes.

## Browser verification — 2026-09-15

Tested the production Next build through the Codex in-app browser. The selected message matched the submitted text; the loading state showed no preliminary disposition. Consecutive selections and editing cleared stale results.

| Input | Run ID | Visible final bucket | Provider time | Browser receipt |
| --- | --- | --- | --- | --- |
| C01 | `4619dbd2-5001-4f32-b018-ddbd5499eaf3` | `SELF_CARE` | 4.802 s | 4.99 s |
| C02 | `451a0307-8b44-48f1-a893-15e7eae3dec4` | `URGENT_ESCALATION` | 4.171 s | 4.18 s |
| C06 | `4709c058-d859-4013-8966-db500431f078` | `ASYNC_PHYSICIAN` | 4.601 s | 4.61 s |
| C06 edited to add crushing chest pressure, sweating, and left-arm pain | `020bc741-6523-4387-8623-0c12969e408d` | `URGENT_ESCALATION` | 3.688 s | 3.695 s |
| C01 changed to C06 while the call was running | `5cc53b5e-253c-492d-9b6d-9ea2161ae3c5` | Intentionally discarded; C06 stayed ready | 4.684 s | Not received |
| C06 on final build | `3ff60e45-6696-4371-8adc-a0f7b2e34dcd` | `ASYNC_PHYSICIAN` | 3.949 s | 3.96 s |

The edited-message trace downloaded successfully and its saved JSON was checked for matching run ID, disposition, one call, browser timing, and absence of hidden reasoning. The browser automation's download-event listener timed out even though the file was saved in Downloads; filesystem readback verified the actual download. No browser console errors or provider failures occurred. The in-flight edit check confirmed that the abandoned browser response never appeared under the newly selected message, while the server still saved the call and its cost.

All six calls are archived in [the GUI verification directory](../outputs/stripped-gui-2026-09-15/manifest.json). Total estimated cost: **$0.04081**; conservative accounted cost: **$0.05307**; reconciled remaining allocation: **$71.29728**. These are six synthetic UI checks, not a new benchmark.

## Validation

- Passed: `npm run lint`, `npm run typecheck`, `npm test` (851 passed, 48 skipped), `npm run review:test` (178 passed), `npm run review:build`, and `npm run build`.
- Focused tests exercise request parity, one-call execution through real Mastra with mocked transport, output parsing, trace projection, unknown usage, local origin, strict input, body timeout, and concurrent requests.
- The first sandboxed Mastra build stalled during dependency installation. It was stopped and the complete build passed with network access.
- Integrity audit: all 249 files protected by the frozen Fable manifest are unchanged; all 600 archived request/raw/parsed hashes across the four baseline runs match.
- Parent HealthCraft `make lint` still reports eight pre-existing Python import/line-length errors in `python/build_workbook.py`, `python/dispo_agent.py`, and `python/evaluate.py`. The nested Counsel lint passes.
