import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContext } from "./spc-next-life-context";

const focusedContext = {
  contract: "resident_life_cognition_v1",
  resident: { id: "resident.mira", name: "Mira" },
  tick: 120,
  currentRegionId: "hearth",
  reasons: [{
    id: "reason:mira:speech:120",
    tick: 120,
    kind: "heard_speech",
    salience: 0.8,
    summary: "Mira heard an addressed request while already travelling",
    evidenceIds: ["percept:speech:120"],
  }],
  localActivity: {
    id: "activity:resident.mira:idle:1",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy local projection is idle",
  },
  recentPercepts: [{
    id: "percept:speech:120",
    occurrenceId: "occurrence:speech:120",
    tick: 120,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "Jozz addressed Mira",
    text: "Mira, sprawdzisz też później pola?",
    addressed: true,
  }],
  concerns: [],
  beliefs: [],
  knownActors: [{
    id: "player.jozz",
    label: "Jozz",
    lastKnownPosition: null,
    lastObservedTick: null,
    currentlyVisible: false,
    visibilityChangedTick: null,
    lastHeardDirection: { x: 1, y: 0 },
    lastHeardDistanceBand: "near",
    lastHeardTick: 120,
  }],
  knownRegions: [
    { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 100 },
    { id: "workshop", label: "Workshop", knowledge: "familiar", lastVisitedTick: null },
    { id: "fields", label: "Fields", knowledge: "familiar", lastVisitedTick: null },
  ],
  life: {
    version: 1,
    matters: [{
      id: "matter.mira.a",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the current hearth errand",
      suspendedByMatterId: null,
      originEvidence: { id: "evidence:a", tick: 80, kind: "accepted_commitment", summary: "Mira accepted A" },
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.a",
        taskId: "task.mira.a",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: "run.mira.a", deferredRunIds: [] },
  },
} as const;

describe("shared SPC Next resident-life context sanitizer", () => {
  it("accepts truthful recovered life even while another exact run owns the body", () => {
    const sanitized = sanitizeSpcNextLifeContext(focusedContext);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.contract).toBe("resident_life_cognition_v1");
    expect(sanitized?.localActivity.kind).toBe("idle");
    expect(sanitized?.life.body).toEqual({ focusedRunId: "run.mira.a", deferredRunIds: [] });
    expect(sanitized?.life.matters[0]?.activeRun).toMatchObject({
      runId: "run.mira.a",
      canMutateWorld: true,
      bodyState: "focused",
    });
  });

  it("preserves bounded structured semantic intent while keeping legacy missing intent readable", () => {
    expect(sanitizeSpcNextLifeContext(focusedContext)?.life.matters[0]?.semanticIntent).toBeNull();

    const structured = structuredClone(focusedContext) as any;
    structured.life.matters[0].semanticIntent = {
      kind: "travel_region",
      goal: "check the familiar fields after the current work",
      targetRegionId: "fields",
    };
    expect(sanitizeSpcNextLifeContext(structured)?.life.matters[0]?.semanticIntent).toEqual({
      kind: "travel_region",
      goal: "check the familiar fields after the current work",
      targetRegionId: "fields",
    });
  });

  it("fails closed on malformed structured intent and execution-method leakage", () => {
    const blankGoal = structuredClone(focusedContext) as any;
    blankGoal.life.matters[0].semanticIntent = {
      kind: "travel_region",
      goal: "   ",
      targetRegionId: "fields",
    };
    expect(sanitizeSpcNextLifeContext(blankGoal)).toBeNull();

    const unknownRegionShape = structuredClone(focusedContext) as any;
    unknownRegionShape.life.matters[0].semanticIntent = {
      kind: "travel_region",
      goal: "check the fields",
      targetRegionId: "fields",
      routeRegionIds: ["hearth", "fields"],
    };
    expect(sanitizeSpcNextLifeContext(unknownRegionShape)).toBeNull();

    const unknownKind = structuredClone(focusedContext) as any;
    unknownKind.life.matters[0].semanticIntent = {
      kind: "teleport_region",
      goal: "appear in the fields",
      targetRegionId: "fields",
    };
    expect(sanitizeSpcNextLifeContext(unknownKind)).toBeNull();
  });

  it("also accepts a free-body deferred set without imposing life-choice policy", () => {
    const deferred = structuredClone(focusedContext) as any;
    deferred.life.matters[0].activeRun.bodyState = "deferred";
    deferred.life.body.focusedRunId = null;
    deferred.life.body.deferredRunIds = ["run.mira.a"];
    expect(sanitizeSpcNextLifeContext(deferred)?.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: ["run.mira.a"],
    });
  });

  it("fails closed on inconsistent execution truth, future evidence, duplicates and extra fields", () => {
    const missingFocused = structuredClone(focusedContext) as any;
    missingFocused.life.body.focusedRunId = "run.mira.hidden";
    expect(sanitizeSpcNextLifeContext(missingFocused)).toBeNull();

    const deferredFocused = structuredClone(focusedContext) as any;
    deferredFocused.life.body.deferredRunIds = ["run.mira.a"];
    expect(sanitizeSpcNextLifeContext(deferredFocused)).toBeNull();

    const futureEvidence = structuredClone(focusedContext) as any;
    futureEvidence.life.matters[0].originEvidence.tick = 121;
    expect(sanitizeSpcNextLifeContext(futureEvidence)).toBeNull();

    const duplicateMatter = structuredClone(focusedContext) as any;
    duplicateMatter.life.matters.push(structuredClone(duplicateMatter.life.matters[0]));
    expect(sanitizeSpcNextLifeContext(duplicateMatter)).toBeNull();

    expect(sanitizeSpcNextLifeContext({ ...focusedContext, hiddenWorldTruth: true })).toBeNull();
  });
});
