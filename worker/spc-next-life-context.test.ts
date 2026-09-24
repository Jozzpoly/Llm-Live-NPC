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

  it("preserves bounded communicate-actor intent without accepting execution leakage", () => {
    const communicate = structuredClone(focusedContext) as any;
    communicate.life.matters[0].semanticIntent = {
      kind: "communicate_actor",
      goal: "find Janek and deliver the accepted message",
      targetActorId: "resident.janek",
      text: "Mira says the field well needs checking before dusk.",
    };
    expect(sanitizeSpcNextLifeContext(communicate)?.life.matters[0]?.semanticIntent).toEqual({
      kind: "communicate_actor",
      goal: "find Janek and deliver the accepted message",
      targetActorId: "resident.janek",
      text: "Mira says the field well needs checking before dusk.",
    });

    const leaked = structuredClone(communicate);
    leaked.life.matters[0].semanticIntent.routeRegionIds = ["hearth", "workshop"];
    expect(sanitizeSpcNextLifeContext(leaked)).toBeNull();

    const blankText = structuredClone(communicate);
    blankText.life.matters[0].semanticIntent.text = " ";
    expect(sanitizeSpcNextLifeContext(blankText)).toBeNull();
  });

  it("preserves bounded standing social commitment history for higher cognition", () => {
    const standing = structuredClone(focusedContext) as any;
    standing.life.matters[0].activeRun = null;
    standing.life.body.focusedRunId = null;
    standing.life.matters[0].semanticCourse =
      "remain available to Nela for a while · Tak, zostanę tu z tobą jeszcze chwilę.";
    standing.life.matters[0].semanticIntent = {
      kind: "standing_social_commitment",
      goal: "remain available to Nela for a while",
      counterpartyActorId: "resident.nela",
      commitment: "Tak, zostanę tu z tobą jeszcze chwilę.",
    };
    standing.life.matters[0].originEvidence = {
      id: "evidence:oren:standing:nela",
      tick: 100,
      kind: "resident_originated_social_commitment",
      summary: "Oren factually promised Nela that he would remain with her for a while.",
      sourceRunId: "run.oren.promise-nela",
    };

    expect(sanitizeSpcNextLifeContext(standing)?.life.matters[0]?.semanticIntent).toEqual({
      kind: "standing_social_commitment",
      goal: "remain available to Nela for a while",
      counterpartyActorId: "resident.nela",
      commitment: "Tak, zostanę tu z tobą jeszcze chwilę.",
    });

    const leaked = structuredClone(standing);
    leaked.life.matters[0].semanticIntent.fulfilled = false;
    expect(sanitizeSpcNextLifeContext(leaked)).toBeNull();

    const blankCommitment = structuredClone(standing);
    blankCommitment.life.matters[0].semanticIntent.commitment = " ";
    expect(sanitizeSpcNextLifeContext(blankCommitment)).toBeNull();

    const malformedCounterparty = structuredClone(standing);
    malformedCounterparty.life.matters[0].semanticIntent.counterpartyActorId = "resident nela";
    expect(sanitizeSpcNextLifeContext(malformedCounterparty)).toBeNull();
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


  it("preserves exact bounded outcome-run provenance and rejects malformed provenance", () => {
    const withOutcome = structuredClone(focusedContext) as any;
    withOutcome.life.matters[0].lastOutcomeEvidence = {
      id: "task-outcome:0123456789abcdef:119",
      tick: 119,
      kind: "task_outcome",
      summary: "succeeded: factual prior run outcome",
      sourceRunId: "run.mira.prior",
    };

    expect(sanitizeSpcNextLifeContext(withOutcome)?.life.matters[0]?.lastOutcomeEvidence)
      .toMatchObject({
        id: "task-outcome:0123456789abcdef:119",
        sourceRunId: "run.mira.prior",
      });

    const malformed = structuredClone(withOutcome);
    malformed.life.matters[0].lastOutcomeEvidence.sourceRunId = "run id with spaces";
    expect(sanitizeSpcNextLifeContext(malformed)).toBeNull();

    const oversized = structuredClone(withOutcome);
    oversized.life.matters[0].lastOutcomeEvidence.sourceRunId = "r".repeat(129);
    expect(sanitizeSpcNextLifeContext(oversized)).toBeNull();
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
  it("accepts bounded authored self-knowledge but rejects malformed or overbroad self context", () => {
    const withSelf = structuredClone(focusedContext) as any;
    withSelf.self = {
      version: 1,
      role: "settlement resident who keeps everyday life connected",
      drives: [
        "maintain useful continuity across familiar places",
        "respond to people actually perceived without inventing their needs",
      ],
    };
    expect(sanitizeSpcNextLifeContext(withSelf)?.self).toEqual(withSelf.self);

    const hiddenTruth = structuredClone(withSelf);
    hiddenTruth.self.hiddenWorldTruth = "the crate is definitely missing";
    expect(sanitizeSpcNextLifeContext(hiddenTruth)).toBeNull();

    const noDrive = structuredClone(withSelf);
    noDrive.self.drives = [];
    expect(sanitizeSpcNextLifeContext(noDrive)).toBeNull();

    const duplicateDrive = structuredClone(withSelf);
    duplicateDrive.self.drives = ["stay useful", "stay useful"];
    expect(sanitizeSpcNextLifeContext(duplicateDrive)).toBeNull();

    const hugeRole = structuredClone(withSelf);
    hugeRole.self.role = "x".repeat(801);
    expect(sanitizeSpcNextLifeContext(hugeRole)).toBeNull();
  });


});
