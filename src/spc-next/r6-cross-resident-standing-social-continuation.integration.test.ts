import { describe, expect, it } from "vitest";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const REGION_ID = "r6-generic-room";
const NELA_PROMPT = "Oren, zostaniesz tu ze mną jeszcze chwilę?";
const OREN_PROMISE = "Tak, zostanę tu z tobą jeszcze chwilę.";
const OREN_STANDING_GOAL = "pozostać dostępnym dla Neli jeszcze przez chwilę";
const EXECUTION_GUARD = 600;
const COGNITION_GUARD = 24;

describe("R6-C cross-resident standing-social-continuation genericity", () => {
  it("runs the native factual-speech -> standing-history chain for Oren without the Mira/R5 fixture", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
      regions: [{
        id: REGION_ID,
        label: "R6 Generic Room",
        minX: 0,
        minY: 0,
        maxX: 1_600,
        maxY: 1_000,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });

    const oren = world.addResident(OREN_ID, "Oren", { x: 700, y: 500 });
    world.addResident(NELA_ID, "Nela", { x: 820, y: 500 });
    world.familiarizeResidentWithRegions(OREN_ID, [REGION_ID]);
    world.familiarizeResidentWithRegions(NELA_ID, [REGION_ID]);

    const navigation = new RegionNavigationGraph(
      [{ id: REGION_ID, destinationPoint: { x: 700, y: 500 } }],
      [],
    );
    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation,
      identityNamespace: "oren-r6-generic",
    });
    const cognition = new ResidentCausalCognitionLane(life);
    const execution = new ResidentCausalExecutionCoordinator(life);

    // Nela's initiating speech is a factual resident World effect under her own exact
    // run authority. Only Oren's response semantics are the variable under test.
    const nelaKernel = new ResidentContinuityKernel();
    const nelaAuthority = new ResidentWorldExecutionAuthority(NELA_ID, nelaKernel, world);

    // Establish ordinary private sight/identity before the addressed speech.
    world.step();
    expect(oren.cognitionContext({
      residentId: OREN_ID,
      requestedAtTick: world.tick,
      reasons: [],
    }).knownActors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: NELA_ID, currentlyVisible: true }),
    ]));

    const nelaOrigin = nelaKernel.recordEvidence({
      id: "evidence.nela.r6.generic.address",
      tick: world.tick,
      kind: "life_context",
      summary: "Nela already decided to address Oren once in the bounded genericity falsifier.",
    });
    const nelaMatterId = "matter.nela.r6.generic.address";
    const nelaRunId = "run.nela.r6.generic.address";
    nelaKernel.openMatter({
      id: nelaMatterId,
      originEvidenceId: nelaOrigin.id,
      semanticCourse: "ask Oren one bounded social question",
    });
    nelaKernel.bindRun({
      matterId: nelaMatterId,
      taskId: "task.nela.r6.generic.address",
      runId: nelaRunId,
    });
    const speechResult = nelaAuthority.apply({
      runId: nelaRunId,
      effects: [{
        kind: "speech",
        text: NELA_PROMPT,
        radius: 420,
        addressedActorIds: [OREN_ID],
      }],
    });
    expect(speechResult.status).toBe("applied");
    if (speechResult.status !== "applied") {
      throw new Error("R6-C Nela factual speech lost exact World authority");
    }
    expect(speechResult.occurrences).toHaveLength(1);

    const nelaOutcome = nelaKernel.reconcileRunOutcome({
      runId: nelaRunId,
      tick: world.tick,
      status: "succeeded",
      summary: "Nela factually addressed Oren once.",
    });
    expect(nelaOutcome.status).toBe("recorded");
    nelaKernel.resolveMatter(nelaMatterId);

    // Deliver the factual occurrence into Oren's private perception.
    world.step();

    let request = cognition.takeReadyRequest();
    for (let index = 0; index < COGNITION_GUARD && !request; index += 1) {
      execution.stepFocusedRun();
      world.step();
      request = cognition.takeReadyRequest();
    }
    if (!request) throw new Error("R6-C Oren produced no cognition request from Nela's speech");

    const origin = request.batch.reasons.find((reason) => reason.kind === "heard_speech") ?? null;
    expect(origin).not.toBeNull();
    if (!origin) throw new Error("R6-C Oren request lacked exact heard-speech origin");

    const proposal: ResidentLifeIntentProposal = {
      version: 1,
      commitmentDecision: {
        kind: "accept",
        reason: "Nela addressed me directly and I deliberately make one future social commitment.",
        intent: {
          kind: "communicate",
          goal: "tell Nela that I will remain with her for a while",
          targetActorId: NELA_ID,
          targetRegionId: null,
          targetPosition: null,
          text: OREN_PROMISE,
        },
        standingSocialCommitment: {
          goal: OREN_STANDING_GOAL,
        },
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    };

    const admitted = cognition.settleCommitment(request, proposal, origin.id);
    expect(admitted).toMatchObject({
      status: "applied",
      residentId: OREN_ID,
      decision: "accept",
      commitment: {
        matterId: expect.any(String),
        runId: expect.any(String),
      },
    });
    if (admitted.status !== "applied" || !admitted.commitment) {
      throw new Error("R6-C Oren native commitment was not admitted");
    }

    const sourceMatter = life.kernel.matter(admitted.commitment.matterId);
    expect(sourceMatter).toMatchObject({
      status: "active",
      activeRunId: admitted.commitment.runId,
      semanticIntent: {
        kind: "communicate_actor",
        targetActorId: NELA_ID,
        text: OREN_PROMISE,
        standingSocialCommitment: {
          goal: OREN_STANDING_GOAL,
        },
      },
    });
    expect(life.currentLifeView().matters.some(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment",
    )).toBe(false);

    let standing = life.currentLifeView().matters.find(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment",
    ) ?? null;
    for (let index = 0; index < EXECUTION_GUARD && !standing; index += 1) {
      execution.stepFocusedRun();
      world.step();
      standing = life.currentLifeView().matters.find(
        (matter) => matter.semanticIntent?.kind === "standing_social_commitment",
      ) ?? null;
    }

    expect(life.kernel.matter(admitted.commitment.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(standing).not.toBeNull();
    if (!standing) throw new Error("R6-C Oren produced no standing history after factual speech");

    const orenSpeeches = world.diagnostics().recentOccurrences.filter(
      (occurrence) => occurrence.kind === "speech"
        && occurrence.actorId === OREN_ID
        && occurrence.text === OREN_PROMISE
        && occurrence.addressedActorIds.includes(NELA_ID),
    );
    expect(orenSpeeches).toHaveLength(1);

    expect(standing).toMatchObject({
      status: "active",
      activeRun: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: OREN_STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: OREN_PROMISE,
      },
      originEvidence: {
        kind: "resident_originated_social_commitment",
        sourceRunId: admitted.commitment.runId,
      },
    });
    expect(life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });

    // This is not a renamed Mira assertion: the full private causal result belongs to
    // Oren and points at Nela, while durable wording is his exact factual speech.
    expect(standing.semanticIntent?.kind).toBe("standing_social_commitment");
    if (standing.semanticIntent?.kind !== "standing_social_commitment") {
      throw new Error("R6-C standing intent unexpectedly changed kind");
    }
    expect(standing.semanticIntent.counterpartyActorId).toBe(NELA_ID);
    expect(standing.semanticIntent.commitment).toBe(orenSpeeches[0]!.text);
    expect(standing.semanticIntent.commitment).not.toContain("Mira");
    expect(standing.semanticIntent.commitment).not.toContain("Ida");
  });
});
