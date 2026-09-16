# V0 live interface

Local URL: <http://localhost:4120/v0>. Start with `npm run review:dev`.
The existing case-review home page includes a **V0 live demo** link; review
storage, backups and adjudication behavior are unchanged.

## What works

- Select or search the 50 supplied synthetic messages, or enter fictional text.
- **Run disposition** invokes the real `counsel-disposition-v0` Mastra graph:
  parallel emergency and intent branches, escalation gate, disposition router.
- The result displays the exact V0 instruction, operational route and rationale.
  Emergency and same-day routes remain separate. The instruction stays above
  expandable safety/source and execution details, never hidden inside them.
- Safety evidence includes the existing per-turn statement/vital-mention inventory.
  Source-linked research differentials appear only when the input exactly matches
  a supplied case. Editing a message invalidates that association. These briefs
  are labeled project-authored research support, not agent-generated reasoning.
- Execution details come from the actual Mastra run: unique run ID, step status,
  measured step timing, workflow ID and completion timestamp. They are not
  animation-derived or copied from the prediction CSV.

This is the deterministic V0 GUI, not the supervised LLM intake agent or the
retrospective CQA judges. No provider key or paid model call is used. No new
clinical performance evaluation or readiness claim is introduced.

## State, privacy and failure behavior

The page sends fictional input to a loopback-only Next.js POST endpoint. Execution
uses an ephemeral Mastra workflow without the Studio storage or payload exporter,
avoiding a second writer against the user's development trace database. It does
not write the message, result or a fabricated physician answer to a review store.
Reloading clears the draft; this is disclosed beside the input.

The endpoint checks the exact loopback host and same-origin request, requires the
local request marker and synthetic-only acknowledgment, rejects extra fields,
limits the message to 12,000 characters and streamed JSON to 64 KiB, times out
body reads and admits at most two active requests per handler instance. Errors
are sanitized and return no substitute clinical route. Responses are `no-store`.
The client blocks duplicate submissions, clears the previous result on a rerun,
and never presents an old result for modified input. These local controls are
not production authentication or authorization.

The app uses semantic form controls, native disclosures, visible focus states
and a two-panel layout that stacks on smaller screens. Four case shortcuts
replace the permanent inbox; all 50 messages remain searchable in an expandable
browser. Curated differentials appear in the default result with provenance.
Validation used actual component server rendering and local HTTP requests, not
browser screenshots or interaction testing; browser accessibility and usability
testing remain separate work.

## Counsel visual provenance

The user specifically requested Counsel's logo and style. The current public
[homepage](https://www.counselhealth.com/) and
[stylesheet](https://cdn.prod.website-files.com/68dd4bd4ddd2a6818d9fdde6/css/counsel-health.webflow.shared.c5ea92500.min.css)
were inspected on 2026-09-10. The new route uses the observed steel blue
`#243866`, ivory `#f6f4ed`, paper `#fffefc`, and robin blue `#bbdcea`, with rounded
controls. Existing adjudication styling is preserved.

The [official logo SVG](https://cdn.prod.website-files.com/68dd4bd4ddd2a6818d9fdde6/68dfd792a71a7e2788f92185_Logo.svg)
returned HTTP 200, `image/svg+xml`, with a `120 × 50` viewBox. The passive paths
are bundled at `apps/evaluation/public/counsel-logo.svg`; no external image request
or patient referrer is sent when the GUI displays it. The SVG is checked for
scripts, event attributes and external references.

The header now uses the fingerprint-style **C symbol**, not the handwritten
wordmark. Its [official Symbol.svg](https://cdn.prod.website-files.com/68dd4bd4ddd2a6818d9fdde6/68eccae24d64bde8934916fc_Symbol.svg)
is referenced on the homepage and health-plans page. All six paths and the
`50 × 51` viewBox are preserved at `apps/evaluation/public/counsel-symbol.svg`;
only the ivory fill changes to brand blue for contrast on this light background.
Restoring its original fill reproduces the source SHA-256
`4de2ef5d61939237ee1f1e934d37aeac29e1577322aecf063035f8d6e529f9d7`.

The C silhouette stays fixed. A traveling wave highlight is masked inside its
fingerprint lines, with a pause/play control; the previous underline waves are
removed. Reduced-motion preferences, print and browsers without CSS masking
keep a still symbol. This accent does not indicate agent activity or care status.

The site uses custom Cigars headings and Instrument Sans body text. This prototype
does not redistribute those website font files: it uses local serif/system
fallbacks. It is a brand-referenced take-home presentation, not an exact copy of
Counsel's proprietary product interface.

The interface visibly identifies itself as an independent take-home prototype,
not a Counsel service or endorsement. The logo remains third-party property;
public availability is not an open trademark license. See Counsel's
[terms, §§13–14](https://www.counselhealth.com/terms-of-service). No public
deployment was performed.

## Validation

`npm run review:test`, `npm run review:build`, `npm run typecheck`, `npm test`,
`npm run lint` and `git diff --check` passed for the concise-interface revision.
Total: 170 tests (64 workbench, 65 core, 23 Mastra/intake, 18 quality-audit).
The 50-case tests verify executable parity and preservation of every displayed
action, rationale and research-provenance label. This is comparison with
the existing V0; it does not turn development fit into clinical accuracy.

Local HTTP checks verified the page and logo return 200, and the new endpoint
returns distinct emergency-now and same-day-in-person results through four
actual workflow steps, with zero model calls. Stored clinician answers, source
messages and existing evaluation artifacts were not changed.
