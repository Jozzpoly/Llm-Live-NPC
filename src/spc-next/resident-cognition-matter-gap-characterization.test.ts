import { describe, expect, it } from "vitest";
import { CognitionGrounder } from "./cognition-grounder";
import type { CognitionBatch } from "./contracts";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { ResidentCognitionOwner } from "./resident-cognition-owner";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const MAX_BATCH_STEPS = 180;

describe("resident cognition -> continuing matter gap characterization", () => {
  it("retains an evidence-backed concern from real addressed World speech but has no general authority seam that turns it into a continuing matter", () => {
    const composition = createFiveResidentRegionComposition({ playerStart: { x: 700, y: 700 } });
    const { world } = composition;
    const mira = composition.runtimes[MIRA_ID];

    // Remove the authored opening walk from this narrowly scoped characterization.
    // The variable under test starts with an otherwise-idle resident receiving a real
    // addressed World occurrence, not with activity-completion pressure.
    world.setResidentActivity(MIRA_ID, {
      id: "activity:mira:commitment-gap-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "commitment-ingress characterization idle",
    });
    world.step();

    const occurrence = world.speak(
      PLAYER_ID,
      "Mira, sprawdzisz później studnię na polach?",
      420,
      [MIRA_ID],
    );
    world.step();

    const batch = waitForAddressedSpeechBatch(world, mira);
    const owner = new ResidentCognitionOwner(mira, new CognitionGrounder(createFiveResidentNavigationGraph()));
    const attempt = owner.prepare(batch);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const percept = attempt.context.recentPercepts.find((candidate) => candidate.occurrenceId === occurrence.id);
    expect(percept).toMatchObject({
      phenomenon: "speech",
      modality: "hearing",
      actorId: PLAYER_ID,
      addressed: true,
      text: "Mira, sprawdzisz później studnię na polach?",
    });
    if (!percept) return;

    const concernId = "concern.mira.check-field-well";
    const settlement = owner.settleIntent(
      attempt,
      {
        version: 1,
        activityDirective: {
          kind: "keep",
          reason: "remember the addressed request without pretending it was already acted on",
        },
        beliefs: [],
        concerns: [{
          id: concernId,
          summary: "check the field well later",
          priority: 0.6,
          status: "open",
          evidenceIds: [percept.id],
        }],
        reviewAfterSeconds: 30,
      },
      world.tick,
      (proposal, context) => {
        const concern = proposal.concerns.find((candidate) => candidate.id === concernId);
        if (!concern || !concern.evidenceIds.includes(percept.id)) {
          return { status: "rejected" as const, detail: "request concern lost exact private speech evidence" };
        }
        if (!context.recentPercepts.some((candidate) => candidate.id === percept.id)) {
          return { status: "rejected" as const, detail: "private origin percept is not in the admitted cognition context" };
        }
        return {
          status: "accepted" as const,
          intent: { kind: "remember_request" as const, concernId, originPerceptId: percept.id },
        };
      },
    );
    expect(settlement.status).toBe("applied");

    const after = mira.cognitionContext({
      residentId: MIRA_ID,
      requestedAtTick: world.tick,
      reasons: [],
    });
    expect(after.concerns).toContainEqual(expect.objectContaining({
      id: concernId,
      status: "open",
      evidenceIds: [percept.id],
    }));
    expect(after.recentPercepts).toContainEqual(expect.objectContaining({ id: percept.id, occurrenceId: occurrence.id }));

    // This is the plateau being characterized: private semantic persistence exists,
    // but no resident-owned continuity authority consumes the accepted concern.
    const kernel = new ResidentContinuityKernel();
    expect(kernel.recentEvidenceSnapshot()).toEqual([]);
    expect(kernel.matter("matter.mira.check-field-well")).toBeNull();
  });
});

function waitForAddressedSpeechBatch(
  world: ReturnType<typeof createFiveResidentRegionComposition>["world"],
  mira: ReturnType<typeof createFiveResidentRegionComposition>["runtimes"]["resident.mira"],
): CognitionBatch {
  for (let step = 0; step < MAX_BATCH_STEPS; step += 1) {
    const batch = mira.takeCognitionBatch(world.tick);
    if (batch?.reasons.some((reason) => reason.kind === "heard_speech")) return batch;
    world.step();
  }
  throw new Error("addressed World speech never produced resident cognition pressure");
}
