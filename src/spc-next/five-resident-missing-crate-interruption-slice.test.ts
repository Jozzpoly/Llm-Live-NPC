import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateInterruptionSlice } from "./five-resident-missing-crate-interruption-slice";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MAIN_MATTER_ID = "matter.janek.missing-crate";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const CRATE_ID = "crate.workshop.01";
const MAX_TO_SEARCH = 900;
const MAX_TO_RESOLVED = 1_500;

function actor(slice: ReturnType<typeof createFiveResidentJanekMissingCrateInterruptionSlice>) {
  const result = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === JANEK_ID);
  if (!result) throw new Error("Janek missing from interruption specimen");
  return result;
}

function actorPosition(slice: ReturnType<typeof createFiveResidentJanekMissingCrateInterruptionSlice>) {
  return actor(slice).position;
}

function advanceToSearch(slice: ReturnType<typeof createFiveResidentJanekMissingCrateInterruptionSlice>) {
  let guard = 0;
  while (slice.phase() !== "searching" && guard < MAX_TO_SEARCH) {
    slice.advanceOneWorldTick();
    guard += 1;
  }
  expect(guard).toBeLessThan(MAX_TO_SEARCH);
  expect(slice.phase()).toBe("searching");
  expect(slice.kernel.matter(MAIN_MATTER_ID)).toMatchObject({
    status: "active",
    semanticRevision: 3,
    activeRunId: SEARCH_RUN_ID,
  });
  const binding = slice.kernel.runBinding(SEARCH_RUN_ID);
  expect(binding).toMatchObject({
    runId: SEARCH_RUN_ID,
    matterId: MAIN_MATTER_ID,
    semanticRevision: 3,
  });
  return binding!;
}

