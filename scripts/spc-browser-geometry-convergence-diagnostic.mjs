import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const OUTPUT = resolve(process.env.MANUAL_CONTROL_OUTPUT ?? "evidence/browser/manual-control.json");
mkdirSync(dirname(OUTPUT), { recursive: true });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

function chromeExecutable() {
  for (const p of [process.env.CHROME_PATH, "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean)) if (existsSync(p)) return p;
  for (const b of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try { const p = execFileSync("which", [b], { encoding: "utf8" }).trim(); if (p) return p; } catch {}
  }
  throw new Error("Chrome not found");
}

class CDP {
  constructor(url) { this.url = url; this.id = 1; this.pending = new Map(); }
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
    if (!message.id) return;
    const pending = this.pending.get(message.id); if (!pending) return;
    this.pending.delete(message.id);
    message.error ? pending.reject(new Error(`${pending.method}: ${message.error.message}`)) : pending.resolve(message.result ?? {});
  }
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
    await sleep(5);
  }
  throw new Error(`timeout ${label}`);
}

async function main() {
  const profile = mkdtempSync(`${tmpdir()}/spc-geometry-diagnostic-`);
  const port = 12200 + Math.floor(Math.random() * 300);
  const chrome = spawn(chromeExecutable(), ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${port}`, "--remote-debugging-address=127.0.0.1", `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank"], { stdio: ["ignore", "pipe", "pipe"] });
  let cdp;
  const report = { schemaVersion: 1, experiment: "spc-geometry-convergence-diagnostic", sourceSha: SOURCE_SHA, startedAt: new Date().toISOString(), samples: [] };
  try {
    const version = await pollJson(`http://127.0.0.1:${port}/json/version`); report.chrome = version.Browser ?? null;
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" })).json();
    cdp = new CDP(target.webSocketDebuggerUrl); await cdp.open();
    await Promise.all([cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false })]);
    await cdp.send("Page.navigate", { url: `${BASE_URL}/?spc=1&evidence=1&scenario=missing-crate&geometry-ack=1` });
    await until(() => evalv(cdp, `Boolean(window.__SPC_EVIDENCE__?.ready?.()&&window.__SPC_PRESENTATION_GEOMETRY_ACK__?.ready?.())`), 20000, "diagnostic ready");

    const capture = async (label, elapsedMs) => {
      const state = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__.state()");
      const worldOnly = await evalv(cdp, `document.querySelector("#app")?.classList.contains("spc-world-only")??null`);
      report.samples.push({ label, elapsedMs, wallUtcMs: Date.now(), worldOnly, state });
    };

    await capture("before-click", 0);
    const clickUtcMs = Date.now();
    await evalv(cdp, `document.querySelector(".spc-world-mode-toggle").click()`);
    await capture("immediate-after-click", Date.now() - clickUtcMs);

    let previous = 0;
    for (const targetMs of [10, 25, 50, 100, 150, 200, 300, 500, 1000]) {
      await sleep(Math.max(0, targetMs - previous));
      previous = targetMs;
      await capture(`after-${targetMs}ms`, Date.now() - clickUtcMs);
    }

    report.finishedAt = new Date().toISOString();
    report.outcome = "PASS_DIAGNOSTIC_CAPTURE";
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
  } catch (error) {
    report.finishedAt = new Date().toISOString(); report.outcome = "HARNESS_ERROR"; report.error = { message: error?.message ?? String(error), stack: error?.stack ?? null };
    if (cdp) {
      try { report.failureState = await evalv(cdp, "window.__SPC_PRESENTATION_GEOMETRY_ACK__?.state?.() ?? null"); } catch {}
    }
    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`); console.error(error); process.exitCode = 1;
  } finally {
    cdp?.close(); chrome.kill("SIGTERM"); await sleep(100); if (!chrome.killed) chrome.kill("SIGKILL"); rmSync(profile, { recursive: true, force: true });
  }
}

main();
