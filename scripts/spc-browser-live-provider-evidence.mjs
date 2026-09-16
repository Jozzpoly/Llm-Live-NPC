import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_OUTPUT ?? "evidence/live-provider/live-provider.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const JANEK_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const CAPABILITY_ID = "local.material.search.remembered-workshop-area";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const MAX_TO_PROVIDER = 700;
const MAX_TO_REACQUIRE = 900;
const PROVIDER_TIMEOUT_MS = 45_000;

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required; do not run live-provider evidence against an implicit origin");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required for live-provider source binding");
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
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      this.ws.addEventListener("error", () => { clearTimeout(timer); rejectOpen(new Error("CDP WebSocket connection failed")); }, { once: true });
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
        resolve: (result) => { clearTimeout(timer); resolveSend(result); },
        reject: (error) => { clearTimeout(timer); rejectSend(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.ws?.close(); }
}

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-live-provider-`);
  const port = 11_700 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
    qualification: null,
    sourceSha: SOURCE_SHA,
    candidateBaseUrl: BASE_URL,
    sourceBinding: "cloudflare-bot-exact-commit-preview",
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    networkFailures: [],
    provider: {
      request: null,
      response: null,
      worldTicksWhileInFlight: 0,
    },
    checkpoints: {},
  };

  let semanticRequest = null;
  let semanticResponse = null;
  let semanticLoadingFinished = false;

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
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
    cdp.on("Network.requestWillBeSent", (event) => {
      if (event.request?.method !== "POST" || !event.request?.url?.includes("/api/spc-next/semantic")) return;
      semanticRequest ??= {
        requestId: event.requestId,
        url: event.request.url,
        wallTime: event.wallTime ?? null,
        timestamp: event.timestamp ?? null,
        postData: event.request.postData ?? null,
      };
    });
    cdp.on("Network.responseReceived", (event) => {
      if (!semanticRequest || event.requestId !== semanticRequest.requestId) return;
      semanticResponse = {
        requestId: event.requestId,
        status: event.response?.status ?? null,
        url: event.response?.url ?? null,
        protocol: event.response?.protocol ?? null,
        mimeType: event.response?.mimeType ?? null,
      };
    });
    cdp.on("Network.loadingFinished", (event) => {
      if (semanticRequest && event.requestId === semanticRequest.requestId) semanticLoadingFinished = true;
    });
    cdp.on("Network.loadingFailed", (event) => {
      if (!semanticRequest || event.requestId !== semanticRequest.requestId) return;
      report.networkFailures.push({
        requestId: event.requestId,
        errorText: event.errorText ?? null,
        canceled: event.canceled ?? false,
      });
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    await navigateEvidence(cdp);

    let guard = 0;
    while (!semanticRequest && guard < MAX_TO_PROVIDER) {
      await stepEvidence(cdp, 1);
      await sleep(5);
      guard += 1;
    }
    if (!semanticRequest) throw new Error(`semantic provider request did not start within ${MAX_TO_PROVIDER} World steps`);

    const outbound = parseJson(semanticRequest.postData, "semantic request body");
    report.provider.request = {
      url: semanticRequest.url,
      providerRunId: outbound.providerRunId ?? null,
      version: outbound.version ?? null,
      matter: outbound.matter ?? null,
      semanticEvidence: outbound.semanticEvidence ?? null,
      localCapabilities: outbound.localCapabilities ?? null,
    };
    const requestBoundary = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.requestStarted = requestBoundary;

    assert(report, "live browser starts provider only after checked-absence semantic pressure", Boolean(
      requestBoundary.scenarioId === "browser-missing-crate-live-provider"
      && requestBoundary.matterStatus === "active"
      && requestBoundary.semanticRevision === 2
      && requestBoundary.activeRunId === null
      && requestBoundary.semanticEvidenceKind === "checked_absence"
    ), requestBoundary);
    assert(report, "provider request exposes one resident-owned bounded search capability and no hidden relocated truth", Boolean(
      outbound.version === 2
      && outbound.matter?.id === MATTER_ID
      && outbound.semanticEvidence?.kind === "checked_absence"
      && Array.isArray(outbound.localCapabilities)
      && outbound.localCapabilities.length === 1
      && outbound.localCapabilities[0]?.id === CAPABILITY_ID
      && !String(semanticRequest.postData ?? "").includes("2752")
      && !String(semanticRequest.postData ?? "").includes("player.relocator")
    ), report.provider.request);

    const providerDeadline = Date.now() + PROVIDER_TIMEOUT_MS;
    while (!semanticLoadingFinished && Date.now() < providerDeadline) {
      if (!semanticResponse) {
        const before = (await canonicalSnapshot(cdp)).tick;
        await stepEvidence(cdp, 1);
        const afterSnapshot = await canonicalSnapshot(cdp);
        if (afterSnapshot.tick > before) report.provider.worldTicksWhileInFlight += afterSnapshot.tick - before;
        if (afterSnapshot.continuity?.matter?.semanticRevision !== 2 || afterSnapshot.continuity?.matter?.activeRunId !== null) {
          throw new Error("resident semantics/execution changed before provider response completed");
        }
      }
      await sleep(25);
    }
    if (!semanticLoadingFinished || !semanticResponse) {
      throw new Error(`provider response did not complete within ${PROVIDER_TIMEOUT_MS}ms`);
    }

    const responsePayload = await responseBody(cdp, semanticRequest.requestId);
    const responseJson = parseJson(responsePayload, "semantic response body");
    report.provider.response = {
      httpStatus: semanticResponse.status,
      providerRunId: responseJson.providerRunId ?? null,
      ok: responseJson.ok ?? null,
      decision: responseJson.decision ?? null,
      usage: responseJson.usage ?? null,
    };

    assert(report, "exact Cloudflare candidate returns a measured Luna semantic decision", Boolean(
      semanticResponse.status === 200
      && responseJson.ok === true
      && responseJson.providerRunId === outbound.providerRunId
      && typeof responseJson.decision?.semanticCourse === "string"
      && responseJson.decision.semanticCourse.trim().length > 0
      && (responseJson.decision.localCapabilityId === CAPABILITY_ID || responseJson.decision.localCapabilityId === null)
      && responseJson.usage?.model === "gpt-5.6-luna"
      && Number.isSafeInteger(responseJson.usage?.inputTokens)
      && Number.isSafeInteger(responseJson.usage?.outputTokens)
      && Number.isSafeInteger(responseJson.usage?.totalTokens)
      && Number.isFinite(responseJson.usage?.elapsedMs)
      && responseJson.usage.elapsedMs >= 0
    ), report.provider.response);
    assert(report, "World advances independently while real provider is in flight", report.provider.worldTicksWhileInFlight > 0, {
      worldTicksWhileInFlight: report.provider.worldTicksWhileInFlight,
    });

    // The fetch Promise has finished, but manual World control has not advanced the
    // resident-owned admission boundary yet. Give browser microtasks a chance to
    // deposit the inert arrival into the local inbox and prove meaning stayed rev2.
    await sleep(50);
    const arrived = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.arrivedButNotAdmitted = arrived;
    assert(report, "provider arrival is inert until a later resident/World tick admits it", Boolean(
      arrived.semanticRevision === 2
      && arrived.activeRunId === null
      && arrived.semanticEvidenceKind === "checked_absence"
    ), arrived);

    await stepEvidence(cdp, 1);
    const admitted = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.admitted = admitted;
    const selectedCapabilityId = responseJson.decision?.localCapabilityId ?? null;
    if (selectedCapabilityId === CAPABILITY_ID) {
      assert(report, "next resident tick admits real provider meaning then grounds selected competence into exact search run", Boolean(
        admitted.semanticRevision === 3
        && admitted.semanticCourse === responseJson.decision.semanticCourse
        && admitted.activeRunId === SEARCH_RUN_ID
        && admitted.activeRunCanMutateWorld === true
        && admitted.semanticEvidenceKind === "checked_absence"
      ), admitted);

      let reacquired = null;
      guard = 0;
      while (!reacquired && guard < MAX_TO_REACQUIRE) {
        await stepEvidence(cdp, 1);
        const current = canonicalSummary(await canonicalSnapshot(cdp));
        if (current.semanticRevision === 4
          && current.activeRunId === null
          && current.semanticEvidenceKind === "material_reacquired") reacquired = current;
        guard += 1;
      }
      if (!reacquired) throw new Error(`real-provider-guided search did not reacquire crate within ${MAX_TO_REACQUIRE} World steps`);
      report.checkpoints.reacquired = reacquired;
      assert(report, "real Luna choice reaches legal embodied sight reacquisition without material-action oracle", Boolean(
        reacquired.materialKnowledge?.[0]?.currentlyVisible === true
        && samePosition(reacquired.materialKnowledge?.[0]?.lastKnownPosition, reacquired.crateLocation?.position)
        && reacquired.actionFacts.length === 0
      ), reacquired);
      report.qualification = "LIVE_PROVIDER_EMBODIED_PASS";
    } else {
      assert(report, "real provider may deliberately select no local competence without manufacturing execution", Boolean(
        admitted.semanticRevision === 3
        && admitted.semanticCourse === responseJson.decision.semanticCourse
        && admitted.activeRunId === null
        && admitted.activeRunCanMutateWorld === false
      ), admitted);
      report.qualification = "LIVE_PROVIDER_SEMANTIC_ONLY_PASS";
    }

    assert(report, "live-provider browser specimen has no uncaught runtime exceptions or semantic network failures", Boolean(
      report.runtimeExceptions.length === 0 && report.networkFailures.length === 0
    ), { runtimeExceptions: report.runtimeExceptions, networkFailures: report.networkFailures });

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

function canonicalSummary(snapshot) {
  const crate = snapshot.authoritativeWorld?.materialObjects?.find((object) => object.id === CRATE_ID) ?? null;
  return {
    schemaVersion: snapshot.schemaVersion ?? null,
    scenarioId: snapshot.scenarioId ?? null,
    tick: snapshot.tick ?? null,
    matterStatus: snapshot.continuity?.matter?.status ?? null,
    semanticRevision: snapshot.continuity?.matter?.semanticRevision ?? null,
    semanticCourse: snapshot.continuity?.matter?.semanticCourse ?? null,
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? null,
    semanticEvidenceKind: snapshot.continuity?.semanticEvidence?.kind ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    actionFacts: (snapshot.causalProvenance?.residentWorldActionFacts ?? []).map((fact) => ({
      tick: fact.tick,
      runId: fact.runId,
      kind: fact.action?.kind ?? null,
      objectId: fact.action?.objectId ?? null,
      outcomeStatus: fact.resolution?.outcomeStatus ?? fact.resolution?.status ?? null,
      code: fact.resolution?.code ?? fact.resolution?.reason ?? null,
    })),
  };
}

async function navigateEvidence(cdp) {
  const url = `${BASE_URL.replace(/\/$/u, "")}/?spc=1&evidence=1&scenario=missing-crate-live-provider`;
  await cdp.send("Page.navigate", { url });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 25_000, "live-provider evidence scene");
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.canonicalSnapshot()`);
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function responseBody(cdp, requestId) {
  await waitUntil(async () => {
    try {
      const body = await cdp.send("Network.getResponseBody", { requestId });
      if (!body || typeof body.body !== "string") return false;
      responseBody.cache = body.base64Encoded ? Buffer.from(body.body, "base64").toString("utf8") : body.body;
      return true;
    } catch {
      return false;
    }
  }, 5_000, "semantic response body");
  return responseBody.cache;
}
responseBody.cache = null;

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed");
  return result.result?.value;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) { lastError = error; }
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

function parseJson(text, label) {
  try { return JSON.parse(String(text ?? "")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

function samePosition(a, b) {
  return Boolean(a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
}

run().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA ?? null,
    candidateBaseUrl: BASE_URL ?? null,
    outcome: "HARNESS_ERROR",
    error: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null },
    finishedAt: new Date().toISOString(),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(fallback, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
