import { describe, expect, it } from "vitest";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_REVIEW_STEPS = 300;

describe("Mira self-origin follow-up from factual outcome", () => {
  it("turns her own completed matter outcome into a fresh durable matter without new external speech", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    const occurrence = slice.world.speak(
      PLAYER_ID,
      "Mira, zajrzyj proszę do znanego ci warsztatu.",
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    slice.world.step();
    const preparedA = waitForLifeIntent(slice);
    const proposalA = acceptTravel(
      "workshop",
      "inspect the familiar workshop",
      "accept the workshop visit",
      1,
    );
    const settlementA = slice.lifeIntentOwner.settleCommitmentIntent(
      preparedA.attempt,
      proposalA,
      slice.currentLifeView(),
      slice.world.tick,
      (proposal, providerContext) => slice.groundPreparedPrivateSpeechCommitment(
        preparedA,
        occurrence,
        proposal,
        providerContext,
      ),
    );
    expect(settlementA.status).toBe("applied");
    if (settlementA.status !== "applied") return;
    const acceptedA = slice.materializeAdmittedPrivateSpeechCommitment(
      preparedA,
      occurrence,
      settlementA.proposal,
      settlementA.intent,
    );

    const completedA = slice.completeFocusedMatter(acceptedA.matter.id);
    expect(completedA.outcomeEvidence.kind).toBe("task_outcome");
    expect(completedA.outcomeEvidence.summary).toContain("workshop");

    const lifeAfterA = slice.currentLifeView();
    expect(lifeAfterA.matters.find((matter) => matter.id === acceptedA.matter.id)).toMatchObject({
      status: "resolved",
      activeRun: null,
      lastOutcomeEvidence: {
        id: completedA.outcomeEvidence.id,
        kind: "task_outcome",
        summary: completedA.outcomeEvidence.summary,
      },
    });
    expect(slice.focus.focusedRun()).toBeNull();

    const speechCountBeforeFollowup = slice.world.diagnostics().recentOccurrences
      .filter((entry) => entry.kind === "speech").length;

    // The next cognition opportunity sees resident-owned life outcome truth. There is
    // deliberately no new speech/percept that tells Mira to create B.
    const preparedB = waitForLifeIntent(slice);
    const sourceMatter = preparedB.attempt.context.life.matters.find(
      (matter) => matter.id === acceptedA.matter.id,
    );
    expect(sourceMatter).toMatchObject({
      status: "resolved",
      lastOutcomeEvidence: {
        id: completedA.outcomeEvidence.id,
        kind: "task_outcome",
      },
    });

    const proposalB = acceptTravel(
      "hearth",
      "return to the familiar hearth after completing the workshop visit",
      "I completed the workshop matter and now choose my own bounded follow-up",
      30,
    );
    const settlementB = slice.lifeIntentOwner.settleCommitmentIntent(
      preparedB.attempt,
      proposalB,
      slice.currentLifeView(),
      slice.world.tick,
      (proposal, providerContext) => slice.groundPreparedLifeOutcomeCommitment(
        preparedB,
        acceptedA.matter.id,
        proposal,
        providerContext,
      ),
    );
    expect(settlementB.status).toBe("applied");
    if (settlementB.status !== "applied") return;

    const acceptedB = slice.materializeAdmittedLifeOutcomeCommitment(
      preparedB,
      acceptedA.matter.id,
      settlementB.proposal,
      settlementB.intent,
    );

    expect(acceptedB.matter.id).toBe(
      `matter.mira.causal.outcome:${completedA.outcomeEvidence.id}`,
    );
    expect(acceptedB.matter.id).not.toBe(acceptedA.matter.id);
    expect(acceptedB.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        goal: "return to the familiar hearth after completing the workshop visit",
        targetRegionId: "hearth",
      },
    });
    expect(acceptedB.focusClaim).toEqual({ status: "acquired", runId: acceptedB.runId });
    expect(slice.kernel.originEvidence(acceptedB.matter.id)).toMatchObject({
      kind: "accepted_cognition_commitment",
    });
    expect(slice.kernel.originEvidence(acceptedB.matter.id)?.summary)
      .toContain(completedA.outcomeEvidence.id);

    const speechCountAfterFollowup = slice.world.diagnostics().recentOccurrences
      .filter((entry) => entry.kind === "speech").length;
    expect(speechCountAfterFollowup).toBe(speechCountBeforeFollowup);

    const completedB = slice.completeFocusedMatter(acceptedB.matter.id);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(slice.kernel.matter(acceptedB.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function waitForLifeIntent(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  for (let step = 0; step < MAX_REVIEW_STEPS; step += 1) {
    const prepared = slice.takeReadyLifeIntentAttempt();
    if (prepared) return prepared;
    slice.world.step();
  }
  throw new Error("Mira never reached a life cognition opportunity");
}

function acceptTravel(
  targetRegionId: "hearth" | "workshop" | "fields",
  goal: string,
  reason: string,
  reviewAfterSeconds: number,
): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason,
      intent: {
        kind: "travel",
        goal,
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds,
  };
}
