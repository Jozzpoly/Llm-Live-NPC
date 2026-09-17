import { describe, expect, it } from "vitest";
import type { ResidentPercept } from "./contracts";
import { resolveResidentPerceptIdentity } from "./resident-percept-identity";

function hearing(): ResidentPercept {
  return {
    id: "percept:heard",
    occurrenceId: "occurrence:speech",
    tick: 10,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "mid" },
    summary: "speech",
    text: "hej",
    addressed: false,
  };
}

function sight(phenomenon: "actor_sight_enter" | "actor_sight_update" | "actor_sight_exit" = "actor_sight_enter"): ResidentPercept {
  return {
    id: `percept:${phenomenon}`,
    occurrenceId: `sight:${phenomenon}`,
    tick: 11,
    phenomenon,
    modality: "sight",
    actorId: null,
    subjectId: null,
    spatial: phenomenon === "actor_sight_exit"
      ? { kind: "none" }
      : { kind: "exact", position: { x: 100, y: 50 } },
    summary: "actor sight transition",
    text: null,
    addressed: false,
  };
}

describe("resident percept identity boundary", () => {
  it("keeps an unknown heard voice anonymous even though World knows the physical source actor", () => {
    const safe = resolveResidentPerceptIdentity(
      { percept: hearing(), sourceActorId: "player.jozz" },
      () => false,
    );

    expect(safe.actorId).toBeNull();
    expect(safe.spatial).toEqual({ kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "mid" });
    expect(JSON.stringify(safe)).not.toContain("player.jozz");
  });

  it("may recognize a heard voice only from identity already acquired elsewhere", () => {
    const safe = resolveResidentPerceptIdentity(
      { percept: hearing(), sourceActorId: "player.jozz" },
      (actorId) => actorId === "player.jozz",
    );

    expect(safe.actorId).toBe("player.jozz");
  });

  it("uses the current explicit visual-recognition policy to acquire actor identity from sight", () => {
    const safe = resolveResidentPerceptIdentity(
      { percept: sight(), sourceActorId: "resident.janek" },
      () => false,
    );

    expect(safe.actorId).toBe("resident.janek");
    expect(safe.subjectId).toBe("resident.janek");
  });

  it("preserves recognition on sight exit without leaking a hidden position", () => {
    const safe = resolveResidentPerceptIdentity(
      { percept: sight("actor_sight_exit"), sourceActorId: "resident.janek" },
      () => true,
    );

    expect(safe.actorId).toBe("resident.janek");
    expect(safe.subjectId).toBe("resident.janek");
    expect(safe.spatial).toEqual({ kind: "none" });
  });

  it("preserves non-actor interaction subject provenance while resolving performer identity separately", () => {
    const percept: ResidentPercept = {
      id: "percept:interaction",
      occurrenceId: "occurrence:interaction",
      tick: 12,
      phenomenon: "interaction",
      modality: "sight",
      actorId: null,
      subjectId: "item.hammer",
      spatial: { kind: "exact", position: { x: 80, y: 40 } },
      summary: "interaction",
      text: null,
      addressed: false,
    };

    const safe = resolveResidentPerceptIdentity(
      { percept, sourceActorId: "resident.janek" },
      () => false,
    );
    expect(safe.actorId).toBe("resident.janek");
    expect(safe.subjectId).toBe("item.hammer");
  });

  it("rejects an ingress that already smuggled resident identity into the supposedly physical-only boundary", () => {
    const percept = hearing();
    percept.actorId = "player.jozz";

    expect(() => resolveResidentPerceptIdentity(
      { percept, sourceActorId: "player.jozz" },
      () => false,
    )).toThrow("must not pre-populate resident actor identity");
  });
});
