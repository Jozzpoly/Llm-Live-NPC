import {
  E1CognitionGate,
  E1_OBSERVER_ID,
  projectE1Perception,
  validateE1Decision,
  type E1CycleRequest,
  type E1Experience,
  type E1ObservedChange,
  type E1Perception
} from "../agent/e1-grounding";
import type { DeterministicExecutor } from "../execution/deterministic-executor";
import type { ExecutionFrameResult } from "../execution/execution-driver";
import type { World } from "../world/world";
import { requestE1Decision, type E1DecisionEnvelope } from "./e1-agent-api";

export type E1DecisionProvider = (request: E1CycleRequest) => Promise<E1DecisionEnvelope>;

export type E1HarnessRequestStatus =
  | "disarmed"
  | "armed"
  | "in_flight"
  | "accepted_wait"
  | "accepted_fetch"
  | "decision_rejected"
  | "request_error"
  | "stale_decision"
  | "executor_busy";

export interface E1HarnessDebugState {
  armed: boolean;
  inFlight: boolean;
  requestStatus: E1HarnessRequestStatus;
  cycleId: number | null;
  cyclesUsed: number;
  cycleBudget: number;
  trigger: E1CycleRequest["trigger"] | null;
  perceptionTick: number | null;
  visibleEntityIds: string[];
  fetchableItemIds: string[];
  observedChanges: string[];
  decisionKind: "wait" | "fetch" | null;
  decisionTargetId: string | null;
  decisionValidation: string | null;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  experience: E1Experience | null;
}

function describeObservedChange(change: E1ObservedChange): string {
  switch (change.kind) {
    case "item_entered_perception":
      return `${change.itemId}: entered · holder ${change.holderId ?? "free"}`;
    case "item_left_perception":
      return `${change.itemId}: left · previous ${change.previousHolderId ?? "free"}`;
    case "item_holder_changed":
      return `${change.itemId}: holder ${change.previousHolderId ?? "free"} → ${change.holderId ?? "free"}`;
    case "observer_held_item_changed":
      return `self held ${change.previousItemId ?? "none"} → ${change.itemId ?? "none"}`;
    case "observer_location_changed":
      return `self location ${change.previousLocationId ?? "open"} → ${change.locationId ?? "open"}`;
  }
}

export class E1AgentHarness {
  private readonly gate = new E1CognitionGate();
  private perception: E1Perception | null = null;
  private experience: E1Experience | null = null;
  private requestStatus: E1HarnessRequestStatus = "disarmed";
  private trigger: E1CycleRequest["trigger"] | null = null;
  private cycleId: number | null = null;
  private observedChanges: string[] = [];
  private decisionKind: "wait" | "fetch" | null = null;
  private decisionTargetId: string | null = null;
  private decisionValidation: string | null = null;
  private model: string | null = null;
  private gatewayLogId: string | null = null;
  private latencyMs: number | null = null;
  private activeTaskTargetId: string | null = null;

  constructor(
    private readonly world: World,
    private readonly executor: DeterministicExecutor,
    private readonly provider: E1DecisionProvider = requestE1Decision
  ) {}

  toggle(): E1HarnessDebugState {
    if (this.gate.state().armed) {
      this.disarm();
    } else if (this.executor.state().status === "running") {
      this.requestStatus = "executor_busy";
      this.decisionValidation = "cannot_arm_while_executor_running";
    } else {
      this.arm();
    }
    return this.state();
  }

  arm(): void {
    if (this.executor.state().status === "running") {
      throw new Error("E1 cannot arm while the NPC executor is already running.");
    }
    this.experience = null;
    this.perception = this.observe();
    this.gate.arm(this.perception, this.experience);
    this.requestStatus = "armed";
    this.trigger = null;
    this.cycleId = null;
    this.observedChanges = [];
    this.decisionKind = null;
    this.decisionTargetId = null;
    this.decisionValidation = null;
    this.model = null;
    this.gatewayLogId = null;
    this.latencyMs = null;
    this.activeTaskTargetId = null;
  }

  disarm(): void {
    this.gate.disarm();
    this.requestStatus = "disarmed";
  }

  state(): E1HarnessDebugState {
    const gate = this.gate.state();
    return {
      armed: gate.armed,
      inFlight: gate.inFlight,
      requestStatus: this.requestStatus,
      cycleId: this.cycleId,
      cyclesUsed: gate.cyclesUsed,
      cycleBudget: gate.cycleBudget,
      trigger: this.trigger,
      perceptionTick: this.perception?.tick ?? null,
      visibleEntityIds: this.perception?.visibleEntities.map((entity) => entity.id) ?? [],
      fetchableItemIds: [...(this.perception?.fetchableItemIds ?? [])],
      observedChanges: [...this.observedChanges],
      decisionKind: this.decisionKind,
      decisionTargetId: this.decisionTargetId,
      decisionValidation: this.decisionValidation,
      model: this.model,
      gatewayLogId: this.gatewayLogId,
      latencyMs: this.latencyMs,
      experience: this.experience ? { ...this.experience } : null
    };
  }

