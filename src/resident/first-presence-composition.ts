import { DeterministicExecutor } from "../execution/deterministic-executor";
import type { ExecutionFrameResult } from "../execution/execution-driver";
import type { EntityId } from "../world/types";
import { World } from "../world/world";
import {
  P2E0ResidentCausalKernel,
  type P2E0EvidenceRecord,
  type P2E0MatterState,
  type P2E0ProposalCommitResult
} from "../research/p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "../research/p2-e2-communication-runtime-boundary";
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
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder,
  type P2E6PrepareResult,
  type P2E6StartResult
} from "../research/p2-e6-grounded-task-start-causality";
import {
  P2E7GroundedTaskOutcomeBoundary,
  type P2E7OutcomeReconciliationResult
} from "../research/p2-e7-grounded-task-outcome-causality";
import {
  SupersededTaskDispositionBoundary,
  type SupersededTaskDispositionResult
} from "./superseded-task-disposition";
import {
  FirstPresenceTrace,
  type FirstPresenceTraceEvent,
  type FirstPresenceTraceRecord,
  type FirstPresenceTraceSink
} from "./first-presence-trace";

/**
 * Deterministic in-process semantic stub used by the first composition slices.
 * Live/async provider transport is intentionally deferred until its admission,
 * timeout and retry ownership can be composed explicitly.
 */
export type FirstPresenceSemanticProvider = (
  input: P2E5ModelSemanticInput
) => { semanticCourse: string };

type FirstPresenceContextRejectionReason = Extract<
  P2E4SemanticProposalContextResult,
  { status: "rejected" }
>["reason"];

export type FirstPresenceReconsiderResult =
  | P2E5SettlementResult
  | {
      status: "context_rejected";
      reason: FirstPresenceContextRejectionReason;
    }
  | {
      status: "provider_exception";
      residentAuthority: "released" | "already_inactive";
    };

export type FirstPresenceTaskStartResult = P2E6PrepareResult | P2E6StartResult;
export type { FirstPresenceTraceRecord } from "./first-presence-trace";

/**
 * First product-adjacent Presence composition.
 *
 * Slice 1 joined one explicitly admitted matter through grounded experience ->
 * semantic proposal -> local task -> factual World outcome.
 *
 * Slice 2 adds one deliberately explicit mid-task revision path. New grounded
 * evidence may be attributed to the same still-live matter, reconsideration may
 * change its semantic course, and the caller may then retire the exact old task
 * only when it presents the applied semantic decision that is still current and
 * the task binding is now semantically superseded. The matter itself remains
 * active and can ground a replacement task from the current revision.
 *
 * Communication ingress and matter admission remain separate. This owner does
 * not decide that every heard utterance becomes an unresolved matter or that
 * every heard utterance is relevant to an existing matter.
 *
 * The semantic provider remains synchronous/deterministic for these slices, so
 * async admission/timeout/retry policy is not selected here. Provider failure
 * still abandons exact P2-E17 attempt authority rather than leaking it.
 *
 * The composition also does not own or step an ExecutionDriver. Browser/headless
 * runtime remains the sole owner of the canonical World clock and passes
 * completed ExecutionFrameResult values here for factual outcome reconciliation.
 *
 * Attention, interruption choice, semantic satisfaction, terminal retention,
 * live provider transport and browser presentation remain future responsibilities.
 */
export class FirstPresenceComposition {
  readonly resident = new P2E0ResidentCausalKernel();

  private readonly communication: P2E2CommunicationRuntimeBoundary;
  private readonly contextSeam = new P2E4SemanticProposalContextSeam();
  private readonly providerMembrane = new P2E5SemanticProviderAuthorityMembrane();
  private readonly taskStart = new P2E6GroundedTaskStartBoundary();
  private readonly taskOutcome = new P2E7GroundedTaskOutcomeBoundary();
  private readonly supersededTaskDisposition = new SupersededTaskDispositionBoundary();
  private readonly traceLog: FirstPresenceTrace;
  private nextMatterSeq = 1;

  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor,
    private readonly semanticProvider: FirstPresenceSemanticProvider,
    private readonly grounder: P2E6LocalTaskGrounder,
    private readonly actorId: EntityId = "npc.001",
    traceLimit = 32
  ) {
    this.traceLog = new FirstPresenceTrace(traceLimit);
    this.communication = new P2E2CommunicationRuntimeBoundary(
      this.world,
      new Map([[this.actorId, this.resident]])
    );
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
    const evidence = this.requireRecentEvidence(evidenceId);
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

  advanceMatterFromEvidence(matterId: string, evidenceId: string): P2E0MatterState {
    const evidence = this.requireRecentEvidence(evidenceId);
    const matter = this.resident.advanceSemanticContext(matterId, evidence.id);
    this.appendTrace({
      kind: "experience",
      matterId,
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
    let rawOutput: { semanticCourse: string };
    try {
      rawOutput = this.semanticProvider(structuredClone(run.modelInput));
    } catch {
      const abandoned = this.abandonProviderRun(run);
      return { status: "provider_exception", residentAuthority: abandoned };
    }

    const settlement = this.providerMembrane.settle(this.resident, run, rawOutput);
    if (settlement.status === "provider_output_rejected") {
      this.abandonProviderRun(run);
      return settlement;
    }
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

  disposeSupersededMatterTask(
    matterId: string,
    decision: P2E0ProposalCommitResult
  ): SupersededTaskDispositionResult {
    const result = this.supersededTaskDisposition.dispose(
      this.resident,
      this.executor,
      matterId,
      decision
    );
    if (result.status === "disposed") {
      this.appendTrace({
        kind: "task_superseded",
        matterId: result.record.matterId,
        taskId: result.record.taskId,
        runId: result.record.runId,
        taskSemanticRevision: result.record.taskSemanticRevision,
        currentSemanticRevision: result.record.currentSemanticRevision
      });
    }
    return result;
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

  afterExecutionFrame(frame: ExecutionFrameResult): P2E7OutcomeReconciliationResult | null {
    const executorState = this.executor.state();
    if (
      (executorState.status !== "succeeded" && executorState.status !== "failed") ||
      !executorState.run
    ) {
      return null;
    }

    const runId = executorState.run.runId;
    const binding = this.resident.taskBinding(runId);
    if (!binding) return null;

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
    return outcome;
  }

  trace(): FirstPresenceTraceRecord[] {
    return this.traceLog.records();
  }

  /**
   * Explicit write-only diagnostic seam for adjacent Presence owners that share
   * this composition's causal story. The sink carries no gameplay authority and
   * is never read by the composition to decide semantic or mechanical behavior.
   */
  traceSink(): FirstPresenceTraceSink {
    return this.traceLog;
  }

  private requireRecentEvidence(evidenceId: string): P2E0EvidenceRecord {
    const evidence = this.resident.recentEvidence().find((candidate) => candidate.id === evidenceId);
    if (!evidence) {
      throw new Error(`First Presence semantic admission requires recent grounded evidence: ${evidenceId}`);
    }
    return evidence;
  }

  private abandonProviderRun(run: P2E5LocalProviderRun): "released" | "already_inactive" {
    const result = this.providerMembrane.abandon(this.resident, run);
    if (result.status !== "abandoned") {
      throw new Error("First Presence lost ownership of a provider run before abandonment.");
    }
    return result.residentAuthority;
  }

  private appendTrace(event: FirstPresenceTraceEvent): void {
    this.traceLog.append(event);
  }
}
