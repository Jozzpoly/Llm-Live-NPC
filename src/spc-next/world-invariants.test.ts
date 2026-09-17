import { describe, expect, it } from "vitest";
import { ChunkSpatialIndex } from "./chunk-spatial-index";
import type { ResidentActivity } from "./contracts";
import { SpcWorldRuntime } from "./spc-world-runtime";

function world(): SpcWorldRuntime {
  return new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [
      { id: "west", label: "West", minX: 0, minY: 0, maxX: 500, maxY: 1_000 },
      { id: "east", label: "East", minX: 500, minY: 0, maxX: 1_000, maxY: 1_000 },
    ],
    chunkSize: 100,
    fixedDeltaSeconds: 1 / 60,
  });
}

function activity(overrides: Partial<ResidentActivity> = {}): ResidentActivity {
  return {
    id: "activity:test:travel",
    kind: "travel",
    targetActorId: null,
    targetPosition: { x: 600, y: 500 },
    text: null,
    speed: 100,
    reason: "test travel",
    ...overrides,
  };
}

describe("SPC World invariants", () => {
  it("rejects malformed world geometry before any runtime state exists", () => {
    expect(() => new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: Number.NaN, maxY: 100 },
      regions: [], chunkSize: 64, fixedDeltaSeconds: 1 / 60,
    })).toThrow(/bounds/);

    expect(() => new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      regions: [{ id: "bad", label: "Bad", minX: 0, minY: 0, maxX: 101, maxY: 50 }],
      chunkSize: 64, fixedDeltaSeconds: 1 / 60,
    })).toThrow(/outside world bounds/);

    expect(() => new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      regions: [
        { id: "a", label: "A", minX: 0, minY: 0, maxX: 80, maxY: 80 },
        { id: "b", label: "B", minX: 20, minY: 20, maxX: 100, maxY: 100 },
      ],
      chunkSize: 64, fixedDeltaSeconds: 1 / 60,
    })).toThrow(/distinct priority/);
  });

  it("rejects malformed or ambiguous authored sight blockers at World construction", () => {
    const base = {
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      regions: [],
      chunkSize: 32,
      fixedDeltaSeconds: 1 / 60,
    } as const;

    expect(() => new SpcWorldRuntime({
      ...base,
      sightBlockers: [{ id: "wall", label: "Wall", bounds: { minX: 10, minY: 10, maxX: Number.NaN, maxY: 20 } }],
    })).toThrow(/finite/);
    expect(() => new SpcWorldRuntime({
      ...base,
      sightBlockers: [{ id: "wall", label: "Wall", bounds: { minX: 10, minY: 10, maxX: 10, maxY: 20 } }],
    })).toThrow(/positive area/);
    expect(() => new SpcWorldRuntime({
      ...base,
      sightBlockers: [{ id: "wall", label: "Wall", bounds: { minX: 10, minY: 10, maxX: 101, maxY: 20 } }],
    })).toThrow(/outside world bounds/);
    expect(() => new SpcWorldRuntime({
      ...base,
      sightBlockers: [
        { id: "wall", label: "Wall A", bounds: { minX: 10, minY: 10, maxX: 20, maxY: 20 } },
        { id: "wall", label: "Wall B", bounds: { minX: 30, minY: 30, maxX: 40, maxY: 40 } },
      ],
    })).toThrow(/duplicate sight blocker/);

    expect(() => new SpcWorldRuntime({
      ...base,
      sightBlockers: [
        { id: "wall.a", label: "Wall A", bounds: { minX: 10, minY: 10, maxX: 30, maxY: 30 } },
        { id: "wall.b", label: "Wall B", bounds: { minX: 20, minY: 20, maxX: 40, maxY: 40 } },
      ],
    })).not.toThrow();
  });

  it("makes authored overlap precedence explicit and shared boundaries half-open", () => {
    const overlapping = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
      regions: [
        { id: "base", label: "Base", minX: 0, minY: 0, maxX: 100, maxY: 100, priority: 0 },
        { id: "square", label: "Square", minX: 20, minY: 20, maxX: 80, maxY: 80, priority: 10 },
      ],
      chunkSize: 32, fixedDeltaSeconds: 1 / 60,
    });
    expect(overlapping.regionAt({ x: 50, y: 50 })?.id).toBe("square");

    const split = world();
    expect(split.regionAt({ x: 499.999, y: 500 })?.id).toBe("west");
    expect(split.regionAt({ x: 500, y: 500 })?.id).toBe("east");
    expect(split.regionAt({ x: 1_000, y: 1_000 })?.id).toBe("east");
  });

  it("rejects poisoned actor/profile values and keeps controller intent separate from physical state", () => {
    const runtime = world();
    expect(() => runtime.addPlayer("player.bad", { x: Number.NaN, y: 10 })).toThrow(/finite/);
    expect(() => runtime.addPlayer("player.bad", { x: 10, y: 10 }, { sightRadius: -1 })).toThrow(/non-negative/);
    expect(() => runtime.addResident("resident.bad", "Bad", { x: 10, y: 10 }, { memoryLimit: 0 })).toThrow(/positive integer/);

    runtime.addPlayer("player.good", { x: 100, y: 100 }, { maxSpeed: 50 });
    expect(() => runtime.setActorMotionIntent("player.good", { x: Number.POSITIVE_INFINITY, y: 0 })).toThrow(/finite/);
    runtime.setActorMotionIntent("player.good", { x: 100, y: 0 });
    expect(runtime.publicSnapshot().actors.find((actor) => actor.id === "player.good")?.velocity).toEqual({ x: 0, y: 0 });
    runtime.step();
    const physical = runtime.publicSnapshot().actors.find((actor) => actor.id === "player.good")!.velocity;
    expect(physical.x).toBeCloseTo(50, 8);
    expect(physical.y).toBeCloseTo(0, 8);
  });

  it("rejects malformed World occurrences at the authority boundary", () => {
    const runtime = world();
    runtime.addPlayer("player.jozz", { x: 100, y: 100 });
    expect(() => runtime.speak("player.jozz", "", 100)).toThrow(/non-empty/);
    expect(() => runtime.speak("player.jozz", "hej", Number.NaN)).toThrow(/finite/);
    expect(() => runtime.emitInteraction("player.jozz", "item.hammer", "", 100)).toThrow(/non-empty/);
    expect(() => runtime.emitInteraction("player.jozz", "item.hammer", "uses hammer", -1)).toThrow(/non-negative/);
  });

  it("rejects semantically impossible resident activities before they reach the live brain", () => {
    const runtime = world();
    runtime.addPlayer("player.jozz", { x: 100, y: 100 });
    runtime.addResident("resident.mira", "Mira", { x: 200, y: 200 });

    expect(() => runtime.setResidentActivity("resident.mira", activity({ targetPosition: null }))).toThrow(/requires one position target/);
    expect(() => runtime.setResidentActivity("resident.mira", activity({ targetPosition: { x: 2_000, y: 500 } }))).toThrow(/outside world/);
    expect(() => runtime.setResidentActivity("resident.mira", activity({
      kind: "follow", targetActorId: "resident.missing", targetPosition: null,
    }))).toThrow(/does not exist/);
    expect(() => runtime.setResidentActivity("resident.mira", activity({ speed: Number.NaN }))).toThrow(/finite/);

    runtime.setResidentActivity("resident.mira", activity());
    expect(runtime.residentDiagnostics("resident.mira").publicState.activity.kind).toBe("travel");
  });

  it("keeps the spatial index deterministic regardless of insertion order", () => {
    const first = new ChunkSpatialIndex(100);
    first.upsert("actor.b", { x: 20, y: 20 });
    first.upsert("actor.a", { x: 10, y: 10 });

    const second = new ChunkSpatialIndex(100);
    second.upsert("actor.a", { x: 10, y: 10 });
    second.upsert("actor.b", { x: 20, y: 20 });

    expect(first.queryRadius({ x: 0, y: 0 }, 100)).toEqual(["actor.a", "actor.b"]);
    expect(second.queryRadius({ x: 0, y: 0 }, 100)).toEqual(["actor.a", "actor.b"]);
    expect(() => first.upsert("actor.nan", { x: Number.NaN, y: 0 })).toThrow(/finite/);
  });

  it("uses no fabricated direction when speaker and listener occupy the same point", () => {
    const runtime = world();
    runtime.addPlayer("player.jozz", { x: 100, y: 100 });
    runtime.addResident("resident.mira", "Mira", { x: 100, y: 100 });
    runtime.speak("player.jozz", "hej", 100, ["resident.mira"]);
    runtime.step();

    const speech = runtime.residentDiagnostics("resident.mira").recentPercepts.find((percept) => percept.text === "hej");
    expect(speech?.modality).toBe("hearing");
    expect(speech?.spatial).toEqual({ kind: "none" });
  });
});
