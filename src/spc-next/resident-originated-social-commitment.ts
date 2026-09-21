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
 * This class deliberately does NOT infer promises from text and does NOT decide that
 * a resident should commit. A caller must already own the semantic decision.
 *
 * Its authority is narrower:
 * - verify the exact speech occurrence exists in World history;
 * - verify this resident factually spoke it;
 * - verify the named counterparty was explicitly addressed;
 * - only then turn an admitted structured commitment into resident continuity.
 *
 * The resulting matter has no run and therefore no body authority.
 */
export class ResidentOriginatedSocialCommitmentAuthority {
  private readonly matterScope: ResidentLifeMatterScope;
  private readonly identityNamespace: string;

  constructor(private readonly options: ResidentOriginatedSocialCommitmentOptions) {
    if (!options.residentId.trim()) throw new Error("residentId must be non-empty");
    this.matterScope = options.matterScope ?? new ResidentLifeMatterScope(options.kernel);
    this.identityNamespace = normalizeIdentityNamespace(
      options.identityNamespace ?? defaultIdentityNamespace(options.residentId),
    );
  }

  materializeAfterFactualSpeech(input: {
    occurrenceId: string;
    expectedSpeechText: string;
    counterpartyActorId: string;
    goal: string;
    commitment: string;
  }): MaterializedResidentOriginatedSocialCommitment {
    assertNonEmpty(input.occurrenceId, "social commitment occurrence id");
    assertNonEmpty(input.expectedSpeechText, "social commitment speech text");
    assertNonEmpty(input.counterpartyActorId, "social commitment counterparty actor id");
    assertNonEmpty(input.goal, "social commitment goal");
    assertNonEmpty(input.commitment, "social commitment meaning");

    const occurrence = this.options.world.diagnostics().recentOccurrences.find(
      (candidate) => candidate.id === input.occurrenceId,
    ) ?? null;
    if (!occurrence
      || occurrence.kind !== "speech"
      || occurrence.actorId !== this.options.residentId
      || occurrence.text !== input.expectedSpeechText
      || !occurrence.addressedActorIds.includes(input.counterpartyActorId)) {
      throw new Error("standing social commitment lacks exact factual resident speech origin");
    }

    const matterId = deriveSpcIdentifier(
      "matter-social-commitment",
      `${this.identityNamespace}:${occurrence.id}:${input.counterpartyActorId}`,
    );
    if (this.options.kernel.matter(matterId)) {
      throw new Error(`standing social commitment already exists: ${matterId}`);
    }

    const originEvidence = this.options.kernel.recordEvidence({
      id: deriveSpcIdentifier(
        "evidence-social-commitment",
        `${this.identityNamespace}:${occurrence.id}:${input.counterpartyActorId}`,
      ),
      tick: occurrence.tick,
      kind: "resident_originated_social_commitment",
      summary:
        `${this.options.residentId} factually addressed ${input.counterpartyActorId} through ${occurrence.id} and created standing commitment: ${input.commitment}`,
    });

    const matter = this.options.kernel.openMatter({
      id: matterId,
      originEvidenceId: originEvidence.id,
      semanticCourse: `${input.goal} · ${input.commitment}`,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: input.goal,
        counterpartyActorId: input.counterpartyActorId,
        commitment: input.commitment,
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
