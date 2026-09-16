import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureResponse, researchFixtures } from "../data/cqa/research-fixtures.ts";
import { digest, type Episode } from "../src/cqa/contracts.ts";
import { type AuditReport, type JudgeCall } from "../src/cqa/engine.ts";
import { openResearchStore, validateCachedReport } from "../src/cqa/research-store.ts";
import { CQA_CRITERIA, CQA_RUBRIC_VERSION } from "../src/cqa/rubrics.ts";
import { createQualityJudges, createQualityJudgeInvoker } from "../src/mastra/agents/quality-judges.ts";
import { createQualityAuditWorkflow } from "../src/mastra/workflows/quality-audit-workflow.ts";
import { verifyScriptedDemo } from "./cqa-demo-verification.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const live = args.includes("--live");
const verify = args.includes("--verify");
const argument = (name: string) => args[args.indexOf(name) + 1];
const model = args.includes("--model") ? argument("--model") : "openai/gpt-6-astra";
const experimentId = args.includes("--experiment") ? argument("--experiment") : undefined;
const allowed = new Set(["--live", "--verify", "--model", "--experiment", "--case-ids"]);
for (let i = 0; i < args.length; i++) {
  if (!allowed.has(args[i])) throw new Error("Unknown argument. Use --verify or --live --experiment NAME [--model MODEL] [--case-ids CQA-004,CQA-002].");
  if (!["--live", "--verify"].includes(args[i])) { if (!args[++i] || args[i].startsWith("--")) throw new Error("Missing argument value"); }
}
if (verify && live) throw new Error("Scripted verification cannot make live provider calls.");
if (!live && args.some(arg => arg !== "--verify")) throw new Error("The scripted demo does not accept model or experiment options.");

