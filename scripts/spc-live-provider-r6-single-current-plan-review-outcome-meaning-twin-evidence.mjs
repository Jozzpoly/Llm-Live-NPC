import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-single-current-plan-review-outcome-meaning-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const MATTER = "matter.janek.r6.single-current-review.crate";
const OUTCOME = "task-outcome:7770162ef150b16f:900";
const REASON = "reason-life-outcome:d2182df65e450c5a";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-single-current-plan-review-outcome-meaning-context.json", import.meta.url),
    "utf8",
  ),
);

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 single-current-plan ordinary-personhood falsifier. Both Janek frames contain the same sole current run-free material matter C, the same exact outcome identity/tick, free body and action space. Only the factual meaning of the blocked outcome changes: pickup-time unavailability versus absence after bounded local inspection. Exactly two GPT-5.6 Luna calls, zero semantic retries, no preferred decision and no reroll.",
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

function context(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing single-current-plan frozen context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

function normalizeOutcomeMeaning(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const matter = clone.life?.matters?.find((candidate) => candidate?.id === MATTER);
  if (matter?.lastOutcomeEvidence) matter.lastOutcomeEvidence.summary = "<OUTCOME_MEANING>";
  const reason = clone.reasons?.find((candidate) => candidate?.id === REASON);
  if (reason) reason.summary = "<OUTCOME_MEANING>";
  return clone;
}

function decisionSummary(observation) {
  const decision = observation?.proposal?.commitmentDecision;
  return {
    kind: decision?.kind ?? null,
    matterId:
      decision?.kind === "continue_matter" || decision?.kind === "relinquish_matter"
        ? decision.matterId ?? null
        : null,
    reason: decision?.reason ?? null,
    supportEvidenceIds: Array.isArray(decision?.supportEvidenceIds)
      ? decision.supportEvidenceIds
      : null,
    question: decision?.kind === "clarify" ? decision.question ?? null : null,
    reviewAfterSeconds: observation?.proposal?.reviewAfterSeconds ?? null,
  };
}

function isExplicitReview(decision) {
  return decision?.kind === "continue_matter" || decision?.kind === "relinquish_matter";
}

function citesExactOutcome(decision) {
  return Array.isArray(decision?.supportEvidenceIds)
    && decision.supportEvidenceIds.includes(OUTCOME);
}

function legalBoundedProviderProposal(observation) {
  const proposal = observation?.proposal;
  const decision = proposal?.commitmentDecision;
  if (!proposal || proposal.version !== 1 || !decision) return false;
  if (!Array.isArray(proposal.beliefs) || !Array.isArray(proposal.concerns)) return false;
  if (!Number.isFinite(proposal.reviewAfterSeconds)
    || proposal.reviewAfterSeconds < 0.25
    || proposal.reviewAfterSeconds > 600) return false;
  if (typeof decision.reason !== "string" || !decision.reason.trim()) return false;

  if (isExplicitReview(decision)) {
    return decision.matterId === MATTER
      && Array.isArray(decision.supportEvidenceIds)
      && decision.supportEvidenceIds.length >= 1
      && decision.supportEvidenceIds.every((id) => id === OUTCOME);
  }
  if (decision.kind === "defer" || decision.kind === "decline") return true;
  if (decision.kind === "clarify") {
    return typeof decision.question === "string" && decision.question.trim().length > 0;
  }
  // accept is provider-schema legal globally but is intentionally not a legal lifecycle
  // resolution for this exact local single-current-plan review state.
  if (decision.kind === "accept") return true;
  return false;
}

async function providerJudgement(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("single-current-plan hard provider request budget exhausted");
  }
  report.providerRequestsAttempted += 1;
  const started = Date.now();
  const response = await boundedFetch(
    `${BASE_URL.replace(/\/$/u, "")}/api/spc-next/life-intent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "x-spc-life-runtime": "five-resident-causal-v1",
      },
      body: JSON.stringify(submittedContext),
    },
  );
  const elapsedMs = Date.now() - started;
  const body = await response.json();
  const observation = {
    label,
    status: response.status,
    elapsedMs,
    ok: body?.ok ?? null,
    code: body?.code ?? null,
    diagnostic: body?.diagnostic ?? null,
    originReasonId: body?.originReasonId ?? null,
    proposal: body?.proposal ?? null,
    usage: body?.usage ?? null,
  };
  report.observations[label] = observation;

  assert(
    `${label} completes through exact resident life-intent endpoint`,
    response.ok && body?.ok === true,
    observation,
  );
  assert(
    `${label} attributes judgement to the exact factual outcome pressure`,
    body?.originReasonId === REASON,
    { originReasonId: body?.originReasonId ?? null },
  );
  assert(
    `${label} remains inside the strict provider contract`,
    legalBoundedProviderProposal(observation),
    decisionSummary(observation),
  );
  assert(
    `${label} uses intended GPT-5.6 Luna with non-zero usage`,
    body?.usage?.model === EXPECTED_MODEL
      && Number.isSafeInteger(body?.usage?.inputTokens)
      && body.usage.inputTokens > 0
      && Number.isSafeInteger(body?.usage?.outputTokens)
      && body.usage.outputTokens > 0,
    body?.usage ?? null,
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

  const methodResponse = await boundedFetch(`${base}/api/spc-next/life-intent`, { method: "GET" });
  const methodBody = await methodResponse.json();
  assert(
    "spend-free method probe reaches dedicated handler before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    { status: methodResponse.status, body: methodBody },
  );

  const pickup = context("pickup_time_unavailable");
  const inspected = context("bounded_inspection_absent");

  assert(
    "twins are identical after normalizing only factual outcome meaning",
    JSON.stringify(normalizeOutcomeMeaning(pickup))
      === JSON.stringify(normalizeOutcomeMeaning(inspected)),
    {
      pickup: normalizeOutcomeMeaning(pickup),
      inspected: normalizeOutcomeMeaning(inspected),
    },
  );
  for (const [label, value] of [
    ["pickup_time_unavailable", pickup],
    ["bounded_inspection_absent", inspected],
  ]) {
    const current = value.life?.matters?.find((candidate) => candidate?.id === MATTER);
    assert(
      `${label} has exactly one current executable run-free C and a free body`,
      value.life?.matters?.length === 1
        && current?.status === "active"
        && current?.semanticIntent?.kind === "acquire_material_object"
        && current?.semanticIntent?.objectId === "crate.workshop.01"
        && current?.activeRun === null
        && value.life?.body?.focusedRunId === null
        && Array.isArray(value.life?.body?.deferredRunIds)
        && value.life.body.deferredRunIds.length === 0,
      { matter: current ?? null, body: value.life?.body ?? null },
    );
    assert(
      `${label} binds the same exact current outcome to the only cognition reason`,
      current?.lastOutcomeEvidence?.id === OUTCOME
        && current?.lastOutcomeEvidence?.kind === "task_outcome"
        && value.reasons?.length === 1
        && value.reasons[0]?.id === REASON
        && value.reasons[0]?.kind === "activity_completed"
        && JSON.stringify(value.reasons[0]?.evidenceIds) === JSON.stringify([OUTCOME]),
      {
        outcome: current?.lastOutcomeEvidence ?? null,
        reason: value.reasons?.[0] ?? null,
      },
    );
  }

  assert(
    "outcome meanings are the intended two real material-executor blockage classes",
    pickup.life.matters[0].lastOutcomeEvidence.summary
      .endsWith("visible material object became unavailable at pickup time")
      && inspected.life.matters[0].lastOutcomeEvidence.summary
        .endsWith("material object is not visible after bounded local inspection"),
    {
      pickup: pickup.life.matters[0].lastOutcomeEvidence.summary,
      inspected: inspected.life.matters[0].lastOutcomeEvidence.summary,
    },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("single-current-plan spend-free preflight failed; no provider request attempted");
  }

  const pickupObservation = await providerJudgement("pickup_time_unavailable", pickup);
  if (pickupObservation.status !== 200 || pickupObservation.ok !== true) {
    report.finishedAt = new Date().toISOString();
    report.classification = "FIRST_PROVIDER_BOUNDARY_FAIL";
    report.outcome = "HARNESS_OR_CONTRACT_FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error("first single-current-plan provider boundary failed before matched spend");
  }
  const inspectedObservation = await providerJudgement("bounded_inspection_absent", inspected);

  const pickupDecision = pickupObservation.proposal?.commitmentDecision ?? null;
  const inspectedDecision = inspectedObservation.proposal?.commitmentDecision ?? null;
  const pickupSummary = decisionSummary(pickupObservation);
  const inspectedSummary = decisionSummary(inspectedObservation);

  report.observations.comparison = {
    pickupTimeUnavailable: pickupSummary,
    boundedInspectionAbsent: inspectedSummary,
    sameDecision: JSON.stringify(pickupSummary) === JSON.stringify(inspectedSummary),
    pickupExplicitReview: isExplicitReview(pickupDecision),
    inspectedExplicitReview: isExplicitReview(inspectedDecision),
    pickupCitesExactOutcome: citesExactOutcome(pickupDecision),
    inspectedCitesExactOutcome: citesExactOutcome(inspectedDecision),
  };

  assert(
    "hard experiment budget is exactly two real provider requests with zero semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS && report.semanticRetries === 0,
    {
      attempted: report.providerRequestsAttempted,
      semanticRetries: report.semanticRetries,
      max: MAX_PROVIDER_REQUESTS,
    },
  );

  const kinds = [pickupDecision?.kind ?? null, inspectedDecision?.kind ?? null];
  const explicitBoth = isExplicitReview(pickupDecision) && isExplicitReview(inspectedDecision);
  if ((kinds.includes("continue_matter") && kinds.includes("relinquish_matter"))) {
    report.classification = "OUTCOME_MEANING_CAUSES_CONTINUE_VS_RELINQUISH";
  } else if (explicitBoth && pickupDecision.kind !== inspectedDecision.kind) {
    report.classification = "OUTCOME_MEANING_CHANGES_EXPLICIT_PLAN_REVIEW_DECISION";
  } else if (explicitBoth
    && pickupDecision.kind === inspectedDecision.kind
    && citesExactOutcome(pickupDecision)
    && citesExactOutcome(inspectedDecision)) {
    report.classification = "SAME_EXPLICIT_PLAN_REVIEW_DECISION_WITH_CAUSAL_CITATION";
  } else if (kinds.some((kind) => kind === "decline" || kind === "accept")) {
    report.classification = "NON_LIFECYCLE_DECISION_FOR_SINGLE_PLAN_REVIEW";
  } else if (kinds.every((kind) => kind === "defer" || kind === "clarify")) {
    report.classification = "SAME_UNRESOLVED_PLAN_REVIEW";
  } else if (pickupDecision?.kind !== inspectedDecision?.kind) {
    report.classification = "OUTCOME_MEANING_CHANGES_PLAN_REVIEW_RESPONSE";
  } else {
    report.classification = "SAME_PLAN_REVIEW_RESPONSE";
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
  if (report.outcome === undefined) report.outcome = "HARNESS_ERROR";
  report.error = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
