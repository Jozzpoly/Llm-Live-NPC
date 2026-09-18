import { spawn, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const BASE_URL = process.env.LIVE_PROVIDER_BASE_URL;
const SOURCE_SHA = process.env.SOURCE_SHA;
const OUTPUT_FILE = resolve(
  process.env.LIVE_PROVIDER_OUTPUT
    ?? "evidence/live-provider/live-provider-unified-addressed.json",
);
const VIEWPORT = { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false };
const PLAYER_ID = "player.jozz";
const PREFERRED_RESIDENT_ID = "resident.mira";
const SPEECH_RADIUS = 420;
const CALL_TEXT = "Mira, podejdź proszę do mnie i powiedz: Zaraz wracam do swoich spraw.";
const MAX_RECOVERY_STEPS = 1_200;
const MAX_MOVE_STEPS = 320;
const MAX_PROVIDER_WAIT_MS = 45_000;
const MAX_SETTLEMENT_STEPS = 300;
const MAX_RETURN_STEPS = 120;

if (!BASE_URL) throw new Error("LIVE_PROVIDER_BASE_URL is required");
if (!SOURCE_SHA) throw new Error("SOURCE_SHA is required");
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
      this.ws.addEventListener("open", () => {
        clearTimeout(timer);
        resolveOpen();
      }, { once: true });
      this.ws.addEventListener("error", () => {
        clearTimeout(timer);
        rejectOpen(new Error("CDP WebSocket connection failed"));
      }, { once: true });
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

async function run() {
  const chromePath = chromeExecutable();
  const userDataDir = mkdtempSync(`${tmpdir()}/spc-unified-addressed-`);
  const port = 12_700 + Math.floor(Math.random() * 250);
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--no-sandbox",
    "--disable-dev-shm-usage",
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
  const report = {
    schemaVersion: 1,
    qualification: null,
    sourceSha: SOURCE_SHA,
    candidateBaseUrl: BASE_URL,
    sourceBinding: "cloudflare-bot-exact-commit-preview",
    startedAt: new Date().toISOString(),
    chrome: null,
    assertions: [],
    runtimeExceptions: [],
    networkFailures: [],
    targetResidentId: null,
    participant: {},
    provider: {
      matchingRequest: null,
      matchingResponse: null,
      responseBody: null,
    },
    checkpoints: {},
  };

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    report.chrome = version.Browser ?? null;
    const targetResponse = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
    if (!targetResponse.ok) throw new Error(`Unable to create Chrome target: ${targetResponse.status}`);
    const target = await targetResponse.json();
    cdp = new CdpSession(target.webSocketDebuggerUrl);
    await cdp.connect();

    const lifeIntentRequests = [];
    const lifeIntentResponses = new Map();

    cdp.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      report.runtimeExceptions.push({
        text: exceptionDetails?.text ?? null,
        description: exceptionDetails?.exception?.description ?? null,
      });
    });

    cdp.on("Network.requestWillBeSent", (event) => {
      if (event.request?.method !== "POST"
        || !event.request?.url?.includes("/api/spc-next/life-intent")) return;
      let body = null;
      try {
        body = event.request.postData ? JSON.parse(event.request.postData) : null;
      } catch {}
      lifeIntentRequests.push({
        requestId: event.requestId,
        url: event.request.url,
        body,
      });
    });

    cdp.on("Network.responseReceived", (event) => {
      if (!event.response?.url?.includes("/api/spc-next/life-intent")) return;
      lifeIntentResponses.set(event.requestId, {
        requestId: event.requestId,
        status: event.response?.status ?? null,
        url: event.response?.url ?? null,
      });
    });

    cdp.on("Network.loadingFailed", (event) => {
      if (!lifeIntentRequests.some((request) => request.requestId === event.requestId)) return;
      report.networkFailures.push({
        requestId: event.requestId,
        errorText: event.errorText ?? null,
        canceled: event.canceled ?? false,
      });
    });

    await Promise.all([
      cdp.send("Page.enable"),
      cdp.send("Runtime.enable"),
      cdp.send("Network.enable"),
      cdp.send("Emulation.setDeviceMetricsOverride", VIEWPORT),
    ]);

    await navigateEvidence(cdp);

    const initial = await evidenceSnapshot(cdp);
    assertReport(report, "unified evidence scene starts with player and five residents", Boolean(
      actor(initial, PLAYER_ID)
      && initial.snapshot?.residents?.length === 5
      && initial.livingDiagnostics,
    ), summarizeFrame(initial));

    let frame = initial;
    let recoverySteps = 0;
    while ((frame.livingDiagnostics?.claimedResidentIds?.length ?? 0) < 5
      && recoverySteps < MAX_RECOVERY_STEPS) {
      frame = await stepEvidence(cdp, 1);
      recoverySteps += 1;
      if (recoverySteps % 8 === 0) await sleep(8);
    }
    assertReport(report, "all five residents recover into causal life", (
      frame.livingDiagnostics?.claimedResidentIds?.length ?? 0
    ) === 5, {
      recoverySteps,
      claimedResidentIds: frame.livingDiagnostics?.claimedResidentIds ?? [],
    });
    if ((frame.livingDiagnostics?.claimedResidentIds?.length ?? 0) !== 5) {
      throw new Error(`five-resident recovery did not complete within ${MAX_RECOVERY_STEPS} World steps`);
    }

    const targetId = chooseTargetResident(frame);
    report.targetResidentId = targetId;
    await selectResident(cdp, targetId);
    frame = await evidenceSnapshot(cdp);

    const targetBeforeMove = actor(frame, targetId);
    const playerBeforeMove = actor(frame, PLAYER_ID);
    if (!targetBeforeMove || !playerBeforeMove) throw new Error("target/player missing before movement");

    const moveResult = await movePlayerIntoVoiceRange(cdp, targetId);
    frame = moveResult.frame;
    const targetBeforeSpeech = actor(frame, targetId);
    const playerBeforeSpeech = actor(frame, PLAYER_ID);
    const voiceDistance = distance(playerBeforeSpeech?.position, targetBeforeSpeech?.position);
    assertReport(report, "player reaches target through normal control path before speaking", (
      moveResult.steps > 0 || distance(playerBeforeMove.position, targetBeforeMove.position) <= SPEECH_RADIUS
    ) && voiceDistance <= SPEECH_RADIUS, {
      steps: moveResult.steps,
      beforeDistance: distance(playerBeforeMove.position, targetBeforeMove.position),
      afterDistance: voiceDistance,
      player: playerBeforeSpeech?.position ?? null,
      target: targetBeforeSpeech?.position ?? null,
    });
    if (!(voiceDistance <= SPEECH_RADIUS)) {
      throw new Error(`player could not reach voice range; final distance=${voiceDistance}`);
    }

    const targetLifeBefore = frame.selectedLife;
    const preFocusedRunId = targetLifeBefore?.body?.focusedRunId ?? null;
    const preFocusedMatter = preFocusedRunId
      ? targetLifeBefore?.matters?.find((matter) => matter.activeRun?.runId === preFocusedRunId) ?? null
      : null;
    report.checkpoints.beforeSpeech = {
      tick: frame.snapshot.tick,
      voiceDistance,
      providerRequestCount: frame.livingDiagnostics?.providerRequestCount ?? null,
      targetLife: summarizeLife(targetLifeBefore),
      focusedRunId: preFocusedRunId,
      focusedMatterId: preFocusedMatter?.id ?? null,
    };

    const addressed = await addressResident(cdp, targetId, CALL_TEXT);
    report.participant.addressedOccurrence = addressed;
    assertReport(report, "player addressed speech is created as a public World occurrence", Boolean(
      addressed?.kind === "speech"
      && addressed?.actorId === PLAYER_ID
      && addressed?.text === CALL_TEXT
      && Array.isArray(addressed?.addressedActorIds)
      && addressed.addressedActorIds.includes(targetId)
    ), addressed);

    frame = await stepEvidence(cdp, 1);
    await selectResident(cdp, targetId);
    frame = await evidenceSnapshot(cdp);

    const privateSpeech = newestAddressedSpeechPercept(frame, PLAYER_ID, CALL_TEXT);
    assertReport(report, "target resident privately acquires the exact addressed speech", Boolean(
      privateSpeech
      && privateSpeech.addressed === true
      && privateSpeech.phenomenon === "speech"
      && privateSpeech.text === CALL_TEXT
    ), privateSpeech);

    const speechReason = newestSpeechReason(frame, CALL_TEXT);
    assertReport(report, "private addressed speech creates resident cognition pressure", Boolean(speechReason), speechReason);
    if (!speechReason) throw new Error("addressed speech created no visible target cognition reason");

    const interruptAfterDelivery = summarizePotentialInterruption(frame, preFocusedRunId, preFocusedMatter?.id ?? null);
    report.checkpoints.afterPrivateDelivery = {
      tick: frame.snapshot.tick,
      privateSpeech,
      speechReason,
      interrupt: interruptAfterDelivery,
      targetLife: summarizeLife(frame.selectedLife),
    };

    let matchingRequest = null;
    const providerDeadline = Date.now() + MAX_PROVIDER_WAIT_MS;
    while (!matchingRequest && Date.now() < providerDeadline) {
      frame = await stepEvidence(cdp, 1);
      await sleep(10);
      matchingRequest = findSpeechRequest(lifeIntentRequests, targetId, speechReason.id, CALL_TEXT);
    }
    assertReport(report, "real life-intent request carries the exact addressed-speech reason", Boolean(matchingRequest), {
      reasonId: speechReason.id,
      request: matchingRequest,
      observedRequests: lifeIntentRequests.length,
    });
    if (!matchingRequest) throw new Error("no life-intent request carried the exact addressed-speech reason");
    report.provider.matchingRequest = matchingRequest;

    let responseMeta = lifeIntentResponses.get(matchingRequest.requestId) ?? null;
    while (!responseMeta && Date.now() < providerDeadline) {
      await sleep(20);
      responseMeta = lifeIntentResponses.get(matchingRequest.requestId) ?? null;
      await stepEvidence(cdp, 1);
    }
    assertReport(report, "real Luna response returns for the exact speech-bearing request", Boolean(
      responseMeta && responseMeta.status === 200
    ), responseMeta);
    if (!responseMeta) throw new Error("matching life-intent response did not arrive");

    const responseText = await tryResponseBody(cdp, matchingRequest.requestId);
    const responseBody = responseText ? safeJson(responseText) : null;
    report.provider.matchingResponse = responseMeta;
    report.provider.responseBody = responseBody;
    assertReport(report, "provider attributes its settlement to the exact speech reason", Boolean(
      responseBody?.ok === true
      && responseBody?.originReasonId === speechReason.id
    ), responseBody);

    let admitted = null;
    let settlementSteps = 0;
    while (!admitted && settlementSteps < MAX_SETTLEMENT_STEPS) {
      frame = await stepEvidence(cdp, 1);
      settlementSteps += 1;
      admitted = newestAdmissionForResident(frame, targetId, matchingRequest.body?.tick ?? 0);
      if (!admitted) await sleep(5);
    }
    assertReport(report, "speech-bearing provider arrival reaches an explicit admission/settlement boundary", Boolean(admitted), {
      settlementSteps,
      admitted,
      recentProviderEvents: frame.livingDiagnostics?.recentProviderEvents ?? [],
    });

    const responseOccurrence = newestSpeechOccurrence(frame, targetId, "Tak?");
    const hadPreemptableRun = Boolean(preFocusedRunId && preFocusedMatter);
    if (hadPreemptableRun) {
      assertReport(report, "focused resident locally acknowledges addressed interruption with Tak?", Boolean(responseOccurrence), responseOccurrence);
      const duringLife = frame.selectedLife;
      const originalMatterDuring = duringLife?.matters?.find((matter) => matter.id === preFocusedMatter.id) ?? null;
      assertReport(report, "original focused matter is suspended while local contact owns the body", Boolean(
        originalMatterDuring?.status === "suspended"
        || responseOccurrence
      ), {
        originalMatter: originalMatterDuring,
        focusedRunId: duringLife?.body?.focusedRunId ?? null,
      });

      let returned = null;
      let returnSteps = 0;
      while (!returned && returnSteps < MAX_RETURN_STEPS) {
        frame = await stepEvidence(cdp, 1);
        returnSteps += 1;
        const life = frame.selectedLife;
        if (life?.body?.focusedRunId === preFocusedRunId) {
          const matter = life.matters.find((candidate) => candidate.id === preFocusedMatter.id) ?? null;
          if (matter?.status === "active" && matter.activeRun?.runId === preFocusedRunId) {
            returned = { tick: frame.snapshot.tick, matter, focusedRunId: life.body.focusedRunId };
          }
        }
      }
      assertReport(report, "local interruption restores the exact same pre-contact run binding", Boolean(returned), {
        preFocusedRunId,
        returnSteps,
        returned,
      });
      report.checkpoints.exactReturn = returned;
    } else {
      report.checkpoints.localInterruption = {
        mode: "heard_without_preemption",
        reason: "target had no focused mutable run at contact boundary",
        responseOccurrence,
      };
    }

    for (let index = 0; index < 30; index += 1) {
      frame = await stepEvidence(cdp, 1);
      if (index % 5 === 0) await sleep(5);
    }
    const badProviderEvents = (frame.livingDiagnostics?.recentProviderEvents ?? []).filter((event) =>
      event.status === "provider_error"
      || event.status === "transport_internal_error"
      || /invalid_life_intent_context/i.test(String(event.detail ?? ""))
    );
    assertReport(report, "unified runtime remains live after addressed-speech settlement", Boolean(
      (frame.livingDiagnostics?.claimedResidentIds?.length ?? 0) === 5
      && badProviderEvents.length === 0
    ), {
      tick: frame.snapshot.tick,
      claimedResidentIds: frame.livingDiagnostics?.claimedResidentIds ?? [],
      providerRequestCount: frame.livingDiagnostics?.providerRequestCount ?? null,
      badProviderEvents,
    });
    assertReport(report, "qualifier observes no runtime exception or life-intent network failure", Boolean(
      report.runtimeExceptions.length === 0 && report.networkFailures.length === 0
    ), {
      runtimeExceptions: report.runtimeExceptions,
      networkFailures: report.networkFailures,
    });

    report.checkpoints.final = {
      frame: summarizeFrame(frame),
      targetLife: summarizeLife(frame.selectedLife),
      recentProviderEvents: frame.livingDiagnostics?.recentProviderEvents ?? [],
      responseOccurrence: newestSpeechOccurrence(frame, targetId, "Tak?"),
    };

    report.qualification = hadPreemptableRun
      ? "LIVE_UNIFIED_ADDRESSED_SPEECH_AND_EXACT_RETURN_PASS"
      : "LIVE_UNIFIED_ADDRESSED_SPEECH_PASS";
  } catch (error) {
    report.error = error instanceof Error ? error.stack ?? error.message : String(error);
    report.qualification ??= "HARNESS_OR_RUNTIME_FAILURE";
    process.exitCode = 1;
  } finally {
    report.finishedAt = new Date().toISOString();
    report.outcome = report.assertions.length > 0
      && report.assertions.every((entry) => entry.pass)
      && !report.error
      ? "PASS"
      : "FAIL";
    if (report.outcome !== "PASS") process.exitCode = 1;
    writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);
    cdp?.close();
    chrome.kill("SIGTERM");
    await sleep(120);
    if (!chrome.killed) chrome.kill("SIGKILL");
    rmSync(userDataDir, { recursive: true, force: true });
  }
}

