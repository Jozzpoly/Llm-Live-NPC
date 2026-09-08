import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";

describe("P2-E3 semantic attribution characterization", () => {
  it("keeps newly heard P2-E2 evidence resident-grounded but semantically unscoped from an existing matter", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const initial = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!initial) throw new Error("P2-E3 fixture requires initial resident heard evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: initial.id,
      semanticCourse: "fetch blue mug"
    });

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

    expect(() => resident.advanceSemanticContext(matter.id, revision.id)).toThrow(
      `P2-E0 semantic evidence ${revision.id} is not scoped to matter ${matter.id}.`
    );
    expect(resident.matter(matter.id)).toMatchObject({
      semanticRevision: matter.semanticRevision,
      latestSemanticEvidenceId: initial.id,
      semanticCourse: "fetch blue mug"
    });
  });

  it("can represent attribution only by appending a second local evidence record for the same grounded speech occurrence", () => {
    const world = new World(createP1Specimen());
    const resident = new P2E0ResidentCausalKernel();
    const communication = new P2E2CommunicationRuntimeBoundary(
      world,
      new Map([["npc.001", resident]])
    );
    const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";

    const initial = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the blue mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!initial) throw new Error("P2-E3 fixture requires initial resident heard evidence.");

    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: initial.id,
      semanticCourse: "fetch blue mug"
    });

    const direct = communication.speak(
      { speakerId: "player.jozz", text: "Actually, the red one." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!direct || direct.source.kind !== "actor") {
      throw new Error("P2-E3 fixture requires actor-sourced revision evidence.");
    }

    const attributedCopy = resident.recordEvidence({
      kind: "heard",
      source: { ...direct.source },
      summary: direct.summary,
      matterId: matter.id
    });
    resident.advanceSemanticContext(matter.id, attributedCopy.id);

    expect(attributedCopy.id).not.toBe(direct.id);
    expect(attributedCopy.source).toEqual(direct.source);
    expect(attributedCopy.matterId).toBe(matter.id);
    expect(
      resident
        .recentEvidence()
        .filter(
          (evidence) =>
            evidence.source.kind === "actor" && evidence.source.occurrenceId === "speech.2"
        )
        .map((evidence) => ({ id: evidence.id, matterId: evidence.matterId }))
    ).toEqual([
      { id: direct.id, matterId: null },
      { id: attributedCopy.id, matterId: matter.id }
    ]);
    expect(resident.matter(matter.id)).toMatchObject({
      semanticRevision: matter.semanticRevision + 1,
      latestSemanticEvidenceId: attributedCopy.id
    });
  });

  it("leaves semantic interpretation outside the grounded-evidence kernel when opening a new matter", () => {
    const makeResident = (semanticCourse: string) => {
      const resident = new P2E0ResidentCausalKernel();
      const origin = resident.recordEvidence({
        kind: "heard",
        source: {
          kind: "actor",
          actorId: "player.jozz",
          occurrenceId: "speech.same"
        },
        summary: "player.jozz said: Bring me the mug."
      });
      return resident.openMatter({
        id: "matter.mug",
        originEvidenceId: origin.id,
        semanticCourse
      });
    };

    const fetchInterpretation = makeResident("fetch mug");
    const clarificationInterpretation = makeResident("clarify which mug");

    expect(fetchInterpretation.originEvidenceId).toBe(clarificationInterpretation.originEvidenceId);
    expect(fetchInterpretation.semanticCourse).toBe("fetch mug");
    expect(clarificationInterpretation.semanticCourse).toBe("clarify which mug");
  });

  it("already permits one grounded evidence item to originate more than one semantic matter", () => {
    const resident = new P2E0ResidentCausalKernel();
    const origin = resident.recordEvidence({
      kind: "heard",
      source: {
        kind: "actor",
        actorId: "player.jozz",
        occurrenceId: "speech.multi"
      },
      summary: "player.jozz said: Bring me the mug, and remember that Bob asked about the lantern."
    });

    const mugMatter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "clarify and then handle the mug request"
    });
    const bobMatter = resident.openMatter({
      id: "matter.bob-lantern",
      originEvidenceId: origin.id,
      semanticCourse: "retain Bob's lantern request as unresolved"
    });

    expect(mugMatter.originEvidenceId).toBe(origin.id);
    expect(bobMatter.originEvidenceId).toBe(origin.id);
    expect(mugMatter.id).not.toBe(bobMatter.id);
    expect(resident.recentEvidence()).toHaveLength(1);
  });
});
