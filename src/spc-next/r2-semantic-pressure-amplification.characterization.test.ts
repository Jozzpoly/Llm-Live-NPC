import { describe, expect, it } from "vitest";
import {
  createDefaultCognitionScheduler,
} from "./cognition-scheduler";
import {
  DEFAULT_RESIDENT_PROFILE,
  type ResidentPercept,
  type WorldRegion,
} from "./contracts";
import { ResidentRuntime } from "./resident-runtime";

function resident(id = "resident.r2-characterization"): ResidentRuntime {
  return new ResidentRuntime({
    ...DEFAULT_RESIDENT_PROFILE,
    id,
    name: "R2 Characterization",
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

describe("R2 pre-metabolism amplification characterization", () => {
  it("currently turns ambient unaddressed speech into one unresolved scheduler reason per percept", () => {
    const runtime = resident();
    const count = 32;

    for (let index = 0; index < count; index += 1) {
      runtime.ingestPercepts([speechPercept(index, false)], { x: 0, y: 0 });
    }

    expect(runtime.diagnostics().recentPercepts).toHaveLength(count);
    expect(runtime.pendingCognitionReasons()).toHaveLength(count);
    expect(runtime.pendingCognitionReasons()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "heard_speech",
          salience: 0.4,
        }),
      ]),
    );

    const cognitionReasons = runtime.diagnostics().trace.filter(
      (event) => event.kind === "cognition_reason",
    );
    expect(cognitionReasons).toHaveLength(count);
  });

  it("currently mixes one genuinely addressed contact with ambient chatter in the same provider-shaped batch", () => {
    const runtime = resident("resident.r2-batch-characterization");

    for (let index = 0; index < 16; index += 1) {
      runtime.ingestPercepts([speechPercept(index, false)], { x: 0, y: 0 });
    }
    runtime.ingestPercepts([speechPercept(100, true)], { x: 0, y: 0 });

    const before = runtime.pendingCognitionReasons();
    expect(before).toHaveLength(17);
    expect(before.filter((reason) => reason.salience >= 0.85)).toHaveLength(1);

    const batch = runtime.takeCognitionBatch(100);
    expect(batch).not.toBeNull();
    expect(batch?.reasons).toHaveLength(8);
    expect(batch?.reasons[0]).toMatchObject({
      kind: "heard_speech",
      salience: 1,
    });
    expect(batch?.reasons.filter((reason) => reason.salience === 0.4)).toHaveLength(7);
    expect(runtime.pendingCognitionReasons()).toHaveLength(9);
  });

  it("currently promotes ordinary actor sight enter/exit churn into unresolved semantic pressure", () => {
    const runtime = resident("resident.r2-sight-characterization");

    for (let index = 0; index < 12; index += 1) {
      runtime.ingestPercepts([
        sightPercept(index * 2, "actor_sight_enter"),
        sightPercept(index * 2 + 1, "actor_sight_exit"),
      ], { x: 0, y: 0 });
    }

    const pending = runtime.pendingCognitionReasons();
    expect(pending).toHaveLength(24);
    expect(pending.every((reason) => reason.kind === "direct_world_change")).toBe(true);
  });

  it("currently promotes an ordinary authored-region transition without asking whether current life already explains it", () => {
    const runtime = resident("resident.r2-region-characterization");
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
    expect(runtime.pendingCognitionReasons()).toHaveLength(0);

    runtime.syncCurrentRegion(yard, 1, false);

    expect(runtime.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        kind: "direct_world_change",
        summary: "Entered region: Yard",
        evidenceIds: [],
      }),
    ]);
  });

  it("currently fabricates a provider-shaped quiet_review batch from passage of time alone", () => {
    const scheduler = createDefaultCognitionScheduler("resident.r2-quiet-characterization", 0);
    const deadline = scheduler.diagnostics().nextQuietReviewTick;

    expect(scheduler.pendingSnapshot()).toEqual([]);
    expect(scheduler.takeReady(deadline - 1)).toBeNull();

    const batch = scheduler.takeReady(deadline);
    expect(batch).toMatchObject({
      residentId: "resident.r2-quiet-characterization",
      requestedAtTick: deadline,
      reasons: [{
        kind: "quiet_review",
        salience: 0.1,
        evidenceIds: [],
        summary: "Quiet periodic review is due.",
      }],
    });
  });
});
