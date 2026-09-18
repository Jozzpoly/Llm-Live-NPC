import type {
  ActorState,
  ResidentDiagnostics,
  WorldOccurrence,
} from "../spc-next/contracts";
import type { MaterialActionResult, MaterialObjectState } from "../spc-next/material-world-state";
import type {
  ResidentContinuityKernel,
  ResidentKernelEvidence,
  ResidentMatter,
  ResidentSemanticProposalRevocation,
  ResidentSemanticProposalTicket,
  ResidentTaskRunBinding,
} from "../spc-next/resident-continuity-kernel";
import type {
  ResidentKnownMaterialObject,
  ResidentMaterialKnowledge,
} from "../spc-next/resident-material-knowledge";
import type { ResidentWorldActionFact } from "../spc-next/resident-world-execution-authority";
import type { SpcWorldRuntime } from "../spc-next/spc-world-runtime";

export interface SpcCanonicalEvidenceSnapshotV1 {
  schemaVersion: 1;
  scenarioId: string;
  tick: number;
  authoritativeWorld: {
    actors: readonly ActorState[];
    materialObjects: readonly MaterialObjectState[];
    recentMaterialActions: readonly MaterialActionResult[];
    recentOccurrences: readonly WorldOccurrence[];
  };
  residentPrivate: {
    residentId: string;
    diagnostics: ResidentDiagnostics;
    /** Empty when the scenario does not install a resident material-knowledge extension. */
    materialKnowledge: readonly ResidentKnownMaterialObject[];
  };
  continuity: {
    matter: ResidentMatter | null;
    originEvidence: ResidentKernelEvidence | null;
    semanticEvidence: ResidentKernelEvidence | null;
    /** Live pinned outcome evidence; intentionally null after terminal matter cleanup. */
    lastOutcomeEvidence: ResidentKernelEvidence | null;
    /**
     * Audit-only historical recovery of matter.lastOutcomeEvidenceId from the bounded
     * recent-evidence journal. This is not a live authority pin and may age out later.
     */
    historicalOutcomeEvidence: ResidentKernelEvidence | null;
    activeRunBinding: ResidentTaskRunBinding | null;
    activeRunCanMutateWorld: boolean;
    pendingSemanticProposals: readonly ResidentSemanticProposalTicket[];
    recentSemanticProposalRevocations: readonly ResidentSemanticProposalRevocation[];
  };
  causalProvenance: {
    residentWorldActionFacts: readonly ResidentWorldActionFact[];
  };
}

/**
 * Read-only provenance surface used by canonical observation.
 *
 * ResidentWorldExecutionAuthority structurally satisfies this interface, but the
 * evidence layer no longer requires the mutable execution facade itself. Scenarios
 * with no run-scoped material/action facts can omit the source instead of creating a
 * second authority merely so research can take a snapshot.
 */
export interface ResidentWorldActionFactSource {
  readonly residentId: string;
  recentActionFacts(): ResidentWorldActionFact[];
}

export interface SpcCanonicalEvidenceSnapshotInput {
  scenarioId: string;
  residentId: string;
  matterId: string;
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  /** Optional resident-specific material extension; generic social/travel slices need none. */
  materialKnowledge?: ResidentMaterialKnowledge | null;
  /** Optional read-only action provenance. Observation must never create execution authority. */
  authority?: ResidentWorldActionFactSource | null;
}

/**
 * Minimal E2 evidence projection for SPC Next vertical slices.
 *
 * This is deliberately not a savegame, participant DTO or complete final game
 * state. It composes existing authoritative/private owners without creating a
 * second mutable truth. Material knowledge and run-scoped action facts are optional
 * resident-specific extensions; generic World, private diagnostics and continuity
 * remain valid for non-material or travel-only residents.
 */
export function captureSpcCanonicalEvidenceSnapshot(
  input: SpcCanonicalEvidenceSnapshotInput,
): SpcCanonicalEvidenceSnapshotV1 {
  assertId(input.scenarioId, "scenarioId");
  assertId(input.residentId, "residentId");
  assertId(input.matterId, "matterId");
  if (input.materialKnowledge && input.materialKnowledge.residentId !== input.residentId) {
    throw new Error("materialKnowledge resident does not match evidence residentId");
  }
  if (input.authority && input.authority.residentId !== input.residentId) {
    throw new Error("action provenance resident does not match evidence residentId");
  }

  const publicWorld = input.world.publicSnapshot();
  const worldDiagnostics = input.world.diagnostics();
  const matter = input.kernel.matter(input.matterId);
  const activeRunId = matter?.activeRunId ?? null;
  const activeRunBinding = activeRunId ? input.kernel.runBinding(activeRunId) : null;
  const lastOutcomeEvidence = input.kernel.lastOutcomeEvidence(input.matterId);
  const historicalOutcomeEvidence = findHistoricalOutcomeEvidence(input.kernel, matter, lastOutcomeEvidence);

  return {
    schemaVersion: 1,
    scenarioId: input.scenarioId,
    tick: input.world.tick,
    authoritativeWorld: {
      actors: structuredClone(publicWorld.actors),
      materialObjects: input.world.materialObjects(),
      recentMaterialActions: structuredClone(worldDiagnostics.recentMaterialActions),
      recentOccurrences: structuredClone(worldDiagnostics.recentOccurrences),
    },
    residentPrivate: {
      residentId: input.residentId,
      diagnostics: input.world.residentDiagnostics(input.residentId),
      materialKnowledge: input.materialKnowledge?.snapshot() ?? [],
    },
    continuity: {
      matter,
      originEvidence: input.kernel.originEvidence(input.matterId),
      semanticEvidence: input.kernel.semanticEvidence(input.matterId),
      lastOutcomeEvidence,
      historicalOutcomeEvidence,
      activeRunBinding,
      activeRunCanMutateWorld: activeRunId !== null && input.kernel.canRunMutateWorld(activeRunId),
      pendingSemanticProposals: input.kernel.pendingSemanticProposals()
        .filter((ticket) => ticket.matterId === input.matterId),
      recentSemanticProposalRevocations: input.kernel.recentSemanticProposalRevocations()
        .filter((entry) => entry.ticket.matterId === input.matterId),
    },
    causalProvenance: {
      residentWorldActionFacts: input.authority?.recentActionFacts() ?? [],
    },
  };
}

function findHistoricalOutcomeEvidence(
  kernel: ResidentContinuityKernel,
  matter: ResidentMatter | null,
  liveOutcome: ResidentKernelEvidence | null,
): ResidentKernelEvidence | null {
  const evidenceId = matter?.lastOutcomeEvidenceId ?? null;
  if (!evidenceId) return null;
  if (liveOutcome?.id === evidenceId) return structuredClone(liveOutcome);
  const historical = kernel.recentEvidenceSnapshot().find((evidence) => evidence.id === evidenceId) ?? null;
  return historical ? structuredClone(historical) : null;
}

function assertId(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}
