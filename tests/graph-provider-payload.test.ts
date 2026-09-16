import test from "node:test";
import assert from "node:assert/strict";
import { Socket } from "node:net";
import { z } from "zod";
import { createGraphAgents, graphJudgeSchema, wireDraftSchema, graphRequestSettings, graphPromptHash } from "../src/disposition/clinical-graph.ts";
import { resolveGraphConfig } from "../src/disposition/graph-config.ts";
import { consumeStructuredStream, safetyEnvelopeTransport } from "../src/disposition/transport.ts";
import { GRAPH_INSTRUCTIONS, graphJudgeInstructions } from "../src/disposition/graph-prompts.ts";

type CapturedBody = {
  model: string;
  stream: boolean;
  thinking?: { type: string };
  output_config?: { effort?: string; format?: { type: string; schema: unknown } };
  reasoning?: { effort: string };
  max_tokens?: number;
  max_output_tokens?: number;
  text?: { format?: { type: string; strict?: boolean } };
  system?: { type: string; text?: string }[];
  messages?: { role: string; content: unknown }[];
  tools?: { name: string; input_schema?: unknown }[];
  tool_choice?: unknown;
};
function schemaNode(value: unknown, ...path: (string | number)[]): Record<string, unknown> {
  let node = value;
  for (const key of path) {
    assert.ok(node && typeof node === "object", `missing schema path ${path.join(".")}`);
    node = (node as Record<string | number, unknown>)[key];
  }
  assert.ok(node && typeof node === "object" && !Array.isArray(node), `invalid schema node ${path.join(".")}`);
  return node as Record<string, unknown>;
}

