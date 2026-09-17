import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_OUTPUT ?? "evidence/live-provider/live-provider-life-choice.json");
const REQUEST_TIMEOUT_MS = 45_000;
const MATTER_B = "matter.mira.provider-choice.hearth";
const MATTER_C = "matter.mira.provider-choice.fields";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const context = {
  contract: "resident_life_cognition_v1",
  resident: { id: "resident.mira", name: "Mira" },
  tick: 240,
  currentRegionId: "workshop",
  reasons: [{
    id: "reason:resident.mira:provider-choice-review:240",
    tick: 240,
    kind: "quiet_review",
    salience: 0.45,
    summary: "Two continuing matters are waiting for the same currently-free body resource.",
    evidenceIds: [],
  }],
  localActivity: {
    id: "activity:resident.mira:idle:post-run",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy local activity is idle after the previous exact run completed",
  },
  recentPercepts: [],
  concerns: [],
  beliefs: [],
  knownActors: [],
  knownRegions: [
    { id: "workshop", label: "Workshop", knowledge: "visited", lastVisitedTick: 236 },
    { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 90 },
    { id: "fields", label: "Fields", knowledge: "familiar", lastVisitedTick: null },
  ],
  life: {
    version: 1,
    matters: [
      {
        id: "matter.mira.provider-choice.previous-workshop",
        status: "resolved",
        semanticRevision: 1,
        semanticCourse: "reach the familiar workshop after the settlement walk",
        suspendedByMatterId: null,
        originEvidence: null,
        semanticEvidence: null,
        lastOutcomeEvidence: null,
        activeRun: null,
      },
      {
        id: MATTER_B,
        status: "active",
        semanticRevision: 1,
        semanticCourse: "return to the familiar hearth when body time becomes available",
        suspendedByMatterId: null,
        originEvidence: {
          id: "evidence:mira:provider-choice:hearth:origin",
          tick: 180,
          kind: "life_context",
          summary: "Mira has an unfinished ordinary-life reason to return to the hearth.",
        },
        semanticEvidence: {
          id: "evidence:mira:provider-choice:hearth:origin",
          tick: 180,
          kind: "life_context",
          summary: "Mira has an unfinished ordinary-life reason to return to the hearth.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.provider-choice.hearth",
          taskId: "task.mira.provider-choice.hearth",
          semanticRevision: 1,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
      {
        id: MATTER_C,
        status: "active",
        semanticRevision: 2,
        semanticCourse: "check the familiar fields after newer settlement pressure",
        suspendedByMatterId: null,
        originEvidence: {
          id: "evidence:mira:provider-choice:fields:origin",
          tick: 150,
          kind: "life_context",
          summary: "Mira has a continuing ordinary-life reason to check the fields.",
        },
        semanticEvidence: {
          id: "evidence:mira:provider-choice:fields:revision",
          tick: 220,
          kind: "life_context",
          summary: "The fields matter remains current after a newer local-life review.",
        },
        lastOutcomeEvidence: null,
        activeRun: {
          runId: "run.mira.provider-choice.fields",
          taskId: "task.mira.provider-choice.fields",
          semanticRevision: 2,
          canMutateWorld: true,
          bodyState: "deferred",
        },
      },
    ],
    body: {
      focusedRunId: null,
      deferredRunIds: ["run.mira.provider-choice.hearth", "run.mira.provider-choice.fields"],
    },
  },
};

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose: "bounded real-provider qualification of resident_life_cognition_v1 choice transport; not a living-world or autonomous-matter-generation claim",
  startedAt: new Date().toISOString(),
  assertions: [],
  spendFreePreflight: {},
  provider: null,
};

function assert(name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

async function request(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const base = BASE_URL.replace(/\/$/u, "");
  const healthResponse = await request(`${base}/api/health`, { headers: { accept: "application/json" } });
  const health = await healthResponse.json();
  report.spendFreePreflight.health = {
    status: healthResponse.status,
    lifeChoiceEndpoint: health?.spcNextLifeChoiceEndpoint ?? null,
    model: health?.spcNextLifeChoiceModelConfigured ?? null,
    keyConfigured: health?.hearthKeyConfigured ?? null,
  };
  assert(
    "exact preview advertises the dedicated resident life-choice endpoint",
    healthResponse.ok && health?.spcNextLifeChoiceEndpoint === "/api/spc-next/life-choice",
    report.spendFreePreflight.health,
  );
  assert(
    "exact preview reports a configured provider key before the bounded spend",
    health?.hearthKeyConfigured === true,
    report.spendFreePreflight.health,
  );

  // GET is rejected before provider configuration/body/inference. This proves the
  // exact preview routes the dedicated endpoint without consuming provider tokens.
  const methodResponse = await request(`${base}/api/spc-next/life-choice`, { method: "GET" });
  const methodBody = await methodResponse.json();
  report.spendFreePreflight.methodBoundary = { status: methodResponse.status, body: methodBody };
  assert(
    "spend-free method probe reaches the dedicated handler and fails closed before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    report.spendFreePreflight.methodBoundary,
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("spend-free resident life-choice preflight failed; real provider request was not attempted");
  }

  const started = Date.now();
  const providerResponse = await request(`${base}/api/spc-next/life-choice`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(context),
  });
  const elapsedMs = Date.now() - started;
  const providerBody = await providerResponse.json();
  report.provider = {
    status: providerResponse.status,
    elapsedMs,
    response: providerBody,
    submittedContract: context.contract,
    candidateMatterIds: [MATTER_B, MATTER_C],
  };

  assert(
    "one real provider request completes through the exact life-choice endpoint",
    providerResponse.ok && providerBody?.ok === true,
    report.provider,
  );

  const decision = providerBody?.proposal?.decision;
  const legalDecision = decision?.kind === "defer_all"
    || (decision?.kind === "focus_matter" && [MATTER_B, MATTER_C].includes(decision?.matterId));
  assert(
    "provider output stays inside the bounded B/C/defer-all authority surface",
    providerBody?.proposal?.version === 1
      && legalDecision
      && typeof decision?.reason === "string"
      && decision.reason.trim().length > 0
      && Number.isFinite(decision?.reviewAfterSeconds)
      && decision.reviewAfterSeconds >= 0.25
      && decision.reviewAfterSeconds <= 600,
    decision ?? null,
  );

  const usage = providerBody?.usage;
  assert(
    "real provider evidence records model, latency and non-zero token usage",
    typeof usage?.model === "string"
      && usage.model.length > 0
      && Number.isSafeInteger(usage?.inputTokens)
      && usage.inputTokens > 0
      && Number.isSafeInteger(usage?.outputTokens)
      && usage.outputTokens > 0
      && Number.isSafeInteger(usage?.totalTokens)
      && usage.totalTokens >= usage.inputTokens + usage.outputTokens
      && elapsedMs >= 0,
    { usage: usage ?? null, elapsedMs },
  );

  assert(
    "provider response does not claim body execution or physical completion",
    !Object.hasOwn(providerBody?.proposal ?? {}, "activity")
      && !Object.hasOwn(providerBody?.proposal ?? {}, "runId")
      && !Object.hasOwn(providerBody?.proposal ?? {}, "outcome")
      && !Object.hasOwn(decision ?? {}, "completed"),
    providerBody?.proposal ?? null,
  );

  report.finishedAt = new Date().toISOString();
  report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  if (report.outcome !== "PASS") process.exitCode = 1;
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
