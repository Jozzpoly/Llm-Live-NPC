import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { derivePriorSameActorOutcomeSupport } from "./resident-cumulative-history-support";

describe("bounded cumulative same-actor factual history support", () => {
  it("selects only the eight newest exact same-actor terminal outcomes in deterministic chronological order", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 2,
      terminalOutcomeArchiveLimit: 32,
    });

    const idaEpisodes = Array.from({ length: 10 }, (_, index) => {
      const suffix = `ida-${index}`;
      return terminalCommunication(kernel, suffix, "resident.ida", index * 10 + 1);
    });
    const nela = terminalCommunication(kernel, "nela-unrelated", "resident.nela", 200);

    // Churn recent evidence so this test proves archive/history selection rather than
    // accidentally relying on near-term current-life evidence.
    for (let index = 0; index < 4; index += 1) {
      kernel.recordEvidence({
        id: `evidence.cumulative-support.churn.${index}`,
        tick: 300 + index,
        kind: "later_life",
        summary: `ordinary unrelated later life ${index}`,
      });
    }

    const support = derivePriorSameActorOutcomeSupport(kernel, "resident.ida");
    expect(support).toHaveLength(8);
    expect(support).toEqual(
      idaEpisodes.slice(2).map((episode) => ({
        relation: "prior_same_actor_outcome",
        sourceMatterId: episode.matterId,
        evidenceId: episode.outcome.id,
      })),
    );
    expect(support.some((entry) => entry.evidenceId === nela.outcome.id)).toBe(false);
    expect(support.some((entry) => entry.sourceMatterId === idaEpisodes[0]!.matterId)).toBe(false);
    expect(support.some((entry) => entry.sourceMatterId === idaEpisodes[1]!.matterId)).toBe(false);
  });

  it("returns no support for an actor with no exact factual terminal communication history", () => {
    const kernel = new ResidentContinuityKernel({
      terminalOutcomeArchiveLimit: 8,
    });
    terminalCommunication(kernel, "ida-only", "resident.ida", 1);

    expect(derivePriorSameActorOutcomeSupport(kernel, "resident.nela")).toEqual([]);
  });
});

function terminalCommunication(
  kernel: ResidentContinuityKernel,
  suffix: string,
  targetActorId: string,
  tick: number,
) {
  const matterId = `matter.cumulative-support.${suffix}`;
  const runId = `run.cumulative-support.${suffix}`;
  const origin = kernel.recordEvidence({
    id: `evidence.cumulative-support.${suffix}.origin`,
    tick,
    kind: "life_context",
    summary: `bounded communication episode ${suffix}`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `bounded communication episode ${suffix}`,
    semanticIntent: {
      kind: "communicate_actor",
      goal: `speak with ${targetActorId}`,
      targetActorId,
      text: `message ${suffix}`,
    },
  });
  kernel.bindRun({
    matterId,
    taskId: `task.cumulative-support.${suffix}`,
    runId,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId,
    tick: tick + 1,
    status: "succeeded",
    summary: `factually delivered communication episode ${suffix}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") throw new Error("history outcome missing");
  kernel.resolveMatter(matterId);
  return { matterId, outcome: reconciled.evidence };
}
