import { describe, expect, it } from "vitest";
import type { CognitionBatch, ResidentPercept, ResidentProfile } from "./contracts";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentRuntime } from "./resident-runtime";

const profile: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

function addressedSpeech(id: string, tick: number, text = "Mira, chwila!"): ResidentPercept {
  return {
    id: `percept:${id}`,
    occurrenceId: `occurrence:${id}`,
    tick,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "addressed speech",
    text,
    addressed: true,
  };
}

function setup(options: { siblingPressure?: boolean } = {}) {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);
  resident.promoteSemanticPressure({
    id: "reason:test:life-choice:ambiguity",
    tick: 1,
    kind: "uncertainty",
    salience: 0.8,
    summary: "B and C require the same currently-free body.",
    evidenceIds: ["run.mira.b", "run.mira.c"],
  });
  if (options.siblingPressure) {
    resident.promoteSemanticPressure({
      id: "reason:test:life-choice:sibling-outcome",
      tick: 1,
      kind: "activity_completed",
      salience: 0.65,
      summary: "An independent factual outcome also remains unresolved.",
      evidenceIds: ["evidence:test:sibling-outcome"],
    });
  }
  const batch = resident.takeCognitionBatch(31);
  if (!batch) throw new Error("expected exact life-choice cognition batch");
  return { resident, batch, owner: new ResidentLifeChoiceOwner(resident) };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [
      matter("matter.mira.b", "run.mira.b", "continue B"),
      matter("matter.mira.c", "run.mira.c", "continue C"),
    ],
    body: {
      focusedRunId: null,
      deferredRunIds: ["run.mira.b", "run.mira.c"],
    },
  };
}

function matter(id: string, runId: string, semanticCourse: string) {
  const evidence = {
    id: `evidence:choice-origin:${id}`,
    tick: 0,
    kind: "life_context",
    summary: `${id} is an already-grounded continuing resident matter.`,
  };
  return {
    id,
    status: "active" as const,
    semanticRevision: 1,
    semanticCourse,
    suspendedByMatterId: null,
    originEvidence: evidence,
    semanticEvidence: evidence,
    lastOutcomeEvidence: null,
    activeRun: {
      runId,
      taskId: `task:${id}`,
      semanticRevision: 1,
      canMutateWorld: true,
      bodyState: "deferred" as const,
    },
  };
}

function choose(matterId = "matter.mira.b") {
  return {
    version: 1,
    decision: {
      kind: "focus_matter",
      matterId,
      reason: "this matter should receive the free body next",
      supportEvidenceIds: [`evidence:choice-origin:${matterId}`],
      reviewAfterSeconds: 8,
    },
  };
}

function deferAll() {
  return {
    version: 1,
    decision: {
      kind: "defer_all",
      reason: "neither matter should take the body yet",
      reviewAfterSeconds: 3,
    },
  };
}

