import type { EntityId } from "../world/types";
import { World } from "../world/world";
import {
  P2E0ResidentCausalKernel,
  type P2E0EvidenceRecord
} from "./p2-e0-resident-causal-kernel";
import {
  P2E1GroundedCommunicationSeam,
  type P2E1CommunicationFrame,
  type P2E1ReceptionPolicy,
  type P2E1SpeechInput
} from "./p2-e1-grounded-communication-seam";

export interface P2E2ResidentEvidenceDelivery {
  observerId: EntityId;
  evidence: P2E0EvidenceRecord;
}

export interface P2E2CommunicationResult {
  frame: P2E1CommunicationFrame;
  residentEvidence: P2E2ResidentEvidenceDelivery[];
}

/**
 * P2-E2 research apparatus only.
 *
 * This boundary owns one communication-occurrence sequencer next to the live
 * World instance. It deliberately does not make speech part of WorldSnapshot,
 * World.recentEvents(), the E1 request shape, UI state or a semantic-provider
 * request. P2-E2 asks whether a committed canonical occurrence can cross from
 * shared runtime authority into receiver-specific resident continuity without
 * collapsing those responsibilities.
 */
export class P2E2CommunicationRuntimeBoundary {
  private readonly seam = new P2E1GroundedCommunicationSeam();

  constructor(
    private readonly world: World,
    private readonly residents: ReadonlyMap<EntityId, P2E0ResidentCausalKernel>
  ) {}

  speak(input: P2E1SpeechInput, canReceive: P2E1ReceptionPolicy): P2E2CommunicationResult {
    // The seam completes receiver assessment against one occurrence-time World
    // snapshot before resident state is touched. No resident can therefore gain
    // a partial "heard" record from a communication frame that never committed.
    const frame = this.seam.speak(this.world.snapshot(), input, canReceive);
    const residentEvidence: P2E2ResidentEvidenceDelivery[] = [];

    for (const delivery of frame.deliveries) {
      const heard = delivery.experience;
      if (!heard) continue;

      const resident = this.residents.get(delivery.observerId);
      if (!resident) continue;

      const evidence = resident.recordEvidence({
        kind: "heard",
        source: {
          kind: "actor",
          actorId: heard.source.actorId,
          occurrenceId: heard.occurrenceId
        },
        summary: `${heard.source.actorId} said: ${heard.text}`
      });
      residentEvidence.push({ observerId: delivery.observerId, evidence });
    }

    return { frame, residentEvidence };
  }
}
