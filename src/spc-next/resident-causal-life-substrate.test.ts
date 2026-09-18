import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";

const IDA_ID = "resident.ida";
const PLAYER_ID = "player.jozz";

describe("ResidentCausalLifeSubstrate", () => {
  it("gives one resident one shared continuity/scope across generic causal authorities and life cognition", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const substrate = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation: createFiveResidentNavigationGraph(),
    });

    substrate.kernel.recordEvidence({
      id: "evidence.ida.substrate.seed",
      tick: world.tick,
      kind: "test_origin",
      summary: "one existing Ida life matter",
    });
    const seeded = substrate.kernel.openMatter({
      id: "matter.ida.substrate.seed",
      originEvidenceId: "evidence.ida.substrate.seed",
      semanticCourse: "remember one existing continuing matter",
    });
    substrate.matterScope.track(seeded.id);

    expect(substrate.travelCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.communicateCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.outcomeTravelCommitments.acceptedMatterIds()).toEqual([seeded.id]);
    expect(substrate.currentLifeView().matters).toEqual([
      expect.objectContaining({
        id: seeded.id,
        status: "active",
      }),
    ]);

    const occurrence = world.speak(
      PLAYER_ID,
      "Ida, słyszysz mnie?",
      420,
      [IDA_ID],
    );
    world.step();

    let prepared = substrate.takeReadyLifeIntentAttempt();
    for (let step = 0; step < 180 && !prepared; step += 1) {
      world.step();
      prepared = substrate.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    expect(prepared.attempt.context.life.matters).toContainEqual(expect.objectContaining({
      id: seeded.id,
      status: "active",
    }));
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    // One exact cognition attempt owns admission until it settles or is abandoned.
    expect(substrate.takeReadyLifeIntentAttempt()).toBeNull();
    expect(substrate.lifeIntentOwner.abandon(prepared.attempt)).toBe(true);
  });
  it("reconstructs committed resident life without reviving volatile provider authority", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();

    const original = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });

    original.kernel.recordEvidence({
      id: "evidence.ida.reconstruction.origin",
      tick: world.tick,
      kind: "test_origin",
      summary: "Ida owns a durable reviewed travel matter",
    });
    const matter = original.kernel.openMatter({
      id: "matter.ida.reconstruction",
      originEvidenceId: "evidence.ida.reconstruction.origin",
      semanticCourse: "visit the familiar workshop",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: "workshop",
      },
    });
    original.matterScope.track(matter.id);

    const oldRunId = "run.ida.reconstruction.semantic-1";
    original.kernel.bindRun({
      matterId: matter.id,
      taskId: "task.ida.reconstruction.semantic-1",
      runId: oldRunId,
    });
    const blocked = original.kernel.reconcileRunOutcome({
      runId: oldRunId,
      tick: world.tick,
      status: "blocked",
      summary: "temporary execution blockage before reconstruction",
    });
    expect(blocked.status).toBe("recorded");

    const review = original.kernel.beginSemanticProposal(matter.id);
    const current = original.kernel.matter(matter.id);
    expect(current?.semanticIntent?.kind).toBe("travel_region");
    if (!current?.semanticIntent) throw new Error("reviewed matter lost durable intent");
    expect(original.kernel.commitSemanticProposal(review, {
      semanticCourse: "retry workshop travel after reviewing the factual block",
      semanticIntent: current.semanticIntent,
    })).toMatchObject({
      status: "applied",
      matter: {
        id: matter.id,
        semanticRevision: 2,
        activeRunId: null,
        lastOutcomeSemanticRevision: 1,
      },
    });

    // A provider/semantic proposal that is merely in flight at checkpoint time is
    // volatile authority. Reconstruction must preserve committed life, not revive it.
    const volatileTicket = original.kernel.beginSemanticProposal(matter.id);
    expect(original.kernel.pendingSemanticProposals()).toContainEqual(volatileTicket);

    const snapshot = original.snapshotCommittedLife();

    const restored = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
      snapshot,
    });

    expect(restored.currentLifeView().matters).toContainEqual(expect.objectContaining({
      id: matter.id,
      status: "active",
      semanticRevision: 2,
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: "workshop",
      },
      lastOutcomeEvidence: expect.objectContaining({
        kind: "task_outcome",
        summary: expect.stringContaining("temporary execution blockage"),
      }),
      activeRun: null,
    }));

    expect(restored.kernel.pendingSemanticProposals()).toEqual([]);
    expect(restored.kernel.commitSemanticProposal(volatileTicket, {
      semanticCourse: "stale pre-reconstruction proposal must not apply",
      semanticIntent: current.semanticIntent,
    })).toEqual({
      status: "rejected",
      reason: "semantic_authority_stale",
    });

    // Lifetime run identity uniqueness is committed resident truth too.
    expect(() => restored.kernel.bindRun({
      matterId: matter.id,
      taskId: "task.ida.reconstruction.reuse",
      runId: oldRunId,
    })).toThrow("run identity already used");

    const execution = new ResidentCausalExecutionCoordinator(restored);
    const reactivated = execution.reactivateReviewedMatter(matter.id);
    expect(reactivated).toMatchObject({
      status: "acquired",
      matterId: matter.id,
    });
    if (reactivated.status !== "acquired") return;
    expect(reactivated.runId).toBe("run.ida.reconstruction.semantic-2");
    expect(restored.kernel.canRunMutateWorld(reactivated.runId)).toBe(true);
  });

});