describe("five-resident missing-crate player interruption and return", () => {
  it("suspends the exact search run from a legal addressed percept, turns toward its private hearing cue, answers in World, then resumes the same run and finishes its own matter", () => {
    const slice = createFiveResidentJanekMissingCrateInterruptionSlice();
    const bindingBefore = advanceToSearch(slice);

    // Establish that the search is genuinely embodied before the participant interrupts it.
    const beforeSearchMotion = actorPosition(slice);
    slice.advanceOneWorldTick();
    const afterSearchMotion = actorPosition(slice);
    expect(afterSearchMotion).not.toEqual(beforeSearchMotion);
    expect(slice.authority.motionOwner()).toBe(SEARCH_RUN_ID);
    const searchFacingBeforeCall = actor(slice).facing;
    expect(searchFacingBeforeCall.x).toBeGreaterThan(0.9);

    const call = slice.playerAddressJanek("Janek, chwila!");
    expect(call).toMatchObject({
      kind: "speech",
      actorId: PLAYER_ID,
      text: "Janek, chwila!",
      addressedActorIds: [JANEK_ID],
    });

    const started = slice.advanceOneWorldTick();
    expect(started.status).toBe("interruption_started");
    if (started.status !== "interruption_started") throw new Error(`unexpected interruption boundary: ${started.status}`);

    const interrupt = started.interruption;
    expect(interrupt).toMatchObject({
      status: "active",
      mainRunId: SEARCH_RUN_ID,
      addressedDirection: { x: -1, y: 0 },
      responseTick: null,
      resumedAtTick: null,
    });
    expect(interrupt.addressedPerceptId).not.toBeNull();
    expect(interrupt.interruptMatterId).not.toBeNull();
    expect(interrupt.interruptRunId).not.toBeNull();
    if (!interrupt.addressedPerceptId || !interrupt.interruptMatterId || !interrupt.interruptRunId) {
      throw new Error("interrupt evidence/authority ids missing");
    }

    expect(slice.world.residentDiagnostics(JANEK_ID).recentPercepts).toContainEqual(expect.objectContaining({
      id: interrupt.addressedPerceptId,
      occurrenceId: call.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: PLAYER_ID,
      text: "Janek, chwila!",
      addressed: true,
      spatial: { kind: "directional", direction: { x: -1, y: 0 }, distanceBand: "far" },
    }));
    expect(slice.kernel.matter(MAIN_MATTER_ID)).toMatchObject({
      status: "suspended",
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
      suspendedByMatterId: interrupt.interruptMatterId,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(false);
    expect(slice.kernel.matter(interrupt.interruptMatterId)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: interrupt.interruptRunId,
    });
    expect(slice.kernel.canRunMutateWorld(interrupt.interruptRunId)).toBe(true);
    expect(slice.authority.motionOwner()).toBeNull();

    const heldPosition = actorPosition(slice);
    const responded = slice.advanceOneWorldTick();
    expect(responded.status).toBe("interruption_responded");
    if (responded.status !== "interruption_responded") throw new Error(`unexpected response boundary: ${responded.status}`);
    expect(actorPosition(slice)).toEqual(heldPosition);
    expect(actor(slice)).toMatchObject({
      velocity: { x: 0, y: 0 },
      facing: { x: -1, y: 0 },
    });
    expect(responded.interruption.addressedDirection).toEqual({ x: -1, y: 0 });
    expect(responded.interruption.responseTick).not.toBeNull();
    expect(responded.interruption.responseOccurrenceId).not.toBeNull();

    const responseOccurrence = slice.world.diagnostics().recentOccurrences.find(
      (occurrence) => occurrence.id === responded.interruption.responseOccurrenceId,
    );
    expect(responseOccurrence).toMatchObject({
      kind: "speech",
      actorId: JANEK_ID,
      text: "Tak?",
      addressedActorIds: [PLAYER_ID],
    });
    expect(slice.authority.motionOwner()).toBe(responded.interruption.interruptRunId);

    let resumed = false;
    let holdSteps = 0;
    while (!resumed && holdSteps < 80) {
      const step = slice.advanceOneWorldTick();
      expect(actorPosition(slice)).toEqual(heldPosition);
      expect(actor(slice).facing).toEqual({ x: -1, y: 0 });
      expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
      if (step.status === "interruption_resumed") {
        resumed = true;
        expect(step.interruption.status).toBe("completed");
        expect(step.interruption.resumedAtTick).not.toBeNull();
      }
      holdSteps += 1;
    }
    expect(resumed).toBe(true);
    expect(holdSteps).toBeGreaterThan(1);

    expect(slice.kernel.matter(interrupt.interruptMatterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(slice.kernel.matter(MAIN_MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
      suspendedByMatterId: null,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(true);
    expect(actor(slice).facing).toEqual({ x: -1, y: 0 });

    const resumePosition = actorPosition(slice);
    slice.advanceOneWorldTick();
    expect(actorPosition(slice)).not.toEqual(resumePosition);
    expect(actor(slice).facing.x).toBeGreaterThan(0.9);
    expect(slice.authority.motionOwner()).toBe(SEARCH_RUN_ID);

    let guard = 0;
    while (slice.phase() !== "resolved" && guard < MAX_TO_RESOLVED) {
      slice.advanceOneWorldTick();
      guard += 1;
    }
    expect(guard).toBeLessThan(MAX_TO_RESOLVED);
    expect(slice.phase()).toBe("resolved");
    expect(slice.kernel.matter(MAIN_MATTER_ID)).toMatchObject({
      status: "resolved",
      semanticRevision: 5,
      activeRunId: null,
    });
    expect(slice.world.materialObject(CRATE_ID)?.location).toEqual({ kind: "held", actorId: JANEK_ID });
    expect(slice.authority.recentActionFacts()).toHaveLength(1);
    expect(slice.authority.recentActionFacts()[0]).toMatchObject({
      runId: "run.janek.pickup-reacquired-crate",
      action: { kind: "material_pickup", objectId: CRATE_ID },
      resolution: { status: "resolved", outcomeStatus: "succeeded", code: "picked_up" },
    });
  });

  it("does not interrupt or redirect attention merely because nearby player speech is audible but not addressed to Janek", () => {
    const slice = createFiveResidentJanekMissingCrateInterruptionSlice();
    const bindingBefore = advanceToSearch(slice);
    slice.advanceOneWorldTick();
    const facingBefore = actor(slice).facing;

    const overheard = slice.world.speak(PLAYER_ID, "Mówię sobie pod nosem.", 420, []);
    expect(overheard.addressedActorIds).toEqual([]);

    const first = slice.advanceOneWorldTick();
    expect(first.status).toBe("base");
    expect(slice.phase()).toBe("searching");
    expect(slice.interruption().status).toBe("none");
    expect(slice.world.residentDiagnostics(JANEK_ID).recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: overheard.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: PLAYER_ID,
      text: "Mówię sobie pod nosem.",
      addressed: false,
    }));
    expect(slice.kernel.matter(MAIN_MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(true);
    expect(actor(slice).facing).toEqual(facingBefore);
  });
});
