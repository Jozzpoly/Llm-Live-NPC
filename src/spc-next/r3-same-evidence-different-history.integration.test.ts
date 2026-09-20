import { describe, expect, it } from "vitest";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import {
  captureResidentLifeCognitionView,
  type ResidentLifeCognitionView,
} from "./resident-life-cognition-view";
import { ResidentMatterRelevanceBridge } from "./resident-matter-relevance-bridge";
import { ResidentRuntime } from "./resident-runtime";

const PROFILE: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

const JANEK_ID = "resident.janek";
const MATTER_ID = "matter.mira.r3.deliver-to-janek";
const RUN_ID = "run.mira.r3.deliver-to-janek";
const TASK_ID = "task.mira.r3.deliver-to-janek";

describe("R3 same evidence / different private history", () => {
  it("gives the same Janek sight evidence different significance only when an open blocked obligation exists", () => {
    const obligated = new ResidentRuntime(PROFILE);
    const ordinary = new ResidentRuntime(PROFILE);
    const obligatedBridge = new ResidentMatterRelevanceBridge(obligated);
    const ordinaryBridge = new ResidentMatterRelevanceBridge(ordinary);

    const history = blockedJanekObligation();
    const noHistory = emptyLife();
    const sight = janekSightEnter(20);

    obligated.ingestPercepts([sight]);
    ordinary.ingestPercepts([sight]);

    // R2 truth is identical: both residents genuinely observe Janek and raw sight is
    // observation-only rather than automatic semantic pressure.
    expect(obligated.semanticPressureDecisions()).toEqual(ordinary.semanticPressureDecisions());
    expect(obligated.semanticPressureDecisions()).toContainEqual(expect.objectContaining({
      evidenceId: sight.id,
      disposition: "observation_only",
      code: "sight_churn",
      cognitionReason: null,
    }));
    expect(obligated.pendingCognitionReasons()).toEqual([]);
    expect(ordinary.pendingCognitionReasons()).toEqual([]);

    const obligatedResult = obligatedBridge.observe(sight, history.life);
    const ordinaryResult = ordinaryBridge.observe(sight, noHistory);

    expect(obligatedResult).toMatchObject({
      status: "promoted",
      matterId: MATTER_ID,
      evidenceId: sight.id,
    });
    expect(ordinaryResult).toEqual({
      status: "not_relevant",
      evidenceId: sight.id,
    });

    const obligatedPressure = obligated.pendingCognitionReasons();
    expect(obligatedPressure).toHaveLength(1);
    expect(obligatedPressure[0]).toMatchObject({
      kind: "uncertainty",
      tick: sight.tick,
      evidenceIds: [
        sight.id,
        MATTER_ID,
        history.outcomeEvidenceId,
      ],
    });
    expect(obligatedPressure[0]?.summary).toContain(JANEK_ID);
    expect(ordinary.pendingCognitionReasons()).toEqual([]);

    // Resident identity, profile and current observation are identical. The only
    // causal differentiator is the prior resident-owned open matter + blocked outcome.
    expect(obligated.profile).toEqual(ordinary.profile);
    expect(history.life.matters).toHaveLength(1);
    expect(noHistory.matters).toEqual([]);
  });

  it("removes matter-derived significance when the obligation becomes terminal and rejects resurrection from the old in-flight batch", () => {
    const resident = new ResidentRuntime(PROFILE);
    const bridge = new ResidentMatterRelevanceBridge(resident);
    const history = blockedJanekObligation();
    const sight = janekSightEnter(20);

    resident.ingestPercepts([sight]);
    const promoted = bridge.observe(sight, history.life);
    expect(promoted.status).toBe("promoted");
    if (promoted.status !== "promoted") return;

    const inFlight = resident.takeCognitionBatch(50);
    expect(inFlight?.reasons).toContainEqual(expect.objectContaining({
      id: promoted.reasonId,
    }));
    if (!inFlight) return;

    history.kernel.resolveMatter(MATTER_ID);
    const terminalLife = captureResidentLifeCognitionView({
      kernel: history.kernel,
      focus: history.focus,
      arbitrator: history.arbitrator,
      matterIds: [MATTER_ID],
    });
    expect(terminalLife.matters[0]).toMatchObject({
      id: MATTER_ID,
      status: "resolved",
    });

    expect(bridge.reconcile(terminalLife, 51)).toEqual({
      invalidatedReasonIds: [promoted.reasonId],
    });
    expect(bridge.activeMatterIds()).toEqual([]);
    expect(resident.pendingCognitionReasons()).toEqual([]);

    // Simulate a late provider/host path returning the old exact batch. The local
    // causal invalidation tombstone must win over that older request lifetime.
    resident.requeueCognitionBatch(inFlight, 52);
    expect(resident.pendingCognitionReasons()).toEqual([]);
    expect(resident.semanticPressureLifecycleEvents()).toContainEqual(expect.objectContaining({
      kind: "settled_requeue_ignored",
      reasonId: promoted.reasonId,
    }));
  });
});

function blockedJanekObligation() {
  const kernel = new ResidentContinuityKernel();
  const origin = kernel.recordEvidence({
    id: "evidence:mira:r3:accepted-janek-obligation",
    tick: 1,
    kind: "accepted_social_commitment",
    summary: "Mira accepted responsibility for delivering the message to Janek.",
  });
  kernel.openMatter({
    id: MATTER_ID,
    originEvidenceId: origin.id,
    semanticCourse: "deliver the already accepted message to Janek",
    semanticIntent: {
      kind: "communicate_actor",
      goal: "deliver the accepted message",
      targetActorId: JANEK_ID,
      text: "The workshop crate has been moved.",
    },
  });
  kernel.bindRun({
    matterId: MATTER_ID,
    taskId: TASK_ID,
    runId: RUN_ID,
  });
  const reconciled = kernel.reconcileRunOutcome({
    runId: RUN_ID,
    tick: 10,
    status: "blocked",
    summary: "recipient absent at best known contact",
  });
  if (reconciled.status !== "recorded") {
    throw new Error("R3 obligation fixture failed to record blocked outcome");
  }

  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  const life = captureResidentLifeCognitionView({
    kernel,
    focus,
    arbitrator,
    matterIds: [MATTER_ID],
  });

  return {
    kernel,
    focus,
    arbitrator,
    life,
    outcomeEvidenceId: reconciled.evidence.id,
  };
}

function emptyLife(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [],
    body: { focusedRunId: null, deferredRunIds: [] },
  };
}

function janekSightEnter(tick: number): ResidentPercept {
  return {
    id: `percept:mira:r3:janek-return:${tick}`,
    occurrenceId: `occurrence:mira:r3:janek-return:${tick}`,
    tick,
    phenomenon: "actor_sight_enter",
    modality: "sight",
    actorId: JANEK_ID,
    subjectId: JANEK_ID,
    spatial: { kind: "exact", position: { x: 500, y: 500 } },
    summary: "Janek enters Mira's sight.",
    text: null,
    addressed: false,
  };
}
