import { describe, expect, it } from "vitest";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { RegionNavigationGraph } from "./region-navigation";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const REGION_ID = "r6-release-gap-room";
const STANDING_ID = "matter.oren.r6.release-gap";
const STANDING_GOAL = "pozostać przy Neli jeszcze przez chwilę";
const STANDING_TEXT = "Tak, zostanę tutaj przy tobie jeszcze chwilę.";

describe("R6 standing social commitment endogenous release", () => {
  it("lets exact factual counterparty release speech end the standing matter without body or World authority", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      regions: [{
        id: REGION_ID,
        label: "R6 Release Gap Room",
        minX: 0,
        minY: 0,
        maxX: 800,
        maxY: 600,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const oren = world.addResident(OREN_ID, "Oren", { x: 400, y: 300 });
    world.familiarizeResidentWithRegions(OREN_ID, [REGION_ID]);

    const navigation = new RegionNavigationGraph(
      [{ id: REGION_ID, destinationPoint: { x: 400, y: 300 } }],
      [],
    );
    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation,
      identityNamespace: "oren-r6-release-gap",
    });
    const cognition = new ResidentCausalCognitionLane(life);

    const origin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.release-gap.origin",
      tick: world.tick,
      kind: "resident_originated_social_commitment",
      summary:
        "Oren previously factually promised Nela that he would remain here with her for a while.",
    });
    life.kernel.openMatter({
      id: STANDING_ID,
      originEvidenceId: origin.id,
      semanticCourse: `${STANDING_GOAL} · ${STANDING_TEXT}`,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: STANDING_TEXT,
      },
    });
    life.matterScope.track(STANDING_ID);

    // R2 deliberately made maintenance deadlines non-semantic: passage of time alone
    // cannot manufacture cognition pressure. This protects provider homeostasis, but it
    // also means a time-bounded-sounding standing commitment cannot reconsider itself.
    oren.scheduleAdaptiveReview(
      world.tick,
      world.options.fixedDeltaSeconds,
      world.options.fixedDeltaSeconds,
    );
    const reviewDeadline = oren.cognitionScheduleDiagnostics().nextQuietReviewTick;
    while (world.tick < reviewDeadline) world.step();

    expect(cognition.takeReadyRequest()).toBeNull();
    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
    });

    // Give the resident a real causal release cue instead of fabricating timer pressure.
    // Nela enters ordinary World truth, is privately perceived, then factually addresses
    // Oren under her own exact run authority.
    world.addResident(NELA_ID, "Nela", { x: 460, y: 300 });
    world.familiarizeResidentWithRegions(NELA_ID, [REGION_ID]);
    const nelaKernel = new ResidentContinuityKernel();
    const nelaAuthority = new ResidentWorldExecutionAuthority(NELA_ID, nelaKernel, world);
    world.step();

    const nelaOrigin = nelaKernel.recordEvidence({
      id: "evidence.nela.r6.release-cue",
      tick: world.tick,
      kind: "life_context",
      summary: "Nela already decided to release Oren from the prior social commitment.",
    });
    const nelaMatterId = "matter.nela.r6.release-cue";
    const nelaRunId = "run.nela.r6.release-cue";
    nelaKernel.openMatter({
      id: nelaMatterId,
      originEvidenceId: nelaOrigin.id,
      semanticCourse: "tell Oren he no longer needs to remain here",
    });
    nelaKernel.bindRun({
      matterId: nelaMatterId,
      taskId: "task.nela.r6.release-cue",
      runId: nelaRunId,
    });
    const releaseSpeech = nelaAuthority.apply({
      runId: nelaRunId,
      effects: [{
        kind: "speech",
        text: "Dzięki, możesz już iść. Nie musisz już zostawać ze mną.",
        radius: 420,
        addressedActorIds: [OREN_ID],
      }],
    });
    expect(releaseSpeech.status).toBe("applied");
    if (releaseSpeech.status !== "applied") {
      throw new Error("R6 release-gap characterization lost Nela speech authority");
    }
    expect(nelaKernel.reconcileRunOutcome({
      runId: nelaRunId,
      tick: world.tick,
      status: "succeeded",
      summary: "Nela factually released Oren from needing to remain.",
    }).status).toBe("recorded");
    nelaKernel.resolveMatter(nelaMatterId);
    world.step();

    const request = cognition.takeReadyRequest();
    expect(request).not.toBeNull();
    if (!request) throw new Error("R6 release-gap characterization expected Nela release cue");

    const releaseCue = request.batch.reasons.find(
      (reason) => reason.kind === "heard_speech",
    ) ?? null;
    expect(releaseCue).not.toBeNull();
    if (!releaseCue) {
      throw new Error("R6 release-gap characterization lacked factual release-cue origin");
    }

    expect(request.context.life.matters).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: STANDING_ID,
        status: "active",
        activeRun: null,
        semanticIntent: {
          kind: "standing_social_commitment",
          goal: STANDING_GOAL,
          counterpartyActorId: NELA_ID,
          commitment: STANDING_TEXT,
        },
      }),
    ]));

    const beforeBody = life.currentLifeView().body;
    const settlement = cognition.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "release_standing",
        reason: "Nela explicitly released me from the responsibility to remain here.",
        matterId: STANDING_ID,
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, releaseCue.id);

    expect(settlement).toEqual({
      status: "applied",
      residentId: OREN_ID,
      decision: "release_standing",
      commitment: null,
    });
    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: STANDING_TEXT,
      },
    });
    expect(life.currentLifeView().body).toEqual(beforeBody);

    const releaseEvidence = life.kernel.recentEvidenceSnapshot().find(
      (evidence) => evidence.kind === "resident_released_social_commitment",
    ) ?? null;
    expect(releaseEvidence).toMatchObject({
      kind: "resident_released_social_commitment",
    });
    expect(releaseEvidence?.summary).toContain(releaseSpeech.occurrences[0]!.id);
  });

  it("rejects release when the factual speech came from another actor than the standing counterparty", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600 },
      regions: [{
        id: REGION_ID,
        label: "R6 Release Gap Room",
        minX: 0,
        minY: 0,
        maxX: 800,
        maxY: 600,
      }],
      anchors: [],
      chunkSize: 128,
      fixedDeltaSeconds: 1 / 60,
    });
    const oren = world.addResident(OREN_ID, "Oren", { x: 400, y: 300 });
    const idaId = "resident.ida";
    world.addResident(idaId, "Ida", { x: 460, y: 300 });
    world.familiarizeResidentWithRegions(OREN_ID, [REGION_ID]);
    world.familiarizeResidentWithRegions(idaId, [REGION_ID]);

    const life = new ResidentCausalLifeSubstrate({
      residentId: OREN_ID,
      resident: oren,
      world,
      navigation: new RegionNavigationGraph(
        [{ id: REGION_ID, destinationPoint: { x: 400, y: 300 } }],
        [],
      ),
      identityNamespace: "oren-r6-release-wrong-counterparty",
    });
    const cognition = new ResidentCausalCognitionLane(life);
    const origin = life.kernel.recordEvidence({
      id: "evidence.oren.r6.release-wrong.origin",
      tick: world.tick,
      kind: "resident_originated_social_commitment",
      summary: "Oren has one standing commitment to Nela.",
    });
    life.kernel.openMatter({
      id: STANDING_ID,
      originEvidenceId: origin.id,
      semanticCourse: `${STANDING_GOAL} · ${STANDING_TEXT}`,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: STANDING_TEXT,
      },
    });
    life.matterScope.track(STANDING_ID);

    const idaKernel = new ResidentContinuityKernel();
    const idaAuthority = new ResidentWorldExecutionAuthority(idaId, idaKernel, world);
    world.step();
    const speechOrigin = idaKernel.recordEvidence({
      id: "evidence.ida.r6.false-release",
      tick: world.tick,
      kind: "life_context",
      summary: "Ida decided to tell Oren that he may leave.",
    });
    const speechMatterId = "matter.ida.r6.false-release";
    const speechRunId = "run.ida.r6.false-release";
    idaKernel.openMatter({
      id: speechMatterId,
      originEvidenceId: speechOrigin.id,
      semanticCourse: "tell Oren he may leave",
    });
    idaKernel.bindRun({
      matterId: speechMatterId,
      taskId: "task.ida.r6.false-release",
      runId: speechRunId,
    });
    const speech = idaAuthority.apply({
      runId: speechRunId,
      effects: [{
        kind: "speech",
        text: "Możesz już iść.",
        radius: 420,
        addressedActorIds: [OREN_ID],
      }],
    });
    expect(speech.status).toBe("applied");
    if (speech.status !== "applied") throw new Error("R6 wrong-counterparty speech lost authority");
    expect(idaKernel.reconcileRunOutcome({
      runId: speechRunId,
      tick: world.tick,
      status: "succeeded",
      summary: "Ida factually addressed Oren.",
    }).status).toBe("recorded");
    idaKernel.resolveMatter(speechMatterId);
    world.step();

    const request = cognition.takeReadyRequest();
    expect(request).not.toBeNull();
    if (!request) throw new Error("R6 wrong-counterparty falsifier produced no cognition request");
    const reason = request.batch.reasons.find((candidate) => candidate.kind === "heard_speech");
    expect(reason).toBeDefined();
    if (!reason) throw new Error("R6 wrong-counterparty falsifier lacked speech origin");

    expect(cognition.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "release_standing",
        reason: "Ida says I may leave.",
        matterId: STANDING_ID,
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, reason.id)).toMatchObject({
      status: "rejected",
      residentId: OREN_ID,
      reason: "intent_rejected",
      detail: "standing release origin is not factual addressed speech from its counterparty",
    });

    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "active",
      activeRunId: null,
    });
  });

});
