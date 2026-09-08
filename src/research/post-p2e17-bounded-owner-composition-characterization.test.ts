import { describe, expect, it } from "vitest";
import {
  P2E0ResidentCausalKernel,
  type P2E0ProposalTicket
} from "./p2-e0-resident-causal-kernel";
import { P2E4SemanticProposalContextSeam } from "./p2-e4-semantic-proposal-context";
import {
  P2E5SemanticProviderAuthorityMembrane,
  type P2E5LocalProviderRun
} from "./p2-e5-semantic-provider-authority-membrane";

function heard(
  resident: P2E0ResidentCausalKernel,
  occurrenceId: string,
  text: string
) {
  return resident.recordEvidence({
    kind: "heard",
    source: { kind: "actor", actorId: "player.jozz", occurrenceId },
    summary: `player.jozz said: ${text}`
  });
}

function openMatter(
  resident: P2E0ResidentCausalKernel,
  id: string,
  occurrenceId: string,
  text: string,
  semanticCourse = "interpret the grounded request"
) {
  const origin = heard(resident, occurrenceId, text);
  return resident.openMatter({ id, originEvidenceId: origin.id, semanticCourse });
}

type ProviderAdmission =
  | {
      status: "ready";
      ticket: P2E0ProposalTicket;
      run: P2E5LocalProviderRun;
      serializedInputChars: number;
    }
  | {
      status: "rejected";
      reason: "attempt_already_live" | "input_too_large" | "context_rejected";
      serializedInputChars?: number;
    };

/**
 * Test-only orchestration owner. The concrete limit is apparatus, not product
 * policy. Its purpose is to determine whether the existing causal seams expose
 * enough authority/lifecycle state to enforce bounded provider admission
 * without adding shadow proposal truth to P2-E0.
 */
class BoundedProviderOwnerProbe {
  readonly provider = new P2E5SemanticProviderAuthorityMembrane();
  private readonly context = new P2E4SemanticProposalContextSeam();

  constructor(private readonly maxSerializedInputChars: number) {}

  begin(resident: P2E0ResidentCausalKernel, matterId: string): ProviderAdmission {
    const matter = resident.matter(matterId);
    if (!matter) return { status: "rejected", reason: "context_rejected" };

    const sameDependencyAlreadyLive = resident.pendingSemanticProposals().some(
      (ticket) =>
        ticket.matterId === matter.id &&
        ticket.semanticRevision === matter.semanticRevision &&
        ticket.semanticEvidenceId === matter.latestSemanticEvidenceId
    );
    if (sameDependencyAlreadyLive) {
      return { status: "rejected", reason: "attempt_already_live" };
    }

    const ticket = resident.beginSemanticProposal(matter.id);
    const built = this.context.build(resident, ticket);
    if (built.status !== "ready") {
      resident.releaseSemanticProposal(ticket);
      return { status: "rejected", reason: "context_rejected" };
    }

    const prepared = this.provider.prepare(built.context);
    const serializedInputChars = JSON.stringify(prepared.run.modelInput).length;
    if (serializedInputChars > this.maxSerializedInputChars) {
      const abandoned = this.provider.abandon(resident, prepared.run);
      if (abandoned.status !== "abandoned" || abandoned.residentAuthority !== "released") {
        throw new Error("Payload rejection must relinquish the exact current provider authority.");
      }
      return { status: "rejected", reason: "input_too_large", serializedInputChars };
    }

    return { status: "ready", ticket, run: prepared.run, serializedInputChars };
  }
}

/**
 * Separate test-only matter-admission owner. It intentionally owns only IDs it
 * admitted itself. That is sufficient to characterize the first in-process
 * single-writer composition; restart/persistence/reconstruction is not claimed.
 */
class BoundedMatterAdmissionOwnerProbe {
  private readonly admittedMatterIds = new Set<string>();

  constructor(private readonly maxUnresolvedMatters: number) {}

  admit(
    resident: P2E0ResidentCausalKernel,
    input: { id: string; originEvidenceId: string }
  ):
    | { status: "opened" }
    | { status: "rejected"; reason: "matter_capacity_reached" } {
    for (const id of [...this.admittedMatterIds]) {
      const matter = resident.matter(id);
      if (!matter || matter.status === "resolved" || matter.status === "cancelled") {
        this.admittedMatterIds.delete(id);
      }
    }

    if (this.admittedMatterIds.size >= this.maxUnresolvedMatters) {
      return { status: "rejected", reason: "matter_capacity_reached" };
    }

    resident.openMatter({
      id: input.id,
      originEvidenceId: input.originEvidenceId,
      semanticCourse: "interpret admitted grounded experience"
    });
    this.admittedMatterIds.add(input.id);
    return { status: "opened" };
  }

  unresolvedCount(): number {
    return this.admittedMatterIds.size;
  }
}

