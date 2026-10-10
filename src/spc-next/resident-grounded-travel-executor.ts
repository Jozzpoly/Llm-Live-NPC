import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import { planTouchedMaterialDetour } from "./material-contact-detour";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const DEFAULT_TRAVEL_SPEED = 95;
const DEFAULT_ARRIVAL_DISTANCE = 18;
const MAX_MATERIAL_DETOURS = 2;
const MAX_DETOUR_TICKS = 360;
const MAX_STALLED_TICKS = 24;
const DETOUR_WAYPOINT_RADIUS = 10;

export type ResidentGroundedTravelStep =
  | {
      status: "running";
      runId: string;
      destination: Vec2;
      distanceRemaining: number;
    }
  | {
      status: "arrived";
      runId: string;
      destination: Vec2;
      position: Vec2;
    }
  | {
      status: "blocked";
      runId: string;
      destination: Vec2;
      constraints: readonly string[];
    }
  | { status: "authority_lost"; runId: string };

/**
 * Local-body execution for an already-grounded static destination.
 *
 * This capability deliberately does not choose or discover its destination. The
 * caller must derive the target from resident-legal semantic/knowledge grounding
 * before binding the run. During execution it reads only the resident's own public
 * body state and its own run-scoped physical outcome, then mutates World solely via
 * ResidentWorldExecutionAuthority.
 *
 * Arrival and blockage are factual body outcomes. Their semantic meaning remains
 * owned by the caller/continuity layer and must be reconciled separately.
 */
export class ResidentGroundedTravelExecutor {
  private terminal: ResidentGroundedTravelStep | null = null;
  private readonly destination: Vec2;
  private detour: Vec2[] = [];
  private detourAttempts = 0;
  private detourStartedTick: number | null = null;
  private lastObservedPosition: Vec2 | null = null;
  private stalledTicks = 0;

  constructor(
    readonly runId: string,
    destination: Vec2,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly travelSpeed = DEFAULT_TRAVEL_SPEED,
    private readonly arrivalDistance = DEFAULT_ARRIVAL_DISTANCE,
  ) {
    if (!runId.trim()) throw new Error("grounded travel runId must be non-empty");
    if (![destination.x, destination.y].every(Number.isFinite)) {
      throw new Error("grounded travel destination must be finite");
    }
    if (!Number.isFinite(travelSpeed) || travelSpeed <= 0) {
      throw new Error("grounded travel speed must be positive and finite");
    }
    if (!Number.isFinite(arrivalDistance) || arrivalDistance <= 0) {
      throw new Error("grounded travel arrivalDistance must be positive and finite");
    }
    this.destination = { ...destination };
  }

  step(): ResidentGroundedTravelStep {
    if (this.terminal) return structuredClone(this.terminal);

    const self = this.world.publicSnapshot().actors.find((actor) => actor.id === this.authority.residentId);
    if (!self) return this.finishAuthorityLost();

    const physical = this.authority.lastMotionOutcome();
    if (this.detourStartedTick !== null) {
      if (this.world.tick - this.detourStartedTick > MAX_DETOUR_TICKS) {
        return this.finishBlocked(["material_detour_timeout"]);
      }
      if (this.lastObservedPosition
        && distanceSquared(self.position, this.lastObservedPosition) < 0.05 ** 2) {
        this.stalledTicks += 1;
      } else {
        this.stalledTicks = 0;
      }
      if (this.stalledTicks >= MAX_STALLED_TICKS) {
        return this.finishBlocked(["material_detour_stalled"]);
      }
    }
    this.lastObservedPosition = { ...self.position };
    if (physical?.runId === this.runId && physical.outcome.resolution === "blocked") {
      if (this.world.options.materialBodyCollision
        && physical.outcome.constraints.includes("material_object")
        && this.detourAttempts < MAX_MATERIAL_DETOURS) {
        const touch = this.authority.touchedMaterial(this.runId);
        if (!touch) {
          // The actor really hit an obstacle last tick, but another participant
          // may already have picked it up. The current local tactile condition
          // has disappeared: retry the SAME run rather than declaring a stale
          // physical failure or pretending to know the absent object's history.
          this.detour = [];
          this.detourAttempts += 1;
          this.stalledTicks = 0;
        } else {
          const plan = planTouchedMaterialDetour(
            self.position, this.destination, touch, this.world.options.bounds,
          );
          if (!plan) return this.finishBlocked([...physical.outcome.constraints]);
          this.detour = plan.map((point) => ({ ...point }));
          this.detourAttempts += 1;
          this.detourStartedTick = this.world.tick;
          this.stalledTicks = 0;
        }
      } else {
        return this.finishBlocked([...physical.outcome.constraints]);
      }
    }

    const distanceRemainingSquared = distanceSquared(self.position, this.destination);
    if (distanceRemainingSquared <= this.arrivalDistance ** 2) {

      const direction = normalizedDirection(self.position, this.destination);
      const effects = [
        { kind: "motion" as const, desiredVelocity: { x: 0, y: 0 } },
        ...(Math.hypot(direction.x, direction.y) > 1e-9
          ? [{ kind: "look" as const, direction }]
          : []),
      ];
      const stopped = this.authority.apply({ runId: this.runId, effects });
      if (stopped.status !== "applied") return this.finishAuthorityLost();
      this.terminal = {
        status: "arrived",
        runId: this.runId,
        destination: { ...this.destination },
        position: { ...self.position },
      };
      return structuredClone(this.terminal);
    }

    // Detour is a purely local motor subgoal under the original exact run.
    // It cannot create a new matter, target, commitment or activity.
    while (this.detour.length > 0
      && distanceSquared(self.position, this.detour[0]!) <= DETOUR_WAYPOINT_RADIUS ** 2) {
      this.detour.shift();
    }
    const steeringTarget = this.detour[0] ?? this.destination;
    const direction = normalizedDirection(self.position, steeringTarget);
    const speed = Math.min(self.maxSpeed, this.travelSpeed);
    const applied = this.authority.apply({
      runId: this.runId,
      effects: [{
        kind: "motion",
        desiredVelocity: { x: direction.x * speed, y: direction.y * speed },
      }],
    });
    if (applied.status !== "applied") return this.finishAuthorityLost();

    return {
      status: "running",
      runId: this.runId,
      destination: { ...this.destination },
      distanceRemaining: Math.sqrt(distanceRemainingSquared),
    };
  }

  private finishBlocked(constraints: readonly string[]): ResidentGroundedTravelStep {
    const stopped = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
    });
    if (stopped.status !== "applied") return this.finishAuthorityLost();
    this.terminal = {
      status: "blocked",
      runId: this.runId,
      destination: { ...this.destination },
      constraints: [...constraints],
    };
    return structuredClone(this.terminal);
  }

  private finishAuthorityLost(): ResidentGroundedTravelStep {
    this.terminal = { status: "authority_lost", runId: this.runId };
    return structuredClone(this.terminal);
  }
}
