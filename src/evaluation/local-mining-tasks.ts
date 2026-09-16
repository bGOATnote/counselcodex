import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export type LocalMiningInput = { patient: string; draft: string; sourceText: string | null };
type FileWitness = { sourcePath: string; sourceSha256: string };
export type LocalMiningTask = {
  id: string;
  kind: "mine" | "hard_negative";
  input: LocalMiningInput;
  provenance: FileWitness & {
    kind: "archived_synthetic" | "engineering_authored";
    clinicalApproval: false;
    dependencies: FileWitness[];
    excerptLocations: { patient: string; draft: string; source: string | null };
    sourcePassageSha256: string | null;
  };
};

export const LOCAL_MINING_MAX_INPUT_BYTES = 4_500;
const alignment = "outputs/application-alignment-2026-09-15/";
const diagnostic = "outputs/v25-path-b-complete-2026-09-15/runtime/diagnostic-runs/";
const gui = "outputs/fast-routing-v24-2026-09-14/gui/runs/";
const files = {
  a07: [alignment + "C07-candidate-result.json", "8a11a2b68206a7c1b63d82a9cf0868cd9afbdb991e794ff9891c2d11fa729929"],
  a21: [alignment + "C21-candidate-result.json", "9f878b658f2563c786c5dfae9e936633afd182bafe9f068a8522943593da1a64"],
  a34: [alignment + "C34-candidate-result.json", "daeb9d10b84ccef60480447bbd0832f9f94d1e116f76b8bd043ee53d0b57bb47"],
  a47: [alignment + "C47-candidate-result.json", "4874da158740659f800c3f960927b6373d360c60fade4b4c9a1f4aa2face0bb9"],
  b32: [alignment + "C32-baseline-result.json", "a0e63ef4d9bebca1a5cfdde365dd6d679b0bed044c6878f600ea8391c4776739"],
  a10: [alignment + "C10-candidate-result.json", "5e8b722404f5db91eba0af966ab72b6abb5dca32efaeb95dc8ea1a72330ee45c"],
  a02: [alignment + "C02-candidate-result.json", "07693b6c3342a7e4a8f331572c24b4b0aa8e69e2064290972ce1ff1cfd04f1ab"],
  a32: [alignment + "C32-candidate-result.json", "9d99875a229cee07d72b7d723d29c7e73353e48250d4a8429e9a39c3a2502f05"],
  r07: [diagnostic + "3e771e14-8903-449f-abc6-4be048c3b031.json", "8531c9043d37d354a13b9d99069bf6e0294ebb7b2a9fedb8df27f25fce5d118a"],
  r21: [diagnostic + "1ab16e82-605a-4379-95ee-b20a2b844f88.json", "f9f92483db61a5b5714fdaa478fd48ddc59fe119a3e757709ae84b26772f1d3e"],
  r34: [diagnostic + "e1783b50-dcb6-4227-b76a-88de16cf5af6.json", "6b88b74ae9be41c1afb83548ef26d26ce2609dde8128242f492353b3aeb15c5c"],
  r47: [diagnostic + "c97bb450-254b-4ab6-9b84-919257a202ff.json", "d621d021aeeb5a3284ba17ec11a09272c3006e6d2f9978b6315150ee4aca0783"],
  r32: [diagnostic + "b338cf05-a2fc-41c5-bafe-11168c04cf07.json", "2d3d1e437fa43563637605fc214c4ca7aab0b2a2fd7e0d0241f0a60fdbf7a27c"],
  r10: [diagnostic + "b3e27bf3-c08c-4f98-8a61-7c96474d05a9.json", "5c5f23ad74dc6d252f971cb68ebf26125713c4a4458ed3a2c64f66648b18ec41"],
  r02: [diagnostic + "8e869708-10bb-4a60-a75c-b00da6789d30.json", "fc952b3847fa6d116832b5e9ac7550d1514d3ddd2c2aa957a3f91b99958fae07"],
  v02: [gui + "73924ca1-7667-4105-a5ca-b2f68b83bb1c.json", "ceb3e4f380131f75f70a6ba36d943ba2050ddaa91658b56baf0ff991b4728169"],
  v30: [gui + "370e842e-198a-4e49-a4bb-8772a0fb68ce.json", "8c8238b43b4d63a462c34ccd175a4d3a21bbbe8d95958009b66a7d847a75a0e5"],
} as const;
type FileKey = keyof typeof files;
type Selection = {
  output: FileKey; patient: FileKey; field: string;
  passageId?: string; citation?: boolean;
};
const aom = "1b640fd18cef569933a0cf6a0f1baf3099d6e0277240fcca1446b8bebac4d1bc";

