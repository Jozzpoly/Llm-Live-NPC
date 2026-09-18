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
    expect(original.releaseWorldExecutionAuthority()).toBe(true);
    expect(() => original.worldAuthority.motionOwner()).toThrow("resident World execution authority is released");

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
    const freshTicket = restored.kernel.beginSemanticProposal(matter.id);
    expect(freshTicket.attemptId).not.toBe(volatileTicket.attemptId);
    expect(restored.kernel.abandonSemanticProposal(freshTicket).status).toBe("abandoned");

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

  it("reconstructs one focused active travel run and resumes the same exact run from current World state", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();
    const substrate = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });

    expect(ida.cognitionContext({
      residentId: IDA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownRegions.map((region) => region.id)).toContain("workshop");

    substrate.kernel.recordEvidence({
      id: "evidence.ida.active-snapshot",
      tick: world.tick,
      kind: "test_origin",
      summary: "Ida is already executing one durable workshop matter",
    });
    const matter = substrate.kernel.openMatter({
      id: "matter.ida.active-snapshot",
      originEvidenceId: "evidence.ida.active-snapshot",
      semanticCourse: "continue active travel to the familiar workshop",
      semanticIntent: {
        kind: "travel_region",
        goal: "visit the familiar workshop",
        targetRegionId: "workshop",
      },
    });
    substrate.matterScope.track(matter.id);
    const runId = "run.ida.active-snapshot.semantic-1";
    substrate.kernel.bindRun({
      matterId: matter.id,
      taskId: "task.ida.active-snapshot.semantic-1",
      runId,
    });
    expect(substrate.arbitrator.request(runId)).toEqual({ status: "acquired", runId });

    const before = world.publicSnapshot().actors.find((actor) => actor.id === IDA_ID)?.position;
    if (!before) throw new Error("Ida missing before active snapshot");
    const execution = new ResidentCausalExecutionCoordinator(substrate);
    expect(execution.stepFocusedRun()).toMatchObject({
      status: "running",
      matterId: matter.id,
      runId,
      intentKind: "travel_region",
    });
    world.step(5);
    const mid = world.publicSnapshot().actors.find((actor) => actor.id === IDA_ID)?.position;
    if (!mid) throw new Error("Ida missing at active snapshot");
    expect(mid.x).toBeLessThan(before.x);

    const snapshot = substrate.snapshotCommittedLife();
    expect(substrate.releaseWorldExecutionAuthority()).toBe(true);

    const restored = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
      snapshot,
    });
    expect(restored.focus.focusedRun()).toBe(runId);
    expect(restored.kernel.canRunMutateWorld(runId)).toBe(true);
    expect(restored.currentLifeView().matters).toContainEqual(expect.objectContaining({
      id: matter.id,
      status: "active",
      activeRun: expect.objectContaining({
        runId,
        bodyState: "focused",
        canMutateWorld: true,
      }),
    }));

    const resumedExecution = new ResidentCausalExecutionCoordinator(restored);
    let terminal: ReturnType<typeof resumedExecution.stepFocusedRun> | null = null;
    for (let step = 0; step < 2_000; step += 1) {
      const local = resumedExecution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      terminal = local;
      break;
    }

    expect(terminal).toMatchObject({
      status: "completed",
      matterId: matter.id,
      runId,
      outcomeEvidence: {
        kind: "task_outcome",
        summary: expect.stringContaining("workshop"),
      },
    });
    expect(restored.kernel.matter(matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });

  it("rejects tampered resident, namespace and matter-scope snapshots before World authority claim", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const navigation = createFiveResidentNavigationGraph();
    const original = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: composition.runtimes[IDA_ID],
      world,
      navigation,
      identityNamespace: "ida-reconstruction",
    });

    original.kernel.recordEvidence({
      id: "evidence.ida.snapshot-integrity",
      tick: world.tick,
      kind: "test_origin",
      summary: "snapshot integrity seed",
    });
    const matter = original.kernel.openMatter({
      id: "matter.ida.snapshot-integrity",
      originEvidenceId: "evidence.ida.snapshot-integrity",
      semanticCourse: "preserve snapshot integrity",
    });
    original.matterScope.track(matter.id);

    const snapshot = original.snapshotCommittedLife();
    expect(original.releaseWorldExecutionAuthority()).toBe(true);

    expect(() => new ResidentCausalLifeSubstrate({
      residentId: "resident.mira",
      resident: composition.runtimes["resident.mira"],
      world,
      navigation,
      snapshot,
    })).toThrow("resident causal life snapshot belongs to another resident");

    expect(() => new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: composition.runtimes[IDA_ID],
      world,
      navigation,
      identityNamespace: "different-namespace",
      snapshot,
    })).toThrow("resident causal life snapshot identity namespace mismatch");

    const phantomScope = structuredClone(snapshot);
    phantomScope.matterIds = [...phantomScope.matterIds, "matter.ida.phantom"];
    expect(() => new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: composition.runtimes[IDA_ID],
      world,
      navigation,
      snapshot: phantomScope,
    })).toThrow("unknown resident life matter: matter.ida.phantom");

    // Failed restore attempts above must not have claimed the resident's World lease.
    const restored = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: composition.runtimes[IDA_ID],
      world,
      navigation,
      snapshot,
    });
    expect(restored.currentLifeView().matters).toContainEqual(expect.objectContaining({
      id: matter.id,
      status: "active",
    }));
  });

  it("reconstructs unresolved deferred B/C without inventing a winner", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();
    const substrate = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });

    const seed = (id: string, targetRegionId: "hearth" | "workshop" | "fields") => {
      const evidence = substrate.kernel.recordEvidence({
        id: `evidence.ida.restore-choice.${id}`,
        tick: world.tick,
        kind: "test_origin",
        summary: `durable matter ${id}`,
      });
      const matter = substrate.kernel.openMatter({
        id: `matter.ida.restore-choice.${id}`,
        originEvidenceId: evidence.id,
        semanticCourse: `continue ${id}`,
        semanticIntent: {
          kind: "travel_region",
          goal: `visit ${targetRegionId}`,
          targetRegionId,
        },
      });
      substrate.matterScope.track(matter.id);
      const runId = `run.ida.restore-choice.${id}.semantic-1`;
      substrate.kernel.bindRun({
        matterId: matter.id,
        taskId: `task.ida.restore-choice.${id}.semantic-1`,
        runId,
      });
      return { matter, runId };
    };

    const a = seed("a", "workshop");
    const b = seed("b", "hearth");
    const cMatter = seed("c", "fields");

    expect(substrate.arbitrator.request(a.runId)).toEqual({ status: "acquired", runId: a.runId });
    expect(substrate.arbitrator.request(b.runId)).toMatchObject({ status: "busy", runId: b.runId });
    expect(substrate.arbitrator.request(cMatter.runId)).toMatchObject({ status: "busy", runId: cMatter.runId });

    const aOutcome = substrate.kernel.reconcileRunOutcome({
      runId: a.runId,
      tick: world.tick,
      status: "succeeded",
      summary: "A completed before snapshot",
    });
    expect(aOutcome.status).toBe("recorded");
    substrate.kernel.resolveMatter(a.matter.id);

    const candidates = [b.runId, cMatter.runId].sort((left, right) => left.localeCompare(right));
    expect(substrate.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: candidates,
    });
    expect(substrate.focus.focusedRun()).toBeNull();

    const snapshot = substrate.snapshotCommittedLife();
    expect(snapshot.execution).toEqual({
      focusedRunId: null,
      deferredRunIds: candidates,
    });
    expect(substrate.releaseWorldExecutionAuthority()).toBe(true);

    const restored = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
      snapshot,
    });

    expect(restored.focus.focusedRun()).toBeNull();
    expect(restored.arbitrator.deferredRunIds()).toEqual(candidates);
    expect(restored.arbitrator.reconcile()).toEqual({
      status: "choice_required",
      candidateRunIds: candidates,
    });
    expect(restored.focus.focusedRun()).toBeNull();
    expect(restored.kernel.canRunMutateWorld(b.runId)).toBe(true);
    expect(restored.kernel.canRunMutateWorld(cMatter.runId)).toBe(true);
  });

  it("reconstructs an active interruption and exact-returns the suspended run before unrelated deferred work", () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 3_000, y: 900 },
    });
    const { world } = composition;
    const ida = composition.runtimes[IDA_ID];
    const navigation = createFiveResidentNavigationGraph();
    const life = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
    });

    const seed = (
      id: string,
      targetRegionId: "hearth" | "workshop" | "fields",
    ) => {
      const origin = life.kernel.recordEvidence({
        id: `evidence.ida.restore-interrupt.${id}`,
        tick: world.tick,
        kind: "test_origin",
        summary: `interruption reconstruction matter ${id}`,
      });
      const matter = life.kernel.openMatter({
        id: `matter.ida.restore-interrupt.${id}`,
        originEvidenceId: origin.id,
        semanticCourse: `continue ${id}`,
        semanticIntent: {
          kind: "travel_region",
          goal: `visit ${targetRegionId}`,
          targetRegionId,
        },
      });
      life.matterScope.track(matter.id);
      const runId = `run.ida.restore-interrupt.${id}.semantic-1`;
      life.kernel.bindRun({
        matterId: matter.id,
        taskId: `task.ida.restore-interrupt.${id}.semantic-1`,
        runId,
      });
      return { matter, runId };
    };

    const main = seed("main", "workshop");
    const later = seed("later", "hearth");
    const interrupt = seed("interrupt", "fields");

    expect(life.arbitrator.request(main.runId)).toEqual({
      status: "acquired",
      runId: main.runId,
    });
    expect(life.arbitrator.request(later.runId)).toMatchObject({
      status: "busy",
      runId: later.runId,
      focusedRunId: main.runId,
    });

    life.kernel.suspendMatter(main.matter.id, interrupt.matter.id);
    expect(life.kernel.canRunMutateWorld(main.runId)).toBe(false);
    expect(life.arbitrator.claimInterruption(interrupt.runId)).toEqual({
      status: "acquired",
      runId: interrupt.runId,
    });
    expect(life.focus.focusedRun()).toBe(interrupt.runId);
    expect(life.arbitrator.deferredRunIds()).toEqual([later.runId]);

    const execution = new ResidentCausalExecutionCoordinator(life);
    expect(execution.stepFocusedRun()).toMatchObject({
      status: "running",
      matterId: interrupt.matter.id,
      runId: interrupt.runId,
    });
    world.step(5);

    const snapshot = life.snapshotCommittedLife();
    expect(snapshot.execution).toEqual({
      focusedRunId: interrupt.runId,
      deferredRunIds: [later.runId],
    });
    expect(life.releaseWorldExecutionAuthority()).toBe(true);

    const restored = new ResidentCausalLifeSubstrate({
      residentId: IDA_ID,
      resident: ida,
      world,
      navigation,
      snapshot,
    });
    expect(restored.kernel.matter(main.matter.id)).toMatchObject({
      status: "suspended",
      suspendedByMatterId: interrupt.matter.id,
      activeRunId: main.runId,
    });
    expect(restored.focus.focusedRun()).toBe(interrupt.runId);
    expect(restored.arbitrator.deferredRunIds()).toEqual([later.runId]);

    const resumedExecution = new ResidentCausalExecutionCoordinator(restored);
    let terminal: ReturnType<typeof resumedExecution.stepFocusedRun> | null = null;
    for (let step = 0; step < 2_000; step += 1) {
      const local = resumedExecution.stepFocusedRun();
      if (local.status === "running") {
        world.step();
        continue;
      }
      terminal = local;
      break;
    }

    expect(terminal).toMatchObject({
      status: "completed",
      matterId: interrupt.matter.id,
      runId: interrupt.runId,
      outcomeEvidence: { kind: "task_outcome" },
    });

    // Terminal interruption must exact-return continuity before ordinary deferred
    // work can acquire the free body.
    expect(restored.kernel.matter(main.matter.id)).toMatchObject({
      status: "active",
      suspendedByMatterId: null,
      activeRunId: main.runId,
    });
    expect(restored.focus.focusedRun()).toBe(main.runId);
    expect(restored.kernel.canRunMutateWorld(main.runId)).toBe(true);
    expect(restored.arbitrator.deferredRunIds()).toEqual([later.runId]);
    expect(terminal).toMatchObject({
      arbitration: {
        status: "focused",
        runId: main.runId,
        deferredRunIds: [later.runId],
      },
    });
  });

});
