import {
  distanceSquared,
  normalizedDirection,
  type CognitionBatch,
  type CognitionReason,
  type ResidentActivity,
  type ResidentCommand,
  type ResidentDiagnostics,
  type ResidentExecutionView,
  type ResidentPercept,
  type ResidentProfile,
  type ResidentPublicState,
  type ResidentTraceEvent,
  type Vec2,
} from "./contracts";
import { createDefaultCognitionScheduler, type CognitionScheduler } from "./cognition-scheduler";

const ARRIVAL_DISTANCE = 18;
const COMMUNICATION_DISTANCE = 80;

export class ResidentRuntime {
  private activity: ResidentActivity;
  private readonly recentPercepts: ResidentPercept[] = [];
  private readonly trace: ResidentTraceEvent[] = [];
  private readonly lastKnownActorPositions = new Map<string, Vec2>();
  private cognitionSequence = 0;
  private routeWaypointIndex = 0;

  constructor(
    readonly profile: ResidentProfile,
    private readonly scheduler: CognitionScheduler = createDefaultCognitionScheduler(profile.id),
  ) {
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

  ingestPercepts(percepts: readonly ResidentPercept[]): void {
    for (const percept of percepts) {
      this.recentPercepts.push(structuredClone(percept));
      if (percept.actorId) this.lastKnownActorPositions.set(percept.actorId, { ...percept.position });
      if (percept.subjectId) this.lastKnownActorPositions.set(percept.subjectId, { ...percept.position });
      this.trimPercepts();
      this.appendTrace({
        tick: percept.tick,
        residentId: this.profile.id,
        kind: "perception",
        summary: `${percept.modality}${percept.addressed ? " addressed" : ""}: ${percept.summary}`,
        refIds: [percept.id, percept.occurrenceId],
      });

      const reason = this.reasonFromPercept(percept);
      if (reason) {
        this.scheduler.note(reason);
        this.appendTrace({
          tick: percept.tick,
          residentId: this.profile.id,
          kind: "cognition_reason",
          summary: reason.summary,
          refIds: [reason.id, ...reason.evidenceIds],
        });
      }
    }
  }

  setActivity(activity: ResidentActivity, tick: number): void {
    this.activity = structuredClone(activity);
    this.routeWaypointIndex = 0;
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "activity_changed",
      summary: `${activity.kind}: ${activity.reason}`,
      refIds: [activity.id],
    });
  }

  fastStep(view: ResidentExecutionView): ResidentCommand {
    for (const actor of view.visibleActors) {
      this.lastKnownActorPositions.set(actor.id, { ...actor.position });
    }

    switch (this.activity.kind) {
      case "idle":
      case "work":
        return { kind: "none" };
      case "travel":
      case "investigate":
        return this.stepRoutedActivity(view);
      case "follow": {
        const visible = this.activity.targetActorId
          ? view.visibleActors.find((actor) => actor.id === this.activity.targetActorId)
          : undefined;
        const target = visible?.position
          ?? (this.activity.targetActorId ? this.lastKnownActorPositions.get(this.activity.targetActorId) : undefined)
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
    const reason: CognitionReason = {
      id: `reason:${this.profile.id}:blocked:${this.cognitionSequence++}`,
      tick,
      kind: "activity_blocked",
      salience: 0.9,
      summary,
      evidenceIds: [this.activity.id],
    };
    this.scheduler.note(reason);
    this.appendTrace({
      tick,
      residentId: this.profile.id,
      kind: "cognition_reason",
      summary,
      refIds: [reason.id, this.activity.id],
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
      return { kind: "move", desiredVelocity: { x: 0, y: 0 } };
    }

    if (distanceSquared(view.selfPosition, target) <= ARRIVAL_DISTANCE * ARRIVAL_DISTANCE) {
      if (completeOnArrival) this.completeActivity(view.tick, "arrived at target");
      return { kind: "move", desiredVelocity: { x: 0, y: 0 } };
    }

    const direction = normalizedDirection(view.selfPosition, target);
    const speed = Math.min(this.profile.maxSpeed, this.activity.speed ?? this.profile.maxSpeed);
    const command: ResidentCommand = {
      kind: "move",
      desiredVelocity: { x: direction.x * speed, y: direction.y * speed },
    };
    this.appendTrace({
      tick: view.tick,
      residentId: this.profile.id,
      kind: "command",
      summary: `${this.activity.kind} movement command`,
      refIds: [this.activity.id],
    });
    return command;
  }

  private stepCommunicate(view: ResidentExecutionView): ResidentCommand {
    const targetId = this.activity.targetActorId;
    const text = this.activity.text;
    if (!targetId || !text) {
      this.noteActivityBlocked(view.tick, "communicate lacks target actor or text");
      return { kind: "none" };
    }

    const visible = view.visibleActors.find((actor) => actor.id === targetId);
    if (visible && distanceSquared(view.selfPosition, visible.position) <= COMMUNICATION_DISTANCE ** 2) {
      const command: ResidentCommand = {
        kind: "speak",
        text,
        radius: this.profile.hearingRadius,
        addressedActorIds: [targetId],
      };
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
      ?? this.activity.targetPosition
      ?? null;
    return this.stepTowardPosition(view, target, false);
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
    const reason: CognitionReason = {
      id: `reason:${this.profile.id}:completed:${this.cognitionSequence++}`,
      tick,
      kind: "activity_completed",
      salience: 0.55,
      summary: `${completed.kind} completed: ${summary}`,
      evidenceIds: [completed.id],
    };
    this.scheduler.note(reason);
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
