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

describe("R6 standing social commitment endogenous-release gap characterization", () => {
  it("shows higher cognition can review the standing history but current life-intent settlement cannot end it", () => {
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

    // Higher cognition can now legally settle the release cue and explicitly state that
    // no new commitment should be created because the old responsibility is over. The
    // current contract still has no authority field targeting an existing standing
    // matter, so the old responsibility remains active unchanged.
    const settlement = cognition.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "decline",
        reason:
          "Nela zwolniła mnie z wcześniejszego zobowiązania; nie tworzę z tego nowej sprawy.",
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, releaseCue.id);

    expect(settlement).toEqual({
      status: "applied",
      residentId: OREN_ID,
      decision: "decline",
      commitment: null,
    });
    expect(life.kernel.matter(STANDING_ID)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: STANDING_TEXT,
      },
    });

    // Characterization verdict: explicit release authority exists locally on
    // originatedSocialCommitments, but normal higher cognition cannot currently
    // express that lifecycle transition. Without another direct caller the
    // time-bounded-sounding responsibility is therefore semantically sticky.
    expect(typeof life.originatedSocialCommitments.release).toBe("function");
  });
});
