import type { ActorEntity, EntityId, Vec2, WorldEntity, WorldSnapshot } from "../world/types";

export interface P2E1SpeechInput {
  speakerId: EntityId;
  text: string;
}

export interface P2E1CommunicationOccurrence {
  id: string;
  tick: number;
  kind: "spoken";
  speakerId: EntityId;
  text: string;
  sourcePosition: Vec2;
}

export interface P2E1SpokeExperience {
  kind: "spoke";
  occurrenceId: string;
  tick: number;
  actorId: EntityId;
  text: string;
}

export interface P2E1HeardExperience {
  kind: "heard";
  occurrenceId: string;
  tick: number;
  observerId: EntityId;
  source: {
    kind: "actor";
    actorId: EntityId;
  };
  text: string;
}

export interface P2E1DeliveryRecord {
  observerId: EntityId;
  couldReceive: boolean;
  experience: P2E1HeardExperience | null;
}

export interface P2E1CommunicationFrame {
  occurrence: P2E1CommunicationOccurrence;
  speakerExperience: P2E1SpokeExperience;
  deliveries: P2E1DeliveryRecord[];
}

export interface P2E1ReceptionContext {
  snapshot: WorldSnapshot;
  occurrence: P2E1CommunicationOccurrence;
  speaker: ActorEntity;
  observer: ActorEntity;
}

export type P2E1ReceptionPolicy = (context: P2E1ReceptionContext) => boolean;

function isActor(entity: WorldEntity | undefined): entity is ActorEntity {
  return entity?.kind === "player" || entity?.kind === "npc";
}

function cloneOccurrence(occurrence: P2E1CommunicationOccurrence): P2E1CommunicationOccurrence {
  return {
    ...occurrence,
    sourcePosition: { ...occurrence.sourcePosition }
  };
}

function cloneActor(actor: ActorEntity): ActorEntity {
  return structuredClone(actor);
}

/**
 * P2-E1 research specimen only.
 *
 * This seam tests one epistemic boundary from the Presence Contract:
 * a communication occurrence may be canonical once, while grounded actor
 * experience remains receiver-specific. It deliberately does not select a
 * hearing range, LOS rule, channel topology, addressedness policy, UI or LLM.
 *
 * Reception is decided against the WorldSnapshot supplied for the occurrence.
 * The resulting frame is therefore an event-time causal record; later movement
 * cannot retroactively create or erase a receiver's experience of this speech.
 */
export class P2E1GroundedCommunicationSeam {
  private nextOccurrenceSeq = 1;
  private speechInProgress = false;

  speak(
    snapshot: WorldSnapshot,
    input: P2E1SpeechInput,
    canReceive: P2E1ReceptionPolicy
  ): P2E1CommunicationFrame {
    if (!Number.isInteger(snapshot.tick) || snapshot.tick < 0) {
      throw new Error(`P2-E1 speech requires a non-negative integer World tick: ${snapshot.tick}`);
    }

    const speaker = snapshot.entities.find((entity) => entity.id === input.speakerId);
    if (!isActor(speaker)) {
      throw new Error(`P2-E1 speech requires an actor speaker: ${input.speakerId}`);
    }
    if (this.speechInProgress) {
      throw new Error("P2-E1 communication seam does not allow reentrant speech.");
    }

    this.speechInProgress = true;
    try {
      const occurrence: P2E1CommunicationOccurrence = {
        id: `speech.${this.nextOccurrenceSeq}`,
        tick: snapshot.tick,
        kind: "spoken",
        speakerId: speaker.id,
        text: input.text,
        sourcePosition: { ...speaker.position }
      };

      const speakerExperience: P2E1SpokeExperience = {
        kind: "spoke",
        occurrenceId: occurrence.id,
        tick: occurrence.tick,
        actorId: speaker.id,
        text: occurrence.text
      };

      const deliveries = snapshot.entities
        .filter((entity): entity is ActorEntity => isActor(entity) && entity.id !== speaker.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((observer): P2E1DeliveryRecord => {
          const couldReceive = canReceive({
            snapshot: structuredClone(snapshot),
            occurrence: cloneOccurrence(occurrence),
            speaker: cloneActor(speaker),
            observer: cloneActor(observer)
          });
          if (typeof couldReceive !== "boolean") {
            throw new Error(`P2-E1 reception policy must return boolean for observer ${observer.id}.`);
          }

          return {
            observerId: observer.id,
            couldReceive,
            experience: couldReceive
              ? {
                  kind: "heard",
                  occurrenceId: occurrence.id,
                  tick: occurrence.tick,
                  observerId: observer.id,
                  source: { kind: "actor", actorId: speaker.id },
                  text: occurrence.text
                }
              : null
          };
        });

      this.nextOccurrenceSeq += 1;

      return {
        occurrence: cloneOccurrence(occurrence),
        speakerExperience: { ...speakerExperience },
        deliveries: deliveries.map((delivery) => ({
          ...delivery,
          experience: delivery.experience
            ? {
                ...delivery.experience,
                source: { ...delivery.experience.source }
              }
            : null
        }))
      };
    } finally {
      this.speechInProgress = false;
    }
  }
}
