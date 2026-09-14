import type { CognitionBatch, CognitionReason } from "./contracts";

export interface CognitionSchedulerOptions {
  residentId: string;
  normalMinIntervalTicks: number;
  urgentMinIntervalTicks: number;
  quietReviewIntervalTicks: number;
  urgentSalience: number;
  maxReasonsPerBatch: number;
}

export class CognitionScheduler {
  private readonly pending = new Map<string, CognitionReason>();
  private lastRequestTick = Number.NEGATIVE_INFINITY;
  private nextQuietReviewTick: number;

  constructor(private readonly options: CognitionSchedulerOptions, startTick = 0) {
    if (options.normalMinIntervalTicks < 1 || options.urgentMinIntervalTicks < 1) {
      throw new Error("cognition intervals must be positive");
    }
    if (options.urgentMinIntervalTicks > options.normalMinIntervalTicks) {
      throw new Error("urgent interval must not exceed normal interval");
    }
    if (options.quietReviewIntervalTicks < options.normalMinIntervalTicks) {
      throw new Error("quiet review interval must not be shorter than normal interval");
    }
    if (options.maxReasonsPerBatch < 1) throw new Error("maxReasonsPerBatch must be positive");
    this.nextQuietReviewTick = startTick + options.quietReviewIntervalTicks;
  }

  note(reason: CognitionReason): void {
    const existing = this.pending.get(reason.id);
    if (!existing || existing.salience <= reason.salience || existing.tick <= reason.tick) {
      this.pending.set(reason.id, reason);
    }
  }

  pendingCount(): number {
    return this.pending.size;
  }

  takeReady(tick: number): CognitionBatch | null {
    const pending = [...this.pending.values()].sort(
      (a, b) => b.salience - a.salience || a.tick - b.tick || a.id.localeCompare(b.id),
    );
    const maxSalience = pending[0]?.salience ?? 0;
    const elapsed = tick - this.lastRequestTick;

    const urgentReady = pending.length > 0
      && maxSalience >= this.options.urgentSalience
      && elapsed >= this.options.urgentMinIntervalTicks;
    const normalReady = pending.length > 0 && elapsed >= this.options.normalMinIntervalTicks;
    const quietReady = pending.length === 0
      && tick >= this.nextQuietReviewTick
      && elapsed >= this.options.normalMinIntervalTicks;

    if (!urgentReady && !normalReady && !quietReady) return null;

    let reasons: CognitionReason[];
    if (quietReady) {
      reasons = [{
        id: `quiet:${this.options.residentId}:${tick}`,
        tick,
        kind: "quiet_review",
        salience: 0.1,
        summary: "Quiet periodic review is due.",
        evidenceIds: [],
      }];
    } else {
      reasons = pending.slice(0, this.options.maxReasonsPerBatch);
      for (const reason of reasons) this.pending.delete(reason.id);
    }

    this.lastRequestTick = tick;
    this.nextQuietReviewTick = tick + this.options.quietReviewIntervalTicks;
    return {
      residentId: this.options.residentId,
      requestedAtTick: tick,
      reasons,
    };
  }
}

export function createDefaultCognitionScheduler(residentId: string, startTick = 0): CognitionScheduler {
  return new CognitionScheduler({
    residentId,
    normalMinIntervalTicks: 60,
    urgentMinIntervalTicks: 12,
    quietReviewIntervalTicks: 1_800,
    urgentSalience: 0.85,
    maxReasonsPerBatch: 8,
  }, startTick);
}
