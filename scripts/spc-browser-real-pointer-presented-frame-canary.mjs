import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.REAL_POINTER_FRAME_OUTPUT ?? "evidence/browser/real-pointer-presented-frame.json");
const OUT_DIR = dirname(OUTPUT);
const STEPS = 10;
const TIMEOUT = 2000;
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chrome() {
  for (const path of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    if (existsSync(path)) return path;
  }
  for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const path = execFileSync("which", [binary], { encoding: "utf8" }).trim();
      if (path) return path;
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
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener("error", () => rejectOpen(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => this.msg(event.data));
  }

  msg(raw) {
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

const stable = (value) => JSON.stringify(value);
const hash = (value) => createHash("sha256").update(stable(value)).digest("hex");
const color = (generation) => [32 + (generation * 53) % 192, 32 + (generation * 97) % 192, 32 + (generation * 149) % 192];
const near = (actual, expected) => actual?.length >= 3 && expected.every((value, index) => Math.abs(actual[index] - value) <= 3);

async function evalv(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function pollJson(url, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`timeout ${url}`);
}

async function until(fn, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(5);
  }
  throw new Error(`timeout ${label}`);
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-pointer-frame-`);
  const port = 10500 + Math.floor(Math.random() * 300);
  const processHandle = spawn(chrome(), [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profile}`,
    "--window-size=1400,900",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  let cast = false;
  const frames = [];
  const report = {
    schemaVersion: 1,
    experiment: "spc-real-pointer-presented-frame-p0",
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    assertions: [],
    runtimeExceptions: [],
    transitions: [],
  };
  const check = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), detail });

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
      if (frames.length > 120) frames.splice(0, frames.length - 120);
    });
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }),
    ]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate` });
    await until(() => evalv(cdp, 'Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector(".spc-world-mode-toggle"))'), 20000, "SPC ready");
    await evalv(cdp, `(()=>{const m=document.createElement("div");m.id="ptr-frame-marker";Object.assign(m.style,{position:"fixed",left:"0px",top:"0px",width:"96px",height:"96px",zIndex:"2147483647",pointerEvents:"none",background:"rgb(32,32,32)"});document.documentElement.appendChild(m);window.__PTR_TARGET=null;window.__PTR_EVENTS=[];const b=document.querySelector(".spc-world-mode-toggle");b.addEventListener("click",e=>{const t=window.__PTR_TARGET;if(!t)return;m.style.background="rgb("+t.color.join(",")+")";m.dataset.generation=String(t.g);window.__PTR_EVENTS.push({g:t.g,isTrusted:e.isTrusted,clientX:e.clientX,clientY:e.clientY,handlerWallMs:performance.timeOrigin+performance.now()});window.__PTR_TARGET=null},true);return true})()`);

    const initial = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    const initialHash = hash(initial);
    await cdp.send("Page.startScreencast", { format: "png", quality: 100, maxWidth: 700, maxHeight: 450, everyNthFrame: 1 });
    cast = true;

    for (let generation = 1; generation <= STEPS; generation++) {
      const before = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const beforeHash = hash(before);
      const expectedColor = color(generation);
      const state = await evalv(cdp, `(()=>{const root=document.querySelector("#app"),b=document.querySelector(".spc-world-mode-toggle"),r=b.getBoundingClientRect();window.__PTR_TARGET={g:${generation},color:${JSON.stringify(expectedColor)}};return{worldOnly:root.classList.contains("spc-world-only"),x:r.left+r.width/2,y:r.top+r.height/2,w:r.width,h:r.height}})()`);
      if (!(state.w > 0 && state.h > 0)) throw new Error("toggle has no hit box");
      const sendMs = Date.now();
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: state.x, y: state.y, button: "none", buttons: 0 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: state.x, y: state.y, button: "left", buttons: 1, clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: state.x, y: state.y, button: "left", buttons: 0, clickCount: 1 });
      const event = await until(() => evalv(cdp, `(()=>{const e=[...(window.__PTR_EVENTS??[])].reverse().find(x=>x.g===${generation});if(!e)return null;return{...e,worldOnly:document.querySelector("#app")?.classList.contains("spc-world-only")??null}})()`), TIMEOUT, `trusted click ${generation}`);
      if (!event.isTrusted) throw new Error(`generation ${generation} not trusted`);
      if (event.worldOnly === state.worldOnly) throw new Error(`generation ${generation} did not toggle projection`);
      const ack = await waitFrame(cdp, frames, expectedColor, event.handlerWallMs);
      if (!ack) throw new Error(`generation ${generation} no presented frame`);
      const after = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
      const afterHash = hash(after);
      const bytes = Buffer.from(ack.data, "base64");
      const file = resolve(OUT_DIR, `pointer-presented-${String(generation).padStart(2, "0")}.png`);
      writeFileSync(file, bytes);
      report.transitions.push({
        generation,
        beforeWorldOnly: state.worldOnly,
        afterWorldOnly: event.worldOnly,
        isTrusted: event.isTrusted,
        clientX: event.clientX,
        clientY: event.clientY,
        pointerSendUtcMs: sendMs,
        pointerSendToHandlerMs: event.handlerWallMs - sendMs,
        handlerWallMs: event.handlerWallMs,
        frameSwapUtcMs: ack.frameSwapUtcMs,
        handlerToFrameSwapMs: ack.frameSwapUtcMs - event.handlerWallMs,
        pointerSendToFrameSwapMs: ack.frameSwapUtcMs - sendMs,
        receiveMinusFrameSwapMs: ack.receivedAtMs - ack.frameSwapUtcMs,
        canonicalTickBefore: before.tick ?? null,
        canonicalTickAfter: after.tick ?? null,
        canonicalHashBefore: beforeHash,
        canonicalHashAfter: afterHash,
        canonicalStable: beforeHash === afterHash,
        pngSha256: createHash("sha256").update(bytes).digest("hex"),
        pngBytes: bytes.length,
      });
    }

    const final = await evalv(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
    check("all clicks are trusted browser pointer events", report.transitions.length === STEPS && report.transitions.every((transition) => transition.isTrusted), report.transitions.map((transition) => transition.isTrusted));
    check("every trusted pointer toggles actual projection", report.transitions.every((transition) => transition.beforeWorldOnly !== transition.afterWorldOnly), report.transitions.map((transition) => [transition.beforeWorldOnly, transition.afterWorldOnly]));
    check("every trusted pointer reaches matching screencast frame", report.transitions.length === STEPS, report.transitions.length);
    check("presentation interactions preserve canonical World", report.transitions.every((transition) => transition.canonicalStable) && hash(final) === initialHash, { initialHash, finalHash: hash(final) });
    check("frame timestamps are monotonic", report.transitions.every((transition, index, transitions) => index === 0 || transition.frameSwapUtcMs >= transitions[index - 1].frameSwapUtcMs), report.transitions.map((transition) => transition.frameSwapUtcMs));
    check("no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((assertion) => assertion.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    if (cdp && cast) await cdp.send("Page.stopScreencast").catch(() => {});
    cdp?.close();
    processHandle.kill("SIGTERM");
    await sleep(100);
    if (!processHandle.killed) processHandle.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

async function waitFrame(cdp, frames, expectedColor, notBefore) {
  const end = Date.now() + TIMEOUT;
  while (Date.now() < end) {
    const frame = frames.shift();
    if (!frame) {
      await sleep(2);
      continue;
    }
    const frameTimestampMs = Number(frame.metadata?.timestamp) * 1000;
    if (!Number.isFinite(frameTimestampMs) || frameTimestampMs + 2 < notBefore) continue;
    const rgba = await sample(cdp, frame.data);
    if (near(rgba, expectedColor)) return { ...frame, frameSwapUtcMs: frameTimestampMs };
  }
  return null;
}

async function sample(cdp, data) {
  return evalv(cdp, `(async()=>{const s=atob(${JSON.stringify(data)}),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);const bm=await createImageBitmap(new Blob([u],{type:"image/png"})),cv=document.createElement("canvas");cv.width=bm.width;cv.height=bm.height;const x=cv.getContext("2d",{willReadFrequently:true});x.drawImage(bm,0,0);const rgba=Array.from(x.getImageData(Math.floor(bm.width*.02),Math.floor(bm.height*.02),1,1).data);bm.close();return rgba})()`);
}

main().catch((error) => {
  writeFileSync(OUTPUT, `${JSON.stringify({
    schemaVersion: 1,
    experiment: "spc-real-pointer-presented-frame-p0",
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: { message: error?.message ?? String(error), stack: error?.stack ?? null },
    finishedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
