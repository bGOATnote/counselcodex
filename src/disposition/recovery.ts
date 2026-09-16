import type { AgentExecution } from "./contract.ts";
import { EXECUTION_POLICY, requestDeadline } from "./execution-policy.ts";
import { abortable } from "./transport.ts";

export const RECOVERY_POLICY = Object.freeze({ version: "sequential-recovery/v2", attemptTimeoutMs: EXECUTION_POLICY.modelTimeoutMs, retryDelayMs: 1_000, maxAttempts: 2 });

/** Retry a failed transport, never a merely slow generation or clinical rejection.
 * Completion is admitted by the unchanged clinical checks after this function.
 * Every dispatched attempt, including unknown usage, remains in the audit record.
 * invoke must return a failure record and honor cancellation even for SDK stalls.
 */
export async function recoverGeneration({ invoke, signal, policy = RECOVERY_POLICY }: {
  invoke: (signal: AbortSignal, attempt: number) => Promise<AgentExecution>;
  signal: AbortSignal;
  policy?: { attemptTimeoutMs: number; retryDelayMs: number; maxAttempts: number };
}): Promise<{ selected: AgentExecution; attempts: AgentExecution[] }> {
  if (!Number.isSafeInteger(policy.attemptTimeoutMs) || policy.attemptTimeoutMs <= 0 || !Number.isSafeInteger(policy.retryDelayMs) || policy.retryDelayMs < 0 || ![1, 2].includes(policy.maxAttempts)) throw new Error("INVALID_RECOVERY_POLICY");
  signal.throwIfAborted();
  const started = performance.now();
  const attempts: AgentExecution[] = [];
  for (let number = 1; number <= policy.maxAttempts; number++) {
    const deadline = requestDeadline(signal, policy.attemptTimeoutMs);
    const offsetMs = Math.round(performance.now() - started);
    let result: AgentExecution;
    try { result = await invoke(deadline.signal, number); }
    finally { deadline.dispose(); }
    result.attempt = { number, offsetMs, selected: false, policy: RECOVERY_POLICY.version };
    attempts.push(result);
    // No speculative duplicate calls; no request/config/auth/rate-limit storms.
    if (!result.failure || signal.aborted || number === policy.maxAttempts || ["PROVIDER_AUTH_FAILED", "PROVIDER_REQUEST_REJECTED", "PROVIDER_RATE_LIMITED", "PROMPT_LIMIT_EXCEEDED", "RUN_CANCELLED", "GENERATION_SUPERSEDED"].includes(result.failure)) break;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await abortable(() => new Promise<void>(resolve => { timer = setTimeout(resolve, policy.retryDelayMs); }), signal); }
    catch { break; }
    finally { clearTimeout(timer); }
    if (signal.aborted) break;
  }
  const selected = attempts.at(-1)!;
  selected.attempt!.selected = true;
  return { selected, attempts };
}
