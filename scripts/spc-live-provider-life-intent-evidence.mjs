import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_OUTPUT ?? "evidence/live-provider/live-provider-life-intent.json");
const REQUEST_TIMEOUT_MS = 45_000;
const EXPECTED_MODEL = "gpt-5.6-luna";
const FOCUSED_RUN_ID = "run.mira.provider-intent.workshop";
const KNOWN_REGION_IDS = new Set(["hearth", "workshop", "fields"]);
const KNOWN_ACTOR_IDS = new Set(["player.jozz"]);

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(dirname(OUTPUT_FILE), { recursive: true });

const context = {
  contract: "resident_life_cognition_v1",
  resident: { id: "resident.mira", name: "Mira" },
  tick: 120,
  currentRegionId: "hearth",
  reasons: [{
    id: "reason:mira:provider-intent:speech:120",
    tick: 120,
    kind: "heard_speech",
    salience: 0.8,
    summary: "Mira heard an addressed request while an already-authorized run owns her body.",
    evidenceIds: ["percept:mira:provider-intent:speech:120"],
  }],
  localActivity: {
    id: "activity:resident.mira:idle:provider-intent",
    kind: "idle",
    targetActorId: null,
    targetPosition: null,
    text: null,
    speed: null,
    reason: "legacy local activity projection is idle while recovered life owns the body",
  },
  recentPercepts: [{
    id: "percept:mira:provider-intent:speech:120",
    occurrenceId: "occurrence:mira:provider-intent:speech:120",
    tick: 120,
    phenomenon: "speech",
    modality: "hearing",
    actorId: "player.jozz",
    subjectId: null,
    spatial: { kind: "directional", direction: { x: 1, y: 0 }, distanceBand: "near" },
    summary: "Jozz addressed Mira while she had an ongoing matter.",
    text: "Mira, sprawdzisz też później pola?",
    addressed: true,
  }],
  concerns: [],
  beliefs: [],
  knownActors: [{
    id: "player.jozz",
    label: "Jozz",
    lastKnownPosition: null,
    lastObservedTick: null,
    currentlyVisible: false,
    visibilityChangedTick: null,
    lastHeardDirection: { x: 1, y: 0 },
    lastHeardDistanceBand: "near",
    lastHeardTick: 120,
  }],
  knownRegions: [
    { id: "hearth", label: "Hearth", knowledge: "visited", lastVisitedTick: 100 },
    { id: "workshop", label: "Workshop", knowledge: "familiar", lastVisitedTick: null },
    { id: "fields", label: "Fields", knowledge: "familiar", lastVisitedTick: null },
  ],
  life: {
    version: 1,
    matters: [{
      id: "matter.mira.provider-intent.workshop",
      status: "active",
      semanticRevision: 1,
      semanticCourse: "finish the already-authorized workshop errand before yielding body time",
      suspendedByMatterId: null,
      originEvidence: {
        id: "evidence:mira:provider-intent:workshop:origin",
        tick: 80,
        kind: "accepted_commitment",
        summary: "Mira already has an accepted workshop commitment.",
      },
      semanticEvidence: null,
      lastOutcomeEvidence: null,
      activeRun: {
        runId: FOCUSED_RUN_ID,
        taskId: "task.mira.provider-intent.workshop",
        semanticRevision: 1,
        canMutateWorld: true,
        bodyState: "focused",
      },
    }],
    body: { focusedRunId: FOCUSED_RUN_ID, deferredRunIds: [] },
  },
};

