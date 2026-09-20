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

export type CognitionReasonNoteResult =
  | { status: "inserted"; reason: CognitionReason; notBeforeTick: number }
  | { status: "updated"; reason: CognitionReason; replaced: CognitionReason; notBeforeTick: number }
  | { status: "unchanged"; reason: CognitionReason; notBeforeTick: number }
  | { status: "ignored_stale"; reason: CognitionReason; retained: CognitionReason; notBeforeTick: number }
  | { status: "ignored_settled"; reason: CognitionReason; settledReasonTick: number };

export interface PendingCognitionReasonSnapshot {
  reason: CognitionReason;
  notBeforeTick: number;
}

/**
 * Mechanical scheduler for already-established unresolved semantic pressure.
 *
 * R2 boundary:
 * - this class does not decide whether an observation deserves semantic pressure;
 * - passage of time cannot manufacture a CognitionReason;
 * - a retained unresolved reason may have an eligibility/not-before time;
 * - reason identity is monotonic by causal tick so an older requeue cannot overwrite
 *   newer evidence with the same coalesced identity.
 */
const SETTLED_REASON_TOMBSTONE_LIMIT = 256;

export class CognitionScheduler {
  private readonly pending = new Map<string, CognitionReason>();
  private readonly notBeforeTickByReasonId = new Map<string, number>();
  private readonly settledReasonTickById = new Map<string, number>();
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

  note(
    reason: CognitionReason,
    options: { notBeforeTick?: number } = {},
  ): CognitionReasonNoteResult {
    const notBeforeTick = options.notBeforeTick ?? reason.tick;
    if (!Number.isSafeInteger(notBeforeTick) || notBeforeTick < reason.tick) {
      throw new Error("cognition reason notBeforeTick cannot precede its causal tick");
    }

    const settledReasonTick = this.settledReasonTickById.get(reason.id);
    if (settledReasonTick !== undefined) {
      if (reason.tick <= settledReasonTick) {
        return {
          status: "ignored_settled",
          reason: structuredClone(reason),
          settledReasonTick,
        };
      }
      // A genuinely newer causal version may reopen the same coalesced identity.
      this.settledReasonTickById.delete(reason.id);
    }

    const existing = this.pending.get(reason.id);
    if (!existing) {
      this.pending.set(reason.id, structuredClone(reason));
      this.notBeforeTickByReasonId.set(reason.id, notBeforeTick);
      return {
        status: "inserted",
        reason: structuredClone(reason),
        notBeforeTick,
      };
    }

    const existingNotBefore = this.notBeforeTickByReasonId.get(reason.id) ?? existing.tick;

    // Same coalesced identity is versioned by causal tick. Never let an older
    // in-flight/requeued copy resurrect over newer evidence.
    if (reason.tick < existing.tick) {
      return {
        status: "ignored_stale",
        reason: structuredClone(reason),
        retained: structuredClone(existing),
        notBeforeTick: existingNotBefore,
      };
    }

    if (reason.tick > existing.tick) {
      this.pending.set(reason.id, structuredClone(reason));
      this.notBeforeTickByReasonId.set(reason.id, notBeforeTick);
      return {
        status: "updated",
        reason: structuredClone(reason),
        replaced: structuredClone(existing),
        notBeforeTick,
      };
    }

    const sameReason = JSON.stringify(existing) === JSON.stringify(reason);
    const mergedNotBefore = Math.max(existingNotBefore, notBeforeTick);
    if (sameReason) {
      this.notBeforeTickByReasonId.set(reason.id, mergedNotBefore);
      return {
        status: "unchanged",
        reason: structuredClone(existing),
        notBeforeTick: mergedNotBefore,
      };
    }

    // Same causal version may be re-evaluated with stronger salience. Preserve the
    // stronger representation but never move eligibility earlier than an already
    // explicit retention/defer boundary.
    if (reason.salience > existing.salience) {
      this.pending.set(reason.id, structuredClone(reason));
      this.notBeforeTickByReasonId.set(reason.id, mergedNotBefore);
      return {
        status: "updated",
        reason: structuredClone(reason),
        replaced: structuredClone(existing),
        notBeforeTick: mergedNotBefore,
      };
    }

    this.notBeforeTickByReasonId.set(reason.id, mergedNotBefore);
    return {
      status: "unchanged",
      reason: structuredClone(existing),
      notBeforeTick: mergedNotBefore,
    };
  }