describe("ResidentLifeChoiceOwner", () => {
  it("freezes truthful private + life context and admits only a real deferred matter", () => {
    const { owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    expect(attempt.candidateMatterIds).toEqual(["matter.mira.b", "matter.mira.c"]);
    expect(attempt.context.contract).toBe("resident_life_cognition_v1");
    expect(attempt.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: ["run.mira.b", "run.mira.c"],
    });
    expect(attempt.context.life.matters.map((entry) => entry.id)).toEqual([
      "matter.mira.b",
      "matter.mira.c",
    ]);

    expect(owner.settle(attempt, choose("matter.mira.c"), life)).toEqual({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: "matter.mira.c",
        reason: "this matter should receive the free body next",
        supportEvidenceIds: ["evidence:choice-origin:matter.mira.c"],
        reviewAfterSeconds: 8,
      },
    });
    expect(owner.state().activeAttemptId).toBeNull();
  });

  it("settles only the exact ambiguity reason and retains independent sibling pressure", () => {
    const { resident, owner, batch } = setup({ siblingPressure: true });
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;

    expect(batch.reasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "reason:test:life-choice:ambiguity" }),
      expect.objectContaining({ id: "reason:test:life-choice:sibling-outcome" }),
    ]));
    expect(attempt.originReasonId).toBe("reason:test:life-choice:ambiguity");

    expect(owner.settle(attempt, choose(), life, 32).status).toBe("applied");

    expect(resident.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ id: "reason:test:life-choice:sibling-outcome" }),
    ]);
    expect(resident.semanticPressureLifecycleSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.objectContaining({ id: "reason:test:life-choice:ambiguity" }),
        status: "settled",
      }),
      expect.objectContaining({
        reason: expect.objectContaining({ id: "reason:test:life-choice:sibling-outcome" }),
        status: "pending",
      }),
    ]));
  });

  it("accepts an explicit defer-all decision without silently choosing a matter", () => {
    const { owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;

    expect(owner.settle(attempt, deferAll(), life, 32)).toEqual({
      status: "applied",
      decision: {
        kind: "defer_all",
        reason: "neither matter should take the body yet",
        reviewAfterSeconds: 3,
      },
    });
    expect(resident.pendingCognitionReasons()).toContainEqual(expect.objectContaining({
      id: attempt.originReasonId,
      kind: "uncertainty",
    }));
    expect(resident.semanticPressureLifecycleSnapshot()).toContainEqual(expect.objectContaining({
      reason: expect.objectContaining({ id: attempt.originReasonId }),
      status: "pending",
    }));
  });

  it("rejects a fabricated matter choice and requeues the causal batch", () => {
    const { resident, owner, batch } = setup();
    const attempt = owner.prepare(batch, lifeView())!;

    expect(owner.settle(attempt, choose("matter.mira.fabricated"), lifeView())).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });
    expect(resident.takeCognitionBatch(91)?.reasons.some((reason) => reason.id === batch.reasons[0]?.id)).toBe(true);
  });

  it("rejects a cloned attempt handle while preserving the real attempt authority", () => {
    const { owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    const cloned = structuredClone(attempt);

    expect(owner.settle(cloned, choose(), life)).toEqual({ status: "rejected", reason: "unknown_attempt" });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    expect(owner.settle(attempt, choose(), life).status).toBe("applied");
  });

  it("makes the old answer stale after newer addressed attention arrives", () => {
    const { resident, owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    resident.ingestPercepts([addressedSpeech("newer", 32, "Mira, jednak zaczekaj!")]);

    expect(owner.settle(attempt, choose(), life)).toEqual({
      status: "stale",
      reason: "newer_addressed_attention",
    });
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(2);
  });

  it("makes the old answer stale after local activity changes", () => {
    const { resident, owner, batch } = setup();
    const life = lifeView();
    const attempt = owner.prepare(batch, life)!;
    resident.setActivity({
      id: "activity:mira:new-local-reality",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "newer local execution state",
    }, 32);

    expect(owner.settle(attempt, choose(), life)).toEqual({
      status: "stale",
      reason: "local_activity_changed_during_request",
    });
  });

  it("makes the old answer stale when the resident-life truth changes during deliberation", () => {
    const { owner, batch } = setup();
    const initial = lifeView();
    const attempt = owner.prepare(batch, initial)!;
    const changed = structuredClone(initial) as ResidentLifeCognitionView;
    (changed.matters[0] as { semanticRevision: number; semanticCourse: string }).semanticRevision = 2;
    (changed.matters[0] as { semanticRevision: number; semanticCourse: string }).semanticCourse = "B was semantically revised while cognition was in flight";

    expect(owner.settle(attempt, choose(), changed)).toEqual({
      status: "stale",
      reason: "resident_life_changed_during_request",
    });
  });

  it("requeues the causal batch when an active choice attempt is abandoned", () => {
    const { resident, owner, batch } = setup();
    const attempt = owner.prepare(batch, lifeView())!;

    expect(owner.abandon(attempt)).toBe(true);
    expect(owner.abandon(attempt)).toBe(false);
    expect(resident.takeCognitionBatch(91)?.reasons.some((reason) => reason.id === batch.reasons[0]?.id)).toBe(true);
  });

  it("refuses to create a semantic choice when the body is occupied or fewer than two legal deferred matters remain", () => {
    const occupied = setup();
    const occupiedLife = lifeView();
    (occupiedLife.body as { focusedRunId: string | null }).focusedRunId = "run.mira.b";
    expect(() => occupied.owner.prepare(occupied.batch, occupiedLife)).toThrow("requires a free coarse body");

    const single = setup();
    const oneMatter = lifeView();
    (oneMatter.matters as unknown as Array<ReturnType<typeof matter>>).splice(1, 1);
    (oneMatter.body.deferredRunIds as string[]).splice(1, 1);
    expect(() => single.owner.prepare(single.batch, oneMatter)).toThrow("requires at least two deferred legal matters");
  });

  it("rejects a projection that omits a deferred run instead of letting cognition choose from an incomplete truth", () => {
    const { owner, batch } = setup();
    const inconsistent = lifeView();
    inconsistent.matters = [
      ...inconsistent.matters,
      {
        ...matter("matter.mira.d", "run.mira.d", "continue D"),
        activeRun: {
          ...matter("matter.mira.d", "run.mira.d", "continue D").activeRun!,
          bodyState: "unfocused",
        },
      },
    ];
    inconsistent.body.deferredRunIds = ["run.mira.b", "run.mira.c", "run.mira.d"];

    expect(() => owner.prepare(batch, inconsistent)).toThrow("omitted deferred run");
  });
});
