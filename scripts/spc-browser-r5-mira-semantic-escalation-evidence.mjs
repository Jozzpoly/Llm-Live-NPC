import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(
  process.env.R5_MIRA_SEMANTIC_ESCALATION_OUTPUT
    ?? "evidence/browser/r5-mira-semantic-escalation.json",
);
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };

const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const IDA_PROMPT = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
const MIRA_REPLY = "Tak, zostanę chwilę.";
const PRE_QUIET_TICKS = 120;
const PROVIDER_LATENCY_TICKS = 600;
const POST_SETTLEMENT_QUIET_TICKS = 600;
const EXECUTION_GUARD = 600;
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r5-mira-semantic-`);
  const port = 13_450 + Math.floor(Math.random() * 250);
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
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?about:blank`,
      { method: "PUT" },
    );
    if (!targetResponse.ok) {
      throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
    }
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

    assert(report, "R5-A browser begins no-player, matter-free and provider-free", Boolean(
      first?.initial?.canonical?.scenarioId === "browser-r5-mira-semantic-escalation"
      && first.initial.actorIds.join(",") === [IDA_ID, MIRA_ID].sort().join(",")
      && first.initial.playerPresent === false
      && first.initial.provider.providerRequestCount === 0
      && first.initial.life.matters.length === 0
      && first.initial.pendingReasons.length === 0
    ), first?.initial ?? null);

    assert(report, "pre-event quiet does not manufacture semantic/provider work", Boolean(
      first?.preQuiet?.ticks === PRE_QUIET_TICKS
      && samePosition(first.preQuiet.before.miraPosition, first.preQuiet.after.miraPosition)
      && first.preQuiet.after.provider.providerRequestCount === 0
      && first.preQuiet.after.life.matters.length === 0
      && first.preQuiet.after.pendingReasons.length === 0
    ), first?.preQuiet ?? null);

    const providerContext = first?.requestStarted?.providerContexts?.[0] ?? null;
    const originReason = providerContext?.reasons?.[0] ?? null;
    const originPercept = originReason
      ? providerContext.recentPercepts?.find((percept) => percept.id === originReason.evidenceIds?.[0])
      : null;

    assert(report, "one exact Ida addressed-speech reason starts one provider attempt without a matter", Boolean(
      first?.requestStarted?.provider.providerRequestCount === 1
      && first.requestStarted.provider.providerInFlightRequestId
      && first.requestStarted.provider.providerInboxCount === 0
      && first.requestStarted.life.matters.length === 0
      && first.requestStarted.life.body.focusedRunId === null
      && providerContext?.contract === "resident_life_cognition_v1"
      && providerContext?.resident?.id === MIRA_ID
      && providerContext?.reasons?.length === 1
      && originReason?.kind === "heard_speech"
      && originReason?.salience === 1
      && originPercept?.phenomenon === "speech"
      && originPercept?.modality === "hearing"
      && originPercept?.actorId === IDA_ID
      && originPercept?.text === IDA_PROMPT
      && originPercept?.addressed === true
    ), first?.requestStarted ?? null);

    assert(report, "600 World ticks during provider latency stay alive without duplicate request or commitment", Boolean(
      first?.latency?.ticks === PROVIDER_LATENCY_TICKS
      && samePosition(first.latency.before.miraPosition, first.latency.after.miraPosition)
      && first.latency.after.provider.providerRequestCount === 1
      && first.latency.after.provider.providerInFlightRequestId
      && first.latency.after.provider.providerInboxCount === 0
      && first.latency.after.life.matters.length === 0
      && first.latency.after.life.body.focusedRunId === null
      && pressureStatus(first.latency.after, originReason?.id) === "in_flight"
    ), first?.latency ?? null);

    assert(report, "released provider completion is inert until the next World admission boundary", Boolean(
      first?.arrival?.provider.providerRequestCount === 1
      && first.arrival.provider.providerInFlightRequestId === null
      && first.arrival.provider.providerInboxCount === 1
      && first.arrival.life.matters.length === 0
      && first.arrival.life.body.focusedRunId === null
      && first.arrival.canonical.tick === first.latency.after.canonical.tick
      && samePosition(first.arrival.miraPosition, first.latency.after.miraPosition)
      && pressureStatus(first.arrival, originReason?.id) === "in_flight"
    ), first?.arrival ?? null);

    const admittedMatter = first?.admitted?.life?.matters?.find(
      (matter) => matter.status === "active" && matter.semanticIntent?.kind === "communicate_actor",
    ) ?? null;

    assert(report, "next World boundary locally admits one exact communicate commitment and settles the origin reason", Boolean(
      first?.admitted?.canonical.tick === first.arrival.canonical.tick + 1
      && first.admitted.provider.providerRequestCount === 1
      && first.admitted.provider.providerInboxCount === 0
      && admittedMatter
      && admittedMatter.semanticIntent?.targetActorId === IDA_ID
      && admittedMatter.semanticIntent?.text === MIRA_REPLY
      && admittedMatter.activeRun?.runId === first.admitted.life.body.focusedRunId
      && pressureStatus(first.admitted, originReason?.id) === "settled"
    ), first?.admitted ?? null);

    assert(report, "admitted semantic commitment executes through World exactly once and factually resolves", Boolean(
      first?.resolved?.replyCount === 1
      && first.resolved.reply?.actorId === MIRA_ID
      && first.resolved.reply?.text === MIRA_REPLY
      && first.resolved.reply?.addressedActorIds?.includes(IDA_ID)
      && first.resolved.life.matters.some(
        (matter) => matter.id === admittedMatter?.id
          && matter.status === "resolved"
          && matter.activeRun === null,
      )
      && first.resolved.life.body.focusedRunId === null
      && first.resolved.provider.providerRequestCount === 1
      && pressureStatus(first.resolved, originReason?.id) === "settled"
    ), first?.resolved ?? null);

    assert(report, "600 post-settlement ticks keep Mira semantically quiet with no provider/reply/matter echo", Boolean(
      first?.postQuiet?.ticks === POST_SETTLEMENT_QUIET_TICKS
      && first.postQuiet.after.provider.providerRequestCount === 1
      && first.postQuiet.after.provider.providerInFlightRequestId === null
      && first.postQuiet.after.provider.providerInboxCount === 0
      && first.postQuiet.after.pendingReasons.length === 0
      && first.postQuiet.after.replyCount === 1
      && first.postQuiet.after.life.body.focusedRunId === null
      && stableJson(first.postQuiet.after.life.matters) === stableJson(first.resolved.life.matters)
      && pressureStatus(first.postQuiet.after, originReason?.id) === "settled"
    ), first?.postQuiet ?? null);

    for (const key of [
      "initialHash",
      "preQuietHash",
      "requestStartedHash",
      "latencyHash",
      "arrivalHash",
      "admittedHash",
      "resolvedHash",
      "postQuietHash",
    ]) {
      const hashes = report.runs.map((entry) => entry[key]);
      assert(
        report,
        `${key} is deterministic across real-Chrome reloads`,
        hashes.every((hash) => hash === hashes[0]),
        hashes,
      );
    }

    assert(
      report,
      "R5-A deterministic browser fixture makes no real provider/API network request",
      report.providerLikeRequests.length === 0,
      report.providerLikeRequests,
    );
    assert(
      report,
      "R5-A browser specimen has no uncaught runtime exception",
      report.runtimeExceptions.length === 0,
      report.runtimeExceptions,
    );
    assert(report, "R5-A screenshots are non-empty and canonically read-only", Boolean(
      first?.visualEvidence?.latency?.bytes > 10_000
      && first.visualEvidence?.arrival?.bytes > 10_000
      && first.visualEvidence?.admitted?.bytes > 10_000
      && first.visualEvidence?.resolved?.bytes > 10_000
      && first.visualEvidence?.postQuiet?.bytes > 10_000
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
    rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 100,
    });
  }
}

