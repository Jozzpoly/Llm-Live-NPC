import type { ResidentCognitionContext } from "./cognition-contract";
import type { CognitionReason } from "./contracts";
import type {
  ResidentCommunicateActorMatterIntent,
  ResidentContinuityKernel,
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

    if (decision.intent.kind === "travel" && decision.intent.targetRegionId !== null) {
      const currentRegionId = input.groundingContext.currentRegionId;
      if (!currentRegionId) {
        return { status: "rejected", detail: "current resident region is unavailable at admission" };
      }
      const known = new Set(input.groundingContext.knownRegions.map((region) => region.id));
      known.add(currentRegionId);
      const targetRegionId = decision.intent.targetRegionId;
      const route = this.options.navigation.route(currentRegionId, targetRegionId, known);
      const destination = this.options.navigation.destinationPoint(targetRegionId);
      if (!route || !destination) {
        return { status: "rejected", detail: "reason commitment target lacks current resident-known route/destination" };
      }

      const intent = Object.freeze({
        originReasonId: originReason.id,
        originReasonKind: originReason.kind,
        semanticCourse: `${decision.reason} · ${decision.intent.goal}`,
        semanticIntent: Object.freeze({
          kind: "travel_region" as const,
          goal: decision.intent.goal,
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

    if (decision.intent.kind === "communicate"
      && decision.intent.targetActorId !== null
      && decision.intent.text !== null) {
      const knownActor = input.groundingContext.knownActors.find(
        (actor) => actor.id === decision.intent.targetActorId,
      );
      if (!knownActor) {
        return { status: "rejected", detail: "reason commitment target actor is not privately known" };
      }

      const intent = Object.freeze({
        originReasonId: originReason.id,
        originReasonKind: originReason.kind,
        semanticCourse: `${decision.reason} · ${decision.intent.goal}`,
        semanticIntent: Object.freeze({
          kind: "communicate_actor" as const,
          goal: decision.intent.goal,
          targetActorId: decision.intent.targetActorId,
          text: decision.intent.text,
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
      detail: "reason commitment currently supports known-region travel or known-actor communication",
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
    const identity = originReason ? this.identityFor(originReason.id) : null;
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
      || !SELF_ORIGIN_REASON_KINDS.has(originReason.kind)) {
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
    const matter = this.options.kernel.openMatter({
      id: identity.matterId,
      originEvidenceId: origin.id,
      semanticCourse: input.intent.semanticCourse,
      semanticIntent: input.intent.semanticIntent as ResidentMatterIntent,
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

  private identityFor(reasonId: string): CausalIdentity {
    return {
      matterId: `matter.${this.identityNamespace}.causal.reason:${reasonId}`,
      taskId: `task.${this.identityNamespace}.causal.reason:${reasonId}.semantic-1`,
      runId: `run.${this.identityNamespace}.causal.reason:${reasonId}.semantic-1`,
    };
  }
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
