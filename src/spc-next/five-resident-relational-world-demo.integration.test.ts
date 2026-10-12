import { describe, expect, it } from "vitest";
import {
  FiveResidentRelationalWorldDemo,
  RELATIONAL_DEMO_IDA,
  RELATIONAL_DEMO_JANEK,
  RELATIONAL_DEMO_SPEECH,
} from "./five-resident-relational-world-demo";

function reach(
  lab: FiveResidentRelationalWorldDemo,
  expected: ReturnType<FiveResidentRelationalWorldDemo["state"]>["phase"],
): void {
  for (let i = 0; i < 2_000 && lab.state().phase !== expected
    && lab.state().phase !== "failed"; i += 1) {
    lab.advanceOneWorldTick();
  }
  expect(lab.state().failure).toBeNull();
  expect(lab.state().phase).toBe(expected);
}

describe("R6 browser-shaped Ida ↔ Janek episode: zero provider, shared World", () => {
  it("requires a human-marked test decision AFTER a true personally relevant return, then factually speaks", () => {
    const lab = new FiveResidentRelationalWorldDemo(true);
    expect(lab.host.claimedResidentIds()).toHaveLength(5);
    expect(lab.state().modelCalls).toBe(0);
    expect(lab.state().initialChoicesAuthored).toBe(true);
    expect(lab.chooseTestResponse("respond")).toBe("not_ready");
    reach(lab, "awaiting_choice");
    const s = lab.state();
    expect(s.standingMatterId).toBeTruthy();
    expect(s.privateReturnReasonId).toBeTruthy();
    expect(s.factualReply).toBe(false);
    const janek = lab.host.life(RELATIONAL_DEMO_JANEK)!;
    const ida = lab.host.life(RELATIONAL_DEMO_IDA)!;
    expect(janek.currentLifeView().matters.find(m =>
      m.id === s.standingMatterId && m.status === "active"
    )).toBeTruthy();
    expect(ida.currentLifeView().matters.some(m =>
      m.semanticIntent?.kind === "standing_social_commitment"
    )).toBe(false);
    for (let i = 0; i < 360; i += 1) lab.advanceOneWorldTick();
    expect(lab.state().phase).toBe("awaiting_choice");
    expect(lab.world.diagnostics().recentOccurrences.some(o =>
      o.actorId === RELATIONAL_DEMO_JANEK && o.text === RELATIONAL_DEMO_SPEECH.response
    )).toBe(false);

    expect(lab.chooseTestResponse("respond")).toBe("accepted");
    reach(lab, "spoken");
    expect(lab.state().factualReply).toBe(true);
    expect(lab.world.diagnostics().recentOccurrences.some(o =>
      o.kind === "speech" && o.actorId === RELATIONAL_DEMO_JANEK
        && o.text === RELATIONAL_DEMO_SPEECH.response
        && o.addressedActorIds.includes(RELATIONAL_DEMO_IDA)
    )).toBe(true);
    expect(lab.state().modelCalls).toBe(0);
    expect(lab.chooseTestResponse("respond")).toBe("not_ready");
  }, 30_000);

  it("keeps exactly the same true actor return neutral without an earlier owned promise", () => {
    const lab = new FiveResidentRelationalWorldDemo(false);
    reach(lab, "control_complete");
    expect(lab.state()).toMatchObject({
      phase: "control_complete", withEarlierPromise: false,
      standingMatterId: null, privateReturnReasonId: null,
      localDecision: "not_selected", factualReply: false, modelCalls: 0,
    });
    expect(lab.chooseTestResponse("respond")).toBe("not_ready");
    expect(lab.host.life(RELATIONAL_DEMO_JANEK)!.resident.pendingCognitionReasons()
      .filter(r => r.kind === "uncertainty")).toHaveLength(0);
  }, 30_000);

  it("admits test-selected DEFER as nonaction, retaining original social history", () => {
    const lab = new FiveResidentRelationalWorldDemo(true);
    reach(lab, "awaiting_choice");
    const standingId = lab.state().standingMatterId!;
    expect(lab.chooseTestResponse("defer")).toBe("accepted");
    reach(lab, "deferred");
    for (let i = 0; i < 220; i += 1) lab.advanceOneWorldTick();
    expect(lab.state().factualReply).toBe(false);
    expect(lab.host.life(RELATIONAL_DEMO_JANEK)!.currentLifeView().matters
      .find(m => m.id === standingId)?.status).toBe("active");
    expect(lab.state().modelCalls).toBe(0);
  }, 30_000);
});
