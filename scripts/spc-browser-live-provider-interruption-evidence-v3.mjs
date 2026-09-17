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
const ORIGIN_EVIDENCE_ID = "evidence:janek:missing-crate:origin";
const CAPABILITY_ID = "local.material.search.remembered-workshop-area";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop.live-provider";
const MAX_TO_PROVIDER = 700;
const MAX_TO_RESUME = 120;
const MAX_TO_REACQUIRE = 900;
const PROVIDER_TIMEOUT_MS = 45_000;

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
mkdirSync(OUTPUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  const candidates = [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-live-provider-interruption-v3-`);
  const port = 12_100 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromePath, [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-component-update", "--disable-default-apps", "--disable-extensions",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`, "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  const report = {
    schemaVersion: 3,
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
      worldTicksWhileWaiting: 0,
      admissionObservedBeforeCdpResponse: false,
    },
    participant: { addressedOccurrence: null, responseOccurrence: null },
    checkpoints: {},
  };
  let semanticRequest = null;
  let semanticResponse = null;

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.connect();

    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      report.runtimeExceptions.push({ text: exceptionDetails?.text ?? null, description: exceptionDetails?.exception?.description ?? null });
    });
    cdp.on("Network.requestWillBeSent", (event) => {
      if (event.request?.method !== "POST" || !event.request?.url?.includes("/api/spc-next/semantic")) return;
      report.provider.requestCount += 1;
      semanticRequest ??= {
        requestId: event.requestId,
        url: event.request.url,
        postData: event.request.postData ?? null,
      };
    });
    cdp.on("Network.responseReceived", (event) => {
      if (!semanticRequest || event.requestId !== semanticRequest.requestId) return;
      semanticResponse = {
        requestId: event.requestId,
        status: event.response?.status ?? null,
        url: event.response?.url ?? null,
      };
    });
    cdp.on("Network.loadingFailed", (event) => {
      if (!semanticRequest || event.requestId !== semanticRequest.requestId) return;
      report.networkFailures.push({ requestId: event.requestId, errorText: event.errorText ?? null, canceled: event.canceled ?? false });
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
      originEvidence: outbound.originEvidence ?? null,
      semanticEvidence: outbound.semanticEvidence ?? null,
      localCapabilities: outbound.localCapabilities ?? null,
    };
    const requestBoundary = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.requestStarted = requestBoundary;
    assertReport(report, "live interruption starts provider only after checked absence", Boolean(
      requestBoundary.scenarioId === "browser-missing-crate-live-provider-interruption"
      && requestBoundary.matterStatus === "active"
      && requestBoundary.semanticRevision === 2
      && requestBoundary.activeRunId === null
      && requestBoundary.semanticEvidenceKind === "checked_absence"
    ), requestBoundary);
    assertReport(report, "v3 interruption request preserves stable origin, one search offer and no hidden relocated truth", Boolean(
      outbound.version === 3
      && outbound.matter?.id === MATTER_ID
      && outbound.originEvidence?.id === ORIGIN_EVIDENCE_ID
      && outbound.originEvidence?.kind === "life_context"
      && outbound.semanticEvidence?.kind === "checked_absence"
      && outbound.originEvidence?.id !== outbound.semanticEvidence?.id
      && outbound.localCapabilities?.length === 1
      && outbound.localCapabilities[0]?.id === CAPABILITY_ID
      && !String(semanticRequest.postData ?? "").includes("2752")
      && !String(semanticRequest.postData ?? "").includes("player.relocator")
    ), report.provider.request);

    // CDP Network events are an external observer and can lag behind the page that
    // received the response. If a step sees rev3 before Node has observed the response
    // event, freeze World immediately and wait for the response body. That is observer
    // lag, not evidence that provider transport itself mutated resident semantics.
    let admissionObservedFull = null;
    const providerDeadline = Date.now() + PROVIDER_TIMEOUT_MS;
    let responseJson = null;
    while (!responseJson && Date.now() < providerDeadline) {
      const body = await tryResponseBody(cdp, semanticRequest.requestId);
      if (body !== null) {
        responseJson = parseJson(body, "semantic response body");
        break;
      }

      if (!admissionObservedFull) {
        const beforeFull = await canonicalSnapshot(cdp);
        const beforeTick = beforeFull.tick;
        if (beforeFull.continuity?.matter?.semanticRevision !== 2 || beforeFull.continuity?.matter?.activeRunId !== null) {
          admissionObservedFull = beforeFull;
          report.provider.admissionObservedBeforeCdpResponse = true;
        } else {
          await stepEvidence(cdp, 1);
          const afterFull = await canonicalSnapshot(cdp);
          if (afterFull.tick > beforeTick) report.provider.worldTicksWhileWaiting += afterFull.tick - beforeTick;
          const revision = afterFull.continuity?.matter?.semanticRevision;
          const runId = afterFull.continuity?.matter?.activeRunId ?? null;
          if (revision === 2 && runId === null) {
            // Still genuinely in flight from the resident's point of view.
          } else if (revision === 3) {
            admissionObservedFull = afterFull;
            report.provider.admissionObservedBeforeCdpResponse = true;
          } else {
            throw new Error(`unexpected resident state while waiting for provider body: rev=${revision} run=${runId}`);
          }
        }
      }
      await sleep(25);
    }
    if (!responseJson) throw new Error(`provider response body did not become available within ${PROVIDER_TIMEOUT_MS}ms`);
    await waitUntil(() => semanticResponse !== null, 5_000, "CDP semantic response metadata");

    report.provider.response = {
      httpStatus: semanticResponse?.status ?? null,
      providerRunId: responseJson.providerRunId ?? null,
      ok: responseJson.ok ?? null,
      decision: responseJson.decision ?? null,
      usage: responseJson.usage ?? null,
    };
    assertReport(report, "exact candidate returns a measured Luna semantic decision", Boolean(
      semanticResponse?.status === 200
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
    ), report.provider.response);

    if (responseJson.decision?.localCapabilityId !== CAPABILITY_ID) {
      report.qualification = "LIVE_PROVIDER_INTERRUPTION_NOT_EXERCISED";
      assertReport(report, "interruption pressure test requires Luna to select the offered search competence", false, responseJson.decision ?? null);
      return;
    }
    assertReport(report, "Luna selects the resident-owned embodied search competence", true, responseJson.decision);

    let admittedFull;
    if (admissionObservedFull) {
      admittedFull = admissionObservedFull;
      report.checkpoints.admissionObservedBeforeCdpResponse = canonicalSummary(admittedFull);
    } else {
      const arrived = canonicalSummary(await canonicalSnapshot(cdp));
      report.checkpoints.arrivedButNotAdmitted = arrived;
      assertReport(report, "when observable before admission, provider arrival remains inert", Boolean(
        arrived.semanticRevision === 2 && arrived.activeRunId === null && arrived.semanticEvidenceKind === "checked_absence"
      ), arrived);
      await stepEvidence(cdp, 1);
      admittedFull = await canonicalSnapshot(cdp);
    }

    const admitted = canonicalSummary(admittedFull);
    report.checkpoints.admitted = admitted;
    const bindingBeforeInterruption = structuredClone(admittedFull.continuity?.activeRunBinding ?? null);
    assertReport(report, "provider choice is admitted as the exact live search binding before player contact", Boolean(
      admitted.semanticRevision === 3
      && admitted.semanticCourse === responseJson.decision.semanticCourse
      && admitted.activeRunId === SEARCH_RUN_ID
      && admitted.activeRunCanMutateWorld === true
      && admitted.semanticEvidenceKind === "checked_absence"
      && bindingBeforeInterruption?.runId === SEARCH_RUN_ID
    ), { admitted, bindingBeforeInterruption, observerLag: report.provider.admissionObservedBeforeCdpResponse });

    const beforeSearch = actorState(admittedFull, JANEK_ID);
    await stepEvidence(cdp, 1);
    const movingFull = await canonicalSnapshot(cdp);
    const movingJanek = actorState(movingFull, JANEK_ID);
    report.checkpoints.searchingBeforeInterruption = canonicalSummary(movingFull);
    assertReport(report, "provider-grounded search owns actual body motion before interruption", Boolean(
      beforeSearch && movingJanek
      && !samePosition(beforeSearch.position, movingJanek.position)
      && movingFull.continuity?.matter?.activeRunId === SEARCH_RUN_ID
      && movingFull.continuity?.activeRunCanMutateWorld === true
    ), { before: beforeSearch, after: movingJanek });

    const addressed = await addressResident(cdp, JANEK_ID, "Janek, chwila!");
    report.participant.addressedOccurrence = addressed;
    assertReport(report, "participant interruption enters through addressed World speech", Boolean(
      addressed?.kind === "speech"
      && addressed?.actorId === PLAYER_ID
      && addressed?.text === "Janek, chwila!"
      && addressed?.addressedActorIds?.length === 1
      && addressed.addressedActorIds[0] === JANEK_ID
    ), addressed);

    await stepEvidence(cdp, 1);
    const suspendedFull = await canonicalSnapshot(cdp);
    const suspended = canonicalSummary(suspendedFull);
    report.checkpoints.suspended = suspended;
    const addressedPercept = newestAddressedSpeechPercept(suspendedFull, PLAYER_ID, "Janek, chwila!");
    assertReport(report, "legal private hearing suspends the exact search without replacing its binding", Boolean(
      suspended.matterStatus === "suspended"
      && suspended.semanticRevision === 3
      && suspended.activeRunId === SEARCH_RUN_ID
      && suspended.activeRunCanMutateWorld === false
      && sameJson(suspendedFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
      && addressedPercept?.modality === "hearing"
      && addressedPercept?.addressed === true
    ), { suspended, binding: suspendedFull.continuity?.activeRunBinding ?? null, addressedPercept });

    await stepEvidence(cdp, 1);
    const respondedFull = await canonicalSnapshot(cdp);
    const responded = canonicalSummary(respondedFull);
    const responseOccurrence = newestSpeechOccurrence(respondedFull, JANEK_ID, "Tak?");
    report.participant.responseOccurrence = responseOccurrence;
    report.checkpoints.responded = responded;
    assertReport(report, "Janek stops and answers while own search matter stays suspended", Boolean(
      responded.matterStatus === "suspended"
      && responded.activeRunId === SEARCH_RUN_ID
      && responded.activeRunCanMutateWorld === false
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
    if (!resumedFull) throw new Error(`search did not resume within ${MAX_TO_RESUME} World steps`);
    const resumed = canonicalSummary(resumedFull);
    report.checkpoints.resumed = resumed;
    assertReport(report, "same provider-grounded binding regains World authority after contact", Boolean(
      sameJson(resumedFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
      && resumed.activeRunId === SEARCH_RUN_ID
      && resumed.activeRunCanMutateWorld === true
      && resumed.semanticRevision === 3
    ), { resumed, binding: resumedFull.continuity?.activeRunBinding ?? null });

    const resumeActor = actorState(resumedFull, JANEK_ID);
    await stepEvidence(cdp, 1);
    const afterResumeFull = await canonicalSnapshot(cdp);
    const afterResumeActor = actorState(afterResumeFull, JANEK_ID);
    assertReport(report, "resumed exact run returns Janek's body to its own search", Boolean(
      resumeActor && afterResumeActor
      && !samePosition(resumeActor.position, afterResumeActor.position)
      && afterResumeFull.continuity?.matter?.activeRunId === SEARCH_RUN_ID
      && sameJson(afterResumeFull.continuity?.activeRunBinding ?? null, bindingBeforeInterruption)
    ), { before: resumeActor, after: afterResumeActor });
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
    if (!reacquiredFull) throw new Error(`interrupted search did not reacquire crate within ${MAX_TO_REACQUIRE} World steps`);
    const reacquired = canonicalSummary(reacquiredFull);
    report.checkpoints.reacquired = reacquired;
    assertReport(report, "interrupted Luna-selected search still reaches legal sight reacquisition without action oracle", Boolean(
      reacquired.materialKnowledge?.[0]?.currentlyVisible === true
      && samePosition(reacquired.materialKnowledge?.[0]?.lastKnownPosition, reacquired.crateLocation?.position)
      && reacquired.actionFacts.length === 0
    ), reacquired);
    assertReport(report, "interruption specimen emits exactly one provider request before reacquisition", report.provider.requestCount === 1, {
      requestCount: report.provider.requestCount,
    });
    assertReport(report, "interruption specimen has no uncaught runtime exceptions or semantic network failures", Boolean(
      report.runtimeExceptions.length === 0 && report.networkFailures.length === 0
    ), { runtimeExceptions: report.runtimeExceptions, networkFailures: report.networkFailures });
    await captureScreenshot(cdp, resolve(OUTPUT_DIR, "live-provider-interruption-reacquired.png"));

    report.qualification = "LIVE_PROVIDER_INTERRUPTION_RETURN_EMBODIED_PASS";
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
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function addressResident(cdp, residentId, text) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(residentId)}, ${JSON.stringify(text)})`);
}

async function tryResponseBody(cdp, requestId) {
  try {
    const result = await cdp.send("Network.getResponseBody", { requestId }, 2_000);
    return result.base64Encoded ? Buffer.from(result.body, "base64").toString("utf8") : result.body;
  } catch {
    return null;
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
