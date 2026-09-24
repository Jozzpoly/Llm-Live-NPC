import { describe, expect, it } from "vitest";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
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

    // This is a legitimate adaptive review, not a fabricated event-specific pressure.
    // One World tick is enough because reviewAfterSeconds equals fixedDeltaSeconds.
    oren.scheduleAdaptiveReview(
      world.tick,
      world.options.fixedDeltaSeconds,
      world.options.fixedDeltaSeconds,
    );
    world.step();

    const request = cognition.takeReadyRequest();
    expect(request).not.toBeNull();
    if (!request) throw new Error("R6 release-gap characterization expected a quiet review");

    const review = request.batch.reasons.find((reason) => reason.kind === "quiet_review") ?? null;
    expect(review).not.toBeNull();
    if (!review) throw new Error("R6 release-gap characterization lacked quiet-review origin");

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

    // Higher cognition can semantically conclude that no new commitment should be
    // created because the old "while" is over. This is a fully legal settlement.
    // The current contract, however, has no authority field that targets an existing
    // standing matter, so the old responsibility remains active unchanged.
    const settlement = cognition.settleCommitment(request, {
      version: 1,
      commitmentDecision: {
        kind: "decline",
        reason:
          "Nie tworzę nowego zobowiązania; uważam, że obiecana chwila przy Neli już minęła.",
      },
      beliefs: [],
      concerns: [],
      reviewAfterSeconds: 30,
    }, review.id);

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
