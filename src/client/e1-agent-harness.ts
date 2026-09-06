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
import {
  E1DecisionRequestError,
  requestE1Decision,
  type E1DecisionEnvelope,
  type E1DecisionRequestContext
} from "./e1-agent-api";
import {
  E1SensoryChangeBuffer,
  deriveE1SemanticActionObservedChanges
} from "./e1-sensory-events";

export const E1_REQUEST_TIMEOUT_MS = 12_000;
export const E1_REQUEST_MAX_ATTEMPTS = 2;

export type E1DecisionProvider = (
  request: E1CycleRequest,
  context: E1DecisionRequestContext
) => Promise<E1DecisionEnvelope>;

export type E1HarnessRequestStatus =
  | "disarmed"
  | "armed"
  | "in_flight"
  | "accepted_wait"
  | "accepted_fetch"
  | "decision_rejected"
  | "request_error"
  | "request_timeout"
  | "stale_decision"
  | "executor_busy";

export interface E1HarnessDebugState {
  armed: boolean;
  inFlight: boolean;
  requestStatus: E1HarnessRequestStatus;
  sessionId: number | null;
  requestId: number | null;
  attempt: number | null;
  attemptLimit: number;
  cycleId: number | null;
  cyclesUsed: number;
  cycleBudget: number;
  trigger: E1CycleRequest["trigger"] | null;
  perceptionTick: number | null;
  visibleEntityIds: string[];
  fetchableItemIds: string[];
  observedChanges: string[];
  observedChangesDropped: number;
  pendingSensoryChanges: number;
  pendingSensoryChangesDropped: number;
  decisionKind: "wait" | "fetch" | null;
  decisionTargetId: string | null;
  decisionValidation: string | null;
  model: string | null;
  gatewayLogId: string | null;
  latencyMs: number | null;
  experience: E1Experience | null;
}

export interface E1HarnessOptions {
  requestTimeoutMs?: number;
  maxRequestAttempts?: number;
}

interface E1LocalRequestIdentity {
  sessionId: number;
  requestId: number;
}

class E1RequestTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`E1 cognition request timed out after ${timeoutMs} ms.`);
    this.name = "E1RequestTimeoutError";
  }
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

function retryableProviderError(error: unknown): boolean {
  return error instanceof E1DecisionRequestError ? error.retryable : true;
}

