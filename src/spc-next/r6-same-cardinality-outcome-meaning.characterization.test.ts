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
const OLD_A = "matter.ida.r6.same-cardinality.old-a";
const OLD_B = "matter.ida.r6.same-cardinality.old-b";
const OLD_A_RUN = "run.ida.r6.same-cardinality.old-a";
const OLD_B_RUN = "run.ida.r6.same-cardinality.old-b";
const HIDDEN_JANEK_POSITION = Object.freeze({ x: 1_200, y: 720 });
const EXECUTION_GUARD = 1_100;
const RELOCATION_GUARD = 600;

describe("R6 same-cardinality factual outcome meaning", () => {
  it("preserves two succeeded versus two blocked same-actor episodes as distinct factual support without adding relationship state", () => {
    const succeeded = buildHistory("succeeded");
    const blocked = buildHistory("blocked");

    for (const variant of [succeeded, blocked]) {
      expect(variant.support).toHaveLength(2);
      expect(variant.support.map((entry) => entry.sourceMatterId).sort()).toEqual(
        [OLD_A, OLD_B].sort(),
      );
      expect(variant.support.map((entry) => entry.relation)).toEqual([
        "prior_same_actor_outcome",
        "prior_same_actor_outcome",
      ]);
      // The legacy I1 setup matter deliberately has no structured communicate_actor
      // intent, so exact same-actor genealogy must ignore it rather than guessing from prose.
      expect(variant.support.some((entry) => entry.sourceMatterId === IDA_MESSAGE_MATTER_ID))
        .toBe(false);
    }

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

    // Actor identity, eligible history cardinality and current semantic relation are
    // matched. Existing factual task-outcome evidence already preserves the meaningful
    // succeeded-vs-blocked distinction; no relationship score is needed to expose it.
    expect(succeeded.facts).toHaveLength(blocked.facts.length);
    expect(succeeded.currentTargetActorId).toBe(JANEK_ID);
    expect(blocked.currentTargetActorId).toBe(JANEK_ID);

    for (const variant of [succeeded, blocked]) {
      for (const oldMatterId of [OLD_A, OLD_B]) {
        expect(variant.kernel.matter(oldMatterId)).toMatchObject({
          status: expect.stringMatching(/resolved|cancelled/),
          activeRunId: null,
          semanticIntent: {
            kind: "communicate_actor",
            targetActorId: JANEK_ID,
          },
        });
      }
      expect(variant.life.matters.some(
        (matter) => matter.id === OLD_A || matter.id === OLD_B,
      )).toBe(false);
    }
  });
});

function buildHistory(kind: "succeeded" | "blocked") {
  const slice = createFiveResidentIdaMessageDeliverySlice();

  // The legacy I1 run is used only to establish the real World/contact geometry. It is
  // explicitly excluded from eligible same-actor history because its old fixture matter
  // predates structured communicate_actor intent.
  if (kind === "blocked") {
    relocateJanekOutsideIdaKnowledge(slice, HIDDEN_JANEK_POSITION);
  }
  const setupEpisode = runInitialEpisode(slice);
  if (setupEpisode.status === "blocked") {
    slice.kernel.cancelMatter(IDA_MESSAGE_MATTER_ID);
  }
  expect(slice.kernel.matter(IDA_MESSAGE_MATTER_ID)?.semanticIntent).toBeNull();

  const oldA = runStructuredEpisode(
    slice,
    OLD_A,
    OLD_A_RUN,
    "Ida, to jest pierwsza z dwóch strukturalnych wiadomości do Janek.",
  );
  const oldB = runStructuredEpisode(
    slice,
    OLD_B,
    OLD_B_RUN,
    "Ida, to jest druga z dwóch strukturalnych wiadomości do Janek.",
  );

  if (kind === "succeeded") {
    expect(oldA.status).toBe("delivered");
    expect(oldB.status).toBe("delivered");
  } else {
    expect(oldA.status).toBe("blocked");
    expect(oldB.status).toBe("blocked");
    if (oldA.status === "blocked") {
      expect(oldA.reason).toBe("recipient_absent_at_best_known_contact");
    }
    if (oldB.status === "blocked") {
      expect(oldB.reason).toBe("recipient_absent_at_best_known_contact");
    }
  }

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

function runStructuredEpisode(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  matterId: string,
  runId: string,
  text: string,
) {
  const origin = slice.kernel.recordEvidence({
    id: `evidence:${matterId}:origin`,
    tick: slice.world.tick,
    kind: "accepted_cognition_commitment",
    summary: `Ida independently owns structured bounded communication ${matterId}.`,
  });
  slice.kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: "bounded structured communication with Janek",
    semanticIntent: {
      kind: "communicate_actor",
      goal: "speak with Janek in one bounded factual episode",
      targetActorId: JANEK_ID,
      text,
    },
  });
  slice.kernel.bindRun({
    matterId,
    taskId: `task.${matterId}`,
    runId,
  });

  const executor = new ResidentMessageDeliveryExecutor(
    runId,
    JANEK_ID,
    text,
    () => slice.idaRecipientContact(),
    slice.authority,
    slice.world,
  );
  const terminal = runExecutor(slice, executor);
  const reconciled = slice.kernel.reconcileRunOutcome({
    runId,
    tick: slice.world.tick,
    status: terminal.status === "delivered" ? "succeeded" : "blocked",
    summary: terminal.status === "delivered"
      ? `Ida factually delivered structured speech to Janek through World occurrence ${terminal.occurrence.id}`
      : `Ida's structured communication factually ended with ${terminal.reason}`,
  });
  expect(reconciled.status).toBe("recorded");
  if (reconciled.status !== "recorded") throw new Error("structured episode did not reconcile");

  if (terminal.status === "delivered") slice.kernel.resolveMatter(matterId);
  else slice.kernel.cancelMatter(matterId);

  return terminal;
}

function runInitialEpisode(slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>) {
  for (let guard = 0; guard < EXECUTION_GUARD; guard += 1) {
    const step = slice.advanceOneWorldTick();
    if (step.status === "delivered" || step.status === "blocked") return step;
    if (step.status === "authority_lost") throw new Error("initial episode lost authority");
  }
  throw new Error("initial communication episode exceeded guard");
}

function runExecutor(
  slice: ReturnType<typeof createFiveResidentIdaMessageDeliverySlice>,
  executor: ResidentMessageDeliveryExecutor,
) {
  for (let guard = 0; guard < EXECUTION_GUARD; guard += 1) {
    const step = executor.step();
    if (step.status === "delivered" || step.status === "blocked") return step;
    if (step.status === "authority_lost") throw new Error("structured episode lost authority");
    slice.world.step();
  }
  throw new Error("structured communication episode exceeded guard");
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
