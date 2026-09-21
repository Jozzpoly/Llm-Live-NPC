import type { CognitionFetch } from "./resident-cognition-live-host";

export interface CognitionFetchHardBudgetSnapshot {
  readonly maxUpstreamRequests: number;
  readonly attemptedRequests: number;
  readonly upstreamRequestsStarted: number;
  readonly blockedRequests: number;
  readonly exhausted: boolean;
}

export interface CognitionFetchHardBudget {
  readonly fetch: CognitionFetch;
  snapshot(): CognitionFetchHardBudgetSnapshot;
}

/**
 * Exact local hard-stop around an arbitrary cognition fetcher.
 *
 * This is intentionally smaller than a pricing/billing subsystem. Its only authority
 * is whether another upstream request may physically start from this fetch path.
 *
 * The counter is consumed before awaiting upstream work, so concurrent callers cannot
 * race past the cap. Requests above the cap receive a local bounded HTTP error and
 * never reach the wrapped fetcher.
 *
 * Intended first use: bounded real-provider experiments after the September runaway.
 * A one-request experiment remains one upstream request even if the resident scheduler
 * or retry loop later misbehaves.
 */
export function createCognitionFetchHardBudget(
  upstream: CognitionFetch,
  maxUpstreamRequests: number,
): CognitionFetchHardBudget {
  if (!Number.isSafeInteger(maxUpstreamRequests) || maxUpstreamRequests < 1) {
    throw new Error("cognition fetch hard budget must be a positive safe integer");
  }

  let attemptedRequests = 0;
  let upstreamRequestsStarted = 0;
  let blockedRequests = 0;

  const fetcher: CognitionFetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    attemptedRequests += 1;

    if (upstreamRequestsStarted >= maxUpstreamRequests) {
      blockedRequests += 1;
      return new Response(JSON.stringify({
        ok: false,
        code: "experiment_request_budget_exhausted",
      }), {
        status: 429,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
        },
      });
    }

    // Consume authority synchronously before the first await.
    upstreamRequestsStarted += 1;
    return upstream.call(globalThis, input, init);
  };

  return {
    fetch: fetcher,
    snapshot(): CognitionFetchHardBudgetSnapshot {
      return {
        maxUpstreamRequests,
        attemptedRequests,
        upstreamRequestsStarted,
        blockedRequests,
        exhausted: upstreamRequestsStarted >= maxUpstreamRequests,
      };
    },
  };
}
