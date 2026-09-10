import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import type { ActorEntity, WorldInput, WorldSpecimen } from "../world/types";
import { LivingRuntime, stepLivingResidents } from "./runtime";
import { createLivingSpecimen } from "./specimen";
import { ResidentPerception } from "./perception";
import type { ResidentModelInput, ResidentReply } from "./types";

const still = { moveX: 0, moveY: 0 };
const actor = (world: World, id = "npc.001") => world.snapshot().entities.find(e => e.id === id) as ActorEntity;
function runUntil(runtime: LivingRuntime, done: () => boolean, maximum = 3000) {
  for (let i = 0; i < maximum && !done(); i++) runtime.step(still, []);
  expect(done(), JSON.stringify(runtime.state())).toBe(true);
}
function courtyard(): WorldSpecimen {
  return { width: 900, height: 700, actorSpeed: 190, placementSites: [], locations: [],
    blockers: [{ id: "wall", label: "Wall", bounds: { x: 360, y: 100, width: 30, height: 340 }, occludesVision: true }],
    entities: [
      { id: "npc.001", kind: "npc", label: "Mira", position: { x: 200, y: 200 }, radius: 16, heldItemId: null, facing: { x: 1, y: 0 } },
      { id: "player.jozz", kind: "player", label: "Jozz", position: { x: 280, y: 200 }, radius: 16, heldItemId: null, facing: { x: 1, y: 0 } }
    ] };
}
function walk(runtime: LivingRuntime, input: WorldInput, steps: number) { for (let i = 0; i < steps; i++) runtime.step(input, []); }

