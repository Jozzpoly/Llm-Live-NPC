import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.EVIDENCE_BASE_URL ?? "http://127.0.0.1:4173";
const OUTPUT = resolve(process.env.PRE_LUNA_WORLD_OUTPUT ?? "evidence/browser/pre-luna-world.json");
const IMAGE = resolve(process.env.PRE_LUNA_WORLD_SCREENSHOT ?? "evidence/browser/pre-luna-world.png");
const SOURCE_SHA = process.env.SOURCE_SHA ?? "local";
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
mkdirSync(dirname(OUTPUT), { recursive: true });
mkdirSync(dirname(IMAGE), { recursive: true });

function chromeExecutable() {
  for (const candidate of [
    process.env.CHROME_PATH, "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser",
  ].filter(Boolean)) if (existsSync(candidate)) return candidate;
  for (const command of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      const path = execFileSync("which", [command], { encoding: "utf8" }).trim();
      if (path) return path;
    } catch {}
  }
  throw new Error("Chrome or Chromium is required to verify the real browser scene");
}

class Cdp {
  constructor(url) {
    this.url = url;
    this.seq = 0;
    this.pending = new Map();
    this.events = new Map();
  }
  async connect() {
    this.ws = new WebSocket(this.url);
    await new Promise((done, reject) => {
      this.ws.addEventListener("open", done, { once: true });
      this.ws.addEventListener("error", () => reject(new Error("Chrome CDP connection failed")), { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result ?? {});
      } else {
        for (const fn of this.events.get(message.method) ?? []) fn(message.params ?? {});
      }
    });
  }
  on(type, fn) { this.events.set(type, [...(this.events.get(type) ?? []), fn]); }
  send(method, params = {}, timeout = 30000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("CDP timeout: " + method)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() { this.ws?.close(); }
}

async function evaluate(cdp, expression) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, 40000);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result?.value;
}

async function waitFor(predicate, label) {
  for (let i = 0; i < 140; i += 1) {
    if (await predicate()) return;
    await sleep(100);
  }
  throw new Error("Timed out waiting for " + label);
}

function assert(report, title, truth, detail = null) {
  report.assertions.push({ title, pass: Boolean(truth), detail });
  if (!truth) throw new Error("Browser FAIL: " + title + ": " + JSON.stringify(detail));
}

