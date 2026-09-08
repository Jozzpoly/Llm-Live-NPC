import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import {
  P2E0ResidentCausalKernel,
  type P2E0EvidenceInput
} from "./p2-e0-resident-causal-kernel";
import { P2E1GroundedCommunicationSeam } from "./p2-e1-grounded-communication-seam";

function canonicalSnapshot() {
  return new World(createP1Specimen()).snapshot();
}

describe("P2-E1 post-fix re-attack", () => {
  it("accepts actor plus occurrence provenance through the typed P2-E0 evidence boundary", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const frame = seam.speak(
      canonicalSnapshot(),
      { speakerId: "player.jozz", text: "Typed provenance." },
      () => true
    );
    const heard = frame.deliveries.find((delivery) => delivery.observerId === "npc.001")?.experience;
    if (!heard) throw new Error("P2-E1 typed bridge re-attack requires heard experience.");

    const source: P2E0EvidenceInput["source"] = {
      kind: "actor",
      actorId: heard.source.actorId,
      occurrenceId: heard.occurrenceId
    };
    const kernel = new P2E0ResidentCausalKernel();
    const evidence = kernel.recordEvidence({
      kind: "heard",
      source,
      summary: heard.text
    });

    expect(evidence.source).toEqual(source);
  });

  it("isolates reception-policy context mutation from the supplied snapshot and returned canonical frame", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();
    const before = structuredClone(snapshot);

    const frame = seam.speak(
      snapshot,
      { speakerId: "player.jozz", text: "Immutable utterance." },
      (context) => {
        context.snapshot.tick = 9999;
        context.occurrence.text = "forged utterance";
        context.occurrence.sourcePosition.x = -9999;
        context.speaker.position.x = -8888;
        context.observer.position.y = -7777;
        return true;
      }
    );

    expect(snapshot).toEqual(before);
    expect(frame.occurrence).toMatchObject({
      id: "speech.1",
      tick: before.tick,
      speakerId: "player.jozz",
      text: "Immutable utterance.",
      sourcePosition: before.entities.find((entity) => entity.id === "player.jozz")?.position
    });
    expect(frame.deliveries[0]?.experience).toMatchObject({
      occurrenceId: "speech.1",
      text: "Immutable utterance.",
      source: { kind: "actor", actorId: "player.jozz" }
    });
  });

  it("rejects reentrant speech from reception assessment without committing duplicate or partial occurrence identity", () => {
    const seam = new P2E1GroundedCommunicationSeam();
    const snapshot = canonicalSnapshot();
    let nestedAttempted = false;

    expect(() =>
      seam.speak(
        snapshot,
        { speakerId: "player.jozz", text: "Outer utterance." },
        () => {
          if (!nestedAttempted) {
            nestedAttempted = true;
            seam.speak(
              snapshot,
              { speakerId: "player.jozz", text: "Nested utterance." },
              () => false
            );
          }
          return true;
        }
      )
    ).toThrow("P2-E1 communication seam does not allow reentrant speech");

    expect(
      seam.speak(
        snapshot,
        { speakerId: "player.jozz", text: "First committed utterance." },
        () => false
      ).occurrence.id
    ).toBe("speech.1");
  });
});
