import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const TARGET_TICKS = [0, 120, 360, 760];
const REPEAT_COUNT = 3;
const CRATE_ID = "crate.workshop.01";

mkdirSync(dirname(OUTPUT_FILE), { recursive: true });
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

  send(method, params = {}, timeoutMs = 15_000) {
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

  close() {
    this.ws?.close();
  }
}

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-manual-control-`);
  const port = 10_200 + Math.floor(Math.random() * 500);
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
    schemaVersion: 2,
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    manualControl: {},
    repeatedRuns: [],
    normalRuntime: {},
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

    await navigateEvidence(cdp);
    const meta = await evidenceMeta(cdp);
    assert(report, "evidence API v3 exposes manual World control and canonical snapshot", meta.version === 3 && meta.control === "manual-world" && meta.ready === true && meta.hasCanonicalSnapshot === true, meta);

    const beforeWait = await evidenceSnapshot(cdp);
    const canonicalBeforeWait = await canonicalSnapshot(cdp);
    assert(report, "canonical snapshot v1 is available at the frozen initial boundary", canonicalBeforeWait.schemaVersion === 1 && canonicalBeforeWait.tick === 0 && canonicalBeforeWait.scenarioId === "browser-baseline-delivery", canonicalSummary(canonicalBeforeWait));

    await sleep(450);
    const afterWait = await evidenceSnapshot(cdp);
    const canonicalAfterWait = await canonicalSnapshot(cdp);
    assert(report, "wall-clock passage does not advance evidence-controlled World", beforeWait.snapshot.tick === 0 && afterWait.snapshot.tick === 0, {
      beforeTick: beforeWait.snapshot.tick,
      afterTick: afterWait.snapshot.tick,
    });
    assert(report, "wall-clock passage leaves canonical causal state unchanged while frozen", stableJson(canonicalAfterWait) === stableJson(canonicalBeforeWait), {
      beforeHash: hashJson(canonicalBeforeWait),
      afterHash: hashJson(canonicalAfterWait),
    });

    const zoomBefore = beforeWait.cameraZoom;
    await click(cdp, `[data-action="overview"]`);
    await sleep(180);
    const afterOverview = await evidenceSnapshot(cdp);
    const canonicalAfterOverview = await canonicalSnapshot(cdp);
    assert(report, "camera/render control can change while World tick stays frozen", afterOverview.snapshot.tick === 0 && afterOverview.cameraZoom !== zoomBefore, {
      tick: afterOverview.snapshot.tick,
      zoomBefore,
      zoomAfter: afterOverview.cameraZoom,
    });
    assert(report, "camera/viewpoint changes do not mutate canonical causal state", stableJson(canonicalAfterOverview) === stableJson(canonicalBeforeWait), {
      canonicalHashBefore: hashJson(canonicalBeforeWait),
      canonicalHashAfter: hashJson(canonicalAfterOverview),
    });

    const afterSeven = await stepEvidence(cdp, 7);
    const canonicalAfterSeven = await canonicalSnapshot(cdp);
    assert(report, "manual stepWorld advances exactly requested ticks", afterSeven.snapshot.tick === 7 && canonicalAfterSeven.tick === 7, {
      presentationTick: afterSeven.snapshot.tick,
      canonicalTick: canonicalAfterSeven.tick,
    });
    await sleep(350);
    const afterSevenWait = await evidenceSnapshot(cdp);
    const canonicalAfterSevenWait = await canonicalSnapshot(cdp);
    assert(report, "World remains frozen again after a manual step burst", afterSevenWait.snapshot.tick === 7 && canonicalAfterSevenWait.tick === 7, {
      presentationTick: afterSevenWait.snapshot.tick,
      canonicalTick: canonicalAfterSevenWait.tick,
    });
    assert(report, "frozen post-step canonical state remains stable", stableJson(canonicalAfterSevenWait) === stableJson(canonicalAfterSeven), {
      canonicalHashBefore: hashJson(canonicalAfterSeven),
      canonicalHashAfter: hashJson(canonicalAfterSevenWait),
    });
    report.manualControl = {
      initialTick: beforeWait.snapshot.tick,
      tickAfterWallClock: afterWait.snapshot.tick,
      tickAfterSevenSteps: afterSeven.snapshot.tick,
      tickAfterSecondWallClock: afterSevenWait.snapshot.tick,
      zoomBefore,
      zoomAfter: afterOverview.cameraZoom,
      canonicalInitial: canonicalSummary(canonicalBeforeWait),
      canonicalAfterSeven: canonicalSummary(canonicalAfterSeven),
    };

    const repeatedRuns = [];
    for (let runIndex = 0; runIndex < REPEAT_COUNT; runIndex += 1) {
      repeatedRuns.push(await captureBaselineRun(cdp, runIndex));
    }
    report.repeatedRuns = repeatedRuns;

    for (const targetTick of TARGET_TICKS) {
      const presentationHashes = repeatedRuns.map((runRecord) => runRecord.checkpoints.find((checkpoint) => checkpoint.tick === targetTick)?.presentationHash ?? null);
      const canonicalHashes = repeatedRuns.map((runRecord) => runRecord.checkpoints.find((checkpoint) => checkpoint.tick === targetTick)?.canonicalHash ?? null);
      assert(report, `manual presentation projection is exactly reproducible at t${targetTick}`, presentationHashes.every((hash) => hash !== null && hash === presentationHashes[0]), presentationHashes);
      assert(report, `canonical evidence snapshot is exactly reproducible at t${targetTick}`, canonicalHashes.every((hash) => hash !== null && hash === canonicalHashes[0]), canonicalHashes);
    }

    const finalCheckpoint = repeatedRuns[0]?.checkpoints.find((checkpoint) => checkpoint.tick === 760) ?? null;
    assert(report, "canonical t760 proves material delivery and matter terminality", Boolean(
      finalCheckpoint?.canonical?.matterStatus === "resolved"
      && finalCheckpoint?.canonical?.activeRunId === null
      && finalCheckpoint?.canonical?.crateLocation?.kind === "free"
      && Math.abs((finalCheckpoint?.canonical?.crateLocation?.position?.x ?? Number.NaN) - 2_980) < 1e-9
      && Math.abs((finalCheckpoint?.canonical?.crateLocation?.position?.y ?? Number.NaN) - 1_080) < 1e-9
    ), finalCheckpoint?.canonical ?? null);
    assert(report, "canonical t760 retains exact pickup/place run-to-World action provenance", Boolean(
      finalCheckpoint?.canonical?.actionFacts?.length === 2
      && finalCheckpoint.canonical.actionFacts[0]?.runId === "run.janek.pickup-delivery-crate"
      && finalCheckpoint.canonical.actionFacts[0]?.code === "picked_up"
      && finalCheckpoint.canonical.actionFacts[1]?.runId === "run.janek.place-delivery-crate"
      && finalCheckpoint.canonical.actionFacts[1]?.code === "placed"
    ), finalCheckpoint?.canonical?.actionFacts ?? null);

    await navigateNormal(cdp);
    const normalHasEvidenceApi = await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__)`);
    const normalTickBefore = await domTick(cdp);
    await sleep(450);
    const normalTickAfter = await domTick(cdp);
    report.normalRuntime = { hasEvidenceApi: normalHasEvidenceApi, tickBefore: normalTickBefore, tickAfter: normalTickAfter };
    assert(report, "normal SPC runtime does not expose evidence control API", normalHasEvidenceApi === false, report.normalRuntime);
    assert(report, "normal SPC runtime still advances from Phaser wall-clock", normalTickAfter > normalTickBefore, report.normalRuntime);

    assert(report, "manual-control probe has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

async function captureBaselineRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  const checkpoints = [];
  let previousTick = 0;
  for (const targetTick of TARGET_TICKS) {
    const delta = targetTick - previousTick;
    const frame = delta > 0 ? await stepEvidence(cdp, delta) : await evidenceSnapshot(cdp);
    const canonical = await canonicalSnapshot(cdp);
    if (frame.snapshot.tick !== targetTick || canonical.tick !== targetTick) {
      throw new Error(`manual baseline run ${runIndex} expected t${targetTick}, got presentation t${frame.snapshot.tick} / canonical t${canonical.tick}`);
    }
    const projection = controlProjection(frame);
    checkpoints.push({
      tick: targetTick,
      presentationHash: hashJson(projection),
      canonicalHash: hashJson(canonical),
      janek: actorSummary(frame, "resident.janek"),
      occurrenceCount: frame.recentOccurrences.length,
      canonical: canonicalSummary(canonical),
    });
    previousTick = targetTick;
  }
  return { runIndex, checkpoints };
}