async function captureRun(cdp, runIndex) {
  await navigateEvidence(cdp);
  if (runIndex === 0) await focusMiraWorldOnly(cdp);

  // First ordinary tick establishes private visual recognition of Ida.
  await stepEvidence(cdp, 1);
  const initial = await captureState(cdp);
  const visualEvidence = runIndex === 0 ? {} : null;

  const preQuietBefore = initial;
  await stepEvidence(cdp, PRE_QUIET_TICKS);
  const preQuietAfter = await captureState(cdp);
  const preQuiet = {
    ticks: PRE_QUIET_TICKS,
    before: preQuietBefore,
    after: preQuietAfter,
  };

  await scenarioAction(cdp, "ida-address-mira");
  await stepEvidence(cdp, 1);
  const requestStarted = await captureState(cdp);

  const latencyBefore = requestStarted;
  await stepEvidence(cdp, PROVIDER_LATENCY_TICKS);
  const latencyAfter = await captureState(cdp);
  const latency = {
    ticks: PROVIDER_LATENCY_TICKS,
    before: latencyBefore,
    after: latencyAfter,
  };
  if (visualEvidence) {
    visualEvidence.latency = await captureFrozenScreenshot(
      cdp,
      "r5-mira-semantic-01-provider-latency.png",
      latencyAfter.canonical,
    );
  }

  await scenarioAction(cdp, "release-provider");
  await waitUntil(async () => {
    const state = await scenarioSnapshot(cdp);
    return state?.diagnostics?.providerInboxCount === 1;
  }, 10_000, "R5 provider inert arrival");
  const arrival = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.arrival = await captureFrozenScreenshot(
      cdp,
      "r5-mira-semantic-02-inert-arrival.png",
      arrival.canonical,
    );
  }

  await stepEvidence(cdp, 1);
  const admitted = await captureState(cdp);
  if (visualEvidence) {
    visualEvidence.admitted = await captureFrozenScreenshot(
      cdp,
      "r5-mira-semantic-03-admitted-commitment.png",
      admitted.canonical,
    );
  }

  let resolved = null;
  for (let index = 0; index < EXECUTION_GUARD && !resolved; index += 1) {
    await stepEvidence(cdp, 1);
    const candidate = await captureState(cdp);
    const activeOrResolved = candidate.life.matters.find(
      (matter) => matter.semanticIntent?.kind === "communicate_actor"
        && matter.semanticIntent?.targetActorId === IDA_ID
        && matter.semanticIntent?.text === MIRA_REPLY,
    );
    if (activeOrResolved?.status === "resolved" && candidate.replyCount === 1) {
      resolved = candidate;
    }
  }
  if (!resolved) throw new Error(`run ${runIndex}: R5 semantic reply did not factually resolve`);
  if (visualEvidence) {
    visualEvidence.resolved = await captureFrozenScreenshot(
      cdp,
      "r5-mira-semantic-04-reply-resolved.png",
      resolved.canonical,
    );
  }

  const postQuietBefore = resolved;
  await stepEvidence(cdp, POST_SETTLEMENT_QUIET_TICKS);
  const postQuietAfter = await captureState(cdp);
  const postQuiet = {
    ticks: POST_SETTLEMENT_QUIET_TICKS,
    before: postQuietBefore,
    after: postQuietAfter,
  };
  if (visualEvidence) {
    visualEvidence.postQuiet = await captureFrozenScreenshot(
      cdp,
      "r5-mira-semantic-05-post-settlement-quiet.png",
      postQuietAfter.canonical,
    );
  }

  return {
    runIndex,
    initial,
    preQuiet,
    requestStarted,
    latency,
    arrival,
    admitted,
    resolved,
    postQuiet,
    initialHash: hashJson(projectDeterministic(initial)),
    preQuietHash: hashJson(projectDeterministic(preQuiet)),
    requestStartedHash: hashJson(projectDeterministic(requestStarted)),
    latencyHash: hashJson(projectDeterministic(latency)),
    arrivalHash: hashJson(projectDeterministic(arrival)),
    admittedHash: hashJson(projectDeterministic(admitted)),
    resolvedHash: hashJson(projectDeterministic(resolved)),
    postQuietHash: hashJson(projectDeterministic(postQuiet)),
    visualEvidence,
  };
}