  afterExecutionStep(frame: ExecutionFrameResult, nowMs: number): Promise<void> | null {
    this.captureExperience(frame);
    this.perception = this.observe();

    const executorState = this.executor.state();
    const cycle = this.gate.consider(
      this.perception,
      this.experience,
      executorState.status === "running",
      nowMs
    );
    if (!cycle) return null;

    this.requestStatus = "in_flight";
    this.trigger = cycle.trigger;
    this.cycleId = cycle.cycleId;
    this.observedChanges = cycle.observedChanges.map(describeObservedChange);
    this.decisionKind = null;
    this.decisionTargetId = null;
    this.decisionValidation = null;
    return this.runCycle(cycle);
  }

  private observe(): E1Perception {
    return projectE1Perception(
      this.world.snapshot(),
      E1_OBSERVER_ID,
      (start, end) => this.world.hasLineOfSight(start, end)
    );
  }

  private captureExperience(frame: ExecutionFrameResult): void {
    const executorState = this.executor.state();
    if (!this.activeTaskTargetId) return;
    if (executorState.status !== "succeeded" && executorState.status !== "failed") return;

    const action =
      frame.executorActionResult?.actorId === E1_OBSERVER_ID &&
      frame.executorActionResult.targetId === this.activeTaskTargetId
        ? frame.executorActionResult
        : null;
    const tick = action?.tick ?? this.world.snapshot().tick;

    if (executorState.status === "succeeded") {
      this.experience = {
        tick,
        status: "succeeded",
        code: action?.code ?? "executor_succeeded",
        targetId: this.activeTaskTargetId,
        message: action?.message ?? "E1 executor task succeeded."
      };
    } else {
      this.experience = {
        tick,
        status: "failed",
        code: executorState.failureCode ?? action?.code ?? "executor_failed",
        targetId: this.activeTaskTargetId,
        message: action?.message ?? "E1 executor task failed."
      };
    }

    this.activeTaskTargetId = null;
  }

  private async runCycle(cycle: E1CycleRequest): Promise<void> {
    try {
      const response = await this.provider(cycle);
      if (!this.gate.finish(cycle.cycleId)) return;
      if (response.cycleId !== cycle.cycleId) {
        throw new Error(`E1 cycle mismatch: expected ${cycle.cycleId}, received ${response.cycleId}.`);
      }

      this.model = response.model;
      this.gatewayLogId = response.gatewayLogId;
      this.latencyMs = response.latencyMs;

      const validation = validateE1Decision(response.decision, cycle.perception);
      if (validation.status === "rejected") {
        this.requestStatus = "decision_rejected";
        this.decisionValidation = validation.code;
        return;
      }

      this.decisionKind = validation.decision.kind;
      this.decisionTargetId = validation.decision.kind === "fetch" ? validation.decision.targetId : null;
      this.decisionValidation = "accepted_at_request_perception";

      if (validation.decision.kind === "wait") {
        this.requestStatus = "accepted_wait";
        return;
      }

      const currentPerception = this.observe();
      this.perception = currentPerception;
      const currentValidation = validateE1Decision(validation.decision, currentPerception);
      if (currentValidation.status === "rejected") {
        this.requestStatus = "stale_decision";
        this.decisionValidation = currentValidation.code;
        return;
      }
      if (this.executor.state().status === "running") {
        this.requestStatus = "executor_busy";
        this.decisionValidation = "executor_running";
        return;
      }
      if (currentValidation.decision.kind !== "fetch") {
        this.requestStatus = "stale_decision";
        this.decisionValidation = "unexpected_wait_revalidation";
        return;
      }

      const started = this.executor.start({
        kind: "approach-and-interact",
        actorId: E1_OBSERVER_ID,
        targetId: currentValidation.decision.targetId
      });
      if (!started) {
        this.requestStatus = "executor_busy";
        this.decisionValidation = "executor_start_refused";
        return;
      }

      this.activeTaskTargetId = currentValidation.decision.targetId;
      this.requestStatus = "accepted_fetch";
      this.decisionValidation = "accepted_and_started";
    } catch (error) {
      if (!this.gate.finish(cycle.cycleId) && !this.gate.state().armed) return;
      this.requestStatus = "request_error";
      this.decisionValidation = error instanceof Error ? error.message : String(error);
    }
  }
}
