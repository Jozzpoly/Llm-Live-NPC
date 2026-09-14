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
    let best: CognitionBatch | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const batch of this.queued.values()) {
      if (this.inFlightByResident.has(batch.residentId)) continue;
      const maxSalience = Math.max(0, ...batch.reasons.map((reason) => reason.salience));
      const waitedTicks = Math.max(0, tick - batch.requestedAtTick);
      const score = maxSalience + Math.min(waitedTicks / 10_000, 0.25);
      if (score > bestScore || (score === bestScore && batch.residentId.localeCompare(best?.residentId ?? "") < 0)) {
        best = batch;
        bestScore = score;
      }
    }
    return best;
  }
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
