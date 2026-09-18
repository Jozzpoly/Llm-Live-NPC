import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext } from "./cognition-contract";
import { composeResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";

describe("resident life cognition context", () => {
  it("stops presenting legacy local activity as the complete resident-life truth", () => {
    const privateContext = basePrivateContext();
    const life = focusedLifeView();

    const context = composeResidentLifeCognitionContext(privateContext, life);

    expect(context.contract).toBe("resident_life_cognition_v1");
    expect(context.localActivity).toMatchObject({
      kind: "idle",
      reason: "legacy projection says idle",
    });
    expect("currentActivity" in context).toBe(false);
    expect(context.life).toMatchObject({
      body: { focusedRunId: "run.mira.real" },
      matters: [{
        id: "matter.mira.real",
        status: "active",
        semanticCourse: "continue the real resident matter",
        activeRun: {
          runId: "run.mira.real",
          canMutateWorld: true,
          bodyState: "focused",
        },
      }],
    });
  });

  it("clones private and resident-life state instead of creating a mutable alias", () => {
    const privateContext = basePrivateContext();
    const life = focusedLifeView();
    const context = composeResidentLifeCognitionContext(privateContext, life);

    (privateContext.currentActivity as { reason: string }).reason = "mutated source";
    (life.matters[0] as { semanticCourse: string }).semanticCourse = "mutated life source";

    expect(context.localActivity.reason).toBe("legacy projection says idle");
    expect(context.life.matters[0]?.semanticCourse).toBe("continue the real resident matter");
  });
});

function basePrivateContext(): ResidentCognitionContext {
  return {
    version: 1,
    resident: { id: "resident.mira", name: "Mira" },
    tick: 100,
    currentRegionId: "hearth",
    reasons: [{
      id: "reason:addressed",
      tick: 100,
      kind: "heard_speech",
      salience: 0.9,
      summary: "The player addressed Mira.",
      evidenceIds: ["percept:addressed"],
    }],
    currentActivity: {
      id: "activity:mira:legacy-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "legacy projection says idle",
    },
    recentPercepts: [{
      id: "percept:addressed",
      occurrenceId: "occurrence:addressed",
      tick: 100,
      phenomenon: "speech",
      modality: "hearing",
      actorId: "player.jozz",
      subjectId: null,
      spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
      summary: "Jozz addressed Mira.",
      text: "Mira, chwila!",
      addressed: true,
    }],
    concerns: [],
    beliefs: [],
    knownActors: [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: { x: 700, y: 700 },
      lastObservedTick: 95,
      currentlyVisible: false,
      visibilityChangedTick: 96,
      lastHeardDirection: { x: 1, y: 0 },
      lastHeardDistanceBand: "near",
      lastHeardTick: 100,
    }],
    knownRegions: [{
      id: "hearth",
      label: "Hearth",
      knowledge: "visited",
      lastVisitedTick: 90,
    }],
  };
}

function focusedLifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [{
      id: "matter.mira.real",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "continue the real resident matter",
      suspendedByMatterId: null,
      originEvidence: {
        id: "evidence:mira:real",
        tick: 80,
        kind: "life_context",
        summary: "Mira chose this matter earlier.",
      },
      semanticEvidence: {
        id: "evidence:mira:real",
        tick: 80,
        kind: "life_context",
        summary: "Mira chose this matter earlier.",
      },
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.real",
        taskId: "task.mira.real",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: {
      focusedRunId: "run.mira.real",
      deferredRunIds: [],
    },
  };
}
