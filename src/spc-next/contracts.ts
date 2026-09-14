export interface Vec2 {
  x: number;
  y: number;
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WorldRegion {
  id: string;
  label: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type ActorKind = "player" | "resident";

export interface ActorState {
  id: string;
  kind: ActorKind;
  position: Vec2;
  velocity: Vec2;
  hearingRadius: number;
  sightRadius: number;
  maxSpeed: number;
}

export type OccurrenceKind = "speech" | "movement" | "interaction" | "system";

export interface WorldOccurrence {
  id: string;
  tick: number;
  kind: OccurrenceKind;
  actorId: string | null;
  subjectId: string | null;
  position: Vec2;
  radius: number;
  summary: string;
  text: string | null;
  addressedActorIds: readonly string[];
}

export type PerceptionModality = "hearing" | "sight" | "self";

export interface ResidentPercept {
  id: string;
  occurrenceId: string;
  tick: number;
  modality: PerceptionModality;
  actorId: string | null;
  subjectId: string | null;
  position: Vec2;
  summary: string;
  text: string | null;
  addressed: boolean;
}

export type ActivityKind =
  | "idle"
  | "travel"
  | "follow"
  | "communicate"
  | "investigate"
  | "work";

export interface ResidentActivity {
  id: string;
  kind: ActivityKind;
  targetActorId: string | null;
  targetPosition: Vec2 | null;
  text: string | null;
  speed: number | null;
  reason: string;
  routeWaypoints?: readonly Vec2[];
}

export interface VisibleActor {
  id: string;
  kind: ActorKind;
  position: Vec2;
}

export interface ResidentExecutionView {
  tick: number;
  selfPosition: Vec2;
  visibleActors: readonly VisibleActor[];
}

export type ResidentCommand =
  | { kind: "none" }
  | { kind: "move"; desiredVelocity: Vec2 }
  | { kind: "speak"; text: string; radius: number };

export type CognitionReasonKind =
  | "direct_world_change"
  | "heard_speech"
  | "activity_blocked"
  | "activity_completed"
  | "uncertainty"
  | "quiet_review";

export interface CognitionReason {
  id: string;
  tick: number;
  kind: CognitionReasonKind;
  salience: number;
  summary: string;
  evidenceIds: readonly string[];
}

export interface CognitionBatch {
  residentId: string;
  requestedAtTick: number;
  reasons: readonly CognitionReason[];
}

export interface ResidentProfile {
  id: string;
  name: string;
  hearingRadius: number;
  sightRadius: number;
  maxSpeed: number;
  brainIntervalTicks: number;
  memoryLimit: number;
  traceLimit: number;
}

export interface ResidentPublicState {
  id: string;
  name: string;
  activity: ResidentActivity;
  pendingCognitionReasonCount: number;
}

export interface ResidentTraceEvent {
  tick: number;
  residentId: string;
  kind:
    | "perception"
    | "activity_changed"
    | "activity_completed"
    | "command"
    | "cognition_reason"
    | "cognition_batch";
  summary: string;
  refIds: readonly string[];
}

export interface ResidentDiagnostics {
  publicState: ResidentPublicState;
  recentPercepts: readonly ResidentPercept[];
  trace: readonly ResidentTraceEvent[];
}

export interface WorldPublicSnapshot {
  tick: number;
  actors: readonly ActorState[];
  residents: readonly ResidentPublicState[];
}

export interface SpcWorldOptions {
  bounds: WorldBounds;
  regions: readonly WorldRegion[];
  chunkSize: number;
  fixedDeltaSeconds: number;
}

export const DEFAULT_RESIDENT_PROFILE = {
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
} as const;

export function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizedDirection(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length <= 1e-9) return { x: 0, y: 0 };
  return { x: dx / length, y: dy / length };
}
