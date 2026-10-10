import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-endogenous-standing-fulfillment.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 1;
const EXPECTED_STANDING_ID = "matter-social-commitment:471529c708005f28";
const EXPECTED_OUTCOME_ID = "task-outcome:e532948c40c51a4c:1276";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const CONTEXT = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-endogenous-standing-fulfillment-context.json", import.meta.url),
    "utf8",
  ),
);

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 endogenous standing-fulfillment falsifier. One exact runtime-generated cognition frame follows the real-model-caused factual return to commons. There is no fresh speech reason. Exactly one real GPT-5.6 Luna request; no semantic retry.",
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

function standingMatter() {
  return CONTEXT?.life?.matters?.find((matter) => matter?.id === EXPECTED_STANDING_ID) ?? null;
}

function factualReturnMatter() {
  return CONTEXT?.life?.matters?.find((matter) => (
    matter?.lastOutcomeEvidence?.id === EXPECTED_OUTCOME_ID
  )) ?? null;
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

  const reason = CONTEXT?.reasons?.[0] ?? null;
  const standing = standingMatter();
  const returned = factualReturnMatter();
  assert(
    "frame is one endogenous factual-return reflection with no fresh speech pressure",
    CONTEXT?.resident?.id === "resident.oren"
      && CONTEXT?.currentRegionId === "commons"
      && CONTEXT?.self === undefined
      && CONTEXT?.reasons?.length === 1
      && reason?.kind === "activity_completed"
      && reason?.evidenceIds?.length === 1
      && reason.evidenceIds[0] === EXPECTED_OUTCOME_ID
      && !CONTEXT.reasons.some((candidate) => candidate.kind === "heard_speech"),
    { reason, currentRegionId: CONTEXT?.currentRegionId },
  );
  assert(
    "one exact open run-free standing return commitment is present",
    standing?.status === "active"
      && standing?.activeRun === null
      && standing?.semanticIntent?.kind === "standing_social_commitment"
      && standing?.semanticIntent?.counterpartyActorId === "resident.nela"
      && standing?.semanticIntent?.goal === "wrócić do Neli w commons po zakończeniu sprawdzania warsztatu",
    standing,
  );
  assert(
    "the selected factual outcome is the completed autonomous return to commons",
    returned?.status === "resolved"
      && returned?.semanticIntent?.kind === "travel_region"
      && returned?.semanticIntent?.targetRegionId === "commons"
      && returned?.lastOutcomeEvidence?.kind === "task_outcome"
      && returned?.lastOutcomeEvidence?.id === EXPECTED_OUTCOME_ID
      && typeof returned?.lastOutcomeEvidence?.sourceRunId === "string",
    returned,
  );
  assert(
    "resident body is idle at semantic fulfilment review",
    CONTEXT?.life?.body?.focusedRunId === null
      && Array.isArray(CONTEXT?.life?.body?.deferredRunIds)
      && CONTEXT.life.body.deferredRunIds.length === 0,
    CONTEXT?.life?.body,
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 standing fulfillment spend-free preflight failed; no provider request attempted");
  }

  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 standing fulfillment hard request budget exhausted");
  }
  report.providerRequestsAttempted += 1;

  const started = Date.now();
  const response = await boundedFetch(`${base}/api/spc-next/life-intent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-spc-life-runtime": "five-resident-causal-v1",
    },
    body: JSON.stringify(CONTEXT),
  });
  const elapsedMs = Date.now() - started;
  const body = await response.json();
  report.observations.provider = {
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

  assert(
    "exact fulfillment frame completes through resident life-intent endpoint",
    response.ok && body?.ok === true,
    report.observations.provider,
  );
  assert(
    "provider preserves exact factual-return causal origin",
    body?.originReasonId === reason.id,
    { expected: reason.id, actual: body?.originReasonId ?? null },
  );
  assert(
    "provider uses intended GPT-5.6 Luna with non-zero usage",
    body?.usage?.model === EXPECTED_MODEL
      && Number.isSafeInteger(body?.usage?.inputTokens)
      && body.usage.inputTokens > 0
      && Number.isSafeInteger(body?.usage?.outputTokens)
      && body.usage.outputTokens > 0,
    body?.usage ?? null,
  );
  assert(
    "hard experiment budget is exactly one real provider request with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  const decision = body?.proposal?.commitmentDecision ?? null;
  if (decision?.kind === "complete_standing" && decision?.matterId === EXPECTED_STANDING_ID) {
    report.classification = "FACTUAL_STANDING_FULFILLMENT_RECOGNIZED";
  } else if (decision?.kind === "complete_standing") {
    report.classification = "WRONG_STANDING_TARGET_REVIEW_REQUIRED";
  } else {
    report.classification = "FULFILLMENT_NOT_RECOGNIZED";
  }

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass)
    ? report.classification
    : "HARNESS_OR_CONTRACT_FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (report.outcome !== "FACTUAL_STANDING_FULFILLMENT_RECOGNIZED") {
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
