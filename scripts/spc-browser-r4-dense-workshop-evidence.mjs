import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.R4_DENSE_WORKSHOP_OUTPUT ?? "evidence/browser/r4-dense-workshop.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const JANEK_ID = "resident.janek";
const PRIMARY_MATTER_ID = "matter.janek.r4.missing-crate";
const SECONDARY_MATTER_ID = "matter.janek.r4.return-basket";
const PRIMARY_RUN_ID = "run.janek.r4.pickup-last-known-crate";
const SECONDARY_PICKUP_RUN_ID = "run.janek.r4.pickup-basket";
const PRIMARY_OBJECT_ID = "crate.r4.remembered";
const SECONDARY_OBJECT_ID = "basket.r4.available";
const IRRELEVANT_OBJECT_ID = "stool.r4.background";
const PRIMARY_REMEMBERED = { x: 500, y: 500 };
const SECONDARY_DESTINATION = { x: 1450, y: 500 };
const MAX_TO_BLOCKED = 1_000;
const MAX_TO_RESOLVED = 1_400;
const QUIET_TICKS = 600;
const STEP_CHUNK = 4;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r4-dense-workshop-`);
  const port = 12_900 + Math.floor(Math.random() * 250);
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

    assert(report, "R4 browser exposes two pre-existing resident matters with A focused and B deferred", Boolean(
      first?.initial?.scenarioId === "browser-r4-dense-workshop"
      && first.initial.primary?.status === "active"
      && first.initial.primary?.activeRun?.runId === PRIMARY_RUN_ID
      && first.initial.secondary?.status === "active"
      && first.initial.secondary?.activeRun?.runId === SECONDARY_PICKUP_RUN_ID
      && first.initial.body?.focusedRunId === PRIMARY_RUN_ID
      && first.initial.body?.deferredRunIds?.includes(SECONDARY_PICKUP_RUN_ID)
    ), first?.initial ?? null);

    assert(report, "hidden relocation changes World truth without rewriting Janek's remembered primary position", Boolean(
      first?.relocated?.primaryWorld?.location?.kind === "free"
      && distance(first.relocated.primaryWorld.location.position, PRIMARY_REMEMBERED) > 520
      && first.relocated.primaryKnowledge?.currentlyVisible === false
      && nearPosition(first.relocated.primaryKnowledge?.lastKnownPosition, PRIMARY_REMEMBERED)
      && first.relocated.primaryKnowledge?.observedAtTick === first.initial.primaryKnowledge?.observedAtTick
    ), first?.relocated ?? null);

    assert(report, "checked absence keeps A unresolved while sole deferred B acquires the body locally", Boolean(
      first?.blocked?.primary?.status === "active"
      && first.blocked.primary?.activeRun === null
      && first.blocked.primary?.semanticEvidence?.kind === "checked_absence"
      && first.blocked.secondary?.status === "active"
      && first.blocked.body?.focusedRunId !== null
      && first.blocked.body?.focusedRunId !== PRIMARY_RUN_ID
      && first.blocked.pendingCognitionReasonCount >= 1
    ), first?.blocked ?? null);

    assert(report, "alternate B creates pickup/place World consequences while A remains unresolved and C remains untouched", Boolean(
      first?.resolved?.primary?.status === "active"
      && first.resolved.primary?.activeRun === null
      && first.resolved.primary?.semanticEvidence?.kind === "checked_absence"
      && first.resolved.secondary?.status === "resolved"
      && first.resolved.secondaryWorld?.location?.kind === "free"
      && nearPosition(first.resolved.secondaryWorld.location.position, SECONDARY_DESTINATION)
      && first.resolved.irrelevantWorld?.location?.kind === "free"
      && first.resolved.actionFacts?.length === 2
      && first.resolved.actionFacts.every((fact) => fact.objectId === SECONDARY_OBJECT_ID)
      && first.resolved.actionFacts.map((fact) => fact.kind).join(",") === "material_pickup,material_place"
    ), first?.resolved ?? null);

    assert(report, "quiet continuation does not invent a chore or mutate blocked/background truth", Boolean(
      first?.quiet?.ticks === QUIET_TICKS
      && samePosition(first.quiet.before.janekPosition, first.quiet.after.janekPosition)
      && stableJson(first.quiet.before.primary) === stableJson(first.quiet.after.primary)
      && stableJson(first.quiet.before.irrelevantWorld) === stableJson(first.quiet.after.irrelevantWorld)
      && first.quiet.before.actionFacts.length === first.quiet.after.actionFacts.length
      && first.quiet.after.body?.focusedRunId === null
    ), first?.quiet ?? null);

    for (const key of ["relocatedHash", "blockedHash", "resolvedHash", "quietHash"]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(report, `${key} is deterministic across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }

    assert(report, "R4 dense-workshop browser specimen makes no provider/API request", report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "R4 dense-workshop browser specimen has no uncaught runtime exception", report.runtimeExceptions.length === 0, report.runtimeExceptions);
    assert(report, "R4 visual checkpoints are non-empty and screenshot capture is canonically read-only", Boolean(
      first?.visualEvidence?.relocated?.bytes > 10_000
      && first.visualEvidence?.blockedAlternate?.bytes > 10_000
      && first.visualEvidence?.resolved?.bytes > 10_000
      && first.visualEvidence?.quiet?.bytes > 10_000
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
  if (runIndex === 0) await focusJanekWorldOnly(cdp);

  let canonical = await canonicalSnapshot(cdp);
  let frame = await evidenceSnapshot(cdp);
  const initial = summarize(canonical, frame);
  const visualEvidence = runIndex === 0 ? {} : null;

  // Explicit browser-controlled causal boundary: external relocation only.
  frame = await stepEvidence(cdp, 1);
  canonical = await canonicalSnapshot(cdp);
  const relocated = summarize(canonical, frame);
  if (visualEvidence) visualEvidence.relocated = await captureFrozenScreenshot(
    cdp,
    "r4-dense-workshop-01-hidden-relocation.png",
    canonical,
  );

  let blocked = null;
  let stepped = 0;
  while (!blocked && stepped < MAX_TO_BLOCKED) {
    const chunk = Math.min(STEP_CHUNK, MAX_TO_BLOCKED - stepped);
    frame = await stepEvidence(cdp, chunk);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame);
    if (current.primary?.semanticEvidence?.kind === "checked_absence"
      && current.primary?.status === "active"
      && current.body?.focusedRunId !== PRIMARY_RUN_ID) {
      blocked = current;
    }
    stepped += chunk;
  }
  if (!blocked) throw new Error(`run ${runIndex}: checked-absence -> alternate body handoff not reached`);
  if (visualEvidence) visualEvidence.blockedAlternate = await captureFrozenScreenshot(
    cdp,
    "r4-dense-workshop-02-blocked-alternate.png",
    canonical,
  );

  let resolved = null;
  stepped = 0;
  while (!resolved && stepped < MAX_TO_RESOLVED) {
    const chunk = Math.min(STEP_CHUNK, MAX_TO_RESOLVED - stepped);
    frame = await stepEvidence(cdp, chunk);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical, frame);
    if (current.secondary?.status === "resolved"
      && current.secondaryWorld?.location?.kind === "free"
      && nearPosition(current.secondaryWorld.location.position, SECONDARY_DESTINATION)) {
      resolved = current;
    }
    stepped += chunk;
  }
  if (!resolved) throw new Error(`run ${runIndex}: alternate material matter did not resolve`);
  if (visualEvidence) visualEvidence.resolved = await captureFrozenScreenshot(
    cdp,
    "r4-dense-workshop-03-alternate-resolved.png",
    canonical,
  );

  const quietBefore = resolved;
  frame = await stepEvidence(cdp, QUIET_TICKS);
  canonical = await canonicalSnapshot(cdp);
  const quietAfter = summarize(canonical, frame);
  const quiet = { ticks: QUIET_TICKS, before: quietBefore, after: quietAfter };
  if (visualEvidence) visualEvidence.quiet = await captureFrozenScreenshot(
    cdp,
    "r4-dense-workshop-04-quiet.png",
    canonical,
  );

  return {
    runIndex,
    initial,
    relocated,
    blocked,
    resolved,
    quiet,
    relocatedHash: hashJson(projectDeterministic(relocated)),
    blockedHash: hashJson(projectDeterministic(blocked)),
    resolvedHash: hashJson(projectDeterministic(resolved)),
    quietHash: hashJson(projectDeterministic(quiet)),
    visualEvidence,
  };
}

