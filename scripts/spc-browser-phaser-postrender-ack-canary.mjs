import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUT_DIR = dirname(OUTPUT);
const CYCLES = 12;
const TIMEOUT = 5000;
const BLACK_LIMIT = 0.90;
const CLOCK_TOLERANCE_MS = 3;
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  for (const path of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    if (existsSync(path)) return path;
  }
  for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const found = execFileSync("which", [binary], { encoding: "utf8" }).trim();
      if (found) return found;
    } catch {}
  }
  throw new Error("Chrome not found");
}

class CDP {
  constructor(url) {
    this.url = url;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("CDP open timeout")), 10000);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      this.ws.addEventListener("error", () => rejectOpen(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => this.handle(event.data));
  }
  handle(raw) {
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
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
  }
  send(method, params = {}, timeoutMs = 30000) {
    const id = this.id++;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        rejectSend(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => { clearTimeout(timer); resolveSend(value); },
        reject: (error) => { clearTimeout(timer); rejectSend(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws?.close(); }
}

const stable = (value) => JSON.stringify(value);
const hash = (value) => createHash("sha256").update(stable(value)).digest("hex");

async function evalv(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  }
  return response.result?.value;
}

async function pollJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`timeout ${url}`);
}

async function until(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await sleep(4);
  }
  throw new Error(`timeout ${label}`);
}

async function inspectFrame(cdp, data, expectedColor) {
  return evalv(cdp, `(async()=>{
    const raw=atob(${JSON.stringify(data)}), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
    const canvas=document.createElement("canvas"); canvas.width=bitmap.width; canvas.height=bitmap.height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true}); ctx.drawImage(bitmap,0,0);
    const marker=Array.from(ctx.getImageData(Math.floor(bitmap.width*.02),Math.floor(bitmap.height*.02),1,1).data);
    const sx=Math.floor(bitmap.width*.04), sy=Math.floor(bitmap.height*.18), sw=Math.floor(bitmap.width*.74), sh=Math.floor(bitmap.height*.77);
    const pixels=ctx.getImageData(sx,sy,sw,sh).data; let black=0, n=0;
    for(let i=0;i<pixels.length;i+=4){ if(pixels[i]<8&&pixels[i+1]<8&&pixels[i+2]<8) black++; n++; }
    bitmap.close();
    return { marker, markerMatch:${JSON.stringify(expectedColor)}.every((v,i)=>Math.abs(marker[i]-v)<=3), blackFraction:black/n, crop:[sx,sy,sw,sh] };
  })()`);
}

