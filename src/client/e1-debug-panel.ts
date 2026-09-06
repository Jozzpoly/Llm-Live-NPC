import type { E1HarnessDebugState } from "./e1-agent-harness";

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

export interface E1DebugPanelActions {
  toggle(): E1HarnessDebugState;
}

/** Adds the bounded E1 provenance surface to the existing Debug Workspace. */
export class E1DebugPanel {
  private readonly button: HTMLButtonElement;
  private readonly armedValue: HTMLElement;
  private readonly requestValue: HTMLElement;
  private readonly cycleValue: HTMLElement;
  private readonly triggerValue: HTMLElement;
  private readonly perceptionValue: HTMLElement;
  private readonly fetchableValue: HTMLElement;
  private readonly changesValue: HTMLElement;
  private readonly decisionValue: HTMLElement;
  private readonly validationValue: HTMLElement;
  private readonly providerValue: HTMLElement;
  private readonly experienceValue: HTMLElement;

  constructor(debugRoot: HTMLElement, private readonly actions: E1DebugPanelActions) {
    const content = debugRoot.querySelector<HTMLElement>(".debug-content");
    if (!content) throw new Error("E1 debug panel requires the existing Debug Workspace content root.");

    const section = element("section", "debug-section");
    section.append(element("h3", "debug-section-title", "E1 grounded agent"));

    const controls = element("div", "debug-control-row");
    this.button = element("button", "debug-toggle");
    this.button.type = "button";
    this.button.setAttribute("aria-pressed", "false");
    this.button.append(element("span", "debug-toggle-label", "Arm / disarm E1"));
    this.button.addEventListener("click", () => this.update(this.actions.toggle()));
    controls.append(this.button);

    const metrics = element("div", "debug-metrics");
    const armed = metricRow("armed");
    const request = metricRow("request");
    const cycle = metricRow("session / request / cycle");
    const trigger = metricRow("trigger");
    const perception = metricRow("perceived IDs");
    const fetchable = metricRow("fetchable IDs");
    const changes = metricRow("observed changes");
    const decision = metricRow("decision");
    const validation = metricRow("validation");
    const provider = metricRow("model / gateway");
    const experience = metricRow("last E1 experience");
    this.armedValue = armed.value;
    this.requestValue = request.value;
    this.cycleValue = cycle.value;
    this.triggerValue = trigger.value;
    this.perceptionValue = perception.value;
    this.fetchableValue = fetchable.value;
    this.changesValue = changes.value;
    this.decisionValue = decision.value;
    this.validationValue = validation.value;
    this.providerValue = provider.value;
    this.experienceValue = experience.value;
    metrics.append(
      armed.row,
      request.row,
      cycle.row,
      trigger.row,
      perception.row,
      fetchable.row,
      changes.row,
      decision.row,
      validation.row,
      provider.row,
      experience.row
    );

    section.append(
      controls,
      metrics,
      element(
        "p",
        "debug-note",
        "E1 gate: carry an item into the 220 px local neighborhood while still holding it, arm E1, then drop it. Perception and temporal deltas are World-derived + geometric LOS; this is not a qualified sight or long-term-memory model."
      )
    );
    content.append(section);
  }

  update(state: E1HarnessDebugState): void {
    this.button.setAttribute("aria-pressed", String(state.armed));
    this.button.classList.toggle("is-active", state.armed);
    this.armedValue.textContent = state.armed ? "ARMED" : "disarmed";
    this.armedValue.classList.toggle("pass", state.armed);

    this.requestValue.textContent = state.requestStatus;
    this.requestValue.classList.toggle(
      "blocked",
      state.requestStatus === "decision_rejected" ||
        state.requestStatus === "request_error" ||
        state.requestStatus === "stale_decision" ||
        state.requestStatus === "executor_busy"
    );
    this.requestValue.classList.toggle(
      "pass",
      state.requestStatus === "accepted_fetch" || state.requestStatus === "accepted_wait"
    );

    this.cycleValue.textContent = state.sessionId
      ? `s${state.sessionId} · r${state.requestId ?? "—"} · c${state.cycleId ?? "—"} · ${state.cyclesUsed}/${state.cycleBudget}`
      : `— · ${state.cyclesUsed}/${state.cycleBudget}`;
    this.triggerValue.textContent = state.trigger ?? "—";
    this.perceptionValue.textContent = state.visibleEntityIds.join(", ") || "none";
    this.fetchableValue.textContent = state.fetchableItemIds.join(", ") || "none";
    this.changesValue.textContent = state.observedChanges.join(" | ") || "none";
    this.decisionValue.textContent = state.decisionKind
      ? state.decisionTargetId
        ? `${state.decisionKind}(${state.decisionTargetId})`
        : state.decisionKind
      : "—";
    this.validationValue.textContent = state.decisionValidation ?? "—";

    const providerParts = [
      state.model,
      state.gatewayLogId ? `log ${state.gatewayLogId}` : null,
      state.latencyMs !== null ? `${state.latencyMs} ms` : null
    ].filter((part): part is string => Boolean(part));
    this.providerValue.textContent = providerParts.join(" · ") || "—";

    this.experienceValue.textContent = state.experience
      ? `${state.experience.status} · ${state.experience.code} · ${state.experience.targetId ?? "—"} @ tick ${state.experience.tick}`
      : "none";
  }
}
