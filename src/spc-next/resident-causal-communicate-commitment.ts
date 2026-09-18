import type { ResidentCognitionContext } from "./cognition-contract";
import type { WorldOccurrence } from "./contracts";
import type {
  ResidentCommunicateActorMatterIntent,
  ResidentContinuityKernel,
  ResidentMatter,
} from "./resident-continuity-kernel";
import type {
  ResidentExecutionArbitrator,
  ResidentExecutionArbitrationRequest,
} from "./resident-execution-arbitrator";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import type {
  ResidentLifeIntentAdmission,
  ResidentLifeIntentAttempt,
} from "./resident-life-intent-owner";
import type { ResidentRuntime } from "./resident-runtime";
import type { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface GroundedResidentCausalCommunicateCommitmentIntent {
  originPerceptId: string;
  semanticCourse: string;
  semanticIntent: ResidentCommunicateActorMatterIntent;
}

export interface AcceptedResidentCausalCommunicateCommitment {
  matter: ResidentMatter;
  runId: string;
  originPerceptId: string;
  focusClaim: ResidentExecutionArbitrationRequest;
}

export interface ResidentCausalCommunicateCommitmentAuthorityOptions {
  residentId: string;
  resident: ResidentRuntime;
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  arbitrator: ResidentExecutionArbitrator;
  authority: ResidentWorldExecutionAuthority;
  matterScope?: ResidentLifeMatterScope;
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
 * Resident-generic authority seam for cognition-native social responsibility.
 * It converts an exact private speech origin plus admitted communicate semantics
 * into durable continuity and one exact run. Contact position, visibility,
 * approach method and executor phase stay outside durable meaning.
 */
export class ResidentCausalCommunicateCommitmentAuthority {
  private readonly grounded = new WeakMap<
    GroundedResidentCausalCommunicateCommitmentIntent,
    GroundedCapabilityAuthority
  >();
  private readonly identityNamespace: string;
  private readonly matterScope: ResidentLifeMatterScope;

  constructor(private readonly options: ResidentCausalCommunicateCommitmentAuthorityOptions) {
    if (options.residentId.trim().length === 0) throw new Error("residentId must be non-empty");
    if (options.resident.profile.id !== options.residentId) {
      throw new Error("resident causal communicate authority runtime belongs to another resident");
    }
    if (options.authority.residentId !== options.residentId) {
      throw new Error("resident causal communicate World facade belongs to another resident");
    }
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
    this.matterScope = options.matterScope ?? new ResidentLifeMatterScope(options.kernel);
  }

  acceptedMatterIds(): string[] {
    return this.matterScope.matterIds();
  }

  groundPrivateSpeechCommitment(input: {
    attempt: ResidentLifeIntentAttempt;
    occurrence: WorldOccurrence;
    proposal: ResidentLifeIntentProposal;
    providerContext: ResidentLifeCognitionContext;
    groundingContext: ResidentCognitionContext;
  }): ResidentLifeIntentAdmission<GroundedResidentCausalCommunicateCommitmentIntent> {
    if (input.attempt.residentId !== this.options.residentId
      || input.providerContext.resident.id !== this.options.residentId
      || input.groundingContext.resident.id !== this.options.residentId) {
      return { status: "rejected", detail: "causal communicate commitment resident mismatch" };
    }

    const originPercept = input.attempt.context.recentPercepts.find(
      (percept) => percept.occurrenceId === input.occurrence.id,
    );
    if (!originPercept
      || originPercept.phenomenon !== "speech"
      || originPercept.text !== input.occurrence.text) {
      return { status: "rejected", detail: "communicate commitment lost its exact private speech percept" };
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
      || decision.intent.kind !== "communicate"
      || decision.intent.targetActorId === null
      || decision.intent.text === null) {
      return { status: "rejected", detail: "expected accepted known-actor communicate commitment" };
    }

    const targetActorId = decision.intent.targetActorId;
    if (!input.groundingContext.knownActors.some((actor) => actor.id === targetActorId)) {
      return { status: "rejected", detail: "communicate target is not resident-known at admission" };
    }

    const identity = this.identityFor(input.occurrence);
    if (this.options.kernel.matter(identity.matterId)) {
      return { status: "rejected", detail: `commitment already accepted: ${identity.matterId}` };
    }

    const intent = Object.freeze({
      originPerceptId: originPercept.id,
      semanticCourse: `${decision.reason} · ${decision.intent.goal}`,
      semanticIntent: Object.freeze({
        kind: "communicate_actor" as const,
        goal: decision.intent.goal,
        targetActorId,
        text: decision.intent.text,
      }),
    }) satisfies GroundedResidentCausalCommunicateCommitmentIntent;

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
    intent: GroundedResidentCausalCommunicateCommitmentIntent;
  }): AcceptedResidentCausalCommunicateCommitment {
    const authority = this.grounded.get(input.intent);
    const identity = this.identityFor(input.occurrence);
    if (!authority
      || authority.attempt !== input.attempt
      || authority.occurrenceId !== input.occurrence.id
      || authority.proposal !== input.proposal
      || !sameIdentity(authority.identity, identity)) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal communicate intent lacks exact admitted authority");
    }

    const originPercept = input.attempt.context.recentPercepts.find(
      (percept) => percept.id === input.intent.originPerceptId
        && percept.occurrenceId === input.occurrence.id
        && percept.phenomenon === "speech"
        && percept.text === input.occurrence.text,
    );
    if (!originPercept) {
      this.grounded.delete(input.intent);
      throw new Error("grounded causal communicate intent lost its exact private speech origin");
    }
    if (this.options.kernel.matter(identity.matterId)) {
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
      throw new Error(`accepted causal communicate run was not authorized: ${focusClaim.reason}`);
    }

    this.matterScope.track(matter.id);
    this.grounded.delete(input.intent);
    return {
      matter: structuredClone(matter),
      runId: identity.runId,
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
    throw new Error("resident causal communicate identity namespace must be a simple non-empty token");
  }
  return normalized;
}

function sameIdentity(left: CausalIdentity, right: CausalIdentity): boolean {
  return left.matterId === right.matterId
    && left.taskId === right.taskId
    && left.runId === right.runId
    && left.evidenceKey === right.evidenceKey;
}
