export type FirstPresenceTraceEvent =
  | {
      kind: "experience";
      matterId: string;
      evidenceId: string;
      summary: string;
    }
  | {
      kind: "semantic_pending";
      matterId: string;
      attemptId: number;
      proposalId: number;
      semanticEvidenceId: string;
      semanticRevision: number;
      heldRunId: number;
      reusedExistingHold: boolean;
    }
  | {
      kind: "semantic_attempt_ended";
      matterId: string;
      attemptId: number;
      proposalId: number;
      heldRunId: number;
      outcome: "abandoned" | "provider_output_rejected" | "stale" | "superseded";
      reason: string;
    }
  | {
      kind: "semantic_commit";
      matterId: string;
      proposalId: number;
      semanticEvidenceId: string;
      fromRevision: number;
      toRevision: number;
      fromCourse: string;
      toCourse: string;
    }
  | {
      kind: "task_started";
      matterId: string;
      taskId: string;
      runId: number;
      semanticRevision: number;
    }
  | {
      kind: "task_held";
      matterId: string;
      runId: number;
      taskSemanticRevision: number;
      reconsiderationSemanticRevision: number;
      semanticEvidenceId: string;
    }
  | {
      kind: "task_resumed";
      matterId: string;
      runId: number;
      taskSemanticRevision: number;
      reconsiderationSemanticRevision: number;
      semanticEvidenceId: string;
    }
  | {
      kind: "task_superseded";
      matterId: string;
      taskId: string;
      runId: number;
      taskSemanticRevision: number;
      currentSemanticRevision: number;
    }
  | {
      kind: "task_outcome";
      matterId: string;
      runId: number;
      evidenceId: string;
      summary: string;
    };

export type FirstPresenceTraceRecord = FirstPresenceTraceEvent & { seq: number };

/**
 * Write-only diagnostic seam shared by product-adjacent Presence owners.
 *
 * Trace events carry no resident, provider or World authority. Consumers may
 * append causal observations, but gameplay/cognition must never read this seam
 * to decide what is allowed to happen.
 */
export interface FirstPresenceTraceSink {
  append(event: FirstPresenceTraceEvent): void;
}

/**
 * Tiny bounded causal/debug ledger for the first Presence composition.
 *
 * This is intentionally not event sourcing, long-term memory or chain-of-thought.
 * It only preserves enough owner-level provenance to explain how grounded
 * experience, semantic work and mechanical execution were joined.
 */
export class FirstPresenceTrace implements FirstPresenceTraceSink {
  private readonly value: FirstPresenceTraceRecord[] = [];
  private nextSeq = 1;

  constructor(private readonly limit = 32) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new Error(`First Presence trace limit must be a positive integer: ${limit}`);
    }
  }

  append(event: FirstPresenceTraceEvent): void {
    this.value.push({ seq: this.nextSeq++, ...event });
    if (this.value.length > this.limit) {
      this.value.splice(0, this.value.length - this.limit);
    }
  }

  records(): FirstPresenceTraceRecord[] {
    return this.value.map((record) => ({ ...record }));
  }
}
