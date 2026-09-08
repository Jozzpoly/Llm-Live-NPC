import { describe, expect, it } from "vitest";
import { createP1Specimen } from "../world/specimen";
import { World } from "../world/world";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E2CommunicationRuntimeBoundary } from "./p2-e2-communication-runtime-boundary";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import {
  P2E5SemanticProviderAuthorityMembrane,
  type P2E5LocalProviderRun
} from "./p2-e5-semantic-provider-authority-membrane";

function prepareRedRevisionRun() {
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
  if (!origin) throw new Error("P2-E5 fixture requires origin heard evidence.");

  const matter = resident.openMatter({
    id: "matter.mug",
    originEvidenceId: origin.id,
    semanticCourse: "fetch blue mug"
  });
  const revision = communication.speak(
    { speakerId: "player.jozz", text: "Actually, the red one." },
    heardByNpc
  ).residentEvidence[0]?.evidence;
  if (!revision) throw new Error("P2-E5 fixture requires revision heard evidence.");
  resident.advanceSemanticContext(matter.id, revision.id);

  const ticket = resident.beginSemanticProposal(matter.id);
  const contextResult = new P2E4SemanticProposalContextSeam().build(resident, ticket);
  if (contextResult.status !== "ready") {
    throw new Error(`P2-E5 fixture requires ready P2-E4 context: ${contextResult.reason}`);
  }

  const membrane = new P2E5SemanticProviderAuthorityMembrane();
  const prepared = membrane.prepare(contextResult.context);
  return {
    resident,
    communication,
    heardByNpc,
    matter,
    revision,
    ticket,
    membrane,
    run: prepared.run
  };
}

