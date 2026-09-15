import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.env.EVIDENCE_OUTPUT_DIR ?? "evidence/browser");
const evidence = JSON.parse(readFileSync(resolve(root, "evidence.json"), "utf8"));

const selectedSamples = evidence.timeline.filter((sample) => sample && !sample.samplingError && sample.selectedName);
const byResident = new Map();
const trajectories = new Map();
for (const sample of selectedSamples) {
  const name = sample.selectedName;
  const entry = byResident.get(name) ?? {
    resident: name,
    samples: 0,
    movingSamples: 0,
    stationarySamples: 0,
    legacyIdleWhileMovingSamples: 0,
    maxResolvedSpeed: 0,
    maxCognitionQueue: 0,
    pathLength: 0,
    startPosition: null,
    endPosition: null,
    regions: [],
    previousPosition: null,
  };
  entry.samples += 1;
  const speed = numberFact(sample, "resolved velocity");
  const cognitionQueue = numberFact(sample, "cognition queue");
  const legacyActivity = sample.facts?.["legacy activity"] ?? sample.facts?.activity ?? null;
  const position = parsePosition(sample.facts?.position);
  if (Number.isFinite(speed)) {
    entry.maxResolvedSpeed = Math.max(entry.maxResolvedSpeed, speed);
    if (speed > 1) entry.movingSamples += 1;
    else entry.stationarySamples += 1;
    if (speed > 1 && legacyActivity === "idle") entry.legacyIdleWhileMovingSamples += 1;
  }
  if (Number.isFinite(cognitionQueue)) entry.maxCognitionQueue = Math.max(entry.maxCognitionQueue, cognitionQueue);
  if (position) {
    if (!entry.startPosition) entry.startPosition = position;
    entry.endPosition = position;
    if (entry.previousPosition) entry.pathLength += distance(entry.previousPosition, position);
    entry.previousPosition = position;
    const path = trajectories.get(name) ?? [];
    path.push({ ...position, tick: sample.tick ?? null, region: sample.facts?.region ?? null });
    trajectories.set(name, path);
  }
  const region = sample.facts?.region;
  if (region && entry.regions.at(-1) !== region) entry.regions.push(region);
  byResident.set(name, entry);
}

const residents = [...byResident.values()].map((entry) => {
  const displacement = entry.startPosition && entry.endPosition
    ? distance(entry.startPosition, entry.endPosition)
    : null;
  const { previousPosition: _previousPosition, ...publicEntry } = entry;
  return { ...publicEntry, displacement };
});

const janek = residents.find((entry) => entry.resident === "Janek") ?? null;
const checkpointSummary = evidence.checkpoints.map((checkpoint) => ({
  name: checkpoint.name,
  tick: checkpoint.snapshot?.tick ?? null,
  selectedName: checkpoint.snapshot?.selectedName ?? null,
  worldOnly: checkpoint.worldOnly,
  position: parsePosition(checkpoint.snapshot?.facts?.position),
  body: checkpoint.snapshot?.facts?.body ?? null,
  legacyActivity: checkpoint.snapshot?.facts?.["legacy activity"] ?? checkpoint.snapshot?.facts?.activity ?? null,
  region: checkpoint.snapshot?.facts?.region ?? null,
  resolvedVelocity: numberFact(checkpoint.snapshot, "resolved velocity"),
  cognitionQueue: numberFact(checkpoint.snapshot, "cognition queue"),
  screenshot: checkpoint.screenshot,
  screenshotBytes: checkpoint.bytes,
}));

