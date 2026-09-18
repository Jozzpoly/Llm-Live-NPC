import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.LONG_WINDOW_OUTPUT ?? "evidence/browser/long-window-characterization.json");
const OUT_DIR = dirname(OUTPUT);
const MILESTONES = [0, 120, 300, 600, 900, 1200, 1800, 3000, 4500, 6000];
const RESIDENT_IDS = ["resident.mira", "resident.janek", "resident.ida", "resident.oren", "resident.nela"];
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
      const timer = setTimeout(() => rejectOpen(new Error("CDP open timeout")), 10000);
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
  send(method, params = {}, timeoutMs = 30000) {
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

async function waitJson(url, timeoutMs = 15000) {
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
    if (await fn()) return;
    await sleep(20);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function selectResident(cdp, residentId) {
  const selected = await evaluate(cdp, `(()=>{const n=document.querySelector('[data-resident=${JSON.stringify(residentId)}]');if(!n)return false;n.click();return true})()`);
  if (!selected) throw new Error(`missing resident button: ${residentId}`);
  await sleep(8);
}

async function setWorldOnly(cdp, enabled) {
  const ok = await evaluate(cdp, `(()=>{const n=document.querySelector('.spc-world-mode-toggle');if(!n)return false;const current=n.getAttribute('aria-pressed')==='true';if(current!==${JSON.stringify(enabled)})n.click();return true})()`);
  if (!ok) throw new Error("world-only toggle missing");
  await sleep(25);
}

async function overview(cdp) {
  const ok = await evaluate(cdp, `(()=>{const n=document.querySelector('[data-action="overview"]');if(!n)return false;n.click();return true})()`);
  if (!ok) throw new Error("overview action missing");
  await sleep(60);
}

async function captureSpectator(cdp, tick) {
  await setWorldOnly(cdp, true);
  await overview(cdp);
  const before = await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
  await sleep(70);
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const bytes = Buffer.from(data, "base64");
  const after = await evaluate(cdp, "window.__SPC_EVIDENCE__.canonicalSnapshot()");
  const beforeHash = hashJson(before);
  const afterHash = hashJson(after);
  const fileName = `long-window-spectator-t${tick}.png`;
  writeFileSync(resolve(OUT_DIR, fileName), bytes);
  return {
    claimClass: "spectator-observed-frame",
    fileName,
    tick,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    canonicalBeforeHash: beforeHash,
    canonicalAfterHash: afterHash,
    canonicalStableDuringCapture: beforeHash === afterHash,
  };
}

async function sampleMilestone(cdp, tick, runtimeExceptions) {
  const frame = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  if (frame.snapshot.tick !== tick) throw new Error(`expected t${tick}, got t${frame.snapshot.tick}`);
  const publicHashBefore = hashJson(frame.snapshot);
  const residents = {};
  for (const residentId of RESIDENT_IDS) {
    await selectResident(cdp, residentId);
    const selected = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
    const actor = selected.snapshot.actors.find((candidate) => candidate.id === residentId);
    const publicState = selected.snapshot.residents.find((candidate) => candidate.id === residentId);
    if (!actor || !publicState || selected.selectedDiagnostics?.publicState?.id !== residentId) {
      throw new Error(`incomplete private/public join for ${residentId} at t${tick}`);
    }
    const trace = selected.selectedDiagnostics.trace ?? [];
    const percepts = selected.selectedDiagnostics.recentPercepts ?? [];
    residents[residentId] = {
      position: actor.position,
      velocity: actor.velocity,
      facing: actor.facing,
      activity: publicState.activity,
      pendingCognitionReasonCount: publicState.pendingCognitionReasonCount,
      latestTraceTick: trace.at(-1)?.tick ?? null,
      latestTraceKind: trace.at(-1)?.kind ?? null,
      latestTraceSummary: trace.at(-1)?.summary ?? null,
      traceTail: trace.slice(-6),
      latestPerceptTick: percepts.at(-1)?.tick ?? null,
      perceptTail: percepts.slice(-4),
    };
  }
  const after = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
  return {
    tick,
    residents,
    recentOccurrenceCount: frame.recentOccurrences.length,
    recentOccurrences: frame.recentOccurrences.slice(-8),
    observationPublicStateStable: hashJson(after.snapshot) === publicHashBefore,
    runtimeExceptionCount: runtimeExceptions.length,
  };
}

function residentPlateau(a, b) {
  return RESIDENT_IDS.every((residentId) => {
    const left = a.residents[residentId];
    const right = b.residents[residentId];
    return JSON.stringify(left.position) === JSON.stringify(right.position)
      && JSON.stringify(left.velocity) === JSON.stringify(right.velocity)
      && JSON.stringify(left.activity) === JSON.stringify(right.activity);
  });
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-long-window-`);
  const port = 12500 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking",
    `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`,
    "--window-size=1400,900", "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let cdp;
  const report = {
    schemaVersion: 1,
    experiment: "spc-browser-long-window-characterization",
    sourceSha: SOURCE_SHA,
    specimen: "existing browser baseline-delivery; NOT the raw createFiveResidentRegionWorld sustained-life unit specimen",
    claimLimits: [
      "Characterization records what the existing built browser specimen does; behavior is not required to match an expected plateau.",
      "World-only screenshots are spectator-observed frames, not participant-view evidence.",
      "DOM research controls are instrumentation and are not evidence of trusted participant input.",
      "Pending cognition reason counts are observable scheduler pressure, not proof that a live provider admitted or acted on cognition.",
    ],
    startedAt: new Date().toISOString(),
    chrome: null,
    runtimeExceptions: [],
    milestones: [],
    spectatorFrames: [],
    assertions: [],
    findings: null,
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
    await until(() => evaluate(cdp, "Boolean(window.__SPC_EVIDENCE__?.ready?.())"), 20000, "baseline evidence scene");

    let currentTick = 0;
    for (const tick of MILESTONES) {
      const delta = tick - currentTick;
      if (delta > 0) await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${delta})`);
      currentTick = tick;
      report.milestones.push(await sampleMilestone(cdp, tick, report.runtimeExceptions));
      if (tick === 0 || tick === 900 || tick === 6000) report.spectatorFrames.push(await captureSpectator(cdp, tick));
      await setWorldOnly(cdp, false);
    }

    const at900 = report.milestones.find((entry) => entry.tick === 900);
    const at6000 = report.milestones.find((entry) => entry.tick === 6000);
    const plateau = residentPlateau(at900, at6000);
    const pendingAt6000 = Object.fromEntries(RESIDENT_IDS.map((residentId) => [residentId, at6000.residents[residentId].pendingCognitionReasonCount]));
    const traceTicksAt6000 = Object.fromEntries(RESIDENT_IDS.map((residentId) => [residentId, at6000.residents[residentId].latestTraceTick]));
    const frame900 = report.spectatorFrames.find((entry) => entry.tick === 900);
    const frame6000 = report.spectatorFrames.find((entry) => entry.tick === 6000);
    report.findings = {
      bodyAndLegacyActivityPlateauT900ToT6000: plateau,
      allResidentsStillAtT6000: RESIDENT_IDS.every((residentId) => Math.hypot(at6000.residents[residentId].velocity.x, at6000.residents[residentId].velocity.y) < 1e-9),
      pendingCognitionReasonCountsAtT6000: pendingAt6000,
      latestResidentTraceTicksAtT6000: traceTicksAt6000,
      recentPublicOccurrencesAtT6000: at6000.recentOccurrences,
      exactSameSpectatorPngT900AndT6000: frame900?.sha256 === frame6000?.sha256,
      spectatorPngHashes: { t900: frame900?.sha256 ?? null, t6000: frame6000?.sha256 ?? null },
    };

    assert("all requested milestone ticks were observed", report.milestones.length === MILESTONES.length && report.milestones.every((entry, index) => entry.tick === MILESTONES[index]), report.milestones.map((entry) => entry.tick));
    assert("research resident selection did not mutate public World snapshot", report.milestones.every((entry) => entry.observationPublicStateStable), report.milestones.map((entry) => ({ tick: entry.tick, stable: entry.observationPublicStateStable })));
    assert("spectator frame capture did not mutate canonical evidence state", report.spectatorFrames.every((entry) => entry.canonicalStableDuringCapture), report.spectatorFrames);
    assert("spectator PNGs are non-empty and independently hashed", report.spectatorFrames.length === 3 && report.spectatorFrames.every((entry) => entry.bytes > 10000 && /^[a-f0-9]{64}$/u.test(entry.sha256)), report.spectatorFrames);
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
  writeFileSync(OUTPUT, `${JSON.stringify({ schemaVersion: 1, experiment: "spc-browser-long-window-characterization", sourceSha: SOURCE_SHA, outcome: "HARNESS_ERROR", error: { message: error?.message ?? String(error), stack: error?.stack ?? null }, finishedAt: new Date().toISOString() }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
