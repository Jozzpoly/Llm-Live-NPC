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
const TIMEOUT = 6000;
const CLOCK_TOLERANCE_MS = 3;
const MAX_SETTLED_BLACK_FRACTION = 0.50;
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  for (const p of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) if (existsSync(p)) return p;
  for (const b of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { const p = execFileSync("which", [b], { encoding: "utf8" }).trim(); if (p) return p; } catch {}
  }
  throw new Error("Chrome not found");
}

class CDP {
  constructor(url) { this.url = url; this.id = 1; this.pending = new Map(); this.listeners = new Map(); }
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
      const pending = this.pending.get(message.id); if (!pending) return;
      this.pending.delete(message.id);
      message.error ? pending.reject(new Error(`${pending.method}: ${message.error.message}`)) : pending.resolve(message.result ?? {});
      return;
    }
    for (const listener of this.listeners.get(message.method) ?? []) listener(message.params ?? {});
  }
  on(method, listener) { this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]); }
  send(method, params = {}, timeoutMs = 30000) {
    const id = this.id++;
    return new Promise((resolveSend, rejectSend) => {
      const timer = setTimeout(() => { this.pending.delete(id); rejectSend(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
      this.pending.set(id, { method, resolve: (value) => { clearTimeout(timer); resolveSend(value); }, reject: (error) => { clearTimeout(timer); rejectSend(error); } });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws?.close(); }
}

const stable = (value) => JSON.stringify(value);
const hash = (value) => createHash("sha256").update(stable(value)).digest("hex");

async function evalv(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
}

async function pollJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await sleep(100);
  }
  throw new Error(`timeout ${url}`);
}

async function until(fn, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await fn(); if (value) return value;
    await sleep(4);
  }
  throw new Error(`timeout ${label}`);
}

async function inspectFrame(cdp, data, expectedColor) {
  return evalv(cdp, `(async()=>{
    const raw=atob(${JSON.stringify(data)}), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
    const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.drawImage(bitmap,0,0);
    const marker=Array.from(ctx.getImageData(Math.floor(bitmap.width*.02),Math.floor(bitmap.height*.02),1,1).data);
    const sx=Math.floor(bitmap.width*.04),sy=Math.floor(bitmap.height*.18),sw=Math.floor(bitmap.width*.74),sh=Math.floor(bitmap.height*.77);
    const pixels=ctx.getImageData(sx,sy,sw,sh).data;let black=0,n=0,sum=0,sumSq=0;
    for(let i=0;i<pixels.length;i+=4){const r=pixels[i],g=pixels[i+1],b=pixels[i+2];if(r<8&&g<8&&b<8)black++;sum+=r+g+b;sumSq+=r*r+g*g+b*b;n++;}
    bitmap.close();
    return{marker,markerMatch:${JSON.stringify(expectedColor)}.every((v,i)=>Math.abs(marker[i]-v)<=3),blackFraction:black/n,meanRgb:sum/(n*3),varianceRgb:(sumSq/(n*3))-Math.pow(sum/(n*3),2),crop:[sx,sy,sw,sh]};
  })()`);
}

async function waitCompositorGeneration(cdp, frames, ack, label) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const frame = frames.shift();
    if (!frame) { await sleep(2); continue; }
    const swapMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(swapMs) || swapMs + CLOCK_TOLERANCE_MS < ack.gamePostRenderWallMs) continue;
    const metrics = await inspectFrame(cdp, frame.data, ack.markerRgb);
    if (metrics.markerMatch) return { frame, frameSwapUtcMs: swapMs, metrics };
  }
  throw new Error(`timeout compositor generation ${label}`);
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-geometry-ack-p2-1-`);
  const port = 11900 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
  let cdp, cast = false;
  const frames = [];
  const report = { schemaVersion: 1, experiment: "spc-geometry-convergence-to-compositor-p2-1", sourceSha: SOURCE_SHA, startedAt: new Date().toISOString(), assertions: [], runtimeExceptions: [], cycles: [], negativeControl: null };
  const check = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), detail });

  try {
    const version = await pollJson(`http://127.0.0.1:${port}/json/version`); report.chrome = version.Browser ?? null;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    cdp = new CDP(target.webSocketDebuggerUrl); await cdp.open();
    cdp.on("Runtime.exceptionThrown", (entry) => report.runtimeExceptions.push(entry.exceptionDetails?.exception?.description ?? entry.exceptionDetails?.text ?? "unknown"));
    cdp.on("Page.screencastFrame", (frame) => { frames.push(frame); cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {}); if (frames.length > 400) frames.splice(0, frames.length - 400); });
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate&geometry-ack=1` });
    await until(() => evalv(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.()&&window.__SPC_PRESENTATION_GEOMETRY_ACK__?.ready?.())`), 20000, "P2.1 ready");

    const initialCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const initialCanonicalHash = hash(initialCanonical);
    report.initial = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 700, maxHeight: 450, everyNthFrame: 1 }); cast = true;

    for (let cycle = 1; cycle <= CYCLES; cycle++) {
      const before = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
      const beforeCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const previousAckCount = before.acknowledgements.length;
      await evalv(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
      const ack = await until(async () => {
        const state = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
        return state.acknowledgements.length > previousAckCount ? state.acknowledgements.at(-1) : null;
      }, TIMEOUT, `geometry application ack ${cycle}`);
      const compositor = await waitCompositorGeneration(cdp, frames, ack, cycle);
      const bytes = Buffer.from(compositor.frame.data, "base64");
      writeFileSync(resolve(OUT_DIR, `p2-1-presented-${String(cycle).padStart(2, "0")}.png`), bytes);
      const afterCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const ineligibleSamples = ack.postRenderSamples.filter((sample) => !sample.eligible);
      report.cycles.push({ cycle, generation: ack.generation, targetWorldOnly: ack.targetWorldOnly, expectedTransitions: ack.expectedTransitions, completedTransitions: ack.completedTransitions, transitionDurationMs: ack.transitionCompletionWallMs - ack.requestWallMs, scaleResizeCount: ack.scaleResizeCount, requestWallMs: ack.requestWallMs, transitionCompletionWallMs: ack.transitionCompletionWallMs, lastScaleResizeWallMs: ack.lastScaleResizeWallMs, sceneRenderWallMs: ack.sceneRenderWallMs, gamePostRenderWallMs: ack.gamePostRenderWallMs, frameSwapUtcMs: compositor.frameSwapUtcMs, postRenderToFrameSwapMs: compositor.frameSwapUtcMs - ack.gamePostRenderWallMs, geometry: ack.geometry, preAckPostRenderCount: ineligibleSamples.length, preAckReasons: ineligibleSamples.map((sample) => ({ gameFrame: sample.gameFrame, transitionComplete: sample.transitionComplete, geometryConverged: sample.geometry.converged, sceneRenderedSameFrame: sample.sceneRenderedSameFrame })), compositorMetrics: compositor.metrics, canonicalStable: hash(beforeCanonical) === hash(afterCanonical) && hash(afterCanonical) === initialCanonicalHash, pngSha256: createHash("sha256").update(bytes).digest("hex"), pngBytes: bytes.length });
    }

    const beforeSleep = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
    const beforeSleepWorldOnly = await evalv(cdp, `document.querySelector("#app").classList.contains("spc-world-only")`);
    await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.sleepLoop();true");
    await until(() => evalv(cdp, `window.__SPC_PRESENTATION_GEOMETRY_ACK__.state().loopRunning===false`), 1000, "loop sleeping");
    await evalv(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
    const sleepingSettled = await until(async () => {
      const state = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
      return state.pending?.transitionComplete && state.currentGeometry?.converged ? state : null;
    }, TIMEOUT, "sleeping geometry convergence");
    const sleepingGeneration = sleepingSettled.pending.generation;
    const whileSleepingWorldOnly = await evalv(cdp, `document.querySelector("#app").classList.contains("spc-world-only")`);
    const canonicalWhileSleeping = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const noAckWhileSleeping = sleepingSettled.acknowledgements.length === beforeSleep.acknowledgements.length && sleepingSettled.markerGeneration === beforeSleep.markerGeneration && sleepingSettled.pending.lastSceneRenderWallMs === null;

    await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.wakeLoop();true");
    const recoveredAck = await until(async () => {
      const state = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
      return state.acknowledgements.at(-1)?.generation === sleepingGeneration ? state.acknowledgements.at(-1) : null;
    }, TIMEOUT, "wake geometry ack");
    const recoveredCompositor = await waitCompositorGeneration(cdp, frames, recoveredAck, "negative-control");
    const recoveredBytes = Buffer.from(recoveredCompositor.frame.data, "base64");
    writeFileSync(resolve(OUT_DIR, "p2-1-negative-control-recovered.png"), recoveredBytes);
    const finalCanonical = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const finalState = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
    report.negativeControl = { beforeSleepWorldOnly, whileSleepingWorldOnly, sleepingGeneration, noAckWhileSleeping, sleepingSettledPending: sleepingSettled.pending, sleepingGeometry: sleepingSettled.currentGeometry, recoveredAck, recoveredFrameSwapUtcMs: recoveredCompositor.frameSwapUtcMs, recoveredMetrics: recoveredCompositor.metrics, canonicalStableWhileSleeping: hash(canonicalWhileSleeping) === initialCanonicalHash, recoveredPngSha256: createHash("sha256").update(recoveredBytes).digest("hex") };

    check("layout transition lifecycle is observed and complete before every ack", report.cycles.every((entry) => entry.expectedTransitions.length > 0 && entry.expectedTransitions.every((name) => entry.completedTransitions.includes(name))), report.cycles.map((entry) => [entry.generation, entry.expectedTransitions, entry.completedTransitions, entry.transitionDurationMs]));
    check("every ack is issued only at converged DOM/ScaleManager/canvas geometry", report.cycles.every((entry) => entry.geometry.converged), report.cycles.map((entry) => [entry.generation, entry.geometry]));
    check("geometry gate actually rejects intermediate postrender passes", report.cycles.every((entry) => entry.preAckPostRenderCount > 0), report.cycles.map((entry) => [entry.generation, entry.preAckPostRenderCount, entry.preAckReasons.slice(-3)]));
    check("each transaction observes at least one Scale.RESIZE epoch", report.cycles.every((entry) => entry.scaleResizeCount > 0), report.cycles.map((entry) => [entry.generation, entry.scaleResizeCount]));
    check("compositor frame never precedes geometry-qualified Game POST_RENDER", report.cycles.every((entry) => entry.frameSwapUtcMs + CLOCK_TOLERANCE_MS >= entry.gamePostRenderWallMs), report.cycles.map((entry) => [entry.generation, entry.postRenderToFrameSwapMs]));
    check("compositor frames carry exact geometry-qualified generation markers", report.cycles.every((entry) => entry.compositorMetrics.markerMatch), report.cycles.map((entry) => [entry.generation, entry.compositorMetrics.marker]));
    check("geometry-qualified compositor frames are materially nonblank in this frozen SPC scene", report.cycles.every((entry) => entry.compositorMetrics.blackFraction < MAX_SETTLED_BLACK_FRACTION), report.cycles.map((entry) => [entry.generation, entry.compositorMetrics.blackFraction]));
    check("projection cycles preserve canonical World", report.cycles.every((entry) => entry.canonicalStable), report.cycles.map((entry) => [entry.generation, entry.canonicalStable]));
    check("sleep negative control reaches transition+geometry convergence without render authority", noAckWhileSleeping && whileSleepingWorldOnly !== beforeSleepWorldOnly, report.negativeControl);
    check("wake grants authority to the same pending generation only after render resumes", recoveredAck.generation === sleepingGeneration && recoveredAck.geometry.converged && recoveredCompositor.metrics.markerMatch && recoveredCompositor.metrics.blackFraction < MAX_SETTLED_BLACK_FRACTION, report.negativeControl);
    check("entire P2.1 transaction preserves canonical World", hash(finalCanonical) === initialCanonicalHash, { initialCanonicalHash, finalCanonicalHash: hash(finalCanonical), tick: finalCanonical.tick ?? null });
    check("instrumentation reports no lifecycle anomalies", finalState.anomalies.length === 0, finalState.anomalies);
    check("no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

    report.finalState = finalState;
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } catch (error) {
    report.finishedAt = new Date().toISOString(); report.outcome = "HARNESS_ERROR"; report.error = { message: error?.message ?? String(error), stack: error?.stack ?? null };
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`); console.error(error); process.exitCode = 1;
  } finally {
    if (cdp && cast) await cdp.send("Page.stopScreencast").catch(() => {});
    cdp?.close(); chrome.kill("SIGTERM"); await sleep(100); if (!chrome.killed) chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true });
  }
}

main();
