import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.ZERO_PROVIDER_LOCAL_LIFE_OUTPUT ?? "evidence/browser/zero-provider-local-life.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const MIRA_ID = "resident.mira";
const PLAYER_ID = "player.jozz";
const MATTER_ID = "matter.mira.local-life.restore-basket";
const PLACE_RUN_ID = "run.mira.local-life.place-basket";
const OBJECT_ID = "basket.workshop.local-life";
const DESTINATION = { x: 1080, y: 500 };
const MID_CALL = "Mira, chwila!";
const LATE_CALL = "Mira?";
const MAX_TO_DELIVERY = 300;
const MAX_TO_SETTLED = 1000;
const MAX_TO_RETURN = 80;
const QUIET_TICKS = 3600;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r1-local-life-`);
  const port = 12_300 + Math.floor(Math.random() * 300);
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
    networkRequests: [],
    providerLikeRequests: [],
    runs: [],
    visualEvidence: null,
  };

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
    cdp.on("Network.requestWillBeSent", ({ request }) => {
      const url = request?.url ?? "";
      report.networkRequests.push(url);
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
    assert(report, "R1 real browser exposes the exact zero-provider local-life scenario", Boolean(
      first?.initial?.scenarioId === "browser-zero-provider-local-life"
      && first.initial.matterStatus === "active"
      && first.initial.matterId === MATTER_ID
    ), first?.initial ?? null);

    assert(report, "Mira performs factual material delivery under exact local run authority before contact", Boolean(
      first?.moving?.activeRunId === PLACE_RUN_ID
      && first.moving.activeRunCanMutateWorld === true
      && vectorMagnitude(first.moving.miraVelocity) > 0.01
      && first.moving.objectLocation?.kind === "held"
      && first.moving.objectLocation?.actorId === MIRA_ID
    ), first?.moving ?? null);

    const heardDirection = first?.interrupted?.addressedPercept?.spatial?.kind === "directional"
      ? first.interrupted.addressedPercept.spatial.direction
      : null;
    assert(report, "addressed participant speech becomes private directional evidence and suspends the exact material run", Boolean(
      first?.interrupted?.matterStatus === "suspended"
      && first.interrupted.activeRunId === PLACE_RUN_ID
      && first.interrupted.activeRunCanMutateWorld === false
      && first.interrupted.addressedPercept?.occurrenceId === first.midCall?.id
      && first.interrupted.addressedPercept?.actorId === PLAYER_ID
      && first.interrupted.addressedPercept?.addressed === true
      && Boolean(heardDirection)
    ), { call: first?.midCall ?? null, interrupted: first?.interrupted ?? null });

    assert(report, "local contact stops Mira, turns from private hearing evidence and emits factual Tak? without semantically resolving the original speech", Boolean(
      first?.responded?.matterStatus === "suspended"
      && samePosition(first.responded.miraPosition, first.interrupted.miraPosition)
      && vectorMagnitude(first.responded.miraVelocity) < 1e-9
      && sameDirection(first.responded.miraFacing, heardDirection)
      && first.responded.responseOccurrence?.kind === "speech"
      && first.responded.responseOccurrence?.actorId === MIRA_ID
      && first.responded.responseOccurrence?.text === "Tak?"
      && first.responded.responseOccurrence?.addressedActorIds?.includes(PLAYER_ID)
      && first.responded.pendingCognitionReasonCount >= first.interrupted.pendingCognitionReasonCount
    ), first?.responded ?? null);

    assert(report, "the exact material run regains authority and embodied motion after bounded contact", Boolean(
      first?.resumed?.matterStatus === "active"
      && first.resumed.activeRunId === PLACE_RUN_ID
      && first.resumed.activeRunCanMutateWorld === true
      && first.afterResumeMotion?.activeRunId === PLACE_RUN_ID
      && first.afterResumeMotion.activeRunCanMutateWorld === true
      && distance(first.afterResumeMotion.miraPosition, first.resumed.miraPosition) > 0.01
      && vectorMagnitude(first.afterResumeMotion.miraVelocity) > 0.01
    ), { resumed: first?.resumed ?? null, afterResumeMotion: first?.afterResumeMotion ?? null });

    assert(report, "Mira reaches the original factual basket consequence after the interruption", Boolean(
      first?.settled?.matterStatus === "resolved"
      && first.settled.activeRunId === null
      && first.settled.objectLocation?.kind === "free"
      && nearPosition(first.settled.objectLocation.position, DESTINATION)
      && first.settled.actionFacts?.some((fact) => fact.runId === PLACE_RUN_ID && fact.code === "placed")
    ), first?.settled ?? null);

    assert(report, "3,600-tick quiet window is physically stable and does not amplify unresolved cognition pressure", Boolean(
      first?.quiet?.ticks === QUIET_TICKS
      && samePosition(first.quiet.before.miraPosition, first.quiet.after.miraPosition)
      && stableJson(first.quiet.before.objectLocation) === stableJson(first.quiet.after.objectLocation)
      && first.quiet.before.pendingCognitionReasonCount === first.quiet.after.pendingCognitionReasonCount
      && first.quiet.before.matterStatus === "resolved"
      && first.quiet.after.matterStatus === "resolved"
      && first.quiet.after.activeRunId === null
    ), first?.quiet ?? null);

    assert(report, "a new physically hearable addressed contact wakes quiet Mira locally without resurrecting the resolved basket matter", Boolean(
      first?.quietWake?.matterStatus === "resolved"
      && first.quietWake.activeRunId === null
      && first.quietWake.addressedPercept?.occurrenceId === first.lateCall?.id
      && first.quietWake.pendingCognitionReasonCount > first.quiet.before.pendingCognitionReasonCount
      && first.quietResponse?.responseOccurrence?.kind === "speech"
      && first.quietResponse.responseOccurrence?.text === "Tak?"
      && samePosition(first.quietResponse.miraPosition, first.quiet.before.miraPosition)
      && first.quietReturned?.matterStatus === "resolved"
      && first.quietReturned.activeRunId === null
      && first.quietReturned.pendingCognitionReasonCount === first.quietWake.pendingCognitionReasonCount
    ), {
      lateCall: first?.lateCall ?? null,
      quietWake: first?.quietWake ?? null,
      quietResponse: first?.quietResponse ?? null,
      quietReturned: first?.quietReturned ?? null,
    });

    for (const key of ["movingHash", "interruptedHash", "respondedHash", "settledHash", "quietHash", "quietReturnedHash"]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(report, `${key} is deterministic across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }

    assert(report, "zero-provider browser specimen makes no provider/API request", report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "zero-provider browser specimen has no uncaught runtime exception", report.runtimeExceptions.length === 0, report.runtimeExceptions);
    assert(report, "R1 visual checkpoints are non-empty and screenshot capture is canonically read-only", Boolean(
      first?.visualEvidence?.moving?.bytes > 10_000
      && first.visualEvidence?.responded?.bytes > 10_000
      && first.visualEvidence?.settledQuiet?.bytes > 10_000
      && first.visualEvidence?.quietWake?.bytes > 10_000
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
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function captureRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  if (runIndex === 0) await focusMiraWorldOnly(cdp);

  let canonical = await canonicalSnapshot(cdp);
  let frame = await evidenceSnapshot(cdp);
  const initial = summarize(canonical, frame);
  const visualEvidence = runIndex === 0 ? {} : null;

  let guard = 0;
  let moving = null;
  while (!moving && guard < MAX_TO_DELIVERY) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame);
    if (current.matterStatus === "active"
      && current.activeRunId === PLACE_RUN_ID
      && current.activeRunCanMutateWorld === true
      && current.objectLocation?.kind === "held"
      && vectorMagnitude(current.miraVelocity) > 0.01) {
      moving = current;
    }
    guard += 1;
  }
  if (!moving) throw new Error(`run ${runIndex}: active moving delivery not reached`);
  if (visualEvidence) visualEvidence.moving = await captureFrozenScreenshot(cdp, "r1-local-life-01-moving-basket.png", canonical);

  const midCall = await evaluate(cdp, `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(MIRA_ID)}, ${JSON.stringify(MID_CALL)})`);
  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const interrupted = summarize(canonical, frame, midCall.id);
  if (interrupted.matterStatus !== "suspended") throw new Error(`run ${runIndex}: mid-task call did not suspend basket matter`);

  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const responded = summarize(canonical, frame, midCall.id);
  if (!responded.responseOccurrence) throw new Error(`run ${runIndex}: Mira emitted no local response`);
  if (visualEvidence) visualEvidence.responded = await captureFrozenScreenshot(cdp, "r1-local-life-02-responded.png", canonical);

  let resumed = null;
  guard = 0;
  while (!resumed && guard < MAX_TO_RETURN) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame, midCall.id);
    if (current.matterStatus === "active"
      && current.activeRunId === PLACE_RUN_ID
      && current.activeRunCanMutateWorld === true) {
      resumed = current;
    }
    guard += 1;
  }
  if (!resumed) throw new Error(`run ${runIndex}: exact basket run did not resume`);

  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const afterResumeMotion = summarize(canonical, frame, midCall.id);
  if (vectorMagnitude(afterResumeMotion.miraVelocity) <= 0.01) {
    throw new Error(`run ${runIndex}: resumed basket delivery did not regain motion`);
  }

  let settled = null;
  guard = 0;
  while (!settled && guard < MAX_TO_SETTLED) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame, midCall.id);
    if (current.matterStatus === "resolved"
      && current.objectLocation?.kind === "free"
      && nearPosition(current.objectLocation.position, DESTINATION)) {
      settled = current;
    }
    guard += 1;
  }
  if (!settled) throw new Error(`run ${runIndex}: basket matter did not settle`);
  if (visualEvidence) visualEvidence.settledQuiet = await captureFrozenScreenshot(cdp, "r1-local-life-03-settled-quiet.png", canonical);

  const quietBeforeCanonical = canonical;
  const quietBefore = summarize(quietBeforeCanonical, frame);
  frame = await stepEvidence(cdp, QUIET_TICKS);
  canonical = await canonicalSnapshot(cdp);
  const quietAfter = summarize(canonical, frame);
  const quiet = {
    ticks: QUIET_TICKS,
    before: quietBefore,
    after: quietAfter,
  };

  const lateCall = await evaluate(cdp, `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(MIRA_ID)}, ${JSON.stringify(LATE_CALL)})`);
  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const quietWake = summarize(canonical, frame, lateCall.id);

  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const quietResponse = summarize(canonical, frame, lateCall.id);
  if (visualEvidence) visualEvidence.quietWake = await captureFrozenScreenshot(cdp, "r1-local-life-04-quiet-wake.png", canonical);

  let quietReturned = null;
  guard = 0;
  while (!quietReturned && guard < MAX_TO_RETURN) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame, lateCall.id);
    const hasLateResponse = Boolean(current.responseOccurrence);
    if (current.matterStatus === "resolved"
      && current.activeRunId === null
      && hasLateResponse
      && current.pendingCognitionReasonCount === quietWake.pendingCognitionReasonCount
      && guard >= 12) {
      quietReturned = current;
    }
    guard += 1;
  }
  if (!quietReturned) throw new Error(`run ${runIndex}: quiet local contact did not return to stable resolved state`);

  return {
    runIndex,
    initial,
    moving,
    midCall,
    interrupted,
    responded,
    resumed,
    afterResumeMotion,
    settled,
    quiet,
    lateCall,
    quietWake,
    quietResponse,
    quietReturned,
    movingHash: hashJson(projectDeterministic(moving)),
    interruptedHash: hashJson(projectDeterministic(interrupted)),
    respondedHash: hashJson(projectDeterministic(responded)),
    settledHash: hashJson(projectDeterministic(settled)),
    quietHash: hashJson(projectDeterministic(quiet)),
    quietReturnedHash: hashJson(projectDeterministic(quietReturned)),
    visualEvidence,
  };
}