function summarize(canonical, frame) {
  const life = frame?.selectedLife ?? null;
  const primary = life?.matters?.find((matter) => matter.id === PRIMARY_MATTER_ID) ?? null;
  const secondary = life?.matters?.find((matter) => matter.id === SECONDARY_MATTER_ID) ?? null;
  const primaryWorld = canonical.authoritativeWorld?.materialObjects?.find((entry) => entry.id === PRIMARY_OBJECT_ID) ?? null;
  const secondaryWorld = canonical.authoritativeWorld?.materialObjects?.find((entry) => entry.id === SECONDARY_OBJECT_ID) ?? null;
  const irrelevantWorld = canonical.authoritativeWorld?.materialObjects?.find((entry) => entry.id === IRRELEVANT_OBJECT_ID) ?? null;
  const primaryKnowledge = canonical.residentPrivate?.materialKnowledge?.find((entry) => entry.objectId === PRIMARY_OBJECT_ID) ?? null;
  const janek = canonical.authoritativeWorld?.actors?.find((actor) => actor.id === JANEK_ID) ?? null;

  return {
    scenarioId: canonical.scenarioId ?? null,
    tick: canonical.tick ?? null,
    primary,
    secondary,
    body: life?.body ?? null,
    primaryWorld,
    secondaryWorld,
    irrelevantWorld,
    primaryKnowledge,
    janekPosition: janek?.position ?? null,
    pendingCognitionReasonCount: canonical.residentPrivate?.diagnostics?.publicState?.pendingCognitionReasonCount ?? null,
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
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=r4-dense-workshop` });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`,
  ), 20_000, "R4 dense-workshop evidence scene");
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
async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`, 60_000);
}

async function evaluate(cdp, expression, timeoutMs = 30_000) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
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
function stableJson(value) { return JSON.stringify(sortValue(value)); }
function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
}
function nearPosition(a, b, tolerance = 1e-9) {
  return Boolean(a && b && Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance);
}
function samePosition(a, b, tolerance = 1e-9) { return nearPosition(a, b, tolerance); }
function distance(a, b) {
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : Number.POSITIVE_INFINITY;
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
