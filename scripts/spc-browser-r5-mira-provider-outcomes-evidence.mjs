import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(
  process.env.R5_MIRA_PROVIDER_OUTCOMES_OUTPUT
    ?? "evidence/browser/r5-mira-provider-outcomes.json",
);
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };

const MIRA_ID = "resident.mira";
const PROMPT = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
const CLARIFY_QUESTION = "Ida, co dokładnie masz na myśli?";
const PROVIDER_ERROR_RETRY_TICKS = 120;
const DEFER_REVIEW_TICKS = 60;
const CLARIFY_REVIEW_TICKS = 30;
const DECLINE_QUIET_TICKS = 600;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r5-outcomes-`);
  const port = 13_900 + Math.floor(Math.random() * 180);
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
    campaigns: [],
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

    for (let repeat = 0; repeat < REPEAT_COUNT; repeat += 1) {
      report.campaigns.push(await captureCampaign(cdp, repeat));
    }
    report.visualEvidence = report.campaigns[0]?.visualEvidence ?? null;

    const first = report.campaigns[0];

    assert(report, "provider error requeues exact pressure and waits 120 fresh settlement ticks", Boolean(
      first?.error?.admitted?.provider.providerRequestCount === 1
      && first.error.admitted.provider.providerInboxCount === 0
      && first.error.admitted.provider.providerRetryNotBeforeTick
        === first.error.admitted.canonical.tick + PROVIDER_ERROR_RETRY_TICKS
      && first.error.admitted.pendingReasons.length === 1
      && first.error.admitted.life.matters.length === 0
      && first.error.beforeRetry.provider.providerRequestCount === 1
      && first.error.retryStarted.provider.providerRequestCount === 2
      && first.error.retryStarted.canonical.tick
        === first.error.admitted.canonical.tick + PROVIDER_ERROR_RETRY_TICKS
    ), first?.error ?? null);

    assert(report, "decline settles exact pressure and remains matter/provider quiet for 600 ticks", Boolean(
      first?.decline?.admitted?.pendingReasons.length === 0
      && first.decline.admitted.life.matters.length === 0
      && settledCount(first.decline.admitted) === 1
      && first.decline.quiet.provider.providerRequestCount === 1
      && first.decline.quiet.pendingReasons.length === 0
      && first.decline.quiet.life.matters.length === 0
      && first.decline.quiet.miraSpeech.length === 0
    ), first?.decline ?? null);

    assert(report, "defer retains pressure to tick+60 and only then retries without ghost matter", Boolean(
      first?.defer?.admitted?.pendingReasons.length === 1
      && first.defer.admitted.life.matters.length === 0
      && pendingNotBefore(first.defer.admitted)
        === first.defer.admitted.canonical.tick + DEFER_REVIEW_TICKS
      && first.defer.beforeRetry.provider.providerRequestCount === 1
      && first.defer.retryStarted.provider.providerRequestCount === 2
      && first.defer.retryStarted.canonical.tick
        === first.defer.admitted.canonical.tick + DEFER_REVIEW_TICKS
      && first.defer.retryStarted.life.matters.length === 0
    ), first?.defer ?? null);

    assert(report, "clarify retains pressure to tick+30 without speaking provider-authored question", Boolean(
      first?.clarify?.admitted?.pendingReasons.length === 1
      && first.clarify.admitted.life.matters.length === 0
      && pendingNotBefore(first.clarify.admitted)
        === first.clarify.admitted.canonical.tick + CLARIFY_REVIEW_TICKS
      && !first.clarify.admitted.miraSpeech.some((occurrence) => occurrence.text === CLARIFY_QUESTION)
      && first.clarify.beforeRetry.provider.providerRequestCount === 1
      && first.clarify.retryStarted.provider.providerRequestCount === 2
      && first.clarify.retryStarted.canonical.tick
        === first.clarify.admitted.canonical.tick + CLARIFY_REVIEW_TICKS
      && !first.clarify.retryStarted.miraSpeech.some((occurrence) => occurrence.text === CLARIFY_QUESTION)
    ), first?.clarify ?? null);

    for (const mode of ["error", "decline", "defer", "clarify"]) {
      const hashes = report.campaigns.map((campaign) => campaign[mode].hash);
      assert(
        report,
        `R5-C ${mode} outcome is deterministic across real-Chrome reloads`,
        hashes.every((hash) => hash === hashes[0]),
        hashes,
      );
    }

    assert(report, "R5-C browser fixtures make no real provider/API request", report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "R5-C browser campaign has no uncaught runtime exception", report.runtimeExceptions.length === 0, report.runtimeExceptions);
    assert(report, "R5-C screenshots are non-empty and canonically read-only", Boolean(
      first?.visualEvidence?.error?.bytes > 10_000
      && first.visualEvidence?.decline?.bytes > 10_000
      && first.visualEvidence?.defer?.bytes > 10_000
      && first.visualEvidence?.clarify?.bytes > 10_000
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

async function captureCampaign(cdp, repeat) {
  const visualEvidence = repeat === 0 ? {} : null;
  const error = await captureError(cdp, visualEvidence);
  const decline = await captureDecline(cdp, visualEvidence);
  const defer = await captureRetained(cdp, "defer", DEFER_REVIEW_TICKS, visualEvidence);
  const clarify = await captureRetained(cdp, "clarify", CLARIFY_REVIEW_TICKS, visualEvidence);
  return { repeat, error, decline, defer, clarify, visualEvidence };
}

async function setupRequest(cdp, mode) {
  await navigateEvidence(cdp);
  await scenarioAction(cdp, `provider-mode-${mode}`);
  await stepEvidence(cdp, 1);
  await scenarioAction(cdp, "ida-address-mira");
  await stepEvidence(cdp, 1);
  const request = await captureState(cdp);
  if (request.provider.providerRequestCount !== 1) {
    throw new Error(`R5-C ${mode}: provider request did not start`);
  }
  await scenarioAction(cdp, "release-provider");
  await waitUntil(async () => {
    const state = await scenarioSnapshot(cdp);
    return state?.diagnostics?.providerInboxCount === 1;
  }, 10_000, `R5-C ${mode} inert provider arrival`);
  const arrival = await captureState(cdp);
  await stepEvidence(cdp, 1);
  const admitted = await captureState(cdp);
  return { request, arrival, admitted };
}

async function captureError(cdp, visualEvidence) {
  const base = await setupRequest(cdp, "error");
  if (visualEvidence) {
    visualEvidence.error = await captureFrozenScreenshot(
      cdp,
      "r5-mira-provider-outcomes-01-error.png",
      base.admitted.canonical,
    );
  }
  await stepEvidence(cdp, PROVIDER_ERROR_RETRY_TICKS - 1);
  const beforeRetry = await captureState(cdp);
  await stepEvidence(cdp, 1);
  const retryStarted = await captureState(cdp);
  const value = { ...base, beforeRetry, retryStarted };
  return { ...value, hash: hashJson(projectDeterministic(value)) };
}

async function captureDecline(cdp, visualEvidence) {
  const base = await setupRequest(cdp, "decline");
  if (visualEvidence) {
    visualEvidence.decline = await captureFrozenScreenshot(
      cdp,
      "r5-mira-provider-outcomes-02-decline.png",
      base.admitted.canonical,
    );
  }
  await stepEvidence(cdp, DECLINE_QUIET_TICKS);
  const quiet = await captureState(cdp);
  const value = { ...base, quiet };
  return { ...value, hash: hashJson(projectDeterministic(value)) };
}

async function captureRetained(cdp, mode, reviewTicks, visualEvidence) {
  const base = await setupRequest(cdp, mode);
  if (visualEvidence) {
    visualEvidence[mode] = await captureFrozenScreenshot(
      cdp,
      `r5-mira-provider-outcomes-${mode === "defer" ? "03" : "04"}-${mode}.png`,
      base.admitted.canonical,
    );
  }
  await stepEvidence(cdp, reviewTicks - 1);
  const beforeRetry = await captureState(cdp);
  await stepEvidence(cdp, 1);
  const retryStarted = await captureState(cdp);
  const value = { ...base, beforeRetry, retryStarted };
  return { ...value, hash: hashJson(projectDeterministic(value)) };
}

async function captureState(cdp) {
  const canonical = await canonicalSnapshot(cdp);
  const scenario = await scenarioSnapshot(cdp);
  const semanticPressure = scenario.semanticPressure ?? [];
  const miraSpeech = (scenario.recentOccurrences ?? []).filter(
    (occurrence) => occurrence.kind === "speech" && occurrence.actorId === MIRA_ID,
  );
  return {
    canonical,
    providerMode: scenario.providerMode,
    provider: scenario.diagnostics,
    life: scenario.life,
    semanticPressure,
    pendingReasons: semanticPressure
      .filter((entry) => entry.status === "pending")
      .map((entry) => entry.reason),
    providerContexts: scenario.providerContexts ?? [],
    miraSpeech,
  };
}

function pendingNotBefore(state) {
  return state.semanticPressure.find((entry) => entry.status === "pending")?.notBeforeTick ?? null;
}

function settledCount(state) {
  return state.semanticPressure.filter((entry) => entry.status === "settled").length;
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
  ), 20_000, "R5-C evidence scene");
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
  if (beforeHash !== hashJson(after)) throw new Error(`screenshot ${fileName} mutated canonical World state`);
  return { fileName, tick: canonicalBefore.tick, bytes: bytes.length, canonicalHash: beforeHash };
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}
async function scenarioSnapshot(cdp) {
  return await scenarioAction(cdp, "snapshot");
}
async function scenarioAction(cdp, actionId) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.scenarioAction(${JSON.stringify(actionId)})`);
}
async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`, 60_000);
}
async function evaluate(cdp, expression, timeoutMs = 30_000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed");
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
