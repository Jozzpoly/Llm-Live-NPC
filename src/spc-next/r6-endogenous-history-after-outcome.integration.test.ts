import fixtureJson from "../../evidence/r6-endogenous-history-after-outcome-context.json?raw";
import liveResultJson from "../../evidence/r6-endogenous-history-after-outcome-live-result.json?raw";
import fulfillmentFixtureJson from "../../evidence/r6-endogenous-standing-fulfillment-context.json?raw";
import fulfillmentLiveResultJson from "../../evidence/r6-endogenous-standing-fulfillment-live-result.json?raw";
import { describe, expect, it } from "vitest";
import { sanitizeSpcNextLifeContextWithDiagnostic } from "../../worker/spc-next-life-context";
import { ResidentCausalCognitionLane } from "./resident-causal-cognition-lane";
import { ResidentCausalExecutionCoordinator } from "./resident-causal-execution-coordinator";
import { ResidentCausalLifeSubstrate } from "./resident-causal-life-substrate";
import { ResidentContinuityKernel } from "./resident-continuity-kernel";
import type { ResidentLifeCognitionContext } from "./resident-life-cognition-context";
import type { ResidentLifeIntentProposal } from "./resident-life-intent-contract";
import { bidirectionalEdge, RegionNavigationGraph } from "./region-navigation";
import { ResidentWorldExecutionAuthority } from "./resident-world-execution-authority";
import { SpcWorldRuntime } from "./spc-world-runtime";

const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const IDA_ID = "resident.ida";
const COMMONS_ID = "commons";
const WORKSHOP_ID = "workshop";
const NELA_PROMPT = "Oren, wrócisz do mnie tutaj po sprawdzeniu warsztatu?";
const OREN_PROMISE = "Tak. Sprawdzę warsztat i potem wrócę do ciebie tutaj.";
const OREN_STANDING_GOAL = "wrócić do Neli w commons po zakończeniu sprawdzania warsztatu";
const IDA_REQUEST = "Oren, sprawdź proszę warsztat.";
const EXECUTION_GUARD = 1_200;
const COGNITION_GUARD = 48;

const canonicalFixture = JSON.parse(fixtureJson);
const liveResult = JSON.parse(liveResultJson);
const fulfillmentFixture = JSON.parse(fulfillmentFixtureJson);
const fulfillmentLiveResult = JSON.parse(fulfillmentLiveResultJson);

