import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.TRUSTED_PLAYER_LOOP_OUTPUT ?? "evidence/browser/trusted-player-loop.json");
const OUT_DIR = dirname(OUTPUT);
const PLAYER_ID = "player.jozz";
const MIRA_ID = "resident.mira";
mkdirSync(OUT_DIR, { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function chromeExecutable() {
  for (const candidate of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) {
    if (existsSync(candidate)) return candidate;
  }
  for (const binary of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const path = execFileSync("which", [binary], { encoding: "utf8" }).trim();
      if (path) return path;
    } catch {}
  }
  throw new Error("Chrome not found");
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.id = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolveOpen, rejectOpen) => {
      const timer = setTimeout(() => rejectOpen(new Error("CDP open timeout")), 10_000);
      this.ws.addEventListener("open", () => { clearTimeout(timer); resolveOpen(); }, { once: true });
      this.ws.addEventListener("error", () => rejectOpen(new Error("CDP open failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => this.message(event.data));
  }
  message(raw) {
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
  send(method, params = {}, timeoutMs = 30_000) {
    const id = this.id++;
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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed");
  return result.result?.value;
}

async function waitJson(url, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`timeout waiting for ${url}`);
}

async function until(fn, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await fn();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function dispatchKey(cdp, phase, key, code, virtualKeyCode) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: phase,
    key,
    code,
    windowsVirtualKeyCode: virtualKeyCode,
    nativeVirtualKeyCode: virtualKeyCode,
  });
}

async function pressShortcut(cdp, key, code, virtualKeyCode) {
  await dispatchKey(cdp, "keyDown", key, code, virtualKeyCode);
  await sleep(70);
  await dispatchKey(cdp, "keyUp", key, code, virtualKeyCode);
  await sleep(70);
}

async function trustedMove(cdp, key, code, virtualKeyCode, steps) {
  await dispatchKey(cdp, "keyDown", key, code, virtualKeyCode);
  await sleep(30);
  const before = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot().snapshot.actors.find(a=>a.id==='player.jozz')");
  await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${steps})`);
  const after = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot().snapshot.actors.find(a=>a.id==='player.jozz')");
  await dispatchKey(cdp, "keyUp", key, code, virtualKeyCode);
  await sleep(50);
  return { steps, before, after };
}

async function selectResident(cdp, residentId) {
  const selected = await evaluate(cdp, `(()=>{const n=document.querySelector('[data-resident=${JSON.stringify(residentId)}]');if(!n)return false;n.click();return true})()`);
  if (!selected) throw new Error(`unable to select ${residentId}`);
  await sleep(20);
}

async function miraState(cdp) {
  await selectResident(cdp, MIRA_ID);
  const frame = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  const actor = frame.snapshot.actors.find((candidate) => candidate.id === MIRA_ID);
  const player = frame.snapshot.actors.find((candidate) => candidate.id === PLAYER_ID);
  return {
    tick: frame.snapshot.tick,
    miraPosition: actor?.position ?? null,
    playerPosition: player?.position ?? null,
    distance: actor && player ? Math.hypot(actor.position.x - player.position.x, actor.position.y - player.position.y) : null,
    recentPercepts: frame.selectedDiagnostics?.recentPercepts ?? [],
    trace: frame.selectedDiagnostics?.trace ?? [],
  };
}

async function latestPlayerSpeech(cdp, previousIds = []) {
  const frame = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  return [...frame.recentOccurrences].reverse().find((occurrence) => occurrence.kind === "speech" && occurrence.actorId === PLAYER_ID && !previousIds.includes(occurrence.id)) ?? null;
}

async function capturePlayerFollow(cdp, label) {
  const set = await evaluate(cdp, `(()=>{const p=document.querySelector('[data-action="player"]');if(!p)return false;p.click();const g=document.querySelector('.spc-world-mode-toggle');if(g && g.getAttribute('aria-pressed')!=='true')g.click();return true})()`);
  if (!set) throw new Error("unable to establish player-follow camera");
  await sleep(300);
  const before = await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const after = await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
  const bytes = Buffer.from(data, "base64");
  const fileName = `trusted-player-${label}.png`;
  writeFileSync(resolve(OUT_DIR, fileName), bytes);
  return {
    claimClass: "player-follow-camera-frame-not-epistemic-participant-view",
    fileName,
    tick: before.tick,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    canonicalBeforeHash: hashJson(before),
    canonicalAfterHash: hashJson(after),
    canonicalStableDuringCapture: hashJson(before) === hashJson(after),
  };
}

function perceptForOccurrence(state, occurrenceId) {
  return state.recentPercepts.find((percept) => percept.occurrenceId === occurrenceId) ?? null;
}

function latestPlayerSight(state) {
  return [...state.recentPercepts].reverse().find((percept) => percept.actorId === PLAYER_ID && percept.modality === "sight") ?? null;
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-trusted-player-`);
  const port = 12800 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--window-size=1400,900", "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  const report = {
    schemaVersion: 1,
    experiment: "spc-trusted-player-causal-loop",
    sourceSha: SOURCE_SHA,
    specimen: "existing baseline-delivery browser specimen under manual World stepping",
    claimLimits: [
      "WASD/H are real trusted Chromium keyboard events; World stepping and research selection remain evidence instrumentation.",
      "Captured frames use player-follow camera. This is camera framing, NOT player-private epistemic visibility.",
      "The probe qualifies input/body/World/perception joins, not fun, readability, sustained resident autonomy or live LLM cognition.",
    ],
    startedAt: new Date().toISOString(),
    chrome: null,
    runtimeExceptions: [],
    keyEvents: [],
    checkpoints: {},
    frames: [],
    assertions: [],
  };
  const assert = (name, pass, detail) => report.assertions.push({ name, pass: Boolean(pass), detail });

  try {
    const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    const target = await targetResponse.json();
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => report.runtimeExceptions.push(exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? "unknown"));
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }),
    ]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=baseline-delivery` });
    await until(() => evaluate(cdp, "Boolean(window.__SPC_EVIDENCE__?.ready?.())"), 20_000, "baseline evidence scene");
    await evaluate(cdp, `(()=>{window.__TRUSTED_PLAYER_KEYS=[];for(const type of ['keydown','keyup'])window.addEventListener(type,e=>window.__TRUSTED_PLAYER_KEYS.push({type,key:e.key,code:e.code,isTrusted:e.isTrusted,wallMs:performance.timeOrigin+performance.now()}),true);return true})()`);

    // Establish initial resident sensing through one factual World tick.
    await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(1)");
    report.checkpoints.initial = await miraState(cdp);
    report.frames.push(await capturePlayerFollow(cdp, "initial"));

    const priorOccurrenceIds = (await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot().recentOccurrences.map(o=>o.id)")) ?? [];
    await pressShortcut(cdp, "h", "KeyH", 72);
    const nearSpeech = await until(() => latestPlayerSpeech(cdp, priorOccurrenceIds), 2_000, "near trusted player speech");
    report.checkpoints.nearSpeech = {
      occurrence: nearSpeech,
      mira: await miraState(cdp),
    };

    // Real trusted movement takes the player far beyond Mira's sight/hearing radii.
    report.checkpoints.moveFar = await trustedMove(cdp, "d", "KeyD", 68, 500);
    report.checkpoints.far = await miraState(cdp);
    report.frames.push(await capturePlayerFollow(cdp, "far"));

    const priorFarIds = (await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot().recentOccurrences.map(o=>o.id)")) ?? [];
    await pressShortcut(cdp, "h", "KeyH", 72);
    const farSpeech = await until(() => latestPlayerSpeech(cdp, priorFarIds), 2_000, "far trusted player speech");
    report.checkpoints.farSpeech = {
      occurrence: farSpeech,
      mira: await miraState(cdp),
    };

    // Return near Mira with a real trusted opposite movement key.
    report.checkpoints.moveBack = await trustedMove(cdp, "a", "KeyA", 65, 480);
    report.checkpoints.returned = await miraState(cdp);
    report.frames.push(await capturePlayerFollow(cdp, "returned"));

    const priorReturnIds = (await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot().recentOccurrences.map(o=>o.id)")) ?? [];
    await pressShortcut(cdp, "h", "KeyH", 72);
    const returnSpeech = await until(() => latestPlayerSpeech(cdp, priorReturnIds), 2_000, "returned trusted player speech");
    report.checkpoints.returnSpeech = {
      occurrence: returnSpeech,
      mira: await miraState(cdp),
    };

    report.keyEvents = await evaluate(cdp, "window.__TRUSTED_PLAYER_KEYS");

    const initialSight = latestPlayerSight(report.checkpoints.initial);
    const farSight = latestPlayerSight(report.checkpoints.far);
    const returnedSight = latestPlayerSight(report.checkpoints.returned);
    const nearPercept = perceptForOccurrence(report.checkpoints.nearSpeech.mira, nearSpeech.id);
    const farPercept = perceptForOccurrence(report.checkpoints.farSpeech.mira, farSpeech.id);
    const returnPercept = perceptForOccurrence(report.checkpoints.returnSpeech.mira, returnSpeech.id);
    const movementEvents = report.keyEvents.filter((event) => event.code === "KeyD" || event.code === "KeyA");
    const speechEvents = report.keyEvents.filter((event) => event.code === "KeyH");

    assert("all injected participant action keys reached the page as trusted browser events", report.keyEvents.length >= 8 && report.keyEvents.every((event) => event.isTrusted), report.keyEvents);
    assert("trusted D input moves the factual player body far from Mira", report.checkpoints.moveFar.after.position.x - report.checkpoints.moveFar.before.position.x > 1_000 && report.checkpoints.far.distance > 520, {
      movementEvents,
      move: report.checkpoints.moveFar,
      distance: report.checkpoints.far.distance,
    });
    assert("Mira's private sight stream records factual loss of the player after trusted movement", farSight?.phenomenon === "actor_sight_exit" && farSight.actorId === PLAYER_ID, farSight);
    assert("trusted near H creates one factual World speech occurrence that enters Mira's private hearing", nearSpeech.actorId === PLAYER_ID && nearSpeech.text === "Hej!" && nearPercept?.modality === "hearing" && nearPercept.occurrenceId === nearSpeech.id, {
      speechEvents,
      occurrence: nearSpeech,
      percept: nearPercept,
      distance: report.checkpoints.nearSpeech.mira.distance,
    });
    assert("the same trusted H outside Mira hearing range stays absent from Mira private perception", report.checkpoints.farSpeech.mira.distance > 420 && farPercept === null, {
      occurrence: farSpeech,
      percept: farPercept,
      distance: report.checkpoints.farSpeech.mira.distance,
    });
    assert("trusted A return causes Mira to reacquire the factual player", report.checkpoints.returned.distance < 520 && returnedSight && returnedSight.phenomenon !== "actor_sight_exit" && returnedSight.actorId === PLAYER_ID, {
      move: report.checkpoints.moveBack,
      distance: report.checkpoints.returned.distance,
      sight: returnedSight,
    });
    assert("trusted H after reacquisition again joins the factual speech occurrence to Mira private hearing", report.checkpoints.returnSpeech.mira.distance < 420 && returnPercept?.modality === "hearing" && returnPercept.occurrenceId === returnSpeech.id, {
      occurrence: returnSpeech,
      percept: returnPercept,
      distance: report.checkpoints.returnSpeech.mira.distance,
    });
    assert("player-follow frame capture remains observational and non-mutating", report.frames.length === 3 && report.frames.every((frame) => frame.canonicalStableDuringCapture && frame.bytes > 10_000), report.frames);
    assert("no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.every((entry) => entry.pass) ? "PASS" : "FAIL";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    if (report.outcome !== "PASS") process.exitCode = 1;
  } finally {
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((error) => {
  writeFileSync(OUTPUT, `${JSON.stringify({ schemaVersion: 1, experiment: "spc-trusted-player-causal-loop", sourceSha: SOURCE_SHA, outcome: "HARNESS_ERROR", error: { message: error?.message ?? String(error), stack: error?.stack ?? null }, finishedAt: new Date().toISOString() }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
