import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E1GroundedCommunicationSeam } from "./p2-e1-grounded-communication-seam";

function canonicalSnapshot() {
  return new World(createP1Specimen()).snapshot();
}

describe("P2-E1 adversarial causality", () => {
  it("preserves both canonical speech occurrence identity and speaker identity when heard experience becomes resident evidence", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const frame = seam.speak(
      canonicalSnapshot(),
      { speakerId: "player.jozz", text: "The mug is in the workshop." },
      () => true
    );
    const heard = frame.deliveries.find((delivery) => delivery.observerId === "npc.001")?.experience;
    if (!heard) throw new Error("P2-E1 bridge attack requires a grounded heard experience.");

    const kernel = new P2E0ResidentCausalKernel();
    const evidence = kernel.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: heard.source.actorId },
      summary: `${heard.source.actorId} said: ${heard.text}`
    });

    expect(evidence.kind).toBe("heard");
    expect(evidence.source as unknown as Record<string, unknown>).toMatchObject({
      kind: "actor",
      actorId: heard.source.actorId,
      occurrenceId: heard.occurrenceId
    });
  });

  it("does not consume canonical speech identity when receiver assessment aborts before a communication frame exists", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();

    expect(() =>
      seam.speak(
        snapshot,
        { speakerId: "player.jozz", text: "This emission never gets a frame." },
        () => {
          throw new Error("reception policy failed");
        }
      )
    ).toThrow("reception policy failed");

    const valid = seam.speak(
      snapshot,
      { speakerId: "player.jozz", text: "First committed occurrence." },
      () => false
    );

    expect(valid.occurrence.id).toBe("speech.1");
  });
});
