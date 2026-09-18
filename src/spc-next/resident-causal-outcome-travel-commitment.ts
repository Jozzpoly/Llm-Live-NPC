import type { ResidentCognitionContext } from "./cognition-contract";
import type { Vec2 } from "./contracts";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
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

export interface GroundedResidentCausalOutcomeTravelCommitmentIntent {
  sourceMatterId: string;
  originOutcomeEvidenceId: string;
  destination: Vec2;
  routeRegionIds: readonly string[];
  semanticCourse: string;
  semanticIntent: ResidentTravelRegionMatterIntent;
}

export interface AcceptedResidentCausalOutcomeTravelCommitment {
  sourceMatterId: string;
  originOutcomeEvidence: ResidentKernelEvidence;
  matter: ResidentMatter;
  runId: string;
  routeRegionIds: readonly string[];
  focusClaim: ResidentExecutionArbitrationRequest;
}

export interface ResidentCausalOutcomeTravelCommitmentAuthorityOptions {
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

interface GroundedCapabilityAuthority {
  attempt: ResidentLifeIntentAttempt;
  sourceMatterId: string;
  outcomeEvidenceId: string;
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
 * Resident-generic authority seam for a bounded self-origin follow-up.
 *
 * The causal source is not speech. It is one exact factual outcome from a resolved
 * resident matter that is simultaneously present in the frozen life-cognition frame
 * and the kernel's bounded recent-evidence window. Provider semantics may select a
 * known-region travel follow-up, but continuity/run/body/World authority stays local.
 */
export class ResidentCausalOutcomeTravelCommitmentAuthority {
  private readonly grounded = new WeakMap<
    GroundedResidentCausalOutcomeTravelCommitmentIntent,
    GroundedCapabilityAuthority
  >();
  private readonly identityNamespace: string;
  private readonly matterScope: ResidentLifeMatterScope;

  constructor(private readonly options: ResidentCausalOutcomeTravelCommitmentAuthorityOptions) {
    if (options.residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    if (options.resident.profile.id !== options.residentId) {
      throw new Error("resident causal outcome authority runtime belongs to another resident");
    }
    if (options.authority.residentId !== options.residentId) {
      throw new Error("resident causal outcome World facade belongs to another resident");
    }
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
    this.matterScope = options.matterScope ?? new ResidentLifeMatterScope(options.kernel);
  }

  acceptedMatterIds(): string[] {
    return this.matterScope.matterIds();
  }

  groundLifeOutcomeCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    sourceMatterId: string;
    proposal: ResidentLifeIntentProposal;
    providerContext: ResidentLifeCognitionContext;
    groundingContext: ResidentCognitionContext;
  }): ResidentLifeIntentAdmission<GroundedResidentCausalOutcomeTravelCommitmentIntent> {
    if (input.attempt.residentId !== this.options.residentId
      || input.providerContext.resident.id !== this.options.residentId
      || input.groundingContext.resident.id !== this.options.residentId) {
      return { status: "rejected", detail: "causal outcome commitment resident mismatch" };
    }

    const outcomeEvidence = this.exactLifeOutcomeEvidence(
      input.providerContext,
      input.sourceMatterId,
    );
    if (!outcomeEvidence) {
      return { status: "rejected", detail: "life follow-up lost its exact resident factual outcome" };
    }

    const decision = input.proposal.commitmentDecision;
    if (decision.kind !== "accept"
      || decision.intent.kind !== "travel"
      || decision.intent.targetRegionId === null) {
      return { status: "rejected", detail: "expected accepted known-region travel follow-up" };
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
      return { status: "rejected", detail: "follow-up target lacks current resident-known route/destination" };
    }

    const identity = this.identityFor(outcomeEvidence.id);
    if (this.options.kernel.matter(identity.matterId)) {
      return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
    }

    const intent = Object.freeze({
      sourceMatterId: input.sourceMatterId,
      originOutcomeEvidenceId: outcomeEvidence.id,
      destination: Object.freeze({ ...destination }),
      routeRegionIds: Object.freeze([...route.regionIds]),
      semanticCourse: `${decision.reason} · ${decision.intent.goal}`,
      semanticIntent: Object.freeze({
        kind: "travel_region" as const,
        goal: decision.intent.goal,
        targetRegionId,
      }),
    }) satisfies GroundedResidentCausalOutcomeTravelCommitmentIntent;

    this.grounded.set(intent, {
      attempt: input.attempt,
      sourceMatterId: input.sourceMatterId,
      outcomeEvidenceId: outcomeEvidence.id,
      proposal: input.proposal,
      identity,
    });
    return { status: "accepted", intent };
  }

  materializeLifeOutcomeCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    sourceMatterId: string;
    proposal: ResidentLifeIntentProposal;
    intent: GroundedResidentCausalOutcomeTravelCommitmentIntent;
    tick: number;
  }): AcceptedResidentCausalOutcomeTravelCommitment {
    if (!Number.isSafeInteger(input.tick) || input.tick < 0) {
      throw new Error("causal outcome materialization tick must be a non-negative safe integer");
    }

    const outcomeEvidence = this.exactLifeOutcomeEvidence(
      input.attempt.context,
      input.sourceMatterId,
    );
    const identity = outcomeEvidence ? this.identityFor(outcomeEvidence.id) : null;
    const authority = this.grounded.get(input.intent);
    if (!outcomeEvidence
      || !identity
      || !authority
      || authority.attempt !== input.attempt
      || authority.sourceMatterId !== input.sourceMatterId
      || authority.outcomeEvidenceId !== outcomeEvidence.id
      || authority.proposal !== input.proposal
      || !sameIdentity(authority.identity, identity)
      || input.intent.sourceMatterId !== input.sourceMatterId
      || input.intent.originOutcomeEvidenceId !== outcomeEvidence.id) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal outcome travel intent lacks exact admitted factual authority");
    }
    if (this.options.kernel.matter(identity.matterId)) {
      this.grounded.delete(input.intent);
      throw new Error(`commitment already accepted: ${identity.matterId}`);
    }

    const origin = this.options.kernel.recordEvidence({
      id: `evidence:${this.identityNamespace}:accepted-${identity.evidenceKey}:${input.tick}`,
      tick: input.tick,
      kind: "accepted_cognition_commitment",
      summary: `${input.intent.semanticCourse}; source outcome ${outcomeEvidence.id}: ${outcomeEvidence.summary}`,
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
      throw new Error(`accepted causal outcome run was not authorized: ${focusClaim.reason}`);
    }

    this.matterScope.track(matter.id);
    this.grounded.delete(input.intent);
    return {
      sourceMatterId: input.sourceMatterId,
      originOutcomeEvidence: structuredClone(outcomeEvidence),
      matter: structuredClone(matter),
      runId: identity.runId,
      routeRegionIds: [...input.intent.routeRegionIds],
      focusClaim: structuredClone(focusClaim),
    };
  }

  private exactLifeOutcomeEvidence(
    context: ResidentLifeCognitionContext,
    sourceMatterId: string,
  ): ResidentKernelEvidence | null {
    const projectedMatter = context.life.matters.find((matter) => matter.id === sourceMatterId);
    const projectedOutcome = projectedMatter?.lastOutcomeEvidence ?? null;
    const kernelMatter = this.options.kernel.matter(sourceMatterId);
    if (!projectedMatter
      || projectedMatter.status !== "resolved"
      || !projectedOutcome
      || !kernelMatter
      || kernelMatter.status !== "resolved"
      || kernelMatter.lastOutcomeEvidenceId !== projectedOutcome.id) {
      return null;
    }

    const recentOutcome = this.options.kernel.recentEvidenceSnapshot().find(
      (evidence) => evidence.id === projectedOutcome.id,
    );
    if (!recentOutcome
      || recentOutcome.tick !== projectedOutcome.tick
      || recentOutcome.kind !== "task_outcome"
      || recentOutcome.kind !== projectedOutcome.kind
      || recentOutcome.summary !== projectedOutcome.summary) {
      return null;
    }
    return recentOutcome;
  }

  private identityFor(outcomeEvidenceId: string): CausalIdentity {
    return {
      matterId: `matter.${this.identityNamespace}.causal.outcome:${outcomeEvidenceId}`,
      taskId: `task.${this.identityNamespace}.causal.outcome:${outcomeEvidenceId}.semantic-1`,
      runId: `run.${this.identityNamespace}.causal.outcome:${outcomeEvidenceId}.semantic-1`,
      evidenceKey: `outcome:${outcomeEvidenceId}`,
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
    throw new Error("resident causal outcome identity namespace must be a simple non-empty token");
  }
  return normalized;
}

function sameIdentity(left: CausalIdentity, right: CausalIdentity): boolean {
  return left.matterId === right.matterId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.evidenceKey === right.evidenceKey;
}