describe("P2-E5 semantic provider authority membrane", () => {
  it("exposes only semantic model input while causal authority remains non-serializable and local", () => {
    const { resident, matter, revision, ticket, membrane, run } = prepareRedRevisionRun();

    expect(Object.keys(run)).toEqual(["modelInput"]);
    expect(run.modelInput).toEqual({
      currentSemanticCourse: "fetch blue mug",
      semanticEvidence: {
        kind: "heard",
        source: { kind: "actor", actorId: "player.jozz" },
        summary: "player.jozz said: Actually, the red one."
      }
    });

    const serializedRun = JSON.stringify(run);
    expect(serializedRun).not.toContain("proposalId");
    expect(serializedRun).not.toContain("matter.mug");
    expect(serializedRun).not.toContain(revision.id);
    expect(serializedRun).not.toContain("speech.2");
    expect(serializedRun).not.toContain("semanticRevision");

    const roundTripped = JSON.parse(serializedRun) as P2E5LocalProviderRun;
    expect(
      membrane.settle(resident, roundTripped, { semanticCourse: "fetch red mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
    expect(resident.pendingSemanticProposals()).toContainEqual(ticket);

    const settlement = membrane.settle(resident, run, {
      semanticCourse: "fetch red mug"
    });
    expect(settlement).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticCourse: "fetch red mug"
      }
    });
    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch green mug" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });

  it("rejects provider attempts to smuggle matter or physical-task authority without consuming the local run", () => {
    const { resident, matter, ticket, membrane, run } = prepareRedRevisionRun();
    const before = resident.matter(matter.id);

    expect(
      membrane.settle(resident, run, {
        semanticCourse: "fetch red mug",
        matterId: "matter.other"
      })
    ).toEqual({ status: "provider_output_rejected", reason: "unexpected_fields" });
    expect(
      membrane.settle(resident, run, {
        semanticCourse: "fetch red mug",
        command: { kind: "fetch", targetId: "item.red" }
      })
    ).toEqual({ status: "provider_output_rejected", reason: "unexpected_fields" });

    expect(resident.matter(matter.id)).toEqual(before);
    expect(resident.pendingSemanticProposals()).toContainEqual(ticket);

    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch red mug" })
    ).toMatchObject({ status: "applied", matter: { semanticCourse: "fetch red mug" } });
  });

  it("rejects malformed or unbounded semantic output while preserving authority for a later valid retry", () => {
    const { resident, matter, ticket, membrane, run } = prepareRedRevisionRun();

    expect(membrane.settle(resident, run, null)).toEqual({
      status: "provider_output_rejected",
      reason: "not_object"
    });
    expect(membrane.settle(resident, run, [])).toEqual({
      status: "provider_output_rejected",
      reason: "not_object"
    });
    expect(membrane.settle(resident, run, { semanticCourse: 7 })).toEqual({
      status: "provider_output_rejected",
      reason: "invalid_semantic_course"
    });
    expect(membrane.settle(resident, run, { semanticCourse: "   " })).toEqual({
      status: "provider_output_rejected",
      reason: "invalid_semantic_course"
    });
    expect(membrane.settle(resident, run, { semanticCourse: "x".repeat(513) })).toEqual({
      status: "provider_output_rejected",
      reason: "invalid_semantic_course"
    });

    expect(resident.pendingSemanticProposals()).toContainEqual(ticket);
    expect(resident.matter(matter.id)?.semanticCourse).toBe("fetch blue mug");
    expect(
      membrane.settle(resident, run, { semanticCourse: "  fetch red mug  " })
    ).toMatchObject({ status: "applied", matter: { semanticCourse: "fetch red mug" } });
  });

  it("cannot let a delayed valid provider response overwrite a later semantic supersession", () => {
    const {
      resident,
      communication,
      heardByNpc,
      matter,
      membrane,
      run
    } = prepareRedRevisionRun();

    const blueAgain = communication.speak(
      { speakerId: "player.jozz", text: "No, blue after all." },
      heardByNpc
    ).residentEvidence[0]?.evidence;
    if (!blueAgain) throw new Error("P2-E5 fixture requires superseding heard evidence.");
    resident.advanceSemanticContext(matter.id, blueAgain.id);

    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch red mug" })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });
    expect(resident.matter(matter.id)).toMatchObject({
      semanticCourse: "fetch blue mug",
      latestSemanticEvidenceId: blueAgain.id
    });
    expect(
      membrane.settle(resident, run, { semanticCourse: "fetch red mug again" })
    ).toEqual({ status: "local_run_rejected", reason: "unknown_local_run" });
  });

  it("allows only one of two same-revision provider runs to retain semantic commit authority", () => {
    const resident = new P2E0ResidentCausalKernel();
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
    const firstTicket = resident.beginSemanticProposal(matter.id);
    const secondTicket = resident.beginSemanticProposal(matter.id);
    const seam = new P2E4SemanticProposalContextSeam();
    const firstContext = seam.build(resident, firstTicket);
    const secondContext = seam.build(resident, secondTicket);
    if (firstContext.status !== "ready" || secondContext.status !== "ready") {
      throw new Error("P2-E5 fixture requires two ready same-revision contexts.");
    }
    const membrane = new P2E5SemanticProviderAuthorityMembrane();
    const firstRun = membrane.prepare(firstContext.context).run;
    const secondRun = membrane.prepare(secondContext.context).run;

    expect(
      membrane.settle(resident, firstRun, { semanticCourse: "fetch red mug" })
    ).toMatchObject({ status: "applied", matter: { semanticCourse: "fetch red mug" } });
    expect(
      membrane.settle(resident, secondRun, { semanticCourse: "fetch green mug" })
    ).toEqual({ status: "stale", reason: "semantic_revision_changed" });
    expect(resident.matter(matter.id)?.semanticCourse).toBe("fetch red mug");
  });

  it("strips task-run provenance from model-visible evidence while retaining its semantic outcome", () => {
    const resident = new P2E0ResidentCausalKernel();
    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "player.jozz said: Try to fetch the mug."
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "try to fetch mug"
    });
    resident.bindTask(matter.id, { taskId: "task.fetch-mug", runId: 77 });
    const outcome = resident.recordTaskOutcome({
      runId: 77,
      status: "failed",
      code: "target_unavailable",
      message: "The requested mug is no longer available."
    });
    resident.advanceSemanticContext(matter.id, outcome.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const context = new P2E4SemanticProposalContextSeam().build(resident, ticket);
    if (context.status !== "ready") {
      throw new Error(`P2-E5 fixture requires task-outcome context: ${context.reason}`);
    }

    const run = new P2E5SemanticProviderAuthorityMembrane().prepare(context.context).run;
    expect(run.modelInput.semanticEvidence).toEqual({
      kind: "task_outcome",
      source: { kind: "task" },
      summary: "failed · target_unavailable · The requested mug is no longer available."
    });
    const serialized = JSON.stringify(run.modelInput);
    expect(serialized).not.toContain("runId");
    expect(serialized).not.toContain("77");
    expect(serialized).not.toContain(outcome.id);
  });
});
