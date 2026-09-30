import type { ResidentCognitionContext } from "./cognition-contract";
import {
  derivePriorCounterpartySocialOutcomeSupport,
  derivePriorSameActorOutcomeSupport,
} from "./resident-cumulative-history-support";
import type { CognitionReason } from "./contracts";
import type {
  ResidentAcquireMaterialObjectMatterIntent,
  ResidentCommunicateActorMatterIntent,
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
  ResidentMatterIntent,
  ResidentTravelRegionMatterIntent,
} from "./resident-continuity-kernel";
import type {
  ResidentExecutionArbitrator,
  ResidentExecutionArbitrationRequest,
} from "./resident-execution-arbitrator";
import type { RegionNavigationGraph } from "./region-navigation";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import type {
  ResidentLifeIntentAdmission,
  ResidentLifeIntentAttempt,
} from "./resident-life-intent-owner";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import type { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import {
  materialReacquiredEvidenceId,
  materialReacquiredOpportunityReasonId,
} from "./resident-material-matter-relevance-bridge";
import type { ResidentRuntime } from "./resident-runtime";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

const SELF_ORIGIN_REASON_KINDS = new Set<CognitionReason["kind"]>([
  "activity_completed",
  "activity_blocked",
  "uncertainty",
  "direct_world_change",
]);

export type GroundedResidentCausalReasonCommitmentIntent =
  | {
      originReasonId: string;
      originReasonKind: CognitionReason["kind"];
      semanticCourse: string;
      semanticIntent: ResidentTravelRegionMatterIntent;
      routeRegionIds: readonly string[];
    }
  | {
      originReasonId: string;
      originReasonKind: CognitionReason["kind"];
      semanticCourse: string;
      semanticIntent: ResidentCommunicateActorMatterIntent;
      routeRegionIds: readonly [];
    }
  | {
      originReasonId: string;
      originReasonKind: "direct_world_change";
      sourceMatterId: string;
      reacquisitionEvidenceId: string;
      priorOutcomeEvidenceId: string;
      semanticCourse: string;
      semanticIntent: ResidentAcquireMaterialObjectMatterIntent;
      routeRegionIds: readonly [];
    };

export interface AcceptedResidentCausalReasonCommitment {
  originReason: CognitionReason;
  matter: ResidentMatter;
  runId: string;
  routeRegionIds: readonly string[];
  focusClaim: ResidentExecutionArbitrationRequest;
}

export interface ResidentCausalReasonCommitmentAuthorityOptions {
  residentId: string;
  resident: ResidentRuntime;
  world: SpcWorldRuntime;
  navigation: RegionNavigationGraph;
  kernel: ResidentContinuityKernel;
  arbitrator: ResidentExecutionArbitrator;
  authority: ResidentWorldExecutionAuthority;
  /** Required only for acquire_material_object reason commitments. */
  materialKnowledge?: ResidentMaterialKnowledge;
  matterScope?: ResidentLifeMatterScope;
  identityNamespace?: string;
}

interface GroundedAuthority {
  attempt: ResidentLifeIntentAttempt;
  originReason: CognitionReason;
  proposal: ResidentLifeIntentProposal;
  identity: CausalIdentity;
}

interface CausalIdentity {
  matterId: string;
  taskId: string;
  runId: string;
}

/**
 * Resident-generic bridge from one exact non-speech cognition reason into durable
 * causal life. This is the bootstrap/autonomy seam for explicit pressures such as
 * authored activity completion, blockage, uncertainty or directly perceived world
 * change. Passage of time / quiet review is deliberately not a causal origin.
 *
 * Heard speech is deliberately excluded. Speech-origin commitments must continue to
 * prove their exact private percept through the dedicated speech authorities.
 */
export class ResidentCausalReasonCommitmentAuthority {
  private readonly grounded = new WeakMap<
    GroundedResidentCausalReasonCommitmentIntent,
    GroundedAuthority
  >();
  private readonly identityNamespace: string;
  private readonly matterScope: ResidentLifeMatterScope;

  constructor(private readonly options: ResidentCausalReasonCommitmentAuthorityOptions) {
    if (options.residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    if (options.resident.profile.id !== options.residentId) {
      throw new Error("resident causal reason authority runtime belongs to another resident");
    }
    if (options.authority.residentId !== options.residentId) {
      throw new Error("resident causal reason World facade belongs to another resident");
    }
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
    this.matterScope = options.matterScope ?? new ResidentLifeMatterScope(options.kernel);
  }

  groundCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    originReasonId: string;
    proposal: ResidentLifeIntentProposal;
    providerContext: ResidentLifeCognitionContext;
    groundingContext: ResidentCognitionContext;
  }): ResidentLifeIntentAdmission<GroundedResidentCausalReasonCommitmentIntent> {
    if (input.attempt.residentId !== this.options.residentId
      || input.providerContext.resident.id !== this.options.residentId
      || input.groundingContext.resident.id !== this.options.residentId) {
      return { status: "rejected", detail: "causal reason commitment resident mismatch" };
    }

    const originReason = exactReason(input.attempt.context, input.providerContext, input.originReasonId);
    if (!originReason || !SELF_ORIGIN_REASON_KINDS.has(originReason.kind)) {
      return { status: "rejected", detail: "commitment lacks exact non-speech cognition origin" };
    }

    const identity = this.identityFor(originReason.id);
    if (this.options.kernel.matter(identity.matterId)) {
      return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
    }

    const decision = input.proposal.commitmentDecision;
    if (decision.kind !== "accept") {
      return { status: "rejected", detail: "expected accepted resident commitment" };
    }
    const acceptedIntent = decision.intent;

    if (acceptedIntent.kind === "travel" && acceptedIntent.targetRegionId !== null) {
      const currentRegionId = input.groundingContext.currentRegionId;
      if (!currentRegionId) {
        return { status: "rejected", detail: "current resident region is unavailable at admission" };
      }
      const known = new Set(input.groundingContext.knownRegions.map((region) => region.id));
      known.add(currentRegionId);
      const targetRegionId = acceptedIntent.targetRegionId;
      const route = this.options.navigation.route(currentRegionId, targetRegionId, known);
      const destination = this.options.navigation.destinationPoint(targetRegionId);
      if (!route || !destination) {
        return { status: "rejected", detail: "reason commitment target lacks current resident-known route/destination" };
      }

      const intent = Object.freeze({
        originReasonId: originReason.id,
        originReasonKind: originReason.kind,
        semanticCourse: `${decision.reason} · ${acceptedIntent.goal}`,
        semanticIntent: Object.freeze({
          kind: "travel_region" as const,
          goal: acceptedIntent.goal,
          targetRegionId,
        }),
        routeRegionIds: Object.freeze([...route.regionIds]),
      }) satisfies GroundedResidentCausalReasonCommitmentIntent;
      this.grounded.set(intent, {
        attempt: input.attempt,
        originReason: structuredClone(originReason),
        proposal: input.proposal,
        identity,
      });
      return { status: "accepted", intent };
    }

    if (acceptedIntent.kind === "acquire_material_object") {
      const material = this.exactMaterialReacquisition(
        input.providerContext,
        originReason,
        acceptedIntent.objectId,
      );
      if (!material) {
        return {
          status: "rejected",
          detail: "material commitment lacks exact current private reacquisition authority",
        };
      }

      const identity = this.materialIdentityFor(material.reacquisitionEvidence.id);
      if (this.options.kernel.matter(identity.matterId)) {
        return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
      }

      const intent = Object.freeze({
        originReasonId: originReason.id,
        originReasonKind: "direct_world_change" as const,
        sourceMatterId: material.sourceMatterId,
        reacquisitionEvidenceId: material.reacquisitionEvidence.id,
        priorOutcomeEvidenceId: material.priorOutcomeEvidence.id,
        semanticCourse: `${decision.reason} · ${acceptedIntent.goal}`,
        semanticIntent: Object.freeze({
          kind: "acquire_material_object" as const,
          goal: acceptedIntent.goal,
          objectId: acceptedIntent.objectId,
        }),
        routeRegionIds: [] as const,
      }) satisfies GroundedResidentCausalReasonCommitmentIntent;
      this.grounded.set(intent, {
        attempt: input.attempt,
        originReason: structuredClone(originReason),
        proposal: input.proposal,
        identity,
      });
      return { status: "accepted", intent };
    }

    if (acceptedIntent.kind === "communicate"
      && "targetActorId" in acceptedIntent
      && "text" in acceptedIntent
      && acceptedIntent.targetActorId !== null
      && acceptedIntent.text !== null) {
      const knownActor = input.groundingContext.knownActors.find(
        (actor) => actor.id === acceptedIntent.targetActorId,
      );
      if (!knownActor) {
        return { status: "rejected", detail: "reason commitment target actor is not privately known" };
      }

      const intent = Object.freeze({
        originReasonId: originReason.id,
        originReasonKind: originReason.kind,
        semanticCourse: `${decision.reason} · ${acceptedIntent.goal}`,
        semanticIntent: Object.freeze({
          kind: "communicate_actor" as const,
          goal: acceptedIntent.goal,
          targetActorId: acceptedIntent.targetActorId,
          text: acceptedIntent.text,
        }),
        routeRegionIds: [] as const,
      }) satisfies GroundedResidentCausalReasonCommitmentIntent;
      this.grounded.set(intent, {
        attempt: input.attempt,
        originReason: structuredClone(originReason),
        proposal: input.proposal,
        identity,
      });
      return { status: "accepted", intent };
    }

    return {
      status: "rejected",
      detail: "reason commitment currently supports known-region travel, known-actor communication or exact reacquired material",
    };
  }

  materializeCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    originReasonId: string;
    proposal: ResidentLifeIntentProposal;
    intent: GroundedResidentCausalReasonCommitmentIntent;
    tick: number;
  }): AcceptedResidentCausalReasonCommitment {
    if (!Number.isSafeInteger(input.tick) || input.tick < 0) {
      throw new Error("causal reason materialization tick must be a non-negative safe integer");
    }

    const originReason = input.attempt.context.reasons.find(
      (reason) => reason.id === input.originReasonId,
    ) ?? null;
    const materialIntent = isGroundedMaterialCommitmentIntent(input.intent)
      ? input.intent
      : null;
    const identity = originReason
      ? materialIntent
        ? this.materialIdentityFor(materialIntent.reacquisitionEvidenceId)
        : this.identityFor(originReason.id)
      : null;
    const grounded = this.grounded.get(input.intent);
    if (!originReason
      || !identity
      || !grounded
      || grounded.attempt !== input.attempt
      || grounded.originReason.id !== originReason.id
      || grounded.proposal !== input.proposal
      || grounded.identity.matterId !== identity.matterId
      || grounded.identity.taskId !== identity.taskId
      || grounded.identity.runId !== identity.runId
      || input.intent.originReasonId !== originReason.id
      || !SELF_ORIGIN_REASON_KINDS.has(originReason.kind)
      || (materialIntent
        && !this.materialIntentStillGrounded(input.attempt.context, originReason, materialIntent))) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal reason intent lacks exact admitted authority");
    }
    if (this.options.kernel.matter(identity.matterId)) {
      this.grounded.delete(input.intent);
      throw new Error(`commitment already accepted: ${identity.matterId}`);
    }

    const origin = this.options.kernel.recordEvidence({
      id: `evidence:${this.identityNamespace}:accepted-reason:${originReason.id}:${input.tick}`,
      tick: input.tick,
      kind: "accepted_cognition_commitment",
      summary: `${input.intent.semanticCourse}; origin reason ${originReason.kind} ${originReason.id}: ${originReason.summary}`,
    });
    const communicateHistory = input.intent.semanticIntent.kind === "communicate_actor"
      ? [
          ...derivePriorSameActorOutcomeSupport(
            this.options.kernel,
            input.intent.semanticIntent.targetActorId,
          ),
          ...derivePriorCounterpartySocialOutcomeSupport(
            this.options.kernel,
            input.intent.semanticIntent.targetActorId,
          ),
        ]
      : [];
    const matter = this.options.kernel.openMatter({
      id: identity.matterId,
      originEvidenceId: origin.id,
      semanticCourse: input.intent.semanticCourse,
      semanticIntent: input.intent.semanticIntent as ResidentMatterIntent,
      ...(materialIntent ? {
        historicalSupport: [{
          relation: "prior_same_material_outcome" as const,
          sourceMatterId: materialIntent.sourceMatterId,
          evidenceId: materialIntent.priorOutcomeEvidenceId,
        }],
      } : communicateHistory.length > 0 ? {
        historicalSupport: communicateHistory,
      } : {}),
    });
    this.options.kernel.bindRun({
      matterId: matter.id,
      taskId: identity.taskId,
      runId: identity.runId,
    });

    const focusClaim = this.options.arbitrator.request(identity.runId);
    if (focusClaim.status === "rejected") {
      this.options.kernel.retireRun(identity.runId);
      this.grounded.delete(input.intent);
      throw new Error(`accepted causal reason run was not authorized: ${focusClaim.reason}`);
    }

    this.matterScope.track(matter.id);
    this.grounded.delete(input.intent);
    return {
      originReason: structuredClone(originReason),
      matter: structuredClone(matter),
      runId: identity.runId,
      routeRegionIds: [...input.intent.routeRegionIds],
      focusClaim: structuredClone(focusClaim),
    };
  }

  private exactMaterialReacquisition(
    context: ResidentLifeCognitionContext,
    originReason: CognitionReason,
    objectId: string,
  ): {
    sourceMatterId: string;
    reacquisitionEvidence: ResidentKernelEvidence;
    priorOutcomeEvidence: ResidentKernelEvidence;
  } | null {
    if (originReason.kind !== "direct_world_change"
      || originReason.id !== materialReacquiredOpportunityReasonId(this.options.residentId, objectId)
      || !this.options.materialKnowledge) return null;

    // A recent terminal episode may still be projected in life. An older one may
    // exist only in the bounded factual terminal archive. Both routes must identify
    // the same exact kernel matter + task outcome; neither grants the old matter any
    // current execution or body authority.
    const sources = new Map<string, ResidentKernelEvidence>();
    for (const matter of context.life.matters) {
      if ((matter.status !== "resolved" && matter.status !== "cancelled")
        || matter.activeRun !== null
        || matter.semanticIntent?.kind !== "acquire_material_object"
        || matter.semanticIntent.objectId !== objectId
        || matter.lastOutcomeEvidence?.kind !== "task_outcome"
        || !matter.lastOutcomeEvidence.summary.startsWith("blocked:")
        || !originReason.evidenceIds.includes(matter.lastOutcomeEvidence.id)) continue;
      sources.set(matter.id, structuredClone(matter.lastOutcomeEvidence));
    }

    for (const entry of this.options.kernel.terminalOutcomeArchiveSnapshot()) {
      const matter = this.options.kernel.matter(entry.matterId);
      if (!matter
        || (matter.status !== "resolved" && matter.status !== "cancelled")
        || matter.activeRunId !== null
        || matter.semanticIntent?.kind !== "acquire_material_object"
        || matter.semanticIntent.objectId !== objectId
        || matter.lastOutcomeEvidenceId !== entry.evidence.id
        || entry.evidence.kind !== "task_outcome"
        || !entry.evidence.summary.startsWith("blocked:")
        || !originReason.evidenceIds.includes(entry.evidence.id)) continue;

      const existing = sources.get(matter.id);
      if (existing && !sameKernelEvidence(existing, entry.evidence)) return null;
      sources.set(matter.id, structuredClone(entry.evidence));
    }

    if (sources.size !== 1) return null;
    const [sourceMatterId, projectedOutcome] = [...sources.entries()][0]!;

    const reacquisitionId = materialReacquiredEvidenceId(
      this.options.residentId,
      sourceMatterId,
      objectId,
      originReason.tick,
    );
    if (!originReason.evidenceIds.includes(reacquisitionId)) return null;

    const recent = this.options.kernel.recentEvidenceSnapshot();
    const reacquisitionEvidence = recent.find((evidence) => evidence.id === reacquisitionId) ?? null;
    const archivedOutcome = this.options.kernel.archivedTerminalOutcomeEvidence(sourceMatterId);
    const recentOutcome = recent.find((evidence) => evidence.id === projectedOutcome.id) ?? null;
    const priorOutcomeEvidence = archivedOutcome ?? recentOutcome;
    if (!reacquisitionEvidence
      || reacquisitionEvidence.kind !== "material_reacquired"
      || reacquisitionEvidence.tick !== originReason.tick
      || !priorOutcomeEvidence
      || !sameKernelEvidence(priorOutcomeEvidence, projectedOutcome)) return null;

    const kernelSource = this.options.kernel.matter(sourceMatterId);
    if (!kernelSource
      || (kernelSource.status !== "resolved" && kernelSource.status !== "cancelled")
      || kernelSource.activeRunId !== null
      || kernelSource.semanticIntent?.kind !== "acquire_material_object"
      || kernelSource.semanticIntent.objectId !== objectId
      || kernelSource.lastOutcomeEvidenceId !== priorOutcomeEvidence.id) return null;

    this.options.materialKnowledge.sample();
    const current = this.options.materialKnowledge.observation(objectId);
    if (!current?.currentlyVisible) return null;

    const openSameObject = context.life.matters.some((matter) => (
      (matter.status === "active" || matter.status === "suspended")
      && matter.semanticIntent?.kind === "acquire_material_object"
      && matter.semanticIntent.objectId === objectId
    ));
    if (openSameObject) return null;

    return {
      sourceMatterId,
      reacquisitionEvidence,
      priorOutcomeEvidence: structuredClone(priorOutcomeEvidence),
    };
  }

  private materialIntentStillGrounded(
    context: ResidentLifeCognitionContext,
    originReason: CognitionReason,
    intent: Extract<
      GroundedResidentCausalReasonCommitmentIntent,
      { semanticIntent: ResidentAcquireMaterialObjectMatterIntent }
    >,
  ): boolean {
    const current = this.exactMaterialReacquisition(
      context,
      originReason,
      intent.semanticIntent.objectId,
    );
    return Boolean(current
      && current.sourceMatterId === intent.sourceMatterId
      && current.reacquisitionEvidence.id === intent.reacquisitionEvidenceId
      && current.priorOutcomeEvidence.id === intent.priorOutcomeEvidenceId);
  }

  private materialIdentityFor(reacquisitionEvidenceId: string): CausalIdentity {
    return {
      matterId: `matter.${this.identityNamespace}.causal.material:${reacquisitionEvidenceId}`,
      taskId: `task.${this.identityNamespace}.causal.material:${reacquisitionEvidenceId}.semantic-1`,
      runId: `run.${this.identityNamespace}.causal.material:${reacquisitionEvidenceId}.semantic-1`,
    };
  }

  private identityFor(reasonId: string): CausalIdentity {
    return {
      matterId: `matter.${this.identityNamespace}.causal.reason:${reasonId}`,
      taskId: `task.${this.identityNamespace}.causal.reason:${reasonId}.semantic-1`,
      runId: `run.${this.identityNamespace}.causal.reason:${reasonId}.semantic-1`,
    };
  }
}

