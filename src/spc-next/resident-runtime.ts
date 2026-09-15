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

const ARRIVAL_DISTANCE = 18;
const COMMUNICATION_DISTANCE = 80;

export interface ResidentCognitionRevision {
  attention: number;
  activity: number;
}

interface HeardActorCue {
  direction: Vec2;
  distanceBand: PerceptDistanceBand;
  tick: number;
}

export class ResidentRuntime {
  private activity: ResidentActivity;
  private readonly recentPercepts: ResidentPercept[] = [];
  private readonly trace: ResidentTraceEvent[] = [];
  private readonly lastKnownActorPositions = new Map<string, Vec2>();
  private readonly lastHeardActorCues = new Map<string, HeardActorCue>();
  private readonly mind: ResidentMind;
  private cognitionSequence = 0;
  private routeWaypointIndex = 0;
  private currentRegionId: string | null = null;
  private attentionRevisionValue = 0;
  private activityRevisionValue = 0;
  private lastMovementTraceSignature: string | null = null;

  constructor(
    readonly profile: ResidentProfile,
    private readonly scheduler: CognitionScheduler = createDefaultCognitionScheduler(profile.id),
  ) {
    this.mind = new ResidentMind(profile);
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

  cognitionRevision(): ResidentCognitionRevision {
    return { attention: this.attentionRevisionValue, activity: this.activityRevisionValue };
  }

  cognitionScheduleDiagnostics(): CognitionScheduleDiagnostics {
    return this.scheduler.diagnostics();
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

  ingestPercepts(percepts: readonly ResidentPercept[]): void {
    this.mind.observe(percepts);
    for (const percept of percepts) {
      if (percept.modality === "hearing" && percept.addressed) this.attentionRevisionValue += 1;
      this.recentPercepts.push(structuredClone(percept));
      if (percept.actorId) {
        if (percept.spatial.kind === "exact") {
          this.lastKnownActorPositions.set(percept.actorId, { ...percept.spatial.position });
        } else if (percept.spatial.kind === "directional") {
          this.lastHeardActorCues.set(percept.actorId, {
            direction: { ...percept.spatial.direction },
            distanceBand: percept.spatial.distanceBand,
            tick: percept.tick,
          });
        }
      }
      // subjectId is causal provenance. Do not assign the event source's spatial cue to the subject.
      this.trimPercepts();
      this.appendTrace({
        tick: percept.tick,
        residentId: this.profile.id,
        kind: "perception",
        summary: `${percept.modality}${percept.addressed ? " addressed" : ""}: ${percept.summary}`,
        refIds: [percept.id, percept.occurrenceId],
      });

      const reason = this.reasonFromPercept(percept);
      if (reason) this.noteCognitionReason(reason);
    }
  }

  enterRegion(region: WorldRegion, tick: number, initial = false): void {
    const changed = this.currentRegionId !== region.id;
    this.currentRegionId = region.id;
    this.mind.discoverRegion(region, tick);
    if (!changed || initial) return;
    this.noteCognitionReason({
      id: `reason:${this.profile.id}:region:${region.id}:${tick}`,
      tick,
      kind: "direct_world_change",
      salience: 0.35,
      summary: `Entered region: ${region.label}`,
      evidenceIds: [`region-entry:${this.profile.id}:${region.id}:${tick}`],
    });
  }

  setActivity(activity: ResidentActivity, tick: number): void {
    this.activity = structuredClone(activity);
    this.routeWaypointIndex = 0;
    this.activityRevisionValue += 1;
    this.lastMovementTraceSignature = null;
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "activity_changed",
      summary: `${activity.kind}: ${activity.reason}`,
      refIds: [activity.id],
    });
  }

  cognitionContext(batch: CognitionBatch): ResidentCognitionContext {
    if (batch.residentId !== this.profile.id) throw new Error("cognition batch belongs to another resident");
    return this.mind.context(batch.requestedAtTick, batch.reasons, this.activity, this.recentPercepts);
  }