// This is SDK endpoint fidelity, not a clinical generation or latency test.
// Exercise the real Agent.stream -> ModelRouter -> provider adapter, then stop
// at fetch with an explicit error. Never fabricate a successful model answer.
// The low settings are shared with rawCall and graphPromptHash. The medium arm
// is explicitly experimental and is not selected by production configuration.
test("graph provider effort reaches the endpoint without external transport", { timeout: 20_000 }, async (t) => {
  const oldEnv = Object.fromEntries(["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "MASTRA_TELEMETRY_DISABLED"].map(k => [k, process.env[k]]));
  process.env.ANTHROPIC_API_KEY = "offline-test-not-a-key";
  process.env.OPENAI_API_KEY = "offline-test-not-a-key";
  process.env.MASTRA_TELEMETRY_DISABLED = "true";
  t.after(() => {
    for (const [key, value] of Object.entries(oldEnv)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });

  let attemptedSocketConnections = 0;
  // A future adapter bypassing fetch must fail locally, not escape to a real
  // provider. This also covers native http(s)/TLS transports through net.Socket.
  t.mock.method(Socket.prototype, "connect", () => {
    attemptedSocketConnections++;
    throw new Error("OFFLINE_TEST_EXTERNAL_TRANSPORT_BLOCKED");
  });
  const captured: { url: string; body: CapturedBody }[] = [];
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    assert.equal(request.method, "POST");
    assert.ok(["https://api.anthropic.com/v1/messages", "https://api.openai.com/v1/responses"].includes(request.url));
    captured.push({ url: request.url, body: JSON.parse(await request.text()) as CapturedBody });
    return new Response(JSON.stringify({ error: { type: "offline_capture", message: "Deliberately blocked before network." } }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  });
  // The real adapter reports the deliberate HTTP error. Suppress only console
  // noise in this isolated test; the returned failure is asserted below.
  t.mock.method(console, "error", () => {});
  const agents = createGraphAgents(resolveGraphConfig());
  for (const [role, effort] of [["disposition", "low"], ["disposition", "medium"], ["judge", "low"]] as const) {
    await t.test(`${role} / ${effort}`, async () => {
      const began = captured.length;
      const controller = new AbortController();
      // A referenced bound avoids Node22's unreferenced AbortSignal.timeout
      // exiting while a faulty/mock provider promise remains unsettled.
      const timer = setTimeout(() => controller.abort(new Error("OFFLINE_TEST_DEADLINE")), 5_000);
      try {
        const result = await consumeStructuredStream({ signal: controller.signal, start: abortSignal => agents[role].stream("Offline request-body fidelity test. No patient data.", {
          abortSignal,
          structuredOutput: { schema: safetyEnvelopeTransport(role === "judge" ? graphJudgeSchema : wireDraftSchema, z.unknown()), errorStrategy: "strict" },
          ...graphRequestSettings(role, resolveGraphConfig()),
          providerOptions: role === "judge" ? { openai: { reasoningEffort: effort } } : { anthropic: { thinking: { type: "adaptive" }, effort } },
        }) });
        assert.equal(result.output, null);
        assert.ok(result.failure, "the deliberate transport rejection must not become a model success");
        assert.equal(captured.length, began + 1, "exactly one intercepted request; no hidden structuring call or retry");
        const { url, body } = captured[began];
        assert.equal(body.stream, true);
        if (role === "judge") {
          assert.equal(url, "https://api.openai.com/v1/responses");
          assert.equal(body.model, "gpt-6-astra");
          assert.deepEqual(body.reasoning, { effort: "low" });
          assert.equal(body.max_output_tokens, 6144);
          assert.equal(body.text?.format?.type, "json_schema");
          assert.equal(body.output_config, undefined);
        } else {
          assert.equal(url, "https://api.anthropic.com/v1/messages");
          assert.equal(body.model, "claude-opus-5");
          assert.deepEqual(body.thinking, { type: "adaptive" });
          assert.equal(body.output_config?.effort, effort);
          assert.equal(body.output_config?.format?.type, "json_schema");
          assert.ok(body.output_config?.format?.schema);
          assert.equal(body.max_tokens, 2400);
          assert.equal(body.reasoning, undefined);
        }
        assert.equal(attemptedSocketConnections, 0);
      } finally { clearTimeout(timer); }
    });
  }
  const haikuConfig = resolveGraphConfig({
    COUNSEL_GRAPH_DISPOSITION_MODEL: "anthropic/claude-haiku-4-5",
    COUNSEL_GRAPH_JUDGE_MODEL: "anthropic/claude-haiku-4-5",
  });
  const haikuAgents = createGraphAgents(haikuConfig);
  for (const role of ["disposition", "judge"] as const) {
    await t.test(`${role} / Haiku actual production request settings`, async (st) => {
      const began = captured.length;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("OFFLINE_TEST_DEADLINE")), 5_000);
      const prompt = "Offline Haiku request-body fidelity test. No patient data.";
      try {
        const result = await consumeStructuredStream({ signal: controller.signal, start: abortSignal => haikuAgents[role].stream(prompt, {
          abortSignal,
          structuredOutput: { schema: safetyEnvelopeTransport(role === "judge" ? graphJudgeSchema : wireDraftSchema, z.unknown()), errorStrategy: "strict" },
          ...graphRequestSettings(role, haikuConfig),
        }) });
        assert.equal(result.output, null);
        assert.ok(result.failure, "the deliberate transport rejection must not become a model success");
        assert.equal(captured.length, began + 1, "one request only; no hidden formatting call or retry");
        const { url, body } = captured[began];
        assert.equal(url, "https://api.anthropic.com/v1/messages");
        assert.equal(body.model, "claude-haiku-4-5");
        assert.equal(body.stream, true);
        assert.equal(body.max_tokens, role === "judge" ? 6144 : 2400);
        assert.equal(body.thinking, undefined, "do not apply Opus adaptive-thinking options to Haiku");
        const systemText = body.system?.map(block => block.text ?? "").join("\n") ?? "";
        assert.ok(systemText.includes(role === "judge" ? graphJudgeInstructions("full") : GRAPH_INSTRUCTIONS.disposition), "the complete current role policy reaches the provider");
        assert.ok(JSON.stringify(body.messages).includes(prompt), "the exact user payload reaches the provider");
        assert.equal(body.output_config?.format?.type, "json_schema");
        const schema = body.output_config?.format?.schema;
        const requested = (role === "judge" ? graphJudgeSchema : wireDraftSchema).toJSONSchema();
        assert.equal(body.tools, undefined, "native output format, not a JSON tool fallback");
        assert.equal(body.tool_choice, undefined);
        assert.equal(systemText.includes('"properties"'), false, "schema is separate from the system prompt");
        assert.deepEqual(Object.keys(schemaNode(schema, "properties")), Object.keys(requested.properties ?? {}));
        assert.deepEqual(schemaNode(schema).required, requested.required);
        assert.equal(schemaNode(schema).additionalProperties, false);
        if (role === "disposition") {
          assert.deepEqual(schema, captured[0].body.output_config?.format?.schema, "Opus and Haiku receive the same provider-compatible disposition schema");
          assert.deepEqual(schemaNode(schema, "properties", "disposition").enum, schemaNode(requested, "properties", "disposition").enum);
          // Native structure is present, but Mastra's Anthropic compatibility
          // layer converts unsupported bounds/patterns into descriptions. These
          // are NOT provider grammar guarantees; local validation must remain.
          const citations = schemaNode(schema, "properties", "citations");
          assert.equal(citations.maxItems, undefined);
          assert.match(String(citations.description), /maximum length 4/);
          const quoteId = schemaNode(schema, "properties", "citations", "items", "properties", "quoteId");
          assert.equal(quoteId.pattern, undefined);
          assert.ok(String(quoteId.description).includes("^q\\d+$"));
          assert.deepEqual(schemaNode(schema, "properties", "citations", "items", "properties", "passageId"), { type: "string" }, "source identity still requires local binding to the retrieved packet");
        } else {
          const criterion = schemaNode(schema, "properties", "criteria", "items", "properties");
          assert.deepEqual(schemaNode(criterion, "id").enum, schemaNode(requested, "properties", "criteria", "items", "properties", "id").enum);
          assert.equal(schemaNode(schema, "properties", "criteria").maxItems, undefined);
          assert.match(String(schemaNode(schema, "properties", "criteria").description), /exact length 7/);
          assert.equal(schemaNode(criterion, "reason").maxLength, undefined);
          assert.match(String(schemaNode(criterion, "reason").description), /maximum length 350/);
          assert.equal(schemaNode(criterion, "anchors").maxItems, undefined);
          assert.match(String(schemaNode(criterion, "anchors").description), /minimum length 1, maximum length 3/);
          assert.equal(graphJudgeSchema.shape.criteria.element.shape.reason.safeParse("r".repeat(351)).success, false, "local length enforcement is not weakened by provider conversion");
          // Mode and activation are structurally independent in today's wire
          // contract. Contextual activation validity is a local clinical check,
          // not something the native JSON grammar can currently guarantee.
          const transport = schemaNode(schema, "properties", "transportReview", "anyOf", 0, "properties");
          assert.deepEqual(schemaNode(transport, "mode").enum, ["activate_ems", "continue_ems", "ed_now"]);
          assert.equal(schemaNode(transport, "activation", "anyOf", 0).type, "object");
          assert.equal(schemaNode(transport, "activation", "anyOf", 1).type, "null");
        }
        st.diagnostic(`${role}: native JSON schema and full policy delivered; length/cardinality constraints are descriptions, not grammar enforcement.`);
        assert.equal(attemptedSocketConnections, 0);
      } finally { clearTimeout(timer); }
    });
  }
  assert.equal(captured.length, 5);
  assert.equal(attemptedSocketConnections, 0);
});
test("effective request policy covers overrides, shadow extraction and bounded truncation recovery", () => {
  const config = resolveGraphConfig();
  assert.deepEqual(graphRequestSettings("disposition", config).providerOptions, { anthropic: { thinking: { type: "adaptive" }, effort: "low" } });
  assert.equal(graphRequestSettings("judge", config, true).modelSettings.maxOutputTokens, 9216);
  assert.equal(graphRequestSettings("context", { ...config, factGraphMode: "shadow" }).modelSettings.maxOutputTokens, 2400);
  const override = { ...config, models: { ...config.models, disposition: "openai/custom-model" } };
  assert.equal(graphRequestSettings("disposition", override).providerOptions, undefined);
  assert.notEqual(graphPromptHash(config), graphPromptHash(override));
  assert.equal(graphRequestSettings("judge", config).modelSettings.maxRetries, 0);
});