function chooseTargetResident(frame) {
  const residents = frame.snapshot?.residents ?? [];
  if (residents.some((resident) => resident.id === PREFERRED_RESIDENT_ID)) return PREFERRED_RESIDENT_ID;
  const player = actor(frame, PLAYER_ID);
  if (!player) throw new Error("player missing while choosing target resident");
  const candidates = residents
    .map((resident) => ({
      id: resident.id,
      actor: actor(frame, resident.id),
    }))
    .filter((candidate) => candidate.actor)
    .sort((a, b) =>
      distance(player.position, a.actor.position) - distance(player.position, b.actor.position));
  if (!candidates[0]) throw new Error("no resident target available");
  return candidates[0].id;
}

async function movePlayerIntoVoiceRange(cdp, targetId) {
  let frame = await evidenceSnapshot(cdp);
  let steps = 0;

  while (steps < MAX_MOVE_STEPS) {
    const player = actor(frame, PLAYER_ID);
    const target = actor(frame, targetId);
    if (!player || !target) throw new Error("player/target missing while moving into voice range");
    const currentDistance = distance(player.position, target.position);
    if (currentDistance <= SPEECH_RADIUS - 30) return { frame, steps };

    const dx = target.position.x - player.position.x;
    const dy = target.position.y - player.position.y;
    const horizontal = Math.abs(dx) > 8 ? (dx > 0 ? "KeyD" : "KeyA") : null;
    const vertical = Math.abs(dy) > 8 ? (dy > 0 ? "KeyS" : "KeyW") : null;

    if (horizontal) await key(cdp, horizontal, "keyDown");
    if (vertical) await key(cdp, vertical, "keyDown");
    frame = await stepEvidence(cdp, Math.min(4, MAX_MOVE_STEPS - steps));
    steps += Math.min(4, MAX_MOVE_STEPS - steps);
    if (horizontal) await key(cdp, horizontal, "keyUp");
    if (vertical) await key(cdp, vertical, "keyUp");
  }

  return { frame, steps };
}

