import type { Vec2 } from "./contracts";
import type { MaterialActionResult } from "./material-world-state";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentMaterialPickupExecutor } from "./resident-material-pickup-executor";
import { ResidentMaterialPlaceExecutor } from "./resident-material-place-executor";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export type ResidentRunMaterialRelocationStep =
  | { status: "running"; runId: string; phase: "pickup" | "place" }
  | { status: "succeeded"; runId: string; pickupOutcome: MaterialActionResult; placeOutcome: MaterialActionResult }
  | { status: "blocked"; runId: string; phase: "pickup" | "place"; reason: string; materialOutcome: MaterialActionResult | null }
  | { status: "authority_lost"; runId: string; phase: "pickup" | "place" };

/**
 * Research-only candidate for one COMPLETE mechanical ability under ONE already
 * authorized resident run: privately known object -> pickup -> embodied transport
 * -> World-adjudicated placement at a caller-grounded destination.
 *
 * The caller must establish destination provenance and decide WHETHER this
 * operation is meaningful. This executor never creates cognition reasons,
 * matters, goals, provider calls or autonomous NPC decisions.
 *
 * Unlike the older two-run delivery donor, it must not retire the only run at
 * pickup: the same lease protects both actions. The caller owns factual
 * reconciliation and semantic resolution ONLY after confirmed placement.
 *
 * Blocking after pickup leaves the object genuinely held. Revocation cannot
 * fabricate return, drop the object or finish the task. The eventual policy for
 * abandoning a held item is deliberately NOT smuggled into this mechanism.
 *
 * Not yet wired into R6 accepted intent vocabulary / five-resident host.
 */
export class ResidentRunMaterialRelocationExecutor {
  private readonly pickup: ResidentMaterialPickupExecutor;
  private readonly place: ResidentMaterialPlaceExecutor;
  private phase: "pickup" | "place" = "pickup";
  private pickupOutcome: MaterialActionResult | null = null;
  private terminal: Exclude<ResidentRunMaterialRelocationStep, { status: "running" }> | null = null;

  constructor(
    readonly runId: string,
    readonly objectId: string,
    destination: Vec2,
    private readonly knowledge: ResidentMaterialKnowledge,
    private readonly authority: ResidentWorldExecutionAuthority,
    private readonly world: SpcWorldRuntime,
  ) {
    if (knowledge.residentId !== authority.residentId) {
      throw new Error("material relocation private knowledge must belong to authorized resident");
    }
    // Take an immutable destination snapshot. A moved object must never silently
    // move its own target or mutate an earlier private place memory.
    const pinnedDestination = { x: destination.x, y: destination.y };
    this.pickup = new ResidentMaterialPickupExecutor(runId, objectId, knowledge, authority, world);
    this.place = new ResidentMaterialPlaceExecutor(runId, objectId, pinnedDestination, authority, world);
  }

  step(): ResidentRunMaterialRelocationStep {
    if (this.terminal) return structuredClone(this.terminal);

    if (this.phase === "pickup") {
      this.knowledge.sample();
      const result = this.pickup.step();
      if (result.status === "running") {
        return { status: "running", runId: this.runId, phase: "pickup" };
      }
      if (result.status === "authority_lost") {
        return this.finish({ status: "authority_lost", runId: this.runId, phase: "pickup" });
      }
      if (result.status === "blocked") {
        return this.finish({
          status: "blocked", runId: this.runId, phase: "pickup",
          reason: result.reason, materialOutcome: result.materialOutcome,
        });
      }
      this.pickupOutcome = structuredClone(result.materialOutcome);
      this.phase = "place";
      return { status: "running", runId: this.runId, phase: "place" };
    }

    const result = this.place.step();
    if (result.status === "running") {
      return { status: "running", runId: this.runId, phase: "place" };
    }
    if (result.status === "authority_lost") {
      return this.finish({ status: "authority_lost", runId: this.runId, phase: "place" });
    }
    if (result.status === "blocked") {
      return this.finish({
        status: "blocked", runId: this.runId, phase: "place",
        reason: result.reason, materialOutcome: result.materialOutcome,
      });
    }
    if (!this.pickupOutcome) throw new Error("relocation success without a factual pickup");
    return this.finish({
      status: "succeeded",
      runId: this.runId,
      pickupOutcome: structuredClone(this.pickupOutcome),
      placeOutcome: structuredClone(result.materialOutcome),
    });
  }

  private finish(
    result: Exclude<ResidentRunMaterialRelocationStep, { status: "running" }>,
  ): ResidentRunMaterialRelocationStep {
    this.terminal = structuredClone(result);
    return structuredClone(result);
  }
}
