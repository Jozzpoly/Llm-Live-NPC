import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.IDA_MESSAGE_OUTPUT ?? "evidence/browser/ida-message-delivery.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const REPEAT_COUNT = 3;
const MAX_STEPS = 1_500;
const IDA_ID = "resident.ida";
const JANEK_ID = "resident.janek";
const MIRA_ID = "resident.mira";
const OREN_ID = "resident.oren";
const NELA_ID = "resident.nela";
const PLAYER_ID = "player.jozz";
const MATTER_ID = "matter.ida.message-for-janek";
const RUN_ID = "run.ida.deliver-message-to-janek";
const MESSAGE = "Mira says the field well needs checking before dusk.";

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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-ida-message-`);
  const port = 12_100 + Math.floor(Math.random() * 400);
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
    claimScope: {
      causal: "Ida executes one already-accepted social commitment through private contact evidence and factual World speech.",
      epistemic: "This positive browser specimen does not replace the deterministic hidden-recipient relational proof.",
      participantReadability: "MANUAL_REVIEW_REQUIRED",
      understanding: "NOT_CLAIMED: addressed hearing does not prove recipient understanding or responsibility.",
    },
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
      report.runs.push(await captureDeliveryRun(cdp, runIndex));
    }
    report.visualEvidence = report.runs[0]?.visualEvidence ?? null;

    const first = report.runs[0];
    assert(report, "browser opens the Ida social slice with one exact active social run and no invented material-private extension", Boolean(
      first?.initial?.scenarioId === "browser-ida-message-delivery"
      && first.initial.residentId === IDA_ID
      && first.initial.matterId === MATTER_ID
      && first.initial.matterStatus === "active"
      && first.initial.activeRunId === RUN_ID
      && first.initial.activeRunCanMutateWorld === true
      && first.initial.originEvidenceKind === "accepted_social_commitment"
      && first.initial.materialKnowledgeCount === 0
    ), first?.initial ?? null);

    assert(report, "Ida's exact social run owns real body movement before contact", Boolean(
      first?.enRoute?.activeRunId === RUN_ID
      && first.enRoute.activeRunCanMutateWorld === true
      && distance(first.enRoute.idaPosition, first.initial.idaPosition) > 40
      && vectorMagnitude(first.enRoute.idaVelocity) > 0.01
    ), { initial: first?.initial ?? null, enRoute: first?.enRoute ?? null });

    assert(report, "Ida legally reacquires Janek through her private sight stream before factual delivery", Boolean(
      first?.reacquired?.activeRunId === RUN_ID
      && first.reacquired.activeRunCanMutateWorld === true
      && first.reacquired.janekSightPercept
      && first.reacquired.janekSightPercept.actorId === JANEK_ID
      && first.reacquired.janekSightPercept.modality === "sight"
    ), first?.reacquired ?? null);

    assert(report, "matter resolves only with one exact Ida World speech occurrence to Janek", Boolean(
      first?.resolved?.matterStatus === "resolved"
      && first.resolved.activeRunId === null
      && first.resolved.activeRunCanMutateWorld === false
      && first.resolved.deliveryOccurrence?.actorId === IDA_ID
      && first.resolved.deliveryOccurrence?.text === MESSAGE
      && first.resolved.deliveryOccurrence?.addressedActorIds?.length === 1
      && first.resolved.deliveryOccurrence?.addressedActorIds?.[0] === JANEK_ID
      && first.resolved.lastOutcomeEvidenceSummary?.includes(first.resolved.deliveryOccurrence.id)
    ), first?.resolved ?? null);

    assert(report, "the same factual occurrence becomes Janek addressed hearing and Mira unaddressed hearing", Boolean(
      first?.privateJoin?.occurrenceId
      && first.privateJoin.occurrenceId === first.resolved.deliveryOccurrence?.id
      && first.privateJoin.janek?.occurrenceId === first.privateJoin.occurrenceId
      && first.privateJoin.janek?.text === MESSAGE
      && first.privateJoin.janek?.addressed === true
      && first.privateJoin.mira?.occurrenceId === first.privateJoin.occurrenceId
      && first.privateJoin.mira?.text === MESSAGE
      && first.privateJoin.mira?.addressed === false
      && first.privateJoin.oren === null
      && first.privateJoin.nela === null
    ), first?.privateJoin ?? null);

    assert(report, "authoritative participant world contains one Owner player identity and five unique resident identities", Boolean(
      first?.resolved?.actorIds?.length === 6
      && new Set(first.resolved.actorIds).size === first.resolved.actorIds.length
      && first.resolved.actorIds.filter((id) => id === PLAYER_ID).length === 1
      && [IDA_ID, JANEK_ID, MIRA_ID, OREN_ID, NELA_ID].every((id) => first.resolved.actorIds.includes(id))
    ), first?.resolved?.actorIds ?? null);

    for (const checkpoint of ["initialHash", "enRouteHash", "reacquiredHash", "resolvedHash"]) {
      const hashes = report.runs.map((entry) => entry[checkpoint]);
      assert(report, `${checkpoint} is exactly reproducible across real-Chrome reloads`, hashes.every((hash) => hash === hashes[0]), hashes);
    }
    for (const checkpoint of ["reacquired", "resolved"]) {
      const ticks = report.runs.map((entry) => entry[checkpoint]?.tick ?? null);
      assert(report, `${checkpoint} occurs at the same World tick across reloads`, ticks.every((tick) => tick === ticks[0]), ticks);
    }

    const images = Object.values(first?.visualEvidence ?? {});
    assert(report, "every Ida participant/research PNG is non-empty, canonically frozen and independently SHA-256 identified", Boolean(
      images.length === 4
      && images.every((entry) => entry.bytes > 10_000
        && /^[a-f0-9]{64}$/u.test(entry.sha256)
        && /^[a-f0-9]{64}$/u.test(entry.canonicalHash)
        && entry.canonicalBeforeHash === entry.canonicalAfterHash)
    ), first?.visualEvidence ?? null);

    assert(report, "Ida browser specimen has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

async function captureDeliveryRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  await selectResident(cdp, IDA_ID);
  if (runIndex === 0) {
    await focusSelected(cdp);
    await setWorldOnly(cdp, true);
  }

  let canonical = await canonicalSnapshot(cdp);
  const initial = summarize(canonical);
  const initialHash = hashJson(initial);
  const visualEvidence = runIndex === 0 ? {} : null;
  if (visualEvidence) {
    visualEvidence.startWorld = await captureFrozenScreenshot(cdp, "ida-message-01-start-world.png", canonical, "world-only");
  }

  let enRoute = null;
  let reacquired = null;
  let resolved = null;
  let guard = 0;

  while (!resolved && guard < MAX_STEPS) {
    await stepEvidence(cdp, 1);
    canonical = await canonicalSnapshot(cdp);
    const current = summarize(canonical);
    guard += 1;

    if (!enRoute && distance(current.idaPosition, initial.idaPosition) > 60 && vectorMagnitude(current.idaVelocity) > 0.01) {
      enRoute = current;
    }

    if (!reacquired && current.janekSightPercept) {
      reacquired = current;
      if (visualEvidence) {
        visualEvidence.reacquiredWorld = await captureFrozenScreenshot(cdp, "ida-message-02-reacquired-world.png", canonical, "world-only");
      }
    }

    if (current.matterStatus === "resolved" && current.deliveryOccurrence) {
      resolved = current;
      if (visualEvidence) {
        visualEvidence.deliveredWorld = await captureFrozenScreenshot(cdp, "ida-message-03-delivered-world.png", canonical, "world-only");
        await setWorldOnly(cdp, false);
        await selectResident(cdp, IDA_ID);
        visualEvidence.deliveredResearch = await captureFrozenScreenshot(cdp, "ida-message-04-delivered-research.png", canonical, "research");
      }
    }
  }

  if (!enRoute || !reacquired || !resolved) {
    throw new Error(`run ${runIndex}: Ida delivery did not reach all causal checkpoints within ${MAX_STEPS} steps`);
  }

  const privateJoin = await capturePrivateDeliveryJoin(cdp, resolved.deliveryOccurrence.id, canonical);

  return {
    runIndex,
    worldSteps: guard,
    initial,
    enRoute,
    reacquired,
    resolved,
    privateJoin,
    initialHash,
    enRouteHash: hashJson(enRoute),
    reacquiredHash: hashJson(reacquired),
    resolvedHash: hashJson(resolved),
    visualEvidence,
  };
}

function summarize(snapshot) {
  const actors = snapshot.authoritativeWorld?.actors ?? [];
  const ida = actors.find((actor) => actor.id === IDA_ID) ?? null;
  const janekSightPercept = latestActorSight(snapshot.residentPrivate?.diagnostics?.recentPercepts ?? [], JANEK_ID);
  const deliveryOccurrence = [...(snapshot.authoritativeWorld?.recentOccurrences ?? [])]
    .reverse()
    .find((occurrence) => occurrence.kind === "speech" && occurrence.actorId === IDA_ID && occurrence.text === MESSAGE) ?? null;
  return {
    scenarioId: snapshot.scenarioId ?? null,
    tick: snapshot.tick ?? null,
    residentId: snapshot.residentPrivate?.residentId ?? null,
    matterId: snapshot.continuity?.matter?.id ?? null,
    matterStatus: snapshot.continuity?.matter?.status ?? null,
    semanticRevision: snapshot.continuity?.matter?.semanticRevision ?? null,
    semanticCourse: snapshot.continuity?.matter?.semanticCourse ?? null,
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? null,
    originEvidenceKind: snapshot.continuity?.originEvidence?.kind ?? null,
    lastOutcomeEvidenceSummary: snapshot.continuity?.lastOutcomeEvidence?.summary ?? null,
    materialKnowledgeCount: snapshot.residentPrivate?.materialKnowledge?.length ?? null,
    idaPosition: ida?.position ?? null,
    idaVelocity: ida?.velocity ?? null,
    idaFacing: ida?.facing ?? null,
    janekSightPercept,
    deliveryOccurrence,
    actorIds: actors.map((actor) => actor.id).sort(),
  };
}

function latestActorSight(percepts, actorId) {
  const candidates = percepts.filter((percept) => percept.actorId === actorId
    && (percept.phenomenon === "actor_sight_enter"
      || percept.phenomenon === "actor_sight_update"
      || percept.phenomenon === "actor_sight_exit"));
  const latest = candidates.at(-1) ?? null;
  if (!latest || latest.phenomenon === "actor_sight_exit") return null;
  return latest;
}

async function capturePrivateDeliveryJoin(cdp, occurrenceId, frozenCanonical) {
  const frozenHash = hashJson(frozenCanonical);
  const result = { occurrenceId, janek: null, mira: null, oren: null, nela: null };
  for (const [key, residentId] of [
    ["janek", JANEK_ID],
    ["mira", MIRA_ID],
    ["oren", OREN_ID],
    ["nela", NELA_ID],
  ]) {
    await selectResident(cdp, residentId);
    const frame = await evidenceSnapshot(cdp);
    result[key] = frame.selectedDiagnostics?.recentPercepts?.find((percept) => percept.occurrenceId === occurrenceId) ?? null;
    const after = await canonicalSnapshot(cdp);
    if (hashJson(after) !== frozenHash) throw new Error(`presentation-only resident selection mutated canonical state for ${residentId}`);
  }
  return result;
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=ida-message-delivery` });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 20_000, "Ida message-delivery evidence scene");
}

