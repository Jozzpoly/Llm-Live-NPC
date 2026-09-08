import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";

describe("P2-E3 explicit semantic attribution", () => {
  it("advances one matter from the exact grounded P2-E2 evidence identity without duplicating the occurrence", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E3 fixture requires initial resident heard evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    const pendingBeforeRevision = resident.beginSemanticProposal(matter.id);

    const revision = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!revision) throw new Error("P2-E3 fixture requires revision resident heard evidence.");

    expect(revision).toMatchObject({
      kind: "heard",
      matterId: null,
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: "speech.2"
      }
    });

    const advanced = resident.advanceSemanticContext(matter.id, revision.id);

    expect(advanced).toMatchObject({
      id: matter.id,
      semanticRevision: matter.semanticRevision + 1,
      latestSemanticEvidenceId: revision.id,
      semanticCourse: "fetch blue mug"
    });
    expect(
      resident
        .recentEvidence()
        .filter(
          (evidence) =>
            evidence.source.kind === "actor" && evidence.source.occurrenceId === "speech.2"
        )
    ).toEqual([revision]);
    expect(
      resident.commitSemanticProposal(pendingBeforeRevision, {
        semanticCourse: "stale blue-mug interpretation"
      })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });
  });
});
