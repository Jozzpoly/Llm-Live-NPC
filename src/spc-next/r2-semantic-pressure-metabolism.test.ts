import { describe, expect, it } from "vitest";
import { createDefaultCognitionScheduler } from "./cognition-scheduler";
import {
  DEFAULT_RESIDENT_PROFILE,
  type ResidentPercept,
  type WorldRegion,
} from "./contracts";
import { ResidentRuntime } from "./resident-runtime";

function resident(id = "resident.r2-metabolism"): ResidentRuntime {
  return new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id,
    name: "R2 Metabolism",
  });
}

function speechPercept(index: number, addressed = false): ResidentPercept {
  return {
    id: `percept:r2:speech:${index}`,
    occurrenceId: `occurrence:r2:speech:${index}`,
    tick: index,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "actor.ambient-speaker",
    subjectId: null,
    spatial: {
      kind: "directional",
      direction: { x: 1, y: 0 },
      distanceBand: "mid",
    },
    summary: "speech",
    text: addressed ? "Hej, to do ciebie." : `ambient line ${index}`,
    addressed,
  };
}

function sightPercept(
  index: number,
  phenomenon: "actor_sight_enter" | "actor_sight_exit",
): ResidentPercept {
  return {
    id: `percept:r2:sight:${index}`,
    occurrenceId: `sight:${phenomenon}:unknown:${index}`,
    tick: index,
    phenomenon,
    modality: "sight",
    actorId: "actor.passerby",
    subjectId: "actor.passerby",
    spatial: phenomenon === "actor_sight_enter"
      ? { kind: "exact", position: { x: 20 + index, y: 10 } }
      : { kind: "none" },
    summary: phenomenon === "actor_sight_enter"
      ? "An actor entered sight."
      : "An actor left sight.",
    text: null,
    addressed: false,
  };
}

