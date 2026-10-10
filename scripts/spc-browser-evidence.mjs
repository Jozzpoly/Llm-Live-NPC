import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_DIR = resolve(process.env.EVIDENCE_OUTPUT_DIR ?? "evidence/browser");
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const SCREENSHOT_QUALITY = 72;

mkdirSync(OUTPUT_DIR, { recursive: true });
mkdirSync(join(OUTPUT_DIR, "screenshots"), { recursive: true });

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

class CdpSession {
  constructor(webSocketUrl) {
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    if (typeof WebSocket !== "function") throw new Error("Node runtime does not expose global WebSocket");
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
    const listeners = this.listeners.get(message.method);
    if (!listeners) return;
    for (const listener of listeners) listener(message.params ?? {});
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

function remoteValue(argument) {
  if (Object.prototype.hasOwnProperty.call(argument ?? {}, "value")) return argument.value;
  if (argument?.unserializableValue) return argument.unserializableValue;
  return argument?.description ?? null;
}

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(join(tmpdir(), "spc-browser-evidence-"));
  const port = 9222 + Math.floor(Math.random() * 500);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-features=Translate,OptimizationHints,MediaRouter",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let chromeStdout = "";
  let chromeStderr = "";
  chrome.stdout.on("data", (chunk) => { chromeStdout += String(chunk); });
  chrome.stderr.on("data", (chunk) => { chromeStderr += String(chunk); });

  const report = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    baseUrl: BASE_URL,
    startedAt: new Date().toISOString(),
    chrome: null,
    checkpoints: [],
    timeline: [],
    console: [],
    runtimeExceptions: [],
    logErrors: [],
    networkFailures: [],
    httpErrors: [],
    assertions: [],
    performance: {},
  };

  let cdp;
  let timelineRunning = false;
  let timelinePromise = Promise.resolve();

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.connect();

