import { describe, expect, it } from "vitest";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const JANEK_ID = "resident.janek";
const REQUEST_RADIUS = 420;
const MAX_PREPARE_STEPS = 240;

describe("Mira resident-origin matter from overheard social pressure", () => {
  it("can turn exact private non-addressed Janek speech into her own bounded continuing matter", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();

    // Get Mira physically to Workshop through the same causal commitment-native path.
    const positioning = acceptCausalSpeech(
      slice,
      PLAYER_ID,
      [MIRA_ID],
      "Mira, kiedy będziesz mogła, zajrzyj do znanego ci warsztatu.",
      {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "accept the workshop visit",
          intent: {
            kind: "travel",
            goal: "visit the familiar workshop",
            targetActorId: null,
            targetRegionId: "workshop",
            targetPosition: null,
            text: null,
          },
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
    );
    slice.completeFocusedMatter(positioning.matter.id);
    expect(slice.privateContext().currentRegionId).toBe("workshop");
    expect(slice.focus.focusedRun()).toBeNull();

    // Janek is physically at the Workshop. This is ordinary World speech, deliberately
    // NOT addressed to Mira; hearing it is private causal evidence, not a player command.
    const occurrence = slice.world.speak(
      JANEK_ID,
      "Chyba zostawiłem ważne narzędzia przy palenisku.",
      REQUEST_RADIUS,
      [],
    );
    slice.world.step();

    const heard = slice.privateContext().recentPercepts.find(
      (percept) => percept.occurrenceId === occurrence.id,
    );
    expect(heard).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      actorId: JANEK_ID,
      addressed: false,
      text: occurrence.text,
    });
    expect(slice.mira.pendingCognitionReasons().some(
      (reason) => reason.evidenceIds.includes(heard!.id),
    )).toBe(false);

    // This vertical deliberately establishes resident-relative relevance: Mira knows
    // Janek, is physically present at the workshop, and the experiment asks whether
    // she can choose to make his stated problem her own. The shared gate does NOT
    // infer that every utterance by a known actor deserves cognition.
    slice.mira.promoteSemanticPressure({
      id: `reason:mira:explicit-social-relevance:${occurrence.id}`,
      tick: heard!.tick,
      kind: "heard_speech",
      salience: 0.75,
      summary: "Explicit social-origin fixture: Janek's overheard tool problem is relevant to Mira here.",
      evidenceIds: [heard!.id],
    });

    const prepared = waitForLifeIntent(slice);
    expect(prepared.batch.reasons.some((reason) => (
      reason.kind === "heard_speech" && reason.evidenceIds.includes(heard!.id)
    ))).toBe(true);

    const residentChosenProposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "I heard Janek mention a problem and choose to check the familiar hearth myself",
        intent: {
          kind: "travel",
          goal: "check the familiar hearth for Janek's mentioned tools",
          targetActorId: null,
          targetRegionId: "hearth",
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [{
        id: "belief:mira:janek-mentioned-hearth-tools",
        statement: "Janek said he may have left important tools by the hearth.",
        confidence: 0.85,
        evidenceIds: [heard!.id],
      }],
      concerns: [],
      reviewAfterSeconds: 45,
    };

    const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      residentChosenProposal,
      slice.currentLifeView(),
      slice.world.tick,
      (proposal, providerContext) => slice.groundPreparedPrivateSpeechCommitment(
        prepared,
        occurrence,
        proposal,
        providerContext,
      ),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const accepted = slice.materializeAdmittedPrivateSpeechCommitment(
      prepared,
      occurrence,
      settlement.proposal,
      settlement.intent,
    );

    expect(accepted.matter.id).toBe(`matter.mira.causal.${occurrence.id}`);
    expect(accepted.matter).toMatchObject({
      status: "active",
      semanticIntent: {
        kind: "travel_region",
        goal: "check the familiar hearth for Janek's mentioned tools",
        targetRegionId: "hearth",
      },
    });
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId: accepted.runId });
    expect(accepted.context.recentPercepts.find((percept) => percept.id === heard!.id)?.addressed).toBe(false);
    expect(slice.kernel.originEvidence(accepted.matter.id)).toMatchObject({
      kind: "accepted_social_commitment",
    });
    expect(slice.kernel.originEvidence(accepted.matter.id)?.summary).toContain(occurrence.id);
    expect(slice.privateContext().beliefs).toContainEqual(expect.objectContaining({
      id: "belief:mira:janek-mentioned-hearth-tools",
      evidenceIds: [heard!.id],
    }));

    const completed = slice.completeFocusedMatter(accepted.matter.id);
    expect(completed.outcomeEvidence.summary).toContain("hearth");
    expect(slice.kernel.matter(accepted.matter.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
  });
});

function acceptCausalSpeech(
  slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>,
  speakerId: string,
  addressedActorIds: readonly string[],
  text: string,
  proposal: ResidentLifeIntentProposal,
) {
  const occurrence = slice.world.speak(speakerId, text, REQUEST_RADIUS, addressedActorIds);
  slice.world.step();
  const prepared = waitForLifeIntent(slice);
  const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
    prepared.attempt,
    proposal,
    slice.currentLifeView(),
    slice.world.tick,
    (admittedProposal, providerContext) => slice.groundPreparedPrivateSpeechCommitment(
      prepared,
      occurrence,
      admittedProposal,
      providerContext,
    ),
  );
  if (settlement.status !== "applied") {
    throw new Error(`causal speech commitment settlement failed: ${settlement.status}`);
  }
  return slice.materializeAdmittedPrivateSpeechCommitment(
    prepared,
    occurrence,
    settlement.proposal,
    settlement.intent,
  );
}

function waitForLifeIntent(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  for (let step = 0; step < MAX_PREPARE_STEPS; step += 1) {
    const prepared = slice.takeReadyLifeIntentAttempt();
    if (prepared) return prepared;
    slice.world.step();
  }
  throw new Error("private social pressure never reached Mira cognition");
}
