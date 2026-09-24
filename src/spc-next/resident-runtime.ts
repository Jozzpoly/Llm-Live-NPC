import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import {
  distanceSquared,
  normalizedDirection,
  type CognitionBatch,
  type CognitionReason,
  type PerceptDistanceBand,
  type ResidentActivity,
  type ResidentCommand,
  type ResidentDiagnostics,
  type ResidentExecutionView,
  type ResidentPercept,
  type ResidentProfile,
  type ResidentPublicState,
  type ResidentTraceEvent,
  type Vec2,
  type WorldRegion,
} from "./contracts";
import {
  createDefaultCognitionScheduler,
  type CognitionScheduleDiagnostics,
  type CognitionScheduler,
} from "./cognition-scheduler";
import { ResidentMind } from "./resident-mind";
import {
  resolveResidentPerceptIdentity,
  type ResidentPerceptIngress,
} from "./resident-percept-identity";
import {
  ResidentSemanticPressureGate,
  type ResidentSemanticPressureDecision,
} from "./resident-semantic-pressure-gate";
import {
  ResidentSemanticPressureLifecycle,
  type ResidentSemanticPressureLifecycleEvent,
  type ResidentSemanticPressureLifecycleState,
} from "./resident-semantic-pressure-lifecycle";

const ARRIVAL_DISTANCE = 18;
const COMMUNICATION_DISTANCE = 80;

export interface ResidentCognitionRevision {
  attention: number;
  activity: number;
}

interface ExactActorContact {
  position: Vec2;
  tick: number;
}

interface HeardActorCue {
  direction: Vec2;
  distanceBand: PerceptDistanceBand;
  tick: number;
  observerPosition: Vec2 | null;
}

export type ResidentSemanticSettlementDecision =
  | "accept"
  | "decline"
  | "defer"
  | "clarify"
  | "release_standing";

export interface ResidentSemanticSettlementReconciliation {
  settledReasonIds: readonly string[];
  retainedReasonIds: readonly string[];
}

export class ResidentRuntime {
  private activity: ResidentActivity;
  private readonly recentPercepts: ResidentPercept[] = [];
  private readonly trace: ResidentTraceEvent[] = [];
  private readonly lastKnownActorContacts = new Map<string, ExactActorContact>();
  private readonly lastHeardActorCues = new Map<string, HeardActorCue>();
  private readonly recognizedActorIds = new Set<string>();
  private readonly mind: ResidentMind;
  private readonly semanticPressure: ResidentSemanticPressureGate;
  private readonly semanticPressureLifecycle: ResidentSemanticPressureLifecycle;
  private cognitionSequence = 0;
  private routeWaypointIndex = 0;
  private currentRegionId: string | null = null;
  private attentionRevisionValue = 0;
  private activityRevisionValue = 0;
  private perceptionRevisionValue = 0;
  private lastMovementTraceSignature: string | null = null;
  private lastBlockedSignature: string | null = null;

  constructor(
    readonly profile: ResidentProfile,
    private readonly scheduler: CognitionScheduler = createDefaultCognitionScheduler(profile.id),
  ) {
    this.mind = new ResidentMind(profile);
    this.semanticPressure = new ResidentSemanticPressureGate(profile.id, profile.traceLimit);
    this.semanticPressureLifecycle = new ResidentSemanticPressureLifecycle(profile.id, profile.traceLimit);
    this.activity = {
      id: `activity:${profile.id}:idle:0`,
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "initial idle",
    };
  }

  publicState(): ResidentPublicState {
    return {
      id: this.profile.id,
      name: this.profile.name,
      activity: structuredClone(this.activity),
      pendingCognitionReasonCount: this.scheduler.pendingCount(),
    };
  }

  diagnostics(): ResidentDiagnostics {
    return {
      publicState: this.publicState(),
      recentPercepts: structuredClone(this.recentPercepts),
      trace: structuredClone(this.trace),
    };
  }

  perceptionSnapshot(): { revision: number; recentPercepts: ResidentPercept[] } {
    return {
      revision: this.perceptionRevisionValue,
      recentPercepts: structuredClone(this.recentPercepts),
    };
  }

  cognitionRevision(): ResidentCognitionRevision {
    return { attention: this.attentionRevisionValue, activity: this.activityRevisionValue };
  }

