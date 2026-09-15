import { describe, expect, it } from "vitest";
import { CognitionGrounder } from "./cognition-grounder";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { ResidentCognitionOwner } from "./resident-cognition-owner";
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

function speech(id: string, tick: number, addressed: boolean, text = "Mira, odpowiedz"): ResidentPercept {
  return {
    id: `percept:${id}`,
    occurrenceId: `occurrence:${id}`,
    tick,
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "speech",
    text,
    addressed,
  };
}

function setup(): { resident: ResidentRuntime; owner: ResidentCognitionOwner } {
  const resident = new ResidentRuntime(profile);
  resident.enterRegion({ id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 }, 0, true);
  resident.ingestPercepts([speech("initial", 1, true)]);
  return {
    resident,
    owner: new ResidentCognitionOwner(resident, new CognitionGrounder(createFiveResidentNavigationGraph())),
  };
}

function keepProposal() {
  return {
    version: 1,
    activityDirective: { kind: "keep", reason: "continue current activity" },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 5,
  };
}

function communicateProposal() {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: "reply in the shared world",
      activity: {
        kind: "communicate",
        goal: "answer Jozz",
        targetActorId: "player.jozz",
        targetRegionId: null,
        targetPosition: null,
        text: "Jasne.",
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 5,
  };
}

describe("ResidentCognitionOwner", () => {
  it("keeps exact attempt authority local and rejects a cloned handle", () => {
    const { resident, owner } = setup();
    const batch = resident.takeCognitionBatch(1)!;
    const attempt = owner.prepare(batch)!;
    const cloned = structuredClone(attempt);

    expect(owner.settle(cloned, keepProposal(), {
      tick: 2,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    })).toEqual({ status: "rejected", reason: "unknown_attempt" });
    expect(owner.state().activeAttemptId).toBe(attempt.id);
    const applied = owner.settle(attempt, keepProposal(), {
      tick: 2,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    });
    expect(applied.status).toBe("applied");
    if (applied.status === "applied") expect(applied.activityTransition).toBeNull();
  });

  it("does not stale cognition merely because unrelated nearby speech was overheard", () => {
    const { resident, owner } = setup();
    const attempt = owner.prepare(resident.takeCognitionBatch(1)!)!;
    resident.ingestPercepts([speech("overheard", 2, false, "Janek, to do ciebie")]);

    expect(owner.settle(attempt, keepProposal(), {
      tick: 3,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    }).status).toBe("applied");
  });

  it("rejects and requeues a late response after newer speech is explicitly addressed to the resident", () => {
    const { resident, owner } = setup();
    const original = resident.takeCognitionBatch(1)!;
    const attempt = owner.prepare(original)!;
    resident.ingestPercepts([speech("newer", 2, true, "Mira, jednak zaczekaj")]);

    expect(owner.settle(attempt, communicateProposal(), {
      tick: 3,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    })).toEqual({ status: "stale", reason: "newer_addressed_attention" });
    expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(2);
  });

  it("rejects both keep and replacement decisions after the local activity materially changed", () => {
    for (const rawProposal of [keepProposal(), communicateProposal()]) {
      const { resident, owner } = setup();
      const original = resident.takeCognitionBatch(1)!;
      const attempt = owner.prepare(original)!;
      resident.setActivity({
        id: "activity:new-local-reality",
        kind: "idle",
        targetActorId: null,
        targetPosition: null,
        text: null,
        speed: null,
        reason: "local execution moved to a newer state",
      }, 2);

      expect(owner.settle(attempt, rawProposal, {
        tick: 3,
        currentPosition: { x: 760, y: 650 },
        currentRegionId: "hearth",
      })).toEqual({ status: "stale", reason: "activity_changed_during_request" });
      expect(resident.publicState().activity.id).toBe("activity:new-local-reality");
      expect(resident.publicState().pendingCognitionReasonCount).toBeGreaterThanOrEqual(1);
    }
  });

  it("returns a grounded transition without mutating bodily activity outside World authority", () => {
    const { resident, owner } = setup();
    const attempt = owner.prepare(resident.takeCognitionBatch(1)!)!;
    const before = resident.publicState().activity.id;
    const result = owner.settle(attempt, communicateProposal(), {
      tick: 2,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    });

    expect(result.status).toBe("applied");
    if (result.status === "applied") {
      expect(result.activityTransition?.kind).toBe("communicate");
      expect(result.activityTransition?.targetActorId).toBe("player.jozz");
      expect(result.activityTransition?.targetPosition).toBeNull();
    }
    expect(resident.publicState().activity.id).toBe(before);
  });

  it("requeues causal reasons when transport is abandoned or output is invalid", () => {
    const abandoned = setup();
    const firstBatch = abandoned.resident.takeCognitionBatch(1)!;
    const attempt = abandoned.owner.prepare(firstBatch)!;
    expect(abandoned.owner.abandon(attempt)).toBe(true);
    expect(abandoned.resident.takeCognitionBatch(61)?.reasons[0]?.id).toBe(firstBatch.reasons[0]!.id);

    const malformed = setup();
    const malformedBatch = malformed.resident.takeCognitionBatch(1)!;
    const malformedAttempt = malformed.owner.prepare(malformedBatch)!;
    expect(malformed.owner.settle(malformedAttempt, { nope: true }, {
      tick: 2,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    })).toEqual({ status: "rejected", reason: "proposal_invalid" });
    expect(malformed.resident.takeCognitionBatch(61)?.reasons[0]?.id).toBe(malformedBatch.reasons[0]!.id);
  });
});