async function captureState(cdp) {
  const canonical = await canonicalSnapshot(cdp);
  const scenario = await scenarioSnapshot(cdp);
  const provider = scenario.diagnostics;
  const life = scenario.life;
  const semanticPressure = scenario.semanticPressure;
  const recentOccurrences = scenario.recentOccurrences ?? [];
  const replies = recentOccurrences.filter(
    (occurrence) => occurrence.kind === "speech"
      && occurrence.actorId === MIRA_ID
      && occurrence.text === MIRA_REPLY
      && occurrence.addressedActorIds?.includes(IDA_ID),
  );

  return {
    canonical,
    actorIds: (canonical.authoritativeWorld?.actors ?? []).map((actor) => actor.id).sort(),
    playerPresent: (canonical.authoritativeWorld?.actors ?? []).some((actor) => actor.kind === "player"),
    provider,
    life,
    semanticPressure,
    pendingReasons: provider.pendingReasonIds ?? [],
    providerContexts: scenario.providerContexts ?? [],
    miraPosition: scenario.miraPosition,
    idaPosition: scenario.idaPosition,
    replyCount: replies.length,
    reply: replies.at(-1) ?? null,
  };
}

function pressureStatus(state, reasonId) {
  return state?.semanticPressure?.find((entry) => entry.reason?.id === reasonId)?.status ?? null;
}

async function navigateEvidence(cdp) {
  await cdp.send("Page.navigate", {
    url: `${BASE_URL}/?spc=1&evidence=1&scenario=r5-mira-semantic-escalation`,
  });
  await waitUntil(async () => await evaluate(
    cdp,
    `Boolean(window.__SPC_EVIDENCE__?.ready?.()
      && typeof window.__SPC_EVIDENCE__?.scenarioAction === "function"
      && document.querySelector("canvas"))`,
  ), 20_000, "R5 Mira semantic-escalation evidence scene");
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

async function scenarioSnapshot(cdp) {
  return await scenarioAction(cdp, "snapshot");
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