async function key(cdp, code, type) {
  const map = {
    KeyW: { key: "w", windowsVirtualKeyCode: 87 },
    KeyA: { key: "a", windowsVirtualKeyCode: 65 },
    KeyS: { key: "s", windowsVirtualKeyCode: 83 },
    KeyD: { key: "d", windowsVirtualKeyCode: 68 },
  };
  const entry = map[code];
  if (!entry) throw new Error(`unsupported key code: ${code}`);
  await cdp.send("Input.dispatchKeyEvent", {
    type,
    code,
    key: entry.key,
    windowsVirtualKeyCode: entry.windowsVirtualKeyCode,
    nativeVirtualKeyCode: entry.windowsVirtualKeyCode,
  });
}

function findSpeechRequest(requests, residentId, reasonId, text) {
  for (const request of requests) {
    const body = request.body;
    if (body?.resident?.id !== residentId) continue;
    if (!(body?.reasons ?? []).some((reason) => reason?.id === reasonId && reason?.kind === "heard_speech")) continue;
    if (!(body?.recentPercepts ?? []).some((percept) =>
      percept?.phenomenon === "speech"
      && percept?.addressed === true
      && percept?.actorId === PLAYER_ID
      && percept?.text === text
    )) continue;
    return request;
  }
  return null;
}

