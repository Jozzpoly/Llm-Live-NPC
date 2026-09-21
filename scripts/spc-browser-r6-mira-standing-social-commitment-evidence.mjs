import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(
  process.env.R6_MIRA_STANDING_SOCIAL_COMMITMENT_OUTPUT
    ?? "evidence/browser/r6-mira-standing-social-commitment.json",
);
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };

const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const PROMISE_TEXT = "Tak, zostanę przy tobie jeszcze chwilę.";
const EXECUTION_GUARD = 600;
const MOTION_GUARD = 900;
const REPEAT_COUNT = 2;

mkdirSync(OUTPUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  for (const candidate of candidates) if (existsSync(candidate)) return candidate;
  for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const found = execFileSync("which", [binary], { encoding: "utf8" }).trim();
      if (found) return found;
    } catch {}
  }
  throw new Error("No Chrome/Chromium executable found. Set CHROME_PATH.");
}

class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.webSocketUrl);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("CDP WebSocket open timeout")), 10_000);
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        rejectOpen(new Error("CDP WebSocket connection failed"));
      }, { once: true });
    });
    this.ws.addEventListener("message", (event) => this.handleMessage(event.data));
    this.ws.addEventListener("close", () => {
      for (const pending of this.pending.values()) pending.reject(new Error("CDP WebSocket closed"));
      this.pending.clear();
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(String(raw));
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`));
      else pending.resolve(message.result ?? {});
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }

  on(method, listener) {
    const current = this.listeners.get(method) ?? [];
    current.push(listener);
    this.listeners.set(method, current);
  }

  send(method, params = {}, timeoutMs = 30_000) {
    const id = this.nextId++;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (result) => {
          clearTimeout(timer);
          resolveSend(result);
        },
        reject: (error) => {
          clearTimeout(timer);
          rejectSend(error);
        },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws?.close();
  }
}

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r6-standing-social-`);
  const port = 13_800 + Math.floor(Math.random() * 250);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  const report = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    providerLikeRequests: [],
    runs: [],
    visualEvidence: null,
  };

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?about:blank`,
      { method: "PUT" },
    );
    if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
    const target = await targetResponse.json();

    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.connect();

    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      report.runtimeExceptions.push({
        text: exceptionDetails?.text ?? null,
        description: exceptionDetails?.exception?.description ?? null,
      });
    });
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      const url = request?.url ?? "";
      if (isProviderLikeRequest(url)) report.providerLikeRequests.push(url);
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    for (let index = 0; index < REPEAT_COUNT; index += 1) {
      report.runs.push(await captureRun(cdp, index));
    }
    report.visualEvidence = report.runs[0]?.visualEvidence ?? null;

    const first = report.runs[0];
    const standing = standingMatter(first?.standing);
    const relevantEvent = first?.returnedRelevant?.relevanceEvents?.at(-1) ?? null;
    const relevantPressure = first?.returnedRelevant?.semanticPressure?.find(
      (entry) => entry.reason?.id === relevantEvent?.result?.reasonId,
    ) ?? null;
    const secondReturnEvent = first?.secondReturn?.relevanceEvents?.at(-1) ?? null;

    assert(report, "R6 browser starts with only Mira and Ida, no player and no standing commitment", Boolean(
      first?.initial?.canonical?.scenarioId === "browser-r6-mira-standing-social-commitment"
      && first.initial.actorIds.join(",") === [IDA_ID, MIRA_ID].sort().join(",")
      && first.initial.playerPresent === false
      && first.initial.life.matters.length === 0
      && first.initial.provider.providerRequestCount === 0
      && first.initial.standingMatterId === null
    ), first?.initial ?? null);

    assert(report, "Ida's real addressed speech starts exactly one bounded semantic attempt", Boolean(
      first?.requestStarted?.provider.providerRequestCount === 1
      && first.requestStarted.provider.providerInFlightRequestId
      && first.requestStarted.life.matters.length === 0
      && first.requestStarted.providerContexts?.length === 1
      && first.requestStarted.providerContexts[0]?.reasons?.[0]?.kind === "heard_speech"
    ), first?.requestStarted ?? null);

    const communicate = activeCommunicateMatter(first?.admitted);
    assert(report, "provider completion remains inert until one World admission boundary creates the exact communicate run", Boolean(
      first?.arrival?.provider.providerInboxCount === 1
      && first.arrival.life.matters.length === 0
      && first.admitted.provider.providerInboxCount === 0
      && communicate
      && communicate.semanticIntent?.targetActorId === IDA_ID
      && communicate.semanticIntent?.text === PROMISE_TEXT
      && communicate.activeRun?.runId === first.admitted.life.body.focusedRunId
    ), { arrival: first?.arrival, admitted: first?.admitted });

    assert(report, "standing semantic capability is prepared only while the promised communicate run is live", Boolean(
      first?.prepared?.prepared === true
      && first.preparedAction?.sourceMatterId === communicate?.id
      && first.preparedAction?.sourceRunId === communicate?.activeRun?.runId
      && first.preparedAction?.counterpartyActorId === IDA_ID
      && first.prepared.life.matters.every((matter) => matter.semanticIntent?.kind !== "standing_social_commitment")
    ), { prepared: first?.prepared, action: first?.preparedAction });

    assert(report, "Mira factually speaks the promise exactly once before standing history exists", Boolean(
      first?.resolvedSpeech?.promiseSpeechCount === 1
      && first.resolvedSpeech.promiseSpeech?.actorId === MIRA_ID
      && first.resolvedSpeech.promiseSpeech?.text === PROMISE_TEXT
      && first.resolvedSpeech.promiseSpeech?.addressedActorIds?.includes(IDA_ID)
      && first.resolvedSpeech.life.matters.some(
        (matter) => matter.id === communicate?.id && matter.status === "resolved" && matter.activeRun === null,
      )
      && first.resolvedSpeech.life.matters.every(
        (matter) => matter.semanticIntent?.kind !== "standing_social_commitment",
      )
    ), first?.resolvedSpeech ?? null);

    assert(report, "only after factual self speech does a run-free standing social commitment enter resident continuity", Boolean(
      standing
      && standing.status === "active"
      && standing.activeRun === null
      && standing.semanticIntent?.counterpartyActorId === IDA_ID
      && first.standing.life.body.focusedRunId === null
      && first.standing.standingMatterId === standing.id
      && first.standing.provider.providerRequestCount === 1
      && first.standing.pendingReasons.length === 0
    ), first?.standing ?? null);

    assert(report, "Ida can physically leave Mira's sight while the standing responsibility persists without taking Mira's body", Boolean(
      first?.away?.knownIda?.currentlyVisible === false
      && first.away.idaMotion === null
      && standingMatter(first.away)?.id === standing?.id
      && first.away.life.body.focusedRunId === null
      && first.away.provider.providerRequestCount === 1
      && first.away.pendingReasons.length === 0
    ), first?.away ?? null);

    assert(report, "Ida's real sight re-entry gains resident-relative significance from that exact private standing history", Boolean(
      first?.returnedRelevant?.knownIda?.currentlyVisible === true
      && relevantEvent?.percept?.phenomenon === "actor_sight_enter"
      && relevantEvent?.percept?.actorId === IDA_ID
      && relevantEvent?.result?.status === "promoted"
      && relevantEvent?.result?.matterId === standing?.id
      && relevantPressure?.status === "pending"
      && relevantPressure?.reason?.kind === "uncertainty"
      && relevantPressure?.reason?.evidenceIds?.includes(standing?.id)
      && first.returnedRelevant.provider.providerRequestCount === 1
    ), first?.returnedRelevant ?? null);

    assert(report, "private release resolves the standing matter and locally invalidates its significance without creating a World fact", Boolean(
      first?.releaseAction?.matter?.status === "resolved"
      && first.releaseAction?.reconciliation?.invalidatedReasonIds?.length === 1
      && standingMatter(first.released)?.status === "resolved"
      && first.released.life.matters.every(
        (matter) => matter.semanticIntent?.kind !== "standing_social_commitment",
      )
      && first.released.pendingReasons.length === 0
      && first.released.provider.providerRequestCount === 1
      && first.released.recentOccurrences.length === first.returnedRelevant.recentOccurrences.length
    ), { action: first?.releaseAction, state: first?.released });

    assert(report, "after release, an equivalent second real Ida sight re-entry stays observation-only", Boolean(
      first?.secondReturn?.knownIda?.currentlyVisible === true
      && secondReturnEvent?.percept?.phenomenon === "actor_sight_enter"
      && secondReturnEvent?.percept?.actorId === IDA_ID
      && secondReturnEvent?.result?.status === "not_relevant"
      && first.secondReturn.provider.providerRequestCount === 1
      && first.secondReturn.pendingReasons.length === 0
      && standingMatter(first.secondReturn)?.status === "resolved"
      && first.secondReturn.life.matters.every(
        (matter) => matter.semanticIntent?.kind !== "standing_social_commitment",
      )
    ), first?.secondReturn ?? null);

    for (const key of [
      "initialHash",
      "requestStartedHash",
      "arrivalHash",
      "admittedHash",
      "preparedHash",
      "resolvedSpeechHash",
      "standingHash",
      "awayHash",
      "returnedRelevantHash",
      "releasedHash",
      "secondReturnHash",
    ]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(
        report,
        `${key} is deterministic across real-Chrome reloads`,
        hashes.every((hash) => hash === hashes[0]),
        hashes,
      );
    }

    assert(
      report,
      "R6 deterministic browser fixture makes no real provider/API network request",
      report.providerLikeRequests.length === 0,
      report.providerLikeRequests,
    );
    assert(
      report,
      "R6 browser specimen has no uncaught runtime exception",
      report.runtimeExceptions.length === 0,
      report.runtimeExceptions,
    );
    assert(report, "R6 screenshots are non-empty and canonically read-only", Boolean(
      first?.visualEvidence?.standing?.bytes > 10_000
      && first.visualEvidence?.away?.bytes > 10_000
      && first.visualEvidence?.returnedRelevant?.bytes > 10_000
      && first.visualEvidence?.released?.bytes > 10_000
      && first.visualEvidence?.secondReturn?.bytes > 10_000
    ), first?.visualEvidence ?? null);

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
}

async function captureRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  if (runIndex === 0) await focusMiraWorldOnly(cdp);

  await stepEvidence(cdp, 1);
  const initial = await captureState(cdp);
  const visualEvidence = runIndex === 0 ? {} : null;

  await scenarioAction(cdp, "ida-address-mira");
  await stepEvidence(cdp, 1);
  const requestStarted = await captureState(cdp);

  await scenarioAction(cdp, "release-provider");
  await waitUntil(async () => {
    const state = await scenarioSnapshot(cdp);
    return state?.diagnostics?.providerInboxCount === 1;
  }, 10_000, "R6 inert provider arrival");
  const arrival = await captureState(cdp);

  await stepEvidence(cdp, 1);
  const admitted = await captureState(cdp);
  const preparedAction = await scenarioAction(cdp, "prepare-standing");
  const prepared = await captureState(cdp);

  let resolvedSpeech = null;
  for (let index = 0; index < EXECUTION_GUARD && !resolvedSpeech; index += 1) {
    await stepEvidence(cdp, 1);
    const candidate = await captureState(cdp);
    const communicate = candidate.life.matters.find(
      (matter) => matter.semanticIntent?.kind === "communicate_actor"
        && matter.semanticIntent?.targetActorId === IDA_ID
        && matter.semanticIntent?.text === PROMISE_TEXT,
    );
    if (communicate?.status === "resolved" && candidate.promiseSpeechCount === 1) {
      resolvedSpeech = candidate;
    }
  }
  if (!resolvedSpeech) throw new Error(`run ${runIndex}: promised speech did not factually resolve`);

  const materializedAction = await scenarioAction(cdp, "materialize-standing");
  const standing = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.standing = await captureFrozenScreenshot(
      cdp,
      "r6-standing-social-01-materialized.png",
      standing.canonical,
    );
  }

  await scenarioAction(cdp, "ida-move-away");
  const away = await stepUntilState(
    cdp,
    (state) => state.idaMotion === null && state.knownIda?.currentlyVisible === false,
    MOTION_GUARD,
    "Ida left Mira sight",
  );
  if (visualEvidence) {
    visualEvidence.away = await captureFrozenScreenshot(
      cdp,
      "r6-standing-social-02-ida-away.png",
      away.canonical,
    );
  }

  await scenarioAction(cdp, "ida-move-back");
  const returnedRelevant = await stepUntilState(
    cdp,
    (state) => state.relevanceEvents.some((event) => event.result?.status === "promoted"),
    MOTION_GUARD,
    "Ida relevant sight re-entry",
  );
  if (visualEvidence) {
    visualEvidence.returnedRelevant = await captureFrozenScreenshot(
      cdp,
      "r6-standing-social-03-relevant-return.png",
      returnedRelevant.canonical,
    );
  }

  const releaseAction = await scenarioAction(cdp, "release-standing");
  const released = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.released = await captureFrozenScreenshot(
      cdp,
      "r6-standing-social-04-released.png",
      released.canonical,
    );
  }

  await stepUntilState(
    cdp,
    (state) => state.idaMotion === null,
    MOTION_GUARD,
    "Ida finished first return",
  );

  await scenarioAction(cdp, "ida-move-away");
  await stepUntilState(
    cdp,
    (state) => state.idaMotion === null && state.knownIda?.currentlyVisible === false,
    MOTION_GUARD,
    "Ida second leave",
  );

  const priorEventCount = (await captureState(cdp)).relevanceEvents.length;
  await scenarioAction(cdp, "ida-move-back");
  const secondReturn = await stepUntilState(
    cdp,
    (state) => state.relevanceEvents.length > priorEventCount
      && state.relevanceEvents.at(-1)?.result?.status === "not_relevant",
    MOTION_GUARD,
    "Ida second observation-only return",
  );
  if (visualEvidence) {
    visualEvidence.secondReturn = await captureFrozenScreenshot(
      cdp,
      "r6-standing-social-05-second-return-observation-only.png",
      secondReturn.canonical,
    );
  }

  const value = {
    runIndex,
    initial,
    requestStarted,
    arrival,
    admitted,
    preparedAction,
    prepared,
    resolvedSpeech,
    materializedAction,
    standing,
    away,
    returnedRelevant,
    releaseAction,
    released,
    secondReturn,
  };

  return {
    ...value,
    initialHash: hashJson(projectDeterministic(initial)),
    requestStartedHash: hashJson(projectDeterministic(requestStarted)),
    arrivalHash: hashJson(projectDeterministic(arrival)),
    admittedHash: hashJson(projectDeterministic(admitted)),
    preparedHash: hashJson(projectDeterministic({ preparedAction, prepared })),
    resolvedSpeechHash: hashJson(projectDeterministic(resolvedSpeech)),
    standingHash: hashJson(projectDeterministic({ materializedAction, standing })),
    awayHash: hashJson(projectDeterministic(away)),
    returnedRelevantHash: hashJson(projectDeterministic(returnedRelevant)),
    releasedHash: hashJson(projectDeterministic({ releaseAction, released })),
    secondReturnHash: hashJson(projectDeterministic(secondReturn)),
    visualEvidence,
  };
}

async function stepUntilState(cdp, predicate, guard, label) {
  for (let index = 0; index < guard; index += 1) {
    await stepEvidence(cdp, 1);
    const state = await captureState(cdp);
    if (predicate(state)) return state;
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function captureState(cdp) {
  const canonical = await canonicalSnapshot(cdp);
  const scenario = await scenarioSnapshot(cdp);
  const recentOccurrences = scenario.recentOccurrences ?? [];
  const promiseSpeech = recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === MIRA_ID
      && occurrence.text === PROMISE_TEXT
      && occurrence.addressedActorIds?.includes(IDA_ID),
  );

  return {
    canonical,
    actorIds: (canonical.authoritativeWorld?.actors ?? []).map((actor) => actor.id).sort(),
    playerPresent: (canonical.authoritativeWorld?.actors ?? []).some((actor) => actor.kind === "player"),
    provider: scenario.diagnostics,
    life: scenario.life,
    semanticPressure: scenario.semanticPressure ?? [],
    pendingReasons: (scenario.semanticPressure ?? [])
      .filter((entry) => entry.status === "pending")
      .map((entry) => entry.reason),
    providerContexts: scenario.providerContexts ?? [],
    miraPosition: scenario.miraPosition,
    idaPosition: scenario.idaPosition,
    knownIda: scenario.knownIda,
    standingMatterId: scenario.standingMatterId,
    standingMatter: scenario.standingMatter,
    prepared: scenario.prepared,
    activeRelevanceMatterIds: scenario.activeRelevanceMatterIds ?? [],
    relevanceEvents: scenario.relevanceEvents ?? [],
    idaMotion: scenario.idaMotion,
    recentOccurrences,
    promiseSpeechCount: promiseSpeech.length,
    promiseSpeech: promiseSpeech.at(-1) ?? null,
  };
}

function activeCommunicateMatter(state) {
  return state?.life?.matters?.find(
    (matter) => matter.status === "active"
      && matter.semanticIntent?.kind === "communicate_actor"
      && matter.semanticIntent?.targetActorId === IDA_ID
      && matter.semanticIntent?.text === PROMISE_TEXT,
  ) ?? null;
}

function standingMatter(state) {
  return state?.standingMatter
    ?? state?.life?.matters?.find(
      (matter) => matter.semanticIntent?.kind === "standing_social_commitment"
        && matter.semanticIntent?.counterpartyActorId === IDA_ID,
    )
    ?? null;
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", {
    url: `${BASE_URL}/?spc=1&evidence=1&scenario=r6-mira-standing-social-commitment`,
  });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.()
      && typeof window.__SPC_EVIDENCE__?.scenarioAction === "function"
      && document.querySelector("canvas"))`,
  ), 20_000, "R6 Mira standing-social-commitment evidence scene");
}