describe("post-P2-E17 bounded owner composition characterization", () => {
  it("can enforce one live attempt per exact semantic dependency from resident truth alone", () => {
    const resident = new P2E0ResidentCausalKernel();
    const owner = new BoundedProviderOwnerProbe(4_096);
    const matter = openMatter(
      resident,
      "matter.mug",
      "speech.1",
      "Bring me the red mug."
    );

    const first = owner.begin(resident, matter.id);
    expect(first.status).toBe("ready");
    if (first.status !== "ready") return;

    expect(owner.begin(resident, matter.id)).toEqual({
      status: "rejected",
      reason: "attempt_already_live"
    });
    expect(resident.pendingSemanticProposals()).toEqual([first.ticket]);

    expect(owner.provider.abandon(resident, first.run)).toEqual({
      status: "abandoned",
      residentAuthority: "released"
    });
    expect(resident.pendingSemanticProposals()).toEqual([]);

    const retry = owner.begin(resident, matter.id);
    expect(retry.status).toBe("ready");
    if (retry.status !== "ready") return;
    expect(retry.ticket.proposalId).toBeGreaterThan(first.ticket.proposalId);
    expect(resident.pendingSemanticProposals()).toEqual([retry.ticket]);
  });

  it("can reject oversized model-visible input and leave no leaked resident or local attempt authority", () => {
    const resident = new P2E0ResidentCausalKernel();
    const owner = new BoundedProviderOwnerProbe(512);
    const matter = openMatter(
      resident,
      "matter.payload",
      "speech.long",
      `Please consider this grounded request: ${"x".repeat(4_096)}`
    );
    const matterBefore = resident.matter(matter.id);
    const revocationsBefore = resident.recentSemanticProposalRevocations();

    const rejected = owner.begin(resident, matter.id);
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: "input_too_large"
    });
    if (rejected.status !== "rejected") return;
    expect(rejected.serializedInputChars).toBeGreaterThan(512);
    expect(resident.pendingSemanticProposals()).toEqual([]);
    expect(resident.matter(matter.id)).toEqual(matterBefore);
    expect(resident.recentSemanticProposalRevocations()).toEqual(revocationsBefore);

    const short = heard(resident, "speech.short", "Actually, just reconsider the short correction.");
    resident.advanceSemanticContext(matter.id, short.id);

    const retry = owner.begin(resident, matter.id);
    expect(retry.status).toBe("ready");
    if (retry.status !== "ready") return;
    expect(retry.serializedInputChars).toBeLessThanOrEqual(512);
  });

  it("can admit a newer dependency after resident-side supersession and explicitly retire the old local run", () => {
    const resident = new P2E0ResidentCausalKernel();
    const owner = new BoundedProviderOwnerProbe(4_096);
    const matter = openMatter(
      resident,
      "matter.revision",
      "speech.1",
      "Bring me the red mug."
    );
    const old = owner.begin(resident, matter.id);
    expect(old.status).toBe("ready");
    if (old.status !== "ready") return;

    const correction = heard(resident, "speech.2", "Actually, the blue mug.");
    resident.advanceSemanticContext(matter.id, correction.id);
    expect(resident.pendingSemanticProposals()).toEqual([]);

    const current = owner.begin(resident, matter.id);
    expect(current.status).toBe("ready");
    if (current.status !== "ready") return;
    expect(current.ticket.semanticRevision).toBe(old.ticket.semanticRevision + 1);
    expect(resident.pendingSemanticProposals()).toEqual([current.ticket]);

    expect(owner.provider.abandon(resident, old.run)).toEqual({
      status: "abandoned",
      residentAuthority: "already_inactive"
    });
    expect(resident.pendingSemanticProposals()).toEqual([current.ticket]);
  });

  it("can bound unresolved matter admission with a sole-creator ID registry while terminal history remains a separate concern", () => {
    const resident = new P2E0ResidentCausalKernel();
    const owner = new BoundedMatterAdmissionOwnerProbe(2);

    const a = heard(resident, "speech.a", "Request A");
    const b = heard(resident, "speech.b", "Request B");
    expect(owner.admit(resident, { id: "matter.a", originEvidenceId: a.id })).toEqual({
      status: "opened"
    });
    expect(owner.admit(resident, { id: "matter.b", originEvidenceId: b.id })).toEqual({
      status: "opened"
    });
    expect(owner.unresolvedCount()).toBe(2);

    const c = heard(resident, "speech.c", "Request C");
    expect(owner.admit(resident, { id: "matter.c", originEvidenceId: c.id })).toEqual({
      status: "rejected",
      reason: "matter_capacity_reached"
    });
    expect(resident.matter("matter.c")).toBeNull();

    resident.resolveMatter("matter.a");
    expect(owner.admit(resident, { id: "matter.c", originEvidenceId: c.id })).toEqual({
      status: "opened"
    });
    expect(owner.unresolvedCount()).toBe(2);

    // Admission can be bounded without deleting history. P2-E0 still retains
    // the terminal record, so terminal-history retention remains independently unselected.
    expect(resident.matter("matter.a")).toMatchObject({ status: "resolved" });
    expect(resident.matter("matter.b")).toMatchObject({ status: "active" });
    expect(resident.matter("matter.c")).toMatchObject({ status: "active" });
  });
});
