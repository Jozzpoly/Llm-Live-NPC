import type { ExecutionFrameResult } from "../execution/execution-driver";
import type { P2E0ProposalCommitResult } from "../research/p2-e0-resident-causal-kernel";
import type { P2E6LocalTaskGrounder } from "../research/p2-e6-grounded-task-start-causality";
import { FirstPresenceComposition } from "../resident/first-presence-composition";
import {
  FirstPresenceDeferredSemanticOwner,
  createFirstPresenceDeferredExecution
} from "../resident/first-presence-deferred-semantics";
import type { FirstPresenceTraceRecord } from "../resident/first-presence-trace";
import { createP1Specimen } from "../world/specimen";
import type { WorldSpecimen } from "../world/types";
import { World } from "../world/world";
import {
  FirstPresenceSemanticTransportCoordinator,
  type FirstPresenceSemanticTransportProvider,
  type FirstPresenceSemanticTransportRunResult
} from "./first-presence-semantic-transport-coordinator";

const SEEDED_REQUEST = "Bring me the red mug.";
const LIVE_CORRECTION = "Actually, bring me the blue mug.";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requestedLabel = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requestedLabel
  );
  if (matches.length !== 1) return null;
  return {
    taskId: `fetch:${matches[0].id}`,
    task: {
      kind: "approach-and-interact",
      actorId,
      targetId: matches[0].id
    }
  };
};

export function createFirstPresenceBrowserProbeSpecimen(): WorldSpecimen {
  const specimen = createP1Specimen();
  if (!specimen.entities.some((entity) => entity.id === "item.blue-mug")) {
    specimen.entities.push({
      id: "item.blue-mug",
      kind: "item",
      label: "Blue mug",
      position: { x: 865, y: 390 },
      radius: 9,
      heldBy: null
    });
  }
  return specimen;
}

export type FirstPresenceBrowserProbePhase =
  | "idle"
  | "red_running"
  | "semantic_pending"
  | "decision_ready"
  | "semantic_retryable"
  | "resumed_running"
  | "replacement_running"
  | "outcome_recorded"
  | "blocked";

export interface FirstPresenceBrowserProbeState {
  phase: FirstPresenceBrowserProbePhase;
  matterId: string | null;
  semanticCourse: string | null;
  semanticRevision: number | null;
  activeTaskRunId: number | null;
  heldRunIds: number[];
  pendingAttemptIds: number[];
  transportStatus: "pending" | FirstPresenceSemanticTransportRunResult["status"] | null;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  lastError: string | null;
  lastOutcomeSummary: string | null;
  canStart: boolean;
  canRetry: boolean;
  canResume: boolean;
  canReplace: boolean;
  trace: FirstPresenceTraceRecord[];
}

export type FirstPresenceBrowserProbeStartResult =
  | { status: "started"; matterId: string; runId: number }
  | { status: "rejected"; reason: "already_active" | "executor_busy" | "task_start_failed" };

export type FirstPresenceBrowserProbeDispositionResult =
  | { status: "resumed"; runId: number }
  | { status: "replacement_started"; retiredRunId: number; replacementRunId: number }
  | { status: "rejected"; reason: string };

/**
 * Explicit browser integration probe, not a final NPC runtime.
 *
 * It deliberately seeds one already-interpreted Red-mug matter so initial/new-
 * matter live interpretation remains outside this slice. After the exact Red run
 * has received one canonical execution frame, the probe grounds one Blue
 * correction and sends only the deferred attempt's P2-E5 modelInput through the
 * canonical semantic transport coordinator.
 *
 * The World/ExecutionDriver remains externally owned. This probe consumes
 * completed frames for factual reconciliation and never creates a second clock.
 * A live semantic decision also never selects a mechanical consequence: Owner
 * must explicitly call resume() or replace().
 */
export class FirstPresenceBrowserProbe {
  readonly execution = createFirstPresenceDeferredExecution();
  readonly executor = this.execution.executor;
  readonly presence: FirstPresenceComposition;
  readonly deferred: FirstPresenceDeferredSemanticOwner;
  readonly coordinator: FirstPresenceSemanticTransportCoordinator;

