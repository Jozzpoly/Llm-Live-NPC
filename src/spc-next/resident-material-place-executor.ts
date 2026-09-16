import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import type { MaterialActionResult } from "./material-world-state";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentMaterialPlaceStep =
  | { status: "running"; runId: string; phase: "approach" | "place" }
  | { status: "succeeded"; runId: string; materialOutcome: MaterialActionResult }
  | { status: "blocked"; runId: string; reason: string; materialOutcome: MaterialActionResult | null }
  | { status: "authority_lost"; runId: string };

const PLACE_ATTEMPT_DISTANCE = 56;
const DEFAULT_APPROACH_SPEED = 90;

/**
 * Bounded local-brain competence for one already-held material object.
 *
 * The executor owns no semantic meaning. It only moves the exact authorized run
 * toward one authored destination and asks World to resolve the final place action.
 * Possession and placement remain material World truth.
 */
export class ResidentMaterialPlaceExecutor {
  private terminal: ResidentMaterialPlaceStep | null = null;

  constructor(
    readonly runId: string,
    readonly objectId: string,
    readonly destination: Vec2,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly approachSpeed = DEFAULT_APPROACH_SPEED,
  ) {
    if (!runId.trim()) throw new Error("material place runId must be non-empty");
    if (!objectId.trim()) throw new Error("material place objectId must be non-empty");
    if (!Number.isFinite(destination.x) || !Number.isFinite(destination.y)) {
      throw new Error("material place destination must be finite");
    }
    if (!Number.isFinite(approachSpeed) || approachSpeed <= 0) {
      throw new Error("material place approachSpeed must be positive and finite");
    }
  }

  step(): ResidentMaterialPlaceStep {
    if (this.terminal) return structuredClone(this.terminal);

    const actor = this.world.publicSnapshot().actors.find((candidate) => candidate.id === this.authority.residentId);
    if (!actor) return this.finishBlocked("resident actor missing", null);

    const object = this.world.materialObject(this.objectId);
    if (!object) return this.finishBlocked("material object missing", null);
    if (object.location.kind !== "held" || object.location.actorId !== this.authority.residentId) {
      return this.finishBlocked("material object is not held by this resident", null);
    }

    const distanceSq = distanceSquared(actor.position, this.destination);
    if (distanceSq > PLACE_ATTEMPT_DISTANCE ** 2) {
      const direction = normalizedDirection(actor.position, this.destination);
      const speed = Math.min(actor.maxSpeed, this.approachSpeed);
      const applied = this.authority.apply({
        runId: this.runId,
        effects: [{ kind: "motion", desiredVelocity: scale(direction, speed) }],
      });
      if (applied.status !== "applied") {
        this.terminal = { status: "authority_lost", runId: this.runId };
        return structuredClone(this.terminal);
      }
      return { status: "running", runId: this.runId, phase: "approach" };
    }

    const stopped = this.authority.apply({
      runId: this.runId,
      effects: [{ kind: "motion", desiredVelocity: { x: 0, y: 0 } }],
    });
    if (stopped.status !== "applied") {
      this.terminal = { status: "authority_lost", runId: this.runId };
      return structuredClone(this.terminal);
    }

    const action = this.authority.act(this.runId, {
      kind: "material_place",
      objectId: this.objectId,
      position: { ...this.destination },
    });
    if (action.status !== "resolved") {
      this.terminal = { status: "authority_lost", runId: this.runId };
      return structuredClone(this.terminal);
    }

    const outcome = action.materialOutcome;
    if (outcome.status === "succeeded" && outcome.code === "placed") {
      this.terminal = { status: "succeeded", runId: this.runId, materialOutcome: structuredClone(outcome) };
      return structuredClone(this.terminal);
    }
    if (outcome.code === "out_of_range") {
      return { status: "running", runId: this.runId, phase: "place" };
    }
    return this.finishBlocked(`material place ${outcome.code}`, outcome);
  }

  private finishBlocked(reason: string, materialOutcome: MaterialActionResult | null): ResidentMaterialPlaceStep {
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