    cdp.on("Runtime.consoleAPICalled", ({ type, args, timestamp }) => {
      report.console.push({ type, timestamp, values: (args ?? []).map(remoteValue) });
    });
    cdp.on("Runtime.exceptionThrown", ({ timestamp, exceptionDetails }) => {
      report.runtimeExceptions.push({
        timestamp,
        text: exceptionDetails?.text ?? null,
        description: exceptionDetails?.exception?.description ?? null,
        url: exceptionDetails?.url ?? null,
        lineNumber: exceptionDetails?.lineNumber ?? null,
        columnNumber: exceptionDetails?.columnNumber ?? null,
      });
    });
    cdp.on("Log.entryAdded", ({ entry }) => {
      if (entry?.level === "error") report.logErrors.push(entry);
    });
    cdp.on("Network.loadingFailed", (event) => {
      if (!event.canceled) report.networkFailures.push({
        requestId: event.requestId,
        errorText: event.errorText,
        type: event.type,
        blockedReason: event.blockedReason ?? null,
      });
    });
    cdp.on("Network.responseReceived", ({ response, type }) => {
      if (response?.status >= 400) report.httpErrors.push({ url: response.url, status: response.status, type });
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Log.enable"),
      cdp.send("Network.enable"),
      cdp.send("Performance.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1` });
    await waitUntil(async () => await evaluate(cdp, `Boolean(document.querySelector("canvas") && document.querySelector(".spc-resident-list"))`), 20_000, "SPC research UI");

    await click(cdp, `[data-resident="resident.janek"]`);
    await sleep(150);
    await click(cdp, `[data-action="focus"]`);
    await ensureOverlay(cdp, true);
    await sleep(250);

    const initial = await panelSnapshot(cdp);
    await checkpoint(cdp, report, "01-janek-early-research", initial, false);

    timelineRunning = true;
    timelinePromise = (async () => {
      while (timelineRunning) {
        try {
          report.timeline.push({ elapsedMs: Date.now() - Date.parse(report.startedAt), ...(await panelSnapshot(cdp)) });
        } catch (error) {
          report.timeline.push({ elapsedMs: Date.now() - Date.parse(report.startedAt), samplingError: error instanceof Error ? error.message : String(error) });
        }
        await sleep(250);
      }
    })();

    await sleep(1_250);
    await click(cdp, `[data-action="call"]`);
    await sleep(350);
    await click(cdp, `[data-resident="resident.mira"]`);
    await sleep(300);
    const miraAfterCall = await panelSnapshot(cdp);
    const miraHeardCall = miraAfterCall.privatePerception.some((line) => /speech\s*\/\s*hearing/i.test(line));
    assert(report, "nearby Mira receives player speech through real browser/world path", miraHeardCall, miraAfterCall.privatePerception);
    await checkpoint(cdp, report, "02-player-call-mira-research", miraAfterCall, false);

    await click(cdp, `[data-resident="resident.janek"]`);
    await sleep(100);
    await click(cdp, `[data-action="focus"]`);

    const movingJanek = await waitUntil(async () => {
      const snapshot = await panelSnapshot(cdp);
      const resolved = numberFact(snapshot, "resolved velocity");
      return snapshot.selectedName === "Janek" && resolved > 5 ? snapshot : null;
    }, 12_000, "Janek moving during delivery");
    assert(report, "Janek produces visible resolved motion during recovered delivery", numberFact(movingJanek, "resolved velocity") > 5, movingJanek.facts);
    if (movingJanek.facts.activity === "idle") {
      report.assertions.push({
        name: "public activity projection matches recovered execution",
        pass: false,
        severity: "finding",
        detail: "Janek is physically moving under recovered run authority while public activity still reports legacy idle.",
      });
    }
    await checkpoint(cdp, report, "03-janek-mid-delivery-research", movingJanek, false);
    await checkpoint(cdp, report, "04-janek-mid-delivery-world", movingJanek, true);

    const finalJanek = await waitUntil(async () => {
      const snapshot = await panelSnapshot(cdp);
      const tick = snapshot.tick ?? 0;
      const resolved = numberFact(snapshot, "resolved velocity");
      const intent = numberFact(snapshot, "motion intent");
      return tick >= 760 && resolved < 0.1 && intent < 0.1 ? snapshot : null;
    }, 28_000, "Janek delivery settles");
    assert(report, "Janek delivery reaches a settled physical state in browser", numberFact(finalJanek, "resolved velocity") < 0.1 && numberFact(finalJanek, "motion intent") < 0.1, finalJanek.facts);
    await checkpoint(cdp, report, "05-janek-settled-research", finalJanek, false);
    await checkpoint(cdp, report, "06-janek-settled-world", finalJanek, true);

    await ensureWorldOnly(cdp, false);
    const metrics = await cdp.send("Performance.getMetrics");
    report.performance.finalMetrics = Object.fromEntries((metrics.metrics ?? []).map((metric) => [metric.name, metric.value]));
    report.performance.canvas = await evaluate(cdp, `(() => {
      const canvas = document.querySelector("canvas");
      if (!(canvas instanceof HTMLCanvasElement)) return null;
      const r = canvas.getBoundingClientRect();
      return { width: canvas.width, height: canvas.height, cssWidth: r.width, cssHeight: r.height };
    })()`);
    assert(report, "Phaser canvas is present and non-trivial", Boolean(report.performance.canvas?.width > 300 && report.performance.canvas?.height > 200), report.performance.canvas);

    timelineRunning = false;
    await timelinePromise;

    const hardFailures = report.assertions.filter((entry) => entry.pass === false && entry.severity !== "finding");
    const browserErrors = report.runtimeExceptions.length + report.logErrors.length;
    assert(report, "no uncaught browser/runtime errors", browserErrors === 0, {
      runtimeExceptions: report.runtimeExceptions,
      logErrors: report.logErrors,
    });

    report.finishedAt = new Date().toISOString();
    report.outcome = hardFailures.length === 0 && browserErrors === 0 ? "PASS" : "FAIL";
    writeOutputs(report, chromeStdout, chromeStderr);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    timelineRunning = false;
    await timelinePromise.catch(() => {});
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(150);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, {
      recursive: true,
      force: true,
      maxRetries: 6,
      retryDelay: 100,
    });
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
  return result.result?.value;
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

async function ensureOverlay(cdp, enabled) {
  const active = await evaluate(cdp, `document.querySelector('[data-action="overlay"]')?.classList.contains('is-active') ?? false`);
  if (Boolean(active) !== enabled) {
    await click(cdp, `[data-action="overlay"]`);
    await sleep(100);
  }
}

async function ensureWorldOnly(cdp, enabled) {
  const current = await evaluate(cdp, `document.querySelector("#app")?.classList.contains("spc-world-only") ?? false`);
  if (Boolean(current) !== enabled) {
    await click(cdp, `.spc-world-mode-toggle`);
    await sleep(180);
  }
}

async function panelSnapshot(cdp) {
  return await evaluate(cdp, `(() => {
    const facts = {};
    for (const row of document.querySelectorAll(".spc-facts > div")) {
      const key = row.querySelector("dt")?.textContent?.trim();
      const value = row.querySelector("dd")?.textContent?.trim();
      if (key) facts[key] = value ?? "";
    }
    const list = (selector) => [...document.querySelectorAll(selector)].map((element) => element.textContent?.replace(/\\s+/g, " ").trim() ?? "").filter(Boolean);
    const tickText = document.querySelector(".spc-tick")?.textContent ?? "";
    const tickMatch = /t(\\d+)/.exec(tickText);
    const canvas = document.querySelector("canvas");
    const rect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : null;
    return {
      tick: tickMatch ? Number(tickMatch[1]) : null,
      selectedName: document.querySelector(".spc-selected-name")?.textContent?.trim() ?? null,
      role: document.querySelector(".spc-role")?.textContent?.trim() ?? null,
      facts,
      activityReason: document.querySelector(".spc-activity-reason")?.textContent?.trim() ?? null,
      privatePerception: list(".debug-section:nth-last-of-type(3) .spc-log li"),
      residentTrace: list(".debug-section:nth-last-of-type(2) .spc-log li"),
      publicOccurrences: list(".debug-section:last-of-type .spc-log li"),
      stage: document.querySelector("#e1-stage-chip")?.textContent?.trim() ?? null,
      worldOnly: document.querySelector("#app")?.classList.contains("spc-world-only") ?? false,
      canvas: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
      bodyTextLength: document.body.innerText.length,
    };
  })()`);
}

function numberFact(snapshot, key) {
  const value = Number.parseFloat(snapshot?.facts?.[key] ?? "NaN");
  return Number.isFinite(value) ? value : Number.NaN;
}

async function checkpoint(cdp, report, name, suppliedSnapshot, worldOnly) {
  await ensureWorldOnly(cdp, worldOnly);
  const snapshot = suppliedSnapshot ?? await panelSnapshot(cdp);
  await sleep(100);
  const result = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: SCREENSHOT_QUALITY,
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const buffer = Buffer.from(result.data, "base64");
  const filename = `${name}.jpg`;
  const relative = `screenshots/${filename}`;
  writeFileSync(join(OUTPUT_DIR, relative), buffer);
  assert(report, `screenshot ${name} is non-empty`, buffer.length > 8_000, { bytes: buffer.length });
  report.checkpoints.push({ name, worldOnly, screenshot: relative, bytes: buffer.length, snapshot });
  if (worldOnly) await ensureWorldOnly(cdp, false);
}

async function waitUntil(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(120);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), severity: "gate", detail });
}

