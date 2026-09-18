import { describe, expect, it, vi } from "vitest";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { FiveResidentCausalProviderTransport } from "./five-resident-causal-provider-transport";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

describe("five-resident causal provider transport", () => {
  it("keeps provider completion inert until exact later admission", async () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const cognition = new FiveResidentCausalCognitionHost(runtime, 1);

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);
    while (runtime.world.tick < 2_400) runtime.advanceOneWorldTick();

    cognition.collectReadyBatches();
    const request = cognition.startReadyRequests()[0];
    expect(request).toBeDefined();
    if (!request) return;

    const origin = request.batch.reasons.find((reason) => reason.kind !== "heard_speech");
    expect(origin).toBeDefined();
    if (!origin) return;

    const target = request.context.knownRegions.find(
      (region) => region.id !== request.context.currentRegionId,
    );
    expect(target).toBeDefined();
    if (!target) return;

    const proposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "continue one bounded resident-owned chapter from this exact pressure",
        intent: {
          kind: "travel",
          goal: `go to familiar ${target.id}`,
          targetActorId: null,
          targetRegionId: target.id,
          targetPosition: null,
          text: null,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: true,
      originReasonId: origin.id,
      proposal,
      usage: { model: "gpt-5.6-luna" },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const transport = new FiveResidentCausalProviderTransport(
      "/api/spc-next/life-intent",
      fetcher,
    );

    const life = runtime.life(request.residentId);
    expect(life).not.toBeNull();
    if (!life) return;
    expect(life.matterScope.matterIds()).toEqual([]);

    const arrival = await transport.request(request);
    expect(arrival).toMatchObject({
      status: "proposal",
      requestId: request.id,
      residentId: request.residentId,
    });
    expect(transport.pendingArrivals()).toBe(1);

    // Wall-clock completion itself has no World/life authority.
    for (let step = 0; step < 30; step += 1) runtime.advanceOneWorldTick();
    expect(life.matterScope.matterIds()).toEqual([]);
    expect(life.focus.focusedRun()).toBeNull();

    const admission = transport.admit(arrival, cognition);
    expect(admission.status).toBe("applied");
    if (admission.status !== "applied") return;
    expect(admission.commitment).not.toBeNull();
    expect(transport.pendingArrivals()).toBe(0);

    expect(transport.admit(arrival, cognition)).toEqual({
      status: "arrival_rejected",
      reason: "already_admitted",
    });

    const commitment = admission.commitment;
    if (!commitment) return;
    guard = 0;
    while (life.kernel.matter(commitment.matterId)?.status !== "resolved" && guard < 2_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(2_500);
    expect(life.kernel.matter(commitment.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retains bounded Worker status/code without leaking arbitrary error payloads", async () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const cognition = new FiveResidentCausalCognitionHost(runtime, 1);

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    while (runtime.world.tick < 2_400) runtime.advanceOneWorldTick();
    cognition.collectReadyBatches();
    const request = cognition.startReadyRequests()[0];
    expect(request).toBeDefined();
    if (!request) return;

    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      code: "global_limit",
      secretDiagnostic: "must-not-cross-client-boundary",
    }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }));
    const transport = new FiveResidentCausalProviderTransport(
      "/api/spc-next/life-intent",
      fetcher,
    );

    const arrival = await transport.request(request);
    expect(arrival).toMatchObject({
      status: "provider_error",
      code: "http",
      detail: "HTTP 429: global_limit",
    });
    expect(JSON.stringify(arrival)).not.toContain("must-not-cross-client-boundary");

    const admission = transport.admit(arrival, cognition);
    expect(admission).toMatchObject({
      status: "provider_error",
      code: "http",
      detail: "HTTP 429: global_limit",
      abandonment: true,
    });
  });

});
