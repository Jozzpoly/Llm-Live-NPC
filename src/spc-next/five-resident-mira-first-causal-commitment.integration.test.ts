import { describe, expect, it } from "vitest";
import { createFiveResidentMiraCausalMultiMatterSlice } from "./five-resident-mira-causal-multi-matter-slice";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_GUARD = 2_000;
const WORKSHOP_DESTINATION = { x: 1_950, y: 720 } as const;

describe("Mira first causal commitment", () => {
  it("creates and executes the first resident matter from arbitrary addressed speech without any authored commitment fixture", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    expect(slice.currentLifeView().matters).toEqual([]);
    expect(slice.focus.focusedRun()).toBeNull();

    const occurrence = slice.world.speak(
      PLAYER_ID,
      "Mira, gdy będziesz mogła, zajrzyj proszę do znanego ci warsztatu i sprawdź, czy wszystko jest w porządku.",
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    slice.world.step();

    let prepared = slice.takeReadyLifeIntentAttempt();
    for (let step = 0; step < 180 && !prepared; step += 1) {
      slice.world.step();
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.life.matters).toEqual([]);
    expect(prepared.attempt.context.life.body.focusedRunId).toBeNull();
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    const proposal = workshopProposal();
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
    expect(settlement.intent.routeRegionIds).toEqual(["hearth", "workshop"]);

    const accepted = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      occurrence,
      settlement.proposal,
      settlement.intent,
    );
    const matterId = `matter.mira.causal.${occurrence.id}`;
    const runId = `run.mira.causal.${occurrence.id}.semantic-1`;

    expect(accepted.matter.id).toBe(matterId);
    expect(accepted.runId).toBe(runId);
    expect(accepted.focusClaim).toEqual({ status: "acquired", runId });
    expect(slice.kernel.matter(matterId)).toMatchObject({
      status: "active",
      activeRunId: runId,
      semanticCourse: "accept the player's later workshop check as a continuing commitment · inspect the familiar workshop and make sure it is all right",
      semanticIntent: {
        kind: "travel_region",
        goal: "inspect the familiar workshop and make sure it is all right",
        targetRegionId: "workshop",
      },
    });
    expect(slice.focus.focusedRun()).toBe(runId);
    expect(slice.kernel.canRunMutateWorld(runId)).toBe(true);

    const completed = slice.completeFocusedMatter(matterId);
    expect(completed).toMatchObject({
      matterId,
      runId,
      arbitration: { status: "idle" },
    });
    expect(completed.outcomeEvidence.summary).toContain("workshop");
    expect(slice.kernel.matter(matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.runBinding(runId)).toBeNull();
    expect(slice.focus.focusedRun()).toBeNull();

    const final = miraPosition(slice);
    expect(Math.hypot(
      final.x - WORKSHOP_DESTINATION.x,
      final.y - WORKSHOP_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
  });
});

function workshopProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept the player's later workshop check as a continuing commitment",
      intent: {
        kind: "travel",
        goal: "inspect the familiar workshop and make sure it is all right",
        targetActorId: null,
        targetRegionId: "workshop",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function miraPosition(slice: ReturnType<typeof createFiveResidentMiraCausalMultiMatterSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return { ...actor.position };
}