async function focusMiraWorldOnly(cdp) {
  await evaluate(cdp, `document.querySelector('[data-resident="resident.mira"]')?.click()`);
  await evaluate(cdp, `document.querySelector('[data-action="focus"]')?.click()`);
  await evaluate(cdp, `document.querySelector('.spc-world-mode-toggle')?.click()`);
  await sleep(80);
}

async function captureFrozenScreenshot(cdp, fileName, canonicalBefore) {
  await sleep(70);
  const beforeHash = hashJson(canonicalBefore);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(data, "base64");
  writeFileSync(resolve(OUTPUT_DIR, fileName), bytes);
  const after = await canonicalSnapshot(cdp);
  if (beforeHash !== hashJson(after)) {
    throw new Error(`screenshot ${fileName} mutated canonical World state`);
  }
  return { fileName, tick: canonicalBefore.tick, bytes: bytes.length, canonicalHash: beforeHash };
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}

async function scenarioSnapshot(cdp) {
  return await scenarioAction(cdp, "snapshot");
}

async function scenarioAction(cdp, actionId) {
  return await evaluate(
    cdp,
    `window.__SPC_EVIDENCE__.scenarioAction(${JSON.stringify(actionId)})`,
  );
}

async function stepEvidence(cdp, steps) {
  return await evaluate(
    cdp,
    `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`,
    60_000,
  );
}

async function evaluate(cdp, expression, timeoutMs = 30_000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Runtime.evaluate failed",
    );
  }
  return result.result?.value;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw lastError instanceof Error ? lastError : new Error(`timeout waiting for ${url}`);
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`timeout waiting for ${label}`);
}

function isProviderLikeRequest(url) {
  try {
    const parsed = new URL(url);
    return parsed.pathname.startsWith("/api/")
      || parsed.pathname.includes("cognition")
      || parsed.pathname.includes("provider");
  } catch {
    return /\/api\/|cognition|provider/i.test(url);
  }
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

function projectDeterministic(value) {
  if (Array.isArray(value)) return value.map(projectDeterministic);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "visualEvidence") continue;
    out[key] = projectDeterministic(entry);
  }
  return out;
}

function hashJson(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}

run().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(fallback, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
