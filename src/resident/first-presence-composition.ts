import { DeterministicExecutor } from "../execution/deterministic-executor";
import {
  ExecutionDriver,
  type ExecutionFrameResult
} from "../execution/execution-driver";
import type { EntityId } from "../world/types";
import { World } from "../world/world";
import {
  P2E0ResidentCausalKernel,
  type P2E0EvidenceRecord,
  type P2E0MatterState
} from "../research/p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "../research/p2-e2-communication-runtime-boundary";
import {
  P2E4SemanticProposalContextSeam,
  type P2E4SemanticProposalContextResult
} from "../research/p2-e4-semantic-proposal-context";
import {
  P2E5SemanticProviderAuthorityMembrane,
  type P2E5ModelSemanticInput,
  type P2E5SettlementResult
} from "../research/p2-e5-semantic-provider-authority-membrane";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder,
  type P2E6PrepareResult,
  type P2E6StartResult
} from "../research/p2-e6-grounded-task-start-causality";
import {
  P2E7GroundedTaskOutcomeBoundary,
  type P2E7OutcomeReconciliationResult
} from "../research/p2-e7-grounded-task-outcome-causality";

/**
 * Deterministic in-process semantic stub used only by the first composition
 * slice. Live/async provider transport is intentionally deferred until its
 * admission, timeout and retry ownership can be composed explicitly.
 */
export type FirstPresenceSemanticProvider = (
  input: P2E5ModelSemanticInput
) => { semanticCourse: string };

type FirstPresenceTraceEvent =
  | {
      kind: "experience";
      matterId: string;
      evidenceId: string;
      summary: string;
    }
  | {
      kind: "semantic_commit";
      matterId: string;
      proposalId: number;
      semanticEvidenceId: string;
      fromRevision: number;
      toRevision: number;
      fromCourse: string;
      toCourse: string;
    }
  | {
      kind: "task_started";
      matterId: string;
      taskId: string;
      runId: number;
      semanticRevision: number;
    }
  | {
      kind: "task_outcome";
      matterId: string;
      runId: number;
      evidenceId: string;
      summary: string;
    };

export type FirstPresenceTraceRecord = FirstPresenceTraceEvent & { seq: number };

type FirstPresenceContextRejectionReason = Extract<
  P2E4SemanticProposalContextResult,
  { status: "rejected" }
>["reason"];

export type FirstPresenceReconsiderResult =
  | P2E5SettlementResult
  | {
      status: "context_rejected";
      reason: FirstPresenceContextRejectionReason;
    };

export type FirstPresenceTaskStartResult = P2E6PrepareResult | P2E6StartResult;

export type FirstPresenceStepResult = {
  frame: ExecutionFrameResult;
  outcome: P2E7OutcomeReconciliationResult | null;
};

/**
 * First product-adjacent composition experiment.
 *
 * This is deliberately narrower than a final Mind/Resident API. It composes
 * already-qualified Pass-2 causal seams around the recovered World/executor so
 * one explicitly-admitted matter can travel through grounded experience ->
 * semantic proposal -> local task -> factual World outcome while a small
 * bounded owner-level trace preserves the causal joins needed for debugging.
 *
 * Communication ingress and matter admission are intentionally separate. This
 * owner does not decide that every heard utterance becomes an unresolved matter.
 * The semantic provider is deliberately synchronous/deterministic in Slice 1,
 * so async provider admission/retry authority is not accidentally selected.
 * The owner also does not yet choose attention, interruption, semantic
 * satisfaction, terminal retention or browser presentation.
 */
export class FirstPresenceComposition {
  readonly resident = new P2E0ResidentCausalKernel();

