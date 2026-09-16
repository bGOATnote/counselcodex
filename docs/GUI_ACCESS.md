# Open the demonstration and saved case review

| Surface | Entry point | Behavior |
| --- | --- | --- |
| Saved case review | [Public case index](https://bgoatnote.github.io/counselcodex/#index) · [standalone HTML](../publication/medgemma-case-review/index.html) | Inspect all 50 synthetic messages and saved results; no model calls. |
| Live three-bucket demonstration | [http://localhost:4120/stripped](http://localhost:4120/stripped) | Requires the local setup below; each submission makes one provider call. |

The public viewer was verified on 16 September 2026 after successful CI and
GitHub Pages deployment. The standalone HTML also works from a checkout or after
download. Localhost refers to the viewing computer, not the presenter’s server.
The live launcher binds port 4120 to 127.0.0.1.
[Publication and browser verification](CASE_REVIEW_HANDOFF_2026-09-16.md).
[Navigation and comparison refinement](CASE_REVIEW_REFINEMENT_2026-09-16.md).

## Saved comparison viewer

Open [the public index](https://bgoatnote.github.io/counselcodex/#index) or the
[standalone HTML](../publication/medgemma-case-review/index.html). The file works
offline; only source links need internet.

The viewer has two screens: the index contains all case links, search and filters;
a selected case shows its message and responses with the index hidden. The root
URL and `#index` open the index. Links such as `#C22`, `#C47` and `#C49` open a case.

The sticky header contains the Counsel logo, **Disposition Study**, **Repository**,
**Presentation view**, and a **Case index** link on the case screen. Presentation
view enlarges the message and cards. **Case index**, Escape or `/` returns to the
index, preserving search, filters and Nano repetition. Previous/Next moves through
the filtered cases; browser Back/Forward restores the index or case screen.

Physician Gold and original CSV cards show their labels and dispositions. Three
primary cards show saved Fable, MedGemma and Nemotron responses. **Record details**
holds each model’s configuration and source links. Under/over filters
use those three responses; the disagreement filter covers Fable versus MedGemma.
Nano defaults to baseline A repetition 1, with repetition 2 available.

**Historical pipeline · V25** stays collapsed and retains all 50 records,
including 23 incomplete releases. It does not contribute to the primary filters.
**About the study** holds reference limitations, provenance and the independent
project disclosure. The CSV remains discussion context; agreement is not clinical
validation.

## Live GUI

Start from a local checkout of the public repository:

```bash
git clone https://github.com/bGOATnote/counselcodex.git
cd counselcodex
```

If you already have a checkout, use that repository directory instead.

From the repository root, use Node.js 22.18.0 (the `.nvmrc` and CI version),
or Node.js 24.11+. Node 23 and early Node 24 releases are outside the dependency
engine range. With nvm installed, run `nvm install && nvm use` first:

```bash
npm ci
npm run review:build
```

Set `ANTHROPIC_API_KEY` in the server environment or in a repository-root `.env`
file. The file is Git-ignored. The stripped demo needs only that provider key.
The account must also be authorized to call the exact frozen model,
`claude-fable-5-1`, with the recorded low-effort settings. A general Anthropic
account does not establish access to this model. The repository does not grant
model access, and the launcher does not verify entitlement.

If the provider rejects authentication or model access, preserve the error and
use the saved artifacts below. Do not replace the model and present that output
as the frozen Fable result; a replacement would be a separate experiment.

```bash
npm run demo:check
npm run demo
```

The preflight checks the Node version, installed Next.js, production build, key
availability and loopback port. It does not print the key, validate it against a
provider, start a server or make a model call. A successful preflight therefore
does not establish provider authentication, credit availability or response quality.

After Next reports **Ready**, open [http://localhost:4120/stripped](http://localhost:4120/stripped). Keep the
terminal open. **Get disposition** makes a paid Anthropic call. The local $2 demo
allowance and saved traces live under
`apps/evaluation/.local/stripped-disposition/`; preserve that directory across
restarts. Do not submit real patient information.

Use **Ctrl+C** in the launcher terminal to stop its server. If port 4120 is
occupied, the launcher exits with an error. It does not stop existing processes
or select another port. Stop the server you own on 4120 and retry. A separately
started server on 4121 is not the canonical handoff; the launcher leaves it
untouched. The separate Mastra Studio server is not needed for this demo.

Rebuild with `npm run review:build` after changing GUI or workflow source. The
launcher runs the existing production build; it does not silently rebuild it.

## Saved artifacts: offline review

```bash
npm run demo:offline
```

This command only prints saved-file locations and exits. It needs no API key,
installed application dependencies, production build or listening server.
Node is needed to run the helper; the documents can also be opened directly:

- [Submission package](../output/submission-2026-09-15/README.md)
- [Presentation PDF](../output/submission-2026-09-15/counsel-disposition-take-home.pdf)
- [Revised adjudication workbook](../output/submission-2026-09-15/counsel-disposition-adjudication-v3.xlsx)
- [Frozen Fable requests, outputs and scorecards](../outputs/stripped-3bucket-fable-2026-09-15/)
- [Saved case viewer](../publication/medgemma-case-review/index.html): all 50 assignment messages, saved dispositions and rationales, physician v3 and separate CSV labels
- [Offline workflow-study viewer](../publication/workflow-study-review/README.md): download `index.html` and open it directly in a browser; all 98 messages and 1,568 saved decisions are embedded, with no server, account or external request

These are saved research artifacts, not a live replay or a new provider run.
The live GUI does not substitute frozen answers when configuration is missing.
For the older deterministic command-line rules demonstration, use
`npm run demo:rules`; it is a separate historical workflow.

## Data flow and disclosures

Live message text travels from the browser to the local server, then to Anthropic.
Local run files preserve synthetic inputs and outputs. Loopback hosting is not
offline inference or a privacy certification. See [project disclosures](../DISCLOSURES.md)
and [the security boundary](../SECURITY.md). Opening the page alone does not make
a model call. A selected synthetic case and any edits are the complete user
message; each submit is independent.
