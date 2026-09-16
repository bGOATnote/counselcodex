function clone(value) {
  return structuredClone(value);
}

const TRACE_OUTPUT_FIELDS = Object.freeze([
  "status", "fired", "name", "subtype", "intent", "phenotype", "locked",
  "overrideBlocked", "disposition", "confidence", "redFlags", "layer", "errorCode",
]);

function traceOutput(value) {
  if (!value || typeof value !== "object") return { valueType: typeof value };
  const output = {};
  for (const field of TRACE_OUTPUT_FIELDS) {
    if (field in value) output[field] = clone(value[field]);
  }
  const guideline = value.guideline ?? value.history?.guideline;
  if (guideline?.id) output.guidelineId = guideline.id;
  if (guideline?.retrieval?.sourceId) output.retrievalSourceId = guideline.retrieval.sourceId;
  return output;
}

export function createTool(definition) {
  if (!definition?.id || typeof definition.execute !== "function") {
    throw new TypeError("A tool requires an id and execute function");
  }
  return Object.freeze({ ...definition, kind: "tool" });
}

export class Agent {
  constructor({ name, instructions, model = "local/deterministic", tools = {}, execute }) {
    if (!name || typeof execute !== "function") {
      throw new TypeError("An agent requires a name and execute function");
    }
    Object.assign(this, { name, instructions, model, tools, execute });
  }

  async generate(input) {
    return this.execute(clone(input));
  }
}

export function createStep(definition) {
  if (!definition?.id || typeof definition.execute !== "function") {
    throw new TypeError("A step requires an id and execute function");
  }
  return Object.freeze({ ...definition, kind: "step" });
}

export function createWorkflow({ id }) {
  if (!id) throw new TypeError("A workflow requires an id");
  const stages = [];
  let committed = false;

  const builder = {
    id,
    parallel(steps) {
      if (committed) throw new Error("Workflow is already committed");
      if (!Array.isArray(steps) || steps.length < 2) {
        throw new TypeError("parallel() requires at least two steps");
      }
      stages.push({ kind: "parallel", steps: [...steps] });
      return builder;
    },
    then(step) {
      if (committed) throw new Error("Workflow is already committed");
      stages.push({ kind: "step", step });
      return builder;
    },
    commit() {
      committed = true;
      return builder;
    },
    createRun() {
      if (!committed) throw new Error("commit() must be called before createRun()");
      return {
        async start({ inputData }) {
          let value = clone(inputData);
          const trace = [];
          for (const stage of stages) {
            if (stage.kind === "parallel") {
              const branchResults = await Promise.all(
                stage.steps.map(async (step) => {
                  const startedAt = performance.now();
                  const output = await step.execute({ inputData: clone(value) });
                  return {
                    id: step.id,
                    output,
                    trace: { step: step.id, mode: "parallel", durationMs: Number((performance.now() - startedAt).toFixed(3)), output: traceOutput(output) },
                  };
                }),
              );
              trace.push(...branchResults.map((branch) => branch.trace));
              value = Object.fromEntries(branchResults.map((branch) => [branch.id, branch.output]));
            } else {
              const startedAt = performance.now();
              value = await stage.step.execute({ inputData: clone(value) });
              trace.push({ step: stage.step.id, mode: "sequential", durationMs: Number((performance.now() - startedAt).toFixed(3)), output: traceOutput(value) });
            }
          }
          return { status: "success", result: value, trace };
        },
      };
    },
  };
  return builder;
}