describe("R2 first semantic-pressure metabolism boundary", () => {
  it("keeps high-volume ambient speech as true private observation without unresolved scheduler amplification", () => {
    const runtime = resident();
    const count = 32;

    for (let index = 0; index < count; index += 1) {
      runtime.ingestPercepts([speechPercept(index, false)], { x: 0, y: 0 });
    }

    expect(runtime.diagnostics().recentPercepts).toHaveLength(count);
    expect(runtime.pendingCognitionReasons()).toEqual([]);

    const decisions = runtime.semanticPressureDecisions();
    expect(decisions).toHaveLength(count);
    expect(decisions.every((decision) =>
      decision.disposition === "observation_only"
      && decision.code === "ambient_speech"
      && decision.cognitionReason === null
    )).toBe(true);
  });

  it("keeps repeated overheard speech from one privately recognized actor as social evidence until relevance is established", () => {
    const runtime = resident("resident.r2-known-social");

    // Recognition is earned through sight first. Hearing does not acquire identity by itself.
    runtime.ingestPercepts([{
      id: "percept:r2:known-social:sight",
      occurrenceId: "sight:actor_sight_enter:actor.ambient-speaker:0",
      tick: 0,
      phenomenon: "actor_sight_enter",
      modality: "sight",
      actorId: "actor.ambient-speaker",
      subjectId: "actor.ambient-speaker",
      spatial: { kind: "exact", position: { x: 12, y: 4 } },
      summary: "Known actor entered sight.",
      text: null,
      addressed: false,
    }], { x: 0, y: 0 });

    for (let index = 1; index <= 8; index += 1) {
      runtime.ingestPercepts([speechPercept(index, false)], { x: 0, y: 0 });
    }

    expect(runtime.pendingCognitionReasons()).toEqual([]);
    const socialDecisions = runtime.semanticPressureDecisions().filter(
      (decision) => decision.code === "known_social_speech",
    );
    expect(socialDecisions).toHaveLength(8);
    expect(socialDecisions.every((decision) =>
      decision.disposition === "observation_only"
      && decision.cognitionReason === null
    )).toBe(true);

    // A separate resident-relative relevance layer may still promote exact private
    // evidence later. Identity alone is no longer that policy.
    const latest = socialDecisions.at(-1)!;
    runtime.promoteSemanticPressure({
      id: "reason:resident.r2-known-social:explicit-relevance",
      tick: latest.tick,
      kind: "heard_speech",
      salience: 0.7,
      summary: "Explicit fixture relevance: this overheard statement affects an active resident concern.",
      evidenceIds: [latest.evidenceId!],
    });
    expect(runtime.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        id: "reason:resident.r2-known-social:explicit-relevance",
        evidenceIds: [latest.evidenceId],
      }),
    ]);
  });

  it("keeps addressed speech as one explicit unresolved issue while ambient chatter remains observation-only", () => {
    const runtime = resident("resident.r2-addressed");

    for (let index = 0; index < 16; index += 1) {
      runtime.ingestPercepts([speechPercept(index, false)], { x: 0, y: 0 });
    }
    runtime.ingestPercepts([speechPercept(100, true)], { x: 0, y: 0 });

    expect(runtime.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        kind: "heard_speech",
        salience: 1,
        evidenceIds: ["percept:r2:speech:100"],
      }),
    ]);

    const batch = runtime.takeCognitionBatch(100);
    expect(batch?.reasons).toEqual([
      expect.objectContaining({
        kind: "heard_speech",
        salience: 1,
      }),
    ]);
    expect(runtime.pendingCognitionReasons()).toEqual([]);

    const decisions = runtime.semanticPressureDecisions();
    expect(decisions.filter((decision) => decision.disposition === "unresolved")).toHaveLength(1);
    expect(decisions.at(-1)).toMatchObject({
      disposition: "unresolved",
      code: "addressed_speech",
    });
  });

  it("keeps ordinary actor visibility churn as observation instead of unresolved semantic work", () => {
    const runtime = resident("resident.r2-sight");

    for (let index = 0; index < 12; index += 1) {
      runtime.ingestPercepts([
        sightPercept(index * 2, "actor_sight_enter"),
        sightPercept(index * 2 + 1, "actor_sight_exit"),
      ], { x: 0, y: 0 });
    }

    expect(runtime.pendingCognitionReasons()).toEqual([]);
    expect(runtime.semanticPressureDecisions()).toHaveLength(24);
    expect(runtime.semanticPressureDecisions().every((decision) =>
      decision.disposition === "observation_only"
      && decision.code === "actor_visibility"
    )).toBe(true);
  });

  it("keeps ordinary authored-region transitions local until a discrepancy mechanism says otherwise", () => {
    const runtime = resident("resident.r2-region");
    const workshop: WorldRegion = {
      id: "workshop",
      label: "Workshop",
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
    };
    const yard: WorldRegion = {
      id: "yard",
      label: "Yard",
      minX: 100,
      minY: 0,
      maxX: 200,
      maxY: 100,
    };

    runtime.syncCurrentRegion(workshop, 0, true);
    runtime.syncCurrentRegion(yard, 1, false);

    expect(runtime.pendingCognitionReasons()).toEqual([]);
    expect(runtime.semanticPressureDecisions()).toEqual([
      expect.objectContaining({
        disposition: "observation_only",
        code: "region_transition",
        cognitionReason: null,
      }),
    ]);
  });

  it("keeps observed interaction/system change as evidence until resident-relative relevance is explicitly established", () => {
    const runtime = resident("resident.r2-world-change");
    const percept: ResidentPercept = {
      id: "percept:r2:system:1",
      occurrenceId: "occurrence:r2:system:1",
      tick: 5,
      phenomenon: "system",
      modality: "sight",
      actorId: null,
      subjectId: "door.workshop",
      spatial: { kind: "exact", position: { x: 50, y: 50 } },
      summary: "The workshop door state changed.",
      text: null,
      addressed: false,
    };

    runtime.ingestPercepts([percept], { x: 0, y: 0 });

    expect(runtime.pendingCognitionReasons()).toEqual([]);
    expect(runtime.semanticPressureDecisions()).toEqual([
      expect.objectContaining({
        disposition: "observation_only",
        code: "world_change",
        cognitionReason: null,
      }),
    ]);

    runtime.promoteSemanticPressure({
      id: "reason:resident.r2-world-change:door-blocks-own-matter",
      tick: percept.tick,
      kind: "direct_world_change",
      salience: 0.8,
      summary: "Explicit fixture relevance: the changed door conflicts with my active route/matter.",
      evidenceIds: [percept.id],
    });

    expect(runtime.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        id: "reason:resident.r2-world-change:door-blocks-own-matter",
        kind: "direct_world_change",
        evidenceIds: [percept.id],
      }),
    ]);
  });

  it("does not fabricate semantic cognition from a quiet timer with no unresolved pressure", () => {
    const scheduler = createDefaultCognitionScheduler("resident.r2-quiet", 0);
    const deadline = scheduler.diagnostics().nextQuietReviewTick;

    expect(scheduler.pendingSnapshot()).toEqual([]);
    expect(scheduler.takeReady(deadline - 1)).toBeNull();
    expect(scheduler.takeReady(deadline)).toBeNull();
    expect(scheduler.takeReady(deadline + 10_000)).toBeNull();
    expect(scheduler.diagnostics()).toMatchObject({
      pendingCount: 0,
      lastRequestTick: null,
    });
  });
});
