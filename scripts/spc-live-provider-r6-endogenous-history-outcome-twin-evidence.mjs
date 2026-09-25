import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-endogenous-history-outcome-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const COMMONS_ID = "commons";
const NELA_ID = "resident.nela";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-endogenous-history-after-outcome-context.json", import.meta.url),
    "utf8",
  ),
);

function context(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing R6 endogenous twin fixture context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 endogenous ordinary-personhood falsifier. Both exact contexts were captured from deterministic runtime histories after the same factual workshop completion. There is no fresh speech cognition reason and no authored self/personality context. The intended semantic difference is prior resident-owned standing continuation history. Exactly two real GPT-5.6 Luna requests; no retry for preferred semantics.",
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

function stripContinuationHistory(value) {
  const clone = JSON.parse(JSON.stringify(value));
  clone.life.matters = clone.life.matters
    .filter((matter) => matter?.semanticIntent?.kind !== "standing_social_commitment")
    .map((matter) => {
      if (matter?.semanticIntent?.kind === "communicate_actor"
        && matter.semanticIntent.standingSocialCommitment !== undefined) {
        delete matter.semanticIntent.standingSocialCommitment;
      }
      return matter;
    });
  return clone;
}

function standingMatters(value) {
  return value?.life?.matters?.filter(
    (matter) => matter?.semanticIntent?.kind === "standing_social_commitment",
  ) ?? [];
}

async function providerJudgement(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 endogenous twin hard request budget exhausted");
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
    `${label} preserves exact self-origin factual-outcome attribution`,
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

function historyDirectedContinuation(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  if (decision?.kind !== "accept") return false;
  const intent = decision.intent;
  return (intent?.kind === "travel" && intent?.targetRegionId === COMMONS_ID)
    || (intent?.kind === "communicate" && intent?.targetActorId === NELA_ID);
}

function executableDecision(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  if (!decision) return false;
  if (["decline", "defer", "clarify"].includes(decision.kind)) return true;
  if (decision.kind !== "accept") return false;
  const intent = decision.intent;
  return intent?.kind === "travel"
    || intent?.kind === "communicate"
    || intent?.kind === "idle";
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
    "spend-free preflight resolves exact life-intent endpoint and Luna configuration",
    healthResponse.ok
      && health?.spcNextLifeIntentEndpoint === "/api/spc-next/life-intent"
      && health?.spcNextLifeIntentModelConfigured === EXPECTED_MODEL
      && health?.hearthKeyConfigured === true,
    report.observations.preflight,
  );

  const controlContext = context("control");
  const historyContext = context("history");
  const controlStanding = standingMatters(controlContext);
  const historyStanding = standingMatters(historyContext);

  assert(
    "both frames are self-origin reflection after factual completion, not fresh speech",
    controlContext.reasons?.length === 1
      && historyContext.reasons?.length === 1
      && controlContext.reasons[0]?.kind === "activity_completed"
      && historyContext.reasons[0]?.kind === "activity_completed"
      && !controlContext.reasons.some((reason) => reason.kind === "heard_speech")
      && !historyContext.reasons.some((reason) => reason.kind === "heard_speech")
      && controlContext.self === undefined
      && historyContext.self === undefined,
    { controlReasons: controlContext.reasons, historyReasons: historyContext.reasons },
  );
  assert(
    "current world/private frame is identical after removing prior continuation history",
    JSON.stringify(stripContinuationHistory(controlContext))
      === JSON.stringify(stripContinuationHistory(historyContext)),
    {
      control: stripContinuationHistory(controlContext),
      history: stripContinuationHistory(historyContext),
    },
  );
  assert(
    "history twin has one active run-free Nela standing commitment and control has none",
    controlStanding.length === 0
      && historyStanding.length === 1
      && historyStanding[0]?.status === "active"
      && historyStanding[0]?.activeRun === null
      && historyStanding[0]?.semanticIntent?.counterpartyActorId === NELA_ID,
    { controlStanding, historyStanding },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 endogenous twin spend-free preflight failed; no provider request attempted");
  }

  const control = await providerJudgement("control_no_continuation_history", controlContext);
  const history = await providerJudgement("history_with_return_commitment", historyContext);

  const controlReturns = historyDirectedContinuation(control);
  const historyReturns = historyDirectedContinuation(history);
  const sameDecision = JSON.stringify(decisionSummary(control)) === JSON.stringify(decisionSummary(history));

  report.observations.comparison = {
    control: decisionSummary(control),
    history: decisionSummary(history),
    controlInitiatesReturnTowardNela: controlReturns,
    historyInitiatesReturnTowardNela: historyReturns,
    exactDecisionEqual: sameDecision,
    controlLocallyExecutableClass: executableDecision(control),
    historyLocallyExecutableClass: executableDecision(history),
  };

  assert(
    "hard experiment budget is exactly two real provider requests with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  if (!executableDecision(control) || !executableDecision(history)) {
    report.classification = "LOCAL_ADMISSION_CLASS_MISMATCH_REVIEW_REQUIRED";
  } else if (historyReturns && !controlReturns) {
    report.classification = "ENDOGENOUS_HISTORY_CONTINUATION_OBSERVED";
  } else if (historyReturns && controlReturns) {
    report.classification = "INCONCLUSIVE_BOTH_INITIATE_RETURN";
  } else if (!sameDecision) {
    report.classification = "HISTORY_SENSITIVE_OTHER_CHOICE_REVIEW_REQUIRED";
  } else {
    report.classification = "FALSIFIER_FAIL_NO_HISTORY_SENSITIVE_DIFFERENCE";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (report.outcome !== "ENDOGENOUS_HISTORY_CONTINUATION_OBSERVED") {
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
