import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { ActorEntity, WorldSnapshot } from "../world/types";
import {
  P2E1GroundedCommunicationSeam,
  type P2E1ReceptionPolicy
} from "./p2-e1-grounded-communication-seam";

function canonicalSnapshot(): WorldSnapshot {
  return new World(createP1Specimen()).snapshot();
}

function actor(snapshot: WorldSnapshot, id: string): ActorEntity {
  const entity = snapshot.entities.find((candidate) => candidate.id === id);
  if (!entity || (entity.kind !== "player" && entity.kind !== "npc")) {
    throw new Error(`P2-E1 fixture requires actor ${id}.`);
  }
  return entity;
}

const within = (range: number): P2E1ReceptionPolicy =>
  ({ speaker, observer }) =>
    Math.hypot(
      observer.position.x - speaker.position.x,
      observer.position.y - speaker.position.y
    ) <= range;

describe("P2-E1 grounded communication seam", () => {
  it("creates one canonical spoken occurrence and sourced receiver experience without mutating World state", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();
    const before = structuredClone(snapshot);

    const frame = seam.speak(
      snapshot,
      {
        speakerId: "player.jozz",
        text: "The red mug is in the workshop."
      },
      () => true
    );

    expect(snapshot).toEqual(before);
    expect(frame.occurrence).toEqual({
      id: "speech.1",
      tick: snapshot.tick,
      kind: "spoken",
      speakerId: "player.jozz",
      text: "The red mug is in the workshop.",
      sourcePosition: actor(snapshot, "player.jozz").position
    });
    expect(frame.speakerExperience).toEqual({
      kind: "spoke",
      occurrenceId: frame.occurrence.id,
      tick: snapshot.tick,
      actorId: "player.jozz",
      text: frame.occurrence.text
    });
    expect(frame.deliveries).toEqual([
      {
        observerId: "npc.001",
        couldReceive: true,
        experience: {
          kind: "heard",
          occurrenceId: frame.occurrence.id,
          tick: snapshot.tick,
          observerId: "npc.001",
          source: { kind: "actor", actorId: "player.jozz" },
          text: frame.occurrence.text
        }
      }
    ]);
  });

  it("keeps a canonical speech occurrence even when a receiver could not experience it", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();

    const frame = seam.speak(
      snapshot,
      { speakerId: "player.jozz", text: "Can you hear me?" },
      () => false
    );

    expect(frame.occurrence).toMatchObject({
      id: "speech.1",
      kind: "spoken",
      speakerId: "player.jozz",
      text: "Can you hear me?"
    });
    expect(frame.speakerExperience.occurrenceId).toBe(frame.occurrence.id);
    expect(frame.deliveries).toEqual([
      {
        observerId: "npc.001",
        couldReceive: false,
        experience: null
      }
    ]);
  });

  it("binds reception to event-time geometry instead of retroactively replaying speech after movement", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const emissionSnapshot = canonicalSnapshot();
    emissionSnapshot.tick = 40;
    actor(emissionSnapshot, "player.jozz").position = { x: 100, y: 100 };
    actor(emissionSnapshot, "npc.001").position = { x: 500, y: 100 };

    const first = seam.speak(
      emissionSnapshot,
      { speakerId: "player.jozz", text: "First utterance." },
      within(100)
    );
    expect(first.deliveries[0]).toMatchObject({ couldReceive: false, experience: null });

    const laterSnapshot = structuredClone(emissionSnapshot);
    laterSnapshot.tick = 41;
    actor(laterSnapshot, "npc.001").position = { x: 140, y: 100 };

    expect(first.deliveries[0]).toMatchObject({ couldReceive: false, experience: null });

    const second = seam.speak(
      laterSnapshot,
      { speakerId: "player.jozz", text: "Second utterance." },
      within(100)
    );
    expect(second.occurrence.id).toBe("speech.2");
    expect(second.deliveries[0]).toMatchObject({
      couldReceive: true,
      experience: {
        kind: "heard",
        occurrenceId: "speech.2",
        text: "Second utterance."
      }
    });
  });

  it("projects one shared occurrence into receiver-specific delivery records", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();
    const firstNpc = actor(snapshot, "npc.001");
    snapshot.entities.push({
      ...structuredClone(firstNpc),
      id: "npc.002",
      label: "NPC-002",
      position: { x: 1200, y: 800 }
    });

    const frame = seam.speak(
      snapshot,
      { speakerId: "player.jozz", text: "One shared utterance." },
      ({ observer }) => observer.id === "npc.001"
    );

    expect(frame.deliveries.map((delivery) => delivery.observerId)).toEqual(["npc.001", "npc.002"]);
    expect(frame.deliveries[0]).toMatchObject({
      couldReceive: true,
      experience: { occurrenceId: frame.occurrence.id, observerId: "npc.001" }
    });
    expect(frame.deliveries[1]).toEqual({
      observerId: "npc.002",
      couldReceive: false,
      experience: null
    });
  });

  it("rejects a non-actor speaker before consuming canonical occurrence identity", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();

    expect(() =>
      seam.speak(snapshot, { speakerId: "item.mug", text: "Impossible speaker." }, () => true)
    ).toThrow("P2-E1 speech requires an actor speaker");

    expect(
      seam.speak(snapshot, { speakerId: "player.jozz", text: "Valid speaker." }, () => false)
        .occurrence.id
    ).toBe("speech.1");
  });
});
