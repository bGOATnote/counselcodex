# Evaluation workspace

Apply the [repository instructions](../../AGENTS.md) and use the
[engineering guide](../../docs/ENGINEERING_GUIDE.md) before changing this app.
The selected local demonstration is `/stripped`. `/candidate`, `/` and `/v0`
are historical surfaces; do not change their behavior as a side effect.

- Current page: `app/stripped/page.tsx`.
- UI and styles: `components/stripped-workbench.tsx` and
  `components/stripped-workbench.module.css`.
- Message-only examples: `lib/source-messages.ts`; no reference labels in requests.
- API: `app/api/stripped/route.ts` wires `lib/stripped-handler.ts` to
  `../../src/stripped/service.ts`. Credentials and accounting stay server-side.
- Handler tests: `tests/stripped-handler.test.ts`. Run `npm run review:test`
  and `npm run review:build` **from the repository root**; from this workspace,
  the equivalent scripts are `npm test` and `npm run build`.

There is no `src/` directory inside this workspace. Preserve loopback access,
request validation, stale-result clearing, and the existing trace projection.
Live submissions call the provider and append accounting records. Use synthetic
inputs only; mocked browser requests are not evidence of live provider behavior.
The generated framework block below is maintained by Next.js; preserve it.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