describe("R6 endogenous ordinary personhood after factual outcome", () => {
  it("produces matched no-fresh-command cognition frames whose only intended semantic difference is prior standing history", () => {
    const control = buildSpecimen(false);
    const history = buildSpecimen(true);

    expect(control.request.batch.reasons).toHaveLength(1);
    expect(history.request.batch.reasons).toHaveLength(1);
    expect(control.request.batch.reasons[0]).toMatchObject({ kind: "activity_completed" });
    expect(history.request.batch.reasons[0]).toMatchObject({ kind: "activity_completed" });
    expect(control.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);
    expect(history.request.batch.reasons.some((reason) => reason.kind === "heard_speech")).toBe(false);

    expect(control.speechCountAtCompletion).toBe(control.speechCountAtReflection);
    expect(history.speechCountAtCompletion).toBe(history.speechCountAtReflection);

    expect(control.request.context.currentRegionId).toBe(WORKSHOP_ID);
    expect(history.request.context.currentRegionId).toBe(WORKSHOP_ID);
    expect(control.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(history.request.context.life.body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });

    const controlStanding = standingMatters(control.request.context);
    const historyStanding = standingMatters(history.request.context);
    expect(controlStanding).toHaveLength(0);
    expect(historyStanding).toHaveLength(1);
    expect(historyStanding[0]).toMatchObject({
      status: "active",
      activeRun: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        goal: OREN_STANDING_GOAL,
        counterpartyActorId: NELA_ID,
        commitment: OREN_PROMISE,
      },
    });

    expect(stripContinuationHistory(control.request.context))
      .toEqual(stripContinuationHistory(history.request.context));

    for (const specimen of [control, history]) {
      const worker = sanitizeSpcNextLifeContextWithDiagnostic(specimen.request.context);
      expect(worker.diagnostic).toBeNull();
      expect(worker.context).not.toBeNull();
    }

    expect(control.request.context).toEqual(canonicalFixture.control);
    expect(history.request.context).toEqual(canonicalFixture.history);
  });

  it("admits the exact live-Luna split locally and turns history into a factual unprompted return", () => {
    expect(liveResult.sourceSha).toBe("592a19ecdb34598968690812310996aef8f2b0f7");
    expect(liveResult.liveProviderRun).toBe(22);
    expect(liveResult.providerRequestsAttempted).toBe(2);
    expect(liveResult.classification).toBe("ENDOGENOUS_HISTORY_CONTINUATION_OBSERVED");

    const control = buildSpecimen(false);
    const history = buildSpecimen(true);

    const controlSettlement = control.cognition.settleCommitment(
      control.request,
      liveResult.control.proposal,
      liveResult.control.originReasonId,
    );
    expect(controlSettlement).toEqual({
      status: "applied",
      residentId: OREN_ID,
      decision: "decline",
      commitment: null,
    });
    expect(control.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
    expect(control.oren.pendingCognitionReasons()).toEqual([]);

    const standingBeforeReturn = standingMatters(history.life.currentLifeView());
    expect(standingBeforeReturn).toHaveLength(1);

    const historySettlement = history.cognition.settleCommitment(
      history.request,
      liveResult.history.proposal,
      liveResult.history.originReasonId,
    );
    expect(historySettlement).toMatchObject({
      status: "applied",
      residentId: OREN_ID,
      decision: "accept",
      commitment: {
        matterId: expect.any(String),
        runId: expect.any(String),
      },
    });
    if (historySettlement.status !== "applied" || !historySettlement.commitment) {
      throw new Error("R6 endogenous live history proposal did not admit locally");
    }

    expect(history.life.currentLifeView().body.focusedRunId)
      .toBe(historySettlement.commitment.runId);

    const speechCountBeforeReturn = history.world.diagnostics().recentOccurrences
      .filter((occurrence) => occurrence.kind === "speech").length;
    const returnCompletion = completeFocused(history.execution, history.world);
    expect(returnCompletion.matterId).toBe(historySettlement.commitment.matterId);
    expect(history.oren.cognitionContext({
      residentId: OREN_ID,
      requestedAtTick: history.world.tick,
      reasons: [],
    }).currentRegionId).toBe(COMMONS_ID);
    expect(history.world.diagnostics().recentOccurrences
      .filter((occurrence) => occurrence.kind === "speech")).toHaveLength(speechCountBeforeReturn);
    expect(history.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });

    // The live model has now caused a real unprompted continuation in World.
    // Factual action alone does not silently interpret its own semantic meaning.
    const standingId = standingBeforeReturn[0]!.id;
    expect(history.life.kernel.matter(standingId)).toMatchObject({
      status: "active",
      activeRunId: null,
      semanticIntent: {
        kind: "standing_social_commitment",
        counterpartyActorId: NELA_ID,
        commitment: OREN_PROMISE,
      },
    });

    // R2's global expected-success suppression remains unchanged. This one experiment
    // explicitly reviews the factual return outcome to test standing fulfilment.
    expect(history.life.outcomeReviewBridge.observe(
      returnCompletion.outcomeEvidence,
      history.world.tick,
    )).toMatchObject({ status: "scheduled" });
    const completionRequest = waitForRequest(
      history.cognition,
      history.execution,
      history.world,
    );
    const completionOrigin = completionRequest.batch.reasons.find(
      (reason) => reason.kind === "activity_completed",
    ) ?? null;
    expect(completionOrigin).not.toBeNull();
    expect(completionRequest.context).toEqual(fulfillmentFixture);
    if (!completionOrigin) throw new Error("R6 endogenous fulfillment lost factual return outcome");

    expect(fulfillmentLiveResult.sourceSha)
      .toBe("9aff2659118a780cc9b82014d5666537832842e3");
    expect(fulfillmentLiveResult.liveProviderRun).toBe(23);
    expect(fulfillmentLiveResult.providerRequestsAttempted).toBe(1);
    expect(fulfillmentLiveResult.semanticRetries).toBe(0);
    expect(fulfillmentLiveResult.classification)
      .toBe("FACTUAL_STANDING_FULFILLMENT_RECOGNIZED");
    expect(fulfillmentLiveResult.originReasonId).toBe(completionOrigin.id);
    expect(fulfillmentLiveResult.proposal.commitmentDecision).toMatchObject({
      kind: "complete_standing",
      matterId: standingId,
    });

    const completionSettlement = history.cognition.settleCommitment(
      completionRequest,
      fulfillmentLiveResult.proposal,
      fulfillmentLiveResult.originReasonId,
    );
    expect(completionSettlement).toEqual({
      status: "applied",
      residentId: OREN_ID,
      decision: "complete_standing",
      commitment: null,
    });
    expect(history.life.kernel.matter(standingId)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(history.life.kernel.recentEvidenceSnapshot()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "resident_fulfilled_social_commitment",
        sourceRunId: returnCompletion.outcomeEvidence.sourceRunId,
        summary: expect.stringContaining(returnCompletion.outcomeEvidence.id),
      }),
    ]));
    expect(history.life.currentLifeView().body).toEqual({
      focusedRunId: null,
      deferredRunIds: [],
    });
  });

  it("rejects stale standing completion when resident life changes during cognition", () => {
    const history = buildSpecimen(true);
    const standing = standingMatters(history.request.context)[0]!;
    const origin = history.request.batch.reasons[0]!;
    expect(origin.kind).toBe("activity_completed");

    const released = history.life.originatedSocialCommitments.release({
      matterId: standing.id,
      tick: history.world.tick,
      reason: "the resident's standing responsibility changed while higher cognition was in flight",
    });
    expect(released.matter.status).toBe("resolved");

    expect(history.cognition.settleCommitment(
      history.request,
      {
        version: 1,
        commitmentDecision: {
          kind: "complete_standing",
          reason: "stale provider output must not complete an already changed responsibility",
          matterId: standing.id,
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 600,
      },
      origin.id,
    )).toEqual({
      status: "stale",
      residentId: OREN_ID,
      reason: "resident_life_changed_during_request",
    });
    expect(history.life.kernel.matter(standing.id)).toMatchObject({
      status: "resolved",
      activeRunId: null,
    });
    expect(history.life.kernel.recentEvidenceSnapshot().some(
      (evidence) => evidence.kind === "resident_fulfilled_social_commitment",
    )).toBe(false);
  });

  it("rejects standing completion against a nonexistent target matter", () => {
    const history = buildSpecimen(true);
    const standing = standingMatters(history.request.context)[0]!;
    const origin = history.request.batch.reasons[0]!;
    expect(origin.kind).toBe("activity_completed");

    expect(history.cognition.settleCommitment(
      history.request,
      {
        version: 1,
        commitmentDecision: {
          kind: "complete_standing",
          reason: "try to complete a standing matter that does not exist",
          matterId: "matter.oren.nonexistent-standing",
        },
        beliefs: [],
        concerns: [],
        reviewAfterSeconds: 600,
      },
      origin.id,
    )).toMatchObject({
      status: "rejected",
      residentId: OREN_ID,
      reason: "intent_rejected",
      detail: "standing completion target is not one open run-free standing commitment",
    });
    expect(history.life.kernel.matter(standing.id)?.status).toBe("active");
  });
});

