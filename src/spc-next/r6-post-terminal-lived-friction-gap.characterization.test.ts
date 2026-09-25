import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeMatterScope } from "./resident-life-matter-scope";

const MATTER_ID = "matter.mira.r6.lived-friction";
const RUN_ID = "run.mira.r6.lived-friction";
const OBJECT_ID = "crate.r6.lived-friction";

/**
 * R6 non-obligation personhood characterization.
 *
 * Existing life scope deliberately keeps a terminal matter only while its factual
 * outcome remains in the bounded recent-evidence window. That is correct for R1/R2
 * homeostasis: resolved work must not become an immortal semantic backlog.
 *
 * The next personhood pressure is different. If an earlier factual self-experience
 * should later affect an optional choice/non-action after the original matter is
 * over, current life cognition has no durable causal surface for that experience.
 *
 * This test freezes that current limitation before any new representation is earned.
 */
describe("R6 post-terminal lived-friction gap", () => {
  it("makes an old resolved factual self-outcome unavailable to life cognition after bounded recent evidence churn", () => {
    const history = createHistoryVariant();
    const control = createControlVariant();

    const nearTermHistory = history.view();
    expect(nearTermHistory.matters).toHaveLength(1);
    expect(nearTermHistory.matters[0]).toMatchObject({
      id: MATTER_ID,
      status: "resolved",
      semanticIntent: {
        kind: "acquire_material_object",
        objectId: OBJECT_ID,
      },
      lastOutcomeEvidence: {
        kind: "task_outcome",
        summary: expect.stringContaining("blocked:"),
      },
      activeRun: null,
    });

    // Bounded recent outcome visibility is intentional. It supports immediate
    // reflection without turning every finished episode into permanent pressure.
    history.churnPastRecentWindow();

    const oldHistoryLife = history.view();
    const noHistoryLife = control.view();

    expect(oldHistoryLife).toEqual({
      version: 1,
      matters: [],
      body: {
        focusedRunId: null,
        deferredRunIds: [],
      },
    });
    expect(oldHistoryLife).toEqual(noHistoryLife);

    // The kernel still knows that the historical matter object once existed, but the
    // resident life scope no longer exposes its origin/outcome to higher cognition.
    // Therefore a later optional encounter cannot cite this factual experience as a
    // causal reason unless a new, narrower historical representation is earned.
    expect(history.kernel.matter(MATTER_ID)).toMatchObject({
      status: "resolved",
      lastOutcomeEvidenceId: expect.any(String),
    });
    expect(history.kernel.lastOutcomeEvidence(MATTER_ID)).toBeNull();
    expect(history.scope.matterIds()).toEqual([]);
  });

  it("does not revive the old terminal episode when committed life is reconstructed", () => {
    const history = createHistoryVariant();
    history.churnPastRecentWindow();

    const snapshot = history.kernel.snapshotCommittedState();
    const restoredKernel = new ResidentContinuityKernel({ committedSnapshot: snapshot });
    const restoredScope = new ResidentLifeMatterScope(restoredKernel);
    const restoredFocus = new ResidentExecutionFocusAuthority(restoredKernel);
    const restoredArbitrator = new ResidentExecutionArbitrator(restoredKernel, restoredFocus);

    // Snapshotting the kernel preserves forensic matter identity, but there is no
    // legitimate current life-scope membership to reconstruct for the old episode.
    expect(restoredKernel.matter(MATTER_ID)).toMatchObject({ status: "resolved" });
    expect(restoredKernel.lastOutcomeEvidence(MATTER_ID)).toBeNull();
    expect(captureResidentLifeCognitionView({
      kernel: restoredKernel,
      focus: restoredFocus,
      arbitrator: restoredArbitrator,
      matterIds: restoredScope.matterIds(),
    })).toEqual({
      version: 1,
      matters: [],
      body: {
        focusedRunId: null,
        deferredRunIds: [],
      },
    });
  });
});

function createHistoryVariant() {
  const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 2 });
  const scope = new ResidentLifeMatterScope(kernel);
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  const origin = kernel.recordEvidence({
    id: "evidence:mira:r6:lived-friction-origin",
    tick: 1,
    kind: "life_context",
    summary: "Mira begins one bounded optional attempt involving a familiar crate.",
  });
  kernel.openMatter({
    id: MATTER_ID,
    originEvidenceId: origin.id,
    semanticCourse: "try the bounded optional crate interaction once",
    semanticIntent: {
      kind: "acquire_material_object",
      goal: "try to acquire the familiar crate once",
      objectId: OBJECT_ID,
    },
  });
  scope.track(MATTER_ID);
  kernel.bindRun({
    matterId: MATTER_ID,
    taskId: "task.mira.r6.lived-friction",
    runId: RUN_ID,
  });
  const outcome = kernel.reconcileRunOutcome({
    runId: RUN_ID,
    tick: 2,
    status: "blocked",
    summary: "blocked: the optional crate interaction could not be completed",
  });
  expect(outcome.status).toBe("recorded");
  kernel.resolveMatter(MATTER_ID);

  return {
    kernel,
    scope,
    view: () => captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: scope.matterIds(),
    }),
    churnPastRecentWindow: () => {
      kernel.recordEvidence({
        id: "evidence:mira:r6:later-life-1",
        tick: 3,
        kind: "later_life",
        summary: "A later unrelated factual resident episode occurred.",
      });
      kernel.recordEvidence({
        id: "evidence:mira:r6:later-life-2",
        tick: 4,
        kind: "later_life",
        summary: "Another later unrelated factual resident episode occurred.",
      });
      kernel.recordEvidence({
        id: "evidence:mira:r6:later-life-3",
        tick: 5,
        kind: "later_life",
        summary: "Enough later life occurred to move the old outcome beyond the bounded window.",
      });
    },
  };
}

function createControlVariant() {
  const kernel = new ResidentContinuityKernel({ recentEvidenceLimit: 2 });
  const scope = new ResidentLifeMatterScope(kernel);
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);

  return {
    view: () => captureResidentLifeCognitionView({
      kernel,
      focus,
      arbitrator,
      matterIds: scope.matterIds(),
    }),
  };
}
