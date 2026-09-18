import type {
  ResidentKernelEvidence,
  ResidentMatter,
} from "./resident-continuity-kernel";
import type { ResidentExecutionArbitration } from "./resident-execution-arbitrator";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import type { ResidentLifeChoiceReviewObservation } from "./resident-life-choice-review-bridge";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

export type ResidentCausalExecutionStep =
  | { status: "idle" }
  | {
      status: "running";
      matterId: string;
      runId: string;
      intentKind: "travel_region";
    }
  | {
      status: "completed";
      matterId: string;
      runId: string;
      outcomeEvidence: ResidentKernelEvidence;
      arbitration: ResidentExecutionArbitration;
      choiceReview: ResidentLifeChoiceReviewObservation;
    }
  | {
      status: "blocked";
      matterId: string;
      runId: string;
      outcomeEvidence: ResidentKernelEvidence;
      arbitration: ResidentExecutionArbitration;
      choiceReview: ResidentLifeChoiceReviewObservation;
    }
  | {
      status: "authority_lost";
      matterId: string | null;
      runId: string;
      arbitration: ResidentExecutionArbitration;
      choiceReview: ResidentLifeChoiceReviewObservation;
    }
  | {
      status: "grounding_unavailable";
      matterId: string;
      runId: string;
      reason: "current_region_unknown" | "target_not_known" | "route_unavailable";
    }
  | {
      status: "unsupported_intent";
      matterId: string;
      runId: string;
      intentKind: string | null;
    };

interface TravelExecutionState {
  executor: ResidentGroundedTravelExecutor;
  targetRegionId: string;
}

/**
 * Resident-generic execution/reconciliation layer for already-authorized causal life.
 *
 * The coordinator deliberately does not advance World time. One World tick must remain
 * globally authoritative when several residents execute in parallel. Callers may step
 * each resident coordinator to latch legal effects, then advance the shared World once.
 *
 * It also does not choose a matter or create semantic intent. Focus/arbitration and the
 * continuity kernel already own those decisions. This layer only turns the currently
 * focused durable intent into an existing concrete executor and reconciles factual
 * terminal outcomes back into the same resident life.
 */
export class ResidentCausalExecutionCoordinator {
  private readonly travel = new Map<string, TravelExecutionState>();

  constructor(private readonly life: ResidentCausalLifeSubstrate) {}

  stepFocusedRun(): ResidentCausalExecutionStep {
    this.life.focus.sync();
    const runId = this.life.focus.focusedRun();
    if (!runId) return { status: "idle" };

    const binding = this.life.kernel.runBinding(runId);
    const matter = binding ? this.life.kernel.matter(binding.matterId) : null;
    if (!binding || !matter || !this.life.kernel.canRunMutateWorld(runId)) {
      this.travel.delete(runId);
      const releasedMatterId = binding?.matterId ?? null;
      const arbitration = this.life.arbitrator.reconcile();
      const choiceReview = this.life.choiceReviewBridge.observe(arbitration, this.life.world.tick);
      this.life.worldAuthority.enforceMotionAuthority();
      return {
        status: "authority_lost",
        matterId: releasedMatterId,
        runId,
        arbitration: structuredClone(arbitration),
        choiceReview: structuredClone(choiceReview),
      };
    }

    const intent = matter.semanticIntent;
    if (!intent || intent.kind !== "travel_region") {
      return {
        status: "unsupported_intent",
        matterId: matter.id,
        runId,
        intentKind: intent?.kind ?? null,
      };
    }

    const state = this.travel.get(runId) ?? this.createTravelExecution(matter, runId);
    if (!state) {
      return this.travelGroundingFailure(matter, runId);
    }

    const local = state.executor.step();
    if (local.status === "running") {
      return {
        status: "running",
        matterId: matter.id,
        runId,
        intentKind: "travel_region",
      };
    }
    if (local.status === "authority_lost") {
      this.travel.delete(runId);
      const arbitration = this.life.arbitrator.reconcile();
      const choiceReview = this.life.choiceReviewBridge.observe(arbitration, this.life.world.tick);
      this.life.worldAuthority.enforceMotionAuthority();
      return {
        status: "authority_lost",
        matterId: matter.id,
        runId,
        arbitration: structuredClone(arbitration),
        choiceReview: structuredClone(choiceReview),
      };
    }
    if (local.status === "blocked") {
      this.travel.delete(runId);
      return this.finishRun(
        matter,
        runId,
        "blocked",
        `travel blocked before ${state.targetRegionId}: ${local.constraints.join(", ") || "unknown constraint"}`,
        false,
      );
    }

    this.travel.delete(runId);
    return this.finishRun(
      matter,
      runId,
      "succeeded",
      `${runId} physically reached resident-grounded ${state.targetRegionId} destination`,
      true,
    );
  }

