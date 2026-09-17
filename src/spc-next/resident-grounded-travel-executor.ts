import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const DEFAULT_TRAVEL_SPEED = 95;
const DEFAULT_ARRIVAL_DISTANCE = 18;

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
    if (physical?.runId === this.runId && physical.outcome.resolution === "blocked") {
      const stopped = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
      });
      if (stopped.status !== "applied") return this.finishAuthorityLost();
      this.terminal = {
        status: "blocked",
        runId: this.runId,
        destination: { ...this.destination },
        constraints: [...physical.outcome.constraints],
      };
      return structuredClone(this.terminal);
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

    const direction = normalizedDirection(self.position, this.destination);
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

  private finishAuthorityLost(): ResidentGroundedTravelStep {
    this.terminal = { status: "authority_lost", runId: this.runId };
    return structuredClone(this.terminal);
  }
}
