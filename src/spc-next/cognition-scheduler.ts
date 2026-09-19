import type { CognitionBatch, CognitionReason } from "./contracts";

export interface CognitionSchedulerOptions {
  residentId: string;
  normalMinIntervalTicks: number;
  urgentMinIntervalTicks: number;
  normalDebounceTicks: number;
  quietReviewIntervalTicks: number;
  urgentSalience: number;
  maxReasonsPerBatch: number;
}

export interface CognitionScheduleDiagnostics {
  pendingCount: number;
  lastRequestTick: number | null;
  nextQuietReviewTick: number;
}

export class CognitionScheduler {
  private readonly pending = new Map<string, CognitionReason>();
  private lastRequestTick: number | null = null;
  private nextQuietReviewTick: number;

  constructor(private readonly options: CognitionSchedulerOptions, startTick = 0) {
    if (options.normalMinIntervalTicks < 1 || options.urgentMinIntervalTicks < 1) {
      throw new Error("cognition intervals must be positive");
    }
    if (options.urgentMinIntervalTicks > options.normalMinIntervalTicks) {
      throw new Error("urgent interval must not exceed normal interval");
    }
    if (options.normalDebounceTicks < 0 || options.normalDebounceTicks > options.normalMinIntervalTicks) {
      throw new Error("normalDebounceTicks must be between zero and normalMinIntervalTicks");
    }
    if (options.quietReviewIntervalTicks < options.normalMinIntervalTicks) {
      throw new Error("quiet review interval must not be shorter than normal interval");
    }
    if (options.maxReasonsPerBatch < 1) throw new Error("maxReasonsPerBatch must be positive");
    this.nextQuietReviewTick = startTick
      + options.quietReviewIntervalTicks
      + stablePhaseOffset(options.residentId, options.quietReviewIntervalTicks);
  }

  note(reason: CognitionReason): void {
    const existing = this.pending.get(reason.id);
    if (!existing || existing.salience <= reason.salience || existing.tick <= reason.tick) {
      this.pending.set(reason.id, structuredClone(reason));
    }
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Read-only research/local-brain view of currently unresolved semantic pressure.
   * This is not resident memory and does not mutate scheduling state.
   */
  pendingSnapshot(): CognitionReason[] {
    return [...this.pending.values()]
      .sort((a, b) => b.salience - a.salience || a.tick - b.tick || a.id.localeCompare(b.id))
      .map((reason) => structuredClone(reason));
  }

  /**
   * Close a pending reason that has been fully handled by resident-local intelligence.
   *
   * This deliberately does not fabricate a cognition batch or advance request cadence.
   * Full pressure lifecycle/supersession belongs to the later post-stress R2 campaign;
   * R1 only needs an honest way for local competence to prove that higher cognition
   * is no longer required for one exact reason.
   */
  settleLocally(reasonId: string): boolean {
    if (typeof reasonId !== "string" || reasonId.trim().length === 0) {
      throw new Error("cognition reason id must be non-empty");
    }
    return this.pending.delete(reasonId);
  }

  /**
   * Close all currently pending cognition pressure whose causal support includes
   * one exact evidence id. Local embodied intelligence should normally use this
   * boundary instead of depending on scheduler-specific reason identity formats.
   */
  settleLocallyByEvidence(evidenceId: string): CognitionReason[] {
    if (typeof evidenceId !== "string" || evidenceId.trim().length === 0) {
      throw new Error("cognition evidence id must be non-empty");
    }
    const settled: CognitionReason[] = [];
    for (const [reasonId, reason] of this.pending) {
      if (!reason.evidenceIds.includes(evidenceId)) continue;
      this.pending.delete(reasonId);
      settled.push(structuredClone(reason));
    }
    return settled.sort(
      (a, b) => b.salience - a.salience || a.tick - b.tick || a.id.localeCompare(b.id),
    );
  }

  scheduleQuietReviewAfter(tick: number, delayTicks: number): void {
    this.nextQuietReviewTick = this.quietReviewDeadline(tick, delayTicks);
  }

  /**
   * Guarantee a cognition opportunity no later than the requested bound without
   * postponing an already-earlier review. Event bridges use this; provider cadence
   * may still deliberately replace the deadline through scheduleQuietReviewAfter().
   */
  ensureQuietReviewWithin(tick: number, delayTicks: number): void {
    const candidate = this.quietReviewDeadline(tick, delayTicks);
    this.nextQuietReviewTick = Math.min(this.nextQuietReviewTick, candidate);
  }

  private quietReviewDeadline(tick: number, delayTicks: number): number {
    if (!Number.isInteger(tick) || tick < 0) throw new Error("tick must be a non-negative integer");
    if (!Number.isInteger(delayTicks) || delayTicks < 1) throw new Error("delayTicks must be a positive integer");
    const boundedDelay = Math.max(this.options.normalMinIntervalTicks, delayTicks);
    const microStagger = stableMicroStagger(this.options.residentId, boundedDelay);
    return tick + boundedDelay + microStagger;
  }

  diagnostics(): CognitionScheduleDiagnostics {
    return {
      pendingCount: this.pending.size,
      lastRequestTick: this.lastRequestTick,
      nextQuietReviewTick: this.nextQuietReviewTick,
    };
  }

  takeReady(tick: number): CognitionBatch | null {
    const pending = [...this.pending.values()].sort(
      (a, b) => b.salience - a.salience || a.tick - b.tick || a.id.localeCompare(b.id),
    );
    const maxSalience = pending[0]?.salience ?? 0;
    const oldestPendingTick = pending.reduce((oldest, reason) => Math.min(oldest, reason.tick), Number.POSITIVE_INFINITY);
    const elapsed = this.lastRequestTick === null ? Number.POSITIVE_INFINITY : tick - this.lastRequestTick;

    const urgentReady = pending.length > 0
      && maxSalience >= this.options.urgentSalience
      && elapsed >= this.options.urgentMinIntervalTicks;
    const normalReady = pending.length > 0
      && tick - oldestPendingTick >= this.options.normalDebounceTicks
      && elapsed >= this.options.normalMinIntervalTicks;
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
    // This is a safety fallback. A successfully admitted model proposal should replace
    // this deadline via scheduleQuietReviewAfter().
    this.nextQuietReviewTick = tick
      + this.options.quietReviewIntervalTicks
      + stableMicroStagger(this.options.residentId, this.options.quietReviewIntervalTicks);
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
    normalDebounceTicks: 30,
    quietReviewIntervalTicks: 1_800,
    urgentSalience: 0.85,
    maxReasonsPerBatch: 8,
  }, startTick);
}

function stablePhaseOffset(residentId: string, interval: number): number {
  const spread = Math.max(1, Math.floor(interval / 4));
  return stableHash(residentId) % spread;
}

function stableMicroStagger(residentId: string, delay: number): number {
  const spread = Math.max(1, Math.min(30, Math.floor(delay * 0.05)));
  return stableHash(`${residentId}:${delay}`) % spread;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
