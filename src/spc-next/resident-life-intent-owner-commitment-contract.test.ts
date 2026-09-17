import { describe, expect, it } from "vitest";
import type { ResidentPercept, ResidentProfile } from "./contracts";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import {
  ResidentLifeIntentOwner,
  type ResidentLifeIntentAdmission,
} from "./resident-life-intent-owner";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentRuntime } from "./resident-runtime";

const profile: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

const hearth = { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 } as const;
const fields = { id: "fields", label: "Fields", minX: 2_700, minY: 0, maxX: 4_000, maxY: 1_500 } as const;

function addressedSpeech(): ResidentPercept {
  return {
    id: "percept:mira:fields-request:1",
    occurrenceId: "occurrence:mira:fields-request:1",
    tick: 1,
    phenomenon: "speech",
    modality: "hearing",
    actorId: null,
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "Jozz asks Mira to check the fields later",
    text: "Mira, sprawdzisz później pola?",
    addressed: true,
  };
}

function lifeView(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [{
      id: "matter.mira.workshop",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the workshop errand",
      suspendedByMatterId: null,
      originEvidence: null,
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: "run.mira.workshop",
        taskId: "task.mira.workshop",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: "run.mira.workshop", deferredRunIds: [] },
  };
}

function acceptedFieldsProposal(): ResidentLifeIntentProposal {
  return {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "accept Jozz's request as a later commitment without taking the body from Workshop",
      intent: {
        kind: "travel",
        goal: "visit the familiar fields later",
        targetActorId: null,
        targetRegionId: "fields",
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [{
      id: "belief:mira:fields-request:1",
      statement: "Jozz asked Mira to check the fields later.",
      confidence: 1,
      evidenceIds: ["percept:mira:fields-request:1"],
    }],
    concerns: [],
    reviewAfterSeconds: 30,
  };
}

describe("ResidentLifeIntentOwner commitment decision contract", () => {
  it("admits a new commitment while recovered life keeps exact body focus", () => {
    const resident = new ResidentRuntime(profile);
    resident.enterRegion(hearth, 0, true);
    resident.familiarizeRegion(fields, 0);
    resident.setActivity({
      id: "activity:mira:legacy-idle",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "legacy local projection remains idle",
    }, 0);
    resident.ingestPercepts([addressedSpeech()]);
    const batch = resident.takeCognitionBatch(1);
    if (!batch) throw new Error("expected addressed cognition batch");

    const owner = new ResidentLifeIntentOwner(resident);
    const life = lifeView();
    const attempt = owner.prepare(batch, life);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const settlement = owner.settleIntent(
      attempt,
      acceptedFieldsProposal(),
      life,
      2,
      (
        proposal: ResidentLifeIntentProposal,
        context: ResidentLifeCognitionContext,
      ): ResidentLifeIntentAdmission<{ targetRegionId: string }> => {
        expect(context.life.body.focusedRunId).toBe("run.mira.workshop");
        expect(proposal.commitmentDecision).toMatchObject({
          kind: "accept",
          intent: { kind: "travel", targetRegionId: "fields" },
        });
        return { status: "accepted", intent: { targetRegionId: "fields" } };
      },
    );

    expect(settlement).toMatchObject({
      status: "applied",
      proposal: {
        commitmentDecision: {
          kind: "accept",
          intent: { kind: "travel", targetRegionId: "fields" },
        },
      },
      intent: { targetRegionId: "fields" },
    });
    expect(life.body.focusedRunId).toBe("run.mira.workshop");
    expect(resident.publicState().activity.kind).toBe("idle");
    expect(resident.cognitionContext({ residentId: resident.profile.id, requestedAtTick: 2, reasons: [] }).beliefs)
      .toContainEqual(expect.objectContaining({ id: "belief:mira:fields-request:1" }));
  });
});
