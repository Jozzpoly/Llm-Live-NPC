import { describe, expect, it } from "vitest";
import { createZeroProviderLocalLifeSlice } from "./zero-provider-local-life-slice";

const RESIDENT_ID = "resident.mira";

function residentActor(slice: ReturnType<typeof createZeroProviderLocalLifeSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === RESIDENT_ID);
  if (!actor) throw new Error("R1 Mira actor missing");
  return actor;
}

function advanceUntil(
  slice: ReturnType<typeof createZeroProviderLocalLifeSlice>,
  predicate: () => boolean,
  maxTicks: number,
) {
  let last = slice.advanceOneWorldTick();
  let ticks = 1;
  while (!predicate() && ticks < maxTicks) {
    if (last.status === "blocked" || last.status === "authority_lost") {
      throw new Error(`R1 failed before target boundary: ${JSON.stringify(last)}`);
    }
    last = slice.advanceOneWorldTick();
    ticks += 1;
  }
  expect(ticks).toBeLessThan(maxTicks);
  return last;
}

describe("post-stress R1 zero-provider local life", () => {
  it("locally bounds irrelevant perception, interrupts and returns to the exact matter, creates a factual consequence, then remains quietly alive with zero provider requests", () => {
    const slice = createZeroProviderLocalLifeSlice();

    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "active",
      activeRunId: "run.mira.local-life.pickup-basket",
    });

    advanceUntil(
      slice,
      () => slice.phase() === "delivery" && slice.authority.motionOwner() === slice.mainPlaceRunId,
      240,
    );

    expect(slice.pendingCognitionReasons()).toEqual([]);
    const deliveryBinding = slice.kernel.runBinding(slice.mainPlaceRunId);
    expect(deliveryBinding).toMatchObject({
      matterId: slice.mainMatterId,
      runId: slice.mainPlaceRunId,
    });

    const overheard = slice.playerSpeak("Mówię sobie pod nosem.", false);
    const positionBeforeBackground = residentActor(slice).position;
    const afterBackground = slice.advanceOneWorldTick();
    expect(afterBackground.status).not.toBe("interruption_started");
    expect(slice.phase()).toBe("delivery");
    expect(slice.interruption().status).toBe("none");
    expect(slice.kernel.runBinding(slice.mainPlaceRunId)).toEqual(deliveryBinding);
    expect(slice.kernel.canRunMutateWorld(slice.mainPlaceRunId)).toBe(true);
    expect(residentActor(slice).position).not.toEqual(positionBeforeBackground);

    const backgroundDecision = slice.localDecisions().find(
      (decision) => decision.occurrenceId === overheard.id,
    );
    expect(backgroundDecision).toMatchObject({
      classification: "background",
      cognitionReasonSettled: true,
    });
    expect(slice.pendingCognitionReasons()).toEqual([]);

    const addressed = slice.playerSpeak("Mira, chwila!", true);
    const started = slice.advanceOneWorldTick();
    expect(started.status).toBe("interruption_started");
    if (started.status !== "interruption_started") {
      throw new Error(`unexpected R1 interruption boundary: ${started.status}`);
    }

    expect(started.interruption).toMatchObject({
      status: "active",
      mainRunId: slice.mainPlaceRunId,
    });
    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "suspended",
      activeRunId: slice.mainPlaceRunId,
    });
    expect(slice.kernel.runBinding(slice.mainPlaceRunId)).toEqual(deliveryBinding);
    expect(slice.kernel.canRunMutateWorld(slice.mainPlaceRunId)).toBe(false);

    const addressedDecision = slice.localDecisions().find(
      (decision) => decision.occurrenceId === addressed.id,
    );
    expect(addressedDecision).toMatchObject({
      classification: "interrupt",
      cognitionReasonSettled: false,
    });
    expect(slice.pendingCognitionReasons()).toEqual([
      expect.objectContaining({
        kind: "heard_speech",
        id: addressedDecision?.cognitionReasonId,
      }),
    ]);
    expect(slice.attention().kind).toBe("actor");

    const heldPosition = residentActor(slice).position;
    const responded = slice.advanceOneWorldTick();
    expect(responded.status).toBe("interruption_responded");
    expect(residentActor(slice).position).toEqual(heldPosition);
    if (responded.status !== "interruption_responded") {
      throw new Error(`unexpected R1 response boundary: ${responded.status}`);
    }
    expect(responded.interruption.responseOccurrenceId).not.toBeNull();
    expect(slice.world.diagnostics().recentOccurrences).toContainEqual(expect.objectContaining({
      id: responded.interruption.responseOccurrenceId,
      kind: "speech",
      actorId: RESIDENT_ID,
      text: "Tak?",
      addressedActorIds: ["player.jozz"],
    }));

    let resumed = false;
    let guard = 0;
    while (!resumed && guard < 80) {
      const step = slice.advanceOneWorldTick();
      if (step.status === "interruption_resumed") resumed = true;
      guard += 1;
    }
    expect(resumed).toBe(true);
    expect(guard).toBeLessThan(80);
    expect(slice.phase()).toBe("delivery");
    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "active",
      activeRunId: slice.mainPlaceRunId,
      suspendedByMatterId: null,
    });
    expect(slice.kernel.runBinding(slice.mainPlaceRunId)).toEqual(deliveryBinding);
    expect(slice.kernel.canRunMutateWorld(slice.mainPlaceRunId)).toBe(true);
    expect(slice.attention()).toMatchObject({
      kind: "matter",
      matterId: slice.mainMatterId,
    });

    advanceUntil(slice, () => slice.phase() === "settled", 900);

    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.world.materialObject(slice.objectId)?.location).toEqual({
      kind: "free",
      position: slice.destination,
    });
    expect(slice.attention()).toMatchObject({
      kind: "quiet",
    });
    expect(slice.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ kind: "heard_speech" }),
    ]);

    const quietPosition = residentActor(slice).position;
    for (let tick = 0; tick < 600; tick += 1) {
      const step = slice.advanceOneWorldTick();
      expect(step.status).toBe("settled");
    }

    expect(slice.phase()).toBe("settled");
    expect(residentActor(slice).position).toEqual(quietPosition);
    expect(slice.world.materialObject(slice.objectId)?.location).toEqual({
      kind: "free",
      position: slice.destination,
    });
    expect(slice.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ kind: "heard_speech" }),
    ]);
    expect(slice.attention()).toMatchObject({
      kind: "quiet",
      reason: expect.stringContaining("no unresolved local embodied matter"),
    });

    // Quiet is not inertness: a later addressed contact wakes local attention without
    // resurrecting the already-resolved basket matter or requiring higher cognition.
    const lateCall = slice.playerSpeak("Mira?", true);
    const quietWake = slice.advanceOneWorldTick();
    expect(quietWake.status).toBe("interruption_started");
    if (quietWake.status !== "interruption_started") {
      throw new Error(`quiet resident did not expose local contact wakeup: ${quietWake.status}`);
    }
    expect(quietWake.interruption).toMatchObject({
      status: "active",
      mainRunId: null,
    });
    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.localDecisions().find((decision) => decision.occurrenceId === lateCall.id)).toMatchObject({
      classification: "interrupt",
      cognitionReasonSettled: false,
    });
    expect(slice.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ kind: "heard_speech" }),
      expect.objectContaining({ kind: "heard_speech" }),
    ]);

    const quietResponded = slice.advanceOneWorldTick();
    expect(quietResponded.status).toBe("interruption_responded");
    expect(residentActor(slice).position).toEqual(quietPosition);

    let quietReturned = false;
    let quietGuard = 0;
    while (!quietReturned && quietGuard < 80) {
      const step = slice.advanceOneWorldTick();
      if (step.status === "interruption_resumed") quietReturned = true;
      quietGuard += 1;
    }
    expect(quietReturned).toBe(true);
    expect(slice.phase()).toBe("settled");
    expect(slice.kernel.matter(slice.mainMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.attention()).toMatchObject({
      kind: "quiet",
      reason: expect.stringContaining("no unresolved local matter"),
    });
    expect(slice.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ kind: "heard_speech" }),
      expect.objectContaining({ kind: "heard_speech" }),
    ]);
    expect(slice.world.materialObject(slice.objectId)?.location).toEqual({
      kind: "free",
      position: slice.destination,
    });
  });

  it("replays the same bounded local-life arc deterministically", () => {
    function run() {
      const slice = createZeroProviderLocalLifeSlice();
      advanceUntil(
        slice,
        () => slice.phase() === "delivery" && slice.authority.motionOwner() === slice.mainPlaceRunId,
        240,
      );
      slice.playerSpeak("Tło.", false);
      slice.advanceOneWorldTick();
      slice.playerSpeak("Mira, chwila!", true);
      slice.advanceOneWorldTick();

      let guard = 0;
      while (slice.phase() !== "delivery" && guard < 80) {
        slice.advanceOneWorldTick();
        guard += 1;
      }
      advanceUntil(slice, () => slice.phase() === "settled", 900);

      return {
        tick: slice.world.tick,
        object: slice.world.materialObject(slice.objectId),
        matter: slice.kernel.matter(slice.mainMatterId),
        interruption: slice.interruption(),
        decisions: slice.localDecisions().map((decision) => ({
          tick: decision.tick,
          classification: decision.classification,
          occurrenceId: decision.occurrenceId,
          settled: decision.cognitionReasonSettled,
        })),
        actor: residentActor(slice),
        pending: slice.pendingCognitionReasons().map((reason) => ({
          id: reason.id,
          kind: reason.kind,
          evidenceIds: [...reason.evidenceIds],
        })),
      };
    }

    expect(run()).toEqual(run());
  });
});
