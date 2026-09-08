import { DeterministicExecutor } from "../execution/deterministic-executor";
import type {
  P2E0MatterState,
  P2E0ProposalCommitResult,
  P2E0ProposalTicket,
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
  readonly attemptId: number;
  readonly matterId: string;
  readonly modelInput: P2E5ModelSemanticInput;
  readonly heldRunId: number;
  readonly reusedExistingHold: boolean;
}

type FirstPresenceDeferredContextRejectionReason = Extract<
  P2E4SemanticProposalContextResult,
  { status: "rejected" }
>["reason"];

type FirstPresenceDeferredHoldRejectionReason = Extract<
  P2E9HoldArmResult,
  { status: "rejected" }
>["reason"];

type FirstPresenceDeferredBaseSettlementResult = Exclude<
  P2E5SettlementResult,
  { status: "provider_output_rejected" }
>;

export type FirstPresenceDeferredBeginResult =
  | { status: "pending"; attempt: FirstPresenceDeferredSemanticAttempt }
  | {
      status: "rejected";
      reason:
        | "matter_missing"
        | "matter_terminal"
        | "matter_not_active"
        | "matter_attempt_pending"
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
  | FirstPresenceDeferredBaseSettlementResult
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

export type FirstPresenceDeferredReplaceResult =
  | SupersededTaskDispositionResult
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
  attemptId: number;
  matterId: string;
  heldRunId: number;
  reusedExistingHold: boolean;
  ticket: P2E0ProposalTicket;
  providerRun: P2E5LocalProviderRun;
}

function cloneModelInput(input: P2E5ModelSemanticInput): P2E5ModelSemanticInput {
  const source =
    input.semanticEvidence.source.kind === "actor"
      ? { kind: "actor" as const, actorId: input.semanticEvidence.source.actorId }
      : { kind: input.semanticEvidence.source.kind };
  Object.freeze(source);

  const semanticEvidence = {
    kind: input.semanticEvidence.kind,
    source,
    summary: input.semanticEvidence.summary
  };
  Object.freeze(semanticEvidence);

  const clone: P2E5ModelSemanticInput = {
    currentSemanticCourse: input.currentSemanticCourse,
    semanticEvidence
  };
  return Object.freeze(clone);
}

function sameMatterDecision(a: P2E0MatterState, b: P2E0MatterState): boolean {
  return (
    a.id === b.id &&
    a.semanticCourse === b.semanticCourse &&
    a.semanticRevision === b.semanticRevision &&
    a.latestSemanticEvidenceId === b.latestSemanticEvidenceId
  );
}

