import { describe, expect, it, vi } from "vitest";
import { FiveResidentUnifiedLivingRuntime } from "./five-resident-unified-living-runtime";
import { createFiveResidentRegionComposition } from "./five-resident-region";

const CRATE = "crate.workshop.01";
const MOVER = "player.material-episode-relocator";
const PLAYER = "player.jozz";

/**
 * A WHOLE-CHAIN MECHANICAL SPECIMEN ONLY.
 *
 * Source of resident interest: explicitly authored starting stewardship.
 * Proposal: TEST-SUPPLIED provider-shaped decision, not a real-model choice.
 * Action: authenticated through ordinary resident run authority, genuinely
 * resolves in the same five-resident World and is visible as World speech.
 *
 * The point is to falsify an integration seam before spending provider budget.
 * CI PASS must not be promoted to spontaneous life, NPC personality or an Owner demo.
 */
describe("R6 opt-in personal-stake shared-World whole-chain mechanics", () => {
  it("takes a private factual stake through asynchronous cognition to authorized NPC speech and public afterstate", async () => {
    const composition = createFiveResidentRegionComposition({
      playerStart: { x: 2_010, y: 755 },
    });
    const world = composition.world;
    const crate = world.materialObject(CRATE);
    if (!crate || crate.location.kind !== "free") throw new Error("missing factual crate");
    world.addPlayer(MOVER, crate.location.position, { maxSpeed: 100_000 });

    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const context = JSON.parse(String(init?.body)) as {
        resident: { id: string };
        reasons: Array<{ id: string; kind: string; summary: string }>;
        knownActors: Array<{ id: string }>;
      };
      if (context.resident.id !== "resident.janek") {
        throw new Error("unexpected provider request for other resident");
      }
      const reason = context.reasons.find((r) =>
        r.kind === "uncertainty" && r.summary.includes(CRATE)
      );
      if (!reason) throw new Error("no private personal-stake pressure arrived");
      if (!context.knownActors.some((a) => a.id === PLAYER)) {
        throw new Error("resident did not privately recognize the player");
      }

      // Intentionally authored TEST RESPONSE: demonstrates admission/execution,
      // not decision quality, autonomous interest or live LLM cognition.
      return new Response(JSON.stringify({
        ok: true,
        originReasonId: reason.id,
        proposal: {
          version: 1,
          commitmentDecision: {
            kind: "accept",
            reason: "ask an actually perceived neighbor for context",
            intent: {
              kind: "communicate",
              goal: "ask about the visibly displaced crate",
              targetActorId: PLAYER,
              targetRegionId: null,
              targetPosition: null,
              text: "Wiesz, co się stało ze skrzynią w warsztacie?",
            },
          },
          beliefs: [],
          concerns: [],
          reviewAfterSeconds: 30,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const living = new FiveResidentUnifiedLivingRuntime({
      composition,
      lifeOptions: { materialStewardships: { "resident.janek": [CRATE] } },
      fetcher,
      maxConcurrentCognition: 1,
    });

    expect(world.attemptMaterialAction(MOVER, { kind: "pickup", objectId: CRATE }).status)
      .toBe("succeeded");
    const before = world.publicSnapshot().actors.find((a) => a.id === MOVER);
    if (!before) throw new Error("mover actor missing");
    const dt = world.options.fixedDeltaSeconds;
    world.setActorMotionIntent(MOVER, {
      x: (2_090 - before.position.x) / dt,
      y: (800 - before.position.y) / dt,
    });
    living.advanceOneWorldTick();
    world.setActorMotionIntent(MOVER, { x: 0, y: 0 });
    expect(world.attemptMaterialAction(MOVER, {
      kind: "place", objectId: CRATE, position: { x: 2_122, y: 800 },
    }).status).toBe("succeeded");
    living.advanceOneWorldTick();

    const janek = living.life("resident.janek");
    if (!janek) throw new Error("Janek not claimed");
    expect(janek.resident.pendingCognitionReasons()).toEqual([
      expect.objectContaining({ kind: "uncertainty" }),
    ]);
    expect(janek.currentLifeView().matters).toEqual([]);

    for (let i = 0; i < 90 && living.diagnostics().providerRequestCount === 0; i += 1) {
      living.advanceOneWorldTick();
    }
    expect(living.diagnostics().providerRequestCount).toBe(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    await flushMicrotasks();
    expect(living.diagnostics().providerInboxCount).toBe(1);
    expect(janek.currentLifeView().matters).toEqual([]);

    // Provider arrivals are inert until explicit shared-World admission.
    living.advanceOneWorldTick();
    expect(living.diagnostics().recentProviderEvents).toContainEqual(expect.objectContaining({
      residentId: "resident.janek", status: "admitted",
    }));
    expect(janek.currentLifeView().matters).toHaveLength(1);

    let spoken = false;
    for (let i = 0; i < 240 && !spoken; i += 1) {
      living.advanceOneWorldTick();
      await flushMicrotasks();
      spoken = world.diagnostics().recentOccurrences.some((event) =>
        event.kind === "speech" && event.actorId === "resident.janek"
          && event.addressedActorIds.includes(PLAYER)
      );
    }
    expect(spoken).toBe(true);
    expect(janek.currentLifeView().matters).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "resolved" }),
    ]));
    expect(world.materialObject(CRATE)?.location).toEqual({
      kind: "free", position: { x: 2_122, y: 800 },
    });
    expect(world.diagnostics().recentMaterialActions.filter((a) => a.actorId === "resident.janek"))
      .toEqual([]);
    // This is a factual World consequence, not proof Janek invented the speech.
    console.info("SPC_LIVED_EPISODE_MECHANIC_ONLY", JSON.stringify({
      providerCalls: fetcher.mock.calls.length,
      liveModelCalls: 0,
      janekMatters: janek.currentLifeView().matters.length,
      residentWorldSpeech: spoken,
      cratePosition: world.materialObject(CRATE)?.location,
    }));
  });
});

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}