export class E1AgentHarness {
  private readonly gate = new E1CognitionGate();
  private readonly sensoryChanges = new E1SensoryChangeBuffer();
  private readonly requestTimeoutMs: number;
  private readonly maxRequestAttempts: number;
  private perception: E1Perception | null = null;
  private experience: E1Experience | null = null;
  private requestStatus: E1HarnessRequestStatus = "disarmed";
  private nextSessionId = 1;
  private sessionId: number | null = null;
  private nextRequestId = 1;
  private requestId: number | null = null;
  private activeRequestId: number | null = null;
  private attempt: number | null = null;
  private activeAbortController: AbortController | null = null;
  private trigger: E1CycleRequest["trigger"] | null = null;
  private cycleId: number | null = null;
  private observedChanges: string[] = [];
  private observedChangesDropped = 0;
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
    private readonly provider: E1DecisionProvider = requestE1Decision,
    options: E1HarnessOptions = {}
  ) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? E1_REQUEST_TIMEOUT_MS;
    this.maxRequestAttempts = options.maxRequestAttempts ?? E1_REQUEST_MAX_ATTEMPTS;
    if (!Number.isFinite(this.requestTimeoutMs) || this.requestTimeoutMs <= 0) {
      throw new Error(`E1 request timeout must be positive and finite: ${this.requestTimeoutMs}`);
    }
    if (!Number.isInteger(this.maxRequestAttempts) || this.maxRequestAttempts <= 0) {
      throw new Error(`E1 request attempt limit must be a positive integer: ${this.maxRequestAttempts}`);
    }
  }

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
    this.cancelActiveProviderAttempt();
    this.sensoryChanges.clear();
    this.sessionId = this.nextSessionId++;
    this.requestId = null;
    this.activeRequestId = null;
    this.attempt = null;
    this.experience = null;
    this.perception = this.observe();
    this.gate.arm(this.perception, this.experience);
    this.requestStatus = "armed";
    this.trigger = null;
    this.cycleId = null;
    this.observedChanges = [];
    this.observedChangesDropped = 0;
    this.decisionKind = null;
    this.decisionTargetId = null;
    this.decisionValidation = null;
    this.model = null;
    this.gatewayLogId = null;
    this.latencyMs = null;
    this.activeTaskTargetId = null;
  }

  disarm(): void {
    this.cancelActiveProviderAttempt();
    this.sensoryChanges.clear();
    this.gate.disarm();
    this.activeRequestId = null;
    this.requestStatus = "disarmed";
  }

  state(): E1HarnessDebugState {
    const gate = this.gate.state();
    const pendingSensory = this.sensoryChanges.pending();
    return {
      armed: gate.armed,
      inFlight: gate.inFlight,
      requestStatus: this.requestStatus,
      sessionId: this.sessionId,
      requestId: this.requestId,
      attempt: this.attempt,
      attemptLimit: this.maxRequestAttempts,
      cycleId: this.cycleId,
      cyclesUsed: gate.cyclesUsed,
      cycleBudget: gate.cycleBudget,
      trigger: this.trigger,
      perceptionTick: this.perception?.tick ?? null,
      visibleEntityIds: this.perception?.visibleEntities.map((entity) => entity.id) ?? [],
      fetchableItemIds: [...(this.perception?.fetchableItemIds ?? [])],
      observedChanges: [...this.observedChanges],
      observedChangesDropped: this.observedChangesDropped,
      pendingSensoryChanges: pendingSensory.changes.length,
      pendingSensoryChangesDropped: pendingSensory.droppedCount,
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
    if (this.gate.state().armed) {
      this.sensoryChanges.append(
        deriveE1SemanticActionObservedChanges(
          frame.semanticActionOccurrences,
          E1_OBSERVER_ID,
          (start, end) => this.world.hasLineOfSight(start, end)
        )
      );
    }
    this.perception = this.observe();

    const executorState = this.executor.state();
    const pendingSensory = this.sensoryChanges.pending();
    const cycle = this.gate.consider(
      this.perception,
      this.experience,
      executorState.status === "running",
      nowMs,
      pendingSensory.changes,
      pendingSensory.droppedCount
    );
    if (!cycle) return null;
    if (this.sessionId === null) throw new Error("E1 cognition cycle requires an active arm-session identity.");

    // A bounded sensory batch belongs to exactly one cognition cycle. Provider
    // retries reuse this same immutable cycle payload; later World changes start
    // accumulating in a fresh session-local buffer while the request is in flight.
    this.sensoryChanges.clear();

    const identity: E1LocalRequestIdentity = {
      sessionId: this.sessionId,
      requestId: this.nextRequestId++
    };
    this.requestId = identity.requestId;
    this.activeRequestId = identity.requestId;
    this.attempt = null;
    this.requestStatus = "in_flight";
    this.trigger = cycle.trigger;
    this.cycleId = cycle.cycleId;
    this.observedChanges = cycle.observedChanges.map(describeObservedChange);
    this.observedChangesDropped = cycle.observedChangesDropped;
    this.decisionKind = null;
    this.decisionTargetId = null;
    this.decisionValidation = null;
    return this.runCycle(cycle, identity);
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

  private isCurrentRequest(identity: E1LocalRequestIdentity): boolean {
    return (
      this.gate.state().armed &&
      this.sessionId === identity.sessionId &&
      this.activeRequestId === identity.requestId
    );
  }

  private finishCurrentRequest(cycle: E1CycleRequest, identity: E1LocalRequestIdentity): boolean {
    if (!this.isCurrentRequest(identity)) return false;
    if (!this.gate.finish(cycle.cycleId)) return false;
    this.activeRequestId = null;
    return true;
  }

  private cancelActiveProviderAttempt(): void {
    const controller = this.activeAbortController;
    this.activeAbortController = null;
    controller?.abort();
  }

  private async runProviderAttempt(
    cycle: E1CycleRequest,
    identity: E1LocalRequestIdentity,
    attempt: number
  ): Promise<E1DecisionEnvelope> {
    const controller = new AbortController();
    this.activeAbortController = controller;
    let timedOut = false;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    let providerPromise: Promise<E1DecisionEnvelope>;
    try {
      providerPromise = this.provider(cycle, {
        signal: controller.signal,
        sessionId: identity.sessionId,
        requestId: identity.requestId,
        attempt
      });
    } catch (error) {
      providerPromise = Promise.reject(error);
    }

    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new E1RequestTimeoutError(this.requestTimeoutMs));
      }, this.requestTimeoutMs);
    });

    try {
      return await Promise.race([providerPromise, timeoutPromise]);
    } catch (error) {
      if (timedOut && !(error instanceof E1RequestTimeoutError)) {
        throw new E1RequestTimeoutError(this.requestTimeoutMs);
      }
      throw error;
    } finally {
      if (timeoutHandle !== null) clearTimeout(timeoutHandle);
      if (this.activeAbortController === controller) this.activeAbortController = null;
    }
  }

  private async runCycle(cycle: E1CycleRequest, identity: E1LocalRequestIdentity): Promise<void> {
    let response: E1DecisionEnvelope | null = null;

    for (let attempt = 1; attempt <= this.maxRequestAttempts; attempt += 1) {
      if (!this.isCurrentRequest(identity)) return;
      this.attempt = attempt;

      try {
        response = await this.runProviderAttempt(cycle, identity, attempt);
        break;
      } catch (error) {
        if (!this.isCurrentRequest(identity)) return;
        const timedOut = error instanceof E1RequestTimeoutError;
        const retryable = timedOut || retryableProviderError(error);

        if (retryable && attempt < this.maxRequestAttempts) {
          this.requestStatus = "in_flight";
          this.decisionValidation = timedOut ? "retrying_after_timeout" : "retrying_after_request_error";
          continue;
        }

        if (!this.finishCurrentRequest(cycle, identity)) return;
        this.requestStatus = timedOut ? "request_timeout" : "request_error";
        this.decisionValidation = timedOut
          ? `request_timeout_after_${attempt}_attempts`
          : error instanceof Error
            ? error.message
            : String(error);
        return;
      }
    }

    if (!response || !this.finishCurrentRequest(cycle, identity)) return;
    if (response.cycleId !== cycle.cycleId) {
      this.requestStatus = "request_error";
      this.decisionValidation = `E1 cycle mismatch: expected ${cycle.cycleId}, received ${response.cycleId}.`;
      return;
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
  }
}
