import { distanceSquared, normalizedDirection, type Vec2 } from "./contracts";
import type { MaterialActionResult } from "./material-world-state";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentMaterialPickupStep =
  | { status: "running"; runId: string; phase: "approach" | "pickup" }
  | { status: "succeeded"; runId: string; materialOutcome: MaterialActionResult }
  | { status: "blocked"; runId: string; reason: string; materialOutcome: MaterialActionResult | null }
  | { status: "authority_lost"; runId: string };

const PICKUP_ATTEMPT_DISTANCE = 56;
const DEFAULT_APPROACH_SPEED = 90;

/**
 * First recovered local-brain material executor.
 *
 * It deliberately owns no resident meaning. The semantic layer has already bound
 * an exact run to a matter; this executor only turns that run into embodied local
 * work: approach the current World position of one object, stop, attempt pickup,
 * and report the factual World result.
 *
 * It never receives caller-supplied actor position/LOS and never mutates material
 * truth directly. Those remain World authority.
 */
export class ResidentMaterialPickupExecutor {
  private terminal: ResidentMaterialPickupStep | null = null;

  constructor(
    readonly runId: string,
    readonly objectId: string,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
    private readonly approachSpeed = DEFAULT_APPROACH_SPEED,
  ) {
    if (!runId.trim()) throw new Error("material pickup runId must be non-empty");
    if (!objectId.trim()) throw new Error("material pickup objectId must be non-empty");
    if (!Number.isFinite(approachSpeed) || approachSpeed <= 0) {
      throw new Error("material pickup approachSpeed must be positive and finite");
    }
  }

  step(): ResidentMaterialPickupStep {
    if (this.terminal) return structuredClone(this.terminal);

    const actor = this.world.publicSnapshot().actors.find((candidate) => candidate.id === this.authority.residentId);
    if (!actor) return this.finishBlocked("resident actor missing", null);

    const object = this.world.materialObject(this.objectId);
    if (!object) return this.finishBlocked("material object missing", null);

    if (object.location.kind === "held") {
      if (object.location.actorId === this.authority.residentId) {
        const outcome = this.world.diagnostics().recentMaterialActions
          .slice()
          .reverse()
          .find((entry) => entry.actorId === this.authority.residentId
            && entry.objectId === this.objectId
            && entry.status === "succeeded"
            && entry.code === "picked_up") ?? null;
        if (!outcome) return this.finishBlocked("object already held without this executor's factual pickup outcome", null);
        this.terminal = { status: "succeeded", runId: this.runId, materialOutcome: structuredClone(outcome) };
        return structuredClone(this.terminal);
      }
      return this.finishBlocked(`material object held by ${object.location.actorId}`, null);
    }

    const distanceSq = distanceSquared(actor.position, object.location.position);
    if (distanceSq > PICKUP_ATTEMPT_DISTANCE ** 2) {
      const direction = normalizedDirection(actor.position, object.location.position);
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
      kind: "material_pickup",
      objectId: this.objectId,
    });
    if (action.status !== "resolved") {
      this.terminal = { status: "authority_lost", runId: this.runId };
      return structuredClone(this.terminal);
    }

    const outcome = action.materialOutcome;
    if (outcome.status === "succeeded" && outcome.code === "picked_up") {
      this.terminal = { status: "succeeded", runId: this.runId, materialOutcome: structuredClone(outcome) };
      return structuredClone(this.terminal);
    }

    if (outcome.code === "out_of_range") {
      return { status: "running", runId: this.runId, phase: "pickup" };
    }

    return this.finishBlocked(`material pickup ${outcome.code}`, outcome);
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
