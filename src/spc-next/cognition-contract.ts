import type { CognitionReason, ResidentActivity, ResidentPercept, Vec2 } from "./contracts";

export interface KnownActorContext {
  id: string;
  label: string;
  lastKnownPosition: Vec2 | null;
  lastObservedTick: number | null;
}

export interface KnownRegionContext {
  id: string;
  label: string;
}

export interface ResidentConcernState {
  id: string;
  summary: string;
  priority: number;
  status: "open" | "resolved";
  evidenceIds: readonly string[];
}

export interface ResidentBeliefState {
  id: string;
  statement: string;
  confidence: number;
  evidenceIds: readonly string[];
  updatedTick: number;
}

export interface ResidentCognitionContext {
  version: 1;
  resident: { id: string; name: string };
  tick: number;
  reasons: readonly CognitionReason[];
  currentActivity: ResidentActivity;
  recentPercepts: readonly ResidentPercept[];
  concerns: readonly ResidentConcernState[];
  beliefs: readonly ResidentBeliefState[];
  knownActors: readonly KnownActorContext[];
  knownRegions: readonly KnownRegionContext[];
}

export type ProposedActivityKind = "idle" | "travel" | "follow" | "communicate" | "investigate" | "work";

export interface ProposedActivity {
  kind: ProposedActivityKind;
  goal: string;
  targetActorId: string | null;
  targetRegionId: string | null;
  targetPosition: Vec2 | null;
  text: string | null;
}

export type ActivityDirective =
  | { kind: "keep"; reason: string }
  | { kind: "stop"; reason: string }
  | { kind: "replace"; reason: string; activity: ProposedActivity };

export interface BeliefUpdate {
  id: string;
  statement: string;
  confidence: number;
  evidenceIds: readonly string[];
}

export interface ConcernUpdate {
  id: string;
  summary: string;
  priority: number;
  status: "open" | "resolved";
  evidenceIds: readonly string[];
}

export interface ResidentCognitionProposal {
  version: 1;
  activityDirective: ActivityDirective;
  beliefs: readonly BeliefUpdate[];
  concerns: readonly ConcernUpdate[];
  reviewAfterSeconds: number;
}

const ACTIVITY_KINDS = new Set<ProposedActivityKind>([
  "idle", "travel", "follow", "communicate", "investigate", "work",
]);
const CONCERN_STATUSES = new Set(["open", "resolved"] as const);

export function parseResidentCognitionProposal(
  value: unknown,
  context: ResidentCognitionContext,
): ResidentCognitionProposal | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (!Array.isArray(value.beliefs) || value.beliefs.length > 8) return null;
  if (!Array.isArray(value.concerns) || value.concerns.length > 8) return null;
  if (!isFiniteNumber(value.reviewAfterSeconds) || value.reviewAfterSeconds < 0.25 || value.reviewAfterSeconds > 600) {
    return null;
  }

  const evidenceIds = new Set<string>([
    ...context.reasons.flatMap((reason) => reason.evidenceIds),
    ...context.recentPercepts.map((percept) => percept.id),
    ...context.concerns.flatMap((concern) => concern.evidenceIds),
    ...context.beliefs.flatMap((belief) => belief.evidenceIds),
  ]);
  const actorIds = new Set(context.knownActors.map((actor) => actor.id));
  const regionIds = new Set(context.knownRegions.map((region) => region.id));

  const activityDirective = parseActivityDirective(value.activityDirective, actorIds, regionIds);
  if (!activityDirective) return null;

  const beliefs: BeliefUpdate[] = [];
  for (const candidate of value.beliefs) {
    if (!isRecord(candidate)
      || !isNonEmptyString(candidate.id)
      || !isNonEmptyString(candidate.statement)
      || !isFiniteNumber(candidate.confidence)
      || candidate.confidence < 0
      || candidate.confidence > 1
      || !isEvidenceList(candidate.evidenceIds, evidenceIds)) return null;
    beliefs.push({
      id: candidate.id,
      statement: candidate.statement,
      confidence: candidate.confidence,
      evidenceIds: [...candidate.evidenceIds],
    });
  }

  const concerns: ConcernUpdate[] = [];
  for (const candidate of value.concerns) {
    if (!isRecord(candidate)
      || !isNonEmptyString(candidate.id)
      || !isNonEmptyString(candidate.summary)
      || !isFiniteNumber(candidate.priority)
      || candidate.priority < 0
      || candidate.priority > 1
      || typeof candidate.status !== "string"
      || !CONCERN_STATUSES.has(candidate.status as "open" | "resolved")
      || !isEvidenceList(candidate.evidenceIds, evidenceIds)) return null;
    concerns.push({
      id: candidate.id,
      summary: candidate.summary,
      priority: candidate.priority,
      status: candidate.status as "open" | "resolved",
      evidenceIds: [...candidate.evidenceIds],
    });
  }

  return {
    version: 1,
    activityDirective,
    beliefs,
    concerns,
    reviewAfterSeconds: value.reviewAfterSeconds,
  };
}