  pendingCount(): number {
    return this.pending.size;
  }

  /**
   * Locally invalidate one exact semantic-pressure version.
   *
   * The tombstone prevents an older in-flight batch from resurrecting the same
   * coalesced reason after local causal truth has already settled it. A genuinely
   * newer causal version (higher reason.tick) may reopen the identity.
   */
  settle(reason: CognitionReason): {
    status: "settled" | "newer_pending_retained";
    reason: CognitionReason;
    newerPending?: CognitionReason;
  } {
    const pending = this.pending.get(reason.id);
    if (pending && pending.tick > reason.tick) {
      return {
        status: "newer_pending_retained",
        reason: structuredClone(reason),
        newerPending: structuredClone(pending),
      };
    }

    if (pending) {
      this.pending.delete(reason.id);
      this.notBeforeTickByReasonId.delete(reason.id);
    }

    const previous = this.settledReasonTickById.get(reason.id) ?? Number.NEGATIVE_INFINITY;
    if (reason.tick > previous) {
      this.settledReasonTickById.delete(reason.id);
      this.settledReasonTickById.set(reason.id, reason.tick);
      while (this.settledReasonTickById.size > SETTLED_REASON_TOMBSTONE_LIMIT) {
        const oldest = this.settledReasonTickById.keys().next().value as string | undefined;
        if (oldest === undefined) break;
        this.settledReasonTickById.delete(oldest);
      }
    }

    return { status: "settled", reason: structuredClone(reason) };
  }

  /**
   * Read-only resident/local-brain view of currently unresolved semantic pressure.
   * Includes pressure whose explicit retention window has not opened yet.
   */
  pendingSnapshot(): CognitionReason[] {
    return this.pendingScheduleSnapshot().map((entry) => entry.reason);
  }

  pendingScheduleSnapshot(): PendingCognitionReasonSnapshot[] {
    return [...this.pending.values()]
      .map((reason) => ({
        reason: structuredClone(reason),
        notBeforeTick: this.notBeforeTickByReasonId.get(reason.id) ?? reason.tick,
      }))
      .sort((a, b) => (
        b.reason.salience - a.reason.salience
        || a.reason.tick - b.reason.tick
        || a.reason.id.localeCompare(b.reason.id)
      ));
  }

  scheduleQuietReviewAfter(tick: number, delayTicks: number): void {
    this.nextQuietReviewTick = this.quietReviewDeadline(tick, delayTicks);
  }

  /**
   * Local-maintenance deadline only. It cannot create a semantic reason.
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
    const eligible = this.pendingScheduleSnapshot().filter(
      (entry) => entry.notBeforeTick <= tick,
    );
    const maxSalience = eligible[0]?.reason.salience ?? 0;
    const oldestPendingTick = eligible.reduce(
      (oldest, entry) => Math.min(oldest, entry.reason.tick),
      Number.POSITIVE_INFINITY,
    );
    const elapsed = this.lastRequestTick === null
      ? Number.POSITIVE_INFINITY
      : tick - this.lastRequestTick;

    const urgentReady = eligible.length > 0
      && maxSalience >= this.options.urgentSalience
      && elapsed >= this.options.urgentMinIntervalTicks;
    const normalReady = eligible.length > 0
      && tick - oldestPendingTick >= this.options.normalDebounceTicks
      && elapsed >= this.options.normalMinIntervalTicks;

    // Passage of time alone is not semantic pressure.
    if (!urgentReady && !normalReady) return null;

    const reasons = eligible
      .slice(0, this.options.maxReasonsPerBatch)
      .map((entry) => entry.reason);
    for (const reason of reasons) {
      this.pending.delete(reason.id);
      this.notBeforeTickByReasonId.delete(reason.id);
    }

    this.lastRequestTick = tick;
    // Retained for local-maintenance diagnostics/backward compatibility only.
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
