import type { CognitionBatch, CognitionReason } from "./contracts";
import type { CognitionReasonNoteResult } from "./cognition-scheduler";

export type ResidentSemanticPressureLifecycleStatus =
  | "pending"
  | "in_flight"
  | "settled";

export type ResidentSemanticPressureLifecycleEventKind =
  | "promoted"
  | "superseded"
  | "stale_ignored"
  | "settled_requeue_ignored"
  | "dispatched"
  | "requeued"
  | "retained"
  | "settled";

export interface ResidentSemanticPressureLifecycleState {
  reason: CognitionReason;
  status: ResidentSemanticPressureLifecycleStatus;
  notBeforeTick: number;
  lastTransitionTick: number;
  detail: string;
}

export interface ResidentSemanticPressureLifecycleEvent {
  tick: number;
  residentId: string;
  reasonId: string;
  reasonTick: number;
  kind: ResidentSemanticPressureLifecycleEventKind;
  detail: string;
}

/**
 * Readable lifecycle ledger for unresolved semantic pressure.
 *
 * Scheduler state remains the mechanical source of dispatch truth. This ledger mirrors
 * why a reason entered, left or returned to that scheduler so R2 can distinguish
 * settlement from retention instead of inferring meaning from queue size.
 *
 * Terminal state is bounded. Active pending/in-flight truth is never evicted merely
 * to satisfy the diagnostic limit.
 */
export class ResidentSemanticPressureLifecycle {
  private readonly states = new Map<string, ResidentSemanticPressureLifecycleState>();
  private readonly events: ResidentSemanticPressureLifecycleEvent[] = [];

  constructor(
    private readonly residentId: string,
    private readonly limit: number,
  ) {
    if (!residentId.trim()) throw new Error("semantic pressure lifecycle residentId must be non-empty");
    if (!Number.isSafeInteger(limit) || limit < 1) {
      throw new Error("semantic pressure lifecycle limit must be a positive safe integer");
    }
  }

  note(
    result: CognitionReasonNoteResult,
    transitionTick: number,
    source: "promoted" | "requeued" | "retained",
    detail: string,
  ): void {
    assertTick(transitionTick, "semantic pressure transition tick");
    const previousState = this.states.get(result.reason.id);

    if (result.status === "ignored_stale") {
      this.append({
        tick: transitionTick,
        residentId: this.residentId,
        reasonId: result.reason.id,
        reasonTick: result.reason.tick,
        kind: "stale_ignored",
        detail,
      });
      return;
    }

    if (result.status === "ignored_settled") {
      this.append({
        tick: transitionTick,
        residentId: this.residentId,
        reasonId: result.reason.id,
        reasonTick: result.reason.tick,
        kind: "settled_requeue_ignored",
        detail: `${detail}; causal version <= locally settled tick ${result.settledReasonTick}`,
      });
      return;
    }

    const supersededTick = previousState && previousState.reason.tick < result.reason.tick
      ? previousState.reason.tick
      : result.status === "updated"
        ? result.replaced.tick
        : null;

    if (supersededTick !== null) {
      this.append({
        tick: transitionTick,
        residentId: this.residentId,
        reasonId: result.reason.id,
        reasonTick: result.reason.tick,
        kind: "superseded",
        detail: `${detail}; replaced causal tick ${supersededTick}`,
      });
    } else {
      this.append({
        tick: transitionTick,
        residentId: this.residentId,
        reasonId: result.reason.id,
        reasonTick: result.reason.tick,
        kind: source,
        detail,
      });
    }

    this.states.set(result.reason.id, {
      reason: structuredClone(result.reason),
      status: "pending",
      notBeforeTick: result.notBeforeTick,
      lastTransitionTick: transitionTick,
      detail,
    });
    this.trimTerminalStates();
  }

  dispatch(batch: CognitionBatch, tick: number): void {
    assertTick(tick, "semantic pressure dispatch tick");
    for (const reason of batch.reasons) {
      const current = this.states.get(reason.id);
      if (current && current.reason.tick > reason.tick) {
        this.append({
          tick,
          residentId: this.residentId,
          reasonId: reason.id,
          reasonTick: reason.tick,
          kind: "stale_ignored",
          detail: "dispatch lifecycle ignored because newer pressure version already exists",
        });
        continue;
      }
      this.states.set(reason.id, {
        reason: structuredClone(reason),
        status: "in_flight",
        notBeforeTick: tick,
        lastTransitionTick: tick,
        detail: "semantic pressure dispatched in cognition batch",
      });
      this.append({
        tick,
        residentId: this.residentId,
        reasonId: reason.id,
        reasonTick: reason.tick,
        kind: "dispatched",
        detail: "semantic pressure dispatched in cognition batch",
      });
    }
    this.trimTerminalStates();
  }

  settle(reason: CognitionReason, tick: number, detail: string): void {
    assertTick(tick, "semantic pressure settlement tick");
    const current = this.states.get(reason.id);
    if (current && current.reason.tick > reason.tick) {
      this.append({
        tick,
        residentId: this.residentId,
        reasonId: reason.id,
        reasonTick: reason.tick,
        kind: "stale_ignored",
        detail: `${detail}; newer causal tick ${current.reason.tick} remains unresolved`,
      });
      return;
    }

    this.states.set(reason.id, {
      reason: structuredClone(reason),
      status: "settled",
      notBeforeTick: tick,
      lastTransitionTick: tick,
      detail,
    });
    this.append({
      tick,
      residentId: this.residentId,
      reasonId: reason.id,
      reasonTick: reason.tick,
      kind: "settled",
      detail,
    });
    this.trimTerminalStates();
  }

  snapshot(): ResidentSemanticPressureLifecycleState[] {
    return [...this.states.values()]
      .sort((a, b) => (
        statusRank(a.status) - statusRank(b.status)
        || b.reason.salience - a.reason.salience
        || a.reason.tick - b.reason.tick
        || a.reason.id.localeCompare(b.reason.id)
      ))
      .map((entry) => structuredClone(entry));
  }

  eventSnapshot(): ResidentSemanticPressureLifecycleEvent[] {
    return structuredClone(this.events);
  }

  private append(event: ResidentSemanticPressureLifecycleEvent): void {
    this.events.push(structuredClone(event));
    while (this.events.length > this.limit) this.events.shift();
  }

  private trimTerminalStates(): void {
    if (this.states.size <= this.limit) return;
    const terminal = [...this.states.entries()]
      .filter(([, state]) => state.status === "settled")
      .sort((a, b) => a[1].lastTransitionTick - b[1].lastTransitionTick);
    for (const [reasonId] of terminal) {
      if (this.states.size <= this.limit) break;
      this.states.delete(reasonId);
    }
  }
}

function assertTick(tick: number, label: string): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new Error(`${label} must be a non-negative safe integer`);
  }
}

function statusRank(status: ResidentSemanticPressureLifecycleStatus): number {
  return status === "pending" ? 0 : status === "in_flight" ? 1 : 2;
}
