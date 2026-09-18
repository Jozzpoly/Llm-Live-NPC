import { describe, expect, it } from "vitest";
import { createFiveResidentMiraAutonomousContinuationSlice } from "./five-resident-mira-autonomous-continuation-slice";

const MIRA_ID = "resident.mira";
const RUN_ID = "run.mira.post-walk-continuation.travel";
const MAX_START_STEPS = 1_200;
const MAX_AFTER_ADDRESS_STEPS = 90;

describe("Mira ongoing-life cognition gap characterization", () => {
  it("queues fresh addressed-attention pressure during a recovered body run but never offers cognition another settlement boundary", () => {
    const slice = createFiveResidentMiraAutonomousContinuationSlice();

    let step = slice.advanceOneWorldTick();
    let startGuard = 1;
    while (step.status !== "cognition_requested" && startGuard < MAX_START_STEPS) {
      step = slice.advanceOneWorldTick();
      startGuard += 1;
    }
    expect(startGuard).toBeLessThan(MAX_START_STEPS);
    expect(step.status).toBe("cognition_requested");

    const started = slice.settleDeterministicCognition();
    expect(started.status).toBe("continuation_started");
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);
    expect(slice.executionFocus.focusedRun()).toBe(RUN_ID);

    // Recovered execution owns the real body while the legacy ResidentRuntime
    // projection already says idle. This is the exact self-state split that a
    // second old-style cognition context would currently inherit.
    const beforeAddress = miraPublicState(slice);
    expect(beforeAddress.activity).toMatchObject({
      kind: "idle",
      reason: expect.stringContaining("completed activity:mira:initial"),
    });

    let traveling = slice.advanceOneWorldTick();
    expect(traveling.status).toBe("traveling");
    expect(miraSpeed(slice)).toBeGreaterThan(0.1);

    const speech = slice.playerAddressMira("Mira, możesz na moment?");
    expect(speech).toMatchObject({
      kind: "speech",
      actorId: "player.jozz",
      addressedActorIds: [MIRA_ID],
    });

    // Let the World deliver the addressed hearing into Mira's private runtime.
    traveling = slice.advanceOneWorldTick();
    expect(traveling.status).toBe("traveling");

    const afterAddress = miraPublicState(slice);
    expect(afterAddress.pendingCognitionReasonCount).toBeGreaterThan(0);
    expect(afterAddress.activity).toEqual(beforeAddress.activity);
    expect(slice.kernel.canRunMutateWorld(RUN_ID)).toBe(true);
    expect(slice.executionFocus.focusedRun()).toBe(RUN_ID);

    let observedFreshCognitionBoundary = false;
    let guard = 0;
    while (traveling.status === "traveling" && guard < MAX_AFTER_ADDRESS_STEPS) {
      traveling = slice.advanceOneWorldTick();
      // The current slice has no ongoing-life cognition step variant. Keep this
      // explicit rather than inferring from pending scheduler counts alone.
      observedFreshCognitionBoundary ||= traveling.status === "cognition_requested";
      guard += 1;
    }

    expect(observedFreshCognitionBoundary).toBe(false);
    expect(miraPublicState(slice).pendingCognitionReasonCount).toBeGreaterThan(0);
    expect(miraPublicState(slice).activity).toEqual(beforeAddress.activity);
  });
});

function miraPublicState(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const resident = slice.world.publicSnapshot().residents.find((candidate) => candidate.id === MIRA_ID);
  if (!resident) throw new Error("Mira public resident missing");
  return structuredClone(resident);
}

function miraSpeed(slice: ReturnType<typeof createFiveResidentMiraAutonomousContinuationSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === MIRA_ID);
  if (!actor) throw new Error("Mira actor missing");
  return Math.hypot(actor.velocity.x, actor.velocity.y);
}
