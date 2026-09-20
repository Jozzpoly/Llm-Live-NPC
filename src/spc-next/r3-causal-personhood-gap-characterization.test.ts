import { describe, expect, it } from "vitest";
import type { CognitionBatch, ResidentPercept, ResidentProfile } from "./contracts";
import { FIVE_RESIDENT_LIFE_SELF } from "./five-resident-life-self";
import type { ResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentLifeChoiceOwner } from "./resident-life-choice-owner";
import { ResidentLifeIntentOwner } from "./resident-life-intent-owner";
import { ResidentRuntime } from "./resident-runtime";

const PROFILE: ResidentProfile = {
  id: "resident.mira",
  name: "Mira",
  hearingRadius: 420,
  sightRadius: 520,
  maxSpeed: 115,
  brainIntervalTicks: 3,
  memoryLimit: 128,
  traceLimit: 256,
};

const WORKSHOP = {
  matterId: "matter.mira.r3.workshop",
  runId: "run.mira.r3.workshop",
  taskId: "task.mira.r3.workshop",
} as const;

const FIELDS = {
  matterId: "matter.mira.r3.fields",
  runId: "run.mira.r3.fields",
  taskId: "task.mira.r3.fields",
} as const;

describe("R3 pre-personhood choice characterization", () => {
  it("closes free-form rationale fabrication but shows that generic causal support alone still does not create personhood priority", () => {
    const unsupported = setupIdenticalAmbiguity();
    const workshopState = setupIdenticalAmbiguity();
    const fieldsState = setupIdenticalAmbiguity();

    expect(workshopState.attempt.context).toEqual(fieldsState.attempt.context);
    expect(workshopState.attempt.candidateMatterIds).toEqual([
      FIELDS.matterId,
      WORKSHOP.matterId,
    ].sort((a, b) => a.localeCompare(b)));
    expect(workshopState.attempt.candidateSupports).toEqual(fieldsState.attempt.candidateSupports);

    // The old R3 failure is now closed: prose alone cannot claim a causal preference.
    expect(unsupported.owner.settle(
      unsupported.attempt,
      {
        version: 1,
        decision: {
          kind: "focus_matter",
          matterId: WORKSHOP.matterId,
          reason: "I simply prefer the workshop.",
          reviewAfterSeconds: 8,
        },
      },
      unsupported.life,
    )).toEqual({
      status: "rejected",
      reason: "proposal_invalid",
    });

    const chooseWorkshop = workshopState.owner.settle(
      workshopState.attempt,
      choice(
        WORKSHOP.matterId,
        "I choose the workshop and cite its real pre-existing matter origin.",
      ),
      workshopState.life,
    );
    const chooseFields = fieldsState.owner.settle(
      fieldsState.attempt,
      choice(
        FIELDS.matterId,
        "I choose the fields and cite its real pre-existing matter origin.",
      ),
      fieldsState.life,
    );

    expect(chooseWorkshop).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: WORKSHOP.matterId,
        supportEvidenceIds: [originEvidenceId(WORKSHOP.matterId)],
      },
    });
    expect(chooseFields).toMatchObject({
      status: "applied",
      decision: {
        kind: "focus_matter",
        matterId: FIELDS.matterId,
        supportEvidenceIds: [originEvidenceId(FIELDS.matterId)],
      },
    });

    // This remains an R3 gap, not a PASS: both candidates have equally generic
    // matter-origin support. Causal citation prevents invented rationale but does not
    // itself explain why this resident should prefer one legal matter over the other.
    expect(chooseWorkshop.status).toBe("applied");
    expect(chooseFields.status).toBe("applied");
  });

  it("accepts a provider-authored obligation-like concern whose only provenance is semantically unrelated private evidence", () => {
    const resident = new ResidentRuntime(PROFILE);
    resident.enterRegion(
      { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 },
      0,
      true,
    );

    const greeting: ResidentPercept = {
      id: "percept:r3:neutral-greeting",
      occurrenceId: "occurrence:r3:neutral-greeting",
      tick: 1,
      phenomenon: "speech",
      modality: "hearing",
      actorId: "player.jozz",
      subjectId: null,
      spatial: {
        kind: "directional",
        direction: { x: 1, y: 0 },
        distanceBand: "near",
      },
      summary: "Jozz says a neutral greeting.",
      text: "Mira, dzień dobry.",
      addressed: true,
    };
    resident.ingestPercepts([greeting]);

    const batch = resident.takeCognitionBatch(1);
    expect(batch).not.toBeNull();
    if (!batch) return;

    const owner = new ResidentLifeIntentOwner(resident);
    const attempt = owner.prepare(batch, emptyLife(), 1);
    expect(attempt).not.toBeNull();
    if (!attempt) return;

    const settlement = owner.settleCommitmentIntent(
      attempt,
      {
        version: 1,
        commitmentDecision: {
          kind: "decline",
          reason: "the greeting creates no new embodied commitment",
        },
        beliefs: [],
        concerns: [{
          id: "concern:mira:invented-obligation",
          summary: "I promised Janek that I would repair his tools before dusk.",
          priority: 0.95,
          status: "open",
          evidenceIds: [greeting.id],
        }],
        reviewAfterSeconds: 30,
      },
      emptyLife(),
      2,
      () => ({ status: "accepted", intent: { kind: "no_commitment" as const } }),
    );

    expect(settlement.status).toBe("applied");
    expect(resident.cognitionContext({
      residentId: resident.profile.id,
      requestedAtTick: 2,
      reasons: [],
    }).concerns).toContainEqual(expect.objectContaining({
      id: "concern:mira:invented-obligation",
      summary: "I promised Janek that I would repair his tools before dusk.",
      evidenceIds: [greeting.id],
    }));

    // Provenance is real, but the claimed promise was never present in the evidence.
    // Therefore generic provider-authored concern text cannot itself be the R3 causal
    // personhood authority for promises/obligations.
    expect(greeting.text).toBe("Mira, dzień dobry.");
  });

  it("shows that Mira has authored role/drives prose but current life-choice cognition receives no structured self context", () => {
    expect(FIVE_RESIDENT_LIFE_SELF["resident.mira"]).toMatchObject({
      version: 1,
      role: expect.any(String),
      drives: expect.any(Array),
    });

    const { attempt } = setupIdenticalAmbiguity();

    expect(Object.hasOwn(attempt.context, "self")).toBe(false);
    expect(attempt.context.life.matters).toHaveLength(2);
    expect(attempt.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [FIELDS.runId, WORKSHOP.runId].sort((a, b) => a.localeCompare(b)),
    });

    // The current context has real private/world/life facts, but no causal personhood
    // fact such as an obligation, preference, ownership relation or relationship
    // history that can explain which legal matter should matter more to Mira.
    expect(attempt.context.beliefs).toEqual([]);
    expect(attempt.context.concerns).toEqual([]);
  });
});

