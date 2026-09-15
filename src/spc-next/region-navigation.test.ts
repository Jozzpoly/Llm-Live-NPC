import { describe, expect, it } from "vitest";
import { createFiveResidentNavigationGraph } from "./five-resident-navigation";
import { RegionNavigationGraph } from "./region-navigation";

describe("hierarchical region navigation", () => {
  it("finds a bounded authored route across the large living region", () => {
    const graph = createFiveResidentNavigationGraph();
    const route = graph.route("hearth", "ruins");

    expect(route).not.toBeNull();
    expect(route!.regionIds).toEqual(["hearth", "workshop", "crossroads", "old-road", "ruins"]);
    expect(route!.waypoints.length).toBeGreaterThanOrEqual(7);
    expect(route!.waypoints.at(-1)).toEqual({ x: 7_050, y: 1_250 });
    expect(route!.totalCost).toBeGreaterThan(4);
  });

  it("does not route through an authored region outside the resident's allowed navigation knowledge", () => {
    const graph = createFiveResidentNavigationGraph();
    expect(graph.route("hearth", "ruins", new Set(["hearth", "ruins"]))).toBeNull();

    const knownPath = new Set(["hearth", "workshop", "crossroads", "old-road", "ruins"]);
    expect(graph.route("hearth", "ruins", knownPath)?.regionIds)
      .toEqual(["hearth", "workshop", "crossroads", "old-road", "ruins"]);
  });

  it("chooses a cheaper alternate topology instead of assuming Euclidean straight-line travel", () => {
    const graph = new RegionNavigationGraph(
      [
        { id: "a", anchor: { x: 0, y: 0 } },
        { id: "b", anchor: { x: 100, y: 0 } },
        { id: "c", anchor: { x: 50, y: 50 } },
      ],
      [
        { from: "a", to: "b", cost: 10, waypoints: [] },
        { from: "a", to: "c", cost: 2, waypoints: [{ x: 25, y: 25 }] },
        { from: "c", to: "b", cost: 2, waypoints: [{ x: 75, y: 25 }] },
      ],
    );

    expect(graph.route("a", "b")?.regionIds).toEqual(["a", "c", "b"]);
    expect(graph.route("a", "b", new Set(["a", "b"]))?.regionIds).toEqual(["a", "b"]);
  });

  it("fails closed when no authored connection exists", () => {
    const graph = new RegionNavigationGraph(
      [
        { id: "a", anchor: { x: 0, y: 0 } },
        { id: "b", anchor: { x: 100, y: 0 } },
      ],
      [],
    );
    expect(graph.route("a", "b")).toBeNull();
  });
});
