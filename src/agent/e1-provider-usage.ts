export interface E1ModelUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  neurons: number | null;
}

function boundedUsageNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER
    ? value
    : null;
}

function firstDefined(record: Record<string, unknown>, canonical: string, provider: string): unknown {
  return record[canonical] !== undefined ? record[canonical] : record[provider];
}

/**
 * Retains only the small provider usage surface needed for laboratory cost
 * provenance. Accepts either raw Workers AI snake_case or the already-normalized
 * browser wire shape; output is always the same canonical camelCase object.
 * Unknown provider metadata is deliberately discarded.
 */
export function normalizeE1ModelUsage(value: unknown): E1ModelUsage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const usage = value as Record<string, unknown>;
  const normalized: E1ModelUsage = {
    promptTokens: boundedUsageNumber(firstDefined(usage, "promptTokens", "prompt_tokens")),
    completionTokens: boundedUsageNumber(firstDefined(usage, "completionTokens", "completion_tokens")),
    totalTokens: boundedUsageNumber(firstDefined(usage, "totalTokens", "total_tokens")),
    neurons: boundedUsageNumber(usage.neurons)
  };

  return Object.values(normalized).some((entry) => entry !== null) ? normalized : null;
}