describe("resident contact and continuing purpose", () => {
  it("distinguishes a place restriction from a clue and leaves matching objects elsewhere alone", async () => {
    const world = new World(createLivingSpecimen());
    const runtime = new LivingRuntime(world, async () => ({ reply: "Przyniosę kubki z domku.", intent: {
      kind: "find_item", description: { itemType: "mug", withinPlaceId: "cottage" }, quantity: "all"
    } }));
    await runtime.send("Przynieś wszystkie kubki z domku");
    runUntil(runtime, () => runtime.state().lastOutcome?.includes("zakończyła sprawdzanie znanych miejsc") === true);
    expect(world.recentEvents(128).filter(e => e.type === "item.dropped" && e.actorId === "npc.001").map(e => e.entityId)).toEqual(["item.mug"]);
    expect(world.snapshot().entities.find(e => e.id === "item.blue-mug")?.position).toEqual({ x: 865, y: 390 });
  });

  it("does not repeat a delivery that finishes while an old proposal is pending", async () => {
    const specimen = createLivingSpecimen();
    specimen.entities.find(e => e.id === "item.hammer")!.position = { x: 700, y: 390 };
    const world = new World(specimen);
    let resolve: (reply: ResidentReply) => void = () => {};
    const runtime = new LivingRuntime(world, async input => input.latestUtterance === "Przynieś młotek"
      ? { reply: "Przyniosę młotek.", intent: { kind: "fetch", targetId: "item.hammer" } }
      : new Promise<ResidentReply>(r => { resolve = r; }));
    await runtime.send("Przynieś młotek");
    const pending = runtime.send("Jak idzie?");
    runUntil(runtime, () => runtime.state().lastOutcome?.includes("dostarczyła") === true);
    resolve({ reply: "Niosę młotek.", intent: { kind: "fetch", targetId: "item.hammer" } });
    await pending;
    walk(runtime, still, 100);
    expect(world.recentEvents(128).filter(e => e.type === "item.picked_up" && e.actorId === "npc.001")).toHaveLength(1);
    expect(runtime.state().conversation.some(line => line.text === "Niosę młotek.")).toBe(false);
  });

  it("accepts an unseen description, discovers the red mug inside the cottage and physically delivers it", async () => {
    const world = new World(createLivingSpecimen());
    const runtime = new LivingRuntime(world, async () => ({ reply: "Poszukam czerwonego kubka w domku i przyniosę go.",
      intent: { kind: "find_item", description: { itemType: "mug", color: "red", nearPlaceId: "cottage" }, quantity: "one" } }));
    expect(runtime.state().knownEntities.some(e => e.id === "item.mug")).toBe(false);
    await runtime.send("Znajdź i przynieś czerwony kubek z domku");
    runUntil(runtime, () => runtime.state().lastOutcome?.includes("dostarczyła i odłożyła obok ciebie: czerwony kubek") === true);
    expect(world.attemptAction({ action: "interact", actorId: "player.jozz", targetId: "item.mug" }).status).toBe("succeeded");
  });

  it("brings all discovered items once, including initially unseen ones, and retains progress across smalltalk", async () => {
    const world = new World(createLivingSpecimen());
    let request: ResidentModelInput | undefined;
    const runtime = new LivingRuntime(world, async input => {
      request = input;
      return input.latestUtterance === "Jak idzie?" ? { reply: "Pamiętam, co już przyniosłam.", intent: { kind: "continue" } } :
        { reply: "Sprawdzę znane miejsca i przyniosę znalezione luźne przedmioty.", intent: { kind: "find_item", description: { itemType: "any" }, quantity: "all" } };
    });
    await runtime.send("Przynieś wszystkie przedmioty");
    runUntil(runtime, () => world.recentEvents(128).some(e => e.type === "item.dropped" && e.actorId === "npc.001"));
    await runtime.send("Jak idzie?");
    expect(request?.currentCommitment).toContain("Dostarczone:");
    runUntil(runtime, () => runtime.state().lastOutcome?.includes("zakończyła sprawdzanie znanych miejsc") === true, 9000);
    const drops = world.recentEvents(128).filter(e => e.type === "item.dropped" && e.actorId === "npc.001");
    expect(drops.map(e => e.entityId).sort()).toEqual(["item.blue-mug", "item.hammer", "item.lantern", "item.mug"]);
    const delivered = world.snapshot().entities.filter(e => e.kind === "item");
    for (let i = 0; i < delivered.length; i++) for (let j = i + 1; j < delivered.length; j++) {
      expect(Math.hypot(delivered[i].position.x - delivered[j].position.x, delivered[i].position.y - delivered[j].position.y)).toBeGreaterThan(20);
    }
    const count = drops.length;
    walk(runtime, still, 240);
    expect(world.recentEvents(128).filter(e => e.type === "item.dropped" && e.actorId === "npc.001")).toHaveLength(count);
  });

  it("asks for a real distinction between two observed candidates instead of arbitrarily binding a description", async () => {
    const specimen = createLivingSpecimen();
    for (const entity of specimen.entities) {
      if (entity.id === "item.mug") entity.position = { x: 690, y: 390 };
      if (entity.id === "item.blue-mug") entity.position = { x: 690, y: 430 };
    }
    const runtime = new LivingRuntime(new World(specimen), async () => ({ reply: "Sprawdzę kubki.", intent: { kind: "find_item", description: { itemType: "mug" }, quantity: "one" } }));
    await runtime.send("Przynieś kubek");
    runtime.step(still, []);
    expect(runtime.state().lastOutcome).toContain("kilka pasujących przedmiotów");
    expect(runtime.state().activity).toContain("doprecyzowania");
  });

  it("keeps pursuit through loss of sight and uses a physically audible call without copying the caller position into visual memory", async () => {
    const world = new World(courtyard());
    const runtime = new LivingRuntime(world, async input => ({ reply: "Dobrze.", intent: input.latestUtterance === "Czekaj" ? { kind: "wait" } : { kind: "follow", targetId: "player.jozz" } }));
    await runtime.send("Czekaj");
    walk(runtime, { moveX: 0, moveY: -1 }, 24);
    walk(runtime, { moveX: 1, moveY: 0 }, 24);
    walk(runtime, { moveX: 0, moveY: 1 }, 26);
    expect(runtime.state().knownEntities.find(e => e.id === "player.jozz")?.visible).toBe(false);
    const remembered = runtime.state().knownEntities.find(e => e.id === "player.jozz")!;
    await runtime.send("Goń mnie");
    runtime.callFromPlayer();
    expect(runtime.state().knownEntities.find(e => e.id === "player.jozz")?.position).toEqual(remembered.position);
    expect(runtime.state().experiences?.some(e => e.kind === "heard_call")).toBe(true);
    runUntil(runtime, () => runtime.state().activity.includes("Jestem blisko"));
    expect(Math.hypot(actor(world).position.x - actor(world, "player.jozz").position.x, actor(world).position.y - actor(world, "player.jozz").position.y)).toBeLessThan(70);
    walk(runtime, { moveX: 1, moveY: 0 }, 40);
    runUntil(runtime, () => runtime.state().activity.includes("Jestem blisko"));
  });

  it("does not change a search when only an unobserved target position changes", async () => {
    const worlds = [new World(courtyard()), new World(courtyard())];
    const inputs: ResidentModelInput[][] = [[], []];
    const runtimes = worlds.map((w, i) => new LivingRuntime(w, async input => {
      inputs[i].push(input);
      return { reply: "Dobrze.", intent: input.latestUtterance === "Czekaj" ? { kind: "wait" } : { kind: "search", targetId: "player.jozz" } };
    }));
    for (const runtime of runtimes) {
      await runtime.send("Czekaj");
      walk(runtime, { moveX: 0, moveY: -1 }, 24);
      walk(runtime, { moveX: 1, moveY: 0 }, 24);
      walk(runtime, { moveX: 0, moveY: 1 }, 40);
    }
    walk(runtimes[0], still, 8);
    walk(runtimes[1], { moveX: 1, moveY: 0 }, 8);
    expect(actor(worlds[0], "player.jozz").position).not.toEqual(actor(worlds[1], "player.jozz").position);
    for (const runtime of runtimes) {
      expect(runtime.state().knownEntities.find(e => e.id === "player.jozz")?.visible).toBe(false);
      await runtime.send("Szukaj mnie");
    }
    expect(inputs[0].at(-1)).toEqual(inputs[1].at(-1));
    for (let tick = 0; tick < 12; tick++) {
      for (const runtime of runtimes) runtime.step(still, []);
      expect(actor(worlds[0]).position).toEqual(actor(worlds[1]).position);
      expect(actor(worlds[0]).facing).toEqual(actor(worlds[1]).facing);
    }
  });

  it("records an inspected empty last position, and a hidden call remains a coarse cue", () => {
    const specimen = courtyard();
    specimen.blockers[0].bounds = { x: 360, y: 130, width: 30, height: 400 };
    specimen.entities[0].position = { x: 200, y: 100 };
    specimen.entities[1].position = { x: 430, y: 110 };
    const world = new World(specimen);
    const senses = new ResidentPerception(world, "npc.001", (_id, name) => name);
    senses.observe(world.snapshot());
    world.step({ moveX: 0, moveY: 1 }, 0.25);
    senses.observe(world.snapshot());
    expect(senses.known.get("player.jozz")).toMatchObject({ visible: false, position: { x: 430, y: 110 }, lastCheckedAbsentAtTick: 1 });
    world.callOut("player.jozz"); senses.observe(world.snapshot());
    expect(senses.latestCall("player.jozz")).not.toHaveProperty("position");
    expect(senses.known.get("player.jozz")?.position).toEqual({ x: 430, y: 110 });
  });

  it("a second inactive resident does not accelerate the world or player", () => {
    const specimen = courtyard();
    specimen.entities.push({ ...specimen.entities[0], id: "npc.002", position: { x: 240, y: 500 } });
    const world = new World(specimen);
    const noRequest = async (): Promise<ResidentReply> => ({ reply: "Czekam.", intent: { kind: "continue" } });
    const residents = [new LivingRuntime(world, noRequest), new LivingRuntime(world, noRequest, "npc.002")];
    stepLivingResidents(world, residents, { moveX: 1, moveY: 0 }, []);
    expect(world.tick).toBe(1);
    expect(actor(world, "player.jozz").position.x).toBeCloseTo(280 + 190 / 30);
  });
});