function summarize(canonical, frame, callId = null) {
  const matter = canonical.continuity?.matter ?? null;
  const object = canonical.authoritativeWorld?.materialObjects?.find((entry) => entry.id === OBJECT_ID) ?? null;
  const mira = canonical.authoritativeWorld?.actors?.find((actor) => actor.id === MIRA_ID) ?? null;
  const percepts = canonical.residentPrivate?.diagnostics?.recentPercepts ?? [];
  const occurrences = canonical.authoritativeWorld?.recentOccurrences ?? [];
  const addressedPercept = callId
    ? [...percepts].reverse().find((percept) => percept.occurrenceId === callId) ?? null
    : null;
  const responseOccurrence = [...occurrences].reverse().find((occurrence) =>
    occurrence.actorId === MIRA_ID
      && occurrence.kind === "speech"
      && occurrence.text === "Tak?"
  ) ?? null;

  return {
    scenarioId: canonical.scenarioId ?? null,
    tick: canonical.tick ?? null,
    matterId: matter?.id ?? null,
    matterStatus: matter?.status ?? null,
    activeRunId: matter?.activeRunId ?? null,
    activeRunCanMutateWorld: canonical.continuity?.activeRunCanMutateWorld ?? null,
    miraPosition: mira?.position ?? null,
    miraVelocity: mira?.velocity ?? null,
    miraFacing: mira?.facing ?? null,
    objectLocation: object?.location ?? null,
    pendingCognitionReasonCount: canonical.residentPrivate?.diagnostics?.publicState?.pendingCognitionReasonCount ?? null,
    addressedPercept,
    responseOccurrence,
    actionFacts: (canonical.causalProvenance?.residentWorldActionFacts ?? []).map((fact) => ({
      tick: fact.tick,
      runId: fact.runId,
      kind: fact.action?.kind ?? null,
      objectId: fact.action?.objectId ?? null,
      outcomeStatus: fact.resolution?.outcomeStatus ?? fact.resolution?.status ?? null,
      code: fact.resolution?.code ?? fact.resolution?.reason ?? null,
    })),
    framePendingCognitionReasonCount: frame?.selectedDiagnostics?.publicState?.pendingCognitionReasonCount ?? null,
    livingDiagnostics: frame?.livingDiagnostics ?? null,
  };
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

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=zero-provider-local-life` });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.() && typeof window.__SPC_EVIDENCE__?.addressResident === "function" && document.querySelector("canvas"))`,
  ), 20_000, "R1 zero-provider evidence scene");
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
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const bytes = Buffer.from(data, "base64");
  writeFileSync(resolve(OUTPUT_DIR, fileName), bytes);
  const after = await canonicalSnapshot(cdp);
  if (beforeHash !== hashJson(after)) throw new Error(`screenshot ${fileName} mutated canonical World state`);
  return { fileName, tick: canonicalBefore.tick, bytes: bytes.length, canonicalHash: beforeHash };
}

async function evidenceSnapshot(cdp) { return await evaluate(cdp, `window.__SPC_EVIDENCE__.snapshot()`); }
async function canonicalSnapshot(cdp) { return await evaluate(cdp, `window.__SPC_EVIDENCE__.canonicalSnapshot()`); }
async function stepEvidence(cdp, steps) { return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`, 30_000); }

async function evaluate(cdp, expression, timeoutMs = 30_000) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
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

function hashJson(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function samePosition(a, b, tolerance = 1e-9) {
  return Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance);
}
function nearPosition(a, b, tolerance = 1e-9) { return samePosition(a, b, tolerance); }
function distance(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY;
}
function vectorMagnitude(value) {
  return value ? Math.hypot(value.x, value.y) : Number.POSITIVE_INFINITY;
}
function sameDirection(a, b, tolerance = 1e-6) {
  return Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance);
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
