import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E9SemanticReconsiderationHoldBoundary } from "./p2-e9-semantic-reconsideration-hold";

describe("P2-E9 stale applied semantic decision", () => {
  it("does not release a held run from a once-applied decision after newer semantic context supersedes that decision", () => {
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "bring the mug"
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });
    expect(
      executor.start({ kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" })
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E9 fixture requires executor run.");
    resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.2" },
      summary: "actually reconsider it"
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);
    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    const applied = resident.commitSemanticProposal(ticket, { semanticCourse: "fetch Red mug" });
    expect(applied.status).toBe("applied");

    const newer = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.3" },
      summary: "no, changed again"
    });
    resident.advanceSemanticContext(matter.id, newer.id);

    expect(holds.release(resident, executor, armed.hold, applied)).toEqual({
      status: "rejected",
      reason: "semantic_decision_not_current"
    });
    expect(holds.holdForRun(run.runId)).toEqual(armed.hold);
    expect(executor.state()).toMatchObject({ status: "running", run: { runId: run.runId } });
  });
});