  cognitionScheduleDiagnostics(): CognitionScheduleDiagnostics {
    return this.scheduler.diagnostics();
  }

  /** Exact unresolved scheduler pressure, exposed for local-life research/control. */
  pendingCognitionReasons(): CognitionReason[] {
    return this.scheduler.pendingSnapshot();
  }

  semanticPressureDecisions(): ResidentSemanticPressureDecision[] {
    return this.semanticPressure.recentDecisions();
  }

  semanticPressureLifecycleSnapshot(): ResidentSemanticPressureLifecycleState[] {
    return this.semanticPressureLifecycle.snapshot();
  }

  semanticPressureLifecycleEvents(): ResidentSemanticPressureLifecycleEvent[] {
    return this.semanticPressureLifecycle.eventSnapshot();
  }

  /**
   * Explicit resident-local promotion boundary for already-established semantic
   * discrepancies (for example a real multi-matter choice or factual outcome).
   *
   * R2 uses this instead of scheduling a timer and hoping a later quiet_review
   * fabricates the semantic reason.
   */
  promoteSemanticPressure(reason: CognitionReason): void {
    if (!reason.id.trim()) throw new Error("semantic pressure reason id must be non-empty");
    if (!Number.isSafeInteger(reason.tick) || reason.tick < 0) {
      throw new Error("semantic pressure reason tick must be a non-negative safe integer");
    }
    if (!Number.isFinite(reason.salience) || reason.salience < 0 || reason.salience > 1) {
      throw new Error("semantic pressure salience must be between zero and one");
    }
    if (!reason.summary.trim()) throw new Error("semantic pressure summary must be non-empty");
    this.noteCognitionReason(reason);
  }

  /**
   * Settle currently unresolved pressure from newer resident-local causal truth.
   *
   * This is not a semantic provider decision. It is used when the objective reason
   * for an already-promoted issue disappears locally (for example its owning matter
   * becomes terminal). Scheduler tombstones ensure an older in-flight/requeued batch
   * cannot resurrect the settled causal version.
   */
  invalidateSemanticPressure(reasonId: string, tick: number, detail: string): boolean {
    if (!reasonId.trim()) throw new Error("semantic pressure reason id must be non-empty");
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new Error("semantic pressure invalidation tick must be a non-negative safe integer");
    }
    if (!detail.trim()) throw new Error("semantic pressure invalidation detail must be non-empty");

    const state = this.semanticPressureLifecycle.snapshot().find(
      (entry) => entry.reason.id === reasonId,
    );
    if (!state || state.status === "settled") return false;

    const settled = this.scheduler.settle(state.reason);
    if (settled.status === "newer_pending_retained") return false;

