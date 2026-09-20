import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(
  process.env.R4_MIRA_ORDINARY_LIFE_OUTPUT ?? "evidence/browser/r4-mira-ordinary-life.json",
);
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };

const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const MOVED_OBJECT_ID = "basket.r4d.background";
const STABLE_OBJECT_A_ID = "crate.r4d.background";
const STABLE_OBJECT_B_ID = "stool.r4d.background";
const MOVED_END = { x: 930, y: 530 };

const PRE_QUIET_TICKS = 600;
const POST_BACKGROUND_QUIET_TICKS = 240;
const POST_CONTACT_QUIET_TICKS = 600;
const CONTACT_GUARD = 40;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r4-mira-ordinary-life-`);
  const port = 13_150 + Math.floor(Math.random() * 250);
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

    assert(report, "R4-D browser starts with Mira matter-free inside a dense non-player local World", Boolean(
      first?.initial?.canonical?.scenarioId === "browser-r4-mira-ordinary-life"
      && first.initial.actorIds.join(",") === [IDA_ID, MIRA_ID].sort().join(",")
      && first.initial.playerPresent === false
      && first.initial.activeMatterIds.length === 0
      && first.initial.pendingReasons.length === 0
      && first.initial.canonical?.continuity?.matter === null
      && first.initial.knowledge.length === 3
      && first.initial.knowledge.every((entry) => entry.currentlyVisible)
    ), first?.initial ?? null);

    assert(report, "600 quiet ticks preserve legal stillness without manufacturing demand", Boolean(
      first?.preQuiet?.ticks === PRE_QUIET_TICKS
      && samePosition(first.preQuiet.before.miraPosition, first.preQuiet.after.miraPosition)
      && first.preQuiet.after.activeMatterIds.length === 0
      && first.preQuiet.after.pendingReasons.length === 0
      && first.preQuiet.after.miraActionFacts.length === 0
      && first.preQuiet.after.miraMotionOwner === null
    ), first?.preQuiet ?? null);

    assert(report, "Ida legally changes nearby material truth while Mira only updates private knowledge", Boolean(
      first?.afterMove?.movedWorld?.location?.kind === "free"
      && nearPosition(first.afterMove.movedWorld.location.position, MOVED_END)
      && first.afterMove.movedKnowledge?.currentlyVisible === true
      && nearPosition(first.afterMove.movedKnowledge?.lastKnownPosition, MOVED_END)
      && first.afterMove.idaActionFacts.length === 2
      && first.afterMove.idaActionFacts.every((fact) => fact.resolution?.outcomeStatus === "succeeded")
      && first.afterMove.activeMatterIds.length === 0
      && first.afterMove.pendingReasons.length === 0
      && first.afterMove.miraActionFacts.length === 0
      && samePosition(first.initial.miraPosition, first.afterMove.miraPosition)
    ), first?.afterMove ?? null);

    assert(report, "ambient Ida speech is privately heard but remains below semantic-pressure boundary", Boolean(
      first?.afterAmbient?.lastIdaSpeechPercept?.phenomenon === "speech"
      && first.afterAmbient.lastIdaSpeechPercept?.modality === "hearing"
      && first.afterAmbient.lastIdaSpeechPercept?.actorId === IDA_ID
      && first.afterAmbient.lastIdaSpeechPercept?.addressed === false
      && first.afterAmbient.lastIdaSpeechPercept?.text === "Ładny spokój."
      && first.afterAmbient.activeMatterIds.length === 0
      && first.afterAmbient.pendingReasons.length === 0
    ), first?.afterAmbient ?? null);

    assert(report, "background quiet remains stable after causal change and ambient speech", Boolean(
      first?.backgroundQuiet?.ticks === POST_BACKGROUND_QUIET_TICKS
      && samePosition(first.backgroundQuiet.before.miraPosition, first.backgroundQuiet.after.miraPosition)
      && first.backgroundQuiet.after.activeMatterIds.length === 0
      && first.backgroundQuiet.after.pendingReasons.length === 0
      && first.backgroundQuiet.after.miraActionFacts.length === 0
    ), first?.backgroundQuiet ?? null);

    assert(report, "direct Ida -> Mira addressed contact creates exactly one semantic reason and one bounded local contact", Boolean(
      first?.contactStarted?.contact?.status === "active"
      && first.contactStarted.contact?.sourceActorId === IDA_ID
      && first.contactStarted.activeMatterIds.length === 1
      && first.contactStarted.pendingReasons.length === 1
      && first.contactStarted.pendingReasons[0]?.kind === "heard_speech"
      && first.contactStarted.lastIdaSpeechPercept?.addressed === true
      && first.contactStarted.lastIdaSpeechPercept?.text === "Mira?"
    ), first?.contactStarted ?? null);

    assert(report, "shared local-contact competence acknowledges Ida and returns Mira body to idle without semantic fake-settlement", Boolean(
      first?.contactCompleted?.contact?.status === "completed"
      && first.contactCompleted.activeMatterIds.length === 0
      && first.contactCompleted.miraMotionOwner === null
      && first.contactCompleted.miraActionFacts.length === 0
      && first.contactCompleted.pendingReasons.length === 1
      && first.contactCompleted.pendingReasons[0]?.id === first.contactStarted.pendingReasons[0]?.id
      && first.contactCompleted.miraResponse?.kind === "speech"
      && first.contactCompleted.miraResponse?.actorId === MIRA_ID
      && first.contactCompleted.miraResponse?.text === "Tak?"
      && first.contactCompleted.miraResponse?.addressedActorIds?.join(",") === IDA_ID
    ), first?.contactCompleted ?? null);

    assert(report, "600 post-contact ticks remain body-idle with one stable unresolved semantic reason and no echo/chore churn", Boolean(
      first?.postContactQuiet?.ticks === POST_CONTACT_QUIET_TICKS
      && samePosition(first.contactCompleted.miraPosition, first.postContactQuiet.after.miraPosition)
      && first.postContactQuiet.after.activeMatterIds.length === 0
      && first.postContactQuiet.after.miraMotionOwner === null
      && first.postContactQuiet.after.miraActionFacts.length === 0
      && first.postContactQuiet.after.pendingReasons.length === 1
      && first.postContactQuiet.after.pendingReasons[0]?.id === first.contactStarted.pendingReasons[0]?.id
      && first.postContactQuiet.after.knowledge.length === 3
    ), first?.postContactQuiet ?? null);

    for (const key of [
      "initialHash",
      "preQuietHash",
      "afterMoveHash",
      "afterAmbientHash",
      "backgroundQuietHash",
      "contactStartedHash",
      "contactCompletedHash",
      "postContactQuietHash",
    ]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(report, `${key} is deterministic across real-Chrome reloads`,
        hashes.every((hash) => hash === hashes[0]), hashes);
    }

    assert(report, "R4-D Mira browser specimen makes no provider/API request",
      report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "R4-D Mira browser specimen has no uncaught runtime exception",
      report.runtimeExceptions.length === 0, report.runtimeExceptions);
    assert(report, "R4-D visual checkpoints are non-empty and screenshot capture is canonically read-only", Boolean(
      first?.visualEvidence?.quiet?.bytes > 10_000
      && first.visualEvidence?.afterMove?.bytes > 10_000
      && first.visualEvidence?.contact?.bytes > 10_000
      && first.visualEvidence?.postContactQuiet?.bytes > 10_000
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

  let initial = await captureState(cdp);
  const visualEvidence = runIndex === 0 ? {} : null;

  const preQuietBefore = initial;
  await stepEvidence(cdp, PRE_QUIET_TICKS);
  const preQuietAfter = await captureState(cdp);
  const preQuiet = { ticks: PRE_QUIET_TICKS, before: preQuietBefore, after: preQuietAfter };
  if (visualEvidence) {
    visualEvidence.quiet = await captureFrozenScreenshot(
      cdp, "r4-mira-ordinary-life-01-quiet.png", preQuietAfter.canonical,
    );
  }

  await scenarioAction(cdp, "ida-relocate-background");
  const afterMove = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.afterMove = await captureFrozenScreenshot(
      cdp, "r4-mira-ordinary-life-02-background-move.png", afterMove.canonical,
    );
  }

  await scenarioAction(cdp, "ida-ambient-speech");
  const afterAmbient = await captureState(cdp);

  const backgroundQuietBefore = afterAmbient;
  await stepEvidence(cdp, POST_BACKGROUND_QUIET_TICKS);
  const backgroundQuietAfter = await captureState(cdp);
  const backgroundQuiet = {
    ticks: POST_BACKGROUND_QUIET_TICKS,
    before: backgroundQuietBefore,
    after: backgroundQuietAfter,
  };

  await scenarioAction(cdp, "ida-address-mira");
  const contactStarted = await captureState(cdp);

  let contactCompleted = null;
  for (let index = 0; index < CONTACT_GUARD && !contactCompleted; index += 1) {
    await stepEvidence(cdp, 1);
    const candidate = await captureState(cdp);
    if (candidate.contact?.status === "completed") contactCompleted = candidate;
  }
  if (!contactCompleted) throw new Error(`run ${runIndex}: Ida -> Mira local contact did not complete`);
  if (visualEvidence) {
    visualEvidence.contact = await captureFrozenScreenshot(
      cdp, "r4-mira-ordinary-life-03-contact-completed.png", contactCompleted.canonical,
    );
  }

  const postContactBefore = contactCompleted;
  await stepEvidence(cdp, POST_CONTACT_QUIET_TICKS);
  const postContactAfter = await captureState(cdp);
  const postContactQuiet = {
    ticks: POST_CONTACT_QUIET_TICKS,
    before: postContactBefore,
    after: postContactAfter,
  };
  if (visualEvidence) {
    visualEvidence.postContactQuiet = await captureFrozenScreenshot(
      cdp, "r4-mira-ordinary-life-04-post-contact-quiet.png", postContactAfter.canonical,
    );
  }

  return {
    runIndex,
    initial,
    preQuiet,
    afterMove,
    afterAmbient,
    backgroundQuiet,
    contactStarted,
    contactCompleted,
    postContactQuiet,
    initialHash: hashJson(projectDeterministic(initial)),
    preQuietHash: hashJson(projectDeterministic(preQuiet)),
    afterMoveHash: hashJson(projectDeterministic(afterMove)),
    afterAmbientHash: hashJson(projectDeterministic(afterAmbient)),
    backgroundQuietHash: hashJson(projectDeterministic(backgroundQuiet)),
    contactStartedHash: hashJson(projectDeterministic(contactStarted)),
    contactCompletedHash: hashJson(projectDeterministic(contactCompleted)),
    postContactQuietHash: hashJson(projectDeterministic(postContactQuiet)),
    visualEvidence,
  };
}

async function captureState(cdp) {
  const canonical = await canonicalSnapshot(cdp);
  const ordinary = await scenarioAction(cdp, "snapshot");
  const diagnostics = canonical.residentPrivate?.diagnostics ?? null;
  const recentPercepts = diagnostics?.recentPercepts ?? [];
  const lastIdaSpeechPercept = [...recentPercepts].reverse().find(
    (percept) => percept.actorId === IDA_ID && percept.phenomenon === "speech",
  ) ?? null;
  const recentOccurrences = canonical.authoritativeWorld?.recentOccurrences ?? [];
  const miraResponse = [...recentOccurrences].reverse().find(
    (occurrence) => occurrence.actorId === MIRA_ID
      && occurrence.kind === "speech"
      && occurrence.text === "Tak?",
  ) ?? null;
  const movedWorld = ordinary.materialObjects.find((entry) => entry.id === MOVED_OBJECT_ID) ?? null;
  const movedKnowledge = ordinary.materialKnowledge.find((entry) => entry.objectId === MOVED_OBJECT_ID) ?? null;

  return {
    canonical,
    actorIds: (canonical.authoritativeWorld?.actors ?? []).map((actor) => actor.id).sort(),
    playerPresent: (canonical.authoritativeWorld?.actors ?? []).some((actor) => actor.kind === "player"),
    miraPosition: ordinary.miraPosition,
    activeMatterIds: ordinary.activeMatterIds,
    pendingReasons: ordinary.pendingCognitionReasons,
    contact: ordinary.contact,
    miraMotionOwner: ordinary.miraMotionOwner,
    miraActionFacts: ordinary.miraActionFacts,
    idaActionFacts: ordinary.idaActionFacts,
    idaMatters: ordinary.idaMatters,
    knowledge: ordinary.materialKnowledge,
    movedWorld,
    movedKnowledge,
    lastIdaSpeechPercept,
    miraResponse,
    stableWorldObjectsPresent: [STABLE_OBJECT_A_ID, STABLE_OBJECT_B_ID].every(
      (id) => ordinary.materialObjects.some((entry) => entry.id === id),
    ),
  };
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", {
    url: `${BASE_URL}/?spc=1&evidence=1&scenario=r4-mira-ordinary-life`,
  });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.()
      && typeof window.__SPC_EVIDENCE__?.scenarioAction === "function"
      && document.querySelector("canvas"))`,
  ), 20_000, "R4-D Mira ordinary-life evidence scene");
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
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(data, "base64");
  writeFileSync(resolve(OUTPUT_DIR, fileName), bytes);
  const after = await canonicalSnapshot(cdp);
  if (beforeHash !== hashJson(after)) {
    throw new Error(`screenshot ${fileName} mutated canonical World state`);
  }
  return {
    fileName,
    tick: canonicalBefore.tick,
    bytes: bytes.length,
    canonicalHash: beforeHash,
  };
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}

async function scenarioAction(cdp, actionId) {
  return await evaluate(
    cdp,
    `window.__SPC_EVIDENCE__.scenarioAction(${JSON.stringify(actionId)})`,
  );
}

async function stepEvidence(cdp, steps) {
  return await evaluate(
    cdp,
    `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`,
    60_000,
  );
}

async function evaluate(cdp, expression, timeoutMs = 30_000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Runtime.evaluate failed",
    );
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
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortValue(value[key])]),
  );
}

function nearPosition(a, b, tolerance = 1e-9) {
  return Boolean(
    a && b
    && Math.abs(a.x - b.x) <= tolerance
    && Math.abs(a.y - b.y) <= tolerance,
  );
}

function samePosition(a, b, tolerance = 1e-9) {
  return nearPosition(a, b, tolerance);
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
