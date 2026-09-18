import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_TO_COGNITION = 180;

const PROVIDER_REASON = "accept the addressed request but remember it as Mira's later fields obligation";
const PROVIDER_GOAL = "walk to the familiar fields later and inspect them after the current obligations";

describe("Mira durable semantic commitment meaning", () => {
  it("persists admitted structured meaning instead of replacing it with authored fixture semantics", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    const occurrence = slice.world.speak(PLAYER_ID, FIELDS.requestText, REQUEST_RADIUS, [MIRA_ID]);
    slice.world.step();

    let prepared = slice.takeReadyLifeIntentAttempt();
    for (let step = 0; step < MAX_TO_COGNITION && !prepared; step += 1) {
      slice.world.step();
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const accepted = slice.settlePreparedPlayerRequest(
      prepared,
      occurrence,
      FIELDS,
      providerProposal(),
    );

    expect(PROVIDER_GOAL).not.toBe(FIELDS.semanticCourse);
    expect(accepted.matter.semanticIntent).toEqual({
      kind: "travel_region",
      goal: PROVIDER_GOAL,
      targetRegionId: FIELDS.targetRegionId,
    });
    expect(accepted.matter.semanticCourse).toBe(`${PROVIDER_REASON} · ${PROVIDER_GOAL}`);
    expect(accepted.matter.semanticCourse).not.toBe(FIELDS.semanticCourse);
    expect(accepted.matter.semanticIntent).not.toHaveProperty("routeRegionIds");
    expect(accepted.matter.semanticIntent).not.toHaveProperty("destination");

    const lifeMatter = slice.currentLifeView().matters.find((matter) => matter.id === FIELDS.matterId);
    expect(lifeMatter?.semanticIntent).toEqual(accepted.matter.semanticIntent);
    expect(lifeMatter?.semanticCourse).toBe(accepted.matter.semanticCourse);
    expect(accepted.routeRegionIds.length).toBeGreaterThan(0);
  });
});

function providerProposal(): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: PROVIDER_REASON,
      activity: {
        kind: "travel",
        goal: PROVIDER_GOAL,
        targetActorId: null,
        targetRegionId: FIELDS.targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}
