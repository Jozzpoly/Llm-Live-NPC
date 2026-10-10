import { describe, expect, it } from "vitest";
import { ActorWorldState } from "./actor-world-state";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { createSpcNextResearchScenario, researchScenarioKindFromSearch } from "../client/spc-next-research-scenario";

const PLAYER = "player.jozz";
const JAN = "resident.janek";

function approachJanek(actorBodyCollision: boolean) {
  const { world } = createFiveResidentRegionComposition({
    playerStart: { x: 1_810, y: 720 },
    materialBodyCollision: true,
    ...(actorBodyCollision ? { actorBodyCollision: true } : {}),
  });
  world.setActorMotionIntent(PLAYER, { x: 150, y: 0 });
  let hadBodyContact = false;
  for (let i = 0; i < 100; i += 1) {
    world.step();
    const motion = world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER);
    hadBodyContact ||= motion?.constraints.includes("actor_body") ?? false;
  }
  return {
    world,
    player: world.publicSnapshot().actors.find((a) => a.id === PLAYER)!,
    janek: world.publicSnapshot().actors.find((a) => a.id === JAN)!,
    hadBodyContact,
  };
}

describe("opt-in actor contact / zero provider / mechanical evidence only", () => {
  it("keeps the incumbent World unchanged and the contact probe explicitly separate", () => {
    expect(researchScenarioKindFromSearch("?spc=1&scenario=five-resident-local")).toBe("five-resident-local");
    expect(researchScenarioKindFromSearch("?spc=1&scenario=five-resident-contact-lab")).toBe("five-resident-contact-lab");
    const historical = createSpcNextResearchScenario("five-resident-local");
    const probe = createSpcNextResearchScenario("five-resident-contact-lab");
    expect(historical.world.options.actorBodyCollision).toBeUndefined();
    expect(probe.world.options.actorBodyCollision).toBe(true);
    expect(probe.world.materialObjects()).toHaveLength(4);
    expect(probe.world.publicSnapshot().residents).toHaveLength(5);
    expect(probe.canonicalEvidenceSupported).toBe(false);
    for (let i = 0; i < 1_500; i += 1) probe.advanceOneWorldTick();
    expect(probe.residentLifeView?.(JAN)?.matters).toHaveLength(0);
  });

  it("blocks direct passage through stationary Janek without creating a fake pickup target", () => {
    const { world, player, janek, hadBodyContact } = approachJanek(true);
    const separation = Math.hypot(player.position.x - janek.position.x,
      player.position.y - janek.position.y);
    expect(hadBodyContact).toBe(true);
    expect(player.position.x).toBeLessThan(1_865);
    expect(separation).toBeGreaterThanOrEqual(35.99);
    expect(world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER))
      .toMatchObject({ resolution: "blocked", constraints: ["actor_body"] });
    expect(world.materialObjects()).toHaveLength(4);
    expect(world.diagnostics().recentMaterialActions).toHaveLength(0);
    expect(world.materialObject("crate.workshop.01")?.location).toEqual({
      kind: "free", position: { x: 1_952, y: 720 },
    });
  });

  it("retains the previously qualified no-actor-contact mode", () => {
    const { world, player, hadBodyContact } = approachJanek(false);
    expect(hadBodyContact).toBe(false);
    expect(player.position.x).toBeGreaterThan(1_900);
    expect(world.options.actorBodyCollision).toBeUndefined();
    expect(world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .not.toContain("actor_body");
  });

  it("does not let two approaching kinematic actors interpenetrate", () => {
    const bodies = new ActorWorldState({ minX: 0, minY: 0, maxX: 400, maxY: 400 }, 256);
    const make = (id: string, x: number) => ({
      id, kind: "player" as const, position: { x, y: 200 },
      velocity: { x: 0, y: 0 }, hearingRadius: 50, sightRadius: 50, maxSpeed: 150,
    });
    bodies.add(make("a", 100));
    bodies.add(make("b", 200));
    bodies.setDesiredVelocity("a", { x: 150, y: 0 });
    bodies.setDesiredVelocity("b", { x: -150, y: 0 });
    let contacts = 0;
    for (let i = 0; i < 50; i += 1) {
      const outcomes = bodies.integrate(1 / 60, [], true);
      contacts += outcomes.filter((o) => o.constraints.includes("actor_body")).length;
      const a = bodies.require("a").position;
      const b = bodies.require("b").position;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(35.99);
    }
    expect(contacts).toBeGreaterThan(0);
  });

  it("permits retreat from actor contact rather than trapping the player", () => {
    const { world, player } = approachJanek(true);
    world.setActorMotionIntent(PLAYER, { x: -150, y: 0 });
    for (let i = 0; i < 24; i += 1) world.step();
    const after = world.publicSnapshot().actors.find((a) => a.id === PLAYER)!;
    expect(after.position.x).toBeLessThan(player.position.x - 45);
    expect(world.diagnostics().lastMotionOutcomes.find((o) => o.actorId === PLAYER)?.constraints)
      .not.toContain("actor_body");
  });
});