function sameTicket(a: P2E0ProposalTicket, b: P2E0ProposalTicket): boolean {
  return (
    a.proposalId === b.proposalId &&
    a.matterId === b.matterId &&
    a.semanticRevision === b.semanticRevision &&
    a.semanticEvidenceId === b.semanticEvidenceId
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
 * Exactly one still-authoritative provider attempt is admitted per matter by
 * this owner. If newer semantic evidence revokes an older pending attempt, the
 * owner consumes that dead local provider authority before admitting the newer
 * attempt. The already-held mechanical run is conservatively reused: a newer
 * correction strengthens the reason not to resume it; it does not need a second
 * hold or a temporary execution window.
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
  private readonly knownHeldRunIds = new Set<number>();
  private nextAttemptId = 1;

  constructor(
    private readonly resident: P2E0ResidentCausalKernel,
    private readonly execution: FirstPresenceDeferredExecution
  ) {}

  beginReconsideration(matterId: string): FirstPresenceDeferredBeginResult {
    this.pruneInactiveAttempts(matterId);

    const matter = this.resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.status === "resolved" || matter.status === "cancelled") {
      return { status: "rejected", reason: "matter_terminal" };
    }
    if (matter.status !== "active") {
      return { status: "rejected", reason: "matter_not_active" };
    }
    if ([...this.attemptsById.values()].some((attempt) => attempt.matterId === matterId)) {
      return { status: "rejected", reason: "matter_attempt_pending" };
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
        existingHold.reconsiderationSemanticRevision > matter.semanticRevision
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
    this.knownHeldRunIds.add(binding.runId);

    const attemptId = this.nextAttemptId++;
    const attempt = Object.freeze({
      attemptId,
      matterId,
      modelInput: cloneModelInput(providerRun.modelInput),
      heldRunId: binding.runId,
      reusedExistingHold
    }) as FirstPresenceDeferredSemanticAttempt;
    const authority: AttemptAuthority = {
      publicAttempt: attempt,
      attemptId,
      matterId,
      heldRunId: binding.runId,
      reusedExistingHold,
      ticket,
      providerRun
    };
    this.authorityByAttempt.set(attempt, attemptId);
    this.attemptsById.set(attemptId, authority);
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
      attemptId: authority.attemptId,
      matterId: authority.matterId,
      heldRunId: authority.heldRunId,
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
    const result = this.execution.holds.release(
      this.resident,
      this.execution.executor,
      hold,
      decision
    );
    if (result.status === "released") this.knownHeldRunIds.delete(result.hold.runId);
    return result;
  }

  replaceHeldTask(
    matterId: string,
    decision: P2E0ProposalCommitResult
  ): FirstPresenceDeferredReplaceResult {
    const matter = this.resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "matter_missing" };
    if (matter.activeTaskRunId === null) {
      return { status: "rejected", reason: "no_active_task" };
    }
    const hold = this.execution.holds.holdForRun(matter.activeTaskRunId);
    if (!hold || hold.matterId !== matterId) {
      return { status: "rejected", reason: "hold_not_active" };
    }

    const result = this.disposition.dispose(
      this.resident,
      this.execution.executor,
      matterId,
      decision
    );
    if (result.status === "disposed") this.knownHeldRunIds.delete(result.record.runId);
    return result;
  }

  state(): FirstPresenceDeferredState {
    const pendingTickets = this.resident.pendingSemanticProposals();
    const pendingAttempts = [...this.attemptsById.values()]
      .filter((attempt) => pendingTickets.some((ticket) => sameTicket(ticket, attempt.ticket)))
      .sort((a, b) => a.attemptId - b.attemptId)
      .map((attempt) => ({
        attemptId: attempt.attemptId,
        matterId: attempt.matterId,
        heldRunId: attempt.heldRunId,
        reusedExistingHold: attempt.reusedExistingHold
      }));

    const heldRuns: P2E9SemanticHold[] = [];
    for (const runId of this.knownHeldRunIds) {
      const hold = this.execution.holds.holdForRun(runId);
      if (hold) heldRuns.push(hold);
    }
    heldRuns.sort((a, b) => a.runId - b.runId);

    return { pendingAttempts, heldRuns };
  }

  decisionIsCurrent(matterId: string, decision: P2E0ProposalCommitResult): boolean {
    if (decision.status !== "applied") return false;
    const matter = this.resident.matter(matterId);
    return !!matter && sameMatterDecision(matter, decision.matter);
  }

  private pruneInactiveAttempts(matterId?: string): void {
    const pendingTickets = this.resident.pendingSemanticProposals();
    for (const authority of [...this.attemptsById.values()]) {
      if (matterId !== undefined && authority.matterId !== matterId) continue;
      if (pendingTickets.some((ticket) => sameTicket(ticket, authority.ticket))) continue;

      const abandoned = this.provider.abandon(this.resident, authority.providerRun);
      if (abandoned.status !== "abandoned") {
        throw new Error("Deferred semantic owner lost stale provider authority during cleanup.");
      }
      this.discardAttempt(authority);
    }
  }

  private takeAttempt(attempt: FirstPresenceDeferredSemanticAttempt): AttemptAuthority | null {
    const attemptId = this.authorityByAttempt.get(attempt);
    if (attemptId === undefined) return null;
    const authority = this.attemptsById.get(attemptId);
    if (!authority || authority.publicAttempt !== attempt) return null;

    this.discardAttempt(authority);
    return authority;
  }

  private discardAttempt(authority: AttemptAuthority): void {
    this.authorityByAttempt.delete(authority.publicAttempt);
    this.attemptsById.delete(authority.attemptId);
  }
}
