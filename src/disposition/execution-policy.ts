/** Request allowances are not latency targets or clinical response guarantees.
 * Ten minutes follows Anthropic's documented SDK default for long requests;
 * Mastra uses a different transport, so this allowance is applied explicitly.
 * A valid 100-second response must not be cancelled simply for being slow.
 */
export const EXECUTION_POLICY = Object.freeze({
  version: "completion-first/v1",
  modelTimeoutMs: 600_000,
  reviewTimeoutMs: 600_000,
  reviewStaleAfterMs: 720_000,
  heartbeatMs: 15_000,
});

/** Disposable deadline: unlike a latency SLO, this only bounds a stuck request. */
export function requestDeadline(parent: AbortSignal, timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("INVALID_REQUEST_DEADLINE");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException("Model request allowance exceeded", "TimeoutError")), timeoutMs);
  return { signal: AbortSignal.any([parent, controller.signal]), dispose: () => clearTimeout(timer) };
}