function controlProjection(frame) {
  return {
    snapshot: frame.snapshot,
    recentOccurrences: frame.recentOccurrences,
    motionOutcomes: frame.motionOutcomes,
    selectedResidentId: frame.selectedResidentId,
    selectedDiagnostics: frame.selectedDiagnostics,
    selectedRegionId: frame.selectedRegionId,
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
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    actionFacts: (snapshot.causalProvenance?.residentWorldActionFacts ?? []).map((fact) => ({
      id: fact.id,
      tick: fact.tick,
      runId: fact.runId,
      kind: fact.action?.kind ?? null,
      objectId: fact.action?.objectId ?? null,
      outcomeStatus: fact.resolution?.outcomeStatus ?? fact.resolution?.status ?? null,
      code: fact.resolution?.code ?? fact.resolution?.reason ?? null,
      actionSeq: fact.resolution?.actionSeq ?? null,
    })),
  };
}

function actorSummary(frame, actorId) {
  const actor = frame.snapshot.actors.find((candidate) => candidate.id === actorId);
  if (!actor) return null;
  return { position: actor.position, velocity: actor.velocity };
}

function stableJson(value) {
  return JSON.stringify(value);
}

function hashJson(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 20_000, "manual evidence scene");
}

async function navigateNormal(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(document.querySelector("canvas") && document.querySelector(".spc-tick"))`), 20_000, "normal SPC scene");
}

async function evidenceMeta(cdp) {
  return await evaluate(cdp, `(() => {
    const api = window.__SPC_EVIDENCE__;
    return {
      version: api?.version ?? null,
      control: api?.control ?? null,
      ready: api?.ready?.() ?? false,
      hasCanonicalSnapshot: typeof api?.canonicalSnapshot === "function",
    };
  })()`);
}

async function evidenceSnapshot(cdp) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.snapshot()`);
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.canonicalSnapshot()`);
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function domTick(cdp) {
  return await evaluate(cdp, `(() => {
    const match = /t(\\d+)/.exec(document.querySelector(".spc-tick")?.textContent ?? "");
    return match ? Number(match[1]) : -1;
  })()`);
}

async function click(cdp, selector) {
  const clicked = await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return false;
    element.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Unable to click ${selector}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 30_000);
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
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function waitUntil(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

run().catch((error) => {
  const failure = {
    schemaVersion: 2,
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