const findings = [];
if (janek?.legacyIdleWhileMovingSamples > 0) {
  findings.push({
    id: "recovered-execution-vs-legacy-activity",
    severity: "material",
    summary: `Janek moved in ${janek.legacyIdleWhileMovingSamples}/${janek.samples} sampled frames while legacy activity remained idle.`,
  });
}
if (janek && janek.displacement !== null && janek.displacement > 500) {
  findings.push({
    id: "janek-material-route-observed",
    severity: "positive-evidence",
    summary: `Real browser evidence observed Janek move ${janek.displacement.toFixed(1)} world units across ${janek.regions.join(" → ")}.`,
  });
}
const miraSpeech = evidence.checkpoints.some((checkpoint) => checkpoint.snapshot?.selectedName === "Mira"
  && checkpoint.snapshot?.privatePerception?.some((line) => /speech\s*\/\s*hearing/i.test(line)));
if (miraSpeech) {
  findings.push({
    id: "player-call-private-hearing",
    severity: "positive-evidence",
    summary: "The real browser path produced player speech that appeared in Mira's private hearing evidence.",
  });
}

const analysis = {
  schemaVersion: 1,
  sourceSha: evidence.sourceSha,
  browserOutcome: evidence.outcome,
  generatedAt: new Date().toISOString(),
  residents,
  checkpoints: checkpointSummary,
  findings,
  browserHealth: {
    runtimeExceptions: evidence.runtimeExceptions?.length ?? 0,
    logErrors: evidence.logErrors?.length ?? 0,
    networkFailures: evidence.networkFailures?.length ?? 0,
    httpErrors: evidence.httpErrors?.length ?? 0,
  },
};

writeFileSync(resolve(root, "analysis.json"), `${JSON.stringify(analysis, null, 2)}\n`);
writeFileSync(resolve(root, "timeline.csv"), toCsv(selectedSamples));
writeFileSync(resolve(root, "analysis.md"), toMarkdown(analysis));
for (const [resident, points] of trajectories) {
  if (points.length < 2) continue;
  const checkpoints = checkpointSummary.filter((checkpoint) => checkpoint.selectedName === resident && checkpoint.position);
  writeFileSync(resolve(root, `trajectory-${slug(resident)}.svg`), trajectorySvg(resident, points, checkpoints));
}

console.log(JSON.stringify({
  sourceSha: analysis.sourceSha,
  browserOutcome: analysis.browserOutcome,
  janek,
  findings,
  browserHealth: analysis.browserHealth,
}, null, 2));

function numberFact(snapshot, key) {
  const raw = snapshot?.facts?.[key];
  const value = typeof raw === "number" ? raw : Number.parseFloat(raw ?? "NaN");
  return Number.isFinite(value) ? value : Number.NaN;
}

