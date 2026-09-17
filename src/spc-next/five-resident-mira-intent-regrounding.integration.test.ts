import { describe, expect, it } from "vitest";
import type { ResidentCognitionProposal } from "./cognition-contract";
import {
  MIRA_CAUSAL_COMMITMENTS,
  createFiveResidentMiraCausalMultiMatterSlice,
  type PreparedCausalLifeIntent,
} from "./five-resident-mira-causal-multi-matter-slice";

const WORKSHOP = MIRA_CAUSAL_COMMITMENTS[1]!;
const FIELDS = MIRA_CAUSAL_COMMITMENTS[2]!;
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
const REQUEST_RADIUS = 420;
const MAX_GUARD = 600;

describe("Mira life intent admission re-grounding", () => {
  it("keeps the semantic Fields choice but grounds its execution from the current Workshop region after provider latency", () => {
    const slice = createFiveResidentMiraCausalMultiMatterSlice();
    slice.acceptPlayerRequest(WORKSHOP);

    // Move A close enough to make the later region transition observable while the
    // player can still causally address Mira from the fixture start.
    let guard = 0;
    while (miraPosition(slice).x < 1_080 && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(slice.privateContext().currentRegionId).toBe("hearth");

    const occurrence = slice.world.speak(PLAYER_ID, FIELDS.requestText, REQUEST_RADIUS, [MIRA_ID]);
    let prepared: PreparedCausalLifeIntent | null = null;
    guard = 0;
    while (!prepared && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      prepared = slice.takeReadyLifeIntentAttempt();
      guard += 1;
    }
    expect(prepared).not.toBeNull();
    if (!prepared) return;
    expect(prepared.attempt.context.currentRegionId).toBe("hearth");
    expect(prepared.attempt.context.recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: occurrence.id,
      phenomenon: "speech",
      addressed: true,
    }));

    // Let the exact same A run continue while the semantic answer is in flight.
    // Crossing into Workshop changes local grounding truth but does not change the
    // meaning of the accepted Fields request or revoke A's continuity authority.
    guard = 0;
    while (slice.privateContext().currentRegionId !== "workshop" && guard < MAX_GUARD) {
      expect(slice.advanceFocusedMatterOneWorldTick()).toMatchObject({
        status: "running",
        runId: WORKSHOP.runId,
      });
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_GUARD);
    expect(slice.focus.focusedRun()).toBe(WORKSHOP.runId);
    expect(slice.kernel.canRunMutateWorld(WORKSHOP.runId)).toBe(true);

    const proposal = commitmentProposal(FIELDS);
    const accepted = slice.settlePreparedPlayerRequest(
      prepared,
      occurrence,
      FIELDS,
      proposal,
    );
    expect(accepted.focusClaim).toEqual({
      status: "busy",
      runId: FIELDS.runId,
      focusedRunId: WORKSHOP.runId,
    });

    // Semantic intent survives, but execution route evidence must describe the state
    // that actually existed when the new run was admitted, not the old provider frame.
    expect(accepted.context.currentRegionId).toBe("hearth");
    expect(slice.privateContext().currentRegionId).toBe("workshop");
    expect(accepted.routeRegionIds).toEqual(["workshop", "fields"]);
    expect(slice.kernel.matter(FIELDS.matterId)).toMatchObject({
      status: "active",
      activeRunId: FIELDS.runId,
      semanticCourse: `${proposal.activityDirective.kind === "replace" ? proposal.activityDirective.reason : ""} · ${FIELDS.semanticCourse}`,
      semanticIntent: {
        kind: "travel_region",
        goal: FIELDS.semanticCourse,
        targetRegionId: FIELDS.targetRegionId,
      },
    });
    expect(slice.kernel.matter(FIELDS.matterId)?.semanticIntent).not.toHaveProperty("routeRegionIds");
    expect(slice.kernel.matter(FIELDS.matterId)?.semanticIntent).not.toHaveProperty("destination");
  });
});

function commitmentProposal(spec: typeof FIELDS): ResidentCognitionProposal {
  return {
    version: 1,
    activityDirective: {
      kind: "replace",
      reason: `accept the addressed ${spec.key} request as a continuing commitment`,
      activity: {
        kind: "travel",
        goal: spec.semanticCourse,
        targetActorId: null,
        targetRegionId: spec.targetRegionId,
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
