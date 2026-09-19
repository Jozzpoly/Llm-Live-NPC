import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContext } from "../../worker/spc-next-life-context";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const MIRA_ID = "resident.mira";

describe("unified resident life context Worker boundary", () => {
  it("keeps the real unified Mira context valid before and after a completed causal chapter", () => {
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

    cognition.collectReadyBatches();
    const requests = cognition.startReadyRequests();
    const mira = requests.find((request) => request.residentId === MIRA_ID);
    expect(mira).toBeDefined();
    if (!mira) return;

    expect(sanitizeSpcNextLifeContext(mira.context)).not.toBeNull();

    const origin = mira.batch.reasons.find((reason) => reason.kind !== "heard_speech");
    expect(origin).toBeDefined();
    if (!origin) return;
    const admitted = cognition.settleCommitment(
      mira,
      travelProposal("workshop"),
      origin.id,
    );
    expect(admitted.status).toBe("applied");
    if (admitted.status !== "applied" || !admitted.commitment) return;

    for (const request of requests) {
      if (request !== mira) cognition.abandon(request, 10_000);
    }

    const life = runtime.life(MIRA_ID);
    expect(life).not.toBeNull();
    if (!life) return;

    guard = 0;
    while (life.kernel.matter(admitted.commitment.matterId)?.status !== "resolved" && guard < 4_000) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(4_000);

    const resolvedMatter = life.currentLifeView().matters.find(
      (matter) => matter.id === admitted.commitment!.matterId,
    );
    expect(resolvedMatter?.lastOutcomeEvidence).not.toBeNull();
    if (!resolvedMatter?.lastOutcomeEvidence) return;

    // This fixture explicitly asks for one post-outcome semantic interpretation
    // because its purpose is Worker-context validation across chapters. Generic
    // execution no longer treats expected success as automatic cognition pressure.
    expect(life.outcomeReviewBridge.observe(
      resolvedMatter.lastOutcomeEvidence,
      runtime.world.tick,
    ).status).toBe("scheduled");

    let next = null as ReturnType<FiveResidentCausalCognitionHost["startReadyRequests"]>[number] | null;
    guard = 0;
    while (!next && guard < 900) {
      cognition.collectReadyBatches();
      next = cognition.startReadyRequests().find((request) => request.residentId === MIRA_ID) ?? null;
      if (!next) runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(next).not.toBeNull();
    if (!next) return;

    expect(next.context.life.matters.some(
      (matter) => matter.id === admitted.commitment!.matterId && matter.status === "resolved",
    )).toBe(true);
    expect(sanitizeSpcNextLifeContext(next.context)).not.toBeNull();
  });
});

function travelProposal(targetRegionId: "workshop"): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "continue one bounded grounded chapter",
      intent: {
        kind: "travel",
        goal: "go to the familiar workshop",
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 1,
  };
}
