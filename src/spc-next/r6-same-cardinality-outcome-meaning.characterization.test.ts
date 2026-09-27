import { describe, expect, it } from "vitest";
import type { ResidentActivity, Vec2 } from "./contracts";
import {
  IDA_MESSAGE_MATTER_ID,
  createFiveResidentIdaMessageDeliverySlice,
} from "./five-resident-ida-message-delivery-slice";
import { derivePriorSameActorOutcomeSupport } from "./resident-cumulative-history-support";
import { ResidentExecutionArbitrator } from "./resident-execution-arbitrator";
import { ResidentExecutionFocusAuthority } from "./resident-execution-focus-authority";
import {
  deriveResidentLifeChoiceCandidateSupports,
} from "./resident-life-choice-causal-support";
import { captureResidentLifeCognitionView } from "./resident-life-cognition-view";
import { ResidentMessageDeliveryExecutor } from "./resident-message-delivery-executor";

const JANEK_ID = "resident.janek";
const CURRENT = "matter.ida.r6.same-cardinality.current-janek";
const SECOND = "matter.ida.r6.same-cardinality.old-second";
const SECOND_RUN = "run.ida.r6.same-cardinality.old-second";
const HIDDEN_JANEK_POSITION = Object.freeze({ x: 1_200, y: 720 });
const EXECUTION_GUARD = 1_100;
const RELOCATION_GUARD = 600;

describe("R6 same-cardinality factual outcome meaning", () => {
  it("preserves two succeeded versus two blocked same-actor episodes as distinct factual support without adding relationship state", () => {
    const succeeded = buildHistory("succeeded");
    const blocked = buildHistory("blocked");

    expect(succeeded.support).toHaveLength(2);
    expect(blocked.support).toHaveLength(2);
    expect(succeeded.support.map((entry) => entry.relation)).toEqual([
      "prior_same_actor_outcome",
      "prior_same_actor_outcome",
    ]);
    expect(blocked.support.map((entry) => entry.relation)).toEqual([
      "prior_same_actor_outcome",
      "prior_same_actor_outcome",
    ]);

    expect(succeeded.facts.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^succeeded:/),
      expect.stringMatching(/^succeeded:/),
    ]);
    expect(blocked.facts.map((fact) => fact.summary)).toEqual([
      expect.stringMatching(/^blocked:/),
      expect.stringMatching(/^blocked:/),
    ]);

    expect(succeeded.facts.every((fact) => fact.relation === "prior_same_actor_outcome"))
      .toBe(true);
    expect(blocked.facts.every((fact) => fact.relation === "prior_same_actor_outcome"))
      .toBe(true);

    // Same cardinality and same structured target relation. The current system already
    // preserves factual outcome meaning in the evidence summaries; no score/state is
    // required merely to expose this sharper counterfactual to later judgement.
    expect(succeeded.facts).toHaveLength(blocked.facts.length);
    expect(succeeded.currentTargetActorId).toBe(JANEK_ID);
    expect(blocked.currentTargetActorId).toBe(JANEK_ID);

    for (const variant of [succeeded, blocked]) {
      expect(variant.kernel.matter(IDA_MESSAGE_MATTER_ID)).toMatchObject({
        status: expect.stringMatching(/resolved|cancelled/),
        activeRunId: null,
        semanticIntent: expect.objectContaining({
          kind: "communicate_actor",
          targetActorId: JANEK_ID,
        }),
      });
      expect(variant.kernel.matter(SECOND)).toMatchObject({
        status: expect.stringMatching(/resolved|cancelled/),
        activeRunId: null,
        semanticIntent: expect.objectContaining({
          kind: "communicate_actor",
          targetActorId: JANEK_ID,
        }),
      });
      expect(variant.life.matters.some(
        (matter) => matter.id === IDA_MESSAGE_MATTER_ID || matter.id === SECOND,
      )).toBe(false);
    }
  });
});

