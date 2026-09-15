import type { CognitionBatch, CognitionReason } from "./contracts";

export interface CognitionDispatch {
  id: string;
  residentId: string;
  admittedAtTick: number;
  batch: CognitionBatch;
}

export interface CognitionCoordinatorState {
  queuedResidents: readonly string[];
  inFlightResidents: readonly string[];
  capacity: number;
}

export const MAX_FAIR_QUEUE_WAIT_TICKS = 600;

export class CognitionCoordinator {
  private readonly queued = new Map<string, CognitionBatch>();
  private readonly inFlight = new Map<string, CognitionDispatch>();
  private readonly inFlightByResident = new Map<string, string>();
  private sequence = 0;

  constructor(readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("maxConcurrent must be a positive integer");
    }
  }

  enqueue(batch: CognitionBatch): void {
    const existing = this.queued.get(batch.residentId);
    this.queued.set(batch.residentId, existing ? mergeBatches(existing, batch) : cloneBatch(batch));
  }

  startReady(tick: number): CognitionDispatch[] {
    const started: CognitionDispatch[] = [];
    while (this.inFlight.size < this.maxConcurrent) {
      const candidate = this.bestQueuedCandidate(tick);
      if (!candidate) break;
      this.queued.delete(candidate.residentId);
      const dispatch: CognitionDispatch = {
        id: `cognition-dispatch:${tick}:${this.sequence++}`,
        residentId: candidate.residentId,
        admittedAtTick: tick,
        batch: cloneBatch(candidate),
      };
      this.inFlight.set(dispatch.id, dispatch);
      this.inFlightByResident.set(dispatch.residentId, dispatch.id);
      started.push(structuredClone(dispatch));
    }
    return started;
  }

  settle(dispatchId: string): void {
    const dispatch = this.inFlight.get(dispatchId);
    if (!dispatch) throw new Error(`unknown cognition dispatch: ${dispatchId}`);
    this.inFlight.delete(dispatchId);
    this.inFlightByResident.delete(dispatch.residentId);
  }

  state(): CognitionCoordinatorState {
    return {
      queuedResidents: [...this.queued.keys()].sort(),
      inFlightResidents: [...this.inFlightByResident.keys()].sort(),
      capacity: this.maxConcurrent,
    };
  }

  private bestQueuedCandidate(tick: number): CognitionBatch | null {
    const candidates = [...this.queued.values()].filter((batch) => !this.inFlightByResident.has(batch.residentId));
    if (candidates.length === 0) return null;

    const overdue = candidates.filter((batch) => tick - batch.requestedAtTick >= MAX_FAIR_QUEUE_WAIT_TICKS);
    if (overdue.length > 0) {
      return overdue.sort((a, b) => (
        a.requestedAtTick - b.requestedAtTick
        || maxSalience(b) - maxSalience(a)
        || a.residentId.localeCompare(b.residentId)
      ))[0]!;
    }

    return candidates.sort((a, b) => (
      maxSalience(b) - maxSalience(a)
      || a.requestedAtTick - b.requestedAtTick
      || a.residentId.localeCompare(b.residentId)
    ))[0]!;
  }
}

function maxSalience(batch: CognitionBatch): number {
  return Math.max(0, ...batch.reasons.map((reason) => reason.salience));
}

function mergeBatches(a: CognitionBatch, b: CognitionBatch): CognitionBatch {
  const reasons = new Map<string, CognitionReason>();
  for (const reason of [...a.reasons, ...b.reasons]) {
    const existing = reasons.get(reason.id);
    if (!existing || reason.salience > existing.salience || reason.tick > existing.tick) {
      reasons.set(reason.id, structuredClone(reason));
    }
  }
  return {
    residentId: a.residentId,
    requestedAtTick: Math.min(a.requestedAtTick, b.requestedAtTick),
    reasons: [...reasons.values()].sort((left, right) => (
      right.salience - left.salience || left.tick - right.tick || left.id.localeCompare(right.id)
    )),
  };
}

function cloneBatch(batch: CognitionBatch): CognitionBatch {
  return {
    residentId: batch.residentId,
    requestedAtTick: batch.requestedAtTick,
    reasons: batch.reasons.map((reason) => structuredClone(reason)),
  };
}