    this.semanticPressureLifecycle.settle(state.reason, tick, detail);
    return true;
  }

  scheduleAdaptiveReview(tick: number, reviewAfterSeconds: number, fixedDeltaSeconds: number): void {
    if (!Number.isFinite(reviewAfterSeconds) || reviewAfterSeconds <= 0) {
      throw new Error("reviewAfterSeconds must be positive");
    }
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error("fixedDeltaSeconds must be positive");
    }
    const delayTicks = Math.max(1, Math.ceil(reviewAfterSeconds / fixedDeltaSeconds));
    this.scheduler.scheduleQuietReviewAfter(tick, delayTicks);
  }

  ensureAdaptiveReview(tick: number, reviewAfterSeconds: number, fixedDeltaSeconds: number): void {
    if (!Number.isFinite(reviewAfterSeconds) || reviewAfterSeconds <= 0) {
      throw new Error("reviewAfterSeconds must be positive");
    }
    if (!Number.isFinite(fixedDeltaSeconds) || fixedDeltaSeconds <= 0) {
      throw new Error("fixedDeltaSeconds must be positive");
    }
    const delayTicks = Math.max(1, Math.ceil(reviewAfterSeconds / fixedDeltaSeconds));
    this.scheduler.ensureQuietReviewWithin(tick, delayTicks);
  }

  /**
   * World ingress keeps physical source identity separate until this resident's
   * private recognition state permits it. Raw World actor IDs never enter the
   * ordinary percept/memory/cognition path merely because World knows them.
   */
  ingestWorldPercepts(
    ingressPercepts: readonly ResidentPerceptIngress[],
    observerPosition: Vec2 | null = null,
  ): void {
    const safePercepts: ResidentPercept[] = [];
    for (const ingress of ingressPercepts) {
      const percept = resolveResidentPerceptIdentity(
        ingress,
        (actorId) => this.recognizedActorIds.has(actorId),
      );
      if (percept.modality === "sight" && percept.actorId) {
        this.recognizedActorIds.add(percept.actorId);
      }
      safePercepts.push(percept);
    }
    this.ingestSafePercepts(safePercepts, observerPosition);
  }

  /**
   * Compatibility ingress for the current World scaffold. Existing World code
   * still supplies physical source ids in ResidentPercept.actorId. Treat that
   * field only as World provenance, strip it immediately, and resolve private
   * recognition before any resident memory/local-contact/cognition state sees it.
   *
   * New World code should prefer ingestWorldPercepts() and never pre-populate
   * resident identity on the percept itself.
   */
  ingestPercepts(percepts: readonly ResidentPercept[], observerPosition: Vec2 | null = null): void {
    const ingressPercepts: ResidentPerceptIngress[] = percepts.map((raw) => {
      const sourceActorId = raw.actorId;
      const percept = structuredClone(raw);
      percept.actorId = null;
      if (isActorSightPhenomenon(percept.phenomenon) && sourceActorId !== null) {
        percept.subjectId = null;
      }
      return { percept, sourceActorId };
    });
    this.ingestWorldPercepts(ingressPercepts, observerPosition);
  }

  private ingestSafePercepts(
    percepts: readonly ResidentPercept[],
    observerPosition: Vec2 | null = null,
  ): void {
    this.mind.observe(percepts);
    for (const percept of percepts) {
      if (percept.phenomenon === "speech" && percept.modality === "hearing" && percept.addressed) {
        this.attentionRevisionValue += 1;
      }
      this.recentPercepts.push(structuredClone(percept));
      this.perceptionRevisionValue += 1;
      if (percept.actorId) {
        if (percept.spatial.kind === "exact") {
          this.lastKnownActorContacts.set(percept.actorId, {
            position: { ...percept.spatial.position },
            tick: percept.tick,
          });
          this.lastBlockedSignature = null;
        } else if (percept.spatial.kind === "directional") {
          this.lastHeardActorCues.set(percept.actorId, {
            direction: { ...percept.spatial.direction },
            distanceBand: percept.spatial.distanceBand,
            tick: percept.tick,
            observerPosition: observerPosition ? { ...observerPosition } : null,
          });
          this.lastBlockedSignature = null;
        }
      }
      // subjectId is causal provenance. Do not assign the event source's spatial cue to the subject.
      this.trimPercepts();
      this.appendTrace({
        tick: percept.tick,
        residentId: this.profile.id,
        kind: "perception",
        summary: `${percept.phenomenon}/${percept.modality}${percept.addressed ? " addressed" : ""}: ${percept.summary}`,
        refIds: [percept.id, percept.occurrenceId],
      });

      const pressure = this.semanticPressure.considerPercept(percept);
      if (pressure.cognitionReason) this.noteCognitionReason(pressure.cognitionReason);
    }
  }

  familiarizeRegion(region: WorldRegion, tick: number): void {
    this.mind.familiarizeRegion(region, tick);
  }

  /**
   * Synchronize resident self-location from authoritative World region resolution.
   * `null` is meaningful current truth: the actor is in valid World space but not
   * inside any authored semantic region.
   */
  syncCurrentRegion(region: WorldRegion | null, tick: number, initial = false): void {
    const previousRegionId = this.currentRegionId;
    const nextRegionId = region?.id ?? null;
    const changed = previousRegionId !== nextRegionId;
    this.currentRegionId = nextRegionId;
    if (region) this.mind.discoverRegion(region, tick);
    if (!changed || initial) return;

    const pressure = this.semanticPressure.considerRegionTransition(
      tick,
      previousRegionId,
      nextRegionId,
    );
    if (pressure.cognitionReason) this.noteCognitionReason(pressure.cognitionReason);
  }

  /** Compatibility wrapper for existing callers that already resolved a concrete region. */
  enterRegion(region: WorldRegion, tick: number, initial = false): void {
    this.syncCurrentRegion(region, tick, initial);
  }

  setActivity(activity: ResidentActivity, tick: number): void {
    this.activity = structuredClone(activity);
    this.routeWaypointIndex = 0;
    this.activityRevisionValue += 1;
    this.lastMovementTraceSignature = null;
    this.lastBlockedSignature = null;
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "activity_changed",
      summary: `${activity.kind}: ${activity.reason}`,
      refIds: [activity.id],
    });
  }

  cognitionContext(
    batch: CognitionBatch,
    snapshotTick = batch.requestedAtTick,
  ): ResidentCognitionContext {
    if (batch.residentId !== this.profile.id) throw new Error("cognition batch belongs to another resident");
    if (!Number.isSafeInteger(snapshotTick) || snapshotTick < batch.requestedAtTick) {
      throw new Error("cognition snapshot tick cannot precede batch readiness");
    }
    return this.mind.context(
      snapshotTick,
      this.currentRegionId,
      batch.reasons,
      this.activity,
      this.recentPercepts,
    );
  }

  applySemanticUpdates(
    proposal: ResidentCognitionProposal,
    tick: number,
    supportingPercepts: readonly ResidentPercept[] = [],
  ): void {
    this.mind.applySemanticUpdates(proposal, tick, supportingPercepts);
  }

  requeueCognitionBatch(
    batch: CognitionBatch,
    transitionTick = batch.requestedAtTick,
  ): void {
    if (batch.residentId !== this.profile.id) throw new Error("cognition batch belongs to another resident");
    for (const reason of batch.reasons) {
      this.scheduleSemanticReason(
        reason,
        transitionTick,
        "requeued",
        "cognition batch returned unresolved",
      );
    }
  }

  reconcileCognitionSettlement(input: {
    batch: CognitionBatch;
    originReasonId: string;
    decision: ResidentSemanticSettlementDecision;
    tick: number;
    retainOriginUntilTick?: number;
  }): ResidentSemanticSettlementReconciliation {
    if (input.batch.residentId !== this.profile.id) {
      throw new Error("cognition batch belongs to another resident");
    }
    if (!Number.isSafeInteger(input.tick) || input.tick < input.batch.requestedAtTick) {
      throw new Error("semantic settlement tick cannot precede cognition dispatch");
    }
    const origin = input.batch.reasons.find((reason) => reason.id === input.originReasonId);
    if (!origin) throw new Error("semantic settlement origin reason is missing from batch");

    const settledReasonIds: string[] = [];
    const retainedReasonIds: string[] = [];

    for (const reason of input.batch.reasons) {
      if (reason.id !== origin.id) {
        this.scheduleSemanticReason(
          reason,
          input.tick,
          "retained",
          `batch sibling retained while ${origin.id} was selected`,
        );
        retainedReasonIds.push(reason.id);
        continue;
      }

      if (input.decision === "defer" || input.decision === "clarify") {
        const notBeforeTick = input.retainOriginUntilTick ?? input.tick;
        if (!Number.isSafeInteger(notBeforeTick) || notBeforeTick < input.tick) {
          throw new Error("retained semantic origin cannot become eligible before settlement");
        }
        this.scheduleSemanticReason(
          reason,
          input.tick,
          "retained",
          `${input.decision} keeps selected semantic pressure unresolved`,
          notBeforeTick,
        );
        retainedReasonIds.push(reason.id);
        continue;
      }

      this.scheduler.settle(reason);
      this.semanticPressureLifecycle.settle(
        reason,
        input.tick,
        `${input.decision} settled selected semantic pressure`,
      );
      settledReasonIds.push(reason.id);
    }

    return {
      settledReasonIds,
      retainedReasonIds,
    };
  }

  fastStep(view: ResidentExecutionView): ResidentCommand {
    switch (this.activity.kind) {
      case "idle":
      case "work":
        return this.movementCommand(view.tick, { x: 0, y: 0 }, `${this.activity.kind} stationary`);
      case "travel":
      case "investigate":
        return this.stepRoutedActivity(view);
      case "follow":
        return this.stepFollow(view);
      case "communicate":
        return this.stepCommunicate(view);
    }
  }

  takeCognitionBatch(tick: number): CognitionBatch | null {
    const batch = this.scheduler.takeReady(tick);
    if (!batch) return null;
    this.semanticPressureLifecycle.dispatch(batch, tick);
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "cognition_batch",
      summary: `Cognition batch with ${batch.reasons.length} reason(s).`,
      refIds: batch.reasons.map((reason) => reason.id),
    });
    return batch;
  }

  noteActivityBlocked(tick: number, summary: string): void {
    const signature = `${this.activity.id}:${summary}`;
    if (signature === this.lastBlockedSignature) return;
    this.lastBlockedSignature = signature;
    this.noteCognitionReason({
      id: `reason:${this.profile.id}:blocked:${this.cognitionSequence++}`,
      tick,
      kind: "activity_blocked",
      salience: 0.9,
      summary,
      evidenceIds: [this.activity.id],
    });
  }

  private noteCognitionReason(reason: CognitionReason): void {
    this.scheduleSemanticReason(
      reason,
      reason.tick,
      "promoted",
      "resident-local semantic pressure promoted",
    );
    this.appendTrace({
      tick: reason.tick,
      residentId: this.profile.id,
      kind: "cognition_reason",
      summary: reason.summary,
      refIds: [reason.id, ...reason.evidenceIds],
    });
  }

  private scheduleSemanticReason(
    reason: CognitionReason,
    transitionTick: number,
    source: "promoted" | "requeued" | "retained",
    detail: string,
    notBeforeTick?: number,
  ): void {
    const result = this.scheduler.note(
      reason,
      notBeforeTick === undefined ? {} : { notBeforeTick },
    );
    this.semanticPressureLifecycle.note(result, transitionTick, source, detail);
  }

  private stepRoutedActivity(view: ResidentExecutionView): ResidentCommand {
    const route = this.activity.routeWaypoints ?? [];
    while (this.routeWaypointIndex < route.length) {
      const waypoint = route[this.routeWaypointIndex]!;
      if (distanceSquared(view.selfPosition, waypoint) > ARRIVAL_DISTANCE * ARRIVAL_DISTANCE) {
        return this.stepTowardPosition(view, waypoint, false);
      }
      this.routeWaypointIndex += 1;
      this.lastMovementTraceSignature = null;
    }
    return this.stepTowardPosition(view, this.activity.targetPosition, true);
  }

  private stepFollow(view: ResidentExecutionView): ResidentCommand {
    const targetId = this.activity.targetActorId;
    if (!targetId) {
      this.noteActivityBlocked(view.tick, "follow has no target actor");
      return this.movementCommand(view.tick, { x: 0, y: 0 }, "follow blocked");
    }
    const visible = view.visibleActors.find((actor) => actor.id === targetId);
    if (visible) {
      this.lastBlockedSignature = null;
      return this.stepTowardPosition(view, visible.position, false);
    }
    return this.stepTowardMissingActorContact(view, targetId, "follow");
  }

  private stepCommunicate(view: ResidentExecutionView): ResidentCommand {
    const targetId = this.activity.targetActorId;
    const text = this.activity.text;
    if (!targetId || !text) {
      this.noteActivityBlocked(view.tick, "communicate lacks target actor or text");
      return this.movementCommand(view.tick, { x: 0, y: 0 }, "communicate blocked");
    }

    const visible = view.visibleActors.find((actor) => actor.id === targetId);
    if (visible && distanceSquared(view.selfPosition, visible.position) <= COMMUNICATION_DISTANCE ** 2) {
      const command: ResidentCommand = {
        kind: "speak",
        text,
        radius: this.profile.hearingRadius,
        addressedActorIds: [targetId],
      };
      this.lastMovementTraceSignature = null;
      this.lastBlockedSignature = null;
      this.appendTrace({
        tick: view.tick,
        residentId: this.profile.id,
        kind: "command",
        summary: `speak to ${targetId}`,
        refIds: [this.activity.id, targetId],
      });
      this.completeActivity(view.tick, "message spoken after physical contact");
      return command;
    }
    if (visible) {
      this.lastBlockedSignature = null;
      return this.stepTowardPosition(view, visible.position, false);
    }
    return this.stepTowardMissingActorContact(view, targetId, "communicate");
  }

  private stepTowardMissingActorContact(
    view: ResidentExecutionView,
    targetId: string,
    activityKind: "follow" | "communicate",
  ): ResidentCommand {
    const target = this.bestContactTarget(targetId) ?? this.activity.targetPosition;
    if (!target) {
      this.noteActivityBlocked(view.tick, `${activityKind} has identity but no usable contact location for ${targetId}`);
      return this.movementCommand(view.tick, { x: 0, y: 0 }, `${activityKind} awaiting contact evidence`);
    }
    if (distanceSquared(view.selfPosition, target) <= ARRIVAL_DISTANCE ** 2) {
      this.noteActivityBlocked(view.tick, `${activityKind} checked best-known contact point but ${targetId} is not visible`);
      return this.movementCommand(view.tick, { x: 0, y: 0 }, `${activityKind} contact point exhausted`);
    }
    return this.stepTowardPosition(view, target, false);
  }

  private bestContactTarget(actorId: string): Vec2 | null {
    const exact = this.lastKnownActorContacts.get(actorId);
    const heard = this.lastHeardActorCues.get(actorId);
    if (heard && heard.observerPosition && (!exact || heard.tick > exact.tick)) {
      const fraction = heard.distanceBand === "near" ? 0.25 : heard.distanceBand === "mid" ? 0.55 : 0.85;
      const distance = this.profile.hearingRadius * fraction;
      return {
        x: heard.observerPosition.x + heard.direction.x * distance,
        y: heard.observerPosition.y + heard.direction.y * distance,
      };
    }
    return exact ? { ...exact.position } : null;
  }

  private stepTowardPosition(
    view: ResidentExecutionView,
    target: Vec2 | null,
    completeOnArrival = true,
  ): ResidentCommand {
    if (!target) {
      this.noteActivityBlocked(view.tick, `${this.activity.kind} has no usable target.`);
      return this.movementCommand(view.tick, { x: 0, y: 0 }, `${this.activity.kind} blocked`);
    }

    if (distanceSquared(view.selfPosition, target) <= ARRIVAL_DISTANCE * ARRIVAL_DISTANCE) {
      if (completeOnArrival) this.completeActivity(view.tick, "arrived at target");
      return this.movementCommand(view.tick, { x: 0, y: 0 }, `${this.activity.kind} arrived`);
    }

    const direction = normalizedDirection(view.selfPosition, target);
    const speed = Math.min(this.profile.maxSpeed, this.activity.speed ?? this.profile.maxSpeed);
    return this.movementCommand(
      view.tick,
      { x: direction.x * speed, y: direction.y * speed },
      `${this.activity.kind} movement`,
    );
  }

  private movementCommand(tick: number, desiredVelocity: Vec2, summary: string): ResidentCommand {
    const speed = Math.hypot(desiredVelocity.x, desiredVelocity.y);
    const direction = speed <= 1e-9 ? 0 : Math.atan2(desiredVelocity.y, desiredVelocity.x);
    const sector = speed <= 1e-9 ? "stop" : String(Math.round(direction / (Math.PI / 4)));
    const speedBucket = Math.round(speed / 10);
    const signature = `${this.activity.id}:${sector}:${speedBucket}`;
    if (signature !== this.lastMovementTraceSignature) {
      this.lastMovementTraceSignature = signature;
      this.appendTrace({
        tick,
        residentId: this.profile.id,
        kind: "command",
        summary,
        refIds: [this.activity.id],
      });
    }
    return { kind: "move", desiredVelocity };
  }

  private completeActivity(tick: number, summary: string): void {
    const completed = this.activity;
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "activity_completed",
      summary,
      refIds: [completed.id],
    });
    this.noteCognitionReason({
      id: `reason:${this.profile.id}:completed:${this.cognitionSequence++}`,
      tick,
      kind: "activity_completed",
      salience: 0.55,
      summary: `${completed.kind} completed: ${summary}`,
      evidenceIds: [completed.id],
    });
    this.activity = {
      id: `activity:${this.profile.id}:idle:${tick}`,
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: `completed ${completed.id}`,
    };
    this.routeWaypointIndex = 0;
    this.activityRevisionValue += 1;
    this.lastMovementTraceSignature = null;
    this.lastBlockedSignature = null;
  }

  private trimPercepts(): void {
    while (this.recentPercepts.length > this.profile.memoryLimit) this.recentPercepts.shift();
  }

  private appendTrace(event: ResidentTraceEvent): void {
    this.trace.push(event);
    while (this.trace.length > this.profile.traceLimit) this.trace.shift();
  }
}

function isActorSightPhenomenon(phenomenon: ResidentPercept["phenomenon"]): boolean {
  return phenomenon === "actor_sight_enter"
    || phenomenon === "actor_sight_update"
    || phenomenon === "actor_sight_exit";
}