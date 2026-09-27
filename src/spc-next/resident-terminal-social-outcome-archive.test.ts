import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";

describe("bounded terminal counterparty social outcome archive", () => {
  it("survives recent-evidence churn and committed reconstruction without reopening the old standing matter", () => {
    const kernel = new ResidentContinuityKernel({
      recentEvidenceLimit: 2,
      terminalOutcomeArchiveLimit: 4,
    });

    const archived = createCounterpartyRelease(
      kernel,
      "standing-a",
      "resident.nela",
      "occurrence:r6:counterparty:release:a",
      10,
    );

    for (let index = 0; index < 6; index += 1) {
      kernel.recordEvidence({
        id: `evidence:r6:counterparty:churn:${index}`,
        tick: 30 + index,
        kind: "later_life",
        summary: `ordinary later life ${index}`,
      });
    }
    expect(kernel.recentEvidenceSnapshot().some((entry) => entry.id === archived.evidence.id))
      .toBe(false);
    expect(kernel.terminalSocialOutcomeArchiveSnapshot()).toEqual([archived]);

    const restored = new ResidentContinuityKernel({
      committedSnapshot: kernel.snapshotCommittedState(),
    });
    expect(restored.terminalSocialOutcomeArchiveSnapshot()).toEqual([archived]);
    expect(restored.matter(archived.matterId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        counterpartyActorId: "resident.nela",
      },
    });
  });

  it("uses the same bounded archive limit and keeps only the newest exact counterparty exits", () => {
    const kernel = new ResidentContinuityKernel({
      terminalOutcomeArchiveLimit: 2,
    });
    const first = createCounterpartyRelease(
      kernel,
      "standing-first",
      "resident.nela",
      "occurrence:r6:counterparty:release:first",
      1,
    );
    const second = createCounterpartyRelease(
      kernel,
      "standing-second",
      "resident.nela",
      "occurrence:r6:counterparty:release:second",
      10,
    );
    const third = createCounterpartyRelease(
      kernel,
      "standing-third",
      "resident.ida",
      "occurrence:r6:counterparty:release:third",
      20,
    );

    expect(kernel.terminalSocialOutcomeArchiveSnapshot()).toEqual([second, third]);
    expect(kernel.terminalSocialOutcomeArchiveSnapshot().some(
      (entry) => entry.evidence.id === first.evidence.id,
    )).toBe(false);
  });

  it("rejects forged actor provenance", () => {
    const kernel = new ResidentContinuityKernel();
    const origin = kernel.recordEvidence({
      id: "evidence:r6:counterparty:forged:origin",
      tick: 1,
      kind: "resident_originated_social_commitment",
      summary: "one standing commitment to Nela",
    });
    const matterId = "matter.r6.counterparty.forged";
    kernel.openMatter({
      id: matterId,
      originEvidenceId: origin.id,
      semanticCourse: "remain available to Nela",
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: "remain available to Nela",
        counterpartyActorId: "resident.nela",
        commitment: "I will remain available.",
      },
    });
    const release = kernel.recordEvidence({
      id: "evidence:r6:counterparty:forged:release",
      tick: 2,
      kind: "resident_released_social_commitment",
      summary: "exact release fixture",
    });
    kernel.advanceSemanticContext(matterId, release.id);
    kernel.resolveMatter(matterId);

    expect(() => kernel.archiveCounterpartySocialOutcome({
      matterId,
      counterpartyActorId: "resident.ida",
      occurrenceId: "occurrence:r6:counterparty:forged",
      evidenceId: release.id,
    })).toThrow("counterparty social archive requires exact terminal standing release evidence");
  });
});

function createCounterpartyRelease(
  kernel: ResidentContinuityKernel,
  suffix: string,
  counterpartyActorId: string,
  occurrenceId: string,
  tick: number,
) {
  const matterId = `matter.r6.counterparty.${suffix}`;
  const origin = kernel.recordEvidence({
    id: `evidence:r6:counterparty:${suffix}:origin`,
    tick,
    kind: "resident_originated_social_commitment",
    summary: `standing commitment to ${counterpartyActorId}`,
  });
  kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `remain available to ${counterpartyActorId}`,
    semanticIntent: {
      kind: "standing_social_commitment",
      goal: `remain available to ${counterpartyActorId}`,
      counterpartyActorId,
      commitment: "I will remain available until released.",
    },
  });
  const evidence = kernel.recordEvidence({
    id: `evidence:r6:counterparty:${suffix}:release`,
    tick: tick + 1,
    kind: "resident_released_social_commitment",
    summary: `counterparty factually released this standing commitment through ${occurrenceId}`,
  });
  kernel.advanceSemanticContext(matterId, evidence.id);
  kernel.resolveMatter(matterId);
  return kernel.archiveCounterpartySocialOutcome({
    matterId,
    counterpartyActorId,
    occurrenceId,
    evidenceId: evidence.id,
  });
}