// Selected development examples, not a prevalence sample or new clinical labels.
// Only original raw-run fields are read. Plans, reports, evaluations and physician
// references are deliberately absent from this dependency list.
const selections: Selection[] = [
  { output: "a07", patient: "r07", field: "execution.output.redFlags.4" },
  { output: "a21", patient: "r21", field: "execution.output.redFlags.2" },
  { output: "a34", patient: "r34", field: "execution.output.redFlags.3" },
  { output: "a47", patient: "r47", field: "execution.output.redFlags.4" },
  { output: "b32", patient: "r32", field: "execution.output.citations.0", citation: true, passageId: aom },
  { output: "a10", patient: "r10", field: "execution.output.citations.1", citation: true, passageId: "f2d4f8eabd9f7286fd1f55ce50b3fb003e3fdb732e0bbd28862c99b5867d6045" },
  { output: "v02", patient: "v02", field: "agents.2.output.patientMessage" },
  { output: "v30", patient: "v30", field: "agents.1.output.citations.1", citation: true, passageId: "49eb6cc03505a6bae642e9a60b9dabcabfe2a7694ac8d6b2b7d9e76931fbcdf7" },
  // Hard-negative generation starts with intact archived factual/conditional
  // excerpts. Their selection does not certify the whole underlying answer.
  { output: "a02", patient: "r02", field: "execution.output.patientMessage" },
  { output: "a21", patient: "r21", field: "execution.output.redFlags.1" },
  { output: "a32", patient: "r32", field: "execution.output.citations.0", citation: true, passageId: aom },
  { output: "a47", patient: "r47", field: "execution.output.citations.1", citation: true, passageId: "a885e834a870d4a02febb4a39f2d048c9b00dee83725010a78f93f35419e0655" },
];

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
function field(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) throw new Error("LOCAL_MINING_FIELD_MISSING:" + path);
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}
function stringField(value: unknown, path: string): string {
  const found = field(value, path);
  if (typeof found !== "string" || !found.length) throw new Error("LOCAL_MINING_STRING_MISSING:" + path);
  return found;
}
function witness(key: FileKey): FileWitness {
  const [sourcePath, sourceSha256] = files[key];
  return { sourcePath, sourceSha256 };
}

/** Local development input only; no model calls, writes, gold joins or runtime imports. */
export function buildLocalMiningTasks(): LocalMiningTask[] {
  const loaded = new Map<FileKey, unknown>();
  const load = (key: FileKey): unknown => {
    if (!loaded.has(key)) {
      const [path, expected] = files[key], raw = readFileSync(path);
      if (sha256(raw) !== expected) throw new Error("LOCAL_MINING_ARCHIVE_CHANGED:" + path);
      loaded.set(key, JSON.parse(raw.toString("utf8")));
    }
    return loaded.get(key);
  };
  return selections.map((selection, index) => {
    const run = load(selection.patient), output = load(selection.output);
    const selected = field(output, selection.field);
    // Retain the producer's limitation and applicability together with its claim.
    // These are assertions under review, never expected labels or review feedback.
    const excerpt = selection.citation ? {
      claim: stringField(selected, "claim"),
      applicability: stringField(selected, "applicability"),
      limitation: stringField(selected, "limitation"),
    } : selected;
    const draft = typeof excerpt === "string" ? excerpt : JSON.stringify(excerpt, null, 2);
    let sourceText: string | null = null, sourceLocation: string | null = null;
    if (selection.passageId) {
      const retrieval = field(run, "graph.retrieval");
      if (!Array.isArray(retrieval)) throw new Error("LOCAL_MINING_RETRIEVAL_MISSING");
      for (const [retrievalIndex, item] of retrieval.entries()) {
        const hits = field(item, "hits");
        if (!Array.isArray(hits)) throw new Error("LOCAL_MINING_HITS_MISSING");
        for (const [hitIndex, hit] of hits.entries()) {
          if (field(hit, "chunk.id") !== selection.passageId) continue;
          const text = stringField(hit, "chunk.text");
          if (sha256(text) !== stringField(hit, "chunk.hash")) throw new Error("LOCAL_MINING_PASSAGE_CHANGED");
          if (sourceText !== null && sourceText !== text) throw new Error("LOCAL_MINING_AMBIGUOUS_PASSAGE");
          sourceText = text;
          sourceLocation = `graph.retrieval.${retrievalIndex}.hits.${hitIndex}.chunk.text`;
        }
      }
      if (sourceText === null) throw new Error("LOCAL_MINING_PASSAGE_MISSING:" + selection.passageId);
    }
    const input = { patient: stringField(run, "message"), draft, sourceText };
    if (Buffer.byteLength(JSON.stringify(input), "utf8") > LOCAL_MINING_MAX_INPUT_BYTES) throw new Error("LOCAL_MINING_INPUT_TOO_LARGE");
    return {
      id: `local-m${String(index + 1).padStart(2, "0")}`,
      kind: index < 8 ? "mine" : "hard_negative",
      input,
      provenance: {
        ...witness(selection.output), kind: "archived_synthetic", clinicalApproval: false,
        dependencies: [...new Set([selection.output, selection.patient])].map(witness),
        excerptLocations: { patient: "message", draft: selection.field, source: sourceLocation },
        sourcePassageSha256: sourceText === null ? null : sha256(sourceText),
      },
    };
  });
}

/** Project explicitly; never serialize a task or its provenance into model context. */
export function localMiningInput(task: LocalMiningTask): LocalMiningInput {
  return { patient: task.input.patient, draft: task.input.draft, sourceText: task.input.sourceText };
}