function setupIdenticalAmbiguity() {
  const resident = new ResidentRuntime(PROFILE);
  resident.enterRegion(
    { id: "hearth", label: "Hearth", minX: 0, minY: 0, maxX: 1_400, maxY: 1_500 },
    0,
    true,
  );

  resident.promoteSemanticPressure({
    id: "reason:resident.mira:r3-choice",
    tick: 0,
    kind: "uncertainty",
    salience: 0.8,
    summary: "Two already-grounded continuing matters require one free body.",
    evidenceIds: [WORKSHOP.runId, FIELDS.runId],
  });
  const batch = resident.takeCognitionBatch(30);
  if (!batch) throw new Error("R3 characterization did not produce a ready ambiguity batch");

  const life = lifeView();
  const owner = new ResidentLifeChoiceOwner(resident);
  const attempt = owner.prepare(batch, life);
  if (!attempt) throw new Error("R3 characterization could not prepare a life-choice attempt");

  return { resident, batch, life, owner, attempt };
}

function lifeView(): ResidentLifeCognitionView {
  const matter = (
    spec: { matterId: string; runId: string; taskId: string },
    semanticCourse: string,
  ) => ({
    id: spec.matterId,
    status: "active" as const,
    semanticRevision: 1,
    semanticCourse,
    suspendedByMatterId: null,
    originEvidence: {
      id: originEvidenceId(spec.matterId),
      tick: 1,
      kind: "life_context",
      summary: `${spec.matterId} has a real but generic continuing-life origin.`,
    },
    semanticEvidence: {
      id: originEvidenceId(spec.matterId),
      tick: 1,
      kind: "life_context",
      summary: `${spec.matterId} has a real but generic continuing-life origin.`,
    },
    lastOutcomeEvidence: null,
    activeRun: {
      runId: spec.runId,
      taskId: spec.taskId,
      semanticRevision: 1,
      canMutateWorld: true,
      bodyState: "deferred" as const,
    },
  });

  return {
    version: 1,
    matters: [
      matter(WORKSHOP, "continue the already-grounded workshop commitment"),
      matter(FIELDS, "continue the already-grounded fields commitment"),
    ],
    body: {
      focusedRunId: null,
      deferredRunIds: [FIELDS.runId, WORKSHOP.runId].sort((a, b) => a.localeCompare(b)),
    },
  };
}

function choice(matterId: string, reason: string) {
  return {
    version: 1,
    decision: {
      kind: "focus_matter",
      matterId,
      reason,
      supportEvidenceIds: [originEvidenceId(matterId)],
      reviewAfterSeconds: 8,
    },
  };
}

function originEvidenceId(matterId: string): string {
  return `evidence:r3:generic-origin:${matterId}`;
}


function emptyLife(): ResidentLifeCognitionView {
  return {
    version: 1,
    matters: [],
    body: { focusedRunId: null, deferredRunIds: [] },
  };
}
