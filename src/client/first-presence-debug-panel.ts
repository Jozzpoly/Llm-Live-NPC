import type { FirstPresenceTraceRecord } from "../resident/first-presence-trace";
import type { FirstPresenceBrowserProbeState } from "./first-presence-browser-probe";

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function metricRow(label: string): { row: HTMLDivElement; value: HTMLElement } {
  const row = element("div", "debug-metric-row");
  const key = element("span", "debug-metric-key", label);
  const value = element("span", "debug-metric-value", "—");
  row.append(key, value);
  return { row, value };
}

function controlButton(label: string): HTMLButtonElement {
  const button = element("button", "debug-toggle");
  button.type = "button";
  button.append(element("span", "debug-toggle-label", label));
  return button;
}

function traceLine(record: FirstPresenceTraceRecord): string {
  switch (record.kind) {
    case "experience":
      return `${record.seq} · experience · ${record.summary}`;
    case "semantic_pending":
      return `${record.seq} · semantic pending · a${record.attemptId} · r${record.semanticRevision}${record.reusedExistingHold ? " · reused hold" : ""}`;
    case "semantic_attempt_ended":
      return `${record.seq} · attempt ${record.outcome} · a${record.attemptId} · ${record.reason}`;
    case "semantic_commit":
      return `${record.seq} · semantic · ${record.fromCourse} → ${record.toCourse}`;
    case "task_started":
      return `${record.seq} · task started · run ${record.runId} · ${record.taskId}`;
    case "task_held":
      return `${record.seq} · task held · run ${record.runId}`;
    case "task_resumed":
      return `${record.seq} · task resumed · run ${record.runId}`;
    case "task_superseded":
      return `${record.seq} · task superseded · run ${record.runId}`;
    case "task_outcome":
      return `${record.seq} · outcome · ${record.summary}`;
  }
}

export interface FirstPresenceDebugPanelActions {
  start(): FirstPresenceBrowserProbeState;
  retry(): FirstPresenceBrowserProbeState;
  resume(): FirstPresenceBrowserProbeState;
  replace(): FirstPresenceBrowserProbeState;
}

/** Owner-facing surface for the deliberately bounded First Presence live probe. */
export class FirstPresenceDebugPanel {
  private readonly startButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly resumeButton: HTMLButtonElement;
  private readonly replaceButton: HTMLButtonElement;
  private readonly phaseValue: HTMLElement;
  private readonly matterValue: HTMLElement;
  private readonly semanticValue: HTMLElement;
  private readonly executionValue: HTMLElement;
  private readonly transportValue: HTMLElement;
  private readonly providerValue: HTMLElement;
  private readonly outcomeValue: HTMLElement;
  private readonly errorValue: HTMLElement;
  private readonly traceList: HTMLUListElement;

  constructor(debugRoot: HTMLElement, private readonly actions: FirstPresenceDebugPanelActions) {
    const content = debugRoot.querySelector<HTMLElement>(".debug-content");
    if (!content) {
      throw new Error("First Presence debug panel requires the existing Debug Workspace content root.");
    }

    const section = element("section", "debug-section");
    section.append(element("h3", "debug-section-title", "First Presence · live semantic probe"));

    const controls = element("div", "debug-control-row first-presence-controls");
    this.startButton = controlButton("Start Red → live Blue");
    this.retryButton = controlButton("Retry semantic");
    this.resumeButton = controlButton("Resume Red");
    this.replaceButton = controlButton("Replace → current");
    this.startButton.addEventListener("click", () => this.update(this.actions.start()));
    this.retryButton.addEventListener("click", () => this.update(this.actions.retry()));
    this.resumeButton.addEventListener("click", () => this.update(this.actions.resume()));
    this.replaceButton.addEventListener("click", () => this.update(this.actions.replace()));
    controls.append(this.startButton, this.retryButton, this.resumeButton, this.replaceButton);

    const metrics = element("div", "debug-metrics");
    const phase = metricRow("phase");
    const matter = metricRow("matter");
    const semantic = metricRow("semantic course");
    const execution = metricRow("run / holds");
    const transport = metricRow("semantic transport");
    const provider = metricRow("model / gateway");
    const outcome = metricRow("factual outcome");
    const error = metricRow("last error");
    this.phaseValue = phase.value;
    this.matterValue = matter.value;
    this.semanticValue = semantic.value;
    this.executionValue = execution.value;
    this.transportValue = transport.value;
    this.providerValue = provider.value;
    this.outcomeValue = outcome.value;
    this.errorValue = error.value;
    metrics.append(
      phase.row,
      matter.row,
      semantic.row,
      execution.row,
      transport.row,
      provider.row,
      outcome.row,
      error.row
    );

    const traceTitle = element("h3", "debug-section-title", "Bounded causal trace");
    traceTitle.style.marginTop = "12px";
    this.traceList = element("ul", "event-list");

    section.append(
      controls,
      metrics,
      traceTitle,
      this.traceList,
      element(
        "p",
        "debug-note",
        "Probe only: Red is seeded, one real Red frame runs, then the fixed Blue correction goes through live semantic transport. World/player time continues during inference. Model output cannot resume or replace the held task; those remain explicit Owner buttons. E1 is disabled once this probe starts. Reload the page to reset the specimen."
      )
    );
    content.prepend(section);
  }

  update(state: FirstPresenceBrowserProbeState): void {
    this.startButton.disabled = !state.canStart;
    this.retryButton.disabled = !state.canRetry;
    this.resumeButton.disabled = !state.canResume;
    this.replaceButton.disabled = !state.canReplace;

    this.phaseValue.textContent = state.phase;
    this.phaseValue.classList.toggle(
      "pass",
      state.phase === "decision_ready" || state.phase === "outcome_recorded"
    );
    this.phaseValue.classList.toggle(
      "blocked",
      state.phase === "semantic_retryable" || state.phase === "blocked"
    );

    this.matterValue.textContent = state.matterId
      ? `${state.matterId} · r${state.semanticRevision ?? "—"}`
      : "none";
    this.semanticValue.textContent = state.semanticCourse ?? "—";
    this.executionValue.textContent = `run ${state.activeTaskRunId ?? "—"} · hold ${state.heldRunIds.join(",") || "none"}`;
    this.transportValue.textContent = state.transportStatus
      ? `${state.transportStatus} · attempts ${state.pendingAttemptIds.join(",") || "none"}`
      : "—";

    const provider = [
      state.model,
      state.gatewayLogId ? `log ${state.gatewayLogId}` : null,
      state.latencyMs !== null ? `${state.latencyMs} ms` : null
    ].filter((value): value is string => Boolean(value));
    this.providerValue.textContent = provider.join(" · ") || "—";
    this.outcomeValue.textContent = state.lastOutcomeSummary ?? "none";
    this.errorValue.textContent = state.lastError ?? "none";
    this.errorValue.classList.toggle("blocked", state.lastError !== null);

    this.traceList.replaceChildren();
    const records = state.trace.slice(-10);
    if (records.length === 0) {
      this.traceList.append(element("li", "event-empty", "No First Presence trace yet."));
      return;
    }
    for (const record of records) {
      const item = element("li");
      item.append(element("div", "event-message", traceLine(record)));
      this.traceList.append(item);
    }
  }
}
