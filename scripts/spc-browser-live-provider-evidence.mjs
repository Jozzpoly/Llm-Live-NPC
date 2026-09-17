import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_OUTPUT ?? "evidence/live-provider/live-provider-lifecycle.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const JANEK_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const SEARCH_CAPABILITY_ID = "local.material.search.remembered-workshop-area";
const PICKUP_CAPABILITY_ID = "local.material.pickup.visible-familiar-crate";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate.live-provider";
const MAX_TO_FIRST_PROVIDER = 700;
const MAX_TO_REACQUIRE = 900;
const MAX_TO_RESOLVE = 900;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-live-provider-lifecycle-`);
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
    schemaVersion: 2,
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
      requests: [],
      totalRequestCount: 0,
    },
    checkpoints: {},
  };
  const semanticRequests = [];

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
      semanticRequests.push({
        requestId: event.requestId,
        url: event.request.url,
        wallTime: event.wallTime ?? null,
        timestamp: event.timestamp ?? null,
        postData: event.request.postData ?? null,
        response: null,
        loadingFinished: false,
        worldTicksWhileInFlight: 0,
      });
      report.provider.totalRequestCount = semanticRequests.length;
    });
    cdp.on("Network.responseReceived", (event) => {
      const request = semanticRequests.find((entry) => entry.requestId === event.requestId);
      if (!request) return;
      request.response = {
        status: event.response?.status ?? null,
        url: event.response?.url ?? null,
        protocol: event.response?.protocol ?? null,
        mimeType: event.response?.mimeType ?? null,
      };
    });
    cdp.on("Network.loadingFinished", (event) => {
      const request = semanticRequests.find((entry) => entry.requestId === event.requestId);
      if (request) request.loadingFinished = true;
    });
    cdp.on("Network.loadingFailed", (event) => {
      const request = semanticRequests.find((entry) => entry.requestId === event.requestId);
      if (!request) return;
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
    while (semanticRequests.length < 1 && guard < MAX_TO_FIRST_PROVIDER) {
      await stepEvidence(cdp, 1);
      await sleep(5);
      guard += 1;
    }
    if (semanticRequests.length < 1) throw new Error(`first semantic provider request did not start within ${MAX_TO_FIRST_PROVIDER} World steps`);

    const first = semanticRequests[0];
    const firstOutbound = parseJson(first.postData, "first semantic request body");
    const firstBoundary = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.firstRequestStarted = firstBoundary;

    assertReport(report, "first provider request starts only after checked-absence semantic pressure", Boolean(
      firstBoundary.scenarioId === "browser-missing-crate-live-provider"
      && firstBoundary.matterStatus === "active"
      && firstBoundary.semanticRevision === 2
      && firstBoundary.activeRunId === null
      && firstBoundary.semanticEvidenceKind === "checked_absence"
    ), firstBoundary);
    assertReport(report, "first provider envelope separates stable origin from current checked-absence evidence and exposes only resident-owned search competence", Boolean(
      firstOutbound.version === 3
      && firstOutbound.matter?.id === MATTER_ID
      && firstOutbound.originEvidence?.kind === "life_context"
      && firstOutbound.semanticEvidence?.kind === "checked_absence"
      && firstOutbound.originEvidence?.id !== firstOutbound.semanticEvidence?.id
      && Array.isArray(firstOutbound.localCapabilities)
      && firstOutbound.localCapabilities.length === 1
      && firstOutbound.localCapabilities[0]?.id === SEARCH_CAPABILITY_ID
      && !String(first.postData ?? "").includes("2752")
      && !String(first.postData ?? "").includes("player.relocator")
    ), firstOutbound);

    const firstResponse = await waitForProvider(cdp, first, 2, null);
    report.provider.requests.push(providerRecord(first, firstOutbound, firstResponse));
    assertMeasuredLunaDecision(report, "first provider returns a measured Luna search decision", first, firstOutbound, firstResponse, SEARCH_CAPABILITY_ID);
    assertReport(report, "World advances independently during first real provider flight", first.worldTicksWhileInFlight > 0, {
      worldTicksWhileInFlight: first.worldTicksWhileInFlight,
    });
    if (firstResponse.decision?.localCapabilityId !== SEARCH_CAPABILITY_ID) {
      report.qualification = "LIVE_PROVIDER_SEARCH_NOT_EXERCISED";
      assertReport(report, "full lifecycle qualifier requires Luna to select the resident-owned search competence", false, firstResponse.decision ?? null);
      return;
    }

    await sleep(50);
    const firstArrived = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.firstArrivedButNotAdmitted = firstArrived;
    assertReport(report, "first provider arrival is inert until a later resident tick", Boolean(
      firstArrived.semanticRevision === 2
      && firstArrived.activeRunId === null
      && firstArrived.semanticEvidenceKind === "checked_absence"
    ), firstArrived);

    await stepEvidence(cdp, 1);
    const searchAdmitted = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.searchAdmitted = searchAdmitted;
    assertReport(report, "first admission grounds the exact provider-selected embodied search run", Boolean(
      searchAdmitted.semanticRevision === 3
      && searchAdmitted.semanticCourse === firstResponse.decision.semanticCourse
      && searchAdmitted.activeRunId === SEARCH_RUN_ID
      && searchAdmitted.activeRunCanMutateWorld === true
      && searchAdmitted.semanticEvidenceKind === "checked_absence"
    ), searchAdmitted);

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
    assertReport(report, "search reaches legal sight reacquisition without a material-action oracle", Boolean(
      reacquired.materialKnowledge?.[0]?.currentlyVisible === true
      && samePosition(reacquired.materialKnowledge?.[0]?.lastKnownPosition, reacquired.crateLocation?.position)
      && reacquired.actionFacts.length === 0
      && reacquired.matterStatus === "active"
    ), reacquired);
    assertReport(report, "reacquisition itself does not silently start a second provider request", semanticRequests.length === 1, {
      requestCount: semanticRequests.length,
    });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-lifecycle-reacquired.png"));

    // Reacquisition is an explicit semantic boundary. Only the next World tick may
    // offer the separately grounded visible-pickup competence and start request #2.
    await stepEvidence(cdp, 1);
    await waitUntil(() => semanticRequests.length >= 2, 5_000, "second semantic provider request");
    const second = semanticRequests[1];
    const secondOutbound = parseJson(second.postData, "second semantic request body");
    const secondBoundary = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.secondRequestStarted = secondBoundary;

    assertReport(report, "second provider request preserves the same matter origin while current evidence advances to legal reacquisition", Boolean(
      secondBoundary.matterStatus === "active"
      && secondBoundary.semanticRevision === 4
      && secondBoundary.activeRunId === null
      && secondBoundary.semanticEvidenceKind === "material_reacquired"
      && secondOutbound.version === 3
      && secondOutbound.matter?.id === MATTER_ID
      && secondOutbound.matter?.semanticCourse === firstResponse.decision.semanticCourse
      && sameJson(secondOutbound.originEvidence, firstOutbound.originEvidence)
      && secondOutbound.semanticEvidence?.kind === "material_reacquired"
      && secondOutbound.semanticEvidence?.id !== firstOutbound.semanticEvidence?.id
      && Array.isArray(secondOutbound.localCapabilities)
      && secondOutbound.localCapabilities.length === 1
      && secondOutbound.localCapabilities[0]?.id === PICKUP_CAPABILITY_ID
    ), { secondBoundary, secondOutbound });

    const secondResponse = await waitForProvider(cdp, second, 4, null);
    report.provider.requests.push(providerRecord(second, secondOutbound, secondResponse));
    assertMeasuredLunaDecision(report, "second provider returns a measured Luna decision over the same continuing matter", second, secondOutbound, secondResponse, PICKUP_CAPABILITY_ID);
    assertReport(report, "World advances independently during second real provider flight", second.worldTicksWhileInFlight > 0, {
      worldTicksWhileInFlight: second.worldTicksWhileInFlight,
    });
    if (secondResponse.decision?.localCapabilityId !== PICKUP_CAPABILITY_ID) {
      report.qualification = "LIVE_PROVIDER_PICKUP_NOT_EXERCISED";
      assertReport(report, "full lifecycle qualifier requires Luna to select the resident-owned visible-pickup competence", false, secondResponse.decision ?? null);
      return;
    }

    await sleep(50);
    const secondArrived = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.secondArrivedButNotAdmitted = secondArrived;
    assertReport(report, "second provider arrival is inert until a later resident tick", Boolean(
      secondArrived.semanticRevision === 4
      && secondArrived.activeRunId === null
      && secondArrived.semanticEvidenceKind === "material_reacquired"
    ), secondArrived);

    await stepEvidence(cdp, 1);
    const pickupAdmitted = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.pickupAdmitted = pickupAdmitted;
    assertReport(report, "second admission freshly re-grounds visibility and creates an exact pickup run", Boolean(
      pickupAdmitted.semanticRevision === 5
      && pickupAdmitted.semanticCourse === secondResponse.decision.semanticCourse
      && pickupAdmitted.activeRunId === PICKUP_RUN_ID
      && pickupAdmitted.activeRunCanMutateWorld === true
      && pickupAdmitted.semanticEvidenceKind === "material_reacquired"
    ), pickupAdmitted);

    let resolved = null;
    guard = 0;
    while (!resolved && guard < MAX_TO_RESOLVE) {
      await stepEvidence(cdp, 1);
      const current = canonicalSummary(await canonicalSnapshot(cdp));
      if (current.matterStatus === "resolved" && current.activeRunId === null) resolved = current;
      guard += 1;
    }
    if (!resolved) throw new Error(`provider-grounded pickup did not resolve matter within ${MAX_TO_RESOLVE} World steps`);
    report.checkpoints.resolved = resolved;
    const pickupFact = resolved.actionFacts.find((fact) => fact.runId === PICKUP_RUN_ID && fact.action?.kind === "material_pickup") ?? null;
    assertReport(report, "matter resolves only after World confirms the provider-grounded embodied pickup", Boolean(
      resolved.semanticRevision === 5
      && resolved.crateLocation?.kind === "held"
      && resolved.crateLocation?.actorId === JANEK_ID
      && pickupFact?.resolution?.status === "resolved"
      && pickupFact?.resolution?.outcomeStatus === "succeeded"
      && pickupFact?.resolution?.code === "picked_up"
    ), { resolved, pickupFact });
    assertReport(report, "full lifecycle uses exactly two semantic provider requests", semanticRequests.length === 2, {
      requestCount: semanticRequests.length,
    });
    assertReport(report, "live-provider lifecycle has no uncaught runtime exceptions or semantic network failures", Boolean(
      report.runtimeExceptions.length === 0 && report.networkFailures.length === 0
    ), { runtimeExceptions: report.runtimeExceptions, networkFailures: report.networkFailures });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-lifecycle-resolved.png"));

    report.qualification = "LIVE_PROVIDER_TWO_BURST_MATERIAL_LIFE_PASS";
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    report.qualification ??= "HARNESS_OR_RUNTIME_FAILURE";
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.length > 0 && report.assertions.every((entry) => entry.pass) && !report.error ? "PASS" : "FAIL";
    if (report.outcome !== "PASS") process.exitCode = 1;
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function waitForProvider(cdp, request, expectedRevision, expectedRunId) {
  const deadline = Date.now() + PROVIDER_TIMEOUT_MS;
  while (!request.loadingFinished && Date.now() < deadline) {
    const before = (await canonicalSnapshot(cdp)).tick;
    await stepEvidence(cdp, 1);
    const after = await canonicalSnapshot(cdp);
    if (after.tick > before) request.worldTicksWhileInFlight += after.tick - before;
    if (after.continuity?.matter?.semanticRevision !== expectedRevision
      || (after.continuity?.matter?.activeRunId ?? null) !== expectedRunId) {
      throw new Error(`resident semantics/execution changed during provider flight: expected rev ${expectedRevision}`);
    }
    await sleep(25);
  }
  if (!request.loadingFinished || !request.response) {
    throw new Error(`provider response did not complete within ${PROVIDER_TIMEOUT_MS}ms`);
  }
  const payload = await responseBody(cdp, request.requestId);
  return parseJson(payload, "semantic response body");
}

function assertMeasuredLunaDecision(report, label, request, outbound, responseJson, capabilityId) {
  assertReport(report, label, Boolean(
    request.response?.status === 200
    && responseJson.ok === true
    && responseJson.providerRunId === outbound.providerRunId
    && typeof responseJson.decision?.semanticCourse === "string"
    && responseJson.decision.semanticCourse.trim().length > 0
    && (responseJson.decision.localCapabilityId === capabilityId || responseJson.decision.localCapabilityId === null)
    && responseJson.usage?.model === "gpt-5.6-luna"
    && Number.isSafeInteger(responseJson.usage?.inputTokens)
    && Number.isSafeInteger(responseJson.usage?.outputTokens)
    && Number.isSafeInteger(responseJson.usage?.totalTokens)
    && Number.isFinite(responseJson.usage?.elapsedMs)
    && responseJson.usage.elapsedMs >= 0
  ), {
    httpStatus: request.response?.status ?? null,
    providerRunId: responseJson.providerRunId ?? null,
    decision: responseJson.decision ?? null,
    usage: responseJson.usage ?? null,
  });
}

function providerRecord(request, outbound, responseJson) {
  return {
    requestId: request.requestId,
    url: request.url,
    providerRunId: outbound.providerRunId ?? null,
    version: outbound.version ?? null,
    matter: outbound.matter ?? null,
    originEvidence: outbound.originEvidence ?? null,
    semanticEvidence: outbound.semanticEvidence ?? null,
    localCapabilities: outbound.localCapabilities ?? null,
    worldTicksWhileInFlight: request.worldTicksWhileInFlight,
    response: {
      httpStatus: request.response?.status ?? null,
      ok: responseJson.ok ?? null,
      providerRunId: responseJson.providerRunId ?? null,
      decision: responseJson.decision ?? null,
      usage: responseJson.usage ?? null,
    },
  };
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
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? false,
    semanticEvidenceKind: snapshot.continuity?.semanticEvidence?.kind ?? null,
    semanticEvidenceId: snapshot.continuity?.semanticEvidence?.id ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    actionFacts: snapshot.causalProvenance?.residentWorldActionFacts ?? [],
  };
}

async function navigateEvidence(cdp) {
  const url = `${BASE_URL.replace(/\/$/u, "")}/?spc=1&evidence=1&scenario=missing-crate-live-provider`;
  await cdp.send("Page.navigate", { url });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 25_000, "live-provider lifecycle evidence scene");
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function responseBody(cdp, requestId) {
  await waitUntil(async () => semanticBodyAvailable(cdp, requestId), 10_000, "semantic response body");
  const result = await cdp.send("Network.getResponseBody", { requestId });
  return result.base64Encoded ? Buffer.from(result.body, "base64").toString("utf8") : result.body;
}

async function semanticBodyAvailable(cdp, requestId) {
  try {
    await cdp.send("Network.getResponseBody", { requestId }, 2_000);
    return true;
  } catch {
    return false;
  }
}

async function captureScreenshot(cdp, file) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(result.data, "base64"));
}

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
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) { lastError = error; }
    await sleep(50);
  }
  throw new Error(`timeout waiting for ${label}${lastError ? `: ${lastError}` : ""}`);
}

function parseJson(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} missing`);
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

function assertReport(report, label, pass, details) {
  report.assertions.push({ label, pass: Boolean(pass), details });
}

function samePosition(a, b, tolerance = 1e-6) {
  return Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance);
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

await run();
