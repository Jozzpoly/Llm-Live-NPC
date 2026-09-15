import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.MISSING_CRATE_OUTPUT ?? "evidence/browser/missing-crate.json");
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const REPEAT_COUNT = 3;
const MAX_RESIDENT_STEPS = 380;
const CRATE_ID = "crate.workshop.01";
const JANEK_ID = "resident.janek";
const RELOCATOR_ID = "player.relocator";
const RUN_ID = "run.janek.pickup-last-known-crate";
const REMEMBERED_CRATE_POSITION = { x: 1_952, y: 720 };

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

  close() {
    this.ws?.close();
  }
}

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-missing-crate-`);
  const port = 10_750 + Math.floor(Math.random() * 400);
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

    const runs = [];
    for (let runIndex = 0; runIndex < REPEAT_COUNT; runIndex += 1) {
      runs.push(await captureMissingCrateRun(cdp, runIndex));
    }
    report.runs = runs;

    const first = runs[0];
    assert(report, "missing-crate opens before the hidden perturbation with stale-able legal knowledge", Boolean(
      first?.pre?.scenarioId === "browser-missing-crate"
      && first.pre.matterStatus === "active"
      && first.pre.semanticRevision === 1
      && first.pre.activeRunId === RUN_ID
      && samePosition(first.pre.crateLocation?.position, REMEMBERED_CRATE_POSITION)
      && first.pre.materialKnowledge?.length === 1
      && samePosition(first.pre.materialKnowledge[0]?.lastKnownPosition, REMEMBERED_CRATE_POSITION)
      && first.pre.materialKnowledge[0]?.currentlyVisible === false
    ), first?.pre ?? null);

    assert(report, "wall-clock cannot silently perform the hidden relocation", Boolean(
      first?.preHash && first.preHash === first.frozenPreHash
    ), { preHash: first?.preHash ?? null, frozenPreHash: first?.frozenPreHash ?? null });

    assert(report, "one explicit browser World tick performs the hidden relocation and nothing semantic", Boolean(
      first?.postRelocation?.tick === first.pre.tick + 1
      && first.postRelocation.matterStatus === "active"
      && first.postRelocation.semanticRevision === 1
      && first.postRelocation.activeRunId === RUN_ID
      && first.postRelocation.activeRunCanMutateWorld === true
      && first.postRelocation.crateLocation?.kind === "free"
      && !samePosition(first.postRelocation.crateLocation?.position, REMEMBERED_CRATE_POSITION)
      && stableJson(first.postRelocation.materialKnowledge) === stableJson(first.pre.materialKnowledge)
      && samePosition(first.postRelocation.janekPosition, first.pre.janekPosition)
      && first.postRelocation.relocatorPerceptCount === 0
    ), { pre: first?.pre ?? null, postRelocation: first?.postRelocation ?? null });

    assert(report, "resident follows stale history until factual rejection creates checked absence", Boolean(
      first?.checkedAbsence?.matterStatus === "active"
      && first.checkedAbsence.semanticRevision === 2
      && first.checkedAbsence.activeRunId === null
      && first.checkedAbsence.activeRunCanMutateWorld === false
      && first.checkedAbsence.semanticEvidenceKind === "checked_absence"
      && first.checkedAbsence.lastOutcomeEvidenceKind === "task_outcome"
      && samePosition(first.checkedAbsence.materialKnowledge?.[0]?.lastKnownPosition, REMEMBERED_CRATE_POSITION)
      && first.checkedAbsence.materialKnowledge?.[0]?.currentlyVisible === false
      && samePosition(first.checkedAbsence.crateLocation?.position, first.postRelocation.crateLocation?.position)
      && first.checkedAbsence.relocatorPerceptCount === 0
      && first.checkedAbsence.pendingProposalCount === 0
      && first.checkedAbsence.actionFacts?.some((fact) => fact.runId === RUN_ID && fact.outcomeStatus === "rejected" && fact.code === "out_of_range")
      && distance(first.checkedAbsence.janekPosition, REMEMBERED_CRATE_POSITION) < distance(first.pre.janekPosition, REMEMBERED_CRATE_POSITION)
    ), first?.checkedAbsence ?? null);

    for (const checkpoint of ["preHash", "postRelocationHash", "checkedAbsenceHash"]) {
      const hashes = runs.map((entry) => entry[checkpoint]);
      assert(report, `${checkpoint} is exactly reproducible across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }
    const checkedTicks = runs.map((entry) => entry.checkedAbsence?.tick ?? null);
    assert(report, "checked-absence causal boundary occurs at the same World tick across reloads", checkedTicks.every((tick) => tick === checkedTicks[0]), checkedTicks);
    assert(report, "missing-crate browser specimen has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

async function captureMissingCrateRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  const preCanonical = await canonicalSnapshot(cdp);
  const preFrame = await evidenceSnapshot(cdp);
  const preHash = hashJson(preCanonical);

  await sleep(220);
  const frozenPre = await canonicalSnapshot(cdp);

  const postFrame = await stepEvidence(cdp, 1);
  const postCanonical = await canonicalSnapshot(cdp);
  if (postCanonical.tick !== preCanonical.tick + 1 || postFrame.snapshot.tick !== postCanonical.tick) {
    throw new Error(`run ${runIndex}: hidden relocation did not occupy exactly one World tick`);
  }

  let checkedCanonical = postCanonical;
  let checkedFrame = postFrame;
  let residentSteps = 0;
  while (!isCheckedAbsenceBoundary(checkedCanonical) && residentSteps < MAX_RESIDENT_STEPS) {
    checkedFrame = await stepEvidence(cdp, 1);
    checkedCanonical = await canonicalSnapshot(cdp);
    residentSteps += 1;
  }
  if (!isCheckedAbsenceBoundary(checkedCanonical)) {
    throw new Error(`run ${runIndex}: checked absence not reached within ${MAX_RESIDENT_STEPS} resident steps`);
  }

  return {
    runIndex,
    residentSteps,
    preHash,
    frozenPreHash: hashJson(frozenPre),
    postRelocationHash: hashJson(postCanonical),
    checkedAbsenceHash: hashJson(checkedCanonical),
    pre: canonicalSummary(preCanonical, preFrame),
    postRelocation: canonicalSummary(postCanonical, postFrame),
    checkedAbsence: canonicalSummary(checkedCanonical, checkedFrame),
  };
}