async function waitCompositorGeneration(cdp, frames, ack, cycleLabel) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const frame = frames.shift();
    if (!frame) { await sleep(2); continue; }
    const swapMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(swapMs) || swapMs + CLOCK_TOLERANCE_MS < ack.gamePostRenderWallMs) continue;
    const metrics = await inspectFrame(cdp, frame.data, ack.markerRgb);
    if (!metrics.markerMatch) continue;
    return { frame, frameSwapUtcMs: swapMs, metrics };
  }
  throw new Error(`timeout compositor generation ${cycleLabel}`);
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-phaser-postrender-p2-`);
  const port = 11600 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  let cast = false;
  const frames = [];
  const report = {
    schemaVersion: 1,
    experiment: "spc-phaser-postrender-to-compositor-p2",
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    assertions: [],
    runtimeExceptions: [],
    cycles: [],
    negativeControl: null,
  };
  const check = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), detail });

  try {
    const version = await pollJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await targetResponse.json();
    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.open();
    cdp.on("Runtime.exceptionThrown", (entry) => {
      report.runtimeExceptions.push(entry.exceptionDetails?.exception?.description ?? entry.exceptionDetails?.text ?? "unknown");
    });
    cdp.on("Page.screencastFrame", (frame) => {
      frames.push({ ...frame, receivedAtMs: Date.now() });
      cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      if (frames.length > 300) frames.splice(0, frames.length - 300);
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }),
    ]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate&presentation-ack=1` });
    await until(() => evalv(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.() && window.__SPC_PRESENTATION_ACK__?.ready?.())`), 20000, "SPC P2 ready");

    const initialCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const initialCanonicalHash = hash(initialCanonical);
    const initialPresentation = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
    report.initial = { canonicalTick: initialCanonical.tick ?? null, canonicalHash: initialCanonicalHash, presentation: initialPresentation };

    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 700, maxHeight: 450, everyNthFrame: 1 });
    cast = true;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const before = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
      const beforeCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const previousAckCount = before.acknowledgements.length;
      const semanticSendUtcMs = Date.now();
      await evalv(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
      const ack = await until(async () => {
        const state = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
        return state.acknowledgements.length > previousAckCount
          ? state.acknowledgements[state.acknowledgements.length - 1]
          : null;
      }, TIMEOUT, `application ack ${cycle}`);
      const compositor = await waitCompositorGeneration(cdp, frames, ack, cycle);
      const bytes = Buffer.from(compositor.frame.data, "base64");
      writeFileSync(resolve(OUT_DIR, `p2-presented-${String(cycle).padStart(2, "0")}.png`), bytes);
      const afterCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      report.cycles.push({
        cycle,
        semanticSendUtcMs,
        requestWallMs: ack.requestWallMs,
        sceneRenderWallMs: ack.sceneRenderWallMs,
        gamePostRenderWallMs: ack.gamePostRenderWallMs,
        frameSwapUtcMs: compositor.frameSwapUtcMs,
        requestToSceneRenderMs: ack.sceneRenderWallMs - ack.requestWallMs,
        sceneRenderToPostRenderMs: ack.gamePostRenderWallMs - ack.sceneRenderWallMs,
        postRenderToFrameSwapMs: compositor.frameSwapUtcMs - ack.gamePostRenderWallMs,
        generation: ack.generation,
        targetWorldOnly: ack.targetWorldOnly,
        observedWorldOnly: ack.observedWorldOnly,
        gameFrame: ack.gameFrame,
        markerRgb: ack.markerRgb,
        compositorMetrics: compositor.metrics,
        canonicalStable: hash(beforeCanonical) === hash(afterCanonical) && hash(afterCanonical) === initialCanonicalHash,
        pngSha256: createHash("sha256").update(bytes).digest("hex"),
        pngBytes: bytes.length,
      });
    }

    const beforeSleep = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
    const beforeSleepWorldOnly = await evalv(cdp, `document.querySelector("#app").classList.contains("spc-world-only")`);
    await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.sleepLoop(); true");
    await until(() => evalv(cdp, `window.__SPC_PRESENTATION_ACK__.state().loopRunning===false`), 1000, "loop sleeping");
    const sleepClickUtcMs = Date.now();
    await evalv(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
    const sleepingPending = await until(async () => {
      const state = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
      return state.pending && state.pending.generation > beforeSleep.markerGeneration ? state.pending : null;
    }, 1000, "sleeping pending generation");
    await sleep(220);
    const whileSleeping = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
    const whileSleepingWorldOnly = await evalv(cdp, `document.querySelector("#app").classList.contains("spc-world-only")`);
    const canonicalWhileSleeping = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");

    await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.wakeLoop(); true");
    const recoveredAck = await until(async () => {
      const state = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");
      const last = state.acknowledgements[state.acknowledgements.length - 1];
      return last?.generation === sleepingPending.generation ? last : null;
    }, TIMEOUT, "wake application ack");
    const recoveredCompositor = await waitCompositorGeneration(cdp, frames, recoveredAck, "negative-control-wake");
    const recoveredBytes = Buffer.from(recoveredCompositor.frame.data, "base64");
    writeFileSync(resolve(OUT_DIR, "p2-negative-control-recovered.png"), recoveredBytes);
    const finalCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const finalPresentation = await evalv(cdp, "window.__SPC_PRESENTATION_ACK__.state()");

    report.negativeControl = {
      beforeSleepAckCount: beforeSleep.acknowledgements.length,
      beforeSleepMarkerGeneration: beforeSleep.markerGeneration,
      beforeSleepWorldOnly,
      sleepClickUtcMs,
      pendingGeneration: sleepingPending.generation,
      targetWorldOnly: sleepingPending.targetWorldOnly,
      whileSleepingWorldOnly,
      whileSleepingAckCount: whileSleeping.acknowledgements.length,
      whileSleepingMarkerGeneration: whileSleeping.markerGeneration,
      whileSleepingPending: whileSleeping.pending,
      canonicalStableWhileSleeping: hash(canonicalWhileSleeping) === initialCanonicalHash,
      recoveredAck,
      recoveredFrameSwapUtcMs: recoveredCompositor.frameSwapUtcMs,
      recoveredMetrics: recoveredCompositor.metrics,
      recoveredPngSha256: createHash("sha256").update(recoveredBytes).digest("hex"),
    };

    check("all projection requests cross Scene RENDER before Game POST_RENDER", report.cycles.every((entry) => entry.requestWallMs <= entry.sceneRenderWallMs && entry.sceneRenderWallMs <= entry.gamePostRenderWallMs), report.cycles.map((entry) => [entry.generation, entry.requestToSceneRenderMs, entry.sceneRenderToPostRenderMs]));
    check("compositor generation never precedes Game POST_RENDER beyond clock tolerance", report.cycles.every((entry) => entry.frameSwapUtcMs + CLOCK_TOLERANCE_MS >= entry.gamePostRenderWallMs), report.cycles.map((entry) => [entry.generation, entry.postRenderToFrameSwapMs]));
    check("every compositor frame carries the postrender-released generation marker", report.cycles.every((entry) => entry.compositorMetrics.markerMatch), report.cycles.map((entry) => [entry.generation, entry.markerRgb, entry.compositorMetrics.marker]));
    check("accepted application-aware compositor frames are nonblank", report.cycles.every((entry) => entry.compositorMetrics.blackFraction < BLACK_LIMIT), report.cycles.map((entry) => [entry.generation, entry.compositorMetrics.blackFraction]));
    check("projection cycles preserve canonical World", report.cycles.every((entry) => entry.canonicalStable), report.cycles.map((entry) => [entry.generation, entry.canonicalStable]));
    check("sleeping Game loop fails closed instead of issuing application render ack", whileSleeping.acknowledgements.length === beforeSleep.acknowledgements.length && whileSleeping.markerGeneration === beforeSleep.markerGeneration && whileSleeping.pending?.generation === sleepingPending.generation, report.negativeControl);
    check("DOM projection can change while renderer authority remains asleep", whileSleepingWorldOnly !== beforeSleepWorldOnly, { beforeSleepWorldOnly, whileSleepingWorldOnly });
    check("waking renderer completes the same pending generation before compositor acknowledgement", recoveredAck.generation === sleepingPending.generation && recoveredCompositor.frameSwapUtcMs + CLOCK_TOLERANCE_MS >= recoveredAck.gamePostRenderWallMs && recoveredCompositor.metrics.markerMatch, report.negativeControl);
    check("entire P2 transaction preserves canonical World", hash(finalCanonical) === initialCanonicalHash, { initialCanonicalHash, finalCanonicalHash: hash(finalCanonical), tick: finalCanonical.tick ?? null });
    check("instrumentation reports no lifecycle anomalies", finalPresentation.anomalies.length === 0, finalPresentation.anomalies);
    check("no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

    report.finalPresentation = finalPresentation;
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } catch (error) {
    report.finishedAt = new Date().toISOString();
    report.outcome = "HARNESS_ERROR";
    report.error = { message: error?.message ?? String(error), stack: error?.stack ?? null };
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    console.error(error);
    process.exitCode = 1;
  } finally {
    if (cdp && cast) await cdp.send("Page.stopScreencast").catch(() => {});
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(100);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

main();
