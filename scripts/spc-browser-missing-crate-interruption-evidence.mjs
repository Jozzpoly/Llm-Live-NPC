import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.MISSING_CRATE_INTERRUPTION_OUTPUT ?? "evidence/browser/missing-crate-interruption.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const REPEAT_COUNT = 3;
const MAX_TO_SEARCH = 900;
const MAX_TO_RESUME = 80;
const MAX_TO_RESOLVED = 1_500;
const JANEK_ID = "resident.janek";
const PLAYER_ID = "player.jozz";
const CRATE_ID = "crate.workshop.01";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate";
const CALL_TEXT = "Janek, chwila!";

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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-missing-crate-interruption-`);
  const port = 11_650 + Math.floor(Math.random() * 300);
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
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    for (let runIndex = 0; runIndex < REPEAT_COUNT; runIndex += 1) {
      report.runs.push(await captureInterruptionRun(cdp, runIndex));
    }
    report.visualEvidence = report.runs[0]?.visualEvidence ?? null;

    const first = report.runs[0];
    assert(report, "player action becomes Janek private addressed speech evidence before interruption authority changes", Boolean(
      first?.interrupted?.scenarioId === "browser-missing-crate-interruption"
      && first.interrupted.matterStatus === "suspended"
      && first.interrupted.semanticRevision === 3
      && first.interrupted.activeRunId === SEARCH_RUN_ID
      && first.interrupted.activeRunCanMutateWorld === false
      && first.interrupted.addressedPercept?.occurrenceId === first.call?.id
      && first.interrupted.addressedPercept?.actorId === PLAYER_ID
      && first.interrupted.addressedPercept?.text === CALL_TEXT
      && first.interrupted.addressedPercept?.addressed === true
    ), { call: first?.call ?? null, interrupted: first?.interrupted ?? null });

    assert(report, "Janek visibly answers through a public World speech occurrence while the search remains suspended", Boolean(
      first?.responded?.matterStatus === "suspended"
      && first.responded.semanticRevision === 3
      && first.responded.activeRunId === SEARCH_RUN_ID
      && first.responded.janekPosition
      && samePosition(first.responded.janekPosition, first.interrupted.janekPosition)
      && first.responded.responseOccurrence?.kind === "speech"
      && first.responded.responseOccurrence?.actorId === JANEK_ID
      && first.responded.responseOccurrence?.text === "Tak?"
      && first.responded.responseOccurrence?.addressedActorIds?.includes(PLAYER_ID)
    ), first?.responded ?? null);

    assert(report, "bounded interruption keeps Janek physically still and preserves the exact search semantic revision and run id", Boolean(
      first?.holdInvariant?.positionStable === true
      && first.holdInvariant.semanticRevisionStable === true
      && first.holdInvariant.runIdStable === true
      && first.holdInvariant.authorityDeniedThroughout === true
    ), first?.holdInvariant ?? null);

    assert(report, "the same search run regains authority and physical motion after the player-contact matter ends", Boolean(
      first?.resumed?.matterStatus === "active"
      && first.resumed.semanticRevision === 3
      && first.resumed.activeRunId === SEARCH_RUN_ID
      && first.resumed.activeRunCanMutateWorld === true
      && first.afterResumeMotion?.activeRunId === SEARCH_RUN_ID
      && first.afterResumeMotion?.activeRunCanMutateWorld === true
      && distance(first.afterResumeMotion.janekPosition, first.resumed.janekPosition) > 0.01
    ), { resumed: first?.resumed ?? null, afterResumeMotion: first?.afterResumeMotion ?? null });

    assert(report, "after returning to its own search Janek still reaches the original factual pickup consequence", Boolean(
      first?.resolved?.matterStatus === "resolved"
      && first.resolved.semanticRevision === 5
      && first.resolved.activeRunId === null
      && first.resolved.crateLocation?.kind === "held"
      && first.resolved.crateLocation?.actorId === JANEK_ID
      && first.resolved.actionFacts?.length === 1
      && first.resolved.actionFacts[0]?.runId === PICKUP_RUN_ID
      && first.resolved.actionFacts[0]?.code === "picked_up"
    ), first?.resolved ?? null);

    for (const checkpoint of ["interruptedHash", "respondedHash", "resumedHash", "resolvedHash"]) {
      const hashes = report.runs.map((entry) => entry[checkpoint]);
      assert(report, `${checkpoint} is reproducible across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }
    assert(report, "interruption participant frames are non-empty and snapshot capture is canonically read-only", Boolean(
      first?.visualEvidence?.searching?.bytes > 10_000
      && first.visualEvidence?.responded?.bytes > 10_000
      && first.visualEvidence?.resumed?.bytes > 10_000
      && first.visualEvidence?.resolved?.bytes > 10_000
    ), first?.visualEvidence ?? null);
    assert(report, "interruption browser specimen has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

async function captureInterruptionRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  if (runIndex === 0) await focusJanekWorldOnly(cdp);

  let canonical = await canonicalSnapshot(cdp);
  let frame = await evidenceSnapshot(cdp);
  let guard = 0;
  while (!isActiveSearch(canonical) && guard < MAX_TO_SEARCH) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    guard += 1;
  }
  if (!isActiveSearch(canonical)) throw new Error(`run ${runIndex}: active search not reached`);

  // Advance one embodied search tick so the pre-interruption frame proves Janek was
  // actually moving under the exact search run before the participant acted.
  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const searching = summarize(canonical, frame);
  const visualEvidence = runIndex === 0 ? {} : null;
  if (visualEvidence) visualEvidence.searching = await captureFrozenScreenshot(cdp, "missing-crate-interruption-01-searching.png", canonical);

  const call = await evaluate(cdp, `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(JANEK_ID)}, ${JSON.stringify(CALL_TEXT)})`);
  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const interrupted = summarize(canonical, frame, call.id);
  if (interrupted.matterStatus !== "suspended") throw new Error(`run ${runIndex}: addressed call did not suspend search`);

  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const responded = summarize(canonical, frame, call.id);
  if (!responded.responseOccurrence) throw new Error(`run ${runIndex}: Janek did not emit a response occurrence`);
  if (visualEvidence) visualEvidence.responded = await captureFrozenScreenshot(cdp, "missing-crate-interruption-02-responded.png", canonical);

  const holdPosition = { ...responded.janekPosition };
  const holdInvariant = {
    positionStable: true,
    semanticRevisionStable: true,
    runIdStable: true,
    authorityDeniedThroughout: true,
    samples: 0,
  };
  let resumed = null;
  for (let index = 0; index < MAX_TO_RESUME; index += 1) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame, call.id);
    if (current.matterStatus === "active" && current.semanticRevision === 3 && current.activeRunId === SEARCH_RUN_ID) {
      resumed = current;
      break;
    }
    holdInvariant.samples += 1;
    holdInvariant.positionStable &&= samePosition(current.janekPosition, holdPosition);
    holdInvariant.semanticRevisionStable &&= current.semanticRevision === 3;
    holdInvariant.runIdStable &&= current.activeRunId === SEARCH_RUN_ID;
    holdInvariant.authorityDeniedThroughout &&= current.activeRunCanMutateWorld === false;
  }
  if (!resumed) throw new Error(`run ${runIndex}: search did not resume within ${MAX_TO_RESUME} ticks`);
  if (visualEvidence) visualEvidence.resumed = await captureFrozenScreenshot(cdp, "missing-crate-interruption-03-resumed.png", canonical);

  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const afterResumeMotion = summarize(canonical, frame, call.id);

  let resolved = null;
  guard = 0;
  while (!resolved && guard < MAX_TO_RESOLVED) {
    frame = await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    if (canonical.continuity?.matter?.status === "resolved") resolved = summarize(canonical, frame, call.id);
    guard += 1;
  }
  if (!resolved) throw new Error(`run ${runIndex}: original matter did not resolve after return`);
  if (visualEvidence) visualEvidence.resolved = await captureFrozenScreenshot(cdp, "missing-crate-interruption-04-resolved.png", canonical);

  return {
    runIndex,
    call,
    searching,
    interrupted,
    responded,
    holdInvariant,
    resumed,
    afterResumeMotion,
    resolved,
    interruptedHash: hashJson(interrupted),
    respondedHash: hashJson(responded),
    resumedHash: hashJson(resumed),
    resolvedHash: hashJson(resolved),
    visualEvidence,
  };
}

