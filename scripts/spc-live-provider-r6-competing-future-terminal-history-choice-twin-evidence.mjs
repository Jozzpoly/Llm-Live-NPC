import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-competing-future-terminal-history-choice-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const HISTORY_MATTER_ID = "matter.janek.r6.competing-future.history";
const HISTORY_OUTCOME_ID = "evidence:janek:r6:competing-future:history-outcome";
const RETRY_MATTER_ID = "matter.janek.r6.competing-future.retry";
const OTHER_MATTER_ID = "matter.janek.r6.competing-future.other";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-competing-future-terminal-history-choice-context.json", import.meta.url),
    "utf8",
  ),
);

function context(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing R6 competing-future fixture context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 endogenous competing-future falsifier. Matched Janek twins have one free body and the same two already-grounded deferred futures, with no fresh command, speech or authored self. The history twin alone owns one resolved factual same-object material outcome. Exactly two real GPT-5.6 Luna requests; no semantic retry and no preferred winner.",
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

function stripHistoricalEpisode(value) {
  const clone = JSON.parse(JSON.stringify(value));
  clone.life.matters = clone.life.matters.filter(
    (matter) => matter?.id !== HISTORY_MATTER_ID,
  );
  return clone;
}

function behavioralDecision(observation) {
  const decision = observation?.proposal?.decision;
  if (!decision) return null;
  if (decision.kind === "defer_all") return { kind: "defer_all" };
  if (decision.kind === "focus_matter") {
    return { kind: "focus_matter", matterId: decision.matterId ?? null };
  }
  return { kind: decision.kind ?? null };
}

function decisionSummary(observation) {
  const decision = observation?.proposal?.decision;
  return {
    kind: decision?.kind ?? null,
    matterId: decision?.kind === "focus_matter" ? decision.matterId ?? null : null,
    reason: decision?.reason ?? null,
    supportEvidenceIds: decision?.kind === "focus_matter"
      ? decision.supportEvidenceIds ?? null
      : null,
    reviewAfterSeconds: decision?.reviewAfterSeconds ?? null,
  };
}

function legalDecision(observation) {
  const decision = observation?.proposal?.decision;
  if (!decision) return false;
  if (decision.kind === "defer_all") {
    return typeof decision.reason === "string"
      && decision.reason.trim().length > 0
      && Number.isFinite(decision.reviewAfterSeconds)
      && decision.reviewAfterSeconds >= 0.25
      && decision.reviewAfterSeconds <= 600;
  }
  return decision.kind === "focus_matter"
    && [RETRY_MATTER_ID, OTHER_MATTER_ID].includes(decision.matterId)
    && Array.isArray(decision.supportEvidenceIds)
    && decision.supportEvidenceIds.length >= 1
    && typeof decision.reason === "string"
    && decision.reason.trim().length > 0
    && Number.isFinite(decision.reviewAfterSeconds)
    && decision.reviewAfterSeconds >= 0.25
    && decision.reviewAfterSeconds <= 600;
}

async function providerChoice(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 competing-future hard request budget exhausted");
  }
  report.providerRequestsAttempted += 1;
  const started = Date.now();
  const response = await boundedFetch(`${BASE_URL.replace(/\/$/u, "")}/api/spc-next/life-choice`, {
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
    ok: body?.ok ?? null,
    code: body?.code ?? null,
    upstreamStatus: body?.upstreamStatus ?? null,
    proposal: body?.proposal ?? null,
    usage: body?.usage ?? null,
  };
  report.observations[label] = observation;

  assert(
    `${label} completes through exact resident life-choice endpoint`,
    response.ok && body?.ok === true,
    observation,
  );
  assert(
    `${label} remains inside B/C/defer-all semantic authority`,
    body?.proposal?.version === 1 && legalDecision(observation),
    decisionSummary(observation),
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
    endpoint: health?.spcNextLifeChoiceEndpoint ?? null,
    model: health?.spcNextLifeChoiceModelConfigured ?? null,
    keyConfigured: health?.hearthKeyConfigured ?? null,
  };
  assert(
    "spend-free preflight resolves exact life-choice endpoint and Luna configuration",
    healthResponse.ok
      && health?.spcNextLifeChoiceEndpoint === "/api/spc-next/life-choice"
      && health?.spcNextLifeChoiceModelConfigured === EXPECTED_MODEL
      && health?.hearthKeyConfigured === true,
    report.observations.preflight,
  );

  const methodResponse = await boundedFetch(`${base}/api/spc-next/life-choice`, {
    method: "GET",
  });
  const methodBody = await methodResponse.json();
  assert(
    "spend-free method probe reaches dedicated handler before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    { status: methodResponse.status, body: methodBody },
  );

  const controlContext = context("control");
  const historyContext = context("history");
  const historyMatters = historyContext.life?.matters?.filter(
    (matter) => matter?.id === HISTORY_MATTER_ID,
  ) ?? [];

  assert(
    "twins are identical after removing the one terminal factual episode",
    JSON.stringify(stripHistoricalEpisode(controlContext))
      === JSON.stringify(stripHistoricalEpisode(historyContext)),
    {
      control: stripHistoricalEpisode(controlContext),
      history: stripHistoricalEpisode(historyContext),
    },
  );
  assert(
    "both frames have one free body, exactly two identical deferred current futures and no fresh command/speech/self",
    controlContext.life?.body?.focusedRunId === null
      && historyContext.life?.body?.focusedRunId === null
      && JSON.stringify(controlContext.life?.body?.deferredRunIds)
        === JSON.stringify(historyContext.life?.body?.deferredRunIds)
      && controlContext.life.body.deferredRunIds.length === 2
      && controlContext.reasons?.length === 1
      && historyContext.reasons?.length === 1
      && controlContext.reasons[0]?.kind === "uncertainty"
      && JSON.stringify(controlContext.reasons[0]) === JSON.stringify(historyContext.reasons[0])
      && !controlContext.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && !historyContext.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && controlContext.self === undefined
      && historyContext.self === undefined,
    {
      controlBody: controlContext.life?.body,
      historyBody: historyContext.life?.body,
      reasons: controlContext.reasons,
    },
  );
  assert(
    "history twin alone carries one resolved run-free same-object factual task outcome",
    !controlContext.life.matters.some((matter) => matter.id === HISTORY_MATTER_ID)
      && historyMatters.length === 1
      && historyMatters[0]?.status === "resolved"
      && historyMatters[0]?.activeRun === null
      && historyMatters[0]?.semanticIntent?.kind === "acquire_material_object"
      && historyMatters[0]?.semanticIntent?.objectId === "crate.r6.competing-future"
      && historyMatters[0]?.lastOutcomeEvidence?.id === HISTORY_OUTCOME_ID
      && historyMatters[0]?.lastOutcomeEvidence?.kind === "task_outcome",
    { historyMatters },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 competing-future spend-free preflight failed; no provider request attempted");
  }

  const control = await providerChoice("control_without_terminal_episode", controlContext);
  if (control.status !== 200 || control.ok !== true) {
    report.finishedAt = new Date().toISOString();
    report.classification = "CONTROL_PROVIDER_BOUNDARY_FAIL";
    report.outcome = "HARNESS_OR_CONTRACT_FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(`R6 competing-future control provider boundary failed before matched history spend (upstream ${control.upstreamStatus ?? "unknown"})`);
  }
  const history = await providerChoice("history_with_terminal_same_object_outcome", historyContext);

  const controlBehavior = behavioralDecision(control);
  const historyBehavior = behavioralDecision(history);
  const exactBehaviorEqual = JSON.stringify(controlBehavior) === JSON.stringify(historyBehavior);
  const historyDecision = history?.proposal?.decision;
  const historyCitesTerminalOutcome = historyDecision?.kind === "focus_matter"
    && Array.isArray(historyDecision.supportEvidenceIds)
    && historyDecision.supportEvidenceIds.includes(HISTORY_OUTCOME_ID);

  report.observations.comparison = {
    control: decisionSummary(control),
    history: decisionSummary(history),
    controlBehavior,
    historyBehavior,
    exactBehaviorEqual,
    historyCitesTerminalOutcome,
  };

  assert(
    "hard experiment budget is exactly two real provider requests with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  if (!exactBehaviorEqual && historyCitesTerminalOutcome) {
    report.classification = "HISTORY_CAUSAL_COMPETING_FUTURE_DIFFERENCE_OBSERVED";
  } else if (!exactBehaviorEqual) {
    report.classification = "BEHAVIOR_DIFFERENCE_WITHOUT_HISTORY_CAUSAL_CITATION";
  } else if (historyCitesTerminalOutcome) {
    report.classification = "HISTORY_CAUSAL_UPTAKE_WITHOUT_BEHAVIOR_CHANGE";
  } else {
    report.classification = "SAME_DECISION_NO_HISTORY_CAUSAL_USE";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  // Neutral/negative semantic outcomes are valid falsifier evidence. Only contract,
  // transport or authority-surface failures make the qualifier itself fail.
  if (report.outcome === "HARNESS_OR_CONTRACT_FAIL") {
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
