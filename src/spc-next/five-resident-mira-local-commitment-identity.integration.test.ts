import { describe, expect, it } from "vitest";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_TO_COGNITION = 180;

describe("Mira local commitment identity", () => {
  it("derives commitment-native matter/run identity from local causal origin without any authored identity argument", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    const occurrence = slice.world.speak(
      PLAYER_ID,
      FIELDS.requestText,
      REQUEST_RADIUS,
      [MIRA_ID],
    );

    let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
    for (let step = 0; step < MAX_TO_COGNITION && !prepared; step += 1) {
      const execution = slice.advanceFocusedMatterOneWorldTick();
      expect(execution).toMatchObject({ status: "running", runId: WORKSHOP.runId });
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const proposal = commitmentProposal();
    const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      proposal,
      slice.currentLifeView(),
      slice.world.tick,
      (admittedProposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        prepared,
        occurrence,
        admittedProposal,
        providerContext,
      ),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const accepted = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      settlement.proposal,
      settlement.intent,
    );

    const expectedMatterId = `matter.mira.causal.${occurrence.id}`;
    const expectedRunId = `run.mira.causal.${occurrence.id}.semantic-1`;

    expect(accepted.matter.id).toBe(expectedMatterId);
    expect(accepted.runId).toBe(expectedRunId);
    expect(accepted.matter.id).not.toBe(FIELDS.matterId);
    expect(accepted.runId).not.toBe(FIELDS.runId);
    expect(slice.kernel.matter(FIELDS.matterId)).toBeNull();
    expect(slice.kernel.runBinding(FIELDS.runId)).toBeNull();

    expect(slice.kernel.matter(expectedMatterId)).toMatchObject({
      id: expectedMatterId,
      status: "active",
      activeRunId: expectedRunId,
      semanticRevision: 1,
      semanticIntent: {
        kind: "travel_region",
        goal: FIELDS.semanticCourse,
        targetRegionId: FIELDS.targetRegionId,
      },
    });
    expect(slice.kernel.runBinding(expectedRunId)).toMatchObject({
      matterId: expectedMatterId,
      runId: expectedRunId,
      semanticRevision: 1,
    });
    expect(slice.arbitrator.deferredRunIds()).toEqual([expectedRunId]);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    // The provider proposal contains semantic meaning only. Local identity is a
    // resident/World admission concern, not provider output disguised as authority.
    expect(JSON.stringify(proposal)).not.toContain("matterId");
    expect(JSON.stringify(proposal)).not.toContain("taskId");
    expect(JSON.stringify(proposal)).not.toContain("runId");
  });
});

function commitmentProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept the addressed fields request as a later continuing commitment",
      intent: {
        kind: "travel",
        goal: FIELDS.semanticCourse,
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
