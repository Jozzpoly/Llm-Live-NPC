import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";

function makeCommunicationResident(recentEvidenceLimit = 32) {
  const world = new World(createP1Specimen());
  const resident = new P2E0ResidentCausalKernel(recentEvidenceLimit);
  const communication = new P2E2CommunicationRuntimeBoundary(
    world,
    new Map([["npc.001", resident]])
  );
  const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";
  return { resident, communication, heardByNpc };
}

describe("P2-E3 explicit semantic attribution", () => {
  it("advances one matter from the exact grounded P2-E2 evidence identity without duplicating the occurrence", () => {
    const { resident, communication, heardByNpc } = makeCommunicationResident();

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

  it("lets one grounded evidence identity explicitly advance more than one matter without mutating or duplicating evidence", () => {
    const { resident, communication, heardByNpc } = makeCommunicationResident();

    const origin = communication.speak(
      {
        speakerId: "player.jozz",
        text: "Bring me the mug, and remember that Bob still needs the lantern."
      },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E3 fixture requires shared origin evidence.");

    const mug = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "handle mug request"
    });
    const lantern = resident.openMatter({
      id: "matter.lantern",
      originEvidenceId: origin.id,
      semanticCourse: "retain Bob lantern request"
    });

    const sharedRevision = communication.speak(
      {
        speakerId: "player.jozz",
        text: "Use the red mug, and Bob no longer needs the lantern."
      },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!sharedRevision) throw new Error("P2-E3 fixture requires shared revision evidence.");

    const mugAdvanced = resident.advanceSemanticContext(mug.id, sharedRevision.id);
    const lanternAdvanced = resident.advanceSemanticContext(lantern.id, sharedRevision.id);

    expect(mugAdvanced).toMatchObject({
      semanticRevision: mug.semanticRevision + 1,
      latestSemanticEvidenceId: sharedRevision.id
    });
    expect(lanternAdvanced).toMatchObject({
      semanticRevision: lantern.semanticRevision + 1,
      latestSemanticEvidenceId: sharedRevision.id
    });
    expect(sharedRevision.matterId).toBeNull();
    expect(
      resident
        .recentEvidence()
        .filter(
          (evidence) =>
            evidence.source.kind === "actor" && evidence.source.occurrenceId === "speech.2"
        )
    ).toEqual([sharedRevision]);
  });

  it("does not advance any semantic clock merely because new grounded speech evidence arrived", () => {
    const { resident, communication, heardByNpc } = makeCommunicationResident();

    const origin = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!origin) throw new Error("P2-E3 fixture requires origin evidence.");

    const mug = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    const pending = resident.beginSemanticProposal(mug.id);

    const unrelatedSpeech = communication.speak(
      { speakerId: "player.jozz", text: "The weather is getting worse." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!unrelatedSpeech) throw new Error("P2-E3 fixture requires later grounded evidence.");

    expect(unrelatedSpeech.matterId).toBeNull();
    expect(resident.matter(mug.id)).toMatchObject({
      semanticRevision: mug.semanticRevision,
      latestSemanticEvidenceId: origin.id,
      semanticCourse: "fetch blue mug"
    });
    expect(
      resident.commitSemanticProposal(pending, {
        semanticCourse: "fetch blue mug from the north shelf"
      })
    ).toMatchObject({ status: "applied" });
  });

  it("cannot semantically attribute evidence after that evidence has left the bounded recent-evidence store", () => {
    const resident = new P2E0ResidentCausalKernel(2);
    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "player.jozz said: Bring me the mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch mug"
    });
    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.2" },
      summary: "player.jozz said: Actually, wait."
    });

    resident.recordEvidence({
      kind: "observed",
      source: { kind: "world", occurrenceId: "world.1" },
      summary: "unrelated world evidence one"
    });
    resident.recordEvidence({
      kind: "elapsed",
      source: { kind: "clock" },
      summary: "unrelated elapsed evidence two"
    });

    expect(resident.recentEvidence().map((entry) => entry.id)).not.toContain(revision.id);
    expect(() => resident.advanceSemanticContext(matter.id, revision.id)).toThrow(
      `P2-E0 recent evidence not found: ${revision.id}`
    );
    expect(resident.matter(matter.id)).toMatchObject({
      semanticRevision: matter.semanticRevision,
      latestSemanticEvidenceId: origin.id,
      semanticCourse: "fetch mug"
    });
  });
});
