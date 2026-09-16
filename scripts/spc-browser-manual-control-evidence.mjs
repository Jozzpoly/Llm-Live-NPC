import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUTPUT_DIR = dirname(OUTPUT_FILE);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const PRESENTATION_STEPS = 12;
const ACK_TIMEOUT_MS = 2_000;
const MARKER_SIZE_CSS_PX = 96;

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

function markerColor(generation) {
  return [
    32 + ((generation * 53) % 192),
    32 + ((generation * 97) % 192),
    32 + ((generation * 149) % 192),
  ];
}

function closeColor(actual, expected, tolerance = 3) {
  return Array.isArray(actual)
    && actual.length >= 3
    && expected.every((value, index) => Math.abs(actual[index] - value) <= tolerance);
}

function stableJson(value) { return JSON.stringify(value); }
function hashJson(value) { return createHash("sha256").update(stableJson(value)).digest("hex"); }

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-presented-frame-`);
  const port = 10_250 + Math.floor(Math.random() * 400);
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
  let screencastRunning = false;
  const frameQueue = [];
  const report = {
    schemaVersion: 1,
    experiment: "spc-presented-frame-ack-p0",
    sourceSha: SOURCE_SHA,
    baseUrl: BASE_URL,
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    presentationTransitions: [],
    transientControl: null,
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
    cdp.on("Page.screencastFrame", (frame) => {
      frameQueue.push({ ...frame, receivedAtMs: Date.now() });
      cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      if (frameQueue.length > 120) frameQueue.splice(0, frameQueue.length - 120);
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate` });
    await waitUntil(async () => await evaluate(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector("canvas") && document.querySelector(".spc-world-mode-toggle"))`), 20_000, "SPC evidence scene");

    await injectMarker(cdp, 0);
    const canonicalInitial = await canonicalSnapshot(cdp);
    const initialHash = hashJson(canonicalInitial);

    await cdp.send("Page.startScreencast", {
      format: "png",
      quality: 100,
      maxWidth: 700,
      maxHeight: 450,
      everyNthFrame: 1,
    });
    screencastRunning = true;

    const initialAck = await waitForPresentedGeneration(cdp, frameQueue, 0, markerColor(0), 0, ACK_TIMEOUT_MS);
    assert(report, "initial marker reaches a compositor frame", Boolean(initialAck), initialAck);

    for (let generation = 1; generation <= PRESENTATION_STEPS; generation += 1) {
      const expectedWorldOnly = generation % 2 === 1;
      const before = await canonicalSnapshot(cdp);
      const beforeHash = hashJson(before);
      const color = markerColor(generation);
      const mutation = await mutatePresentation(cdp, generation, color, expectedWorldOnly);
      if (mutation.worldOnly !== expectedWorldOnly) {
        throw new Error(`generation ${generation}: DOM world-only=${mutation.worldOnly}, expected ${expectedWorldOnly}`);
      }
      const ack = await waitForPresentedGeneration(
        cdp,
        frameQueue,
        generation,
        color,
        mutation.pageWallMs,
        ACK_TIMEOUT_MS,
      );
      if (!ack) throw new Error(`generation ${generation}: no matching compositor frame`);
      const after = await canonicalSnapshot(cdp);
      const afterHash = hashJson(after);
      const exactCanonical = beforeHash === afterHash;
      const framePath = resolve(OUTPUT_DIR, `presented-frame-${String(generation).padStart(2, "0")}.png`);
      const frameBytes = Buffer.from(ack.data, "base64");
      writeFileSync(framePath, frameBytes);
      report.presentationTransitions.push({
        generation,
        expectedWorldOnly,
        immediateDomWorldOnly: mutation.worldOnly,
        canonicalTickBefore: before.tick ?? null,
        canonicalTickAfter: after.tick ?? null,
        canonicalHashBefore: beforeHash,
        canonicalHashAfter: afterHash,
        canonicalStable: exactCanonical,
        pageMutationWallMs: mutation.pageWallMs,
        frameSwapUtcMs: ack.frameSwapUtcMs,
        frameSwapMinusMutationMs: ack.frameSwapUtcMs - mutation.pageWallMs,
        harnessReceiveUtcMs: ack.receivedAtMs,
        receiveMinusFrameSwapMs: ack.receivedAtMs - ack.frameSwapUtcMs,
        markerRgba: ack.markerRgba,
        screenshotBytes: frameBytes.length,
        screenshotSha256: createHash("sha256").update(frameBytes).digest("hex"),
      });
    }

    const transientGeneration = 200;
    const transientColor = markerColor(transientGeneration);
    const baselineGeneration = 201;
    const baselineColor = markerColor(baselineGeneration);
    const transientMutation = await evaluate(cdp, `(() => {
      const marker = document.querySelector("#spc-presented-frame-probe");
      if (!(marker instanceof HTMLElement)) throw new Error("presentation marker missing");
      marker.dataset.generation = ${JSON.stringify(String(transientGeneration))};
      marker.style.background = ${JSON.stringify(`rgb(${transientColor.join(",")})`)};
      const wall = performance.timeOrigin + performance.now();
      marker.dataset.generation = ${JSON.stringify(String(baselineGeneration))};
      marker.style.background = ${JSON.stringify(`rgb(${baselineColor.join(",")})`)};
      return { pageWallMs: wall };
    })()`);
    const baselineAck = await waitForPresentedGeneration(cdp, frameQueue, baselineGeneration, baselineColor, transientMutation.pageWallMs, ACK_TIMEOUT_MS);
    if (!baselineAck) throw new Error("negative-control baseline generation never reached compositor");
    const transientSeen = await anyPresentedColor(cdp, frameQueue, transientColor, transientMutation.pageWallMs, 120);
    report.transientControl = {
      transientGeneration,
      baselineGeneration,
      transientSeen,
      baselineFrameSwapUtcMs: baselineAck.frameSwapUtcMs,
    };

    const canonicalFinal = await canonicalSnapshot(cdp);
    const finalHash = hashJson(canonicalFinal);
    assert(report, "all presentation generations reach exact compositor frames", report.presentationTransitions.length === PRESENTATION_STEPS, report.presentationTransitions.length);
    assert(report, "presentation-only toggles preserve canonical World state", report.presentationTransitions.every((entry) => entry.canonicalStable) && finalHash === initialHash, {
      initialHash,
      finalHash,
      transitions: report.presentationTransitions.map((entry) => ({ generation: entry.generation, stable: entry.canonicalStable })),
    });
    assert(report, "same-task transient marker is not promoted to presented-frame evidence", transientSeen === false, report.transientControl);
    assert(report, "presented-frame timestamps are monotonic", report.presentationTransitions.every((entry, index, entries) => index === 0 || entry.frameSwapUtcMs >= entries[index - 1].frameSwapUtcMs), report.presentationTransitions.map((entry) => entry.frameSwapUtcMs));
    assert(report, "SPC presented-frame canary has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    if (cdp && screencastRunning) await cdp.send("Page.stopScreencast").catch(() => {});
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function injectMarker(cdp, generation) {
  const color = markerColor(generation);
  await evaluate(cdp, `(() => {
    document.querySelector("#spc-presented-frame-probe")?.remove();
    const marker = document.createElement("div");
    marker.id = "spc-presented-frame-probe";
    marker.dataset.generation = ${JSON.stringify(String(generation))};
    Object.assign(marker.style, {
      position: "fixed",
      left: "0px",
      top: "0px",
      width: ${JSON.stringify(`${MARKER_SIZE_CSS_PX}px`)},
      height: ${JSON.stringify(`${MARKER_SIZE_CSS_PX}px`)},
      zIndex: "2147483647",
      pointerEvents: "none",
      background: ${JSON.stringify(`rgb(${color.join(",")})`)},
    });
    document.documentElement.appendChild(marker);
    return true;
  })()`);
}

async function mutatePresentation(cdp, generation, color, worldOnly) {
  return await evaluate(cdp, `(() => {
    const root = document.querySelector("#app");
    const button = document.querySelector(".spc-world-mode-toggle");
    const marker = document.querySelector("#spc-presented-frame-probe");
    if (!(root instanceof HTMLElement) || !(button instanceof HTMLButtonElement) || !(marker instanceof HTMLElement)) {
      throw new Error("presentation controls unavailable");
    }
    const desired = ${worldOnly ? "true" : "false"};
    if (root.classList.contains("spc-world-only") !== desired) button.click();
    marker.dataset.generation = ${JSON.stringify(String(generation))};
    marker.style.background = ${JSON.stringify(`rgb(${color.join(",")})`)};
    return {
      generation: ${generation},
      worldOnly: root.classList.contains("spc-world-only"),
      pageWallMs: performance.timeOrigin + performance.now(),
      performanceNowMs: performance.now(),
    };
  })()`);
}

async function waitForPresentedGeneration(cdp, frameQueue, generation, expectedColor, notBeforeWallMs, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = frameQueue.shift();
    if (!frame) {
      await sleep(2);
      continue;
    }
    const frameSwapUtcMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(frameSwapUtcMs) || frameSwapUtcMs + 2 < notBeforeWallMs) continue;
    const sample = await samplePngMarker(cdp, frame.data);
    if (closeColor(sample.rgba, expectedColor)) {
      return {
        generation,
        data: frame.data,
        frameSwapUtcMs,
        receivedAtMs: frame.receivedAtMs,
        markerRgba: sample.rgba,
        width: sample.width,
        height: sample.height,
      };
    }
  }
  return null;
}

async function anyPresentedColor(cdp, frameQueue, expectedColor, notBeforeWallMs, observationMs) {
  const deadline = Date.now() + observationMs;
  while (Date.now() < deadline) {
    const frame = frameQueue.shift();
    if (!frame) {
      await sleep(2);
      continue;
    }
    const frameSwapUtcMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(frameSwapUtcMs) || frameSwapUtcMs + 2 < notBeforeWallMs) continue;
    const sample = await samplePngMarker(cdp, frame.data);
    if (closeColor(sample.rgba, expectedColor)) return true;
  }
  return false;
}

async function samplePngMarker(cdp, base64Png) {
  return await evaluate(cdp, `(async () => {
    const binary = atob(${JSON.stringify(base64Png)});
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2d decode context unavailable");
    ctx.drawImage(bitmap, 0, 0);
    const sampleX = Math.max(1, Math.min(bitmap.width - 1, Math.floor(bitmap.width * 0.02)));
    const sampleY = Math.max(1, Math.min(bitmap.height - 1, Math.floor(bitmap.height * 0.02)));
    const rgba = Array.from(ctx.getImageData(sampleX, sampleY, 1, 1).data);
    bitmap.close();
    return { rgba, width: canvas.width, height: canvas.height, sampleX, sampleY };
  })()`);
}

async function canonicalSnapshot(cdp) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.canonicalSnapshot()`);
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
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) { lastError = error; }
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
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

run().catch((error) => {
  const failure = {
    schemaVersion: 1,
    experiment: "spc-presented-frame-ack-p0",
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) },
    finishedAt: new Date().toISOString(),
  };
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(failure, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
