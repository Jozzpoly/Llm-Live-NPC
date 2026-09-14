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
    position: { x: 700, y: 700 },
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
    expect(owner.settle(attempt, keepProposal(), {
      tick: 2,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    }).status).toBe("applied");
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

  it("rejects a late response after newer speech is explicitly addressed to the resident", () => {
    const { resident, owner } = setup();
    const attempt = owner.prepare(resident.takeCognitionBatch(1)!)!;
    resident.ingestPercepts([speech("newer", 2, true, "Mira, jednak zaczekaj")]);

    expect(owner.settle(attempt, communicateProposal(), {
      tick: 3,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    })).toEqual({ status: "stale", reason: "newer_addressed_attention" });
  });

  it("allows a current replacement after local activity changed, but not a stale keep directive", () => {
    const first = setup();
    const replaceAttempt = first.owner.prepare(first.resident.takeCognitionBatch(1)!)!;
    first.resident.setActivity({
      id: "activity:local-completion-followup",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "local world changed activity",
    }, 2);
    const replacement = first.owner.settle(replaceAttempt, communicateProposal(), {
      tick: 3,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    });
    expect(replacement.status).toBe("applied");
    expect(first.resident.publicState().activity.kind).toBe("communicate");

    const second = setup();
    const keepAttempt = second.owner.prepare(second.resident.takeCognitionBatch(1)!)!;
    second.resident.setActivity({
      id: "activity:new-local-method",
      kind: "work",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "method changed while request was pending",
    }, 2);
    expect(second.owner.settle(keepAttempt, keepProposal(), {
      tick: 3,
      currentPosition: { x: 760, y: 650 },
      currentRegionId: "hearth",
    })).toEqual({ status: "stale", reason: "activity_changed_while_keep" });
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