function isGroundedMaterialCommitmentIntent(
  intent: GroundedResidentCausalReasonCommitmentIntent,
): intent is Extract<
  GroundedResidentCausalReasonCommitmentIntent,
  { semanticIntent: ResidentAcquireMaterialObjectMatterIntent }
> {
  return intent.semanticIntent.kind === "acquire_material_object"
    && "reacquisitionEvidenceId" in intent
    && "priorOutcomeEvidenceId" in intent
    && "sourceMatterId" in intent;
}

function sameKernelEvidence(
  left: ResidentKernelEvidence,
  right: ResidentKernelEvidence,
): boolean {
  return left.id === right.id
    && left.tick === right.tick
    && left.kind === right.kind
    && left.summary === right.summary
    && left.sourceRunId === right.sourceRunId;
}

function exactReason(
  attemptContext: ResidentLifeCognitionContext,
  providerContext: ResidentLifeCognitionContext,
  reasonId: string,
): CognitionReason | null {
  const attemptReason = attemptContext.reasons.find((reason) => reason.id === reasonId);
  const providerReason = providerContext.reasons.find((reason) => reason.id === reasonId);
  if (!attemptReason || !providerReason) return null;
  return JSON.stringify(attemptReason) === JSON.stringify(providerReason)
    ? structuredClone(attemptReason)
    : null;
}

function defaultIdentityNamespace(residentId: string): string {
  const pieces = residentId.split(".").filter((part) => part.length > 0);
  return pieces.at(-1) ?? residentId;
}

function normalizeIdentityNamespace(value: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("resident causal reason identity namespace must be a simple non-empty token");
  }
  return normalized;
}