function isActiveSearch(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 3
    && snapshot.continuity.matter.activeRunId === SEARCH_RUN_ID
    && snapshot.continuity.activeRunCanMutateWorld === true;
}

function summarize(canonical, frame, callId = null) {
  const matter = canonical.continuity?.matter ?? null;
  const crate = canonical.authoritativeWorld?.materialObjects?.find((object) => object.id === CRATE_ID) ?? null;
  const janek = canonical.authoritativeWorld?.actors?.find((actor) => actor.id === JANEK_ID) ?? null;
  const percepts = frame?.selectedDiagnostics?.recentPercepts ?? [];
  const occurrences = frame?.recentOccurrences ?? [];
  const addressedPercept = callId ? [...percepts].reverse().find((percept) => percept.occurrenceId === callId) ?? null : null;
  const responseOccurrence = [...occurrences].reverse().find((occurrence) => occurrence.actorId === JANEK_ID && occurrence.kind === "speech" && occurrence.text === "Tak?") ?? null;
  return {
    scenarioId: canonical.scenarioId ?? null,
    tick: canonical.tick ?? null,
    matterStatus: matter?.status ?? null,
    semanticRevision: matter?.semanticRevision ?? null,
    semanticCourse: matter?.semanticCourse ?? null,
    activeRunId: matter?.activeRunId ?? null,
    activeRunCanMutateWorld: canonical.continuity?.activeRunCanMutateWorld ?? null,
    suspendedByMatterId: matter?.suspendedByMatterId ?? null,
    janekPosition: janek?.position ?? null,
    janekVelocity: janek?.velocity ?? null,
    crateLocation: crate?.location ?? null,
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
  };
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate-interruption` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && typeof window.__SPC_EVIDENCE__?.addressResident === "function" && document.querySelector("canvas"))`), 20_000, "interruption evidence scene");
}

async function focusJanekWorldOnly(cdp) {
  await evaluate(cdp, `document.querySelector('[data-resident="resident.janek"]')?.click()`);
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
async function stepEvidence(cdp, steps) { return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`); }

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

function assert(report, name, pass, detail) { report.assertions.push({ name, pass: Boolean(pass), detail }); }
function hashJson(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }
function stableJson(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function samePosition(a, b) { return Boolean(a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9); }
function distance(a, b) { return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY; }

run().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(fallback, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
