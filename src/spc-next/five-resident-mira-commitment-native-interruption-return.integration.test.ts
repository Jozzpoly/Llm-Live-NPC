import { describe, expect, it } from "vitest";
import type { WorldOccurrence } from "./contracts";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
} from "./five-resident-mira-causal-multi-matter-slice";

const HEARTH = MIRA_CAUSAL_COMMITMENTS[0]!;
const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_GUARD = 2_000;
const PLAYER_POSITION = { x: 700, y: 700 } as const;
const HEARTH_DESTINATION = { x: 780, y: 720 } as const;

interface InterruptionSnapshot {
  status: "active" | "completed";
  originPerceptId: string;
  interruptMatterId: string;
  interruptRunId: string;
  mainMatterId: string;
  mainRunId: string;
  responseOccurrenceId: string | null;
  remainingHoldTicks: number;
}

type InterruptionStep =
  | { status: "responded"; interruption: InterruptionSnapshot }
  | { status: "holding"; interruption: InterruptionSnapshot }
  | { status: "resumed"; interruption: InterruptionSnapshot };

describe("Mira commitment-native interruption and exact return", () => {
  it("suspends causal B from private addressed speech, resolves a bounded local interrupt, then resumes the exact same B run and finishes it", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    for (let step = 0; step < 6; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
    }

    // B is born commitment-native while A still owns the body.
    const bOrigin = slice.world.speak(PLAYER_ID, HEARTH.requestText, REQUEST_RADIUS, [MIRA_ID]);
    let prepared: ReturnType<typeof slice.takeReadyLifeIntentAttempt> = null;
    for (let step = 0; step < 180 && !prepared; step += 1) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      prepared = slice.takeReadyLifeIntentAttempt();
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;

    const settlement = slice.lifeIntentOwner.settleCommitmentIntent(
      prepared.attempt,
      commitmentProposal(),
      slice.currentLifeView(),
      slice.world.tick,
      (proposal, providerContext) => slice.groundPreparedPlayerCommitmentRequest(
        prepared,
        bOrigin,
        HEARTH,
        proposal,
        providerContext,
      ),
    );
    expect(settlement.status).toBe("applied");
    if (settlement.status !== "applied") return;

    const acceptedB = slice.materializeAdmittedPlayerCommitmentRequest(
      prepared,
      bOrigin,
      HEARTH,
      settlement.proposal,
      settlement.intent,
    );
    const matterB = acceptedB.matter.id;
    const runB = acceptedB.runId;
    expect(matterB).toBe(`matter.mira.causal.${bOrigin.id}`);
    expect(runB).toBe(`run.mira.causal.${bOrigin.id}.semantic-1`);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);

    slice.completeFocusedMatter(WORKSHOP.matterId);
    expect(slice.focus.focusedRun()).toBe(runB);

    // B is genuinely embodied before interruption and returns toward the player/Hearth.
    let guard = 0;
    while (distance(miraPosition(slice), PLAYER_POSITION) > 280 && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        matterId: matterB,
        runId: runB,
      });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    const beforeInterruptMotion = miraPosition(slice);
    const bindingBefore = slice.kernel.runBinding(runB);
    expect(bindingBefore).not.toBeNull();

    const call = slice.world.speak(
      PLAYER_ID,
      "Mira, chwila!",
      REQUEST_RADIUS,
      [MIRA_ID],
    );
    // The already-running B gets one factual local tick before the new occurrence is
    // available as a private resident percept.
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
      status: "running",
      matterId: matterB,
      runId: runB,
    });
    expect(miraPosition(slice)).not.toEqual(beforeInterruptMotion);

    const interruptionApi = slice as unknown as {
      beginAddressedInterruption?: (occurrence: WorldOccurrence) => InterruptionSnapshot;
      advanceAddressedInterruptionOneWorldTick?: () => InterruptionStep;
    };
    expect(typeof interruptionApi.beginAddressedInterruption).toBe("function");
    expect(typeof interruptionApi.advanceAddressedInterruptionOneWorldTick).toBe("function");
    if (!interruptionApi.beginAddressedInterruption || !interruptionApi.advanceAddressedInterruptionOneWorldTick) {
      return;
    }

    const interruptedAt = miraPosition(slice);
    const interruption = interruptionApi.beginAddressedInterruption(call);
    expect(interruption).toMatchObject({
      status: "active",
      mainMatterId: matterB,
      mainRunId: runB,
      responseOccurrenceId: null,
    });
    expect(interruption.originPerceptId).toBeTruthy();
    expect(interruption.interruptMatterId).toBeTruthy();
    expect(interruption.interruptRunId).toBeTruthy();

    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "suspended",
      activeRunId: runB,
      suspendedByMatterId: interruption.interruptMatterId,
    });
    expect(slice.kernel.runBinding(runB)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(runB)).toBe(false);
    expect(slice.kernel.matter(interruption.interruptMatterId)).toMatchObject({
      status: "active",
      activeRunId: interruption.interruptRunId,
    });
    expect(slice.focus.focusedRun()).toBe(interruption.interruptRunId);
    expect(slice.authority.motionOwner()).toBeNull();

    const responded = interruptionApi.advanceAddressedInterruptionOneWorldTick();
    expect(responded.status).toBe("responded");
    expect(miraPosition(slice)).toEqual(interruptedAt);
    expect(responded.interruption.responseOccurrenceId).toBeTruthy();
    const response = slice.world.diagnostics().recentOccurrences.find(
      (occurrence) => occurrence.id === responded.interruption.responseOccurrenceId,
    );
    expect(response).toMatchObject({
      kind: "speech",
      actorId: MIRA_ID,
      text: "Tak?",
      addressedActorIds: [PLAYER_ID],
    });

    let resumed: InterruptionSnapshot | null = null;
    guard = 0;
    while (!resumed && guard < 120) {
      const step = interruptionApi.advanceAddressedInterruptionOneWorldTick();
      expect(miraPosition(slice)).toEqual(interruptedAt);
      if (step.status === "resumed") resumed = step.interruption;
      guard += 1;
    }
    expect(resumed).not.toBeNull();
    expect(guard).toBeLessThan(120);
    if (!resumed) return;

    expect(resumed).toMatchObject({
      status: "completed",
      mainMatterId: matterB,
      mainRunId: runB,
    });
    expect(slice.kernel.matter(interruption.interruptMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "active",
      activeRunId: runB,
      suspendedByMatterId: null,
    });
    expect(slice.kernel.runBinding(runB)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(runB)).toBe(true);
    expect(slice.focus.focusedRun()).toBe(runB);

    // Return means the exact old executor/run continues, not a replacement run.
    const resumePosition = miraPosition(slice);
    expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
      status: "running",
      matterId: matterB,
      runId: runB,
    });
    expect(miraPosition(slice)).not.toEqual(resumePosition);

    const completedB = slice.completeFocusedMatter(matterB);
    expect(completedB.runId).toBe(runB);
    expect(completedB.outcomeEvidence.summary).toContain("hearth");
    expect(slice.kernel.matter(matterB)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    const final = miraPosition(slice);
    expect(Math.hypot(
      final.x - HEARTH_DESTINATION.x,
      final.y - HEARTH_DESTINATION.y,
    )).toBeLessThanOrEqual(18);
  });
});

function commitmentProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept the addressed hearth request as a later continuing commitment",
      intent: {
        kind: "travel",
        goal: HEARTH.semanticCourse,
        targetActorId: null,
        targetRegionId: HEARTH.targetRegionId,
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

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
