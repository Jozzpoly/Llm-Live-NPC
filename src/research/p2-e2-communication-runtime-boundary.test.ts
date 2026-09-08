import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";

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
});
