# Open the current demonstration

The canonical live address is [http://localhost:4120/stripped](http://localhost:4120/stripped).
On another computer, follow the setup below; localhost refers to that computer,
not the presenter’s server. The public repository and saved documents can be
reviewed without starting a server.
This is the current three-bucket synthetic-message demonstration.
The launcher always uses port 4120 and binds the server to 127.0.0.1.

## Live GUI

From the repository root, using Node.js 22.18 or newer:

```bash
npm ci
npm run review:build
```

Set `ANTHROPIC_API_KEY` in the server environment or in a repository-root `.env`
file. The file is Git-ignored. The stripped demo needs only that provider key.

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
