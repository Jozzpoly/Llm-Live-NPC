import { describe, expect, it } from "vitest";
import type { ResidentActivity, Vec2 } from "./contracts";
import {
  IDA_MESSAGE_MATTER_ID,
  IDA_MESSAGE_TEXT,
  createFiveResidentIdaMessageDeliverySlice,
} from "./five-resident-ida-message-delivery-slice";

const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const HIDDEN_JANEK_POSITION = Object.freeze({ x: 1_200, y: 720 });
const RELOCATION_GUARD = 600;
const EXECUTION_GUARD = 1_100;

describe("Ida message delivery hidden-recipient relational pressure", () => {
  it("keeps Ida's body identical while private evidence is identical, then blocks at stale contact instead of oracle-tracking hidden Janek", () => {
    const baseline = createFiveResidentIdaMessageDeliverySlice();
    const hidden = createFiveResidentIdaMessageDeliverySlice();

    const beforeHiddenContact = hidden.idaRecipientContact();
    expect(beforeHiddenContact).toMatchObject({ id: JANEK_ID, currentlyVisible: false });

    const relocationTicks = relocateJanekOutsideIdaKnowledge(hidden, HIDDEN_JANEK_POSITION);
    baseline.world.step(relocationTicks);

    // The World histories now differ, but Ida's legally available contact state does not.
    expect(hidden.idaRecipientContact()).toEqual(beforeHiddenContact);
    expect(baseline.idaRecipientContact()).toEqual(beforeHiddenContact);
    expect(actorPosition(hidden, JANEK_ID)).not.toEqual(actorPosition(baseline, JANEK_ID));
    expect(actorPosition(hidden, IDA_ID)).toEqual(actorPosition(baseline, IDA_ID));

    let legalDivergenceObserved = false;
    let guard = 0;
    while (guard < EXECUTION_GUARD) {
      const baselineContact = baseline.idaRecipientContact();
      const hiddenContact = hidden.idaRecipientContact();
      if (baselineContact?.currentlyVisible !== hiddenContact?.currentlyVisible) {
        legalDivergenceObserved = true;
        expect(baselineContact?.currentlyVisible).toBe(true);
        expect(hiddenContact?.currentlyVisible).toBe(false);
        break;
      }

      expect(baselineContact).toEqual(hiddenContact);
      expectVecClose(actorPosition(baseline, IDA_ID), actorPosition(hidden, IDA_ID));

      const baselineStep = baseline.advanceOneWorldTick();
      const hiddenStep = hidden.advanceOneWorldTick();
      expect(baselineStep.status).toBe("running");
      expect(hiddenStep.status).toBe("running");
      guard += 1;
    }

    expect(guard).toBeLessThan(EXECUTION_GUARD);
    expect(legalDivergenceObserved).toBe(true);
    // The worlds diverged epistemically, not because hidden World truth steered Ida.
    expectVecClose(actorPosition(baseline, IDA_ID), actorPosition(hidden, IDA_ID));

    let baselineTerminal: ReturnType<typeof baseline.advanceOneWorldTick> | null = null;
    let hiddenTerminal: ReturnType<typeof hidden.advanceOneWorldTick> | null = null;
    let terminalGuard = 0;
    while (terminalGuard < EXECUTION_GUARD && (!baselineTerminal || baselineTerminal.status === "running" || !hiddenTerminal || hiddenTerminal.status === "running")) {
      if (!baselineTerminal || baselineTerminal.status === "running") baselineTerminal = baseline.advanceOneWorldTick();
      if (!hiddenTerminal || hiddenTerminal.status === "running") hiddenTerminal = hidden.advanceOneWorldTick();
      terminalGuard += 1;
    }

    expect(terminalGuard).toBeLessThan(EXECUTION_GUARD);
    expect(baselineTerminal?.status).toBe("delivered");
    expect(hiddenTerminal?.status).toBe("blocked");
    if (hiddenTerminal?.status !== "blocked") throw new Error(`unexpected hidden I1 terminal: ${hiddenTerminal?.status ?? "none"}`);
    expect(hiddenTerminal.local.reason).toBe("recipient_absent_at_best_known_contact");

    const hiddenMatter = hidden.kernel.matter(IDA_MESSAGE_MATTER_ID);
    expect(hiddenTerminal.reconciliation).toMatchObject({
      status: "recorded",
      matter: {
        status: "active",
        activeRunId: null,
      },
    });
    expect(hiddenMatter).toMatchObject({
      status: "active",
      activeRunId: null,
    });
    expect(hidden.idaRecipientContact()).toMatchObject({
      id: JANEK_ID,
      currentlyVisible: false,
      lastKnownPosition: beforeHiddenContact?.lastKnownPosition,
    });

    expect(hidden.world.diagnostics().recentOccurrences.filter((occurrence) => (
      occurrence.kind === "speech" && occurrence.actorId === IDA_ID && occurrence.text === IDA_MESSAGE_TEXT
    ))).toEqual([]);
    expect(hidden.deliveredOccurrence()).toBeNull();
    expect(hidden.authority.motionOwner()).toBeNull();
  });
});

function relocateJanekOutsideIdaKnowledge(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  target: Vec2,
): number {
  const tickBefore = slice.world.tick;
  slice.world.setResidentActivity(JANEK_ID, travelActivity("janek-hidden-relocation", target));
  let guard = 0;
  while (guard < RELOCATION_GUARD) {
    const position = actorPosition(slice, JANEK_ID);
    if (Math.hypot(position.x - target.x, position.y - target.y) <= 18) break;
    slice.world.step();
    guard += 1;
  }
  if (guard >= RELOCATION_GUARD) throw new Error("hidden Janek relocation exceeded guard");
  slice.world.setResidentActivity(JANEK_ID, idleActivity("janek-hidden-after-relocation"));
  slice.world.step();
  return slice.world.tick - tickBefore;
}

function actorPosition(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  actorId: string,
): Vec2 {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`missing relational actor ${actorId}`);
  return { ...actor.position };
}

function expectVecClose(a: Vec2, b: Vec2): void {
  expect(a.x).toBeCloseTo(b.x, 10);
  expect(a.y).toBeCloseTo(b.y, 10);
}

function travelActivity(id: string, targetPosition: Vec2): ResidentActivity {
  return {
    id: `activity:${id}:i1-relational`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...targetPosition },
    text: null,
    speed: 110,
    reason: "adversarial hidden World relocation outside Ida's knowledge",
  };
}

function idleActivity(id: string): ResidentActivity {
  return {
    id: `activity:${id}:idle:i1-relational`,
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "hold hidden recipient after adversarial relocation",
  };
}
