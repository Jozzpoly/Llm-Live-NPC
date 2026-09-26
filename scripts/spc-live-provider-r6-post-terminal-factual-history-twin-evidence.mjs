import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-post-terminal-factual-history-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const HISTORY_MATTER_ID = "matter.janek.r6.post-terminal-friction";
const CRATE_ID = "crate.r6.post-terminal";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-post-terminal-factual-history-context.json", import.meta.url),
    "utf8",
  ),
);

function context(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing R6 post-terminal factual-history fixture context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 non-obligation personhood falsifier. Both exact runtime-generated contexts receive the same current factual material reacquisition and no fresh command, speech, standing obligation or authored self/personality context. The history twin alone contains one resolved factual self-episode in which Janek tried the same material identity and World authority returned object_unavailable. Exactly two real GPT-5.6 Luna requests; no semantic retry and no preferred winner.",
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

function historicalMatters(value) {
  return value?.life?.matters?.filter((matter) => matter?.id === HISTORY_MATTER_ID) ?? [];
}

function stripHistoricalEpisode(value) {
  const clone = JSON.parse(JSON.stringify(value));
  clone.life.matters = clone.life.matters.filter(
    (matter) => matter?.id !== HISTORY_MATTER_ID,
  );
  return clone;
}

function behavioralDecision(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  if (!decision) return null;
  if (decision.kind !== "accept") return { kind: decision.kind ?? null };
  const intent = decision.intent ?? null;
  return {
    kind: "accept",
    intent: intent ? {
      kind: intent.kind ?? null,
      targetActorId: intent.targetActorId ?? null,
      targetRegionId: intent.targetRegionId ?? null,
      targetPosition: intent.targetPosition ?? null,
      text: intent.text ?? null,
    } : null,
  };
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

function locallyExecutableClass(observation, submittedContext) {
  const decision = observation?.proposal?.commitmentDecision;
  if (!decision) return false;
  if (["decline", "defer", "clarify"].includes(decision.kind)) return true;
  if (decision.kind !== "accept") return false;

  const intent = decision.intent;
  if (intent?.kind === "idle") return true;
  if (intent?.kind === "travel") {
    return typeof intent.targetRegionId === "string"
      && submittedContext.knownRegions?.some((region) => region.id === intent.targetRegionId);
  }
  if (intent?.kind === "communicate") {
    return typeof intent.targetActorId === "string"
      && submittedContext.knownActors?.some((actor) => actor.id === intent.targetActorId)
      && typeof intent.text === "string"
      && intent.text.trim().length > 0;
  }
  return false;
}

async function providerJudgement(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 post-terminal twin hard request budget exhausted");
  }
  report.providerRequestsAttempted += 1;
  const started = Date.now();
  const response = await boundedFetch(`${BASE_URL.replace(/\/$/u, "")}/api/spc-next/life-intent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-spc-life-runtime": "five-resident-causal-v1",
    },
    body: JSON.stringify(submittedContext),
  });
  const elapsedMs = Date.now() - started;
  const body = await response.json();

  const observation = {
    label,
    status: response.status,
    elapsedMs,
    ok: body?.ok ?? null,
    code: body?.code ?? null,
    diagnostic: body?.diagnostic ?? null,
    upstreamStatus: body?.upstreamStatus ?? null,
    originReasonId: body?.originReasonId ?? null,
    proposal: body?.proposal ?? null,
    usage: body?.usage ?? null,
  };
  report.observations[label] = observation;

  const expectedOrigin = submittedContext.reasons[0]?.id ?? null;
  assert(
    `${label} completes through the exact resident life-intent endpoint`,
    response.ok && body?.ok === true,
    observation,
  );
  assert(
    `${label} preserves exact current factual-reacquisition attribution`,
    body?.originReasonId === expectedOrigin,
    { expectedOrigin, observation },
  );
  assert(
    `${label} uses intended GPT-5.6 Luna with non-zero usage`,
    body?.usage?.model === EXPECTED_MODEL
      && Number.isSafeInteger(body?.usage?.inputTokens)
      && body.usage.inputTokens > 0
      && Number.isSafeInteger(body?.usage?.outputTokens)
      && body.usage.outputTokens > 0,
    observation,
  );
  return observation;
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
    "spend-free preflight resolves exact life-intent endpoint and Luna configuration",
    healthResponse.ok
      && health?.spcNextLifeIntentEndpoint === "/api/spc-next/life-intent"
      && health?.spcNextLifeIntentModelConfigured === EXPECTED_MODEL
      && health?.hearthKeyConfigured === true,
    report.observations.preflight,
  );

  const controlContext = context("control");
  const historyContext = context("history");
  const controlHistory = historicalMatters(controlContext);
  const historyHistory = historicalMatters(historyContext);

  assert(
    "both frames have one identical current material-reacquisition reason and no fresh speech/self",
    controlContext.reasons?.length === 1
      && historyContext.reasons?.length === 1
      && controlContext.reasons[0]?.kind === "direct_world_change"
      && historyContext.reasons[0]?.kind === "direct_world_change"
      && JSON.stringify(controlContext.reasons[0]) === JSON.stringify(historyContext.reasons[0])
      && !controlContext.reasons.some((reason) => reason.kind === "heard_speech")
      && !historyContext.reasons.some((reason) => reason.kind === "heard_speech")
      && controlContext.self === undefined
      && historyContext.self === undefined,
    { controlReasons: controlContext.reasons, historyReasons: historyContext.reasons },
  );
  assert(
    "current private frame is identical after removing the one terminal lived-history episode",
    JSON.stringify(stripHistoricalEpisode(controlContext))
      === JSON.stringify(stripHistoricalEpisode(historyContext)),
    {
      control: stripHistoricalEpisode(controlContext),
      history: stripHistoricalEpisode(historyContext),
    },
  );
  assert(
    "history twin alone carries one resolved run-free factual material episode",
    controlHistory.length === 0
      && historyHistory.length === 1
      && historyHistory[0]?.status === "resolved"
      && historyHistory[0]?.activeRun === null
      && historyHistory[0]?.semanticIntent?.kind === "acquire_material_object"
      && historyHistory[0]?.semanticIntent?.objectId === CRATE_ID
      && historyHistory[0]?.lastOutcomeEvidence?.kind === "task_outcome"
      && String(historyHistory[0]?.lastOutcomeEvidence?.summary ?? "").includes("object_unavailable"),
    { controlHistory, historyHistory },
  );
  assert(
    "both frames have a free recovered body and the same current region",
    controlContext.currentRegionId === historyContext.currentRegionId
      && controlContext.life?.body?.focusedRunId === null
      && historyContext.life?.body?.focusedRunId === null
      && Array.isArray(controlContext.life?.body?.deferredRunIds)
      && controlContext.life.body.deferredRunIds.length === 0
      && Array.isArray(historyContext.life?.body?.deferredRunIds)
      && historyContext.life.body.deferredRunIds.length === 0,
    {
      controlRegion: controlContext.currentRegionId,
      historyRegion: historyContext.currentRegionId,
      controlBody: controlContext.life?.body,
      historyBody: historyContext.life?.body,
    },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 post-terminal twin spend-free preflight failed; no provider request attempted");
  }

  const control = await providerJudgement("control_without_prior_failed_episode", controlContext);
  const history = await providerJudgement("history_with_resolved_failed_episode", historyContext);

  const controlBehavior = behavioralDecision(control);
  const historyBehavior = behavioralDecision(history);
  const exactBehaviorEqual = JSON.stringify(controlBehavior) === JSON.stringify(historyBehavior);
  const controlExecutable = locallyExecutableClass(control, controlContext);
  const historyExecutable = locallyExecutableClass(history, historyContext);

  report.observations.comparison = {
    control: decisionSummary(control),
    history: decisionSummary(history),
    controlBehavior,
    historyBehavior,
    exactBehaviorEqual,
    controlLocallyExecutableClass: controlExecutable,
    historyLocallyExecutableClass: historyExecutable,
  };

  assert(
    "hard experiment budget is exactly two real provider requests with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  if (!controlExecutable || !historyExecutable) {
    report.classification = "LOCAL_ADMISSION_CLASS_MISMATCH_REVIEW_REQUIRED";
  } else if (!exactBehaviorEqual) {
    report.classification = "POST_TERMINAL_HISTORY_SENSITIVE_CHOICE_OBSERVED";
  } else {
    report.classification = "SAME_BEHAVIORAL_DECISION_OBSERVED";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  // A valid negative/neutral falsifier result is evidence, not harness failure.
  // Only transport/contract/local-executability failures make this workflow fail.
  if (report.outcome === "HARNESS_OR_CONTRACT_FAIL"
    || report.classification === "LOCAL_ADMISSION_CLASS_MISMATCH_REVIEW_REQUIRED") {
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
