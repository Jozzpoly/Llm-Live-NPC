import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import type { MaterialActionResult } from "./material-world-state";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentMaterialPickupStep =
  | { status: "running"; runId: string; phase: "approach" | "inspect" | "pickup" }
  | { status: "succeeded"; runId: string; materialOutcome: MaterialActionResult }
  | { status: "blocked"; runId: string; reason: string; materialOutcome: MaterialActionResult | null }
  | { status: "authority_lost"; runId: string };

const PICKUP_ATTEMPT_DISTANCE = 56;
const DEFAULT_APPROACH_SPEED = 90;
const DEFAULT_INSPECTION_SPEED = 115;
const INSPECTION_WAYPOINT_TOLERANCE = 7;

/**
 * Tiny body-scale sweep around the remembered point. This is not semantic search:
 * it is local embodied competence for checking the immediate place before saying
 * "the object is not here". Broader area search remains a separate future run.
 */
const LOCAL_INSPECTION_OFFSETS: readonly Vec2[] = Object.freeze([
  Object.freeze({ x: -26, y: -24 }),
  Object.freeze({ x: 26, y: -24 }),
  Object.freeze({ x: 30, y: 18 }),
  Object.freeze({ x: -20, y: 24 }),
  Object.freeze({ x: 0, y: 0 }),
]);

/**
 * First recovered local-brain material executor.
 *
 * It deliberately owns no resident meaning and no hidden World object location.
 * The semantic layer binds the run; resident-private material knowledge supplies
 * the last actually observed target position; World alone resolves material actions.
 *
 * If the resident reaches a stale last-known point while the object is not currently
 * visible, the executor does NOT probe hidden World truth by issuing a pickup by id.
 * It performs a bounded physical inspection sweep using only the remembered point.
 * The caller may then convert locally checked absence into semantic evidence.
 */
export class ResidentMaterialPickupExecutor {
  private terminal: ResidentMaterialPickupStep | null = null;
  private inspectionOrigin: Vec2 | null = null;
  private inspectionWaypointIndex = 0;

  constructor(
    readonly runId: string,
    readonly objectId: string,
    private readonly knowledge: ResidentMaterialKnowledge,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly approachSpeed = DEFAULT_APPROACH_SPEED,
    private readonly inspectionSpeed = DEFAULT_INSPECTION_SPEED,
  ) {
    if (!runId.trim()) throw new Error("material pickup runId must be non-empty");
    if (!objectId.trim()) throw new Error("material pickup objectId must be non-empty");
    if (!Number.isFinite(approachSpeed) || approachSpeed <= 0) {
      throw new Error("material pickup approachSpeed must be positive and finite");
    }
    if (!Number.isFinite(inspectionSpeed) || inspectionSpeed <= 0) {
      throw new Error("material pickup inspectionSpeed must be positive and finite");
    }
  }

  step(): ResidentMaterialPickupStep {
    if (this.terminal) return structuredClone(this.terminal);

    const actor = this.world.publicSnapshot().actors.find((candidate) => candidate.id === this.authority.residentId);
    if (!actor) return this.finishBlocked("resident actor missing", null);

    const targetPosition = this.knowledge.lastKnownPosition(this.objectId);
    if (!targetPosition) return this.finishBlocked("material object has no acquired position evidence", null);

    const observation = this.knowledge.observation(this.objectId);
    if (observation?.currentlyVisible) {
      this.resetInspection();
    } else if (this.inspectionOrigin) {
      return this.stepLocalInspection(actor.position);
    }

    const distanceSq = distanceSquared(actor.position, targetPosition);
    if (distanceSq > PICKUP_ATTEMPT_DISTANCE ** 2) {
      const direction = normalizedDirection(actor.position, targetPosition);
      const speed = Math.min(actor.maxSpeed, this.approachSpeed);
      const applied = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: scale(direction, speed) }],
      });
      if (applied.status !== "applied") return this.finishAuthorityLost();
      return { status: "running", runId: this.runId, phase: "approach" };
    }

    if (!observation?.currentlyVisible) {
      this.inspectionOrigin = { ...targetPosition };
      this.inspectionWaypointIndex = 0;
      return this.stepLocalInspection(actor.position);
    }

    const stopped = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
    });
    if (stopped.status !== "applied") return this.finishAuthorityLost();

    const action = this.authority.act(this.runId, {
      kind: "material_pickup",
      objectId: this.objectId,
    });
    if (action.status !== "resolved") return this.finishAuthorityLost();

    const outcome = action.materialOutcome;
    if (outcome.status === "succeeded" && outcome.code === "picked_up") {
      this.terminal = { status: "succeeded", runId: this.runId, materialOutcome: structuredClone(outcome) };
      return structuredClone(this.terminal);
    }

    if (outcome.code === "out_of_range" || outcome.code === "object_unavailable") {
      return this.finishBlocked("visible material object became unavailable at pickup time", outcome);
    }

    return this.finishBlocked(`material pickup ${outcome.code}`, outcome);
  }

  private stepLocalInspection(actorPosition: Vec2): ResidentMaterialPickupStep {
    if (!this.inspectionOrigin) throw new Error("local material inspection has no remembered origin");

    let waypoint = this.inspectionWaypoint();
    while (waypoint && distanceSquared(actorPosition, waypoint) <= INSPECTION_WAYPOINT_TOLERANCE ** 2) {
      this.inspectionWaypointIndex += 1;
      waypoint = this.inspectionWaypoint();
    }

    if (!waypoint) {
      return this.finishBlocked("material object is not visible after bounded local inspection", null);
    }

    const direction = normalizedDirection(actorPosition, waypoint);
    const speed = Math.min(
      this.world.publicSnapshot().actors.find((candidate) => candidate.id === this.authority.residentId)?.maxSpeed
        ?? this.inspectionSpeed,
      this.inspectionSpeed,
    );
    const applied = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: scale(direction, speed) }],
    });
    if (applied.status !== "applied") return this.finishAuthorityLost();
    return { status: "running", runId: this.runId, phase: "inspect" };
  }

  private inspectionWaypoint(): Vec2 | null {
    if (!this.inspectionOrigin) return null;
    const offset = LOCAL_INSPECTION_OFFSETS[this.inspectionWaypointIndex];
    if (!offset) return null;
    return {
      x: this.inspectionOrigin.x + offset.x,
      y: this.inspectionOrigin.y + offset.y,
    };
  }

  private resetInspection(): void {
    this.inspectionOrigin = null;
    this.inspectionWaypointIndex = 0;
  }

  private finishAuthorityLost(): ResidentMaterialPickupStep {
    this.terminal = { status: "authority_lost", runId: this.runId };
    return structuredClone(this.terminal);
  }

  private finishBlocked(reason: string, materialOutcome: MaterialActionResult | null): ResidentMaterialPickupStep {
    this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
    });
    this.terminal = {
      status: "blocked",
      runId: this.runId,
      reason,
      materialOutcome: materialOutcome ? structuredClone(materialOutcome) : null,
    };
    return structuredClone(this.terminal);
  }
}

function scale(direction: Vec2, magnitude: number): Vec2 {
  return { x: direction.x * magnitude, y: direction.y * magnitude };
}
