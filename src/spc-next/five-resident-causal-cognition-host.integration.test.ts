import { describe, expect, it } from "vitest";
import { FiveResidentCausalCognitionHost } from "./five-resident-causal-cognition-host";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";
import {
  createFiveResidentRegionComposition,
  type FiveResidentId,
} from "./five-resident-region";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";

const RESIDENT_IDS = [
  "resident.mira",
  "resident.janek",
  "resident.ida",
  "resident.oren",
  "resident.nela",
] as const satisfies readonly FiveResidentId[];

const TARGETS: Readonly<Record<FiveResidentId, string>> = {
  "resident.mira": "workshop",
  "resident.janek": "hearth",
  "resident.ida": "hearth",
  "resident.oren": "crossroads",
  "resident.nela": "old-road",
};

describe("five-resident unified causal cognition host", () => {
  it("fairly admits five resident commitments and executes them together in one World", () => {
    const composition = createFiveResidentRegionComposition();
    const runtime = new FiveResidentCausalLifeRuntime(composition);
    const cognition = new FiveResidentCausalCognitionHost(runtime, 2);

    let guard = 0;
    while (runtime.claimedResidentIds().length < 5 && guard < 1_500) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(1_500);

    // Janek begins idle, so let his ordinary phased quiet review become due as well.
    while (runtime.world.tick < 2_400) runtime.advanceOneWorldTick();

    expect(cognition.collectReadyBatches()).toBe(5);

    const accepted = new Map<FiveResidentId, { matterId: string; runId: string }>();
    let dispatchRounds = 0;
    while (accepted.size < 5 && dispatchRounds < 5) {
      const requests = cognition.startReadyRequests();
      expect(requests.length).toBeGreaterThan(0);
      expect(requests.length).toBeLessThanOrEqual(2);

      for (const request of requests) {
        const origin = request.batch.reasons.find((reason) => reason.kind !== "heard_speech");
        expect(origin, `${request.residentId} lacks self-origin pressure`).toBeDefined();
        if (!origin) continue;

        const result = cognition.settleCommitment(
          request,
          travelProposal(request.residentId),
          origin.id,
        );
        expect(result.status).toBe("applied");
        if (result.status !== "applied") continue;
        expect(result.decision).toBe("accept");
        expect(result.commitment).not.toBeNull();
        if (result.commitment) accepted.set(request.residentId, result.commitment);
      }
      dispatchRounds += 1;
    }

    expect(accepted.size).toBe(5);
    expect(cognition.state().inFlightResidents).toEqual([]);
    expect(cognition.state().queuedResidents).toEqual([]);

    guard = 0;
    while (!allResolved(runtime, accepted) && guard < 5_000) {
      runtime.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(5_000);
    expect(allResolved(runtime, accepted)).toBe(true);

    for (const residentId of RESIDENT_IDS) {
      const life = runtime.life(residentId);
      const commitment = accepted.get(residentId);
      expect(life).not.toBeNull();
      expect(commitment).toBeDefined();
      if (!life || !commitment) continue;
      expect(life.kernel.matter(commitment.matterId)).toMatchObject({
        status: "resolved",
        activeRunId: null,
      });
      expect(life.kernel.runBinding(commitment.runId)).toBeNull();
      expect(life.focus.focusedRun()).toBeNull();

      const actor = runtime.world.publicSnapshot().actors.find((candidate) => candidate.id === residentId);
      expect(actor).toBeDefined();
      if (!actor) continue;
      expect(runtime.world.regionAt(actor.position)?.id).toBe(TARGETS[residentId]);
    }
  });
});

function travelProposal(residentId: FiveResidentId): ResidentLifeIntentProposal {
  const targetRegionId = TARGETS[residentId];
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: `continue my own life after the local opening as ${residentId}`,
      intent: {
        kind: "travel",
        goal: `go to the familiar ${targetRegionId} for my next bounded chapter`,
        targetActorId: null,
        targetRegionId,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

function allResolved(
  runtime: FiveResidentCausalLifeRuntime,
  accepted: ReadonlyMap<FiveResidentId, { matterId: string; runId: string }>,
): boolean {
  if (accepted.size !== 5) return false;
  for (const [residentId, commitment] of accepted) {
    const matter = runtime.life(residentId)?.kernel.matter(commitment.matterId);
    if (matter?.status !== "resolved") return false;
  }
  return true;
}
