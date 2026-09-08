import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import type { ActorEntity } from "../world/types";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";

function requireActor(entity: unknown): ActorEntity {
  if (
    !entity ||
    typeof entity !== "object" ||
    !("kind" in entity) ||
    ((entity as { kind?: unknown }).kind !== "player" &&
      (entity as { kind?: unknown }).kind !== "npc")
  ) {
    throw new Error("P2-E2 fixture requires an actor entity.");
  }
  return entity as ActorEntity;
}

describe("P2-E2 communication runtime ownership boundary", () => {
  it("routes one committed heard experience into only the matching resident continuity with canonical occurrence provenance", () => {
    const world = new World(createP1Specimen());
    const npc = new P2E0ResidentCausalKernel();
    const boundary = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", npc]])
    );

    const result = boundary.speak(
      { speakerId: "player.jozz", text: "The lantern is yours if you want it." },
      ({ observer }) => observer.id === "npc.001"
    );

    expect(result.frame.occurrence.id).toBe("speech.1");
    expect(result.frame.occurrence.tick).toBe(world.tick);
    expect(result.residentEvidence).toHaveLength(1);
    expect(result.residentEvidence[0].observerId).toBe("npc.001");

    const evidence = npc.recentEvidence();
    expect(evidence).toHaveLength(1);
    expect(evidence[0]).toMatchObject({
      kind: "heard",
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: result.frame.occurrence.id
      },
      matterId: null
    });
    expect(evidence[0].summary).toContain("The lantern is yours if you want it.");
  });

  it("does not manufacture resident evidence for an actor that could not receive the canonical occurrence", () => {
    const world = new World(createP1Specimen());
    const npc = new P2E0ResidentCausalKernel();
    const boundary = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", npc]])
    );

    const result = boundary.speak(
      { speakerId: "player.jozz", text: "This was not heard." },
      () => false
    );

    expect(result.frame.occurrence.id).toBe("speech.1");
    expect(result.residentEvidence).toEqual([]);
    expect(npc.recentEvidence()).toEqual([]);
  });

  it("does not leak a grounded delivery into an unregistered resident owner", () => {
    const world = new World(createP1Specimen());
    const boundary = new P2E2CommunicationRuntimeBoundary(world, new Map());

    const result = boundary.speak(
      { speakerId: "player.jozz", text: "A real occurrence can exist without a local resident host." },
      ({ observer }) => observer.id === "npc.001"
    );

    expect(result.frame.deliveries.find((delivery) => delivery.observerId === "npc.001")?.couldReceive).toBe(true);
    expect(result.residentEvidence).toEqual([]);
  });

  it("keeps communication out of the global World event log while resident evidence receives it", () => {
    const world = new World(createP1Specimen());
    const npc = new P2E0ResidentCausalKernel();
    const boundary = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", npc]])
    );
    const worldEventsBefore = world.recentEvents(128);

    boundary.speak(
      { speakerId: "player.jozz", text: "This should be situated evidence, not global cognition history." },
      ({ observer }) => observer.id === "npc.001"
    );

    expect(world.recentEvents(128)).toEqual(worldEventsBefore);
    expect(npc.recentEvidence()).toHaveLength(1);
  });

  it("keeps one shared occurrence while routing heard evidence only to the receiver among multiple resident owners", () => {
    const specimen = createP1Specimen();
    const firstNpc = requireActor(specimen.entities.find((entity) => entity.id === "npc.001"));
    specimen.entities.push({
      ...structuredClone(firstNpc),
      id: "npc.002",
      label: "NPC-002",
      position: { x: firstNpc.position.x + 80, y: firstNpc.position.y }
    });

    const world = new World(specimen);
    const npc1 = new P2E0ResidentCausalKernel();
    const npc2 = new P2E0ResidentCausalKernel();
    const boundary = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([
        ["npc.001", npc1],
        ["npc.002", npc2]
      ])
    );

    const result = boundary.speak(
      { speakerId: "player.jozz", text: "One occurrence, receiver-specific experience." },
      ({ observer }) => observer.id === "npc.001"
    );

    expect(result.frame.occurrence.id).toBe("speech.1");
    expect(result.frame.deliveries.map((delivery) => delivery.observerId)).toEqual([
      "npc.001",
      "npc.002"
    ]);
    expect(result.residentEvidence.map((delivery) => delivery.observerId)).toEqual(["npc.001"]);
    expect(npc1.recentEvidence()[0]?.source).toMatchObject({
      kind: "actor",
      actorId: "player.jozz",
      occurrenceId: "speech.1"
    });
    expect(npc2.recentEvidence()).toEqual([]);
  });
});
