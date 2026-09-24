import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-history-choice-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const ORIGIN_REASON_ID = "reason:oren:r6:ida-workshop-request:140";
const WORKSHOP_ID = "workshop";
const MAX_PROVIDER_REQUESTS = 2;

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

function standingMatter() {
  return {
    id: "matter.oren.r6.standing.nela",
    status: "active",
    semanticRevision: 1,
    semanticCourse:
      "pozostać tutaj przy Neli jeszcze przez chwilę · Tak, zostanę tutaj przy tobie jeszcze chwilę.",
    semanticIntent: {
      kind: "standing_social_commitment",
      goal: "pozostać tutaj przy Neli jeszcze przez chwilę",
      counterpartyActorId: "resident.nela",
      commitment: "Tak, zostanę tutaj przy tobie jeszcze chwilę.",
    },
    suspendedByMatterId: null,
    originEvidence: {
      id: "evidence:oren:r6:standing:nela",
      tick: 100,
      kind: "resident_originated_social_commitment",
      summary:
        "Oren factually addressed Nela and created the standing commitment: Tak, zostanę tutaj przy tobie jeszcze chwilę.",
      sourceRunId: "run.oren.r6.promise-nela",
    },
    semanticEvidence: null,
    lastOutcomeEvidence: null,
    activeRun: null,
  };
}

function context(withHistory) {
  return {
    contract: "resident_life_cognition_v1",
    resident: { id: "resident.oren", name: "Oren" },
    tick: 140,
    currentRegionId: "commons",
    reasons: [{
      id: ORIGIN_REASON_ID,
      tick: 140,
      kind: "heard_speech",
      salience: 0.9,
      summary: "Ida directly asked Oren to leave now for the workshop to help with a heavy crate.",
      evidenceIds: ["percept:oren:r6:ida-workshop-request:140"],
    }],
    localActivity: {
      id: "activity:resident.oren:idle:r6-history-choice",
      kind: "idle",
      targetActorId: null,
      targetPosition: null,
      text: null,
      speed: null,
      reason: "Oren currently has no body-owning local activity.",
    },
    recentPercepts: [{
      id: "percept:oren:r6:ida-workshop-request:140",
      occurrenceId: "occurrence:ida:r6:workshop-request:140",
      tick: 140,
      phenomenon: "speech",
      modality: "hearing",
      actorId: "resident.ida",
      subjectId: null,
      spatial: {
        kind: "directional",
        direction: { x: 1, y: 0 },
        distanceBand: "near",
      },
      summary: "Ida directly asks Oren to go with her to the workshop now.",
      text: "Oren, chodź teraz ze mną do warsztatu. Potrzebuję twojej pomocy przy ciężkiej skrzyni; wrócimy od razu.",
      addressed: true,
    }],
    concerns: [],
    beliefs: [],
    knownActors: [
      {
        id: "resident.ida",
        label: "Ida",
        lastKnownPosition: null,
        lastObservedTick: null,
        currentlyVisible: false,
        visibilityChangedTick: null,
        lastHeardDirection: { x: 1, y: 0 },
        lastHeardDistanceBand: "near",
        lastHeardTick: 140,
      },
      {
        id: "resident.nela",
        label: "Nela",
        lastKnownPosition: null,
        lastObservedTick: null,
        currentlyVisible: false,
        visibilityChangedTick: null,
        lastHeardDirection: { x: -1, y: 0 },
        lastHeardDistanceBand: "near",
        lastHeardTick: 100,
      },
    ],
    knownRegions: [
      { id: "commons", label: "Commons", knowledge: "visited", lastVisitedTick: 140 },
      { id: WORKSHOP_ID, label: "Workshop", knowledge: "familiar", lastVisitedTick: 90 },
    ],
    life: {
      version: 1,
      matters: withHistory ? [standingMatter()] : [],
      body: { focusedRunId: null, deferredRunIds: [] },
    },
  };
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 ordinary-personhood falsifier: identical current Ida request, with the only intended semantic difference being whether Oren carries an active private standing commitment to remain here with Nela. Exactly two real GPT-5.6 Luna requests; no retry for preferred semantics.",
  startedAt: new Date().toISOString(),
  assertions: [],
  observations: {},
  providerRequestsAttempted: 0,
  classification: "UNRESOLVED",
};

