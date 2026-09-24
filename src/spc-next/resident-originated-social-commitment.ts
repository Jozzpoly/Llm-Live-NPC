import { deriveSpcIdentifier } from "./identity-contract";
import type { ResidentKernelEvidence, ResidentMatter } from "./resident-continuity-kernel";
import type { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";
import type { SpcWorldRuntime } from "./spc-world-runtime";

export interface ResidentOriginatedSocialCommitmentOptions {
  residentId: string;
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  matterScope?: ResidentLifeMatterScope;
  identityNamespace?: string;
}

export interface PreparedResidentOriginatedSocialCommitment {
  readonly residentId: string;
  readonly sourceMatterId: string;
  readonly sourceRunId: string;
  readonly sourceSemanticRevision: number;
  readonly counterpartyActorId: string;
  readonly expectedSpeechText: string;
  readonly goal: string;
  readonly commitment: string;
}

interface PreparedAuthority {
  sourceMatterId: string;
  sourceRunId: string;
  sourceSemanticRevision: number;
}

export interface MaterializedResidentOriginatedSocialCommitment {
  matter: ResidentMatter;
  originEvidence: ResidentKernelEvidence;
  occurrenceId: string;
}

export interface ReleasedResidentOriginatedSocialCommitment {
  matter: ResidentMatter;
  releaseEvidence: ResidentKernelEvidence;
}

/**
 * Resident-generic authority for a standing social commitment created by the
 * resident's own factual speech act.
 *
 * It deliberately does NOT infer promises from text.
 *
 * The authority is two-phase:
 *
 * 1. prepareFromCommunicateMatter() can issue an opaque semantic capability only
 *    while one exact already-grounded communicate_actor matter/run is live;
 * 2. materializeAfterFactualSpeech() consumes that exact capability only after the
 *    matching resident speech actually exists in World and the source run has
 *    factually completed through the continuity kernel.
 *
 * A real speech string by itself therefore cannot be retrospectively decorated with
 * arbitrary standing personhood state, and a semantic decision by itself cannot create
 * history before the resident actually says it.
 *
 * The resulting standing matter owns no run and therefore no body authority.
 */
export class ResidentOriginatedSocialCommitmentAuthority {
  private readonly matterScope: ResidentLifeMatterScope;
  private readonly identityNamespace: string;
  private readonly prepared = new WeakMap<
    PreparedResidentOriginatedSocialCommitment,
    PreparedAuthority
  >();

  constructor(private readonly options: ResidentOriginatedSocialCommitmentOptions) {
    if (!options.residentId.trim()) throw new Error("residentId must be non-empty");
    this.matterScope = options.matterScope ?? new ResidentLifeMatterScope(options.kernel);
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
  }

  prepareFromCommunicateMatter(input: {
    sourceMatterId: string;
    counterpartyActorId: string;
    expectedSpeechText: string;
    goal: string;
    commitment: string;
  }): PreparedResidentOriginatedSocialCommitment {
    assertNonEmpty(input.sourceMatterId, "social commitment source matter id");
    assertNonEmpty(input.counterpartyActorId, "social commitment counterparty actor id");
    assertNonEmpty(input.expectedSpeechText, "social commitment speech text");
    assertNonEmpty(input.goal, "social commitment goal");
    assertNonEmpty(input.commitment, "social commitment meaning");

    const source = this.options.kernel.matter(input.sourceMatterId);
    if (!source
      || source.status !== "active"
      || source.activeRunId === null
      || source.semanticIntent?.kind !== "communicate_actor"
      || source.semanticIntent.targetActorId !== input.counterpartyActorId
      || source.semanticIntent.text !== input.expectedSpeechText) {
      throw new Error(
        "standing social commitment preparation requires one exact active communicate matter/run",
      );
    }

    const capability = Object.freeze({
      residentId: this.options.residentId,
      sourceMatterId: source.id,
      sourceRunId: source.activeRunId,
      sourceSemanticRevision: source.semanticRevision,
      counterpartyActorId: input.counterpartyActorId,
      expectedSpeechText: input.expectedSpeechText,
      goal: input.goal,
      commitment: input.commitment,
    }) satisfies PreparedResidentOriginatedSocialCommitment;

    this.prepared.set(capability, {
      sourceMatterId: source.id,
      sourceRunId: source.activeRunId,
      sourceSemanticRevision: source.semanticRevision,
    });
    return capability;
  }

  /**
   * Normal resident-life path: consume only continuation semantics that were already
   * resident-owned inside the live communicate matter before factual speech.
   * No caller may supply new promise meaning at execution time.
   */
  prepareDeclaredFromCommunicateMatter(input: {
    sourceMatterId: string;
  }): PreparedResidentOriginatedSocialCommitment {
    const source = this.options.kernel.matter(input.sourceMatterId);
    if (source?.semanticIntent?.kind !== "communicate_actor"
      || source.semanticIntent.standingSocialCommitment === undefined) {
      throw new Error(
        "standing social commitment source communicate matter has no declared continuation",
      );
    }
    return this.prepareFromCommunicateMatter({
      sourceMatterId: source.id,
      counterpartyActorId: source.semanticIntent.targetActorId,
      expectedSpeechText: source.semanticIntent.text,
      goal: source.semanticIntent.standingSocialCommitment.goal,
      commitment: source.semanticIntent.text,
    });
  }

  materializeAfterFactualSpeech(
    capability: PreparedResidentOriginatedSocialCommitment,
    occurrenceId: string,
  ): MaterializedResidentOriginatedSocialCommitment {
    assertNonEmpty(occurrenceId, "social commitment occurrence id");
    const authority = this.prepared.get(capability);
    if (!authority
      || capability.residentId !== this.options.residentId
      || capability.sourceMatterId !== authority.sourceMatterId
      || capability.sourceRunId !== authority.sourceRunId
      || capability.sourceSemanticRevision !== authority.sourceSemanticRevision) {
      throw new Error("standing social commitment lacks exact prepared semantic authority");
    }

    // One capability is single-use even when later factual validation fails. A caller
    // must prepare a new causal attempt rather than replaying an old semantic token.
    this.prepared.delete(capability);

    const source = this.options.kernel.matter(authority.sourceMatterId);
    const outcome = source?.lastOutcomeEvidenceId
      ? (
          this.options.kernel.lastOutcomeEvidence(source.id)
          ?? this.options.kernel.recentEvidenceSnapshot().find(
            (evidence) => evidence.id === source.lastOutcomeEvidenceId,
          )
          ?? null
        )
      : null;
    if (!source
      || source.status !== "resolved"
      || source.semanticRevision !== authority.sourceSemanticRevision
      || source.activeRunId !== null
      || source.semanticIntent?.kind !== "communicate_actor"
      || source.semanticIntent.targetActorId !== capability.counterpartyActorId
      || source.semanticIntent.text !== capability.expectedSpeechText
      || source.lastOutcomeSemanticRevision !== authority.sourceSemanticRevision
      || !outcome
      || outcome.sourceRunId !== authority.sourceRunId
      || !outcome.summary.includes("factually delivered speech")) {
      throw new Error("standing social commitment source communication did not factually complete");
    }

    const occurrence = this.options.world.diagnostics().recentOccurrences.find(
      (candidate) => candidate.id === occurrenceId,
    ) ?? null;
    if (!occurrence
      || occurrence.kind !== "speech"
      || occurrence.actorId !== this.options.residentId
      || occurrence.text !== capability.expectedSpeechText
      || !occurrence.addressedActorIds.includes(capability.counterpartyActorId)
      || !outcome.summary.includes(occurrence.id)) {
      throw new Error("standing social commitment lacks exact factual resident speech origin");
    }

    const matterId = deriveSpcIdentifier(
      "matter-social-commitment",
      `${this.identityNamespace}:${occurrence.id}:${capability.counterpartyActorId}`,
    );
    if (this.options.kernel.matter(matterId)) {
      throw new Error(`standing social commitment already exists: ${matterId}`);
    }

    const originEvidence = this.options.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-social-commitment",
        `${this.identityNamespace}:${occurrence.id}:${capability.counterpartyActorId}`,
      ),
      tick: occurrence.tick,
      kind: "resident_originated_social_commitment",
      summary:
        `${this.options.residentId} factually addressed ${capability.counterpartyActorId} through ${occurrence.id} and created standing commitment: ${capability.commitment}`,
      sourceRunId: authority.sourceRunId,
    });

    const matter = this.options.kernel.openMatter({
      id: matterId,
      originEvidenceId: originEvidence.id,
      semanticCourse: `${capability.goal} · ${capability.commitment}`,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: capability.goal,
        counterpartyActorId: capability.counterpartyActorId,
        commitment: capability.commitment,
      },
    });
    this.matterScope.track(matter.id);

    return {
      matter: structuredClone(matter),
      originEvidence: structuredClone(originEvidence),
      occurrenceId: occurrence.id,
    };
  }

  /**
   * Releases one exact standing commitment only after factual addressed speech from
   * that commitment's own counterparty. Language interpretation remains higher-level
   * cognition; this authority proves only the private matter and World-origin match.
   */
  releaseAfterCounterpartySpeech(input: {
    matterId: string;
    occurrenceId: string;
    tick: number;
    reason: string;
  }): ReleasedResidentOriginatedSocialCommitment {
    assertNonEmpty(input.occurrenceId, "social commitment release occurrence id");
    const matter = this.options.kernel.matter(input.matterId);
    if (!matter
      || (matter.status !== "active" && matter.status !== "suspended")
      || matter.semanticIntent?.kind !== "standing_social_commitment") {
      throw new Error("counterparty release requires one open standing social commitment");
    }

    const occurrence = this.options.world.diagnostics().recentOccurrences.find(
      (candidate) => candidate.id === input.occurrenceId,
    ) ?? null;
    if (!occurrence
      || occurrence.kind !== "speech"
      || occurrence.actorId !== matter.semanticIntent.counterpartyActorId
      || !occurrence.addressedActorIds.includes(this.options.residentId)) {
      throw new Error(
        "standing social commitment release lacks exact factual counterparty speech origin",
      );
    }

    return this.release({
      matterId: matter.id,
      tick: input.tick,
      reason: `${input.reason} · factual counterparty speech ${occurrence.id}`,
    });
  }

  /**
   * Explicitly releases the resident's own standing commitment.
   *
   * This is a private resident-state transition, not proof that the counterparty
   * considers the commitment fulfilled or that any World condition became true.
   */
  release(input: {
    matterId: string;
    tick: number;
    reason: string;
  }): ReleasedResidentOriginatedSocialCommitment {
    assertNonEmpty(input.matterId, "social commitment matter id");
    assertNonEmpty(input.reason, "social commitment release reason");
    if (!Number.isSafeInteger(input.tick) || input.tick < 0) {
      throw new Error("social commitment release tick must be a non-negative safe integer");
    }

    const matter = this.options.kernel.matter(input.matterId);
    if (!matter
      || (matter.status !== "active" && matter.status !== "suspended")
      || matter.semanticIntent?.kind !== "standing_social_commitment") {
      throw new Error("standing social commitment release requires one open standing commitment");
    }

    const releaseEvidence = this.options.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-social-commitment-release",
        `${this.identityNamespace}:${matter.id}:${input.tick}`,
      ),
      tick: input.tick,
      kind: "resident_released_social_commitment",
      summary: input.reason,
    });
    this.options.kernel.advanceSemanticContext(matter.id, releaseEvidence.id);
    const resolved = this.options.kernel.resolveMatter(matter.id);

    return {
      matter: structuredClone(resolved),
      releaseEvidence: structuredClone(releaseEvidence),
    };
  }
}

function defaultIdentityNamespace(residentId: string): string {
  const pieces = residentId.split(".").filter(Boolean);
  return pieces.at(-1) ?? residentId;
}

function normalizeIdentityNamespace(value: string): string {
  const normalized = value.trim();
  if (!normalized || !/^[A-Za-z0-9_-]+$/.test(normalized)) {
    throw new Error("social commitment identity namespace must be a simple non-empty token");
  }
  return normalized;
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}
