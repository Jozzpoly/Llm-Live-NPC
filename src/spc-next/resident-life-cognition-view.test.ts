import { describe, expect, it } from "vitest";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";

const MATTER_A = "matter.mira.a";
const MATTER_B = "matter.mira.b";
const RUN_A = "run.mira.a";
const RUN_B = "run.mira.b";

describe("resident life cognition truth projection", () => {
  it("shows the exact continuing matter and focused run even when legacy activity could say something else", () => {
    const fixture = setupTwoMatters();
    expect(fixture.arbitrator.request(RUN_A)).toEqual({ status: "acquired", runId: RUN_A });

    const view = captureResidentLifeCognitionView({
      kernel: fixture.kernel,
      focus: fixture.focus,
      arbitrator: fixture.arbitrator,
      matterIds: [MATTER_A],
    });

    expect(view).toMatchObject({
      version: 1,
      body: {
        focusedRunId: RUN_A,
        deferredRunIds: [],
      },
      matters: [{
        id: MATTER_A,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "continue matter a",
        originEvidence: {
          id: "evidence.a",
          kind: "life_context",
          summary: "matter a exists",
        },
        activeRun: {
          runId: RUN_A,
          taskId: "task.mira.a",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "focused",
        },
      }],
    });
  });

  it("distinguishes the current body owner from a still-current deferred matter without ranking them", () => {
    const fixture = setupTwoMatters();
    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    const view = captureResidentLifeCognitionView({
      kernel: fixture.kernel,
      focus: fixture.focus,
      arbitrator: fixture.arbitrator,
      matterIds: [MATTER_B, MATTER_A, MATTER_B],
    });

    expect(view.body).toEqual({
      focusedRunId: RUN_A,
      deferredRunIds: [RUN_B],
    });
    expect(view.matters.map((matter) => matter.id)).toEqual([MATTER_B, MATTER_A]);
    expect(view.matters.find((matter) => matter.id === MATTER_A)?.activeRun?.bodyState).toBe("focused");
    expect(view.matters.find((matter) => matter.id === MATTER_B)?.activeRun).toMatchObject({
      runId: RUN_B,
      canMutateWorld: true,
      bodyState: "deferred",
    });
  });

  it("reflects semantic suspension and authority loss from the kernel instead of preserving stale body claims", () => {
    const fixture = setupTwoMatters();
    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    fixture.kernel.suspendMatter(MATTER_B, MATTER_A);

    const view = captureResidentLifeCognitionView({
      kernel: fixture.kernel,
      focus: fixture.focus,
      arbitrator: fixture.arbitrator,
      matterIds: [MATTER_A, MATTER_B],
    });

    const b = view.matters.find((matter) => matter.id === MATTER_B);
    expect(b).toMatchObject({
      status: "suspended",
      suspendedByMatterId: MATTER_A,
      activeRun: {
        runId: RUN_B,
        canMutateWorld: false,
        bodyState: "unfocused",
      },
    });
    expect(view.body.deferredRunIds).toEqual([]);
  });

  it("is read-only over resident continuity state", () => {
    const fixture = setupTwoMatters();
    expect(fixture.arbitrator.request(RUN_A).status).toBe("acquired");
    expect(fixture.arbitrator.request(RUN_B).status).toBe("busy");

    const beforeA = fixture.kernel.matter(MATTER_A);
    const beforeB = fixture.kernel.matter(MATTER_B);
    const beforeBindingA = fixture.kernel.runBinding(RUN_A);
    const beforeBindingB = fixture.kernel.runBinding(RUN_B);

    captureResidentLifeCognitionView({
      kernel: fixture.kernel,
      focus: fixture.focus,
      arbitrator: fixture.arbitrator,
      matterIds: [MATTER_A, MATTER_B],
    });

    expect(fixture.kernel.matter(MATTER_A)).toEqual(beforeA);
    expect(fixture.kernel.matter(MATTER_B)).toEqual(beforeB);
    expect(fixture.kernel.runBinding(RUN_A)).toEqual(beforeBindingA);
    expect(fixture.kernel.runBinding(RUN_B)).toEqual(beforeBindingB);
  });

  it("rejects unknown scoped matter ids instead of silently fabricating or omitting life state", () => {
    const fixture = setupTwoMatters();
    expect(() => captureResidentLifeCognitionView({
      kernel: fixture.kernel,
      focus: fixture.focus,
      arbitrator: fixture.arbitrator,
      matterIds: ["matter.mira.unknown"],
    })).toThrow("unknown resident life matter");
  });
});

function setupTwoMatters() {
  const kernel = new ResidentContinuityKernel();
  kernel.recordEvidence({ id: "evidence.a", tick: 1, kind: "life_context", summary: "matter a exists" });
  kernel.recordEvidence({ id: "evidence.b", tick: 1, kind: "life_context", summary: "matter b exists" });
  kernel.openMatter({ id: MATTER_A, originEvidenceId: "evidence.a", semanticCourse: "continue matter a" });
  kernel.openMatter({ id: MATTER_B, originEvidenceId: "evidence.b", semanticCourse: "continue matter b" });
  kernel.bindRun({ matterId: MATTER_A, taskId: "task.mira.a", runId: RUN_A });
  kernel.bindRun({ matterId: MATTER_B, taskId: "task.mira.b", runId: RUN_B });
  const focus = new ResidentExecutionFocusAuthority(kernel);
  const arbitrator = new ResidentExecutionArbitrator(kernel, focus);
  return { kernel, focus, arbitrator };
}