function parseActivityDirective(
  value: unknown,
  actorIds: ReadonlySet<string>,
  regionIds: ReadonlySet<string>,
): ActivityDirective | null {
  if (!isRecord(value) || !isNonEmptyString(value.kind) || !isNonEmptyString(value.reason)) return null;
  if (value.kind === "keep") {
    if (Object.hasOwn(value, "activity") && value.activity !== null && value.activity !== undefined) return null;
    return { kind: "keep", reason: value.reason };
  }
  if (value.kind === "stop") {
    if (Object.hasOwn(value, "activity") && value.activity !== null && value.activity !== undefined) return null;
    return { kind: "stop", reason: value.reason };
  }
  if (value.kind !== "replace") return null;
  const activity = parseProposedActivity(value.activity, actorIds, regionIds);
  if (!activity) return null;
  return { kind: "replace", reason: value.reason, activity };
}

function parseProposedActivity(
  value: unknown,
  actorIds: ReadonlySet<string>,
  regionIds: ReadonlySet<string>,
): ProposedActivity | null {
  if (!isRecord(value)
    || typeof value.kind !== "string"
    || !ACTIVITY_KINDS.has(value.kind as ProposedActivityKind)
    || !isNonEmptyString(value.goal)) return null;

  const targetActorId = value.targetActorId === null ? null : (isNonEmptyString(value.targetActorId) ? value.targetActorId : undefined);
  const targetRegionId = value.targetRegionId === null ? null : (isNonEmptyString(value.targetRegionId) ? value.targetRegionId : undefined);
  const targetPosition = value.targetPosition === null ? null : parseVec2(value.targetPosition);
  const text = value.text === null ? null : (isNonEmptyString(value.text) ? value.text : undefined);
  if (targetActorId === undefined || targetRegionId === undefined || targetPosition === undefined || text === undefined) return null;
  if (targetActorId !== null && !actorIds.has(targetActorId)) return null;
  if (targetRegionId !== null && !regionIds.has(targetRegionId)) return null;

  const kind = value.kind as ProposedActivityKind;
  if ((kind === "follow" || kind === "communicate") && targetActorId === null) return null;
  if (kind === "communicate" && text === null) return null;
  if ((kind === "travel" || kind === "investigate") && targetRegionId === null && targetPosition === null) return null;

  return {
    kind,
    goal: value.goal,
    targetActorId,
    targetRegionId,
    targetPosition,
    text,
  };
}

function parseVec2(value: unknown): Vec2 | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return undefined;
  return { x: value.x, y: value.y };
}

function isEvidenceList(value: unknown, allowed: ReadonlySet<string>): value is string[] {
  return Array.isArray(value)
    && value.length <= 16
    && value.every((id) => typeof id === "string" && allowed.has(id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
