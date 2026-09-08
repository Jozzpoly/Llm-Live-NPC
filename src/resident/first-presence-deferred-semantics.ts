import { DeterministicExecutor } from "../execution/deterministic-executor";
import type {
  P2E0MatterState,
  P2E0ProposalCommitResult,
  P2E0ResidentCausalKernel
} from "../research/p2-e0-resident-causal-kernel";
import {
  P2E4SemanticProposalContextSeam,
  type P2E4SemanticProposalContextResult
} from "../research/p2-e4-semantic-proposal-context";
import {
  P2E5SemanticProviderAuthorityMembrane,
  type P2E5LocalProviderRun,
  type P2E5ModelSemanticInput,
  type P2E5SettlementResult
} from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary,
  type P2E9HoldArmResult,
  type P2E9HoldReleaseResult,
  type P2E9SemanticHold
} from "../research/p2-e9-semantic-reconsideration-hold";
import {
  SupersededTaskDispositionBoundary,
  type SupersededTaskDispositionResult
} from "./superseded-task-disposition";

export interface FirstPresenceDeferredExecution {
  executor: P2E9HoldAwareExecutor;
  holds: P2E9SemanticReconsiderationHoldBoundary;
}

export function createFirstPresenceDeferredExecution(
  innerExecutor = new DeterministicExecutor()
): FirstPresenceDeferredExecution {
  const holds = new P2E9SemanticReconsiderationHoldBoundary();
  return {
    holds,
    executor: new P2E9HoldAwareExecutor(innerExecutor, holds)
  };
}

export interface FirstPresenceDeferredSemanticAttempt {
  attemptId: number;
  matterId: string;
  modelInput: P2E5ModelSemanticInput;
  heldRunId: number;
  reusedExistingHold: boolean;
}

type FirstPresenceDeferredContextRejectionReason = Extract<
  P2E4SemanticProposalContextResult,
  { status: "rejected" }
>["reason"];

type FirstPresenceDeferredHoldRejectionReason = Extract<
  P2E9HoldArmResult,
  { status: "rejected" }
>["reason"];

export type FirstPresenceDeferredBeginResult =
  | { status: "pending"; attempt: FirstPresenceDeferredSemanticAttempt }
  | {
      status: "rejected";
      reason:
        | "matter_missing"
        | "matter_terminal"
        | "matter_not_active"
        | "no_active_task"
        | "task_binding_missing"
        | "task_not_semantically_superseded"
        | "held_run_conflict";
    }
  | {
      status: "context_rejected";
      reason: FirstPresenceDeferredContextRejectionReason;
    }
  | {
      status: "hold_rejected";
      reason: FirstPresenceDeferredHoldRejectionReason;
    };

export type FirstPresenceDeferredSettlementResult =
  | P2E5SettlementResult
  | {
      status: "attempt_rejected";
      reason: "unknown_attempt";
    }
  | {
      status: "provider_output_rejected";
      reason: Extract<P2E5SettlementResult, { status: "provider_output_rejected" }>["reason"];
      residentAuthority: "released" | "already_inactive";
    };

export type FirstPresenceDeferredAbandonResult =
  | {
      status: "abandoned";
      attemptId: number;
      matterId: string;
      heldRunId: number;
      residentAuthority: "released" | "already_inactive";
    }
  | { status: "attempt_rejected"; reason: "unknown_attempt" };

export type FirstPresenceDeferredResumeResult =
  | P2E9HoldReleaseResult
  | {
      status: "rejected";
      reason: "matter_missing" | "no_active_task" | "hold_not_active";
    };

export interface FirstPresenceDeferredState {
  pendingAttempts: Array<{
    attemptId: number;
    matterId: string;
    heldRunId: number;
    reusedExistingHold: boolean;
  }>;
  heldRuns: P2E9SemanticHold[];
}

interface AttemptAuthority {
  publicAttempt: FirstPresenceDeferredSemanticAttempt;
  providerRun: P2E5LocalProviderRun;
}

