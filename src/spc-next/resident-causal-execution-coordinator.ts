import type {
  ResidentKernelEvidence,
  ResidentMatter,
} from "./resident-continuity-kernel";
import type {
  ResidentExecutionArbitration,
  ResidentExecutionArbitrationRequest,
} from "./resident-execution-arbitrator";
import { ResidentGroundedTravelExecutor } from "./resident-grounded-travel-executor";
import { ResidentMessageDeliveryExecutor } from "./resident-message-delivery-executor";
import type { ResidentLifeChoiceReviewObservation } from "./resident-life-choice-review-bridge";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

export type ResidentCausalExecutionStep =
  | { status: "idle" }
  | {
      status: "running";
      matterId: string;
      runId: string;
      intentKind: "travel_region" | "communicate_actor";
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

interface CommunicateExecutionState {
  executor: ResidentMessageDeliveryExecutor;
  targetActorId: string;
}

export type ResidentCausalExecutionReactivation =
  | ({
      matterId: string;
      runId: string;
    } & ResidentExecutionArbitrationRequest)
  | {
      status: "rejected";
      matterId: string;
      reason:
        | "matter_missing"
        | "matter_not_active"
        | "run_already_bound"
        | "semantic_review_required"
        | "unsupported_intent"
        | "run_not_authorized";
    };

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
  private readonly communicate = new Map<string, CommunicateExecutionState>();

  constructor(private readonly life: ResidentCausalLifeSubstrate) {}

  reactivateReviewedMatter(matterId: string): ResidentCausalExecutionReactivation {
    const matter = this.life.kernel.matter(matterId);
    if (!matter) return { status: "rejected", matterId, reason: "matter_missing" };
    if (matter.status !== "active") {
      return { status: "rejected", matterId, reason: "matter_not_active" };
    }
    if (matter.activeRunId !== null) {
      return { status: "rejected", matterId, reason: "run_already_bound" };
    }
    if (!matter.semanticIntent
      || (matter.semanticIntent.kind !== "travel_region"
        && matter.semanticIntent.kind !== "communicate_actor")) {
      return { status: "rejected", matterId, reason: "unsupported_intent" };
    }

    const priorExecutionRevision = matter.lastOutcomeSemanticRevision ?? 1;
    if (matter.semanticRevision <= priorExecutionRevision) {
      return { status: "rejected", matterId, reason: "semantic_review_required" };
    }

    const identityStem = matter.id.startsWith("matter.")
      ? matter.id.slice("matter.".length)
      : matter.id;
    const runId = `run.${identityStem}.semantic-${matter.semanticRevision}`;
    const taskId = `task.${identityStem}.semantic-${matter.semanticRevision}`;

    this.life.kernel.bindRun({ matterId, taskId, runId });
    const claim = this.life.arbitrator.request(runId);
    if (claim.status === "rejected") {
      this.life.kernel.retireRun(runId);
      return { status: "rejected", matterId, reason: "run_not_authorized" };
    }
    if (claim.status === "deferred") {
      this.life.choiceReviewBridge.observe(this.life.arbitrator.reconcile(), this.life.world.tick);
    }
    return {
      ...structuredClone(claim),
      matterId,
      runId,
    };
  }

  stepFocusedRun(): ResidentCausalExecutionStep {
    this.life.focus.sync();
    const runId = this.life.focus.focusedRun();
    if (!runId) return { status: "idle" };

    const binding = this.life.kernel.runBinding(runId);
    const matter = binding ? this.life.kernel.matter(binding.matterId) : null;
    if (!binding || !matter || !this.life.kernel.canRunMutateWorld(runId)) {
      this.clearExecution(runId);
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
    if (!intent) {
      return {
        status: "unsupported_intent",
        matterId: matter.id,
        runId,
        intentKind: null,
      };
    }

    if (intent.kind === "travel_region") {
      return this.stepTravel(matter, runId);
    }
    if (intent.kind === "communicate_actor") {
      return this.stepCommunicate(matter, runId);
    }

    const exhaustiveIntent: never = intent;
    return exhaustiveIntent;
  }

  private stepTravel(matter: ResidentMatter, runId: string): ResidentCausalExecutionStep {
    const state = this.travel.get(runId) ?? this.createTravelExecution(matter, runId);
    if (!state) return this.travelGroundingFailure(matter, runId);

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
      this.clearExecution(runId);
      return this.finishAuthorityLost(matter.id, runId);
    }
    if (local.status === "blocked") {
      this.clearExecution(runId);
      return this.finishRun(
        matter,
        runId,
        "blocked",
        `travel blocked before ${state.targetRegionId}: ${local.constraints.join(", ") || "unknown constraint"}`,
        false,
      );
    }

    this.clearExecution(runId);
    return this.finishRun(
      matter,
      runId,
      "succeeded",
      `${runId} physically reached resident-grounded ${state.targetRegionId} destination`,
      true,
    );
  }

  private stepCommunicate(matter: ResidentMatter, runId: string): ResidentCausalExecutionStep {
    const intent = matter.semanticIntent;
    if (!intent || intent.kind !== "communicate_actor") {
      return {
        status: "unsupported_intent",
        matterId: matter.id,
        runId,
        intentKind: intent?.kind ?? null,
      };
    }

    const state = this.communicate.get(runId) ?? this.createCommunicateExecution(matter, runId);
    if (!state) {
      return {
        status: "unsupported_intent",
        matterId: matter.id,
        runId,
        intentKind: intent.kind,
      };
    }

    const local = state.executor.step();
    if (local.status === "running") {
      return {
        status: "running",
        matterId: matter.id,
        runId,
        intentKind: "communicate_actor",
      };
    }
    if (local.status === "authority_lost") {
      this.clearExecution(runId);
      return this.finishAuthorityLost(matter.id, runId);
    }
    if (local.status === "blocked") {
      this.clearExecution(runId);
      return this.finishRun(
        matter,
        runId,
        "blocked",
        `communication to ${state.targetActorId} blocked: ${local.reason}`,
        false,
      );
    }

    this.clearExecution(runId);
    return this.finishRun(
      matter,
      runId,
      "succeeded",
      `${runId} factually delivered speech to ${state.targetActorId} through ${local.occurrence.id}`,
      true,
    );
  }

  private createCommunicateExecution(
    matter: ResidentMatter,
    runId: string,
  ): CommunicateExecutionState | null {
    const intent = matter.semanticIntent;
    if (!intent || intent.kind !== "communicate_actor") return null;

    const state: CommunicateExecutionState = {
      executor: new ResidentMessageDeliveryExecutor(
        runId,
        intent.targetActorId,
        intent.text,
        (actorId) => this.life.resident.cognitionContext({
          residentId: this.life.residentId,
          requestedAtTick: this.life.world.tick,
          reasons: [],
        }).knownActors.find((actor) => actor.id === actorId) ?? null,
        this.life.worldAuthority,
        this.life.world,
      ),
      targetActorId: intent.targetActorId,
    };
    this.communicate.set(runId, state);
    return state;
  }

  private finishAuthorityLost(
    matterId: string | null,
    runId: string,
  ): Extract<ResidentCausalExecutionStep, { status: "authority_lost" }> {
    const arbitration = this.life.arbitrator.reconcile();
    const choiceReview = this.life.choiceReviewBridge.observe(arbitration, this.life.world.tick);
    this.life.worldAuthority.enforceMotionAuthority();
    return {
      status: "authority_lost",
      matterId,
      runId,
      arbitration: structuredClone(arbitration),
      choiceReview: structuredClone(choiceReview),
    };
  }

  private clearExecution(runId: string): void {
    this.travel.delete(runId);
    this.communicate.delete(runId);
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

  private restoreExactInterruptedContinuity(interruptingMatterId: string): void {
    const resumable = this.life.matterScope.matterIds()
      .map((matterId) => this.life.kernel.matter(matterId))
      .filter((candidate): candidate is ResidentMatter => (
        candidate !== null
        && candidate.status === "suspended"
        && candidate.suspendedByMatterId === interruptingMatterId
        && this.life.kernel.canResumeMatter(candidate.id)
      ));

    // One whole-body interrupt has one exact return target. If the semantic model ever
    // permits several matters to be suspended by one interrupt, do not invent a winner
    // here; leave that ambiguity for a higher continuity/policy layer.
    if (resumable.length !== 1) return;

    const returning = resumable[0]!;
    if (!this.life.kernel.resumeMatter(returning.id)) return;
    const runId = returning.activeRunId;
    if (!runId || !this.life.kernel.canRunMutateWorld(runId)) return;

    const restored = this.life.arbitrator.restoreInterrupted(runId);
    if (restored.status !== "acquired" && restored.status !== "already_focused") {
      throw new Error(`failed to exact-return interrupted run: ${runId}`);
    }
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

    if (resolveMatter) {
      this.life.kernel.resolveMatter(matter.id);
      this.restoreExactInterruptedContinuity(matter.id);
    }
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