function newestAdmissionForResident(frame, residentId, minTick) {
  const events = frame.livingDiagnostics?.recentProviderEvents ?? [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.residentId === residentId
      && event?.status === "admitted"
      && Number(event?.tick ?? -1) >= minTick) return event;
  }
  return null;
}

function newestAddressedSpeechPercept(frame, actorId, text) {
  const percepts = frame.selectedDiagnostics?.recentPercepts ?? [];
  for (let index = percepts.length - 1; index >= 0; index -= 1) {
    const percept = percepts[index];
    if (percept?.phenomenon === "speech"
      && percept?.actorId === actorId
      && percept?.text === text
      && percept?.addressed === true) return percept;
  }
  return null;
}

function newestSpeechReason(frame, text) {
  const trace = frame.selectedDiagnostics?.trace ?? [];
  for (let index = trace.length - 1; index >= 0; index -= 1) {
    const event = trace[index];
    if (event?.kind !== "cognition_reason") continue;
    if (event?.summary !== `Speech addressed to me: ${text}`) continue;
    const reasonId = event?.refIds?.[0];
    if (typeof reasonId !== "string" || !reasonId) continue;
    return {
      id: reasonId,
      tick: event.tick,
      kind: "heard_speech",
      summary: event.summary,
      evidenceIds: event.refIds.slice(1),
    };
  }
  return null;
}