function cloneModelInput(input: P2E5ModelSemanticInput): P2E5ModelSemanticInput {
  return {
    currentSemanticCourse: input.currentSemanticCourse,
    semanticEvidence: {
      kind: input.semanticEvidence.kind,
      source:
        input.semanticEvidence.source.kind === "actor"
          ? { kind: "actor", actorId: input.semanticEvidence.source.actorId }
          : { kind: input.semanticEvidence.source.kind },
      summary: input.semanticEvidence.summary
    }
  };
}

function sameMatterDecision(a: P2E0MatterState, b: P2E0MatterState): boolean {
  return (
    a.id === b.id &&
    a.semanticCourse === b.semanticCourse &&
    a.semanticRevision === b.semanticRevision &&
    a.latestSemanticEvidenceId === b.latestSemanticEvidenceId
  );
}

/**
 * Product-adjacent owner for one deliberately narrow async Presence concern:
 * reconsidering a still-live matter while its older mechanical task is running.
 *
 * beginReconsideration() creates exact resident-owned semantic authority and
 * immediately holds the semantically superseded run. The caller may then send
 * only attempt.modelInput across an async/network boundary while the canonical
 * ExecutionDriver keeps advancing World/player time through the hold-aware
 * executor.
 *
 * settle() or abandon() consumes exactly the local attempt object. Abandonment
 * deliberately does not release the mechanical hold: provider failure is not a
 * semantic decision and therefore cannot silently resume obsolete behaviour.
 * A later retry over the still-current semantic dependency reuses that hold.
 *
 * After an applied current decision the caller must explicitly choose either
 * resumeHeldTask() or replaceHeldTask(). Time, provider failure and model text
 * never choose between those mechanical consequences on their own.
 */
export class FirstPresenceDeferredSemanticOwner {
  private readonly contextSeam = new P2E4SemanticProposalContextSeam();
  private readonly provider = new P2E5SemanticProviderAuthorityMembrane();
  private readonly disposition = new SupersededTaskDispositionBoundary();
  private readonly authorityByAttempt = new WeakMap<FirstPresenceDeferredSemanticAttempt, number>();
  private readonly attemptsById = new Map<number, AttemptAuthority>();
  private nextAttemptId = 1;

  constructor(
    private readonly resident: P2E0ResidentCausalKernel,
    private readonly execution: FirstPresenceDeferredExecution
  ) {}

  beginReconsideration(matterId: string): FirstPresenceDeferredBeginResult {
    const matter = this.resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status === "resolved" || matter.status === "cancelled") {
      return { status: "rejected", reason: "matter_terminal" };
    }
    if (matter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }
    if (matter.activeTaskRunId === null) {
      return { status: "rejected", reason: "no_active_task" };
    }

    const binding = this.resident.taskBinding(matter.activeTaskRunId);
    if (!binding || binding.matterId !== matter.id) {
      return { status: "rejected", reason: "task_binding_missing" };
    }
    if (binding.semanticRevision >= matter.semanticRevision) {
      return { status: "rejected", reason: "task_not_semantically_superseded" };
    }

    const ticket = this.resident.beginSemanticProposal(matterId);
    const context = this.contextSeam.build(this.resident, ticket);
    if (context.status !== "ready") {
      this.resident.releaseSemanticProposal(ticket);
      return { status: "context_rejected", reason: context.reason };
    }

    const providerRun = this.provider.prepare(context.context).run;
    const existingHold = this.execution.holds.holdForRun(binding.runId);
    let reusedExistingHold = false;

    if (existingHold) {
      if (
        existingHold.matterId !== matter.id ||
        existingHold.runId !== binding.runId ||
        existingHold.taskSemanticRevision !== binding.semanticRevision ||
        existingHold.reconsiderationSemanticRevision !== matter.semanticRevision ||
        existingHold.semanticEvidenceId !== matter.latestSemanticEvidenceId
      ) {
        this.provider.abandon(this.resident, providerRun);
        return { status: "rejected", reason: "held_run_conflict" };
      }
      reusedExistingHold = true;
    } else {
      const armed = this.execution.holds.arm(this.resident, this.execution.executor, ticket);
      if (armed.status !== "held") {
        this.provider.abandon(this.resident, providerRun);
        return { status: "hold_rejected", reason: armed.reason };
      }
    }

