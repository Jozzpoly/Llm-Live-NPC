import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel, type P2E0MatterStatus } from "./p2-e0-resident-causal-kernel";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

type TerminalMatterStatus = Extract<P2E0MatterStatus, "resolved" | "cancelled">;

function terminalize(
  resident: P2E0ResidentCausalKernel,
  matterId: string,
  status: TerminalMatterStatus
): void {
  if (status === "resolved") resident.resolveMatter(matterId);
  else resident.cancelMatter(matterId);
}

function setup(first: TerminalMatterStatus) {
  const resident = new P2E0ResidentCausalKernel();
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `speech.${first}` },
    summary: "player.jozz opened a terminal-state audit matter"
  });
  const matter = resident.openMatter({
    id: `matter.${first}`,
    originEvidenceId: origin.id,
    semanticCourse: "fetch mug"
  });
  const ticket = resident.beginSemanticProposal(matter.id);

  const executor = new DeterministicExecutor();
  expect(
    executor.start(
      { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
      { kind: "cognition" }
    )
  ).toBe(true);
  const run = executor.state().run;
  if (!run) throw new Error("Terminal-state RED requires a running executor run.");
  resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

  terminalize(resident, matter.id, first);
  const firstRevocation = resident
    .recentSemanticProposalRevocations()
    .find((record) => record.proposal.proposalId === ticket.proposalId);
  if (!firstRevocation) {
    throw new Error("Terminal-state RED requires P2-E12 revocation provenance.");
  }

  return { resident, executor, matter, run, firstRevocation };
}

describe("post-P2-E13 terminal matter state monotonicity RED", () => {
  for (const first of ["resolved", "cancelled"] as const) {
    const second: TerminalMatterStatus = first === "resolved" ? "cancelled" : "resolved";

    it(`preserves the first terminal cause across a later ${first} -> ${second} call`, () => {
      const { resident, executor, matter, firstRevocation } = setup(first);

      expect(firstRevocation).toMatchObject({
        reason: "matter_terminal",
        matterStatus: first,
        proposal: { matterId: matter.id }
      });
      expect(resident.matter(matter.id)?.status).toBe(first);

      // resolved/cancelled are already treated as terminal throughout P2-E4,
      // P2-E8, P2-E11 and P2-E12. A later opposite terminalization call must
      // not rewrite the already-established terminal cause.
      terminalize(resident, matter.id, second);

      const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
      const disposition = dispositions.dispose(resident, executor, matter.id);

      expect.soft(resident.matter(matter.id)?.status).toBe(first);
      expect.soft(firstRevocation.matterStatus).toBe(first);
      expect.soft(disposition).toMatchObject({
        status: "disposed",
        record: {
          matterId: matter.id,
          matterStatus: first,
          reason: first === "resolved" ? "matter_resolved" : "matter_cancelled"
        }
      });
    });
  }
});
