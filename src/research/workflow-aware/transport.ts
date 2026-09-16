/** Isolated research transport. No application registration, fallback, or retry. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export type Model = "fable" | "nano";
export type RequestBody = Record<string, unknown>;
export type TransportInput = { model: Model; body: RequestBody; timeoutMs: number };
export type RawResponse = {
  status: number | null; requestId: string | null; responseText: string | null;
  latencyMs: number; completedAt: string; error: string | null;
};
export type Transport = (input: TransportInput) => Promise<RawResponse>;
export const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
export const NANO_BASE = "http://127.0.0.1:11434";
export const NANO_MODEL = "counsel-nano-q5";
export const NANO_RUNTIME_VERSION = "0.32.1";
// This is the legacy fallback template. The pinned model config selects the
// native nemotron-3-nano renderer instead; see nano-serving-provenance.json.
export const NANO_TEMPLATE_SHA256 = "b507b9c2f6ca642bffcd06665ea7c91f235fd32daeefdf875a0f938db05fb315";

export function createTransport(options: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Transport {
  const fetchImpl = options.fetchImpl ?? fetch;
  return async ({ model, body, timeoutMs }) => {
    assert(Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 300_000, "Invalid request timeout");
    assert(model === "fable" || model === "nano", "Invalid transport model");
    if (model === "fable") assert(options.apiKey, "ANTHROPIC_API_KEY required");
    const began = performance.now();
    let status: number | null = null, requestId: string | null = null, responseText: string | null = null, error: string | null = null;
    try {
      const response = await fetchImpl(model === "fable" ? ANTHROPIC_URL : `${NANO_BASE}/api/chat`, {
        method: "POST", headers: model === "fable"
          ? { "Content-Type": "application/json", "x-api-key": options.apiKey!, "anthropic-version": "2023-06-01" }
          : { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs), redirect: "error",
      });
      status = response.status;
      requestId = response.headers.get("request-id");
      const text = await response.text();
      if (options.apiKey && text.includes(options.apiKey)) error = "Provider body withheld because it contained a credential; no retry.";
      else responseText = text;
    } catch { error = "Transport failure or timeout; no retry."; }
    return { status, requestId, responseText, error, latencyMs: Math.round(performance.now() - began), completedAt: new Date().toISOString() };
  };
}

export async function verifyNanoIdentity(digest: string, fetchImpl: typeof fetch = fetch) {
  assert(/^(?:sha256:)?[a-f0-9]{64}$/.test(digest), "A full Nano digest is required");
  const response = await fetchImpl(`${NANO_BASE}/api/tags`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  assert.equal(response.status, 200, "Nano identity preflight failed");
  const data = await response.json() as { models?: { name?: string; model?: string; digest?: string }[] };
  const matches = (data.models ?? []).filter(m => [NANO_MODEL, `${NANO_MODEL}:latest`].includes(m.name ?? m.model ?? ""));
  assert.equal(matches.length, 1, "Nano model alias is absent or ambiguous");
  assert.equal(matches[0].digest?.replace(/^sha256:/, ""), digest.replace(/^sha256:/, ""), "Nano digest mismatch");
  return { model: NANO_MODEL, digest: matches[0].digest!, checkedAt: new Date().toISOString(), generationCalls: 0 };
}

export async function verifyNanoRuntime(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${NANO_BASE}/api/version`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  assert.equal(response.status, 200, "Nano runtime version lookup failed");
  const version = (await response.json() as { version?: string }).version;
  assert.equal(version, NANO_RUNTIME_VERSION, "Nano runtime version changed");
  const show = await fetchImpl(`${NANO_BASE}/api/show`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: NANO_MODEL }), signal: AbortSignal.timeout(15_000), redirect: "error" });
  assert.equal(show.status, 200, "Nano template lookup failed");
  const info = await show.json() as { template?: string; details?: { family?: string; parameter_size?: string; quantization_level?: string } };
  assert.equal(typeof info.template, "string", "Nano template unavailable");
  const templateSHA256 = createHash("sha256").update(info.template!).digest("hex");
  assert.equal(templateSHA256, NANO_TEMPLATE_SHA256, "Nano legacy template changed");
  return { version, templateSHA256, family: info.details?.family ?? null, parameterSize: info.details?.parameter_size ?? null,
    quantization: info.details?.quantization_level ?? null, unquantizedCheckpointProvenance: "not_verified", generationCalls: 0 };
}

export async function verifyFableAccess(apiKey: string | undefined, fetchImpl: typeof fetch = fetch) {
  assert(apiKey, "ANTHROPIC_API_KEY required");
  const response = await fetchImpl("https://api.anthropic.com/v1/models/claude-fable-5-1", {
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(30_000), redirect: "error",
  });
  assert.equal(response.status, 200, "Fable access preflight failed");
  const info = await response.json() as { id?: string; capabilities?: { effort?: { low?: { supported?: boolean } }; thinking?: { types?: { adaptive?: { supported?: boolean } } } } };
  assert.equal(info.id, "claude-fable-5-1", "Unexpected Fable model");
  assert(info.capabilities?.effort?.low?.supported && info.capabilities?.thinking?.types?.adaptive?.supported, "Frozen Fable settings unavailable");
  return { model: info.id, checkedAt: new Date().toISOString(), generationCalls: 0, adaptive: true, effort: "low" };
}

/** Explicit lifecycle operation; no prompt and no inference job. */
export async function unloadNano(fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`${NANO_BASE}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: NANO_MODEL, keep_alive: 0 }), signal: AbortSignal.timeout(30_000), redirect: "error" });
  assert.equal(response.status, 200, "Nano unload failed");
  const result = await response.json() as { done?: boolean; done_reason?: string };
  assert(result.done === true && result.done_reason === "unload", "Nano unload was not confirmed");
  return { model: NANO_MODEL, unloadedAt: new Date().toISOString(), done: true, doneReason: "unload", generationCalls: 0 };
}