    const attempt: FirstPresenceDeferredSemanticAttempt = {
      attemptId: this.nextAttemptId++,
      matterId,
      modelInput: cloneModelInput(providerRun.modelInput),
      heldRunId: binding.runId,
      reusedExistingHold
    };
    this.authorityByAttempt.set(attempt, attempt.attemptId);
    this.attemptsById.set(attempt.attemptId, { publicAttempt: attempt, providerRun });
    return { status: "pending", attempt };
  }

  settle(
    attempt: FirstPresenceDeferredSemanticAttempt,
    rawProviderOutput: unknown
  ): FirstPresenceDeferredSettlementResult {
    const authority = this.takeAttempt(attempt);
    if (!authority) return { status: "attempt_rejected", reason: "unknown_attempt" };

    const result = this.provider.settle(this.resident, authority.providerRun, rawProviderOutput);
    if (result.status === "provider_output_rejected") {
      const abandoned = this.provider.abandon(this.resident, authority.providerRun);
      if (abandoned.status !== "abandoned") {
        throw new Error("Deferred semantic owner lost provider authority after output rejection.");
      }
      return {
        status: "provider_output_rejected",
        reason: result.reason,
        residentAuthority: abandoned.residentAuthority
      };
    }
    return result;
  }

  abandon(attempt: FirstPresenceDeferredSemanticAttempt): FirstPresenceDeferredAbandonResult {
    const authority = this.takeAttempt(attempt);
    if (!authority) return { status: "attempt_rejected", reason: "unknown_attempt" };

    const abandoned = this.provider.abandon(this.resident, authority.providerRun);
    if (abandoned.status !== "abandoned") {
      throw new Error("Deferred semantic owner lost provider authority before abandonment.");
    }
    return {
      status: "abandoned",
      attemptId: attempt.attemptId,
      matterId: attempt.matterId,
      heldRunId: attempt.heldRunId,
      residentAuthority: abandoned.residentAuthority
    };
  }

  resumeHeldTask(
    matterId: string,
    decision: P2E0ProposalCommitResult
  ): FirstPresenceDeferredResumeResult {
    const matter = this.resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.activeTaskRunId === null) {
      return { status: "rejected", reason: "no_active_task" };
    }
    const hold = this.execution.holds.holdForRun(matter.activeTaskRunId);
    if (!hold || hold.matterId !== matterId) {
      return { status: "rejected", reason: "hold_not_active" };
    }
    return this.execution.holds.release(
      this.resident,
      this.execution.executor,
      hold,
      decision
    );
  }

  replaceHeldTask(
    matterId: string,
    decision: P2E0ProposalCommitResult
  ): SupersededTaskDispositionResult {
    return this.disposition.dispose(
      this.resident,
      this.execution.executor,
      matterId,
      decision
    );
  }

  state(): FirstPresenceDeferredState {
    const pendingAttempts = [...this.attemptsById.values()].map(({ publicAttempt }) => ({
      attemptId: publicAttempt.attemptId,
      matterId: publicAttempt.matterId,
      heldRunId: publicAttempt.heldRunId,
      reusedExistingHold: publicAttempt.reusedExistingHold
    }));

    const heldRunIds = new Set<number>();
    for (const matter of this.resident.unresolvedMatters()) {
      if (matter.activeTaskRunId !== null) heldRunIds.add(matter.activeTaskRunId);
    }
    const heldRuns = [...heldRunIds]
      .map((runId) => this.execution.holds.holdForRun(runId))
      .filter((hold): hold is P2E9SemanticHold => hold !== null);

    return { pendingAttempts, heldRuns };
  }

  decisionIsCurrent(matterId: string, decision: P2E0ProposalCommitResult): boolean {
    if (decision.status !== "applied") return false;
    const matter = this.resident.matter(matterId);
    return !!matter && sameMatterDecision(matter, decision.matter);
  }

  private takeAttempt(attempt: FirstPresenceDeferredSemanticAttempt): AttemptAuthority | null {
    const attemptId = this.authorityByAttempt.get(attempt);
    if (attemptId === undefined) return null;
    const authority = this.attemptsById.get(attemptId);
    if (!authority || authority.publicAttempt !== attempt) return null;

    this.authorityByAttempt.delete(attempt);
    this.attemptsById.delete(attemptId);
    return authority;
  }
}
