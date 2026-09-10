import { describe, expect, it } from "vitest";
import { World } from "../world/world";
import { createP1Specimen } from "../world/specimen";
import { findNavigationPath } from "./navigation";

describe("navigation through the actual World", () => {
  it("walks from behind the workshop around its walls and through its door to the hammer", () => {
    const specimen = createP1Specimen();
    const npc = specimen.entities.find(e => e.id === "npc.001")!;
    npc.position = { x: 1150, y: 80 };
    const world = new World(specimen);
    const hammer = world.snapshot().entities.find(e => e.id === "item.hammer")!;
    const route = findNavigationPath(world.snapshot(), npc.position, hammer.position, npc.radius);
    expect(route).not.toBeNull();
    expect(route!.length).toBeGreaterThan(1);
    let waypoint = 0;
    for (let frame = 0; frame < 900 && waypoint < route!.length; frame++) {
      const actor = world.snapshot().entities.find(e => e.id === npc.id)!;
      const target = route![waypoint];
      const dx = target.x - actor.position.x;
      const dy = target.y - actor.position.y;
      const length = Math.hypot(dx, dy);
      if (length < 0.01) { waypoint++; continue; }
      // Cap movement at the waypoint; World still resolves actual collisions.
      const scale = Math.min(1, length / (specimen.actorSpeed / 30));
      world.stepWithActorControls({moveX:0,moveY:0}, [{actorId:npc.id,moveX:dx/length*scale,moveY:dy/length*scale}]);
    }
    expect(waypoint).toBe(route!.length);
    expect(world.attemptAction({action:"interact",actorId:npc.id,targetId:hammer.id})).toMatchObject({status:"succeeded",code:"picked_up_item"});
  });

  it("refuses a closed room instead of returning a route through its walls", () => {
    const specimen = createP1Specimen();
    specimen.blockers.push({id:"workshop.door.closed",label:"Closed door",occludesVision:true,bounds:{x:960,y:260,width:20,height:80}});
    const npc = specimen.entities.find(e => e.id === "npc.001")!;
    const hammer = specimen.entities.find(e => e.id === "item.hammer")!;
    expect(findNavigationPath(specimen,npc.position,hammer.position,npc.radius)).toBeNull();
  });
});
