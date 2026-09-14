import type { Vec2 } from "./contracts";

export interface RegionNavNode {
  id: string;
  anchor: Vec2;
}

export interface RegionNavEdge {
  from: string;
  to: string;
  cost: number;
  waypoints: readonly Vec2[];
}

export interface RegionRoute {
  regionIds: readonly string[];
  waypoints: readonly Vec2[];
  totalCost: number;
}

export class RegionNavigationGraph {
  private readonly nodes = new Map<string, RegionNavNode>();
  private readonly outgoing = new Map<string, RegionNavEdge[]>();

  constructor(nodes: readonly RegionNavNode[], edges: readonly RegionNavEdge[]) {
    for (const node of nodes) {
      if (this.nodes.has(node.id)) throw new Error(`duplicate nav node: ${node.id}`);
      this.nodes.set(node.id, { id: node.id, anchor: { ...node.anchor } });
      this.outgoing.set(node.id, []);
    }
    for (const edge of edges) {
      if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
        throw new Error(`nav edge references unknown region: ${edge.from} -> ${edge.to}`);
      }
      if (!Number.isFinite(edge.cost) || edge.cost <= 0) throw new Error("nav edge cost must be positive");
      this.outgoing.get(edge.from)!.push(cloneEdge(edge));
    }
  }

  route(from: string, to: string): RegionRoute | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    if (from === to) return { regionIds: [from], waypoints: [], totalCost: 0 };

    const distance = new Map<string, number>([[from, 0]]);
    const previous = new Map<string, RegionNavEdge>();
    const open = new Set<string>(this.nodes.keys());

    while (open.size > 0) {
      let current: string | null = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const candidate of open) {
        const candidateDistance = distance.get(candidate) ?? Number.POSITIVE_INFINITY;
        if (candidateDistance < currentDistance) {
          current = candidate;
          currentDistance = candidateDistance;
        }
      }
      if (current === null || !Number.isFinite(currentDistance)) break;
      open.delete(current);
      if (current === to) break;

      for (const edge of this.outgoing.get(current) ?? []) {
        if (!open.has(edge.to)) continue;
        const nextDistance = currentDistance + edge.cost;
        if (nextDistance >= (distance.get(edge.to) ?? Number.POSITIVE_INFINITY)) continue;
        distance.set(edge.to, nextDistance);
        previous.set(edge.to, edge);
      }
    }

    const totalCost = distance.get(to);
    if (totalCost === undefined) return null;

    const edges: RegionNavEdge[] = [];
    let cursor = to;
    while (cursor !== from) {
      const edge = previous.get(cursor);
      if (!edge) return null;
      edges.push(edge);
      cursor = edge.from;
    }
    edges.reverse();

    const regionIds = [from, ...edges.map((edge) => edge.to)];
    const waypoints: Vec2[] = [];
    for (const edge of edges) {
      for (const point of edge.waypoints) waypoints.push({ ...point });
      waypoints.push({ ...this.nodes.get(edge.to)!.anchor });
    }
    return { regionIds, waypoints, totalCost };
  }
}

export function bidirectionalEdge(
  from: string,
  to: string,
  cost: number,
  forwardWaypoints: readonly Vec2[] = [],
  reverseWaypoints: readonly Vec2[] = [...forwardWaypoints].reverse(),
): readonly RegionNavEdge[] {
  return [
    { from, to, cost, waypoints: forwardWaypoints.map((point) => ({ ...point })) },
    { from: to, to: from, cost, waypoints: reverseWaypoints.map((point) => ({ ...point })) },
  ];
}

function cloneEdge(edge: RegionNavEdge): RegionNavEdge {
  return {
    from: edge.from,
    to: edge.to,
    cost: edge.cost,
    waypoints: edge.waypoints.map((point) => ({ ...point })),
  };
}