function buildSpecimen(withStandingHistory: boolean) {
  const world = new SpcWorldRuntime({
    bounds: { minX: 0, minY: 0, maxX: 1_600, maxY: 800 },
    regions: [
      {
        id: COMMONS_ID,
        label: "Commons",
        minX: 0,
        minY: 0,
        maxX: 700,
        maxY: 800,
      },
      {
        id: WORKSHOP_ID,
        label: "Workshop",
        minX: 900,
        minY: 0,
        maxX: 1_600,
        maxY: 800,
      },
    ],
    anchors: [],
    chunkSize: 128,
    fixedDeltaSeconds: 1 / 60,
  });
  const oren = world.addResident(OREN_ID, "Oren", { x: 300, y: 400 });
  world.addResident(NELA_ID, "Nela", { x: 360, y: 400 });
  world.addResident(IDA_ID, "Ida", { x: 430, y: 400 });
  for (const residentId of [OREN_ID, NELA_ID, IDA_ID]) {
    world.familiarizeResidentWithRegions(residentId, [COMMONS_ID, WORKSHOP_ID]);
  }

  const navigation = new RegionNavigationGraph(
    [
      { id: COMMONS_ID, destinationPoint: { x: 300, y: 400 } },
      { id: WORKSHOP_ID, destinationPoint: { x: 1_300, y: 400 } },
    ],
    bidirectionalEdge(COMMONS_ID, WORKSHOP_ID, 1),
  );
  const life = new ResidentCausalLifeSubstrate({
    residentId: OREN_ID,
    resident: oren,
    world,
    navigation,
    identityNamespace: "oren-r6-endogenous",
  });
  const cognition = new ResidentCausalCognitionLane(life);
  const execution = new ResidentCausalExecutionCoordinator(life);

  const nelaKernel = new ResidentContinuityKernel();
  const nelaAuthority = new ResidentWorldExecutionAuthority(NELA_ID, nelaKernel, world);
  const idaKernel = new ResidentContinuityKernel();
  const idaAuthority = new ResidentWorldExecutionAuthority(IDA_ID, idaKernel, world);

  world.step();

  const nelaSpeech = factualAddressedSpeech({
    world,
    kernel: nelaKernel,
    authority: nelaAuthority,
    actorId: NELA_ID,
    targetId: OREN_ID,
    key: "nela-return-promise",
    text: NELA_PROMPT,
  });
  world.step();

  const promiseRequest = waitForRequest(cognition, execution, world);
  const promiseReason = exactSpeechReason(promiseRequest.context, NELA_ID, NELA_PROMPT);
  if (!promiseReason) throw new Error("R6 endogenous specimen lost Nela promise origin");

  const promiseDecision: ResidentLifeIntentProposal["commitmentDecision"] = {
    kind: "accept",
    reason: "Nela asked about my return and I deliberately answer with the same factual promise in both twins.",
    intent: {
      kind: "communicate",
      goal: "tell Nela I will check the workshop and return here afterward",
      targetActorId: NELA_ID,
      targetRegionId: null,
      targetPosition: null,
      text: OREN_PROMISE,
    },
    ...(withStandingHistory
      ? { standingSocialCommitment: { goal: OREN_STANDING_GOAL } }
      : {}),
  };
  const promiseSettlement = cognition.settleCommitment(promiseRequest, {
    version: 1,
    commitmentDecision: promiseDecision,
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 30,
  }, promiseReason.id);
  expect(promiseSettlement).toMatchObject({ status: "applied", decision: "accept" });
  if (promiseSettlement.status !== "applied" || !promiseSettlement.commitment) {
    throw new Error("R6 endogenous specimen failed to admit Oren promise speech");
  }

  const promiseCompletion = completeFocused(execution, world);
  expect(promiseCompletion.matterId).toBe(promiseSettlement.commitment.matterId);
  const factualPromise = world.diagnostics().recentOccurrences.find(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === OREN_ID
      && occurrence.text === OREN_PROMISE
      && occurrence.addressedActorIds.includes(NELA_ID),
  ) ?? null;
  expect(factualPromise).not.toBeNull();
  expect(factualPromise?.id).not.toBe(nelaSpeech.id);

  expect(standingMatters(life.currentLifeView())).toHaveLength(withStandingHistory ? 1 : 0);

  factualAddressedSpeech({
    world,
    kernel: idaKernel,
    authority: idaAuthority,
    actorId: IDA_ID,
    targetId: OREN_ID,
    key: "ida-workshop-task",
    text: IDA_REQUEST,
  });
  world.step();

  const workshopRequest = waitForRequest(cognition, execution, world);
  const workshopReason = exactSpeechReason(workshopRequest.context, IDA_ID, IDA_REQUEST);
  if (!workshopReason) throw new Error("R6 endogenous specimen lost Ida workshop origin");
  const workshopSettlement = cognition.settleCommitment(workshopRequest, {
    version: 1,
    commitmentDecision: {
      kind: "accept",
      reason: "I accept the bounded workshop check before the later endogenous reflection point.",
      intent: {
        kind: "travel",
        goal: "go to the familiar workshop and finish this bounded check",
        targetActorId: null,
        targetRegionId: WORKSHOP_ID,
        targetPosition: null,
        text: null,
      },
    },
    beliefs: [],
    concerns: [],
    reviewAfterSeconds: 600,
  }, workshopReason.id);
  expect(workshopSettlement).toMatchObject({ status: "applied", decision: "accept" });
  if (workshopSettlement.status !== "applied" || !workshopSettlement.commitment) {
    throw new Error("R6 endogenous specimen failed to admit workshop matter");
  }

  const workshopCompletion = completeFocused(execution, world);
  expect(workshopCompletion.matterId).toBe(workshopSettlement.commitment.matterId);
  expect(oren.cognitionContext({
    residentId: OREN_ID,
    requestedAtTick: world.tick,
    reasons: [],
  }).currentRegionId).toBe(WORKSHOP_ID);

  // R2 deliberately suppresses expected-success -> cognition as a global policy.
  // R6 explicitly opts this one factual resident outcome into semantic reflection to
  // test whether accumulated private life can shape what happens next.
  expect(oren.pendingCognitionReasons()).toEqual([]);
  expect(life.outcomeReviewBridge.observe(
    workshopCompletion.outcomeEvidence,
    world.tick,
  )).toMatchObject({ status: "scheduled" });

  const speechCountAtCompletion = world.diagnostics().recentOccurrences
    .filter((occurrence) => occurrence.kind === "speech").length;
  const request = waitForRequest(cognition, execution, world);
  const speechCountAtReflection = world.diagnostics().recentOccurrences
    .filter((occurrence) => occurrence.kind === "speech").length;

  return {
    request,
    speechCountAtCompletion,
    speechCountAtReflection,
    oren,
    life,
    cognition,
    execution,
    world,
  };
}