async function main() {
  const profile = mkdtempSync(tmpdir() + "/spc-preluna-");
  const port = 16700 + Math.floor(Math.random() * 150);
  const chrome = spawn(chromeExecutable(), [
    "--headless=new", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--disable-component-update",
    "--disable-default-apps", "--disable-extensions",
    "--remote-debugging-address=127.0.0.1", `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`, "--window-size=1400,900", "about:blank",
  ], { stdio: "ignore" });
  const report = {
    sourceSha: SOURCE_SHA, startedAt: new Date().toISOString(), assertions: [],
    providerLikeRequests: [], uncaughtExceptions: [], world: {}, normal: {}, screenshot: IMAGE,
  };
  let cdp;
  try {
    let version;
    await waitFor(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) version = await response.json();
        return Boolean(version);
      } catch { return false; }
    }, "Chrome debugging startup");
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!response.ok) throw new Error("Chrome failed to create tab: " + response.status);
    const target = await response.json();
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.connect();
    cdp.on("Runtime.exceptionThrown", (p) => report.uncaughtExceptions.push(p.exceptionDetails?.text ?? "exception"));
    cdp.on("Network.requestWillBeSent", (p) => {
      const url = p.request?.url ?? "";
      if (/\/api\/spc-next\/|\/v1\/responses|openai\.com\/v1\/|\/api\/cognition/i.test(url)) report.providerLikeRequests.push(url);
    });
    await Promise.all([
      cdp.send("Page.enable"), cdp.send("Runtime.enable"), cdp.send("Network.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false }),
    ]);

    await cdp.send("Page.navigate", { url: BASE_URL + "/?spc=1&scenario=five-resident-local&evidence=1" });
    await waitFor(async () => await evaluate(cdp, "Boolean(window.__SPC_EVIDENCE__?.ready?.() && document.querySelector('canvas'))"), "manual five-resident browser scene");
    const sceneMeta = await evaluate(cdp, `(() => ({
      title: document.title,
      chip: document.querySelector("#e1-stage-chip")?.textContent,
      note: document.querySelector(".spc-preluna-caption")?.textContent,
      worldOnly: document.querySelector("#app")?.classList.contains("spc-world-only"),
      evidenceVersion: window.__SPC_EVIDENCE__?.version
    }))()`);
    assert(report, "accurate World-only without Luna label", sceneMeta.worldOnly
      && sceneMeta.chip?.includes("0 LLM") && sceneMeta.note?.includes("bezczynni")
      && sceneMeta.evidenceVersion === 3, sceneMeta);
    const frame = await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
    assert(report, "real five-resident starting World", frame.snapshot.actors.filter((a) => a.kind === "resident").length === 5
      && frame.snapshot.actors.some((a) => a.id === "player.jozz"), {
      actors: frame.snapshot.actors.map((a) => a.id), tick: frame.snapshot.tick,
    });
    const playerAt = (f) => f.snapshot.actors.find((a) => a.id === "player.jozz")?.position;
    await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "d", code: "KeyD", windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
    await sleep(60);
    const moving = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(35)");
    await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "d", code: "KeyD", windowsVirtualKeyCode: 68, nativeVirtualKeyCode: 68 });
    const xBefore = playerAt(frame)?.x ?? 0;
    const xAfter = playerAt(moving)?.x ?? 0;
    assert(report, "real keyboard movement advances embodied player in authoritative World", xAfter > xBefore + 35,
      { xBefore, xAfter });
    const after = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(1500)");
    assert(report, "World time and recovered residents continue without Luna/LLM", after.snapshot.tick === 1535
      && after.snapshot.residents.length === 5
      && after.snapshot.residents.every((r) => r.pendingCognitionReasonCount >= 0), {
      tick: after.snapshot.tick, residents: after.snapshot.residents.length,
    });
    assert(report, "no resident-originated fictional matter from quiet alone", after.selectedLife?.matters.length === 0,
      { selectedLifeMatters: after.selectedLife?.matters.length });
    report.world = { initialTick: frame.snapshot.tick, finalTick: after.snapshot.tick, playerXBefore: xBefore, playerXAfter: xAfter };
    // Live Chromium inputs and actual authoritative World changes: a free
    // crate obstructs, pickup opens the route, placing closes it elsewhere.
    const material = async () => await evaluate(cdp, "window.__SPC_EVIDENCE__.materialObjects()");
    const key = async (code, down) => {
      const keys = { KeyD: ["d", 68], KeyE: ["e", 69], KeyS: ["s", 83] };
      const [letter, virtual] = keys[code] ?? [];
      if (!letter || !virtual) throw new Error("unknown browser evidence key: " + code);
      await cdp.send("Input.dispatchKeyEvent", {
        type: down ? "keyDown" : "keyUp",
        key: letter,
        code, windowsVirtualKeyCode: virtual, nativeVirtualKeyCode: virtual,
      });
    };
    // Approach the physical crate ON AXIS. The ordinary workshop entry is
    // deliberately offset; off-axis movement may legally slide around it.
    await key("KeyS", true);
    await sleep(70);
    const aligned = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(6)");
    await key("KeyS", false);
    assert(report, "browser probe aligns body with the real crate for a frontal collision",
      Math.abs((playerAt(aligned)?.y ?? -1) - 720) < 0.01,
      { player: playerAt(aligned) });
    await key("KeyD", true);
    await sleep(70);
    const blocked = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(110)");
    await key("KeyD", false);
    const blockedX = playerAt(blocked)?.x ?? -1;
    assert(report, "real free crate obstructs keyboard-driven player passage", blockedX > 1_905
      && blockedX < 1_922, { blockedX, material: await material() });
    await key("KeyE", true);
    await sleep(110);
    await key("KeyE", false);
    await sleep(70);
    const held = (await material()).find((object) => object.id === "crate.workshop.01");
    assert(report, "E physically picks up obstructing World crate", held?.location?.kind === "held"
      && held?.location?.actorId === "player.jozz", held);

    await key("KeyD", true);
    await sleep(70);
    const through = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(95)");
    await key("KeyD", false);
    const throughX = playerAt(through)?.x ?? -1;
    const carryingDelta = throughX - blockedX;
    assert(report, "carried crate opens the route but imposes real movement cost",
      throughX > 2_050 && carryingDelta > 145 && carryingDelta < 175,
      { throughX, blockedX, carryingDelta, oldCrateX: 1_952 });
    await key("KeyE", true);
    await sleep(110);
    await key("KeyE", false);
    await sleep(70);
    const placed = (await material()).find((object) => object.id === "crate.workshop.01");
    assert(report, "E physically places crate at an unoccupied new World location",
      placed?.location?.kind === "free" && placed.location.position.x > throughX + 35,
      placed);
    await key("KeyD", true);
    await sleep(70);
    const reblocked = await evaluate(cdp, "window.__SPC_EVIDENCE__.stepWorld(70)");
    await key("KeyD", false);
    const reblockedX = playerAt(reblocked)?.x ?? -1;
    assert(report, "new crate position immediately obstructs the body again",
      reblockedX > throughX && reblockedX < placed.location.position.x - 35.9,
      { reblockedX, placed });
    report.world.materialContact = {
      blockedX, throughX, reblockedX, cratePosition: placed.location.position,
    };

    await cdp.send("Page.navigate", { url: BASE_URL + "/?spc=1&scenario=five-resident-local" });
    await waitFor(async () => await evaluate(cdp, "Boolean(document.querySelector('canvas') && document.querySelector('.spc-tick')?.textContent)"), "normal world-only play scene");
    const normalBefore = await evaluate(cdp, `(() => ({
      tick: Number(/t(\\d+)/.exec(document.querySelector(".spc-tick")?.textContent ?? "")?.[1] ?? -1),
      worldOnly: document.querySelector("#app")?.classList.contains("spc-world-only"),
      chip: document.querySelector("#e1-stage-chip")?.textContent,
      hasEvidenceApi: Boolean(window.__SPC_EVIDENCE__),
      footer: document.querySelector(".game-shell footer")?.textContent,
    }))()`);
    await sleep(550);
    const normalAfter = await evaluate(cdp, `Number(/t(\\d+)/.exec(document.querySelector(".spc-tick")?.textContent ?? "")?.[1] ?? -1)`);
    assert(report, "ordinary play advances without evidence control or provider", normalBefore.tick >= 0
      && normalAfter > normalBefore.tick && normalBefore.worldOnly
      && !normalBefore.hasEvidenceApi && normalBefore.chip?.includes("0 LLM")
      && normalBefore.footer?.includes("E"), { normalBefore, normalAfter });
    report.normal = { ...normalBefore, afterTick: normalAfter };
    const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    writeFileSync(IMAGE, Buffer.from(shot.data, "base64"));
    assert(report, "real playable Chromium scene produced a screenshot", Buffer.from(shot.data, "base64").length > 2000);
    assert(report, "zero provider-like HTTP requests across both routes", report.providerLikeRequests.length === 0, report.providerLikeRequests);
    assert(report, "no uncaught browser exceptions", report.uncaughtExceptions.length === 0, report.uncaughtExceptions);
    report.outcome = "PASS";
  } catch (e) {
    report.outcome = "FAIL";
    report.error = e instanceof Error ? e.stack ?? e.message : String(e);
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync(OUTPUT, JSON.stringify(report, null, 2) + "\n");
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(200);
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }); } catch {}
    console.log(JSON.stringify({
      sourceSha: SOURCE_SHA, outcome: report.outcome,
      assertions: report.assertions.map((a) => ({ name: a.title, pass: a.pass })),
      providerLikeRequests: report.providerLikeRequests.length,
      error: report.error ?? null,
    }));
  }
}
await main();