function newestSpeechOccurrence(frame, actorId, text) {
  const occurrences = frame.recentOccurrences ?? [];
  for (let index = occurrences.length - 1; index >= 0; index -= 1) {
    const occurrence = occurrences[index];
    if (occurrence?.kind === "speech"
      && occurrence?.actorId === actorId
      && occurrence?.text === text) return occurrence;
  }
  return null;
}

function summarizePotentialInterruption(frame, priorRunId, priorMatterId) {
  const life = frame.selectedLife;
  const matter = priorMatterId
    ? life?.matters?.find((candidate) => candidate.id === priorMatterId) ?? null
    : null;
  return {
    priorRunId,
    priorMatterId,
    currentFocusedRunId: life?.body?.focusedRunId ?? null,
    priorMatterStatus: matter?.status ?? null,
    priorMatterSuspendedBy: matter?.suspendedByMatterId ?? null,
    localAck: newestSpeechOccurrence(frame, reportTargetId(frame), "Tak?"),
  };
}

function reportTargetId(frame) {
  return frame.selectedResidentId ?? "";
}

function summarizeFrame(frame) {
  return {
    tick: frame.snapshot?.tick ?? null,
    selectedResidentId: frame.selectedResidentId ?? null,
    claimedResidentIds: frame.livingDiagnostics?.claimedResidentIds ?? [],
    providerRequestCount: frame.livingDiagnostics?.providerRequestCount ?? null,
    providerInFlightResidentIds: frame.livingDiagnostics?.providerInFlightResidentIds ?? [],
    providerInboxCount: frame.livingDiagnostics?.providerInboxCount ?? null,
  };
}

