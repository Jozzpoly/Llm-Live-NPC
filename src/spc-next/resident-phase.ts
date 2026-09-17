export function residentExecutionPhase(residentId: string, intervalTicks: number): number {
  if (typeof residentId !== "string" || residentId.trim().length === 0) {
    throw new Error("residentId must be non-empty");
  }
  if (!Number.isSafeInteger(intervalTicks) || intervalTicks < 1) {
    throw new Error("intervalTicks must be a positive integer");
  }
  if (intervalTicks === 1) return 0;
  return stableHash(residentId) % intervalTicks;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