function buildHistory(kind: "succeeded" | "blocked") {
  const slice = createFiveResidentIdaMessageDeliverySlice();

  if (kind === "blocked") {
    relocateJanekOutsideIdaKnowledge(slice, HIDDEN_JANEK_POSITION);
  }

  const first = runInitialEpisode(slice);
  if (first.status === "blocked") {
    slice.kernel.cancelMatter(IDA_MESSAGE_MATTER_ID);
  }

  const secondOrigin = slice.kernel.recordEvidence({
    id: "evidence:ida:r6:same-cardinality:second-origin",
    tick: slice.world.tick,
    kind: "accepted_cognition_commitment",
    summary: "Ida independently owns a second bounded factual attempt to speak with Janek.",
  });
  slice.kernel.openMatter({
    id: SECOND,
    originEvidenceId: secondOrigin.id,
    semanticCourse: "second bounded communication attempt with Janek",
    semanticIntent: {
      kind: "communicate_actor",
      goal: "speak with Janek a second time",
      targetActorId: JANEK_ID,
      text: "Janek, chcę przekazać ci jeszcze jedną krótką wiadomość.",
    },
  });
  slice.kernel.bindRun({
    matterId: SECOND,
    taskId: "task.ida.r6.same-cardinality.old-second",
    runId: SECOND_RUN,
  });

  const secondExecutor = new ResidentMessageDeliveryExecutor(
    SECOND_RUN,
    JANEK_ID,
    "Janek, chcę przekazać ci jeszcze jedną krótką wiadomość.",
    () => slice.idaRecipientContact(),
    slice.authority,
    slice.world,
  );
  const second = runSecondEpisode(slice, secondExecutor);
  const reconciled = slice.kernel.reconcileRunOutcome({
    runId: SECOND_RUN,
    tick: slice.world.tick,
    status: second.status === "delivered" ? "succeeded" : "blocked",
    summary: second.status === "delivered"
      ? `Ida factually delivered the second bounded message to Janek through World speech occurrence ${second.occurrence.id}`
      : `Ida's second bounded message attempt factually ended with ${second.reason}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") throw new Error("second episode did not reconcile");

  if (second.status === "delivered") slice.kernel.resolveMatter(SECOND);
  else slice.kernel.cancelMatter(SECOND);

  const support = derivePriorSameActorOutcomeSupport(slice.kernel, JANEK_ID);
  expect(support).toHaveLength(2);

  const currentOrigin = slice.kernel.recordEvidence({
    id: "evidence:ida:r6:same-cardinality:current-origin",
    tick: slice.world.tick + 1,
    kind: "accepted_cognition_commitment",
    summary: "Ida has one identical current reason to speak with Janek again.",
  });
  slice.kernel.openMatter({
    id: CURRENT,
    originEvidenceId: currentOrigin.id,
    semanticCourse: "speak with Janek about the current situation",
    semanticIntent: {
      kind: "communicate_actor",
      goal: "speak with Janek about the current situation",
      targetActorId: JANEK_ID,
      text: "Janek, porozmawiajmy o tym, co dzieje się teraz.",
    },
    historicalSupport: support,
  });

  const focus = new ResidentExecutionFocusAuthority(slice.kernel);
  const arbitrator = new ResidentExecutionArbitrator(slice.kernel, focus);
  const life = captureResidentLifeCognitionView({
    kernel: slice.kernel,
    focus,
    arbitrator,
    matterIds: [CURRENT],
  });
  const facts = deriveResidentLifeChoiceCandidateSupports(life, [CURRENT])
    .find((candidate) => candidate.matterId === CURRENT)?.facts
    .filter((fact) => fact.relation === "prior_same_actor_outcome") ?? [];

  const currentMatter = slice.kernel.matter(CURRENT);
  if (currentMatter?.semanticIntent?.kind !== "communicate_actor") {
    throw new Error("current same-cardinality matter lost communicate_actor intent");
  }

  return {
    kernel: slice.kernel,
    life,
    support,
    facts,
    currentTargetActorId: currentMatter.semanticIntent.targetActorId,
  };
}

function runInitialEpisode(slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>) {
  for (let guard = 0; guard < EXECUTION_GUARD; guard += 1) {
    const step = slice.advanceOneWorldTick();
    if (step.status === "delivered" || step.status === "blocked") return step;
    if (step.status === "authority_lost") throw new Error("initial episode lost authority");
  }
  throw new Error("initial communication episode exceeded guard");
}

function runSecondEpisode(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  executor: ResidentMessageDeliveryExecutor,
) {
  for (let guard = 0; guard < EXECUTION_GUARD; guard += 1) {
    const step = executor.step();
    if (step.status === "delivered" || step.status === "blocked") return step;
    if (step.status === "authority_lost") throw new Error("second episode lost authority");
    slice.world.step();
  }
  throw new Error("second communication episode exceeded guard");
}

function relocateJanekOutsideIdaKnowledge(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  target: Vec2,
): void {
  slice.world.setResidentActivity(JANEK_ID, travelActivity("same-cardinality-hidden-relocation", target));
  for (let guard = 0; guard < RELOCATION_GUARD; guard += 1) {
    const position = actorPosition(slice, JANEK_ID);
    if (Math.hypot(position.x - target.x, position.y - target.y) <= 18) {
      slice.world.setResidentActivity(JANEK_ID, idleActivity("same-cardinality-hidden-hold"));
      slice.world.step();
      return;
    }
    slice.world.step();
  }
  throw new Error("same-cardinality hidden relocation exceeded guard");
}

function actorPosition(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  actorId: string,
): Vec2 {
  const actor = slice.world.publicSnapshot().actors.find((candidate) => candidate.id === actorId);
  if (!actor) throw new Error(`missing actor ${actorId}`);
  return { ...actor.position };
}

function travelActivity(id: string, targetPosition: Vec2): ResidentActivity {
  return {
    id: `activity:${id}:travel:r6-same-cardinality`,
    kind: "travel",
    targetActorId: null,
    targetPosition: { ...targetPosition },
    text: null,
    speed: 110,
    reason: "move Janek outside Ida's acquired contact without oracle-updating Ida",
  };
}

function idleActivity(id: string): ResidentActivity {
  return {
    id: `activity:${id}:idle:r6-same-cardinality`,
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "hold hidden Janek after relocation",
  };
}
