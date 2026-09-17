import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
  type MiraCausalCommitmentSpec,
} from "./five-resident-mira-causal-multi-matter-slice";

const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_TO_COGNITION = 180;

const REQUEST_SPEC: MiraCausalCommitmentSpec = {
  ...FIELDS,
  requestText: "Mira, wybierzesz później jedno ze znanych ci miejsc i zajrzysz tam?",
  semanticCourse: "legacy fields fixture sentinel that must not describe execution truth",
};
const PROVIDER_REASON = "accept the open-ended request by choosing a familiar place";
const PROVIDER_GOAL = "visit the familiar workshop and inspect it";
const PROVIDER_TARGET = "workshop" as const;

describe("Mira factual outcome target provenance", () => {
  it("records the actually admitted and reached target instead of the legacy fixture target", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    const occurrence = slice.world.speak(
      PLAYER_ID,
      REQUEST_SPEC.requestText,
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    slice.world.step();

    let prepared = slice.takeReadyLifeIntentAttempt();
    for (let step = 0; step < MAX_TO_COGNITION && !prepared; step += 1) {
      slice.world.step();
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.knownRegions.map((region) => region.id)).toContain(PROVIDER_TARGET);

    const accepted = slice.settlePreparedPlayerRequest(
      prepared,
      occurrence,
      REQUEST_SPEC,
      providerProposal(),
    );
    expect(accepted.matter.semanticIntent).toEqual({
      kind: "travel_region",
      goal: PROVIDER_GOAL,
      targetRegionId: PROVIDER_TARGET,
    });
    expect(accepted.routeRegionIds.at(-1)).toBe(PROVIDER_TARGET);

    const completed = slice.completeFocusedMatter(FIELDS.matterId);
    expect(completed.matterId).toBe(FIELDS.matterId);
    expect(slice.privateContext().currentRegionId).toBe(PROVIDER_TARGET);

    const outcome = slice.kernel.lastOutcomeEvidence(FIELDS.matterId);
    expect(outcome).not.toBeNull();
    expect(outcome?.summary).toContain(PROVIDER_TARGET);
    expect(outcome?.summary).not.toContain("fields destination");
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
        targetRegionId: PROVIDER_TARGET,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}
