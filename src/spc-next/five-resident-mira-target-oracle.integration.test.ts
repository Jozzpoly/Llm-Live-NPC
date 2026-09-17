import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import {
  createFiveResidentMiraCausalMultiMatterSlice,
  type MiraCausalCommitmentSpec,
} from "./five-resident-mira-causal-multi-matter-slice";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_TO_COGNITION = 180;

const IDENTITY_SCAFFOLD: MiraCausalCommitmentSpec = {
  key: "fields",
  requestText: "Mira, wybierzesz później jedno ze znanych ci miejsc i zajrzysz tam?",
  matterId: "matter.mira.request.target-oracle-falsifier",
  taskId: "task.mira.request.target-oracle-falsifier.travel",
  runId: "run.mira.request.target-oracle-falsifier.travel",
  // Deliberately different from the admitted proposal. This field is only legacy
  // fixture identity pressure in this falsifier and must not decide resident meaning.
  targetRegionId: "fields",
  semanticCourse: "authored fixture sentinel that must not decide the target",
};

const PROVIDER_REASON = "accept the addressed open-ended request by choosing one familiar place";
const PROVIDER_GOAL = "visit the familiar workshop later and inspect it";
const PROVIDER_TARGET = "workshop" as const;

describe("Mira life intent authored target oracle falsifier", () => {
  it("admits a privately known provider-selected region even when the identity scaffold names a different region", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    const occurrence = slice.world.speak(
      PLAYER_ID,
      IDENTITY_SCAFFOLD.requestText,
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

    // The provider is not inventing hidden world truth: Workshop is already present
    // in Mira's private cognition frame and will still need current local route grounding.
    expect(prepared.attempt.context.knownRegions.map((region) => region.id)).toContain(PROVIDER_TARGET);

    const accepted = slice.settlePreparedPlayerRequest(
      prepared,
      occurrence,
      IDENTITY_SCAFFOLD,
      providerProposal(),
    );

    expect(accepted.matter.semanticIntent).toEqual({
      kind: "travel_region",
      goal: PROVIDER_GOAL,
      targetRegionId: PROVIDER_TARGET,
    });
    expect(accepted.matter.semanticCourse).toBe(`${PROVIDER_REASON} · ${PROVIDER_GOAL}`);
    expect(accepted.matter.semanticCourse).not.toBe(IDENTITY_SCAFFOLD.semanticCourse);
    expect(accepted.routeRegionIds.at(-1)).toBe(PROVIDER_TARGET);
    expect(accepted.focusClaim).toEqual({
      status: "acquired",
      runId: IDENTITY_SCAFFOLD.runId,
    });
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
