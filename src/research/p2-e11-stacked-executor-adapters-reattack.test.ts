import { describe, expect, it } from "vitest";
import { DeterministicExecutor } from "../execution/deterministic-executor";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";
import {
  P2E9HoldAwareExecutor,
  P2E9SemanticReconsiderationHoldBoundary
} from "./p2-e9-semantic-reconsideration-hold";
import { P2E10MatterSuspensionAwareExecutor } from "./p2-e10-matter-suspension-execution-causality";
import { P2E11TerminalMatterTaskDispositionBoundary } from "./p2-e11-terminal-matter-task-disposition";

function openMatter(resident: P2E0ResidentCausalKernel, id: string) {
  const origin = resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId: `${id}.speech` },
    summary: "player.jozz said: fetch Red mug"
  });
  return resident.openMatter({ id, originEvidenceId: origin.id, semanticCourse: "fetch Red mug" });
}

describe("P2-E11 stacked executor adapter retirement re-attack", () => {
  for (const order of ["hold-outside", "suspension-outside"] as const) {
    it(`reaches and retires the same inner run through ${order} composition`, () => {
      const resident = new P2E0ResidentCausalKernel();
      const inner = new DeterministicExecutor();
      const holds = new P2E9SemanticReconsiderationHoldBoundary();
      const holdAware = new P2E9HoldAwareExecutor(inner, holds);
      const suspensionAware = new P2E10MatterSuspensionAwareExecutor(inner, resident);
      const executor: DeterministicExecutor =
        order === "hold-outside"
          ? new P2E9HoldAwareExecutor(
              new P2E10MatterSuspensionAwareExecutor(inner, resident),
              holds
            )
          : new P2E10MatterSuspensionAwareExecutor(holdAware, resident);
      const dispositions = new P2E11TerminalMatterTaskDispositionBoundary();
      const matter = openMatter(resident, `matter.stack.${order}`);

      expect(
        executor.start(
          { kind: "approach-and-interact", actorId: "npc.001", targetId: "item.mug" },
          { kind: "cognition" }
        )
      ).toBe(true);
      const run = executor.state().run;
      if (!run) throw new Error("P2-E11 stacked adapter re-attack requires run provenance.");
      resident.bindTask(matter.id, { taskId: "fetch:item.mug", runId: run.runId });

      // The independent suspensionAware instance intentionally shares the same
      // inner only as an observability witness; it must see the exact state that
      // the nested stack exposes rather than a wrapper-local phantom state.
      expect(suspensionAware.state()).toEqual(inner.state());
      expect(executor.state()).toEqual(inner.state());

      resident.cancelMatter(matter.id);
      expect(dispositions.dispose(resident, executor, matter.id)).toMatchObject({
        status: "disposed",
        record: { runId: run.runId, matterId: matter.id }
      });

      expect(inner.state()).toMatchObject({
        status: "idle",
        task: null,
        run: { runId: run.runId }
      });
      expect(executor.state()).toEqual(inner.state());
      expect(resident.taskBinding(run.runId)).toBeNull();
    });
  }
});
