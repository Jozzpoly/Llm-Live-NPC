import { describe, expect, it } from "vitest";
import { P2E0ResidentCausalKernel } from "./p2-e0-resident-causal-kernel";

const MATTER_COUNT = 128;

function openManyMatters(resident: P2E0ResidentCausalKernel) {
  const records = [];
  for (let index = 0; index < MATTER_COUNT; index += 1) {
    const evidence = resident.recordEvidence({
      kind: "heard",
      source: {
        kind: "actor",
        actorId: `player.${index}`,
        occurrenceId: `speech.${index}`
      },
      summary: `player.${index} said: unresolved request ${index}`
    });
    const matter = resident.openMatter({
      id: `matter.${index}`,
      originEvidenceId: evidence.id,
      semanticCourse: `handle request ${index}`
    });
    records.push({ evidence, matter });
  }
  return records;
}

describe("post-P2-E16 matter admission and retention pressure characterization", () => {
  it("retains at least 128 simultaneous unresolved matters and one semantic anchor per matter outside a one-item recent-evidence ring", () => {
    const resident = new P2E0ResidentCausalKernel(1);
    const records = openManyMatters(resident);

    expect(records).toHaveLength(MATTER_COUNT);
    expect(resident.recentEvidence()).toHaveLength(1);
    expect(resident.recentEvidence()[0]?.id).toBe(records.at(-1)?.evidence.id);

    for (const { evidence, matter } of records) {
      expect(resident.matter(matter.id)).toMatchObject({
        id: matter.id,
        status: "active",
        originEvidenceId: evidence.id,
        latestSemanticEvidenceId: evidence.id
      });
      expect(resident.semanticEvidenceAnchor(matter.id, evidence.id)).toEqual(evidence);
    }

    // Finite characterization only: there is no observed P2-E0 admission bound
    // at or below this tested fan-out. The recent evidence ring remains bounded,
    // but unresolved matter continuity intentionally retains independent anchors.
    expect(records.filter(({ matter }) => resident.matter(matter.id)?.status === "active")).toHaveLength(
      MATTER_COUNT
    );
  });

  it("releases non-terminal semantic anchors on terminalization but retains all tested terminal matter records", () => {
    const resident = new P2E0ResidentCausalKernel(1);
    const records = openManyMatters(resident);

    for (const [index, { matter }] of records.entries()) {
      if (index % 2 === 0) resident.resolveMatter(matter.id);
      else resident.cancelMatter(matter.id);
    }

    expect(resident.recentEvidence()).toHaveLength(1);

    for (const [index, { evidence, matter }] of records.entries()) {
      const terminal = resident.matter(matter.id);
      expect(terminal).toMatchObject({
        id: matter.id,
        status: index % 2 === 0 ? "resolved" : "cancelled",
        originEvidenceId: evidence.id,
        activeTaskRunId: null
      });
      expect(resident.semanticEvidenceAnchor(matter.id, evidence.id)).toBeNull();
    }

    // Terminalization correctly releases the causal anchor, but the kernel has
    // no current retirement/archive bound for matter records themselves. This
    // does not say they should be deleted immediately; it locates the missing
    // long-lived retention ownership above the current causal specimen.
    expect(records.filter(({ matter }) => resident.matter(matter.id) !== null)).toHaveLength(MATTER_COUNT);
  });
});
