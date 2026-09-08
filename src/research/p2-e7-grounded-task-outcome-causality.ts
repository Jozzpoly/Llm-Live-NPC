import type { DeterministicExecutor } from "../execution/deterministic-executor";
import type { ExecutionFrameResult } from "../execution/execution-driver";
import type {
  P2E0EvidenceRecord,
  P2E0ResidentCausalKernel
} from "./p2-e0-resident-causal-kernel";

export type P2E7OutcomeReconciliationResult =
  | { status: "recorded"; evidence: P2E0EvidenceRecord }
  | { status: "pending" }
  | { status: "rejected"; reason: "unimplemented" };

/**
 * P2-E7 research apparatus only.
 *
 * This boundary is intended to close the opposite side of P2-E6: a resident
 * task binding may become factual resident experience only from the exact
 * deterministic executor run and its real terminal execution/World outcome.
 *
 * The first RED keeps this deliberately unimplemented. The eventual boundary
 * must not accept caller-authored success/failure payloads as outcome authority,
 * and must not resolve the semantic matter merely because a mechanical task
 * reached a terminal state.
 */
export class P2E7GroundedTaskOutcomeBoundary {
  reconcile(
    resident: P2E0ResidentCausalKernel,
    executor: DeterministicExecutor,
    frame: ExecutionFrameResult
  ): P2E7OutcomeReconciliationResult {
    void resident;
    void executor;
    void frame;
    return { status: "rejected", reason: "unimplemented" };
  }
}