async function selectResident(cdp, residentId) {
  const selected = await evaluate(cdp, `(() => {
    const node = document.querySelector('[data-resident=${JSON.stringify(residentId)}]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!selected) throw new Error(`unable to select resident ${residentId}`);
  await sleep(25);
}

async function focusSelected(cdp) {
  const focused = await evaluate(cdp, `(() => {
    const node = document.querySelector('[data-action="focus"]');
    if (!node) return false;
    node.click();
    return true;
  })()`);
  if (!focused) throw new Error("unable to focus selected resident");
  await sleep(50);
}

async function setWorldOnly(cdp, enabled) {
  const changed = await evaluate(cdp, `(() => {
    const node = document.querySelector('.spc-world-mode-toggle');
    if (!node) return false;
    const current = node.getAttribute('aria-pressed') === 'true';
    if (current !== ${JSON.stringify(enabled)}) node.click();
    return true;
  })()`);
  if (!changed) throw new Error("unable to set world-only presentation mode");
  await sleep(60);
}

async function captureFrozenScreenshot(cdp, fileName, canonicalBefore, presentationMode) {
  await sleep(70);
  const canonicalBeforeHash = hashJson(canonicalBefore);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const bytes = Buffer.from(data, "base64");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  writeFileSync(resolve(OUTPUT_DIR, fileName), bytes);
  const canonicalAfter = await canonicalSnapshot(cdp);
  const canonicalAfterHash = hashJson(canonicalAfter);
  if (canonicalBeforeHash !== canonicalAfterHash) throw new Error(`screenshot ${fileName} mutated canonical World state`);
  return {
    fileName,
    presentationMode,
    tick: canonicalBefore.tick,
    bytes: bytes.length,
    sha256,
    canonicalHash: canonicalBeforeHash,
    canonicalBeforeHash,
    canonicalAfterHash,
  };
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

function distance(a, b) {
  if (!a || !b) return 0;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function vectorMagnitude(vector) {
  if (!vector) return 0;
  return Math.hypot(vector.x, vector.y);
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
