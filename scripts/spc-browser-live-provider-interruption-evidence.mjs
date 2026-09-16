import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_OUTPUT ?? "evidence/live-provider/live-provider-interruption.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const CAPABILITY_ID = "local.material.search.remembered-workshop-area";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const MAX_TO_PROVIDER = 700;
const MAX_TO_RESUME = 120;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-live-provider-interruption-`);
  const port = 12_100 + Math.floor(Math.random() * 300);
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
      requestCount: 0,
      request: null,
      response: null,
      worldTicksWhileInFlight: 0,
    },
    participant: {
      addressedOccurrence: null,
      responseOccurrence: null,
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
      report.provider.requestCount += 1;
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

    assertReport(report, "live interruption browser starts provider only after checked-absence semantic pressure", Boolean(
      requestBoundary.scenarioId === "browser-missing-crate-live-provider-interruption"
      && requestBoundary.matterStatus === "active"
      && requestBoundary.semanticRevision === 2
      && requestBoundary.activeRunId === null
      && requestBoundary.semanticEvidenceKind === "checked_absence"
    ), requestBoundary);
    assertReport(report, "provider request exposes one resident-owned bounded search capability and no hidden relocated truth", Boolean(
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

    assertReport(report, "exact Cloudflare candidate returns a measured Luna semantic decision", Boolean(
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
    assertReport(report, "World advances independently while real provider is in flight", report.provider.worldTicksWhileInFlight > 0, {
      worldTicksWhileInFlight: report.provider.worldTicksWhileInFlight,
    });

    if (responseJson.decision?.localCapabilityId !== CAPABILITY_ID) {
      assertReport(report, "interruption qualifier requires Luna to select the offered embodied search capability", false, {
        selectedCapabilityId: responseJson.decision?.localCapabilityId ?? null,
      });
      report.qualification = "LIVE_PROVIDER_INTERRUPTION_NOT_EXERCISED";
      report.finishedAt = new Date().toISOString();
      report.outcome = "FAIL";
      process.exitCode = 1;
      return;
    }
    assertReport(report, "Luna selects the offered embodied search capability for the interruption pressure test", true, {
      selectedCapabilityId: responseJson.decision.localCapabilityId,
    });

    await sleep(50);
    const arrived = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.arrivedButNotAdmitted = arrived;
    assertReport(report, "provider arrival is inert until a later resident/World tick admits it", Boolean(
      arrived.semanticRevision === 2
      && arrived.activeRunId === null
      && arrived.semanticEvidenceKind === "checked_absence"
    ), arrived);

    await stepEvidence(cdp, 1);
    const admittedFull = await canonicalSnapshot(cdp);
    const admitted = canonicalSummary(admittedFull);
    report.checkpoints.admitted = admitted;
    const bindingBeforeInterruption = structuredClone(admittedFull.continuity?.activeRunBinding ?? null);
    assertReport(report, "next resident tick admits Luna meaning and grounds the exact live search run", Boolean(
      admitted.semanticRevision === 3
      && admitted.semanticCourse === responseJson.decision.semanticCourse
      && admitted.activeRunId === SEARCH_RUN_ID
      && admitted.activeRunCanMutateWorld === true
      && admitted.semanticEvidenceKind === "checked_absence"
      && bindingBeforeInterruption?.runId === SEARCH_RUN_ID
    ), { admitted, bindingBeforeInterruption });

    const beforeSearch = actorState(admittedFull, JANEK_ID);
    await stepEvidence(cdp, 1);
    const movingFull = await canonicalSnapshot(cdp);
    const moving = canonicalSummary(movingFull);
    const movingJanek = actorState(movingFull, JANEK_ID);
    report.checkpoints.searchingBeforeInterruption = moving;
    assertReport(report, "provider-grounded search owns actual body motion before interruption", Boolean(
      beforeSearch && movingJanek
      && !samePosition(beforeSearch.position, movingJanek.position)
      && moving.activeRunId === SEARCH_RUN_ID
      && moving.activeRunCanMutateWorld === true
    ), { before: beforeSearch, after: movingJanek, moving });

    const addressed = await addressResident(cdp, JANEK_ID, "Janek, chwila!");
    report.participant.addressedOccurrence = addressed;
    const calledFull = await canonicalSnapshot(cdp);
    report.checkpoints.playerCalled = canonicalSummary(calledFull);
    assertReport(report, "participant interruption enters through an addressed World speech occurrence", Boolean(
      addressed?.kind === "speech"
      && addressed?.actorId === PLAYER_ID
      && addressed?.text === "Janek, chwila!"
      && Array.isArray(addressed?.addressedActorIds)
      && addressed.addressedActorIds.length === 1
      && addressed.addressedActorIds[0] === JANEK_ID
    ), addressed);

    await stepEvidence(cdp, 1);
    const suspendedFull = await canonicalSnapshot(cdp);
    const suspended = canonicalSummary(suspendedFull);
    report.checkpoints.suspended = suspended;
    const addressedPercept = newestAddressedSpeechPercept(suspendedFull, PLAYER_ID, "Janek, chwila!");
    assertReport(report, "legal private hearing suspends the exact live search without replacing its binding", Boolean(
      suspended.matterStatus === "suspended"
      && suspended.semanticRevision === 3
      && suspended.activeRunId === SEARCH_RUN_ID
      && suspended.activeRunCanMutateWorld === false
      && sameJson(suspendedFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
      && addressedPercept?.phenomenon === "speech"
      && addressedPercept?.modality === "hearing"
      && addressedPercept?.addressed === true
    ), { suspended, activeRunBinding: suspendedFull.continuity?.activeRunBinding ?? null, addressedPercept });

    await stepEvidence(cdp, 1);
    const respondedFull = await canonicalSnapshot(cdp);
    const responded = canonicalSummary(respondedFull);
    const responseOccurrence = newestSpeechOccurrence(respondedFull, JANEK_ID, "Tak?");
    report.participant.responseOccurrence = responseOccurrence;
    report.checkpoints.responded = responded;
    assertReport(report, "Janek locally stops, turns through resident authority and answers the addressed player while own matter stays suspended", Boolean(
      responded.matterStatus === "suspended"
      && responded.activeRunId === SEARCH_RUN_ID
      && responded.activeRunCanMutateWorld === false
      && responseOccurrence?.kind === "speech"
      && responseOccurrence?.actorId === JANEK_ID
      && responseOccurrence?.text === "Tak?"
      && responseOccurrence?.addressedActorIds?.includes(PLAYER_ID)
      && Math.hypot(actorState(respondedFull, JANEK_ID)?.velocity?.x ?? 0, actorState(respondedFull, JANEK_ID)?.velocity?.y ?? 0) < 1e-9
    ), { responded, responseOccurrence, actor: actorState(respondedFull, JANEK_ID) });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-interruption-response.png"));

    let resumedFull = null;
    guard = 0;
    while (!resumedFull && guard < MAX_TO_RESUME) {
      await stepEvidence(cdp, 1);
      const current = await canonicalSnapshot(cdp);
      if (current.continuity?.matter?.status === "active"
        && current.continuity?.matter?.semanticRevision === 3
        && current.continuity?.matter?.activeRunId === SEARCH_RUN_ID
        && current.continuity?.activeRunCanMutateWorld === true) resumedFull = current;
      guard += 1;
    }
    if (!resumedFull) throw new Error(`provider-grounded search did not resume within ${MAX_TO_RESUME} World steps`);
    const resumed = canonicalSummary(resumedFull);
    report.checkpoints.resumed = resumed;
    assertReport(report, "same provider-grounded search binding regains World authority after bounded player contact", Boolean(
      sameJson(resumedFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
      && resumed.activeRunId === SEARCH_RUN_ID
      && resumed.activeRunCanMutateWorld === true
      && resumed.semanticRevision === 3
    ), { resumed, activeRunBinding: resumedFull.continuity?.activeRunBinding ?? null });

    const resumeActor = actorState(resumedFull, JANEK_ID);
    await stepEvidence(cdp, 1);
    const afterResumeFull = await canonicalSnapshot(cdp);
    const afterResumeActor = actorState(afterResumeFull, JANEK_ID);
    report.checkpoints.movingAfterResume = canonicalSummary(afterResumeFull);
    assertReport(report, "the resumed exact run returns Janek's body to its own search rather than manufacturing a replacement plan", Boolean(
      resumeActor && afterResumeActor
      && !samePosition(resumeActor.position, afterResumeActor.position)
      && afterResumeFull.continuity?.matter?.activeRunId === SEARCH_RUN_ID
      && sameJson(afterResumeFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
    ), { before: resumeActor, after: afterResumeActor, binding: afterResumeFull.continuity?.activeRunBinding ?? null });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-interruption-resumed.png"));

    let reacquiredFull = null;
    guard = 0;
    while (!reacquiredFull && guard < MAX_TO_REACQUIRE) {
      await stepEvidence(cdp, 1);
      const current = await canonicalSnapshot(cdp);
      if (current.continuity?.matter?.semanticRevision === 4
        && current.continuity?.matter?.activeRunId === null
        && current.continuity?.semanticEvidence?.kind === "material_reacquired") reacquiredFull = current;
      guard += 1;
    }
    if (!reacquiredFull) throw new Error(`interrupted real-provider search did not reacquire crate within ${MAX_TO_REACQUIRE} World steps`);
    const reacquired = canonicalSummary(reacquiredFull);
    report.checkpoints.reacquired = reacquired;
    assertReport(report, "interrupted real Luna choice still reaches legal embodied sight reacquisition without material-action oracle", Boolean(
      reacquired.materialKnowledge?.[0]?.currentlyVisible === true
      && samePosition(reacquired.materialKnowledge?.[0]?.lastKnownPosition, reacquired.crateLocation?.position)
      && reacquired.actionFacts.length === 0
    ), reacquired);
    assertReport(report, "one participant interruption does not cause a second semantic provider request", report.provider.requestCount === 1, {
      requestCount: report.provider.requestCount,
    });
    assertReport(report, "live-provider interruption specimen has no uncaught runtime exceptions or semantic network failures", Boolean(
      report.runtimeExceptions.length === 0 && report.networkFailures.length === 0
    ), { runtimeExceptions: report.runtimeExceptions, networkFailures: report.networkFailures });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-interruption-reacquired.png"));

    report.qualification = "LIVE_PROVIDER_INTERRUPTION_RETURN_EMBODIED_PASS";
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    if (report.outcome !== "PASS") process.exitCode = 1;
  } catch (error) {
    report.finishedAt = new Date().toISOString();
    report.outcome = "HARNESS_ERROR";
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    process.exitCode = 1;
  } finally {
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
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
    suspendedByMatterId: snapshot.continuity?.matter?.suspendedByMatterId ?? null,
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? false,
    activeRunBinding: snapshot.continuity?.activeRunBinding ?? null,
    semanticEvidenceKind: snapshot.continuity?.semanticEvidence?.kind ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    actionFacts: snapshot.causalProvenance?.residentWorldActionFacts ?? [],
  };
}

function actorState(snapshot, actorId) {
  return snapshot.authoritativeWorld?.actors?.find((actor) => actor.id === actorId) ?? null;
}

function newestAddressedSpeechPercept(snapshot, actorId, text) {
  const percepts = snapshot.residentPrivate?.diagnostics?.recentPercepts ?? [];
  for (let index = percepts.length - 1; index >= 0; index -= 1) {
    const percept = percepts[index];
    if (percept?.phenomenon === "speech" && percept?.actorId === actorId && percept?.text === text && percept?.addressed === true) return percept;
  }
  return null;
}

function newestSpeechOccurrence(snapshot, actorId, text) {
  const occurrences = snapshot.authoritativeWorld?.recentOccurrences ?? [];
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index];
    if (occurrence?.kind === "speech" && occurrence?.actorId === actorId && occurrence?.text === text) return occurrence;
  }
  return null;
}

async function navigateEvidence(cdp) {
  const url = `${BASE_URL.replace(/\/$/u, "")}/?spc=1&evidence=1&scenario=missing-crate-live-provider-interruption`;
  await cdp.send("Page.navigate", { url });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 25_000, "live-provider interruption evidence scene");
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.canonicalSnapshot()`);
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function addressResident(cdp, residentId, text) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(residentId)}, ${JSON.stringify(text)})`);
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
  const response = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Runtime.evaluate failed");
  }
  return response.result?.value;
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
  throw new Error(`Timed out waiting for ${url}${lastError ? `: ${lastError}` : ""}`);
}

async function waitUntil(predicate, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      if (await predicate()) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError}` : ""}`);
}

function parseJson(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} missing`);
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
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