  private readonly communication: P2E2CommunicationRuntimeBoundary;
  private readonly contextSeam = new P2E4SemanticProposalContextSeam();
  private readonly providerMembrane = new P2E5SemanticProviderAuthorityMembrane();
  private readonly taskStart = new P2E6GroundedTaskStartBoundary();
  private readonly taskOutcome = new P2E7GroundedTaskOutcomeBoundary();
  private readonly driver: ExecutionDriver;
  private readonly traceValue: FirstPresenceTraceRecord[] = [];
  private nextTraceSeq = 1;
  private nextMatterSeq = 1;

  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor,
    private readonly semanticProvider: FirstPresenceSemanticProvider,
    private readonly grounder: P2E6LocalTaskGrounder,
    private readonly actorId: EntityId = "npc.001",
    private readonly traceLimit = 32
  ) {
    if (!Number.isInteger(traceLimit) || traceLimit <= 0) {
      throw new Error(`First Presence trace limit must be a positive integer: ${traceLimit}`);
    }
    this.communication = new P2E2CommunicationRuntimeBoundary(
      this.world,
      new Map([[this.actorId, this.resident]])
    );
    this.driver = new ExecutionDriver(this.world, this.executor);
  }

  receiveDirectPlayerSpeech(text: string): P2E0EvidenceRecord {
    const communication = this.communication.speak(
      { speakerId: "player.jozz", text },
      ({ observer }) => observer.id === this.actorId
    );
    const delivery = communication.residentEvidence.find(
      (candidate) => candidate.observerId === this.actorId
    );
    if (!delivery) {
      throw new Error(`First Presence speech was not grounded for resident ${this.actorId}.`);
    }
    return { ...delivery.evidence, source: { ...delivery.evidence.source } };
  }

  openMatterFromEvidence(
    evidenceId: string,
    semanticCourse = "uninterpreted"
  ): P2E0MatterState {
    const evidence = this.resident.recentEvidence().find((candidate) => candidate.id === evidenceId);
    if (!evidence) {
      throw new Error(`First Presence matter admission requires recent grounded evidence: ${evidenceId}`);
    }

    const matter = this.resident.openMatter({
      id: `matter.presence.${this.nextMatterSeq++}`,
      originEvidenceId: evidence.id,
      semanticCourse
    });
    this.appendTrace({
      kind: "experience",
      matterId: matter.id,
      evidenceId: evidence.id,
      summary: evidence.summary
    });
    return matter;
  }

  reconsiderMatter(matterId: string): FirstPresenceReconsiderResult {
    const before = this.resident.matter(matterId);
    if (!before) {
      return { status: "context_rejected", reason: "matter_missing" };
    }
    if (before.status === "resolved" || before.status === "cancelled") {
      return { status: "context_rejected", reason: "matter_terminal" };
    }

    const ticket = this.resident.beginSemanticProposal(matterId);
    const context = this.contextSeam.build(this.resident, ticket);
    if (context.status !== "ready") {
      return { status: "context_rejected", reason: context.reason };
    }

    const run = this.providerMembrane.prepare(context.context).run;
    const rawOutput = this.semanticProvider(structuredClone(run.modelInput));
    const settlement = this.providerMembrane.settle(this.resident, run, rawOutput);
    if (settlement.status === "applied") {
      this.appendTrace({
        kind: "semantic_commit",
        matterId,
        proposalId: ticket.proposalId,
        semanticEvidenceId: ticket.semanticEvidenceId,
        fromRevision: before.semanticRevision,
        toRevision: settlement.matter.semanticRevision,
        fromCourse: before.semanticCourse,
        toCourse: settlement.matter.semanticCourse
      });
    }
    return settlement;
  }

  startMatterTask(matterId: string): FirstPresenceTaskStartResult {
    const prepared = this.taskStart.prepare(
      this.resident,
      this.world.snapshot(),
      matterId,
      this.actorId,
      this.grounder
    );
    if (prepared.status !== "ready") return prepared;

    const started = this.taskStart.start(
      this.resident,
      this.world.snapshot(),
      this.executor,
      prepared.candidate,
      { kind: "cognition" }
    );
    if (started.status === "started") {
      this.appendTrace({
        kind: "task_started",
        matterId: started.binding.matterId,
        taskId: started.binding.taskId,
        runId: started.binding.runId,
        semanticRevision: started.binding.semanticRevision
      });
    }
    return started;
  }

  step(): FirstPresenceStepResult {
    const frame = this.driver.step({
      playerControl: { moveX: 0, moveY: 0 }
    });

    const executorState = this.executor.state();
    if (
      (executorState.status !== "succeeded" && executorState.status !== "failed") ||
      !executorState.run
    ) {
      return { frame, outcome: null };
    }

    const runId = executorState.run.runId;
    const binding = this.resident.taskBinding(runId);
    if (!binding) return { frame, outcome: null };

    const outcome = this.taskOutcome.reconcile(this.resident, this.executor, frame);
    if (outcome.status === "recorded") {
      this.appendTrace({
        kind: "task_outcome",
        matterId: binding.matterId,
        runId,
        evidenceId: outcome.evidence.id,
        summary: outcome.evidence.summary
      });
    }
    return { frame, outcome };
  }

  trace(): FirstPresenceTraceRecord[] {
    return this.traceValue.map((record) => ({ ...record }));
  }

  private appendTrace(event: FirstPresenceTraceEvent): void {
    this.traceValue.push({ seq: this.nextTraceSeq++, ...event });
    if (this.traceValue.length > this.traceLimit) {
      this.traceValue.splice(0, this.traceValue.length - this.traceLimit);
    }
  }
}