  private phaseValue: FirstPresenceBrowserProbePhase = "idle";
  private matterIdValue: string | null = null;
  private decision: P2E0ProposalCommitResult | null = null;
  private transportResult: FirstPresenceSemanticTransportRunResult | null = null;
  private lastErrorValue: string | null = null;
  private lastOutcomeSummaryValue: string | null = null;
  private correctionStarted = false;
  private pendingSemantic: Promise<void> | null = null;

  constructor(
    world: World,
    transport?: FirstPresenceSemanticTransportProvider
  ) {
    this.presence = new FirstPresenceComposition(
      world,
      this.executor,
      () => {
        throw new Error(
          "First Presence browser probe seeds the initial semantic course explicitly; synchronous reconsideration is forbidden."
        );
      },
      exactFetchLabelGrounder
    );
    this.deferred = new FirstPresenceDeferredSemanticOwner(
      this.presence.resident,
      this.execution,
      this.presence.traceSink()
    );
    this.coordinator = new FirstPresenceSemanticTransportCoordinator(
      this.deferred,
      transport
    );
  }

  start(): FirstPresenceBrowserProbeStartResult {
    if (this.phaseValue !== "idle") return { status: "rejected", reason: "already_active" };
    if (this.executor.state().status === "running") {
      return { status: "rejected", reason: "executor_busy" };
    }

    const heard = this.presence.receiveDirectPlayerSpeech(SEEDED_REQUEST);
    const matter = this.presence.openMatterFromEvidence(heard.id, "fetch Red mug");
    const started = this.presence.startMatterTask(matter.id);
    if (started.status !== "started") {
      this.phaseValue = "blocked";
      this.lastErrorValue = `seeded_red_task_start:${started.status}`;
      return { status: "rejected", reason: "task_start_failed" };
    }

    this.matterIdValue = matter.id;
    this.phaseValue = "red_running";
    this.correctionStarted = false;
    this.lastErrorValue = null;
    return { status: "started", matterId: matter.id, runId: started.binding.runId };
  }

  /**
   * Called once for every completed canonical ExecutionDriver frame.
   * The first frame proves the Red task was genuinely in progress before the
   * Blue correction arms a hold. Later terminal frames reconcile factual outcome.
   */
  afterExecutionFrame(frame: ExecutionFrameResult): void {
    const outcome = this.presence.afterExecutionFrame(frame);
    if (outcome?.status === "recorded") {
      this.lastOutcomeSummaryValue = outcome.evidence.summary;
      if (this.phaseValue === "resumed_running" || this.phaseValue === "replacement_running") {
        this.phaseValue = "outcome_recorded";
      }
    }

    if (this.phaseValue === "red_running" && !this.correctionStarted) {
      this.correctionStarted = true;
      this.pendingSemantic = this.beginLiveCorrection();
    }
  }

  retry(): boolean {
    if (this.phaseValue !== "semantic_retryable" || !this.matterIdValue || this.pendingSemantic) {
      return false;
    }
    this.pendingSemantic = this.runSemanticTransport(this.matterIdValue);
    return true;
  }

  resume(): FirstPresenceBrowserProbeDispositionResult {
    if (!this.matterIdValue || this.phaseValue !== "decision_ready" || this.decision?.status !== "applied") {
      return { status: "rejected", reason: "current_applied_decision_required" };
    }
    const result = this.deferred.resumeHeldTask(this.matterIdValue, this.decision);
    if (result.status !== "released") {
      return { status: "rejected", reason: `resume:${result.status}:${"reason" in result ? result.reason : "unknown"}` };
    }
    this.phaseValue = "resumed_running";
    return { status: "resumed", runId: result.hold.runId };
  }

  replace(): FirstPresenceBrowserProbeDispositionResult {
    if (!this.matterIdValue || this.phaseValue !== "decision_ready" || this.decision?.status !== "applied") {
      return { status: "rejected", reason: "current_applied_decision_required" };
    }
    const disposed = this.deferred.replaceHeldTask(this.matterIdValue, this.decision);
    if (disposed.status !== "disposed") {
      return {
        status: "rejected",
        reason: `replace:${disposed.status}:${"reason" in disposed ? disposed.reason : "unknown"}`
      };
    }

    const replacement = this.presence.startMatterTask(this.matterIdValue);
    if (replacement.status !== "started") {
      this.phaseValue = "blocked";
      this.lastErrorValue = `replacement_start:${replacement.status}`;
      return { status: "rejected", reason: this.lastErrorValue };
    }

    this.phaseValue = "replacement_running";
    return {
      status: "replacement_started",
      retiredRunId: disposed.record.runId,
      replacementRunId: replacement.binding.runId
    };
  }

