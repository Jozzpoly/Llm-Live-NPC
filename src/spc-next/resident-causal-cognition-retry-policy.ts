/**
 * Shared backoff policy after one resident-level causal cognition admission attempt.
 *
 * This is intentionally separate from CognitionScheduler cadence:
 * scheduler intervals govern when unresolved semantic pressure may be dispatched under
 * ordinary conditions, while these delays create a fresh not-before boundary after an
 * explicit stale/rejected/provider-error settlement.
 *
 * Without this second boundary, a long provider latency can exhaust the scheduler's
 * min-interval before admission. Requeueing a stale batch would then immediately start
 * another provider request on the same World boundary.
 */
export const CAUSAL_STALE_RETRY_TICKS = 15;
export const CAUSAL_REJECT_RETRY_TICKS = 60;
export const CAUSAL_PROVIDER_ERROR_RETRY_TICKS = 120;

export function causalRetryDelayForStatus(
  status: "stale" | "rejected" | "provider_error",
): number {
  if (status === "stale") return CAUSAL_STALE_RETRY_TICKS;
  if (status === "rejected") return CAUSAL_REJECT_RETRY_TICKS;
  return CAUSAL_PROVIDER_ERROR_RETRY_TICKS;
}
