import type { Vec2 } from "./contracts";

interface IndexedPosition {
  position: Vec2;
  cellKey: string;
}

export interface SpatialQueryStats {
  totalQueries: number;
  lastVisitedCellCount: number;
  lastCandidateCount: number;
}

export class ChunkSpatialIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly indexed = new Map<string, IndexedPosition>();
  private totalQueries = 0;
  private lastVisitedCellCount = 0;
  private lastCandidateCount = 0;

  constructor(readonly chunkSize: number) {
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      throw new Error("chunkSize must be positive and finite");
    }
  }

  upsert(id: string, position: Vec2): void {
    assertIndexId(id);
    assertFinitePosition(position);
    const cellKey = this.cellKey(position);
    const previous = this.indexed.get(id);
    if (previous?.cellKey === cellKey) {
      previous.position = { ...position };
      return;
    }

    if (previous) {
      const oldCell = this.cells.get(previous.cellKey);
      oldCell?.delete(id);
      if (oldCell?.size === 0) this.cells.delete(previous.cellKey);
    }

    let cell = this.cells.get(cellKey);
    if (!cell) {
      cell = new Set<string>();
      this.cells.set(cellKey, cell);
    }
    cell.add(id);
    this.indexed.set(id, { position: { ...position }, cellKey });
  }

  remove(id: string): void {
    assertIndexId(id);
    const previous = this.indexed.get(id);
    if (!previous) return;
    const cell = this.cells.get(previous.cellKey);
    cell?.delete(id);
    if (cell?.size === 0) this.cells.delete(previous.cellKey);
    this.indexed.delete(id);
  }

  queryRadius(center: Vec2, radius: number): string[] {
    assertFinitePosition(center);
    if (!Number.isFinite(radius) || radius < 0) throw new Error("radius must be finite and non-negative");

    const minX = Math.floor((center.x - radius) / this.chunkSize);
    const maxX = Math.floor((center.x + radius) / this.chunkSize);
    const minY = Math.floor((center.y - radius) / this.chunkSize);
    const maxY = Math.floor((center.y + radius) / this.chunkSize);
    const radiusSq = radius * radius;
    const result: string[] = [];
    let visitedCellCount = 0;
    let candidateCount = 0;

    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        visitedCellCount += 1;
        const cell = this.cells.get(`${cx}:${cy}`);
        if (!cell) continue;
        candidateCount += cell.size;
        for (const id of cell) {
          const indexed = this.indexed.get(id);
          if (!indexed) continue;
          const dx = indexed.position.x - center.x;
          const dy = indexed.position.y - center.y;
          if (dx * dx + dy * dy <= radiusSq) result.push(id);
        }
      }
    }

    this.totalQueries += 1;
    this.lastVisitedCellCount = visitedCellCount;
    this.lastCandidateCount = candidateCount;
    result.sort((a, b) => a.localeCompare(b));
    return result;
  }

  stats(): SpatialQueryStats {
    return {
      totalQueries: this.totalQueries,
      lastVisitedCellCount: this.lastVisitedCellCount,
      lastCandidateCount: this.lastCandidateCount,
    };
  }

  private cellKey(position: Vec2): string {
    return `${Math.floor(position.x / this.chunkSize)}:${Math.floor(position.y / this.chunkSize)}`;
  }
}

function assertIndexId(id: string): void {
  if (typeof id !== "string" || id.trim().length === 0) throw new Error("spatial id must be non-empty");
}

function assertFinitePosition(position: Vec2): void {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    throw new Error("spatial position must be finite");
  }
}