  isActive(): boolean {
    return this.phaseValue !== "idle";
  }

  state(): FirstPresenceBrowserProbeState {
    const matter = this.matterIdValue ? this.presence.resident.matter(this.matterIdValue) : null;
    const deferred = this.deferred.state();
    const diagnostics =
      this.transportResult?.status === "provider_returned" ? this.transportResult.diagnostics : null;
    const appliedCurrent =
      this.decision?.status === "applied" &&
      this.matterIdValue !== null &&
      this.deferred.decisionIsCurrent(this.matterIdValue, this.decision);

    return {
      phase: this.phaseValue,
      matterId: this.matterIdValue,
      semanticCourse: matter?.semanticCourse ?? null,
      semanticRevision: matter?.semanticRevision ?? null,
      activeTaskRunId: matter?.activeTaskRunId ?? null,
      heldRunIds: deferred.heldRuns.map((hold) => hold.runId),
      pendingAttemptIds: deferred.pendingAttempts.map((attempt) => attempt.attemptId),
      transportStatus: this.pendingSemantic ? "pending" : this.transportResult?.status ?? null,
      model: diagnostics?.model ?? null,
      gatewayLogId: diagnostics?.gatewayLogId ?? null,
      latencyMs: diagnostics?.latencyMs ?? null,
      lastError: this.lastErrorValue,
      lastOutcomeSummary: this.lastOutcomeSummaryValue,
      canStart: this.phaseValue === "idle" && this.executor.state().status !== "running",
      canRetry: this.phaseValue === "semantic_retryable" && !this.pendingSemantic,
      canResume: this.phaseValue === "decision_ready" && Boolean(appliedCurrent),
      canReplace: this.phaseValue === "decision_ready" && Boolean(appliedCurrent),
      trace: this.presence.trace()
    };
  }

  async waitForSemantic(): Promise<void> {
    await this.pendingSemantic;
  }

  private async beginLiveCorrection(): Promise<void> {
    if (!this.matterIdValue) {
      this.phaseValue = "blocked";
      this.lastErrorValue = "missing_probe_matter";
      return;
    }
    const evidence = this.presence.receiveDirectPlayerSpeech(LIVE_CORRECTION);
    this.presence.advanceMatterFromEvidence(this.matterIdValue, evidence.id);
    await this.runSemanticTransport(this.matterIdValue);
  }

  private async runSemanticTransport(matterId: string): Promise<void> {
    this.phaseValue = "semantic_pending";
    this.transportResult = null;
    this.lastErrorValue = null;
    this.decision = null;

    try {
      const result = await this.coordinator.reconsider(matterId);
      this.transportResult = result;

      if (result.status === "provider_returned" && result.settlement.status === "applied") {
        this.decision = result.settlement;
        this.phaseValue = "decision_ready";
      } else if (
        result.status === "transport_failed" ||
        (result.status === "provider_returned" && result.settlement.status === "provider_output_rejected")
      ) {
        this.phaseValue = "semantic_retryable";
        this.lastErrorValue =
          result.status === "transport_failed"
            ? result.error
            : `provider_output_rejected:${result.settlement.reason}`;
      } else {
        this.phaseValue = "blocked";
        this.lastErrorValue =
          result.status === "not_started"
            ? `semantic_not_started:${result.begin.status}:${"reason" in result.begin ? result.begin.reason : "unknown"}`
            : `semantic_settlement:${result.settlement.status}`;
      }
    } catch (error) {
      // Coordinator deliberately allows resident invariant failures to escape.
      // The probe surfaces them as a hard blocked state rather than retrying a
      // condition that may indicate a local causal bug.
      this.phaseValue = "blocked";
      this.lastErrorValue = error instanceof Error ? error.message : String(error);
    } finally {
      this.pendingSemantic = null;
    }
  }
}

export function createFirstPresenceBrowserProbe(
  world = new World(createFirstPresenceBrowserProbeSpecimen()),
  transport?: FirstPresenceSemanticTransportProvider
): FirstPresenceBrowserProbe {
  return new FirstPresenceBrowserProbe(world, transport);
}