function parsePosition(value) {
  if (typeof value !== "string") return null;
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function toCsv(samples) {
  const header = ["elapsedMs", "tick", "selectedName", "region", "position", "body", "legacyActivity", "motionIntent", "resolvedVelocity", "resolution", "constraint", "cognitionQueue"];
  const rows = samples.map((sample) => [
    sample.elapsedMs,
    sample.tick,
    sample.selectedName,
    sample.facts?.region,
    sample.facts?.position,
    sample.facts?.body,
    sample.facts?.["legacy activity"] ?? sample.facts?.activity,
    sample.facts?.["motion intent"],
    sample.facts?.["resolved velocity"],
    sample.facts?.resolution,
    sample.facts?.constraint,
    sample.facts?.["cognition queue"],
  ]);
  return `${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function toMarkdown(analysis) {
  const residentRows = analysis.residents.map((entry) => `| ${entry.resident} | ${entry.samples} | ${entry.movingSamples} | ${entry.maxResolvedSpeed.toFixed(1)} | ${entry.displacement === null ? "—" : entry.displacement.toFixed(1)} | ${entry.pathLength.toFixed(1)} | ${entry.regions.join(" → ") || "—"} | ${entry.legacyIdleWhileMovingSamples} |`).join("\n");
  const findings = analysis.findings.length
    ? analysis.findings.map((entry) => `- **${entry.severity} · ${entry.id}:** ${entry.summary}`).join("\n")
    : "- No derived findings.";
  const trajectoryLinks = analysis.residents
    .filter((entry) => entry.samples > 1)
    .map((entry) => `- [${entry.resident} trajectory](trajectory-${slug(entry.resident)}.svg)`)
    .join("\n") || "- No trajectory with multiple samples.";
  return `# SPC browser evidence analysis\n\nSource: \`${analysis.sourceSha}\`  \nBrowser outcome: **${analysis.browserOutcome}**\n\n## Resident trajectories\n\n| Resident | Samples | Moving | Max speed | Displacement | Sampled path | Regions | Legacy idle while moving |\n| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |\n${residentRows}\n\n### Visual trajectories\n\n${trajectoryLinks}\n\n## Derived findings\n\n${findings}\n\n## Browser health\n\n- Runtime exceptions: ${analysis.browserHealth.runtimeExceptions}\n- Console/log errors: ${analysis.browserHealth.logErrors}\n- Network failures: ${analysis.browserHealth.networkFailures}\n- HTTP errors: ${analysis.browserHealth.httpErrors}\n`;
}

function trajectorySvg(resident, points, checkpoints) {
  const width = 960;
  const height = 560;
  const margin = 70;
  let minX = Math.min(...points.map((point) => point.x));
  let maxX = Math.max(...points.map((point) => point.x));
  let minY = Math.min(...points.map((point) => point.y));
  let maxY = Math.max(...points.map((point) => point.y));
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  minX -= spanX * 0.08;
  maxX += spanX * 0.08;
  minY -= Math.max(spanY, spanX * 0.2) * 0.12;
  maxY += Math.max(spanY, spanX * 0.2) * 0.12;
  const worldWidth = Math.max(1, maxX - minX);
  const worldHeight = Math.max(1, maxY - minY);
  const scale = Math.min((width - margin * 2) / worldWidth, (height - margin * 2) / worldHeight);
  const px = (x) => margin + (x - minX) * scale;
  const py = (y) => height - margin - (y - minY) * scale;
  const polyline = points.map((point) => `${px(point.x).toFixed(1)},${py(point.y).toFixed(1)}`).join(" ");
  const start = points[0];
  const end = points.at(-1);
  const checkpointMarks = checkpoints.map((checkpoint, index) => {
    const x = px(checkpoint.position.x).toFixed(1);
    const y = py(checkpoint.position.y).toFixed(1);
    return `<g><circle cx="${x}" cy="${y}" r="7" fill="#f4d58d" stroke="#111820" stroke-width="2"/><text x="${Number(x) + 10}" y="${Number(y) - 8}" font-size="12" fill="#cbd5df">${index + 1}. t${checkpoint.tick ?? "?"}</text></g>`;
  }).join("");
  const regions = [...new Set(points.map((point) => point.region).filter(Boolean))].join(" → ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="100%" height="100%" fill="#10161a"/>
  <text x="${margin}" y="34" font-family="system-ui, sans-serif" font-size="22" fill="#edf3f6">${xml(resident)} · sampled browser trajectory</text>
  <text x="${margin}" y="56" font-family="system-ui, sans-serif" font-size="13" fill="#8fa0ab">${xml(regions)} · ${points.length} samples</text>
  <polyline points="${polyline}" fill="none" stroke="#78c6ef" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>
  <circle cx="${px(start.x).toFixed(1)}" cy="${py(start.y).toFixed(1)}" r="9" fill="#7fb38a"/>
  <circle cx="${px(end.x).toFixed(1)}" cy="${py(end.y).toFixed(1)}" r="9" fill="#ef7d6d"/>
  ${checkpointMarks}
  <text x="${margin}" y="${height - 24}" font-family="system-ui, sans-serif" font-size="12" fill="#8fa0ab">World bounds shown are fitted to observed samples, not the full authored world. Green=start · red=end · gold=browser screenshots.</text>
</svg>\n`;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "resident";
}

function xml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
