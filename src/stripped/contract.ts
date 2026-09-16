export type DispositionResult = {
  disposition: "SELF_CARE" | "ASYNC_PHYSICIAN" | "URGENT_ESCALATION";
  rationale: string;
};

export type StrippedRun = {
  id: string;
  status: "complete" | "error";
  createdAt: string;
  completedAt: string;
  message: string;
  protocol: { model: string; effort: string; promptSHA256: string };
  result: DispositionResult | null;
  error: string | null;
  trace: {
    workflowId: string;
    stepId: string;
    providerCalls: number;
    providerRequestId: string | null;
    latencyMs: number;
    usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number } | null;
    estimatedUSD: number | null;
    request: Record<string, unknown>;
    response: Record<string, unknown> | null;
  };
};
