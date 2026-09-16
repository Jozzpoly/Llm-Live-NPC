import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(process.env.LIVE_PROVIDER_PREFLIGHT_OUTPUT ?? "evidence/live-provider/preflight.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const MAX_STEPS = 700;
const JANEK_ID = "resident.janek";
const CRATE_ID = "crate.workshop.01";
const MATTER_ID = "matter.janek.missing-crate";
const CAPABILITY_ID = "local.material.search.remembered-workshop-area";

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
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
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-live-provider-preflight-`);
  const port = 12_000 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
    candidateBaseUrl: BASE_URL,
    purpose: "prove exact-preview browser reaches semantic request boundary without allowing provider spend",
    startedAt: new Date().toISOString(),
    chrome: null,
    pageUrl: null,
    assertions: [],
    runtimeExceptions: [],
    interceptedRequest: null,
    checkpoints: [],
    finalCanonical: null,
  };
  let intercepted = null;

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
    cdp.on("Fetch.requestPaused", (event) => {
      if (intercepted || event.request?.method !== "POST" || !event.request?.url?.includes("/api/spc-next/semantic")) return;
      intercepted = {
        fetchRequestId: event.requestId,
        networkId: event.networkId ?? null,
        url: event.request.url,
        method: event.request.method,
        postData: event.request.postData ?? null,
      };
      // Keep the request paused. Browser is destroyed after the boundary is recorded,
      // so the Worker/OpenAI provider cannot receive this preflight request.
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Fetch.enable", {
        patterns: [{ urlPattern: "*/api/spc-next/semantic", requestStage: "Request" }],
      }),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    await navigateEvidence(cdp);
    report.pageUrl = await evaluate(cdp, "location.href");
    const initial = canonicalSummary(await canonicalSnapshot(cdp));
    report.checkpoints.push({ label: "initial", worldSteps: 0, canonical: initial });
    assert(report, "exact preview opened the requested live-provider scenario", initial.scenarioId === "browser-missing-crate-live-provider", initial);

    let guard = 0;
    let lastRevision = initial.semanticRevision;
    while (!intercepted && guard < MAX_STEPS) {
      await stepEvidence(cdp, 1);
      await sleep(3);
      guard += 1;
      const current = canonicalSummary(await canonicalSnapshot(cdp));
      if (guard % 100 === 0 || current.semanticRevision !== lastRevision || current.activeRunId === null) {
        const previous = report.checkpoints.at(-1);
        if (!previous || previous.worldSteps !== guard) {
          report.checkpoints.push({ label: current.semanticRevision !== lastRevision ? "semantic-revision" : `step-${guard}`, worldSteps: guard, canonical: current });
        }
      }
      lastRevision = current.semanticRevision;
    }

    await sleep(25);
    report.finalCanonical = canonicalSummary(await canonicalSnapshot(cdp));
    report.interceptedRequest = intercepted ? {
      url: intercepted.url,
      method: intercepted.method,
      body: parseJson(intercepted.postData, "intercepted semantic request body"),
    } : null;

    const body = report.interceptedRequest?.body ?? null;
    assert(report, "browser reaches semantic request boundary within bounded World steps", Boolean(intercepted), {
      worldSteps: guard,
      finalCanonical: report.finalCanonical,
    });
    if (intercepted) {
      assert(report, "semantic request is emitted only after checked absence and before new execution authority", Boolean(
        report.finalCanonical?.matterStatus === "active"
        && report.finalCanonical?.semanticRevision === 2
        && report.finalCanonical?.activeRunId === null
        && report.finalCanonical?.semanticEvidenceKind === "checked_absence"
      ), report.finalCanonical);
      assert(report, "preflight request carries exactly the resident-owned search offer and no hidden relocated truth", Boolean(
        body?.version === 2
        && body?.matter?.id === MATTER_ID
        && body?.semanticEvidence?.kind === "checked_absence"
        && Array.isArray(body?.localCapabilities)
        && body.localCapabilities.length === 1
        && body.localCapabilities[0]?.id === CAPABILITY_ID
        && !String(intercepted.postData ?? "").includes("2752")
        && !String(intercepted.postData ?? "").includes("player.relocator")
      ), report.interceptedRequest);
    }
    assert(report, "preflight browser has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

function canonicalSummary(snapshot) {
  const janek = snapshot.authoritativeWorld?.actors?.find((actor) => actor.id === JANEK_ID) ?? null;
  const crate = snapshot.authoritativeWorld?.materialObjects?.find((object) => object.id === CRATE_ID) ?? null;
  return {
    schemaVersion: snapshot.schemaVersion ?? null,
    scenarioId: snapshot.scenarioId ?? null,
    tick: snapshot.tick ?? null,
    janekPosition: janek?.position ?? null,
    matterStatus: snapshot.continuity?.matter?.status ?? null,
    semanticRevision: snapshot.continuity?.matter?.semanticRevision ?? null,
    semanticCourse: snapshot.continuity?.matter?.semanticCourse ?? null,
    activeRunId: snapshot.continuity?.matter?.activeRunId ?? null,
    activeRunCanMutateWorld: snapshot.continuity?.activeRunCanMutateWorld ?? null,
    semanticEvidenceKind: snapshot.continuity?.semanticEvidence?.kind ?? null,
    lastOutcomeEvidenceKind: snapshot.continuity?.lastOutcomeEvidence?.kind ?? null,
    crateLocation: crate?.location ?? null,
    materialKnowledge: snapshot.residentPrivate?.materialKnowledge ?? [],
  };
}

async function navigateEvidence(cdp) {
  const url = `${BASE_URL.replace(/\/$/u, "")}/?spc=1&evidence=1&scenario=missing-crate-live-provider`;
  await cdp.send("Page.navigate", { url });
  await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas"))`), 25_000, "live-provider preflight scene");
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

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

function parseJson(text, label) {
  try { return JSON.parse(String(text ?? "")); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`); }
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

run().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA ?? null,
    candidateBaseUrl: BASE_URL ?? null,
    outcome: "HARNESS_ERROR",
    error: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null },
    finishedAt: new Date().toISOString(),
  };
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(fallback, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
