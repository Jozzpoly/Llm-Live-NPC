import { describe, expect, it } from "vitest";
import type { ResidentDiagnostics, ResidentPublicState, WorldPublicSnapshot } from "../spc-next/contracts";
import {
  projectEpistemicActors,
  projectRecentDirectionalHearing,
  resolveActivityTarget,
} from "./spc-next-research-projection";

function diagnostics(): ResidentDiagnostics {
  return {
    publicState: {
      id: "resident.mira",
      name: "Mira",
      activity: {
        id: "activity:mira",
        kind: "follow",
        targetActorId: "player.jozz",
        targetPosition: null,
        text: null,
        speed: 80,
        reason: "stay near the player",
      },
      pendingCognitionReasonCount: 1,
    },
    recentPercepts: [
      {
        id: "p1",
        occurrenceId: "sight:enter",
        tick: 10,
        phenomenon: "actor_sight_enter",
        modality: "sight",
        actorId: "player.jozz",
        subjectId: "player.jozz",
        spatial: { kind: "exact", position: { x: 100, y: 200 } },
        summary: "player entered sight",
        text: null,
        addressed: false,
      },
      {
        id: "p2",
        occurrenceId: "sight:update",
        tick: 14,
        phenomenon: "actor_sight_update",
        modality: "sight",
        actorId: "player.jozz",
        subjectId: "player.jozz",
        spatial: { kind: "exact", position: { x: 120, y: 210 } },
        summary: "player moved while visible",
        text: null,
        addressed: false,
      },
      {
        id: "p3",
        occurrenceId: "sight:exit",
        tick: 16,
        phenomenon: "actor_sight_exit",
        modality: "sight",
        actorId: "player.jozz",
        subjectId: "player.jozz",
        spatial: { kind: "none" },
        summary: "player left sight",
        text: null,
        addressed: false,
      },
      {
        id: "p4",
        occurrenceId: "speech:1",
        tick: 18,
        phenomenon: "speech",
        modality: "hearing",
        actorId: "resident.ida",
        subjectId: null,
        spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "far" },
        summary: "speech",
        text: "hello",
        addressed: false,
      },
    ],
    trace: [],
  };
}

describe("SPC Next research projection", () => {
  it("keeps last exact sight evidence after sight exit without pretending it remains visible", () => {
    expect(projectEpistemicActors(diagnostics())).toEqual([{
      actorId: "player.jozz",
      lastKnownPosition: { x: 120, y: 210 },
      lastObservedTick: 14,
      currentlyVisible: false,
    }]);
  });

  it("projects directional hearing without inventing an exact source position", () => {
    expect(projectRecentDirectionalHearing(diagnostics(), 1)).toEqual([{
      actorId: "resident.ida",
      tick: 18,
      direction: { x: 1, y: 0 },
      distanceBand: "far",
      summary: "speech",
    }]);
  });

  it("resolves activity targets from public World truth rather than private memory", () => {
    const resident: ResidentPublicState = diagnostics().publicState;
    const snapshot: WorldPublicSnapshot = {
      tick: 20,
      actors: [{
        id: "player.jozz",
        kind: "player",
        position: { x: 900, y: 700 },
        velocity: { x: 0, y: 0 },
        hearingRadius: 420,
        sightRadius: 520,
        maxSpeed: 140,
      }],
      residents: [resident],
    };
    expect(resolveActivityTarget(snapshot, resident)).toEqual({ x: 900, y: 700 });
  });
});
