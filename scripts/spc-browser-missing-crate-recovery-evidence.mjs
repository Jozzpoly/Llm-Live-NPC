import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.MISSING_CRATE_RECOVERY_OUTPUT ?? "evidence/browser/missing-crate-recovery.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const REPEAT_COUNT = 3;
const MAX_STEPS = 1_500;
const CRATE_ID = "crate.workshop.01";
const JANEK_ID = "resident.janek";
const SEARCH_RUN_ID = "run.janek.search-nearby-workshop";
const PICKUP_RUN_ID = "run.janek.pickup-reacquired-crate";

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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-missing-crate-recovery-`);
  const port = 11_200 + Math.floor(Math.random() * 400);
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
      report.runs.push(await captureRecoveryRun(cdp, runIndex));
    }
    report.visualEvidence = report.runs[0]?.visualEvidence ?? null;

    const first = report.runs[0];
    assert(report, "recovery reaches checked absence before changing semantic course", Boolean(
      first?.checkedAbsence?.scenarioId === "browser-missing-crate-recovery"
      && first.checkedAbsence.matterStatus === "active"
      && first.checkedAbsence.semanticRevision === 2
      && first.checkedAbsence.activeRunId === null
      && first.checkedAbsence.semanticEvidenceKind === "checked_absence"
      && first.checkedAbsence.actionFacts.length === 0
    ), first?.checkedAbsence ?? null);

    assert(report, "next explicit World tick admits search semantics and exact search run", Boolean(
      first?.searchAdmitted?.semanticRevision === 3
      && first.searchAdmitted.activeRunId === SEARCH_RUN_ID
      && first.searchAdmitted.activeRunCanMutateWorld === true
      && first.searchAdmitted.semanticEvidenceKind === "checked_absence"
      && first.searchAdmitted.actionFacts.length === 0
    ), first?.searchAdmitted ?? null);

    assert(report, "embodied search legally reacquires the crate without any material action", Boolean(
      first?.reacquired?.semanticRevision === 4
      && first.reacquired.activeRunId === null
      && first.reacquired.semanticEvidenceKind === "material_reacquired"
      && first.reacquired.materialKnowledge?.[0]?.currentlyVisible === true
      && samePosition(first.reacquired.materialKnowledge?.[0]?.lastKnownPosition, first.reacquired.crateLocation?.position)
      && first.reacquired.actionFacts.length === 0
    ), first?.reacquired ?? null);

    assert(report, "second explicit semantic boundary authorizes pickup only after reacquisition", Boolean(
      first?.pickupAdmitted?.semanticRevision === 5
      && first.pickupAdmitted.activeRunId === PICKUP_RUN_ID
      && first.pickupAdmitted.activeRunCanMutateWorld === true
      && first.pickupAdmitted.semanticEvidenceKind === "material_reacquired"
      && first.pickupAdmitted.actionFacts.length === 0
    ), first?.pickupAdmitted ?? null);

    assert(report, "recovery resolves only after one exact resident pickup World action", Boolean(
      first?.resolved?.matterStatus === "resolved"
      && first.resolved.activeRunId === null
      && first.resolved.activeRunCanMutateWorld === false
      && first.resolved.crateLocation?.kind === "held"
      && first.resolved.crateLocation?.actorId === JANEK_ID
      && first.resolved.actionFacts.length === 1
      && first.resolved.actionFacts[0]?.runId === PICKUP_RUN_ID
      && first.resolved.actionFacts[0]?.kind === "material_pickup"
      && first.resolved.actionFacts[0]?.outcomeStatus === "succeeded"
      && first.resolved.actionFacts[0]?.code === "picked_up"
    ), first?.resolved ?? null);

    for (const checkpoint of ["checkedAbsenceHash", "searchAdmittedHash", "reacquiredHash", "pickupAdmittedHash", "resolvedHash"]) {
      const hashes = report.runs.map((entry) => entry[checkpoint]);
      assert(report, `${checkpoint} is exactly reproducible across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }
    for (const checkpoint of ["checkedAbsence", "searchAdmitted", "reacquired", "pickupAdmitted", "resolved"]) {
      const ticks = report.runs.map((entry) => entry[checkpoint]?.tick ?? null);
      assert(report, `${checkpoint} occurs at the same World tick across reloads`, ticks.every((tick) => tick === ticks[0]), ticks);
    }
    assert(report, "recovery participant screenshots are non-empty and canonically frozen", Boolean(
      first?.visualEvidence?.searching?.bytes > 10_000
      && first.visualEvidence?.reacquired?.bytes > 10_000
      && first.visualEvidence?.resolved?.bytes > 10_000
    ), first?.visualEvidence ?? null);
    assert(report, "missing-crate recovery has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

async function captureRecoveryRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  if (runIndex === 0) await focusJanekWorldOnly(cdp);

  let canonical = await canonicalSnapshot(cdp);
  let checkedAbsence = null;
  let searchAdmitted = null;
  let reacquired = null;
  let pickupAdmitted = null;
  let resolved = null;
  let visualEvidence = runIndex === 0 ? {} : null;
  let guard = 0;

  while (!resolved && guard < MAX_STEPS) {
    await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    guard += 1;

    if (!checkedAbsence && isCheckedAbsence(canonical)) {
      checkedAbsence = canonicalSummary(canonical);
      continue;
    }
    if (checkedAbsence && !searchAdmitted && isSearchAdmitted(canonical)) {
      searchAdmitted = canonicalSummary(canonical);
      if (visualEvidence) visualEvidence.searching = await captureFrozenScreenshot(cdp, "missing-crate-recovery-01-searching.png", canonical);
      continue;
    }
    if (searchAdmitted && !reacquired && isReacquired(canonical)) {
      reacquired = canonicalSummary(canonical);
      if (visualEvidence) visualEvidence.reacquired = await captureFrozenScreenshot(cdp, "missing-crate-recovery-02-reacquired.png", canonical);
      continue;
    }
    if (reacquired && !pickupAdmitted && isPickupAdmitted(canonical)) {
      pickupAdmitted = canonicalSummary(canonical);
      continue;
    }
    if (pickupAdmitted && isResolved(canonical)) {
      resolved = canonicalSummary(canonical);
      if (visualEvidence) visualEvidence.resolved = await captureFrozenScreenshot(cdp, "missing-crate-recovery-03-resolved.png", canonical);
    }
  }

  if (!checkedAbsence || !searchAdmitted || !reacquired || !pickupAdmitted || !resolved) {
    throw new Error(`run ${runIndex}: recovery did not reach all causal checkpoints within ${MAX_STEPS} steps`);
  }

  return {
    runIndex,
    worldSteps: guard,
    checkedAbsenceHash: hashJson(checkedAbsence),
    searchAdmittedHash: hashJson(searchAdmitted),
    reacquiredHash: hashJson(reacquired),
    pickupAdmittedHash: hashJson(pickupAdmitted),
    resolvedHash: hashJson(resolved),
    checkedAbsence,
    searchAdmitted,
    reacquired,
    pickupAdmitted,
    resolved,
    visualEvidence,
  };
}

