import { describe, expect, it } from "vitest";
import {
  CAUSAL_REJECT_RETRY_TICKS,
  FiveResidentCausalCognitionHost,
} from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";

describe("five-resident causal cognition retry boundary", () => {
  it("does not immediately resend a rejected resident batch but releases it at the bounded retry tick", () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const cognition = new FiveResidentCausalCognitionHost(runtime, 5);

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);
    while (runtime.world.tick < 2_400) runtime.advanceOneWorldTick();

    expect(cognition.collectReadyBatches()).toBe(5);
    const requests = cognition.startReadyRequests();
    expect(requests).toHaveLength(5);

    const target = requests.find((request) => request.residentId === "resident.mira");
    expect(target).toBeDefined();
    if (!target) return;

    const rejectionTick = runtime.world.tick;
    expect(cognition.settleCommitment(
      target,
      {
        version: 1,
        commitmentDecision: {
          kind: "accept",
          reason: "fixture should never reach semantic admission because origin is forged",
          intent: {
            kind: "idle",
            goal: "remain still",
            targetActorId: null,
            targetRegionId: null,
            targetPosition: null,
            text: null,
          },
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 30,
      },
      "reason:not-in-private-batch",
    )).toMatchObject({
      status: "rejected",
      residentId: "resident.mira",
      reason: "origin_reason_missing",
    });

    for (const request of requests) {
      if (request === target) continue;
      expect(cognition.abandon(request, 1_000)).toBe(true);
    }

    expect(cognition.state().retryNotBeforeTick["resident.mira"])
      .toBe(rejectionTick + CAUSAL_REJECT_RETRY_TICKS);
    expect(cognition.collectReadyBatches()).toBe(0);

    for (let step = 0; step < CAUSAL_REJECT_RETRY_TICKS - 1; step += 1) {
      runtime.advanceOneWorldTick();
    }
    expect(cognition.collectReadyBatches()).toBe(0);

    runtime.advanceOneWorldTick();
    expect(cognition.collectReadyBatches()).toBe(1);
    const retry = cognition.startReadyRequests();
    expect(retry).toHaveLength(1);
    expect(retry[0]?.residentId).toBe("resident.mira");
    expect(retry[0]?.batch.reasons.some((reason) =>
      target.batch.reasons.some((original) => original.id === reason.id)
    )).toBe(true);
  });
});