function isCheckedAbsenceBoundary(snapshot) {
  return snapshot?.continuity?.matter?.status === "active"
    && snapshot.continuity.matter.semanticRevision === 2
    && snapshot.continuity.matter.activeRunId === null
    && snapshot.continuity.semanticEvidence?.kind === "checked_absence";
}

function canonicalSummary(snapshot, frame) {
  const crate = snapshot.authoritativeWorld?.materialObjects?.find((object) => object.id === CRATE_ID) ?? null;
  const janek = snapshot.authoritativeWorld?.actors?.find((actor) => actor.id === JANEK_ID) ?? null;
  const relocatorPerceptCount = (snapshot.residentPrivate?.diagnostics?.recentPercepts ?? [])
    .filter((percept) => percept.actorId === RELOCATOR_ID).length;
  return {
    schemaVersion: snapshot.schemaVersion ?? null,
    scenarioId: snapshot.scenarioId ?? null,
    tick: snapshot.tick ?? null,
    presentationTick: frame?.snapshot?.tick ?? null,
    matterStatus: snapshot.continuity?.matter?.status ?? null,
    semanticRevision: snapshot.continuity?.matter?.semanticRevision ?? null,
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? null,
    semanticEvidenceKind: snapshot.continuity?.semanticEvidence?.kind ?? null,
    lastOutcomeEvidenceKind: snapshot.continuity?.lastOutcomeEvidence?.kind ?? null,
    pendingProposalCount: snapshot.continuity?.pendingSemanticProposals?.length ?? null,
    crateLocation: crate?.location ?? null,
    janekPosition: janek?.position ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
    relocatorPerceptCount,
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
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 20_000, "missing-crate evidence scene");
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
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
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

function samePosition(a, b) {
  return Boolean(a && b && Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9);
}

function distance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function stableJson(value) {
  return JSON.stringify(value);
}

function hashJson(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

run().catch((error) => {
  const failure = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
