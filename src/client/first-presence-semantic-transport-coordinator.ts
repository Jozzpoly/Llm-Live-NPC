import type { P2E5ModelSemanticInput } from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  FirstPresenceDeferredSemanticOwner,
  type FirstPresenceDeferredAbandonResult,
  type FirstPresenceDeferredBeginResult,
  type FirstPresenceDeferredSettlementResult
} from "../resident/first-presence-deferred-semantics";
import {
  requestFirstPresenceSemanticProposal,
  type FirstPresenceSemanticTransportEnvelope
} from "./first-presence-semantic-api";

export type FirstPresenceSemanticTransportProvider = (
  input: P2E5ModelSemanticInput
) => Promise<FirstPresenceSemanticTransportEnvelope>;

type FirstPresenceDeferredBeginRejection = Exclude<
  FirstPresenceDeferredBeginResult,
  { status: "pending" }
>;

export interface FirstPresenceSemanticTransportDiagnostics {
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  usage: unknown;
}

export type FirstPresenceSemanticTransportRunResult =
  | {
      status: "not_started";
      begin: FirstPresenceDeferredBeginRejection;
    }
  | {
      status: "provider_returned";
      attemptId: number;
      matterId: string;
      heldRunId: number;
      reusedExistingHold: boolean;
      settlement: FirstPresenceDeferredSettlementResult;
      diagnostics: FirstPresenceSemanticTransportDiagnostics;
    }
  | {
      status: "transport_failed";
      attemptId: number;
      matterId: string;
      heldRunId: number;
      reusedExistingHold: boolean;
      error: string;
      abandonment: FirstPresenceDeferredAbandonResult;
    };

function describeTransportError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Browser-side owner for exactly one deferred semantic transport attempt.
 *
 * The coordinator deliberately accepts a matter id rather than a public attempt.
 * It asks the resident-owned deferred owner to mint the exact local attempt, then
 * sends only that attempt's frozen modelInput across the transport boundary.
 * The exact attempt object never leaves this process and is the only object later
 * presented back to settle()/abandon().
 *
 * A successful network response is still not a mechanical decision: this class
 * only settles semantic authority and returns the result. It never resumes,
 * replaces or cancels the held task. Likewise, transport failure abandons only
 * the exact provider attempt and deliberately leaves the mechanical hold intact.
 * Retry is a later explicit call, which mints a new attempt and may reuse that
 * same already-qualified hold.
 *
 * Only the awaited transport call is classified as transport failure. Resident
 * settlement/authority invariant exceptions are intentionally allowed to escape
 * rather than being mislabeled as network failures and hidden behind abandon().
 */
export class FirstPresenceSemanticTransportCoordinator {
  constructor(
    private readonly deferred: FirstPresenceDeferredSemanticOwner,
    private readonly transport: FirstPresenceSemanticTransportProvider =
      requestFirstPresenceSemanticProposal
  ) {}

  async reconsider(matterId: string): Promise<FirstPresenceSemanticTransportRunResult> {
    const begun = this.deferred.beginReconsideration(matterId);
    if (begun.status !== "pending") {
      return { status: "not_started", begin: begun };
    }

    const { attempt } = begun;
    let envelope: FirstPresenceSemanticTransportEnvelope;
    try {
      envelope = await this.transport(attempt.modelInput);
    } catch (error) {
      const abandonment = this.deferred.abandon(attempt);
      return {
        status: "transport_failed",
        attemptId: attempt.attemptId,
        matterId: attempt.matterId,
        heldRunId: attempt.heldRunId,
        reusedExistingHold: attempt.reusedExistingHold,
        error: describeTransportError(error),
        abandonment
      };
    }

    const settlement = this.deferred.settle(attempt, envelope.output);
    return {
      status: "provider_returned",
      attemptId: attempt.attemptId,
      matterId: attempt.matterId,
      heldRunId: attempt.heldRunId,
      reusedExistingHold: attempt.reusedExistingHold,
      settlement,
      diagnostics: {
        model: envelope.model,
        gatewayLogId: envelope.gatewayLogId,
        latencyMs: envelope.latencyMs,
        usage: envelope.usage
      }
    };
  }
}
