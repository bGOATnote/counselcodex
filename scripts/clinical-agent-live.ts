import { runClinicalIntakeWithMastra } from "../src/mastra/run.ts";
import { mastra } from "../src/mastra/legacy-index.ts";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const message = argument("--message");
  if (!message) {
    throw new Error("Usage: npm run agent:live -- --message \"synthetic patient message\"");
  }

  const model = process.env.COUNSEL_CLINICAL_MODEL ?? "openai/gpt-5.6-sol";
  const requiredKey = model.startsWith("anthropic/") ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY";
  if (!process.env[requiredKey]) {
    throw new Error(`${requiredKey} is required for ${model}. No provider call was made.`);
  }

  const result = await runClinicalIntakeWithMastra({
    turns: [{ role: "patient", content: message }],
  });
  console.log(JSON.stringify({ model, artifact: "synthetic-research-only", result }, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Clinical intake failed.");
  process.exitCode = 1;
} finally {
  await mastra.shutdown();
}