function isCheckedAbsence(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 2
    && snapshot.continuity.matter.activeRunId === null
    && snapshot.continuity.semanticEvidence?.kind === "checked_absence";
}

function isSearchAdmitted(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 3
    && snapshot.continuity.matter.activeRunId === SEARCH_RUN_ID;
}

function isReacquired(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 4
    && snapshot.continuity.matter.activeRunId === null
    && snapshot.continuity.semanticEvidence?.kind === "material_reacquired";
}

function isPickupAdmitted(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 5
    && snapshot.continuity.matter.activeRunId === PICKUP_RUN_ID;
}

function isResolved(snapshot) {
  return snapshot?.continuity?.matter?.status === "resolved"
    && snapshot.authoritativeWorld?.materialObjects?.find((object) => object.id === CRATE_ID)?.location?.kind === "held";
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
    lastOutcomeEvidenceKind: snapshot.continuity?.lastOutcomeEvidence?.kind ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    actionFacts: (snapshot.causalProvenance?.residentWorldActionFacts ?? []).map((fact) => ({
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

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate-recovery` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 20_000, "missing-crate recovery evidence scene");
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
  const canonicalAfter = await canonicalSnapshot(cdp);
  const afterHash = hashJson(canonicalAfter);
  if (beforeHash !== afterHash) throw new Error(`screenshot ${fileName} mutated canonical World state`);
  return { fileName, tick: canonicalBefore.tick, bytes: bytes.length, canonicalHash: beforeHash };
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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
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

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
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

function samePosition(a, b) {
  return Boolean(a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
}

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
