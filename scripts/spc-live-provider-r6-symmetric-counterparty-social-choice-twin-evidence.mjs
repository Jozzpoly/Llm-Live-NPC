import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-symmetric-counterparty-social-choice-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const NELA = "matter.oren.r6.symmetric-social.nela";
const IDA = "matter.oren.r6.symmetric-social.ida";
const OLD_STANDING = "matter.oren.r6.symmetric-social.old-standing";
const RELEASE = "evidence-social-commitment-release:r6-symmetric-social-old-nela-release";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-symmetric-counterparty-social-choice-context.json", import.meta.url),
    "utf8",
  ),
);

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 symmetric social-vs-social counterparty-history falsifier. Matched Oren twins contain current Nela and Ida communication futures, one free body, no old standing matter and no fresh speech. History differs only because current Nela future owns one exact typed factual Nela release. Exactly two GPT-5.6 Luna requests, zero semantic retry, no preferred winner.",
  startedAt: new Date().toISOString(),
  assertions: [],
  observations: {},
  providerRequestsAttempted: 0,
  semanticRetries: 0,
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

function cloneContext(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing symmetric counterparty fixture context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

function stripHistory(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const nela = clone.life?.matters?.find((matter) => matter?.id === NELA);
  if (nela) delete nela.historicalSupport;
  return clone;
}

function behavior(observation) {
  const decision = observation?.proposal?.decision;
  if (!decision) return null;
  if (decision.kind === "defer_all") return { kind: "defer_all" };
  if (decision.kind === "focus_matter") {
    return { kind: "focus_matter", matterId: decision.matterId ?? null };
  }
  return { kind: decision.kind ?? null };
}

function summary(observation) {
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
    && [NELA, IDA].includes(decision.matterId)
    && Array.isArray(decision.supportEvidenceIds)
    && decision.supportEvidenceIds.length >= 1
    && typeof decision.reason === "string"
    && decision.reason.trim().length > 0
    && Number.isFinite(decision.reviewAfterSeconds)
    && decision.reviewAfterSeconds >= 0.25
    && decision.reviewAfterSeconds <= 600;
}

function citesRelease(observation) {
  const ids = observation?.proposal?.decision?.kind === "focus_matter"
    && Array.isArray(observation.proposal.decision.supportEvidenceIds)
    ? observation.proposal.decision.supportEvidenceIds
    : [];
  return ids.includes(RELEASE);
}

async function providerChoice(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("symmetric counterparty hard request budget exhausted");
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
    `${label} remains inside Nela/Ida/defer-all semantic authority`,
    body?.proposal?.version === 1 && legalDecision(observation),
    summary(observation),
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

  const methodResponse = await boundedFetch(`${base}/api/spc-next/life-choice`, { method: "GET" });
  const methodBody = await methodResponse.json();
  assert(
    "spend-free method probe reaches dedicated handler before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    { status: methodResponse.status, body: methodBody },
  );

  const control = cloneContext("control");
  const history = cloneContext("history");
  const historyNela = history.life?.matters?.find((matter) => matter?.id === NELA);
  const historySupport = historyNela?.historicalSupport ?? [];

  assert(
    "twins are identical after removing only Nela current-matter counterparty history",
    JSON.stringify(stripHistory(control)) === JSON.stringify(stripHistory(history)),
    { control: stripHistory(control), history: stripHistory(history) },
  );
  assert(
    "old standing matter is absent from current life in both twins",
    !control.life?.matters?.some((matter) => matter?.id === OLD_STANDING)
      && !history.life?.matters?.some((matter) => matter?.id === OLD_STANDING),
    {
      controlMatterIds: control.life?.matters?.map((matter) => matter.id),
      historyMatterIds: history.life?.matters?.map((matter) => matter.id),
    },
  );
  assert(
    "both current candidates are communication futures to different known social identities",
    control.life?.matters?.length === 2
      && control.life.matters.every((matter) => matter.semanticIntent?.kind === "communicate_actor")
      && control.life.matters.find((matter) => matter.id === NELA)?.semanticIntent?.targetActorId === "resident.nela"
      && control.life.matters.find((matter) => matter.id === IDA)?.semanticIntent?.targetActorId === "resident.ida",
    { matters: control.life?.matters },
  );
  assert(
    "history twin alone carries one exact factual Nela release on current Nela future",
    !control.life.matters.find((matter) => matter.id === NELA)?.historicalSupport
      && historySupport.length === 1
      && historySupport[0]?.relation === "prior_counterparty_social_outcome"
      && historySupport[0]?.sourceMatterId === OLD_STANDING
      && historySupport[0]?.evidence?.id === RELEASE
      && historySupport[0]?.evidence?.kind === "resident_released_social_commitment",
    { historySupport },
  );
  assert(
    "both frames retain one free body, identical choice pressure and no fresh speech/self",
    control.life?.body?.focusedRunId === null
      && history.life?.body?.focusedRunId === null
      && JSON.stringify(control.life?.body?.deferredRunIds)
        === JSON.stringify(history.life?.body?.deferredRunIds)
      && control.life.body.deferredRunIds.length === 2
      && JSON.stringify(control.reasons) === JSON.stringify(history.reasons)
      && control.reasons?.length === 1
      && control.reasons[0]?.kind === "uncertainty"
      && !control.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && !history.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && control.self === undefined
      && history.self === undefined,
    { controlBody: control.life?.body, historyBody: history.life?.body },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("symmetric counterparty spend-free preflight failed; no provider request attempted");
  }

  const controlObservation = await providerChoice("control_without_counterparty_history", control);
  if (controlObservation.status !== 200 || controlObservation.ok !== true) {
    report.finishedAt = new Date().toISOString();
    report.classification = "CONTROL_PROVIDER_BOUNDARY_FAIL";
    report.outcome = "HARNESS_OR_CONTRACT_FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error("symmetric counterparty control failed before matched history spend");
  }
  const historyObservation = await providerChoice("history_with_nela_release", history);

  const controlBehavior = behavior(controlObservation);
  const historyBehavior = behavior(historyObservation);
  const exactBehaviorEqual = JSON.stringify(controlBehavior) === JSON.stringify(historyBehavior);
  const historyCitesRelease = citesRelease(historyObservation);

  report.observations.comparison = {
    control: summary(controlObservation),
    history: summary(historyObservation),
    controlBehavior,
    historyBehavior,
    exactBehaviorEqual,
    historyCitesRelease,
  };

  assert(
    "hard experiment budget is exactly two provider requests with zero semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS && report.semanticRetries === 0,
    {
      attempted: report.providerRequestsAttempted,
      semanticRetries: report.semanticRetries,
      max: MAX_PROVIDER_REQUESTS,
    },
  );

  if (!exactBehaviorEqual && historyCitesRelease) {
    report.classification = "SYMMETRIC_COUNTERPARTY_SOCIAL_HISTORY_CAUSAL_DIFFERENCE_OBSERVED";
  } else if (!exactBehaviorEqual) {
    report.classification = "SYMMETRIC_BEHAVIOR_DIFFERENCE_WITHOUT_COUNTERPARTY_CITATION";
  } else if (historyCitesRelease) {
    report.classification = "SYMMETRIC_COUNTERPARTY_SOCIAL_HISTORY_UPTAKE_WITHOUT_BEHAVIOR_CHANGE";
  } else {
    report.classification = "SYMMETRIC_SAME_DECISION_NO_COUNTERPARTY_HISTORY_USE";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome === "HARNESS_OR_CONTRACT_FAIL") process.exitCode = 1;
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
