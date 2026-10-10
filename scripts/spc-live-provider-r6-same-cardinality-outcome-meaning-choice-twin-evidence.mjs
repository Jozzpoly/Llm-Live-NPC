import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r6-same-cardinality-outcome-meaning-choice-twin.json",
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
    throw new Error(`missing R6 same-cardinality fixture context: ${label}`);
  }
  return JSON.parse(JSON.stringify(value));
}

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose:
    "R6 same-cardinality factual outcome-meaning falsifier. Matched Ida twins have the same actor, exactly two old same-actor episodes, the same evidence identities/ticks, the same current C-vs-D ambiguity and no old matters in current life. The only material difference is whether both old factual outcomes say succeeded or blocked. Exactly two real GPT-5.6 Luna requests; no semantic retry and no preferred winner.",
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
  const ids = observation?.proposal?.decision?.kind === "focus_matter"
    && Array.isArray(observation.proposal.decision.supportEvidenceIds)
    ? observation.proposal.decision.supportEvidenceIds
    : [];
  return OLD_OUTCOMES.filter((id) => ids.includes(id));
}

async function providerChoice(label, submittedContext) {
  if (report.providerRequestsAttempted >= MAX_PROVIDER_REQUESTS) {
    throw new Error("R6 same-cardinality hard request budget exhausted");
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
    `${label} remains inside C/D/defer-all semantic authority`,
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
    "both twins carry exactly the same two typed same-actor support identities",
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
    "both frames retain one free body, identical C/D demands and no fresh speech/self",
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
    throw new Error("R6 same-cardinality spend-free preflight failed; no provider request attempted");
  }

  const succeededObservation = await providerChoice("two_succeeded_same_actor_outcomes", succeeded);
  if (succeededObservation.status !== 200 || succeededObservation.ok !== true) {
    report.finishedAt = new Date().toISOString();
    report.classification = "SUCCEEDED_HISTORY_PROVIDER_BOUNDARY_FAIL";
    report.outcome = "HARNESS_OR_CONTRACT_FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    throw new Error(
      `R6 same-cardinality succeeded-history provider boundary failed before matched blocked spend (upstream ${succeededObservation.upstreamStatus ?? "unknown"})`,
    );
  }
  const blockedObservation = await providerChoice("two_blocked_same_actor_outcomes", blocked);

  const succeededBehavior = behavioralDecision(succeededObservation);
  const blockedBehavior = behavioralDecision(blockedObservation);
  const exactBehaviorEqual = JSON.stringify(succeededBehavior) === JSON.stringify(blockedBehavior);
  const succeededCited = citedOldOutcomes(succeededObservation);
  const blockedCited = citedOldOutcomes(blockedObservation);
  const succeededCitesBoth = OLD_OUTCOMES.every((id) => succeededCited.includes(id));
  const blockedCitesBoth = OLD_OUTCOMES.every((id) => blockedCited.includes(id));
  const eitherDecisionCitesBoth = succeededCitesBoth || blockedCitesBoth;

  report.observations.comparison = {
    succeeded: decisionSummary(succeededObservation),
    blocked: decisionSummary(blockedObservation),
    succeededBehavior,
    blockedBehavior,
    exactBehaviorEqual,
    succeededCitedOldOutcomes: succeededCited,
    blockedCitedOldOutcomes: blockedCited,
    succeededCitesBoth,
    blockedCitesBoth,
  };

  assert(
    "hard experiment budget is exactly two real provider requests with no semantic retry",
    report.providerRequestsAttempted === MAX_PROVIDER_REQUESTS,
    { attempted: report.providerRequestsAttempted, max: MAX_PROVIDER_REQUESTS },
  );

  if (!exactBehaviorEqual && eitherDecisionCitesBoth) {
    report.classification = "SAME_CARDINALITY_OUTCOME_MEANING_BEHAVIOR_DIFFERENCE_OBSERVED";
  } else if (!exactBehaviorEqual) {
    report.classification = "BEHAVIOR_DIFFERENCE_WITHOUT_OUTCOME_HISTORY_CAUSAL_CITATION";
  } else if (succeededCitesBoth || blockedCitesBoth) {
    report.classification = "SAME_BEHAVIOR_WITH_CUMULATIVE_HISTORY_SUPPORT";
  } else if (succeededCited.length > 0 || blockedCited.length > 0) {
    report.classification = "SAME_BEHAVIOR_WITH_PARTIAL_HISTORY_SUPPORT";
  } else {
    report.classification = "SAME_BEHAVIOR_NO_EXPLICIT_HISTORY_SUPPORT";
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