function writeOutputs(report, chromeStdout, chromeStderr) {
  writeFileSync(join(OUTPUT_DIR, "evidence.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(join(OUTPUT_DIR, "chrome.stdout.log"), chromeStdout);
  writeFileSync(join(OUTPUT_DIR, "chrome.stderr.log"), chromeStderr);
  const rows = report.assertions.map((entry) => `- ${entry.pass ? "PASS" : entry.severity === "finding" ? "FINDING" : "FAIL"}: ${entry.name}`).join("\n");
  const shots = report.checkpoints.map((entry) => `### ${entry.name}\n\n![${entry.name}](${entry.screenshot})\n\nTick: ${entry.snapshot?.tick ?? "?"} · selected: ${entry.snapshot?.selectedName ?? "?"} · world-only: ${entry.worldOnly}`).join("\n\n");
  writeFileSync(join(OUTPUT_DIR, "README.md"), `# SPC browser evidence\n\nSource: \`${report.sourceSha}\`  \nOutcome: **${report.outcome}**  \nChrome: \`${report.chrome ?? "unknown"}\`\n\n## Gates\n\n${rows}\n\n## Screenshots\n\n${shots}\n`);
}

run().catch((error) => {
  const fallback = {
    schemaVersion: 1,
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(join(OUTPUT_DIR, "harness-error.json"), `${JSON.stringify(fallback, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
