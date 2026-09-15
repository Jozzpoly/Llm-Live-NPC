import { describe, expect, it } from "vitest";
import type { ResidentCognitionContext, ResidentCognitionProposal } from "./cognition-contract";
import { CognitionGrounder } from "./cognition-grounder";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";

function context(): ResidentCognitionContext {
  return {
    version: 1,
    resident: { id: "resident.mira", name: "Mira" },
    tick: 50,
    reasons: [],
    currentActivity: {
      id: "activity:old",
      kind: "work",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "working",
    },
    recentPercepts: [],
    concerns: [],
    beliefs: [],
    knownActors: [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: { x: 700, y: 700 },
      lastObservedTick: 48,
      lastHeardDirection: null,
      lastHeardDistanceBand: null,
      lastHeardTick: null,
    }],
    knownRegions: [
      { id: "hearth", label: "Hearth" },
      { id: "workshop", label: "Workshop" },
      { id: "crossroads", label: "Crossroads" },
      { id: "old-road", label: "Old Road" },
      { id: "ruins", label: "Ruins" },
    ],
  };
}

function proposal(activity: Extract<ResidentCognitionProposal["activityDirective"], { kind: "replace" }>["activity"]): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: { kind: "replace", reason: "fresh decision", activity },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 10,
  };
}

describe("CognitionGrounder", () => {
  it("turns a known semantic region target into hierarchical local route waypoints", () => {
    const grounder = new CognitionGrounder(createFiveResidentNavigationGraph());
    const result = grounder.ground(proposal({
      kind: "investigate",
      goal: "inspect the ruins",
      targetActorId: null,
      targetRegionId: "ruins",
      targetPosition: null,
      text: null,
    }), {
      residentId: "resident.mira",
      tick: 50,
      currentPosition: { x: 780, y: 720 },
      currentRegionId: "hearth",
      context: context(),
    });

    expect(result.kind).toBe("set_activity");
    if (result.kind === "set_activity") {
      expect(result.activity.kind).toBe("investigate");
      expect(result.activity.targetPosition).toEqual({ x: 7_050, y: 1_250 });
      expect(result.activity.routeWaypoints!.length).toBeGreaterThan(4);
    }
  });

  it("does not reveal unknown intermediate topology merely because the destination name is known", () => {
    const grounder = new CognitionGrounder(createFiveResidentNavigationGraph());
    const partial = context();
    partial.knownRegions = [
      { id: "hearth", label: "Hearth" },
      { id: "ruins", label: "Ruins" },
    ];

    const result = grounder.ground(proposal({
      kind: "travel",
      goal: "go to the known ruins",
      targetActorId: null,
      targetRegionId: "ruins",
      targetPosition: null,
      text: null,
    }), {
      residentId: "resident.mira",
      tick: 50,
      currentPosition: { x: 780, y: 720 },
      currentRegionId: "hearth",
      context: partial,
    });

    expect(result).toEqual({ kind: "rejected", reason: "target_region_route_not_known" });
  });

  it("turns semantic communication into an embodied activity aimed at last-known visual contact", () => {
    const grounder = new CognitionGrounder(createFiveResidentNavigationGraph());
    const result = grounder.ground(proposal({
      kind: "communicate",
      goal: "tell Jozz the result",
      targetActorId: "player.jozz",
      targetRegionId: null,
      targetPosition: null,
      text: "Sprawdziłam ruiny.",
    }), {
      residentId: "resident.mira",
      tick: 50,
      currentPosition: { x: 780, y: 720 },
      currentRegionId: "hearth",
      context: context(),
    });

    expect(result.kind).toBe("set_activity");
    if (result.kind === "set_activity") {
      expect(result.activity.targetActorId).toBe("player.jozz");
      expect(result.activity.targetPosition).toEqual({ x: 700, y: 700 });
      expect(result.activity.text).toBe("Sprawdziłam ruiny.");
    }
  });

  it("can pursue a heard actor without converting a directional cue into an exact target coordinate", () => {
    const grounder = new CognitionGrounder(createFiveResidentNavigationGraph());
    const heard = context();
    heard.knownActors = [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: null,
      lastObservedTick: null,
      lastHeardDirection: { x: 1, y: 0 },
      lastHeardDistanceBand: "mid",
      lastHeardTick: 49,
    }];

    const result = grounder.ground(proposal({
      kind: "follow",
      goal: "find and follow Jozz",
      targetActorId: "player.jozz",
      targetRegionId: null,
      targetPosition: null,
      text: null,
    }), {
      residentId: "resident.mira",
      tick: 50,
      currentPosition: { x: 780, y: 720 },
      currentRegionId: "hearth",
      context: heard,
    });

    expect(result.kind).toBe("set_activity");
    if (result.kind === "set_activity") {
      expect(result.activity.targetActorId).toBe("player.jozz");
      expect(result.activity.targetPosition).toBeNull();
    }
  });

  it("fails closed when an actor is known by identity but has no contact evidence", () => {
    const grounder = new CognitionGrounder(createFiveResidentNavigationGraph());
    const missingActor = context();
    missingActor.knownActors = [{
      id: "player.jozz",
      label: "Jozz",
      lastKnownPosition: null,
      lastObservedTick: null,
      lastHeardDirection: null,
      lastHeardDistanceBand: null,
      lastHeardTick: null,
    }];
    const result = grounder.ground(proposal({
      kind: "follow",
      goal: "follow Jozz",
      targetActorId: "player.jozz",
      targetRegionId: null,
      targetPosition: null,
      text: null,
    }), {
      residentId: "resident.mira",
      tick: 50,
      currentPosition: { x: 780, y: 720 },
      currentRegionId: "hearth",
      context: missingActor,
    });

    expect(result).toEqual({ kind: "rejected", reason: "target_actor_has_no_grounded_contact_evidence" });
  });
});