async function main() {
  let fixtures = researchFixtures();
  if (args.includes("--case-ids")) {
    const selectedIds = argument("--case-ids").split(",");
    if (new Set(selectedIds).size !== selectedIds.length || selectedIds.some((id) => !fixtures.some(({ episode }) => episode.episodeId === id))) throw new Error("Unknown or duplicate case ID");
    fixtures = selectedIds.map((id) => fixtures.find(({ episode }) => episode.episodeId === id)!);
  }
  if (live) {
    if (!experimentId) throw new Error("Live research requires --experiment NAME; this identifies an immutable resumable run.");
    // Both allowlisted models fit the same conservative $2/call reservation at
    // the fixed context/output bound. Shared ledger remains $20 across vendors.
    if (!["openai/gpt-6-astra", "anthropic/claude-sonnet-5"].includes(model)) throw new Error("Model not cost-bounded for this pilot. Supported: openai/gpt-6-astra, anthropic/claude-sonnet-5.");
    const key = model.startsWith("anthropic/") ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
    if (!process.env[key]?.trim()) throw new Error(`${key} is required. No provider call was made. Keep keys in the ignored .env, not chat or Git.`);
  }
  const implementationFiles = ["src/cqa/contracts.ts", "src/cqa/engine.ts", "src/cqa/rubrics.ts", "src/cqa/research-store.ts", "src/mastra/agents/quality-judges.ts", "src/mastra/workflows/quality-audit-workflow.ts", "scripts/quality-audit-research.ts", "scripts/cqa-demo-verification.ts", "package-lock.json"];
  const implementationSha256 = digest(implementationFiles.map((path) => [path, readFileSync(join(root, path), "utf8")]));
  const manifest = {
    version: "cqa-research-run/v1", mode: live ? "provider" : "scripted", model: live ? model : "scripted-contract-fixture",
    rubricVersion: CQA_RUBRIC_VERSION, rubricSha256: digest(CQA_CRITERIA),
    implementationSha256,
    inputSha256: digest(fixtures.map(({ episode }) => episode)), syntheticOnly: true,
    temperature: "provider default", maxOutputTokens: 1500, concurrency: 3, retries: 0,
    evaluationBoundary: "Harness fixtures, not blinded clinical reference data. No clinical accuracy or lift is estimated.",
  };
  const store = live ? openResearchStore(join(root, "tmp/cqa-research"), experimentId!, manifest) : undefined;
  try {
    const liveJudge = store ? createQualityJudgeInvoker(createQualityJudges(model as "openai/gpt-6-astra" | "anthropic/claude-sonnet-5"), store,
      (record) => appendFileSync(join(store.directory, "provider-observations.jsonl"), JSON.stringify(record) + "\n", { mode: 0o600 })) : undefined;
    const cases: Array<{ title: string; episode: Episode; report: AuditReport }> = [];
    for (const fixture of fixtures) {
      const cachedPath = store ? join(store.directory, `${fixture.episode.episodeId}.json`) : undefined;
      let report;
      if (cachedPath && existsSync(cachedPath)) {
        report = validateCachedReport(JSON.parse(readFileSync(cachedPath, "utf8")), fixture.episode, manifest.rubricSha256);
      } else {
        // Live judges receive only the episode and criterion, never fixture mode,
        // scripted output, title, expected label, or any future source.
        const judge: JudgeCall = liveJudge ?? (async ({ criterion }) => ({ judgment: fixtureResponse(fixture, criterion.id), model: "scripted-contract-fixture" }));
        const workflow = createQualityAuditWorkflow(judge, `research-${fixture.episode.episodeId}`);
        const run = await workflow.createRun();
        const result = await run.start({ inputData: fixture.episode, tracingOptions: { hideInput: true, hideOutput: true } });
        if (result.status !== "success") throw new Error("RESEARCH_WORKFLOW_FAILED");
        report = result.result;
        if (!live) report = { ...report, findings: report.findings.map((finding) => ({ ...finding, elapsedMs: 0 })) };
        if (cachedPath) writeFileSync(cachedPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      }
      cases.push({ title: fixture.title, episode: fixture.episode, report });
    }
    const faultPairs = [["CQA-002", "uti_pregnancy_context"], ["CQA-008", "emergency_action"], ["CQA-008", "uti_pregnancy_context"], ["CQA-008", "uti_systemic_risk"]] as const;
    const output = { manifest, rubric: CQA_CRITERIA, cases, providerCallsMade: live ? "See persisted reservations; actual bill requires provider reconciliation." : 0,
      budget: store?.snapshot() ?? { reservedUsd: 0, actualBilledUsd: 0 },
      evidenceCheckAblation: live ? null : {
        design: "Paired deterministic fault injection; identical scripted judgments, with/without exact decision-time evidence checks. Not model performance.",
        invalidPassesInjected: faultPairs.length,
        unverifiedBaselineWouldAccept: faultPairs.filter(([episodeId, criterionId]) => {
          const raw = fixtureResponse(fixtures.find(({ episode }) => episode.episodeId === episodeId)!, criterionId) as { verdict?: string };
          return raw.verdict === "PASS";
        }).length,
        invalidPassesRetainedByVerifiedPipeline: faultPairs.filter(([episodeId, criterionId]) => cases.find(({ episode }) => episode.episodeId === episodeId)!.report.findings.find((finding) => finding.criterionId === criterionId)!.verdict === "PASS").length,
        limitation: "Exact spans prove provenance, not that a quotation supports the clinical verdict. An injection with schema-valid fabricated reasoning can still pass these checks.",
      },
    };
    // Historical outputs are immutable. Verification compares behavior while
    // recording current implementation identity separately; new demo artifacts
    // are content-addressed and never overwrite a different result.
    if (store) {
      console.log(JSON.stringify({ directory: store.directory, episodes: cases.length, budget: store.snapshot(), clinicalPerformanceMeasured: false }));
    } else if (verify) {
      const historical = JSON.parse(readFileSync(join(root, "outputs/cqa-research-demo-v1.json"), "utf8"));
      const verified = verifyScriptedDemo(output, historical, implementationSha256);
      console.log(JSON.stringify({ ...verified, episodes: cases.length, providerCalls: 0, clinicalPerformanceMeasured: false }));
    } else {
      const directory = join(root, "tmp/cqa-demo"), path = join(directory, `${implementationSha256}.json`), bytes = JSON.stringify(output, null, 2) + "\n";
      mkdirSync(directory, { recursive: true });
      if (existsSync(path)) { if (readFileSync(path, "utf8") !== bytes) throw new Error("Existing implementation demo differs; refusing to overwrite."); }
      else writeFileSync(path, bytes, { flag: "wx", mode: 0o600 });
      console.log(JSON.stringify({ demo: path, episodes: cases.length, providerCalls: 0, clinicalPerformanceMeasured: false }));
    }
  } finally { store?.close(); }
}
await main().catch((error) => {
  // Input contains only repository synthetic fixtures. Provider errors are
  // sanitized inside judgeJob; do not print provider error bodies here.
  console.error(error instanceof Error ? error.message : "Research run failed");
  process.exitCode = 1;
});
