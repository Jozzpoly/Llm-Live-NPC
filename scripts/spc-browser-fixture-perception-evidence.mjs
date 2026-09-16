import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT_FILE = resolve(process.env.FIXTURE_PERCEPTION_OUTPUT ?? "evidence/browser/fixture-perception.json");
const MAX_STEPS = 1_500;
const FIXTURE_ACTOR_ID = "player.relocator";
const CRATE_ID = "crate.workshop.01";

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
    this.listeners.set(method, [...(this.listeners.get(method) ?? []), listener]);
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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "Runtime.evaluate failed");
  }
  return result.result?.value;
}

async function waitForJson(url, timeoutMs = 15_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitUntil(fn, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await fn()) return;
    await sleep(20);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function assert(report, name, pass, detail) {
  report.assertions.push({ name, pass: Boolean(pass), detail });
}

async function run() {
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-fixture-perception-`);
  const port = 11_900 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), [
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
    "--window-size=1400,900",
    "about:blank",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let cdp;
  const report = {
    schemaVersion: 1,
    experiment: "spc-browser-fixture-private-perception",
    sourceSha: SOURCE_SHA,
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    worldSteps: 0,
    resolvedTick: null,
    fixtureActorId: FIXTURE_ACTOR_ID,
    residentFixturePercepts: {},
    observationMutations: 0,
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
    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
    ]);

    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate-recovery` });
    await waitUntil(
      async () => Boolean(await evaluate(cdp, `window.__SPC_EVIDENCE__?.ready?.()`)),
      20_000,
      "missing-crate recovery evidence scene",
    );

    while (report.worldSteps < MAX_STEPS) {
      await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(1)`);
      report.worldSteps += 1;

      const sample = await evaluate(cdp, `(()=>{
        const evidence = window.__SPC_EVIDENCE__;
        const before = JSON.stringify(evidence.canonicalSnapshot());
        const residents = evidence.snapshot().snapshot.residents.map((resident) => resident.id);
        const counts = {};
        const newest = {};
        for (const residentId of residents) {
          const button = document.querySelector('[data-resident="' + residentId + '"]');
          if (!button) throw new Error('resident selection button missing: ' + residentId);
          button.click();
          const diagnostics = evidence.snapshot().selectedDiagnostics;
          const percepts = diagnostics?.recentPercepts?.filter((percept) => percept.actorId === ${JSON.stringify(FIXTURE_ACTOR_ID)}) ?? [];
          counts[residentId] = percepts.length;
          newest[residentId] = percepts.length ? percepts[percepts.length - 1] : null;
        }
        const after = JSON.stringify(evidence.canonicalSnapshot());
        const canonical = JSON.parse(after);
        const crate = canonical.authoritativeWorld?.materialObjects?.find((object) => object.id === ${JSON.stringify(CRATE_ID)}) ?? null;
        return {
          tick: canonical.tick,
          counts,
          newest,
          observationMutatedCanonical: before !== after,
          matterStatus: canonical.continuity?.matter?.status ?? null,
          crateLocation: crate?.location ?? null,
        };
      })()`);

      if (sample.observationMutatedCanonical) report.observationMutations += 1;
      for (const [residentId, count] of Object.entries(sample.counts ?? {})) {
        const current = report.residentFixturePercepts[residentId] ?? {
          maxVisibleInRecentPercepts: 0,
          firstObservedTick: null,
          lastObservedTick: null,
          lastPercept: null,
        };
        if (count > 0) {
          current.maxVisibleInRecentPercepts = Math.max(current.maxVisibleInRecentPercepts, count);
          if (current.firstObservedTick === null) current.firstObservedTick = sample.tick;
          current.lastObservedTick = sample.tick;
          current.lastPercept = sample.newest?.[residentId] ?? null;
        }
        report.residentFixturePercepts[residentId] = current;
      }

      if (sample.matterStatus === "resolved" && sample.crateLocation?.kind === "held" && sample.crateLocation?.actorId === "resident.janek") {
        report.resolvedTick = sample.tick;
        break;
      }
    }

    const contaminated = Object.entries(report.residentFixturePercepts)
      .filter(([, value]) => value.maxVisibleInRecentPercepts > 0)
      .map(([residentId, value]) => ({ residentId, ...value }));

    assert(report, "missing-crate recovery reaches factual resolved pickup boundary", report.resolvedTick !== null, {
      worldSteps: report.worldSteps,
      resolvedTick: report.resolvedTick,
    });
    assert(report, "research fixture actor never enters any resident private percept stream during recovery", contaminated.length === 0, contaminated);
    assert(report, "switching private research projections does not mutate canonical World state", report.observationMutations === 0, {
      observationMutations: report.observationMutations,
    });
    assert(report, "fixture perception oracle has no uncaught runtime exceptions", report.runtimeExceptions.length === 0, report.runtimeExceptions);

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

run().catch((error) => {
  writeFileSync(OUTPUT_FILE, `${JSON.stringify({
    schemaVersion: 1,
    experiment: "spc-browser-fixture-private-perception",
    sourceSha: SOURCE_SHA,
    outcome: "HARNESS_ERROR",
    error: { message: error?.message ?? String(error), stack: error?.stack ?? null },
    finishedAt: new Date().toISOString(),
  }, null, 2)}\n`);
  console.error(error);
  process.exitCode = 1;
});
