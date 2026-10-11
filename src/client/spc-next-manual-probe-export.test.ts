import { describe, expect, it } from "vitest";
import type { FiveResidentManualResearchProbe } from "../spc-next/five-resident-unified-living-runtime";
import type { SpcNextResearchFrame } from "./spc-next-research-scene";
import { buildSpcManualProbeEvidence } from "./spc-next-manual-probe-export";

const REQUEST_ID = "research-request.mira.1";
const REASON_ID = "reason:resident.mira:completed:0";

function probe(decision: "accept" | "decline", runId: string | null = "run.mira.1"): FiveResidentManualResearchProbe {
  return {
    residentId: "resident.mira",
    requestId: REQUEST_ID,
    dispatchedAtTick: 2_600,
    submitted: {
      resident: { id: "resident.mira" },
      reasons: [{ id: REASON_ID, kind: "activity_completed", evidenceIds: [] }],
    } as unknown as FiveResidentManualResearchProbe["submitted"],
    reasons: [{ id: REASON_ID, kind: "activity_completed", evidenceIds: [] }] as unknown as FiveResidentManualResearchProbe["reasons"],
    providerArrival: {
      version: 1,
      id: "provider-arrival:1",
      requestId: REQUEST_ID,
      residentId: "resident.mira",
      status: "proposal",
      originReasonId: REASON_ID,
      proposal: {
        commitmentDecision: {
          kind: decision,
          reason: "This is the model's own claim, not a world fact.",
        },
      },
      usage: { model: "fixture-model", inputTokens: 90, outputTokens: 22, totalTokens: 112, elapsedMs: 400 },
    },
    localSettlement: {
      status: "applied",
      residentId: "resident.mira",
      decision,
      commitment: decision === "accept" && runId
        ? { matterId: "matter.mira.1", runId } : null,
    },
    transportFailed: false,
  };
}

function frame(
  tick: number,
  decision: "accept" | "decline" = "accept",
  outcomeRunId: string | null = null,
): SpcNextResearchFrame {
  const accepted = decision === "accept";
  return {
    snapshot: {
      tick,
      actors: [{
        id: "resident.mira", kind: "resident", position: { x: 100, y: 200 }, facing: { x: 1, y: 0 },
      }],
      residents: [],
    },
    recentOccurrences: [],
    motionOutcomes: [],
    selectedResidentId: "resident.mira",
    selectedDiagnostics: { publicState: { id: "resident.mira" }, recentPercepts: [], trace: [] },
    selectedRegionId: "hearth",
    selectedLife: {
      version: 1,
      matters: accepted ? [{
        id: "matter.mira.1",
        status: "resolved",
        semanticCourse: "answer the privately heard person",
        semanticRevision: 1,
        activeRun: null,
        lastOutcomeEvidence: outcomeRunId ? {
          id: "evidence:outcome:1",
          tick,
          kind: "task_outcome",
          summary: "actual speech after World contact",
          sourceRunId: outcomeRunId,
        } : null,
      }] : [],
      body: { focusedRunId: null, deferredRunIds: [] },
    },
    livingDiagnostics: {
      providerHardBudget: { upstreamRequestsStarted: tick > 2_600 ? 1 : 0 },
      recentProviderEvents: tick > 2_600 ? [{
        requestId: REQUEST_ID,
        residentId: "resident.mira",
        status: "admitted",
        admittedChoice: {
          originReasonId: REASON_ID,
          kind: decision,
          declaredRationale: "This is the model's own claim, not a world fact.",
          matterId: accepted ? "matter.mira.1" : null,
          runId: accepted ? "run.mira.1" : null,
        },
      }] : [],
    },
  } as unknown as SpcNextResearchFrame;
}

describe("manual one-shot operator evidence export", () => {
  it("keeps EXACT submitted private context, model proposal and local settlement separate from run-matched World fact", () => {
    const before = frame(2_600);
    const after = frame(2_660, "accept", "run.mira.1");
    const result = buildSpcManualProbeEvidence(before, after, probe("accept"), "2026-10-11T03:25:00.000Z");
    expect(result.subject).toEqual({
      residentId: "resident.mira", requestId: REQUEST_ID, dispatchedAtWorldTick: 2_600,
    });
    expect(result.modelExchange.exactSubmittedContext).toEqual(probe("accept").submitted);
    expect(result.modelExchange.untrustedProviderArrival?.status).toBe("proposal");
    expect(result.modelExchange.localSettlement?.status).toBe("applied");
    expect(result.trace.outcomeProved).toBe(true);
    expect(result.trace.exactRunFactualOutcome).toMatchObject({ sourceRunId: "run.mira.1" });
    expect(result.scope.serverTelemetry).toBe(false);
    expect(result.scope.isAutonomousLifePass).toBe(false);
    expect(result.sourceRevision).toBeNull(); // no fabricated deployed SHA
  });

  it("does not confuse another later run's outcome with this accepted one", () => {
    const result = buildSpcManualProbeEvidence(
      frame(2_600), frame(2_680, "accept", "run.mira.other"), probe("accept"),
      "2026-10-11T03:25:00.000Z",
    );
    expect(result.trace.outcomeProved).toBe(false);
    expect(result.trace.exactRunFactualOutcome).toBeNull();
  });

  it("preserves valid refusal as a choice with NO created matter or fake motion", () => {
    const result = buildSpcManualProbeEvidence(
      frame(2_600), frame(2_660, "decline"), probe("decline", null),
      "2026-10-11T03:25:00.000Z",
    );
    expect(result.trace.didNotCreateNewMatter).toBe(true);
    expect(result.trace.outcomeProved).toBe(false);
    expect(result.trace.admittedChoice?.kind).toBe("decline");
  });

  it("refuses to mix different selected residents or reordered World evidence", () => {
    const before = frame(2_600);
    const after = frame(2_660);
    expect(() => buildSpcManualProbeEvidence(
      before, { ...after, selectedResidentId: "resident.janek" }, probe("accept"),
      "2026-10-11T03:25:00.000Z",
    )).toThrow(/exact resident/);
    expect(() => buildSpcManualProbeEvidence(
      before, { ...after, snapshot: { ...after.snapshot, tick: 2_599 } }, probe("accept"),
      "2026-10-11T03:25:00.000Z",
    )).toThrow(/ordered World/);
  });
});