function factualAddressedSpeech(input: {
  world: SpcWorldRuntime;
  kernel: ResidentContinuityKernel;
  authority: ResidentWorldExecutionAuthority;
  actorId: string;
  targetId: string;
  key: string;
  text: string;
}) {
  const tick = input.world.tick;
  const origin = input.kernel.recordEvidence({
    id: `evidence.${input.actorId}.${input.key}.${tick}`,
    tick,
    kind: "life_context",
    summary: `${input.actorId} already decided one bounded addressed speech act.`,
  });
  const matterId = `matter.${input.actorId}.${input.key}.${tick}`;
  const runId = `run.${input.actorId}.${input.key}.${tick}`;
  input.kernel.openMatter({
    id: matterId,
    originEvidenceId: origin.id,
    semanticCourse: `deliver bounded addressed speech ${input.key}`,
  });
  input.kernel.bindRun({
    matterId,
    taskId: `task.${input.actorId}.${input.key}.${tick}`,
    runId,
  });
  const applied = input.authority.apply({
    runId,
    effects: [{
      kind: "speech",
      text: input.text,
      radius: 420,
      addressedActorIds: [input.targetId],
    }],
  });
  if (applied.status !== "applied" || applied.occurrences.length !== 1) {
    throw new Error(`R6 endogenous factual speech failed: ${input.key}`);
  }
  expect(input.kernel.reconcileRunOutcome({
    runId,
    tick: input.world.tick,
    status: "succeeded",
    summary: `${input.actorId} factually delivered ${input.key}.`,
  }).status).toBe("recorded");
  input.kernel.resolveMatter(matterId);
  return applied.occurrences[0]!;
}