  applySemanticUpdates(proposal: ResidentCognitionProposal, tick: number): void {
    this.mind.applySemanticUpdates(proposal, tick);
  }

  requeueCognitionBatch(batch: CognitionBatch): void {
    if (batch.residentId !== this.profile.id) throw new Error("cognition batch belongs to another resident");
    for (const reason of batch.reasons) this.scheduler.note(reason);
  }

  fastStep(view: ResidentExecutionView): ResidentCommand {
    for (const actor of view.visibleActors) {
      this.lastKnownActorPositions.set(actor.id, { ...actor.position });
    }

    switch (this.activity.kind) {
      case "idle":
      case "work":
        return this.movementCommand(view.tick, { x: 0, y: 0 }, `${this.activity.kind} stationary`);
      case "travel":
      case "investigate":
        return this.stepRoutedActivity(view);
      case "follow": {
        const visible = this.activity.targetActorId
          ? view.visibleActors.find((actor) => actor.id === this.activity.targetActorId)
          : undefined;
        const target = visible?.position
          ?? (this.activity.targetActorId ? this.lastKnownActorPositions.get(this.activity.targetActorId) : undefined)
          ?? (this.activity.targetActorId ? this.hearingProbeTarget(view.selfPosition, this.activity.targetActorId) : null)
          ?? this.activity.targetPosition
          ?? null;
        return this.stepTowardPosition(view, target, false);
      }
      case "communicate":
        return this.stepCommunicate(view);
    }
  }

  takeCognitionBatch(tick: number): CognitionBatch | null {
    const batch = this.scheduler.takeReady(tick);
    if (!batch) return null;
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
    this.scheduler.note(reason);
    this.appendTrace({
      tick: reason.tick,
      residentId: this.profile.id,
      kind: "cognition_reason",
      summary: reason.summary,
      refIds: [reason.id, ...reason.evidenceIds],
    });
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

    const target = visible?.position
      ?? this.lastKnownActorPositions.get(targetId)
      ?? this.hearingProbeTarget(view.selfPosition, targetId)
      ?? this.activity.targetPosition
      ?? null;
    return this.stepTowardPosition(view, target, false);
  }

  private hearingProbeTarget(origin: Vec2, actorId: string): Vec2 | null {
    const cue = this.lastHeardActorCues.get(actorId);
    if (!cue) return null;
    const fraction = cue.distanceBand === "near" ? 0.25 : cue.distanceBand === "mid" ? 0.55 : 0.85;
    const distance = this.profile.hearingRadius * fraction;
    return {
      x: origin.x + cue.direction.x * distance,
      y: origin.y + cue.direction.y * distance,
    };
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
  }

  private reasonFromPercept(percept: ResidentPercept): CognitionReason | null {
    if (percept.modality === "hearing" && percept.text) {
      return {
        id: `reason:${this.profile.id}:speech:${percept.occurrenceId}`,
        tick: percept.tick,
        kind: "heard_speech",
        salience: percept.addressed ? 1 : 0.4,
        summary: percept.addressed
          ? `Speech addressed to me: ${percept.text}`
          : `Overheard speech: ${percept.text}`,
        evidenceIds: [percept.id],
      };
    }
    if (percept.modality === "sight" && percept.summary !== "movement") {
      return {
        id: `reason:${this.profile.id}:world:${percept.occurrenceId}`,
        tick: percept.tick,
        kind: "direct_world_change",
        salience: 0.45,
        summary: `Observed world change: ${percept.summary}`,
        evidenceIds: [percept.id],
      };
    }
    return null;
  }

  private trimPercepts(): void {
    while (this.recentPercepts.length > this.profile.memoryLimit) this.recentPercepts.shift();
  }

  private appendTrace(event: ResidentTraceEvent): void {
    this.trace.push(event);
    while (this.trace.length > this.profile.traceLimit) this.trace.shift();
  }
}
