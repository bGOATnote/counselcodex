import { routeWithMastra } from "../src/mastra/run.ts";
import { mastra } from "../src/mastra/legacy-index.ts";

try {
  const result = await routeWithMastra("Worst headache of my life, out of nowhere. It hit like a thunderclap.", "SMOKE-01");
  if (result.disposition !== "EMERGENCY_NOW" || !result.overrideBlocked) {
    throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
  }
  console.log(JSON.stringify({ status: "ok", workflow: "counsel-disposition-v0", result }, null, 2));
} finally {
  await mastra.shutdown();
}