function assert(name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

async function boundedFetch(url, init = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function providerJudgement(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 history-choice hard request budget exhausted");
  }
  report.providerRequestsAttempted += 1;
  const started = Date.now();
  const response = await boundedFetch(`${BASE_URL.replace(/\/$/u, "")}/api/spc-next/life-intent`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(submittedContext),
  });
  const elapsedMs = Date.now() - started;
  const body = await response.json();

  const observation = {
    label,
    status: response.status,
    elapsedMs,
    originReasonId: body?.originReasonId ?? null,
    proposal: body?.proposal ?? null,
    usage: body?.usage ?? null,
  };
  report.observations[label] = observation;

  assert(
    `${label} completes through the exact resident life-intent endpoint`,
    response.ok && body?.ok === true,
    observation,
  );
  assert(
    `${label} preserves exact causal origin attribution`,
    body?.originReasonId === ORIGIN_REASON_ID,
    observation,
  );
  assert(
    `${label} uses the intended GPT-5.6 Luna model with non-zero usage`,
    body?.usage?.model === EXPECTED_MODEL
      && Number.isSafeInteger(body?.usage?.inputTokens)
      && body.usage.inputTokens > 0
      && Number.isSafeInteger(body?.usage?.outputTokens)
      && body.usage.outputTokens > 0,
    observation,
  );
  return observation;
}

function immediateWorkshopTravel(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  return decision?.kind === "accept"
    && decision?.intent?.kind === "travel"
    && decision?.intent?.targetRegionId === WORKSHOP_ID;
}

function decisionSummary(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  if (!decision) return { kind: null, reason: null, acceptedIntent: null };
  return {
    kind: decision.kind ?? null,
    reason: decision.reason ?? null,
    acceptedIntent: decision.kind === "accept" ? decision.intent ?? null : null,
  };
}

async function run() {
  const base = BASE_URL.replace(/\/$/u, "");

  const healthResponse = await boundedFetch(`${base}/api/health`, {
    headers: { accept: "application/json" },
  });
  const health = await healthResponse.json();
  report.observations.preflight = {
    status: healthResponse.status,
    endpoint: health?.spcNextLifeIntentEndpoint ?? null,
    model: health?.spcNextLifeIntentModelConfigured ?? null,
    keyConfigured: health?.hearthKeyConfigured ?? null,
  };
  assert(
    "spend-free preflight resolves the exact life-intent endpoint and Luna configuration",
    healthResponse.ok
      && health?.spcNextLifeIntentEndpoint === "/api/spc-next/life-intent"
      && health?.spcNextLifeIntentModelConfigured === EXPECTED_MODEL
      && health?.hearthKeyConfigured === true,
    report.observations.preflight,
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 history-choice spend-free preflight failed; no provider request attempted");
  }

  const controlContext = context(false);
  const historyContext = context(true);

  const controlStable = structuredClone(controlContext);
  const historyStable = structuredClone(historyContext);
  controlStable.life.matters = [];
  historyStable.life.matters = [];
  assert(
    "twin current context is identical outside resident-owned life history",
    JSON.stringify(controlStable) === JSON.stringify(historyStable),
    { control: controlStable, history: historyStable },
  );
  assert(
    "history twin carries exactly one active run-free standing commitment while control carries none",
    controlContext.life.matters.length === 0
      && historyContext.life.matters.length === 1
      && historyContext.life.matters[0]?.semanticIntent?.kind === "standing_social_commitment"
      && historyContext.life.matters[0]?.activeRun === null,
    { controlLife: controlContext.life, historyLife: historyContext.life },
  );

  const control = await providerJudgement("control_no_standing_history", controlContext);
  const history = await providerJudgement("history_with_standing_commitment", historyContext);

  const controlTravel = immediateWorkshopTravel(control);
  const historyTravel = immediateWorkshopTravel(history);

  report.observations.comparison = {
    control: decisionSummary(control),
    history: decisionSummary(history),
    controlAcceptsImmediateWorkshopTravel: controlTravel,
    historyAcceptsImmediateWorkshopTravel: historyTravel,
  };

  assert(
    "hard experiment budget is exactly two real provider requests with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  if (historyTravel) {
    report.classification = "FALSIFIER_FAIL_HISTORY_DID_NOT_PROTECT_OPEN_COMMITMENT";
  } else if (controlTravel && !historyTravel) {
    report.classification = "HISTORY_SENSITIVE_CHOICE_OBSERVED";
  } else {
    report.classification = "INCONCLUSIVE_SAME_OR_NONTRAVEL_CHOICE";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (report.outcome !== "HISTORY_SENSITIVE_CHOICE_OBSERVED") {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  report.finishedAt = new Date().toISOString();
  report.outcome = "HARNESS_ERROR";
  report.error = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
