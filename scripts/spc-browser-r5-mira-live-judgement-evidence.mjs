import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/r5-mira-live-judgement.json",
);
const EXPECTED_MODEL = "gpt-5.6-luna";
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const MIRA_ID = "resident.mira";
const IDA_ID = "resident.ida";
const PRIMARY_PROMPT = "Mira, odpowiesz mi, czy zostaniesz chwilę przy stole?";
const SECOND_PROMPT = "Mira, jeszcze jedno pytanie?";
const UPSTREAM_BUDGET = 1;

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
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

const report = {
  schemaVersion: 1,
  sourceSha: SOURCE_SHA,
  candidateBaseUrl: BASE_URL,
  purpose: "one-shot real GPT-5.6 Luna judgement through the qualified R5 Mira/Ida organism, with a hard one-upstream-request budget and an explicit blocked-second-request safety attack",
  startedAt: new Date().toISOString(),
  chrome: null,
  assertions: [],
  spendFreePreflight: {},
  runtimeExceptions: [],
  primary: null,
  hardBudgetAttack: null,
};

function assert(name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

async function boundedFetch(url, init = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  const base = BASE_URL.replace(/\/$/u, "");

  const healthResponse = await boundedFetch(`${base}/api/health`, {
    headers: { accept: "application/json" },
  });
  const health = await healthResponse.json();
  report.spendFreePreflight.health = {
    status: healthResponse.status,
    lifeIntentEndpoint: health?.spcNextLifeIntentEndpoint ?? null,
    model: health?.spcNextLifeIntentModelConfigured ?? null,
    keyConfigured: health?.hearthKeyConfigured ?? null,
  };
  assert(
    "exact preview exposes the dedicated life-intent endpoint",
    healthResponse.ok && health?.spcNextLifeIntentEndpoint === "/api/spc-next/life-intent",
    report.spendFreePreflight.health,
  );
  assert(
    "exact preview is configured for GPT-5.6 Luna",
    health?.spcNextLifeIntentModelConfigured === EXPECTED_MODEL,
    report.spendFreePreflight.health,
  );
  assert(
    "exact preview reports a configured provider key before spend",
    health?.hearthKeyConfigured === true,
    report.spendFreePreflight.health,
  );

  const methodResponse = await boundedFetch(`${base}/api/spc-next/life-intent`, { method: "GET" });
  const methodBody = await methodResponse.json();
  report.spendFreePreflight.methodBoundary = {
    status: methodResponse.status,
    code: methodBody?.code ?? null,
  };
  assert(
    "spend-free method probe fails closed before inference",
    methodResponse.status === 405 && methodBody?.code === "method_not_allowed",
    report.spendFreePreflight.methodBoundary,
  );

  if (!report.assertions.every((entry) => entry.pass)) {
    throw new Error("spend-free R5 live-provider preflight failed; provider request not attempted");
  }

  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-r5-live-`);
  const port = 14_100 + Math.floor(Math.random() * 200);
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
  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(
      `http://127.0.0.1:${port}/json/new?about:blank`,
      { method: "PUT" },
    );
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
      cdp.send("Network.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    await cdp.send("Page.navigate", {
      url: `${base}/?spc=1&evidence=1&scenario=r5-mira-live-semantic-escalation`,
    });
    await waitUntil(async () => await evaluate(
      cdp,
      `Boolean(window.__SPC_EVIDENCE__?.ready?.()
        && typeof window.__SPC_EVIDENCE__?.scenarioAction === "function"
        && document.querySelector("canvas"))`,
    ), 20_000, "R5 live evidence scene");

    await stepEvidence(cdp, 1);
    const initial = await scenarioSnapshot(cdp);
    const actorIds = (await canonicalSnapshot(cdp)).authoritativeWorld.actors.map((actor) => actor.id);
    assert(
      "one-shot scene contains Mira and Ida with no player dependency",
      actorIds.includes(MIRA_ID) && actorIds.includes(IDA_ID) && !actorIds.includes("player.jozz"),
      actorIds,
    );
    assert(
      "hard provider budget is armed at exactly one upstream request",
      initial.providerBudget?.maxUpstreamRequests === UPSTREAM_BUDGET
        && initial.providerBudget?.upstreamRequestsStarted === 0
        && initial.providerBudget?.blockedRequests === 0,
      initial.providerBudget ?? null,
    );

    await scenarioAction(cdp, "ida-address-mira");
    await stepEvidence(cdp, 1);
    const requestStarted = await scenarioSnapshot(cdp);
    const originReason = requestStarted.semanticPressure?.find(
      (entry) => entry.status === "in_flight" && entry.reason?.kind === "heard_speech",
    )?.reason ?? null;

    assert(
      "one exact Ida addressed-speech reason starts the only permitted upstream request",
      Boolean(
        originReason
        && originReason.summary?.includes(PRIMARY_PROMPT)
        && requestStarted.diagnostics?.providerRequestCount === 1
        && requestStarted.providerBudget?.upstreamRequestsStarted === 1
        && requestStarted.providerBudget?.exhausted === true
        && requestStarted.life?.matters?.length === 0
      ),
      { originReason, diagnostics: requestStarted.diagnostics, providerBudget: requestStarted.providerBudget },
    );

    // Real provider work may take wall-clock time. Keep the authoritative World alive
    // for a bounded interval; R5-A already proved arbitrary 600-tick deterministic
    // latency, so this provider-specific probe only needs to preserve the same edge.
    await stepEvidence(cdp, 120);
    await waitUntil(async () => {
      const state = await scenarioSnapshot(cdp);
      return state?.diagnostics?.providerInboxCount === 1;
    }, 45_000, "one real Luna arrival");
    const arrival = await scenarioSnapshot(cdp);

    const observation = arrival.providerObservations?.[0] ?? null;
    const providerBody = observation?.body ?? null;
    const usage = providerBody?.usage ?? null;
    const proposal = providerBody?.proposal ?? null;

    assert(
      "exactly one real upstream response is observed with non-zero Luna usage",
      Boolean(
        arrival.providerObservations?.length === 1
        && observation?.status === 200
        && providerBody?.ok === true
        && providerBody?.originReasonId === originReason?.id
        && usage?.model === EXPECTED_MODEL
        && Number.isSafeInteger(usage?.inputTokens)
        && usage.inputTokens > 0
        && Number.isSafeInteger(usage?.outputTokens)
        && usage.outputTokens > 0
        && Number.isSafeInteger(usage?.totalTokens)
        && usage.totalTokens >= usage.inputTokens + usage.outputTokens
      ),
      { observation, originReasonId: originReason?.id ?? null },
    );
    assert(
      "real provider completion remains inert before World admission",
      Boolean(
        arrival.diagnostics?.providerInboxCount === 1
        && arrival.life?.matters?.length === 0
        && arrival.semanticPressure?.some(
          (entry) => entry.reason?.id === originReason?.id && entry.status === "in_flight",
        )
      ),
      { diagnostics: arrival.diagnostics, life: arrival.life, semanticPressure: arrival.semanticPressure },
    );

    await stepEvidence(cdp, 1);
    const admitted = await scenarioSnapshot(cdp);
    const admission = admitted.lastAdmissions?.[0] ?? null;
    assert(
      "real Luna judgement crosses only through the qualified local admission boundary",
      Boolean(
        admission
        && admission.status === "applied"
        && admission.residentId === MIRA_ID
        && ["accept", "decline", "defer", "clarify"].includes(admission.decision)
      ),
      { admission, proposal },
    );

    let postOutcome = admitted;
    if (admission?.status === "applied" && admission.commitment) {
      for (let guard = 0; guard < 180; guard += 1) {
        await stepEvidence(cdp, 1);
        postOutcome = await scenarioSnapshot(cdp);
        const matter = postOutcome.life?.matters?.find(
          (entry) => entry.id === admission.commitment.matterId,
        );
        if (matter?.status === "resolved") break;
      }
      const matter = postOutcome.life?.matters?.find(
        (entry) => entry.id === admission.commitment.matterId,
      );
      assert(
        "accepted real judgement can reach factual bounded completion through World authority",
        matter?.status === "resolved",
        { admission, matter, recentOccurrences: postOutcome.recentOccurrences },
      );
    } else {
      assert(
        "non-accept real judgement creates no ghost commitment",
        postOutcome.life?.matters?.length === 0,
        { admission, life: postOutcome.life },
      );
    }

    const screenshot = await captureFrozenScreenshot(
      cdp,
      "r5-mira-live-judgement.png",
      await canonicalSnapshot(cdp),
    );

    report.primary = {
      originReason,
      proposal,
      admission,
      usage,
      providerObservation: observation,
      providerBudget: postOutcome.providerBudget,
      semanticPressure: postOutcome.semanticPressure,
      life: postOutcome.life,
      recentOccurrences: postOutcome.recentOccurrences,
      screenshot,
    };

    // Safety attack: create a fresh legitimate second semantic pressure and allow the
    // local host to try cognition again. The experiment wrapper must block it before
    // upstream network IO; providerObservations therefore remains length=1.
    await scenarioAction(cdp, "ida-address-mira");
    await stepEvidence(cdp, 1);

    await waitUntil(async () => {
      const state = await scenarioSnapshot(cdp);
      return state?.providerBudget?.blockedRequests >= 1
        || state?.diagnostics?.providerInboxCount >= 1;
    }, 10_000, "hard-budget blocked second cognition attempt");

    let blocked = await scenarioSnapshot(cdp);
    if (blocked.diagnostics?.providerInboxCount > 0) {
      await stepEvidence(cdp, 1);
      blocked = await scenarioSnapshot(cdp);
    }

    report.hardBudgetAttack = {
      providerBudget: blocked.providerBudget,
      providerObservations: blocked.providerObservations,
      diagnostics: blocked.diagnostics,
      semanticPressure: blocked.semanticPressure,
      life: blocked.life,
    };

    assert(
      "fresh second cognition demand is blocked locally before a second upstream request",
      Boolean(
        blocked.providerBudget?.attemptedRequests >= 2
        && blocked.providerBudget?.upstreamRequestsStarted === 1
        && blocked.providerBudget?.blockedRequests >= 1
        && blocked.providerObservations?.length === 1
      ),
      report.hardBudgetAttack,
    );
    assert(
      "hard-budget rejection creates no ghost matter or World authority",
      !blocked.life?.matters?.some((matter) => matter.status === "active"),
      { life: blocked.life, semanticPressure: blocked.semanticPressure },
    );
    assert(
      "live R5 browser probe has no uncaught runtime exception",
      report.runtimeExceptions.length === 0,
      report.runtimeExceptions,
    );
    assert(
      "live R5 screenshot is non-empty and canonically read-only",
      screenshot.bytes > 10_000,
      screenshot,
    );

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true, maxRetries: 6, retryDelay: 100 });
  }
}

async function captureFrozenScreenshot(cdp, fileName, canonicalBefore) {
  await sleep(70);
  const before = JSON.stringify(canonicalBefore);
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  const bytes = Buffer.from(data, "base64");
  writeFileSync(resolve(dirname(OUTPUT_FILE), fileName), bytes);
  const after = JSON.stringify(await canonicalSnapshot(cdp));
  if (before !== after) throw new Error("live judgement screenshot mutated canonical World state");
  return { fileName, tick: canonicalBefore.tick, bytes: bytes.length };
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

run().catch((error) => {
  report.finishedAt = new Date().toISOString();
  report.outcome = "HARNESS_ERROR";
  report.error = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : null,
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