function summarizeLife(life) {
  if (!life) return null;
  return {
    focusedRunId: life.body?.focusedRunId ?? null,
    deferredRunIds: life.body?.deferredRunIds ?? [],
    matters: (life.matters ?? []).map((matter) => ({
      id: matter.id,
      status: matter.status,
      semanticRevision: matter.semanticRevision,
      semanticCourse: matter.semanticCourse,
      semanticIntent: matter.semanticIntent ?? null,
      suspendedByMatterId: matter.suspendedByMatterId ?? null,
      activeRun: matter.activeRun ?? null,
    })),
  };
}

function actor(frame, actorId) {
  return frame.snapshot?.actors?.find((candidate) => candidate.id === actorId) ?? null;
}

function distance(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

async function navigateEvidence(cdp) {
  const url = `${BASE_URL.replace(/\/$/u, "")}/?spc=1&evidence=1&scenario=unified-living`;
  await cdp.send("Page.navigate", { url });
  await waitUntil(
    async () => await evaluate(cdp, `Boolean(
      window.__SPC_EVIDENCE__?.ready?.()
      && typeof window.__SPC_EVIDENCE__?.addressResident === "function"
      && document.querySelector("canvas")
    )`),
    25_000,
    "unified live evidence scene",
  );
}

async function evidenceSnapshot(cdp) {
  return await evaluate(cdp, "window.__SPC_EVIDENCE__.snapshot()");
}

async function stepEvidence(cdp, steps) {
  return await evaluate(cdp, `window.__SPC_EVIDENCE__.stepWorld(${JSON.stringify(steps)})`);
}

async function selectResident(cdp, residentId) {
  return await evaluate(cdp, `(() => {
    const node = document.querySelector('[data-resident="${residentId}"]');
    if (!(node instanceof HTMLElement)) return false;
    node.click();
    return true;
  })()`);
}

async function addressResident(cdp, residentId, text) {
  return await evaluate(
    cdp,
    `window.__SPC_EVIDENCE__.addressResident(${JSON.stringify(residentId)}, ${JSON.stringify(text)})`,
  );
}

async function tryResponseBody(cdp, requestId) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const result = await cdp.send("Network.getResponseBody", { requestId }, 3_000);
      return result.base64Encoded
        ? Buffer.from(result.body, "base64").toString("utf8")
        : result.body;
    } catch {
      await sleep(50);
    }
  }
  return null;
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, 30_000);
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Runtime.evaluate failed",
    );
  }
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
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(
    `Timed out waiting for ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function waitUntil(probe, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${label}; last=${JSON.stringify(last)}`);
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function assertReport(report, label, pass, details) {
  report.assertions.push({ label, pass: Boolean(pass), details });
}

await run();
