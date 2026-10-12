import { describe, expect, it } from "vitest";
import { SpcWorldRuntime } from "./spc-world-runtime";
import { ResidentMaterialKnowledge } from "./resident-material-knowledge";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentMaterialMatterRelevanceBridge } from "./resident-material-matter-relevance-bridge";

describe("material relocation becomes legitimate private situation, not an authored job", () => {
  it("reacts only AFTER an actual player moves an item outside sight and a resident personally rediscovers it", () => {
    const world = new SpcWorldRuntime({
      bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 1_000 },
      regions: [], chunkSize: 128, fixedDeltaSeconds: 1 / 30,
    });
    const resident = world.addResident("resident.janek", "Janek", { x: 100, y: 100 }, { brainIntervalTicks: 4 });
    world.addPlayer("player.jozz", { x: 220, y: 100 }, { maxSpeed: 180 });
    world.addMaterialObject({
      id: "crate.workshop.02", label: "Spare parts", radius: 17,
      location: { kind: "free", position: { x: 220, y: 100 } },
    });
    const knowledge = new ResidentMaterialKnowledge(
      "resident.janek", ["crate.workshop.02"], world,
    );
    expect(knowledge.sample()).toEqual([{
      objectId: "crate.workshop.02", observedAtTick: 0,
      lastKnownPosition: { x: 220, y: 100 }, currentlyVisible: true,
    }]);

    expect(world.attemptMaterialAction("player.jozz", {
      kind: "pickup", objectId: "crate.workshop.02",
    }).status).toBe("succeeded");
    world.setActorMotionIntent("player.jozz", { x: 180, y: 0 });
    world.step(105);
    world.setActorMotionIntent("player.jozz", { x: 0, y: 0 });
    const player = world.publicSnapshot().actors.find(a => a.id === "player.jozz")!;
    expect(player.position.x).toBeGreaterThan(750);
    expect(world.attemptMaterialAction("player.jozz", {
      kind: "place", objectId: "crate.workshop.02", position: player.position,
    }).status).toBe("succeeded");
    knowledge.sample();
    const hidden = knowledge.observation("crate.workshop.02");
    expect(hidden).toMatchObject({
      lastKnownPosition: { x: 220, y: 100 }, currentlyVisible: false,
    });

    // Genuine old-body movement, not an illicit direct actor teleport.
    world.setResidentActivity("resident.janek", {
      id: "activity.janek.inspection", kind: "travel",
      targetActorId: null, targetPosition: { x: 740, y: 100 },
      text: null, speed: 140, reason: "approach the far side of the track",
    });
    world.step(160);
    knowledge.sample();
    const discovered = knowledge.observation("crate.workshop.02");
    expect(discovered?.currentlyVisible).toBe(true);
    expect(discovered?.lastKnownPosition).toEqual(player.position);

    const kernel = new ResidentContinuityKernel();
    const focus = new ResidentExecutionFocusAuthority(kernel);
    const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
    const bridge = new ResidentMaterialMatterRelevanceBridge(resident, kernel);
    const life = captureResidentLifeCognitionView({
      kernel, focus, arbitrator, matterIds: [],
    });
    const irrelevant = bridge.observeReacquisition(hidden, discovered, life);
    expect(irrelevant.status).toBe("not_relevant");
    const changed = bridge.observeUnexpectedRelocation(hidden, discovered, life);
    expect(changed.status).toBe("unexpected_relocation");
    if (changed.status !== "unexpected_relocation") throw Error("missing unexpected relocation");
    expect(changed.previousPosition).toEqual({ x: 220, y: 100 });
    expect(changed.observedPosition).toEqual(player.position);
    expect(changed.evidence.summary).not.toContain("player.jozz");
    expect(resident.pendingCognitionReasons().some(r =>
      r.id === changed.reasonId && r.kind === "direct_world_change")).toBe(true);
    // Following the change of place is still a choice; no matter/run is born.
    expect(kernel.snapshotCommittedState().matters).toEqual([]);
    expect(world.materialObject("crate.workshop.02")?.location).toMatchObject({
      kind: "free", position: player.position,
    });

    // Ordinary sustained visibility cannot generate a new duplicate pressure.
    const repeated = bridge.observeUnexpectedRelocation(discovered, discovered, life);
    expect(repeated.status).toBe("not_relevant");
  });
});
