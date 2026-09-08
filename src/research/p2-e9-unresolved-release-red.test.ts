import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import { P2E9SemanticReconsiderationHoldBoundary } from "./p2-e9-semantic-reconsideration-hold";

describe("P2-E9 unresolved reconsideration release RED", () => {
  it("does not release the exact held run while the semantic proposal is still pending", () => {
    const resident = new P2E0ResidentCausalKernel();
    const executor = new DeterministicExecutor();
    const holds = new P2E9SemanticReconsiderationHoldBoundary();

    const origin = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.1" },
      summary: "player.jozz said: bring the mug"
    });
    const matter = resident.openMatter({
      id: "matter.mug",
      originEvidenceId: origin.id,
      semanticCourse: "fetch Red mug"
    });

    expect(
      executor.start(
        { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
        { kind: "cognition" }
      )
    ).toBe(true);
    const run = executor.state().run;
    if (!run) throw new Error("P2-E9 RED requires an accepted executor run.");
    resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

    const revision = resident.recordEvidence({
      kind: "heard",
      source: { kind: "actor", actorId: "player.jozz", occurrenceId: "speech.2" },
      summary: "player.jozz said: actually leave it alone"
    });
    resident.advanceSemanticContext(matter.id, revision.id);
    const ticket = resident.beginSemanticProposal(matter.id);

    const armed = holds.arm(resident, executor, ticket);
    expect(armed.status).toBe("held");
    if (armed.status !== "held") return;

    expect(resident.pendingSemanticProposals()).toContainEqual(ticket);
    expect(holds.release(armed.hold)).toEqual({
      status: "rejected",
      reason: "semantic_reconsideration_unresolved"
    });
    expect(holds.holdForRun(run.runId)).toEqual(armed.hold);
  });
});
