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
    materialKnowledge: readonly ResidentKnownMaterialObject[];
  };
  continuity: {
    matter: ResidentMatter | null;
    originEvidence: ResidentKernelEvidence | null;
    semanticEvidence: ResidentKernelEvidence | null;
    lastOutcomeEvidence: ResidentKernelEvidence | null;
    activeRunBinding: ResidentTaskRunBinding | null;
    activeRunCanMutateWorld: boolean;
    pendingSemanticProposals: readonly ResidentSemanticProposalTicket[];
    recentSemanticProposalRevocations: readonly ResidentSemanticProposalRevocation[];
  };
}

export interface SpcCanonicalEvidenceSnapshotInput {
  scenarioId: string;
  residentId: string;
  matterId: string;
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  materialKnowledge: ResidentMaterialKnowledge;
}

/**
 * Minimal E2 research projection for baseline delivery + missing-crate evidence.
 *
 * This is deliberately not a savegame, participant DTO or complete final game
 * state. It composes existing authoritative/private owners without creating a
 * second mutable truth. Every field is a defensive snapshot from an existing
 * authority surface.
 */
export function captureSpcCanonicalEvidenceSnapshot(
  input: SpcCanonicalEvidenceSnapshotInput,
): SpcCanonicalEvidenceSnapshotV1 {
  assertId(input.scenarioId, "scenarioId");
  assertId(input.residentId, "residentId");
  assertId(input.matterId, "matterId");
  if (input.materialKnowledge.residentId !== input.residentId) {
    throw new Error("materialKnowledge resident does not match evidence residentId");
  }

  const publicWorld = input.world.publicSnapshot();
  const worldDiagnostics = input.world.diagnostics();
  const matter = input.kernel.matter(input.matterId);
  const activeRunId = matter?.activeRunId ?? null;
  const activeRunBinding = activeRunId ? input.kernel.runBinding(activeRunId) : null;

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
      materialKnowledge: input.materialKnowledge.snapshot(),
    },
    continuity: {
      matter,
      originEvidence: input.kernel.originEvidence(input.matterId),
      semanticEvidence: input.kernel.semanticEvidence(input.matterId),
      lastOutcomeEvidence: input.kernel.lastOutcomeEvidence(input.matterId),
      activeRunBinding,
      activeRunCanMutateWorld: activeRunId !== null && input.kernel.canRunMutateWorld(activeRunId),
      pendingSemanticProposals: input.kernel.pendingSemanticProposals()
        .filter((ticket) => ticket.matterId === input.matterId),
      recentSemanticProposalRevocations: input.kernel.recentSemanticProposalRevocations()
        .filter((entry) => entry.ticket.matterId === input.matterId),
    },
  };
}

function assertId(value: string, label: string): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be non-empty`);
  }
}
