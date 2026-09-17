import { describe, expect, it } from "vitest";
import { createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice } from "./five-resident-missing-crate-live-provider-interruption-slice";
import { MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID } from "./five-resident-missing-crate-live-provider-slice";
import type { SemanticFetch } from "./resident-semantic-live-host";

const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const MATTER_ID = "matter.janek.missing-crate";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";

function providerSelectingSearch(): SemanticFetch {
  return async (_input, init) => {
    const run = JSON.parse(String(init?.body ?? "{}")) as { providerRunId?: string };
    return new Response(JSON.stringify({
      ok: true,
      providerRunId: run.providerRunId,
      decision: {
        semanticCourse: "search the remembered workshop area for the familiar crate",
        localCapabilityId: MISSING_CRATE_LIVE_SEARCH_CAPABILITY_ID,
      },
    }), { status: 200 });
  };
}

function janek(slice: ReturnType<typeof createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice>) {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === JANEK_ID);
  if (!actor) throw new Error("Janek missing from live-provider interruption specimen");
  return actor;
}

async function advanceToSearch(slice: ReturnType<typeof createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice>) {
  let guard = 0;
  while (slice.phase() !== "searching" && guard < 800) {
    slice.advanceOneWorldTick();
    if (slice.phase() === "provider_in_flight") await slice.waitForProviderArrival();
    guard += 1;
  }
  expect(guard).toBeLessThan(800);
  expect(slice.phase()).toBe("searching");
  const matter = slice.kernel.matter(MATTER_ID);
  expect(matter).toMatchObject({
    status: "active",
    semanticRevision: 3,
    semanticCourse: "search the remembered workshop area for the familiar crate",
    activeRunId: SEARCH_RUN_ID,
  });
  const binding = slice.kernel.runBinding(SEARCH_RUN_ID);
  expect(binding).toMatchObject({
    matterId: MATTER_ID,
    runId: SEARCH_RUN_ID,
    semanticRevision: 3,
  });
  return binding!;
}

describe("live-provider search player interruption and exact return", () => {
  it("preserves the exact provider-grounded search run across addressed player contact and later completes legal sight reacquisition", async () => {
    const slice = createFiveResidentJanekMissingCrateLiveProviderInterruptionSlice({
      fetcher: providerSelectingSearch(),
    });
    const bindingBefore = await advanceToSearch(slice);

    const searchPositionBefore = { ...janek(slice).position };
    slice.advanceOneWorldTick();
    expect(janek(slice).position).not.toEqual(searchPositionBefore);
    expect(slice.authority.motionOwner()).toBe(SEARCH_RUN_ID);

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
    expect(started.interruption).toMatchObject({
      status: "active",
      mainRunId: SEARCH_RUN_ID,
      responseTick: null,
      resumedAtTick: null,
    });
    expect(started.interruption.interruptMatterId).not.toBeNull();
    expect(started.interruption.interruptRunId).not.toBeNull();
    expect(started.interruption.addressedDirection).not.toBeNull();
    const interruptMatterId = started.interruption.interruptMatterId!;
    const interruptRunId = started.interruption.interruptRunId!;

    expect(slice.world.residentDiagnostics(JANEK_ID).recentPercepts).toContainEqual(expect.objectContaining({
      occurrenceId: call.id,
      phenomenon: "speech",
      modality: "hearing",
      actorId: PLAYER_ID,
      text: "Janek, chwila!",
      addressed: true,
    }));
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "suspended",
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
      suspendedByMatterId: interruptMatterId,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(false);
    expect(slice.kernel.matter(interruptMatterId)).toMatchObject({
      status: "active",
      semanticRevision: 1,
      activeRunId: interruptRunId,
    });
    expect(slice.kernel.canRunMutateWorld(interruptRunId)).toBe(true);

    const heldPosition = { ...janek(slice).position };
    const responded = slice.advanceOneWorldTick();
    expect(responded.status).toBe("interruption_responded");
    if (responded.status !== "interruption_responded") throw new Error(`unexpected response boundary: ${responded.status}`);
    expect(janek(slice).position).toEqual(heldPosition);
    expect(janek(slice).velocity).toEqual({ x: 0, y: 0 });
    expect(janek(slice).facing).toEqual(responded.interruption.addressedDirection);
    expect(responded.interruption.responseOccurrenceId).not.toBeNull();
    expect(slice.world.diagnostics().recentOccurrences).toContainEqual(expect.objectContaining({
      id: responded.interruption.responseOccurrenceId,
      kind: "speech",
      actorId: JANEK_ID,
      text: "Tak?",
      addressedActorIds: [PLAYER_ID],
    }));

    let resumed = false;
    let holdGuard = 0;
    while (!resumed && holdGuard < 80) {
      const step = slice.advanceOneWorldTick();
      expect(janek(slice).position).toEqual(heldPosition);
      expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
      if (step.status === "interruption_resumed") resumed = true;
      holdGuard += 1;
    }
    expect(resumed).toBe(true);
    expect(slice.kernel.matter(interruptMatterId)).toMatchObject({ status: "resolved", activeRunId: null });
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 3,
      activeRunId: SEARCH_RUN_ID,
      suspendedByMatterId: null,
    });
    expect(slice.kernel.runBinding(SEARCH_RUN_ID)).toEqual(bindingBefore);
    expect(slice.kernel.canRunMutateWorld(SEARCH_RUN_ID)).toBe(true);

    const resumePosition = { ...janek(slice).position };
    slice.advanceOneWorldTick();
    expect(janek(slice).position).not.toEqual(resumePosition);
    expect(slice.authority.motionOwner()).toBe(SEARCH_RUN_ID);

    let reacquireGuard = 0;
    while (slice.phase() !== "reacquired" && reacquireGuard < 900) {
      slice.advanceOneWorldTick();
      reacquireGuard += 1;
    }
    expect(reacquireGuard).toBeLessThan(900);
    expect(slice.phase()).toBe("reacquired");
    expect(slice.kernel.matter(MATTER_ID)).toMatchObject({
      status: "active",
      semanticRevision: 4,
      activeRunId: null,
    });
    expect(slice.materialKnowledge.observation(CRATE_ID)).toMatchObject({
      currentlyVisible: true,
      lastKnownPosition: { x: 2752, y: 720 },
    });
    expect(slice.authority.recentActionFacts()).toHaveLength(0);
  });
});
