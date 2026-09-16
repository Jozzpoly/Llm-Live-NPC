import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
const OUT_DIR = dirname(OUTPUT);
const CYCLES = 4;
const TIMEOUT = 2500;
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  for (const candidate of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
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
      const pending = this.pending.get(message.id);
      if (!pending) return;
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
const color = (generation) => [32 + (generation * 53) % 192, 32 + (generation * 97) % 192, 32 + (generation * 149) % 192];
const near = (actual, expected) => actual?.length >= 3 && expected.every((v, i) => Math.abs(actual[i] - v) <= 3);

async function evalValue(cdp, expression) {
  const response = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text ?? "Runtime.evaluate failed");
  return response.result?.value;
}

async function pollJson(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { const response = await fetch(url); if (response.ok) return await response.json(); } catch {}
    await sleep(100);
  }
  throw new Error(`timeout ${url}`);
}

async function until(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await probe();
    if (value) return value;
    await sleep(5);
  }
  throw new Error(`timeout ${label}`);
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-hit-test-`);
  const port = 10900 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp; let screencast = false; const frames = [];
  const report = {
    schemaVersion: 1,
    experiment: "spc-real-pointer-hit-test-occlusion-p0",
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    assertions: [],
    runtimeExceptions: [],
    cycles: [],
  };
  const assert = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), detail });

  try {
    const version = await pollJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await targetResponse.json();
    cdp = new CDP(target.webSocketDebuggerUrl);
    await cdp.open();
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => report.runtimeExceptions.push(exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? "unknown"));
    cdp.on("Page.screencastFrame", (frame) => {
      frames.push({ ...frame, receivedAtMs: Date.now() });
      cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      if (frames.length > 160) frames.splice(0, frames.length - 160);
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }),
    ]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate` });
    await until(() => evalValue(cdp, 'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector(".spc-world-mode-toggle"))'), 20000, "SPC ready");

    await evalValue(cdp, `(() => {
      const marker = document.createElement("div");
      marker.id = "hit-test-frame-marker";
      Object.assign(marker.style, { position:"fixed", left:"0px", top:"0px", width:"96px", height:"96px", zIndex:"2147483647", pointerEvents:"none", background:"rgb(32,32,32)" });
      document.documentElement.appendChild(marker);
      const blocker = document.createElement("div");
      blocker.id = "hit-test-blocker";
      Object.assign(blocker.style, { position:"fixed", zIndex:"2147483646", pointerEvents:"auto", background:"transparent" });
      document.documentElement.appendChild(blocker);
      window.__HIT_EVENTS = [];
      window.__BLOCK_ARM = null;
      window.__SEM_ARM = null;
      blocker.addEventListener("click", (event) => {
        const arm = window.__BLOCK_ARM;
        if (!arm) return;
        window.__HIT_EVENTS.push({ kind:"blocker", cycle:arm.cycle, isTrusted:event.isTrusted, targetId:event.target?.id ?? null, clientX:event.clientX, clientY:event.clientY, handlerWallMs:performance.timeOrigin + performance.now() });
        window.__BLOCK_ARM = null;
        event.preventDefault();
        event.stopPropagation();
      }, true);
      const button = document.querySelector(".spc-world-mode-toggle");
      button.addEventListener("click", (event) => {
        const arm = window.__SEM_ARM;
        window.__HIT_EVENTS.push({ kind:"button", cycle:arm?.cycle ?? null, isTrusted:event.isTrusted, targetClass:event.target?.className ?? null, clientX:event.clientX, clientY:event.clientY, handlerWallMs:performance.timeOrigin + performance.now() });
      }, true);
      return true;
    })()`);

    const initialCanonical = await evalValue(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const initialHash = hash(initialCanonical);
    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 700, maxHeight: 450, everyNthFrame: 1 });
    screencast = true;

    for (let cycle = 1; cycle <= CYCLES; cycle += 1) {
      const beforeCanonical = await evalValue(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const beforeHash = hash(beforeCanonical);
      const blockedGeneration = cycle * 2 - 1;
      const semanticGeneration = cycle * 2;
      const blockedColor = color(blockedGeneration);
      const semanticColor = color(semanticGeneration);

      const geometry = await evalValue(cdp, `(() => {
        const root = document.querySelector("#app");
        const button = document.querySelector(".spc-world-mode-toggle");
        const blocker = document.querySelector("#hit-test-blocker");
        const r = button.getBoundingClientRect();
        Object.assign(blocker.style, { left:r.left+"px", top:r.top+"px", width:r.width+"px", height:r.height+"px" });
        const x = r.left + r.width/2, y = r.top + r.height/2;
        window.__BLOCK_ARM = { cycle:${cycle} };
        return { worldOnly:root.classList.contains("spc-world-only"), x, y, w:r.width, h:r.height, hitId:document.elementFromPoint(x,y)?.id ?? null };
      })()`);
      if (!(geometry.w > 0 && geometry.h > 0)) throw new Error(`cycle ${cycle}: toggle has no hit box`);
      if (geometry.hitId !== "hit-test-blocker") throw new Error(`cycle ${cycle}: blocker is not top hit target (${geometry.hitId})`);

      const buttonCountBefore = await evalValue(cdp, `window.__HIT_EVENTS.filter(e => e.kind === "button").length`);
      const pointerSendUtcMs = Date.now();
      await cdp.send("Input.dispatchMouseEvent", { type:"mouseMoved", x:geometry.x, y:geometry.y, button:"none", buttons:0 });
      await cdp.send("Input.dispatchMouseEvent", { type:"mousePressed", x:geometry.x, y:geometry.y, button:"left", buttons:1, clickCount:1 });
      await cdp.send("Input.dispatchMouseEvent", { type:"mouseReleased", x:geometry.x, y:geometry.y, button:"left", buttons:0, clickCount:1 });
      const blockedEvent = await until(() => evalValue(cdp, `(() => [...window.__HIT_EVENTS].reverse().find(e => e.kind === "blocker" && e.cycle === ${cycle}) ?? null)()`), TIMEOUT, `blocked trusted pointer ${cycle}`);
      const blockedState = await evalValue(cdp, `(() => ({ worldOnly:document.querySelector("#app")?.classList.contains("spc-world-only") ?? null, buttonEventCount:window.__HIT_EVENTS.filter(e => e.kind === "button").length }))()`);
      await setMarker(cdp, blockedGeneration, blockedColor);
      const blockedFrame = await waitFrame(cdp, frames, blockedColor, blockedEvent.handlerWallMs);
      if (!blockedFrame) throw new Error(`cycle ${cycle}: no blocked presented frame`);
      const afterBlockedCanonical = await evalValue(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const afterBlockedHash = hash(afterBlockedCanonical);
      const blockedPng = Buffer.from(blockedFrame.data, "base64");
      const blockedFile = resolve(OUT_DIR, `hit-test-blocked-${String(cycle).padStart(2,"0")}.png`);
      writeFileSync(blockedFile, blockedPng);

      const semanticPre = await evalValue(cdp, `(() => {
        const root=document.querySelector("#app"), button=document.querySelector(".spc-world-mode-toggle"), blocker=document.querySelector("#hit-test-blocker");
        const r=button.getBoundingClientRect(), x=r.left+r.width/2, y=r.top+r.height/2;
        return { worldOnly:root.classList.contains("spc-world-only"), x, y, hitId:document.elementFromPoint(x,y)?.id ?? null, blockerLeft:blocker.getBoundingClientRect().left, blockerTop:blocker.getBoundingClientRect().top };
      })()`);
      if (semanticPre.hitId !== "hit-test-blocker") throw new Error(`cycle ${cycle}: blocker no longer covers button before semantic click`);
      await evalValue(cdp, `window.__SEM_ARM = { cycle:${cycle} }`);
      const semanticSendUtcMs = Date.now();
      await evalValue(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
      const semanticEvent = await until(() => evalValue(cdp, `(() => [...window.__HIT_EVENTS].reverse().find(e => e.kind === "button" && e.cycle === ${cycle}) ?? null)()`), TIMEOUT, `semantic click ${cycle}`);
      const semanticState = await until(() => evalValue(cdp, `(() => { const worldOnly=document.querySelector("#app")?.classList.contains("spc-world-only") ?? null; return worldOnly !== ${geometry.worldOnly ? "true" : "false"} ? { worldOnly } : null; })()`), TIMEOUT, `semantic projection toggle ${cycle}`);
      await setMarker(cdp, semanticGeneration, semanticColor);
      const semanticFrame = await waitFrame(cdp, frames, semanticColor, semanticEvent.handlerWallMs);
      if (!semanticFrame) throw new Error(`cycle ${cycle}: no semantic bypass presented frame`);
      const afterSemanticCanonical = await evalValue(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const afterSemanticHash = hash(afterSemanticCanonical);
      const semanticPng = Buffer.from(semanticFrame.data, "base64");
      const semanticFile = resolve(OUT_DIR, `hit-test-semantic-${String(cycle).padStart(2,"0")}.png`);
      writeFileSync(semanticFile, semanticPng);
      await evalValue(cdp, `window.__SEM_ARM = null`);

      report.cycles.push({
        cycle,
        beforeWorldOnly: geometry.worldOnly,
        blockerHitTarget: geometry.hitId,
        buttonCenter: { x: geometry.x, y: geometry.y },
        blocked: {
          isTrusted: blockedEvent.isTrusted,
          targetId: blockedEvent.targetId,
          clientX: blockedEvent.clientX,
          clientY: blockedEvent.clientY,
          pointerSendUtcMs,
          handlerWallMs: blockedEvent.handlerWallMs,
          pointerSendToHandlerMs: blockedEvent.handlerWallMs - pointerSendUtcMs,
          projectionUnchanged: blockedState.worldOnly === geometry.worldOnly,
          buttonEventCountBefore: buttonCountBefore,
          buttonEventCountAfter: blockedState.buttonEventCount,
          frameSwapUtcMs: blockedFrame.frameSwapUtcMs,
          handlerToFrameSwapMs: blockedFrame.frameSwapUtcMs - blockedEvent.handlerWallMs,
          pngSha256: createHash("sha256").update(blockedPng).digest("hex"),
          pngBytes: blockedPng.length,
          canonicalHashAfter: afterBlockedHash,
        },
        semanticBypass: {
          hitTargetStillBlocker: semanticPre.hitId,
          isTrusted: semanticEvent.isTrusted,
          clientX: semanticEvent.clientX,
          clientY: semanticEvent.clientY,
          semanticSendUtcMs,
          handlerWallMs: semanticEvent.handlerWallMs,
          semanticSendToHandlerMs: semanticEvent.handlerWallMs - semanticSendUtcMs,
          projectionToggled: semanticState.worldOnly !== geometry.worldOnly,
          afterWorldOnly: semanticState.worldOnly,
          frameSwapUtcMs: semanticFrame.frameSwapUtcMs,
          handlerToFrameSwapMs: semanticFrame.frameSwapUtcMs - semanticEvent.handlerWallMs,
          pngSha256: createHash("sha256").update(semanticPng).digest("hex"),
          pngBytes: semanticPng.length,
          canonicalHashAfter: afterSemanticHash,
        },
        canonicalTickBefore: beforeCanonical.tick ?? null,
        canonicalTickAfterBlocked: afterBlockedCanonical.tick ?? null,
        canonicalTickAfterSemantic: afterSemanticCanonical.tick ?? null,
        canonicalHashBefore: beforeHash,
        canonicalStable: beforeHash === afterBlockedHash && beforeHash === afterSemanticHash,
      });
    }

    const finalCanonical = await evalValue(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    assert("real pointer is blocked by the current hit-test overlay", report.cycles.length === CYCLES && report.cycles.every((x) => x.blocked.isTrusted && x.blocked.targetId === "hit-test-blocker" && x.blocked.projectionUnchanged && x.blocked.buttonEventCountAfter === x.blocked.buttonEventCountBefore), report.cycles.map((x) => x.blocked));
    assert("semantic button.click bypasses the same blocker", report.cycles.every((x) => x.semanticBypass.hitTargetStillBlocker === "hit-test-blocker" && x.semanticBypass.isTrusted === false && x.semanticBypass.projectionToggled), report.cycles.map((x) => x.semanticBypass));
    assert("both blocked and bypass actions reach exact compositor frames", report.cycles.every((x) => x.blocked.pngBytes > 10000 && x.semanticBypass.pngBytes > 10000), report.cycles.map((x) => [x.blocked.pngBytes, x.semanticBypass.pngBytes]));
    assert("occlusion experiment preserves canonical World", report.cycles.every((x) => x.canonicalStable) && hash(finalCanonical) === initialHash, { initialHash, finalHash: hash(finalCanonical) });
    const swapTimes = report.cycles.flatMap((x) => [x.blocked.frameSwapUtcMs, x.semanticBypass.frameSwapUtcMs]);
    assert("frame-swap timestamps are monotonic", swapTimes.every((x, i) => i === 0 || x >= swapTimes[i - 1]), swapTimes);
    assert("no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    if (cdp && screencast) await cdp.send("Page.stopScreencast").catch(() => {});
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(100);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

async function setMarker(cdp, generation, rgb) {
  return evalValue(cdp, `(() => { const marker=document.querySelector("#hit-test-frame-marker"); marker.style.background="rgb(${rgb.join(",")})"; marker.dataset.generation=${JSON.stringify(String(generation))}; return true; })()`);
}

async function waitFrame(cdp, frames, expectedColor, notBeforeWallMs) {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const frame = frames.shift();
    if (!frame) { await sleep(2); continue; }
    const frameSwapUtcMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(frameSwapUtcMs) || frameSwapUtcMs + 2 < notBeforeWallMs) continue;
    const rgba = await sampleMarker(cdp, frame.data);
    if (near(rgba, expectedColor)) return { ...frame, frameSwapUtcMs };
  }
  return null;
}

async function sampleMarker(cdp, data) {
  return evalValue(cdp, `(async() => {
    const raw=atob(${JSON.stringify(data)}), bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++) bytes[i]=raw.charCodeAt(i);
    const bitmap=await createImageBitmap(new Blob([bytes],{type:"image/png"}));
    const canvas=document.createElement("canvas"); canvas.width=bitmap.width; canvas.height=bitmap.height;
    const ctx=canvas.getContext("2d",{willReadFrequently:true}); ctx.drawImage(bitmap,0,0);
    const rgba=Array.from(ctx.getImageData(Math.floor(bitmap.width*.02),Math.floor(bitmap.height*.02),1,1).data);
    bitmap.close(); return rgba;
  })()`);
}

main().catch((error) => {
  writeFileSync(OUTPUT, `${JSON.stringify({ schemaVersion:1, experiment:"spc-real-pointer-hit-test-occlusion-p0", sourceSha:SOURCE_SHA, outcome:"HARNESS_ERROR", error:{ message:error?.message ?? String(error), stack:error?.stack ?? null }, finishedAt:new Date().toISOString() }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
