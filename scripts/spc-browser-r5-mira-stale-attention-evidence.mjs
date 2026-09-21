import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(
  process.env.R5_MIRA_STALE_ATTENTION_OUTPUT
    ?? "evidence/browser/r5-mira-stale-attention.json",
);
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };

const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const SPEECH_A = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
const SPEECH_B = "Mira, jednak chwila — najpierw odpowiedz, czy słyszysz zmianę.";
const MIRA_REPLY = "Tak, zostanę chwilę.";
const LATENCY_BEFORE_B = 60;
const STALE_RETRY_TICKS = 15;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r5-stale-`);
  const port = 13_700 + Math.floor(Math.random() * 200);
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

    for (let runIndex = 0; runIndex < REPEAT_COUNT; runIndex += 1) {
      report.runs.push(await captureRun(cdp, runIndex));
    }
    report.visualEvidence = report.runs[0]?.visualEvidence ?? null;

    const first = report.runs[0];
    const reasonA = first?.requestA?.providerContexts?.[0]?.reasons?.[0] ?? null;
    const reasonB = first?.newerAttention?.pendingReasons?.find((reason) => reason.id !== reasonA?.id) ?? null;

    assert(report, "R5-B begins with one exact provider request for speech A and no commitment", Boolean(
      first?.requestA?.provider.providerRequestCount === 1
      && first.requestA.provider.providerInFlightRequestId
      && first.requestA.life.matters.length === 0
      && reasonA?.kind === "heard_speech"
      && first.requestA.providerContexts[0]?.recentPercepts?.some(
        (percept) => percept.id === reasonA.evidenceIds?.[0]
          && percept.text === SPEECH_A
          && percept.actorId === IDA_ID
          && percept.addressed === true,
      )
    ), first?.requestA ?? null);

    assert(report, "newer addressed speech B changes attention while A remains in flight", Boolean(
      first?.newerAttention?.provider.providerRequestCount === 1
      && first.newerAttention.provider.providerInFlightRequestId
      && first.newerAttention.life.matters.length === 0
      && reasonB?.kind === "heard_speech"
      && reasonB?.summary?.includes(SPEECH_B)
      && reasonB.id !== reasonA?.id
    ), first?.newerAttention ?? null);

    assert(report, "provider A completion remains inert after newer attention", Boolean(
      first?.arrivalA?.provider.providerRequestCount === 1
      && first.arrivalA.provider.providerInFlightRequestId === null
      && first.arrivalA.provider.providerInboxCount === 1
      && first.arrivalA.life.matters.length === 0
      && first.arrivalA.replyCount === 0
    ), first?.arrivalA ?? null);

    const staleEvent = first?.staleBoundary?.provider?.recentProviderEvents?.at(-1) ?? null;
    assert(report, "next World boundary rejects A as stale and preserves A+B without commitment", Boolean(
      first?.staleBoundary?.provider.providerRequestCount === 1
      && first.staleBoundary.provider.providerInboxCount === 0
      && first.staleBoundary.life.matters.length === 0
      && first.staleBoundary.life.body.focusedRunId === null
      && first.staleBoundary.replyCount === 0
      && stableJson(first.staleBoundary.pendingReasons.map((reason) => reason.id).sort())
        === stableJson([reasonA?.id, reasonB?.id].sort())
      && pressureStatus(first.staleBoundary, reasonA?.id) === "pending"
      && pressureStatus(first.staleBoundary, reasonB?.id) === "pending"
      && staleEvent?.status === "admitted"
      && staleEvent?.detail === "stale"
      && first.staleBoundary.provider.providerRetryNotBeforeTick
        === first.staleBoundary.canonical.tick + STALE_RETRY_TICKS
    ), first?.staleBoundary ?? null);

    assert(report, "stale retry window prevents provider hot-loop for 14 ticks", Boolean(
      first?.beforeRetry?.ticks === STALE_RETRY_TICKS - 1
      && first.beforeRetry.after.provider.providerRequestCount === 1
      && first.beforeRetry.after.provider.providerInFlightRequestId === null
      && first.beforeRetry.after.pendingReasons.length === 2
      && first.beforeRetry.after.life.matters.length === 0
      && first.beforeRetry.after.replyCount === 0
    ), first?.beforeRetry ?? null);

    const retryContext = first?.retryStarted?.providerContexts?.[1] ?? null;
    assert(report, "retry starts exactly at the shared stale boundary with current A+B pressure", Boolean(
      first?.retryStarted?.provider.providerRequestCount === 2
      && first.retryStarted.provider.providerInFlightRequestId
      && first.retryStarted.canonical.tick === first.staleBoundary.canonical.tick + STALE_RETRY_TICKS
      && retryContext?.reasons?.length === 2
      && stableJson(retryContext.reasons.map((reason) => reason.id).sort())
        === stableJson([reasonA?.id, reasonB?.id].sort())
      && first.retryStarted.life.matters.length === 0
      && first.retryStarted.replyCount === 0
    ), first?.retryStarted ?? null);

    for (const key of [
      "requestAHash",
      "newerAttentionHash",
      "arrivalAHash",
      "staleBoundaryHash",
      "beforeRetryHash",
      "retryStartedHash",
    ]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(
        report,
        `${key} is deterministic across real-Chrome reloads`,
        hashes.every((hash) => hash === hashes[0]),
        hashes,
      );
    }

    assert(report, "R5-B browser fixture makes no real provider/API request", report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "R5-B browser specimen has no uncaught runtime exception", report.runtimeExceptions.length === 0, report.runtimeExceptions);
    assert(report, "R5-B screenshots are non-empty and read-only", Boolean(
      first?.visualEvidence?.stale?.bytes > 10_000
      && first.visualEvidence?.retry?.bytes > 10_000
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
    rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 100,
    });
  }
}

async function captureRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  await stepEvidence(cdp, 1);

  await scenarioAction(cdp, "ida-address-mira");
  await stepEvidence(cdp, 1);
  const requestA = await captureState(cdp);

  await stepEvidence(cdp, LATENCY_BEFORE_B);
  await scenarioAction(cdp, "ida-address-mira-newer");
  await stepEvidence(cdp, 1);
  const newerAttention = await captureState(cdp);

  await scenarioAction(cdp, "release-provider");
  await waitUntil(async () => {
    const state = await scenarioSnapshot(cdp);
    return state?.diagnostics?.providerInboxCount === 1;
  }, 10_000, "R5-B provider A inert arrival");
  const arrivalA = await captureState(cdp);

  await stepEvidence(cdp, 1);
  const staleBoundary = await captureState(cdp);

  const visualEvidence = runIndex === 0 ? {} : null;
  if (visualEvidence) {
    visualEvidence.stale = await captureFrozenScreenshot(
      cdp,
      "r5-mira-stale-attention-01-stale-boundary.png",
      staleBoundary.canonical,
    );
  }

  await stepEvidence(cdp, STALE_RETRY_TICKS - 1);
  const beforeRetryAfter = await captureState(cdp);
  const beforeRetry = {
    ticks: STALE_RETRY_TICKS - 1,
    after: beforeRetryAfter,
  };

  await stepEvidence(cdp, 1);
  const retryStarted = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.retry = await captureFrozenScreenshot(
      cdp,
      "r5-mira-stale-attention-02-retry-started.png",
      retryStarted.canonical,
    );
  }

  return {
    runIndex,
    requestA,
    newerAttention,
    arrivalA,
    staleBoundary,
    beforeRetry,
    retryStarted,
    requestAHash: hashJson(projectDeterministic(requestA)),
    newerAttentionHash: hashJson(projectDeterministic(newerAttention)),
    arrivalAHash: hashJson(projectDeterministic(arrivalA)),
    staleBoundaryHash: hashJson(projectDeterministic(staleBoundary)),
    beforeRetryHash: hashJson(projectDeterministic(beforeRetry)),
    retryStartedHash: hashJson(projectDeterministic(retryStarted)),
    visualEvidence,
  };
}

async function captureState(cdp) {
  const canonical = await canonicalSnapshot(cdp);
  const scenario = await scenarioSnapshot(cdp);
  const provider = scenario.diagnostics;
  const life = scenario.life;
  const semanticPressure = scenario.semanticPressure ?? [];
  const recentOccurrences = scenario.recentOccurrences ?? [];
  const replies = recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === MIRA_ID
      && occurrence.text === MIRA_REPLY
      && occurrence.addressedActorIds?.includes(IDA_ID),
  );
  return {
    canonical,
    provider,
    life,
    semanticPressure,
    pendingReasons: semanticPressure
      .filter((entry) => entry.status === "pending")
      .map((entry) => entry.reason),
    providerContexts: scenario.providerContexts ?? [],
    miraPosition: scenario.miraPosition,
    idaPosition: scenario.idaPosition,
    replyCount: replies.length,
  };
}

function pressureStatus(state, reasonId) {
  return state?.semanticPressure?.find((entry) => entry.reason?.id === reasonId)?.status ?? null;
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", {
    url: `${BASE_URL}/?spc=1&evidence=1&scenario=r5-mira-semantic-escalation`,
  });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.()
      && typeof window.__SPC_EVIDENCE__?.scenarioAction === "function"
      && document.querySelector("canvas"))`,
  ), 20_000, "R5-B evidence scene");
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
  return {
    fileName,
    tick: canonicalBefore.tick,
    bytes: bytes.length,
    canonicalHash: beforeHash,
  };
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
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
  );
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
