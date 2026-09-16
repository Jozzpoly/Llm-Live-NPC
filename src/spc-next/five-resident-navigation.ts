import { RegionNavigationGraph, bidirectionalEdge } from "./region-navigation";

export function createFiveResidentNavigationGraph(): RegionNavigationGraph {
  const nodes = [
    { id: "hearth", destinationPoint: { x: 780, y: 720 } },
    { id: "workshop", destinationPoint: { x: 1_950, y: 720 } },
    { id: "crossroads", destinationPoint: { x: 3_200, y: 920 } },
    { id: "fields", destinationPoint: { x: 2_250, y: 2_450 } },
    { id: "forest-edge", destinationPoint: { x: 4_550, y: 2_850 } },
    { id: "old-road", destinationPoint: { x: 5_050, y: 920 } },
    { id: "ruins", destinationPoint: { x: 7_050, y: 1_250 } },
    { id: "deep-wilds", destinationPoint: { x: 5_700, y: 5_650 } },
  ] as const;

  const edges = [
    ...bidirectionalEdge("hearth", "workshop", 1, [{ x: 1_350, y: 760 }]),
    ...bidirectionalEdge("hearth", "fields", 1.35, [{ x: 1_100, y: 1_520 }, { x: 1_650, y: 2_000 }]),
    ...bidirectionalEdge("workshop", "crossroads", 1.1, [{ x: 2_650, y: 820 }]),
    ...bidirectionalEdge("workshop", "fields", 1.15, [{ x: 2_050, y: 1_450 }]),
    ...bidirectionalEdge("crossroads", "old-road", 1.45, [{ x: 4_050, y: 900 }, { x: 4_600, y: 900 }]),
    ...bidirectionalEdge("crossroads", "forest-edge", 1.8, [{ x: 3_650, y: 1_650 }, { x: 4_050, y: 2_300 }]),
    ...bidirectionalEdge("fields", "forest-edge", 1.45, [{ x: 3_350, y: 2_550 }]),
    ...bidirectionalEdge("old-road", "ruins", 1.55, [{ x: 5_900, y: 1_000 }, { x: 6_350, y: 1_080 }]),
    ...bidirectionalEdge("forest-edge", "deep-wilds", 2.1, [{ x: 4_900, y: 3_850 }, { x: 5_250, y: 4_750 }]),
    ...bidirectionalEdge("ruins", "deep-wilds", 2.8, [{ x: 6_850, y: 2_800 }, { x: 6_300, y: 4_200 }]),
  ];

  return new RegionNavigationGraph(nodes, edges);
}
