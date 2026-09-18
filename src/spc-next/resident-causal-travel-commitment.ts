import type { ResidentCognitionContext } from "./cognition-contract";
import type { Vec2, WorldOccurrence } from "./contracts";
import type {
  ResidentContinuityKernel,
  ResidentMatter,
  ResidentMatterIntent,
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
import type { ResidentRuntime } from "./resident-runtime";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface GroundedResidentCausalTravelCommitmentIntent {
  originPerceptId: string;
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
  semanticIntent: ResidentMatterIntent;
}

export interface AcceptedResidentCausalTravelCommitment {
  matter: ResidentMatter;
  runId: string;
  routeRegionIds: readonly string[];
  originPerceptId: string;
  focusClaim: ResidentExecutionArbitrationRequest;
}

export interface ResidentCausalTravelCommitmentAuthorityOptions {
  residentId: string;
  resident: ResidentRuntime;
  world: SpcWorldRuntime;
  navigation: RegionNavigationGraph;
  kernel: ResidentContinuityKernel;
  arbitrator: ResidentExecutionArbitrator;
  authority: ResidentWorldExecutionAuthority;
  identityNamespace?: string;
}

interface GroundedCapabilityAuthority {
  attempt: ResidentLifeIntentAttempt;
  occurrenceId: string;
  proposal: ResidentLifeIntentProposal;
  identity: CausalIdentity;
}

interface CausalIdentity {
  matterId: string;
  taskId: string;
  runId: string;
  evidenceKey: string;
}

/**
 * Resident-generic authority seam for one bounded class of continuing commitment:
 * cognition may accept travel to a privately known region after exact private speech,
 * while continuity/run/body/World authority remains local.
 *
 * This module deliberately does not own provider transport, cognition scheduling,
 * execution stepping, outcome reconciliation, interruption policy or life-choice policy.
 */
export class ResidentCausalTravelCommitmentAuthority {
  private readonly accepted = new Set<string>();
  private readonly grounded = new WeakMap<
    GroundedResidentCausalTravelCommitmentIntent,
    GroundedCapabilityAuthority
  >();
  private readonly identityNamespace: string;

  constructor(private readonly options: ResidentCausalTravelCommitmentAuthorityOptions) {
    if (options.residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    if (options.resident.profile.id !== options.residentId) {
      throw new Error("resident causal authority runtime belongs to another resident");
    }
    if (options.authority.residentId !== options.residentId) {
      throw new Error("resident causal authority World facade belongs to another resident");
    }
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
  }

  acceptedMatterIds(): string[] {
    return [...this.accepted].sort((a, b) => a.localeCompare(b));
  }

  groundPrivateSpeechCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    occurrence: WorldOccurrence;
    proposal: ResidentLifeIntentProposal;
    providerContext: ResidentLifeCognitionContext;
    groundingContext: ResidentCognitionContext;
  }): ResidentLifeIntentAdmission<GroundedResidentCausalTravelCommitmentIntent> {
    if (input.attempt.residentId !== this.options.residentId
      || input.providerContext.resident.id !== this.options.residentId
      || input.groundingContext.resident.id !== this.options.residentId) {
      return { status: "rejected", detail: "causal travel commitment resident mismatch" };
    }

    const originPercept = input.attempt.context.recentPercepts.find(
      (percept) => percept.occurrenceId === input.occurrence.id,
    );
    if (!originPercept
      || originPercept.phenomenon !== "speech"
      || originPercept.text !== input.occurrence.text) {
      return { status: "rejected", detail: "commitment lost its exact private speech percept" };
    }
    if (!input.providerContext.recentPercepts.some((percept) => (
      percept.id === originPercept.id
      && percept.occurrenceId === input.occurrence.id
      && percept.phenomenon === "speech"
      && percept.text === input.occurrence.text
    ))) {
      return { status: "rejected", detail: "provider frame lacks exact private speech provenance" };
    }

    const decision = input.proposal.commitmentDecision;
    if (decision.kind !== "accept"
      || decision.intent.kind !== "travel"
      || decision.intent.targetRegionId === null) {
      return { status: "rejected", detail: "expected accepted known-region travel commitment" };
    }

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
      return { status: "rejected", detail: "commitment target lacks current resident-known route/destination" };
    }

    const identity = this.identityFor(input.occurrence);
    if (this.accepted.has(identity.matterId) || this.options.kernel.matter(identity.matterId)) {
      return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
    }

    const intent = Object.freeze({
      originPerceptId: originPercept.id,
      destination: Object.freeze({ ...destination }),
      routeRegionIds: Object.freeze([...route.regionIds]),
      semanticCourse: `${decision.reason} · ${decision.intent.goal}`,
      semanticIntent: Object.freeze({
        kind: "travel_region" as const,
        goal: decision.intent.goal,
        targetRegionId,
      }),
    }) satisfies GroundedResidentCausalTravelCommitmentIntent;

    this.grounded.set(intent, {
      attempt: input.attempt,
      occurrenceId: input.occurrence.id,
      proposal: input.proposal,
      identity,
    });
    return { status: "accepted", intent };
  }

  materializePrivateSpeechCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    occurrence: WorldOccurrence;
    proposal: ResidentLifeIntentProposal;
    intent: GroundedResidentCausalTravelCommitmentIntent;
  }): AcceptedResidentCausalTravelCommitment {
    const authority = this.grounded.get(input.intent);
    const identity = this.identityFor(input.occurrence);
    if (!authority
      || authority.attempt !== input.attempt
      || authority.occurrenceId !== input.occurrence.id
      || authority.proposal !== input.proposal
      || !sameIdentity(authority.identity, identity)) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal travel intent lacks exact admitted authority");
    }

    const originPercept = input.attempt.context.recentPercepts.find(
      (percept) => percept.id === input.intent.originPerceptId
        && percept.occurrenceId === input.occurrence.id
        && percept.phenomenon === "speech"
        && percept.text === input.occurrence.text,
    );
    if (!originPercept) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal travel intent lost its exact private speech origin");
    }
    if (this.accepted.has(identity.matterId) || this.options.kernel.matter(identity.matterId)) {
      this.grounded.delete(input.intent);
      throw new Error(`commitment already accepted: ${identity.matterId}`);
    }

    const origin = this.options.kernel.recordEvidence({
      id: `evidence:${this.identityNamespace}:accepted-${identity.evidenceKey}:${originPercept.tick}`,
      tick: originPercept.tick,
      kind: "accepted_cognition_commitment",
      summary: `${input.intent.semanticCourse}; origin occurrence ${originPercept.occurrenceId}`,
    });
    const matter = this.options.kernel.openMatter({
      id: identity.matterId,
      originEvidenceId: origin.id,
      semanticCourse: input.intent.semanticCourse,
      semanticIntent: input.intent.semanticIntent,
    });
    this.options.kernel.bindRun({
      matterId: identity.matterId,
      taskId: identity.taskId,
      runId: identity.runId,
    });

    const focusClaim = this.options.arbitrator.request(identity.runId);
    if (focusClaim.status === "rejected") {
      this.options.kernel.retireRun(identity.runId);
      this.grounded.delete(input.intent);
      throw new Error(`accepted causal travel run was not authorized: ${focusClaim.reason}`);
    }

    this.accepted.add(identity.matterId);
    this.grounded.delete(input.intent);
    return {
      matter: structuredClone(matter),
      runId: identity.runId,
      routeRegionIds: [...input.intent.routeRegionIds],
      originPerceptId: input.intent.originPerceptId,
      focusClaim: structuredClone(focusClaim),
    };
  }

  private identityFor(occurrence: WorldOccurrence): CausalIdentity {
    const causalId = occurrence.id;
    return {
      matterId: `matter.${this.identityNamespace}.causal.${causalId}`,
      taskId: `task.${this.identityNamespace}.causal.${causalId}.semantic-1`,
      runId: `run.${this.identityNamespace}.causal.${causalId}.semantic-1`,
      evidenceKey: `commitment:${causalId}`,
    };
  }
}

function defaultIdentityNamespace(residentId: string): string {
  const pieces = residentId.split(".").filter((part) => part.length > 0);
  return pieces.at(-1) ?? residentId;
}

function normalizeIdentityNamespace(value: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("resident causal identity namespace must be a simple non-empty token");
  }
  return normalized;
}

function sameIdentity(left: CausalIdentity, right: CausalIdentity): boolean {
  return left.matterId === right.matterId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.evidenceKey === right.evidenceKey;
}