function completeFocused(
  execution: ResidentCausalExecutionCoordinator,
  world: SpcWorldRuntime,
) {
  for (let index = 0; index < EXECUTION_GUARD; index += 1) {
    const step = execution.stepFocusedRun();
    if (step.status === "completed") {
      world.step();
      return step;
    }
    if (step.status !== "running") {
      throw new Error(`R6 endogenous focused execution failed: ${step.status}`);
    }
    world.step();
  }
  throw new Error("R6 endogenous focused execution exceeded guard");
}

function waitForRequest(
  cognition: ResidentCausalCognitionLane,
  execution: ResidentCausalExecutionCoordinator,
  world: SpcWorldRuntime,
) {
  let request = cognition.takeReadyRequest();
  for (let index = 0; index < COGNITION_GUARD && !request; index += 1) {
    const step = execution.stepFocusedRun();
    if (step.status !== "idle" && step.status !== "running") {
      throw new Error(`R6 endogenous unexpected execution while awaiting cognition: ${step.status}`);
    }
    world.step();
    request = cognition.takeReadyRequest();
  }
  if (!request) throw new Error("R6 endogenous specimen produced no cognition request");
  return request;
}

function exactSpeechReason(
  context: ResidentLifeCognitionContext,
  actorId: string,
  text: string,
) {
  return context.reasons.find(
    (reason) => reason.kind === "heard_speech"
      && reason.evidenceIds.some((id) => context.recentPercepts.some(
        (percept) => percept.id === id
          && percept.actorId === actorId
          && percept.text === text,
      )),
  ) ?? null;
}

function standingMatters(context: { life?: ResidentLifeCognitionContext["life"]; matters?: ResidentLifeCognitionContext["life"]["matters"] }) {
  const matters = "life" in context && context.life
    ? context.life.matters
    : context.matters ?? [];
  return matters.filter((matter) => matter.semanticIntent?.kind === "standing_social_commitment");
}

function stripContinuationHistory(context: ResidentLifeCognitionContext) {
  const clone = structuredClone(context);
  clone.life.matters = clone.life.matters
    .filter((matter) => matter.semanticIntent?.kind !== "standing_social_commitment")
    .map((matter) => {
      if (matter.semanticIntent?.kind !== "communicate_actor"
        || matter.semanticIntent.standingSocialCommitment === undefined) {
        return matter;
      }
      const semanticIntent = structuredClone(matter.semanticIntent);
      delete semanticIntent.standingSocialCommitment;
      return { ...matter, semanticIntent };
    });
  return clone;
}