  private createTravelExecution(matter: ResidentMatter, runId: string): TravelExecutionState | null {
    const intent = matter.semanticIntent;
    if (!intent || intent.kind !== "travel_region") return null;

    const grounding = this.life.resident.cognitionContext({
      residentId: this.life.residentId,
      requestedAtTick: this.life.world.tick,
      reasons: [],
    });
    const currentRegionId = grounding.currentRegionId;
    if (!currentRegionId) return null;

    const known = new Set(grounding.knownRegions.map((region) => region.id));
    known.add(currentRegionId);
    if (!known.has(intent.targetRegionId)) return null;

    const route = this.life.navigation.route(currentRegionId, intent.targetRegionId, known);
    const destination = this.life.navigation.destinationPoint(intent.targetRegionId);
    if (!route || !destination) return null;

    const state: TravelExecutionState = {
      executor: new ResidentGroundedTravelExecutor(
        runId,
        destination,
        this.life.worldAuthority,
        this.life.world,
      ),
      targetRegionId: intent.targetRegionId,
    };
    this.travel.set(runId, state);
    return state;
  }

  private travelGroundingFailure(
    matter: ResidentMatter,
    runId: string,
  ): Extract<ResidentCausalExecutionStep, { status: "grounding_unavailable" }> {
    const grounding = this.life.resident.cognitionContext({
      residentId: this.life.residentId,
      requestedAtTick: this.life.world.tick,
      reasons: [],
    });
    const intent = matter.semanticIntent;
    if (!grounding.currentRegionId) {
      return { status: "grounding_unavailable", matterId: matter.id, runId, reason: "current_region_unknown" };
    }
    if (!intent || intent.kind !== "travel_region") {
      return { status: "grounding_unavailable", matterId: matter.id, runId, reason: "route_unavailable" };
    }
    const known = new Set(grounding.knownRegions.map((region) => region.id));
    known.add(grounding.currentRegionId);
    if (!known.has(intent.targetRegionId)) {
      return { status: "grounding_unavailable", matterId: matter.id, runId, reason: "target_not_known" };
    }
    return { status: "grounding_unavailable", matterId: matter.id, runId, reason: "route_unavailable" };
  }

  private finishRun(
    matter: ResidentMatter,
    runId: string,
    outcomeStatus: "succeeded" | "blocked",
    summary: string,
    resolveMatter: boolean,
  ): Extract<ResidentCausalExecutionStep, { status: "completed" | "blocked" }> {
    const reconciled = this.life.kernel.reconcileRunOutcome({
      runId,
      tick: this.life.world.tick,
      status: outcomeStatus,
      summary,
    });
    if (reconciled.status !== "recorded") {
      throw new Error(`failed to reconcile resident causal run: ${runId}`);
    }

    if (resolveMatter) this.life.kernel.resolveMatter(matter.id);
    this.life.outcomeReviewBridge.observe(reconciled.evidence, this.life.world.tick);

    const arbitration = this.life.arbitrator.reconcile();
    const choiceReview = this.life.choiceReviewBridge.observe(arbitration, this.life.world.tick);
    this.life.worldAuthority.enforceMotionAuthority();

    return {
      status: resolveMatter ? "completed" : "blocked",
      matterId: matter.id,
      runId,
      outcomeEvidence: structuredClone(reconciled.evidence),
      arbitration: structuredClone(arbitration),
      choiceReview: structuredClone(choiceReview),
    } as Extract<ResidentCausalExecutionStep, { status: "completed" | "blocked" }>;
  }
}
