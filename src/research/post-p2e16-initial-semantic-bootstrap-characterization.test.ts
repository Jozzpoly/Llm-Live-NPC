import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import { P2E5SemanticProviderAuthorityMembrane } from "./p2-e5-semantic-provider-authority-membrane";
import {
  P2E6GroundedTaskStartBoundary,
  type P2E6LocalTaskGrounder
} from "./p2-e6-grounded-task-start-causality";

const UNINTERPRETED = "uninterpreted";

const exactFetchLabelGrounder: P2E6LocalTaskGrounder = ({ semanticCourse, actorId, snapshot }) => {
  const match = /^fetch\s+(.+)$/i.exec(semanticCourse.trim());
  if (!match) return null;
  const requestedLabel = match[1].trim().toLocaleLowerCase();
  const matches = snapshot.entities.filter(
    (entity) => entity.kind === "item" && entity.label.toLocaleLowerCase() === requestedLabel
  );
  if (matches.length !== 1) return null;
  const target = matches[0];
  return {
    taskId: `fetch:${target.id}`,
    task: { kind: "approach-and-interact", actorId, targetId: target.id }
  };
};

function fixture() {
  const world = new World(createP1Specimen());
  const resident = new P2E0ResidentCausalKernel();
  const communication = new P2E2CommunicationRuntimeBoundary(
    world,
    new Map([["npc.001", resident]])
  );
  const heardByNpc = ({ observer }: { observer: { id: string } }) => observer.id === "npc.001";
  return { world, resident, communication, heardByNpc };
}

describe("post-P2-E16 initial semantic bootstrap characterization", () => {
  it("can derive the first meaningful semantic course from grounded origin evidence without caller-invented request meaning", () => {
    const { world, resident, communication, heardByNpc } = fixture();
    const spoken = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the Red mug." },
      heardByNpc
    );
    const heard = spoken.residentEvidence[0]?.evidence;
    if (!heard) throw new Error("Initial semantic bootstrap requires grounded heard evidence.");

    // This is characterization apparatus, not a selected permanent schema.
    // The caller decides only that the grounded occurrence deserves a durable
    // matter; it does not encode the request's actual meaning into the matter.
    const matter = resident.openMatter({
      id: "matter.bootstrap",
      originEvidenceId: heard.id,
      semanticCourse: UNINTERPRETED
    });
    expect(matter).toMatchObject({
      semanticCourse: UNINTERPRETED,
      semanticRevision: 1,
      latestSemanticEvidenceId: heard.id,
      status: "active"
    });

    const ticket = resident.beginSemanticProposal(matter.id);
    const context = new P2E4SemanticProposalContextSeam().build(resident, ticket);
    expect(context.status).toBe("ready");
    if (context.status !== "ready") return;

    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const run = provider.prepare(context.context).run;
    expect(run.modelInput).toEqual({
      currentSemanticCourse: UNINTERPRETED,
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: heard.summary
      }
    });

    const interpreted = provider.settle(resident, run, { semanticCourse: "fetch Red mug" });
    expect(interpreted.status).toBe("applied");
    if (interpreted.status !== "applied") return;
    expect(interpreted.matter).toMatchObject({
      id: matter.id,
      semanticCourse: "fetch Red mug",
      semanticRevision: 2,
      latestSemanticEvidenceId: heard.id
    });

    // After that first semantic commit the existing intent→task boundary can
    // ground against current World truth without any special initial-case path.
    const taskStart = new P2E6GroundedTaskStartBoundary();
    const grounded = taskStart.prepare(
      resident,
      world.snapshot(),
      matter.id,
      "npc.001",
      exactFetchLabelGrounder
    );
    expect(grounded.status).toBe("ready");
    if (grounded.status !== "ready") return;
    expect(
      taskStart.start(
        resident,
        world.snapshot(),
        new DeterministicExecutor(),
        grounded.candidate,
        { kind: "cognition", sessionId: 17, cycleId: 1 }
      )
    ).toMatchObject({
      status: "started",
      binding: { matterId: matter.id, semanticRevision: interpreted.matter.semanticRevision }
    });
  });

  it("keeps a delayed first interpretation causally stale when newer grounded speech supersedes the origin before it returns", () => {
    const { resident, communication, heardByNpc } = fixture();
    const first = communication.speak(
      { speakerId: "player.jozz", text: "Bring me the Red mug." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!first) throw new Error("Initial semantic bootstrap requires first grounded evidence.");

    const matter = resident.openMatter({
      id: "matter.bootstrap-stale",
      originEvidenceId: first.id,
      semanticCourse: UNINTERPRETED
    });
    const firstTicket = resident.beginSemanticProposal(matter.id);
    const seam = new P2E4SemanticProposalContextSeam();
    const firstContext = seam.build(resident, firstTicket);
    if (firstContext.status !== "ready") {
      throw new Error(`Expected initial ready context: ${firstContext.reason}`);
    }
    const provider = new P2E5SemanticProviderAuthorityMembrane();
    const firstRun = provider.prepare(firstContext.context).run;

    const correction = communication.speak(
      { speakerId: "player.jozz", text: "No, the Blue mug instead." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!correction) throw new Error("Initial semantic bootstrap requires correction evidence.");
    resident.advanceSemanticContext(matter.id, correction.id);

    expect(provider.settle(resident, firstRun, { semanticCourse: "fetch Red mug" })).toEqual({
      status: "stale",
      reason: "semantic_revision_changed"
    });
    expect(resident.matter(matter.id)).toMatchObject({
      semanticCourse: UNINTERPRETED,
      semanticRevision: 2,
      latestSemanticEvidenceId: correction.id
    });

    const secondTicket = resident.beginSemanticProposal(matter.id);
    const secondContext = seam.build(resident, secondTicket);
    if (secondContext.status !== "ready") {
      throw new Error(`Expected corrected ready context: ${secondContext.reason}`);
    }
    const secondRun = provider.prepare(secondContext.context).run;
    expect(secondRun.modelInput).toMatchObject({
      currentSemanticCourse: UNINTERPRETED,
      semanticEvidence: { summary: correction.summary }
    });
    expect(provider.settle(resident, secondRun, { semanticCourse: "fetch Blue mug" })).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch Blue mug",
        latestSemanticEvidenceId: correction.id
      }
    });
  });
});
