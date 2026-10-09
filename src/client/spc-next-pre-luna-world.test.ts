import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpcNextResearchScenario,
  researchScenarioKindFromSearch,
} from "./spc-next-research-scenario";

afterEach(() => vi.unstubAllGlobals());

describe("pre-Luna Owner world observation — actual R6 five-resident composition", () => {
  it("is explicit opt-in; never hijacks the historical research default or the provider-enabled route", () => {
    expect(researchScenarioKindFromSearch("?spc=1")).toBe("baseline-delivery");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=unified-living")).toBe("unified-living");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=five-resident-local"))
      .toBe("five-resident-local");
  });

  it("runs the authentic shared World and player material actions without any model network calls", () => {
    const upstream = vi.fn(() => {
      throw new Error("pre-Luna world-only mode MUST NOT reach any provider");
    });
    vi.stubGlobal("fetch", upstream);
    const mode = createSpcNextResearchScenario("five-resident-local");
    expect(mode.kind).toBe("five-resident-local");
    expect(mode.canonicalEvidenceSupported).toBe(false);

    const initial = mode.world.publicSnapshot();
    expect(initial.actors.filter((actor) => actor.kind === "resident")).toHaveLength(5);
    expect(initial.actors.some((actor) => actor.id === "player.jozz")).toBe(true);
    expect(mode.world.materialObjects()).toEqual([
      expect.objectContaining({ id: "crate.workshop.01" }),
    ]);

    // Let the identical local opening finish without substituting decisions or
    // injecting semantic matters. Quiet after that is the observed honest state.
    for (let i = 0; i < 1_500; i += 1) mode.advanceOneWorldTick();
    for (const id of [
      "resident.mira", "resident.janek", "resident.ida", "resident.oren", "resident.nela",
    ]) {
      expect(mode.residentLifeView?.(id)).not.toBeNull();
      expect(mode.residentLifeView?.(id)?.matters).toHaveLength(0);
    }
    const world = mode.world;
    const getPlayer = () => world.publicSnapshot().actors.find((actor) => actor.id === "player.jozz")!;
    const crate = world.materialObject("crate.workshop.01");
    if (!crate || crate.location.kind !== "free") throw new Error("workshop crate missing");

    // Drive the actual existing player physically toward the material object.
    let reached = false;
    for (let i = 0; i < 1_000; i += 1) {
      const player = getPlayer();
      const delta = {
        x: crate.location.position.x - player.position.x,
        y: crate.location.position.y - player.position.y,
      };
      const distance = Math.hypot(delta.x, delta.y);
      if (distance < 30) {
        reached = true;
        break;
      }
      world.setActorMotionIntent("player.jozz", {
        x: (delta.x / distance) * 150,
        y: (delta.y / distance) * 150,
      });
      mode.advanceOneWorldTick();
    }
    world.setActorMotionIntent("player.jozz", { x: 0, y: 0 });
    expect(reached).toBe(true);
    expect(world.attemptMaterialAction("player.jozz", {
      kind: "pickup", objectId: crate.id,
    })).toMatchObject({ status: "succeeded", code: "picked_up" });
    expect(world.materialObject(crate.id)?.location).toMatchObject({
      kind: "held", actorId: "player.jozz",
    });
    for (let i = 0; i < 30; i += 1) {
      world.setActorMotionIntent("player.jozz", { x: 150, y: 0 });
      mode.advanceOneWorldTick();
    }
    world.setActorMotionIntent("player.jozz", { x: 0, y: 0 });
    const player = getPlayer();
    const placement = { x: player.position.x + 35, y: player.position.y };
    expect(world.attemptMaterialAction("player.jozz", {
      kind: "place", objectId: crate.id, position: placement,
    })).toMatchObject({ status: "succeeded", code: "placed" });
    expect(world.materialObject(crate.id)?.location).toEqual({
      kind: "free", position: placement,
    });
    expect(world.speak("player.jozz", "Hej, Janek!", 420, ["resident.janek"]))
      .toMatchObject({ kind: "speech", addressedActorIds: ["resident.janek"] });

    expect(upstream).not.toHaveBeenCalled();
    for (const id of [
      "resident.mira", "resident.janek", "resident.ida", "resident.oren", "resident.nela",
    ]) {
      expect(mode.residentLifeView?.(id)?.matters).toHaveLength(0);
    }
    console.info("SPC_PRE_LUNA_WORLD_MECHANICS", JSON.stringify({
      worldTicks: world.tick,
      residents: 5,
      realPlayerMaterialActions: world.diagnostics().recentMaterialActions.length,
      physicalCratePosition: placement,
      networkModelCalls: upstream.mock.calls.length,
      residentOwnedMatters: 0,
    }));
  });
});
