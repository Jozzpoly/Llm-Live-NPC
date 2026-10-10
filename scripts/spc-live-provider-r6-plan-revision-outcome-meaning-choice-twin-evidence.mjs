import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-plan-revision-outcome-meaning-choice-twin.json",
);
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const MAX_PROVIDER_REQUESTS = 2;
const CURRENT_MATTER = "matter.ida.r6.same-cardinality.current-janek";
const OTHER_MATTER = "matter.ida.r6.same-cardinality.other";
const OLD_MATTERS = [
  "matter.ida.r6.same-cardinality.old-a",
  "matter.ida.r6.same-cardinality.old-b",
];
const OLD_OUTCOMES = [
  "task-outcome:run.ida.r6.same-cardinality.old-a:90",
  "task-outcome:run.ida.r6.same-cardinality.old-b:120",
];

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const FIXTURE = JSON.parse(
  readFileSync(
    new URL("../evidence/r6-same-cardinality-outcome-meaning-choice-context.json", import.meta.url),
    "utf8",
  ),
);

function context(label) {
  const value = FIXTURE?.[label];
  if (!value || typeof value !== "object") {
    throw new Error(`missing R6 plan-revision donor context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 plan-revision/refusal falsifier reusing the already-qualified run-30 same-cardinality twins. Both frames have the same current C/D ambiguity, the same two exact old outcome identities and the same legal decision schema including evidence-grounded relinquish_matter(C). The only material difference is succeeded versus blocked meaning of the two old factual outcomes. Exactly two GPT-5.6 Luna requests; zero semantic retries; no preferred focus winner.",
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

function normalizeOutcomeMeaning(value) {
  const clone = JSON.parse(JSON.stringify(value));
  const current = clone.life?.matters?.find((matter) => matter?.id === CURRENT_MATTER);
  for (const support of current?.historicalSupport ?? []) {
    if (support?.relation === "prior_same_actor_outcome" && support?.evidence) {
      support.evidence.summary = "<OUTCOME_MEANING>";
    }
  }
  return clone;
}

function behavioralDecision(observation) {
  const decision = observation?.proposal?.decision;
  if (!decision) return null;
  if (decision.kind === "defer_all") return { kind: "defer_all" };
  if (decision.kind === "focus_matter" || decision.kind === "relinquish_matter") {
    return { kind: decision.kind, matterId: decision.matterId ?? null };
  }
  return { kind: decision.kind ?? null };
}

function decisionSummary(observation) {
  const decision = observation?.proposal?.decision;
  return {
    kind: decision?.kind ?? null,
    matterId: decision?.kind === "focus_matter" || decision?.kind === "relinquish_matter"
      ? decision.matterId ?? null
      : null,
    reason: decision?.reason ?? null,
    supportEvidenceIds: Array.isArray(decision?.supportEvidenceIds)
      ? decision.supportEvidenceIds
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
      && (decision.supportEvidenceIds === undefined
        || (Array.isArray(decision.supportEvidenceIds) && decision.supportEvidenceIds.length >= 1))
      && Number.isFinite(decision.reviewAfterSeconds)
      && decision.reviewAfterSeconds >= 0.25
      && decision.reviewAfterSeconds <= 600;
  }
  if (decision.kind === "relinquish_matter") {
    return decision.matterId === CURRENT_MATTER
      && Array.isArray(decision.supportEvidenceIds)
      && decision.supportEvidenceIds.length >= 1
      && decision.supportEvidenceIds.every((id) => OLD_OUTCOMES.includes(id))
      && typeof decision.reason === "string"
      && decision.reason.trim().length > 0
      && Number.isFinite(decision.reviewAfterSeconds)
      && decision.reviewAfterSeconds >= 0.25
      && decision.reviewAfterSeconds <= 600;
  }
  return decision.kind === "focus_matter"
    && [CURRENT_MATTER, OTHER_MATTER].includes(decision.matterId)
    && Array.isArray(decision.supportEvidenceIds)
    && decision.supportEvidenceIds.length >= 1
    && typeof decision.reason === "string"
    && decision.reason.trim().length > 0
    && Number.isFinite(decision.reviewAfterSeconds)
    && decision.reviewAfterSeconds >= 0.25
    && decision.reviewAfterSeconds <= 600;
}

function citedOldOutcomes(observation) {
  const ids = Array.isArray(observation?.proposal?.decision?.supportEvidenceIds)
    ? observation.proposal.decision.supportEvidenceIds
    : [];
  return OLD_OUTCOMES.filter((id) => ids.includes(id));
}

async function providerChoice(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 plan-revision hard provider request budget exhausted");
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
    `${label} remains inside focus-C/focus-D/relinquish-C/defer-all authority`,
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

  const methodResponse = await boundedFetch(`${base}/api/spc-next/life-choice`, { method: "GET" });
  const methodBody = await methodResponse.json();
  assert(
    "spend-free method probe reaches dedicated handler before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    { status: methodResponse.status, body: methodBody },
  );

  const succeeded = context("succeeded_history");
  const blocked = context("blocked_history");
  const succeededC = succeeded.life?.matters?.find((matter) => matter?.id === CURRENT_MATTER);
  const blockedC = blocked.life?.matters?.find((matter) => matter?.id === CURRENT_MATTER);
  const succeededSupport = succeededC?.historicalSupport ?? [];
  const blockedSupport = blockedC?.historicalSupport ?? [];

  assert(
    "twins are identical after normalizing only factual old outcome summaries",
    JSON.stringify(normalizeOutcomeMeaning(succeeded))
      === JSON.stringify(normalizeOutcomeMeaning(blocked)),
    {
      succeeded: normalizeOutcomeMeaning(succeeded),
      blocked: normalizeOutcomeMeaning(blocked),
    },
  );
  assert(
    "old episodes are absent from current life in both twins",
    OLD_MATTERS.every((oldId) => (
      !succeeded.life?.matters?.some((matter) => matter?.id === oldId)
      && !blocked.life?.matters?.some((matter) => matter?.id === oldId)
    )),
    {
      succeededMatterIds: succeeded.life?.matters?.map((matter) => matter.id),
      blockedMatterIds: blocked.life?.matters?.map((matter) => matter.id),
    },
  );
  assert(
    "both twins carry the same two exact target-local factual support identities",
    succeededSupport.length === 2
      && blockedSupport.length === 2
      && succeededSupport.every((support, index) => (
        support?.relation === "prior_same_actor_outcome"
        && support?.sourceMatterId === OLD_MATTERS[index]
        && support?.evidence?.id === OLD_OUTCOMES[index]
        && support?.evidence?.kind === "task_outcome"
      ))
      && blockedSupport.every((support, index) => (
        support?.relation === "prior_same_actor_outcome"
        && support?.sourceMatterId === OLD_MATTERS[index]
        && support?.evidence?.id === OLD_OUTCOMES[index]
        && support?.evidence?.kind === "task_outcome"
      )),
    { succeededSupport, blockedSupport },
  );
  assert(
    "factual meaning is exactly two succeeded outcomes versus two blocked outcomes",
    succeededSupport.every((support) => support.evidence.summary.startsWith("succeeded:"))
      && blockedSupport.every((support) => support.evidence.summary.startsWith("blocked:")),
    {
      succeededSummaries: succeededSupport.map((support) => support.evidence.summary),
      blockedSummaries: blockedSupport.map((support) => support.evidence.summary),
    },
  );
  assert(
    "both frames retain the same free-body C/D ambiguity and no fresh speech/self",
    succeeded.life?.body?.focusedRunId === null
      && blocked.life?.body?.focusedRunId === null
      && JSON.stringify(succeeded.life?.body?.deferredRunIds)
        === JSON.stringify(blocked.life?.body?.deferredRunIds)
      && succeeded.life.body.deferredRunIds.length === 2
      && JSON.stringify(succeeded.reasons) === JSON.stringify(blocked.reasons)
      && succeeded.reasons?.length === 1
      && succeeded.reasons[0]?.kind === "uncertainty"
      && !succeeded.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && !blocked.recentPercepts?.some((percept) => percept.phenomenon === "speech")
      && succeeded.self === undefined
      && blocked.self === undefined,
    { succeededBody: succeeded.life?.body, blockedBody: blocked.life?.body },
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("R6 plan-revision spend-free preflight failed; no provider request attempted");
  }

  const succeededObservation = await providerChoice("two_succeeded_old_outcomes", succeeded);
  if (succeededObservation.status !== 200 || succeededObservation.ok !== true) {
    report.finishedAt = new Date().toISOString();
    report.classification = "SUCCEEDED_HISTORY_PROVIDER_BOUNDARY_FAIL";
    report.outcome = "HARNESS_OR_CONTRACT_FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error("R6 plan-revision succeeded-history provider boundary failed before matched blocked spend");
  }
  const blockedObservation = await providerChoice("two_blocked_old_outcomes", blocked);

  const succeededBehavior = behavioralDecision(succeededObservation);
  const blockedBehavior = behavioralDecision(blockedObservation);
  const exactBehaviorEqual = JSON.stringify(succeededBehavior) === JSON.stringify(blockedBehavior);
  const succeededCited = citedOldOutcomes(succeededObservation);
  const blockedCited = citedOldOutcomes(blockedObservation);
  const succeededRelinquishesCurrent =
    succeededBehavior?.kind === "relinquish_matter"
      && succeededBehavior?.matterId === CURRENT_MATTER;
  const blockedRelinquishesCurrent =
    blockedBehavior?.kind === "relinquish_matter"
      && blockedBehavior?.matterId === CURRENT_MATTER;
  const blockedCitesBoth = OLD_OUTCOMES.every((id) => blockedCited.includes(id));

  report.observations.comparison = {
    succeeded: decisionSummary(succeededObservation),
    blocked: decisionSummary(blockedObservation),
    succeededBehavior,
    blockedBehavior,
    exactBehaviorEqual,
    succeededCitedOldOutcomes: succeededCited,
    blockedCitedOldOutcomes: blockedCited,
    succeededRelinquishesCurrent,
    blockedRelinquishesCurrent,
    blockedCitesBoth,
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

  if (blockedRelinquishesCurrent && !succeededRelinquishesCurrent && blockedCitesBoth) {
    report.classification = "BLOCKED_HISTORY_CAUSES_EVIDENCE_GROUNDED_PLAN_RELINQUISHMENT";
  } else if (blockedRelinquishesCurrent && !succeededRelinquishesCurrent) {
    report.classification = "BLOCKED_HISTORY_RELINQUISHES_WITH_PARTIAL_CAUSAL_CITATION";
  } else if (blockedRelinquishesCurrent && succeededRelinquishesCurrent) {
    report.classification = "BOTH_HISTORIES_RELINQUISH_CURRENT_PLAN";
  } else if (!exactBehaviorEqual) {
    report.classification = "OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_WITHOUT_PLAN_RELINQUISHMENT";
  } else if (blockedCited.length > 0 || succeededCited.length > 0) {
    report.classification = "SAME_PLAN_DECISION_WITH_HISTORY_CAUSAL_UPTAKE";
  } else {
    report.classification = "SAME_PLAN_DECISION_NO_EXPLICIT_HISTORY_USE";
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