const report = {
  schemaVersion: 2,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose: "bounded real-provider qualification of the commitment-native resident life-intent contract while recovered life already owns the body; any legal accept/decline/defer/clarify is contract evidence, not a judgement-quality, matter-materialization, execution or sustained-life claim",
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

function legalBoundedAcceptedIntent(intent) {
  if (!intent || typeof intent !== "object") return false;
  if (!["idle", "travel", "follow", "communicate", "investigate"].includes(intent.kind)) return false;
  if (typeof intent.goal !== "string" || !intent.goal.trim()) return false;
  if (intent.targetRegionId !== null && !KNOWN_REGION_IDS.has(intent.targetRegionId)) return false;
  if (intent.targetActorId !== null && !KNOWN_ACTOR_IDS.has(intent.targetActorId)) return false;
  if (intent.targetPosition !== null) {
    if (typeof intent.targetPosition !== "object"
      || !Number.isFinite(intent.targetPosition.x)
      || !Number.isFinite(intent.targetPosition.y)) return false;
  }
  if (intent.text !== null && (typeof intent.text !== "string" || !intent.text.trim())) return false;
  return true;
}

function legalBoundedProposal(proposal) {
  if (!proposal || proposal.version !== 1) return false;
  if (!Array.isArray(proposal.beliefs) || !Array.isArray(proposal.concerns)) return false;
  if (!Number.isFinite(proposal.reviewAfterSeconds)
    || proposal.reviewAfterSeconds < 0.25
    || proposal.reviewAfterSeconds > 600) return false;
  if (Object.hasOwn(proposal, "activityDirective")) return false;

  const decision = proposal.commitmentDecision;
  if (!decision || typeof decision.reason !== "string" || !decision.reason.trim()) return false;
  if (decision.kind === "accept") return legalBoundedAcceptedIntent(decision.intent);
  if (decision.kind === "decline" || decision.kind === "defer") return true;
  if (decision.kind === "clarify") {
    return typeof decision.question === "string" && decision.question.trim().length > 0;
  }
  return false;
}

const FORBIDDEN_AUTHORITY_KEYS = new Set([
  "matterId",
  "runId",
  "taskId",
  "bodyState",
  "focusedRunId",
  "canMutateWorld",
  "outcome",
  "completed",
  "worldMutation",
  "routeRegionIds",
  "destination",
]);

function containsForbiddenAuthorityClaim(value) {
  if (Array.isArray(value)) return value.some(containsForbiddenAuthorityClaim);
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_AUTHORITY_KEYS.has(key)) return true;
    if (containsForbiddenAuthorityClaim(child)) return true;
  }
  return false;
}

async function run() {
  const base = BASE_URL.replace(/\/$/u, "");
  const healthResponse = await request(`${base}/api/health`, { headers: { accept: "application/json" } });
  const health = await healthResponse.json();
  report.spendFreePreflight.health = {
    status: healthResponse.status,
    lifeIntentEndpoint: health?.spcNextLifeIntentEndpoint ?? null,
    model: health?.spcNextLifeIntentModelConfigured ?? null,
    keyConfigured: health?.hearthKeyConfigured ?? null,
  };
  assert(
    "exact preview advertises the dedicated resident life-intent endpoint",
    healthResponse.ok && health?.spcNextLifeIntentEndpoint === "/api/spc-next/life-intent",
    report.spendFreePreflight.health,
  );
  assert(
    "exact preview is configured for the intended GPT-5.6 Luna qualifier",
    health?.spcNextLifeIntentModelConfigured === EXPECTED_MODEL,
    report.spendFreePreflight.health,
  );
  assert(
    "exact preview reports a configured provider key before bounded spend",
    health?.hearthKeyConfigured === true,
    report.spendFreePreflight.health,
  );

  const methodResponse = await request(`${base}/api/spc-next/life-intent`, { method: "GET" });
  const methodBody = await methodResponse.json();
  report.spendFreePreflight.methodBoundary = { status: methodResponse.status, body: methodBody };
  assert(
    "spend-free method probe reaches the dedicated handler and fails closed before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    report.spendFreePreflight.methodBoundary,
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("spend-free resident life-intent preflight failed; real provider request was not attempted");
  }

  const started = Date.now();
  const providerResponse = await request(`${base}/api/spc-next/life-intent`, {
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
    focusedRunId: FOCUSED_RUN_ID,
  };

  assert(
    "one real provider request completes through the exact commitment-native life-intent endpoint",
    providerResponse.ok && providerBody?.ok === true,
    report.provider,
  );
  assert(
    "provider output is one bounded commitment decision over private resident-life context",
    legalBoundedProposal(providerBody?.proposal),
    providerBody?.proposal ?? null,
  );
  assert(
    "provider output claims no matter, run, route, body, World or factual-outcome authority",
    !containsForbiddenAuthorityClaim(providerBody?.proposal),
    providerBody?.proposal ?? null,
  );

  const usage = providerBody?.usage;
  assert(
    "real provider evidence records exact Luna model, latency and non-zero token usage",
    usage?.model === EXPECTED_MODEL
      && Number.isSafeInteger(usage?.inputTokens)
      && usage.inputTokens > 0
      && Number.isSafeInteger(usage?.outputTokens)
      && usage.outputTokens > 0
      && Number.isSafeInteger(usage?.totalTokens)
      && usage.totalTokens >= usage.inputTokens + usage.outputTokens
      && elapsedMs >= 0,
    { usage: usage ?? null, elapsedMs },
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
