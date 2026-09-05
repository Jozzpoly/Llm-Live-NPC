import type { WorldDebugState } from "./world-scene";

export interface DebugWorkspaceActions {
  toggleLabels(): void;
  toggleLosProbe(): void;
  togglePointerProbe(): void;
}

type ValueNode = HTMLElement;

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

function metricRow(label: string): { row: HTMLDivElement; value: ValueNode } {
  const row = element("div", "debug-metric-row");
  const key = element("span", "debug-metric-key", label);
  const value = element("span", "debug-metric-value", "—");
  row.append(key, value);
  return { row, value };
}

export class DebugWorkspace {
  private readonly root: HTMLElement;
  private readonly appRoot: HTMLElement;
  private readonly actions: DebugWorkspaceActions;
  private readonly collapseButton: HTMLButtonElement;
  private readonly labelsButton: HTMLButtonElement;
  private readonly losButton: HTMLButtonElement;
  private readonly pointerButton: HTMLButtonElement;
  private readonly zoomValue: ValueNode;
  private readonly labelsValue: ValueNode;
  private readonly overlayValue: ValueNode;
  private readonly pointerScreenValue: ValueNode;
  private readonly pointerWorldValue: ValueNode;
  private readonly pointerBoundsValue: ValueNode;
  private readonly tickValue: ValueNode;
  private readonly positionValue: ValueNode;
  private readonly locationValue: ValueNode;
  private readonly heldItemValue: ValueNode;
  private readonly losValue: ValueNode;
  private readonly distanceValue: ValueNode;
  private readonly entitiesValue: ValueNode;
  private readonly eventsList: HTMLUListElement;
  private collapsed = false;
  private lastEventSignature = "";

  constructor(root: HTMLElement, appRoot: HTMLElement, actions: DebugWorkspaceActions) {
    this.root = root;
    this.appRoot = appRoot;
    this.actions = actions;

    this.root.replaceChildren();
    this.root.setAttribute("aria-label", "Debug workspace");
    this.root.removeAttribute("aria-live");

    const header = element("div", "workspace-header");
    const titleBlock = element("div", "workspace-title-block");
    titleBlock.append(
      element("div", "workspace-kicker", "Laboratory"),
      element("h2", "workspace-title", "Debug Workspace")
    );

    this.collapseButton = element("button", "workspace-collapse", "‹");
    this.collapseButton.type = "button";
    this.collapseButton.setAttribute("aria-label", "Collapse debug workspace");
    this.collapseButton.setAttribute("aria-expanded", "true");
    this.collapseButton.addEventListener("click", () => this.setCollapsed(!this.collapsed));
    header.append(titleBlock, this.collapseButton);

    const content = element("div", "debug-content");

    const viewSection = this.section("View");
    const controlRow = element("div", "debug-control-row");
    this.labelsButton = this.toggleButton("Labels", "L", () => this.actions.toggleLabels());
    this.losButton = this.toggleButton("LOS probe", "V", () => this.actions.toggleLosProbe());
    this.pointerButton = this.toggleButton("Pointer probe", null, () => this.actions.togglePointerProbe());
    controlRow.append(this.labelsButton, this.losButton, this.pointerButton);
    viewSection.append(controlRow);

    const viewMetrics = element("div", "debug-metrics");
    const zoom = metricRow("camera zoom");
    const overlay = metricRow("LOS overlay");
    const labels = metricRow("labels");
    this.zoomValue = zoom.value;
    this.overlayValue = overlay.value;
    this.labelsValue = labels.value;
    viewMetrics.append(zoom.row, overlay.row, labels.row);
    viewSection.append(viewMetrics);

    const pointerSection = this.section("Pointer target");
    const pointerMetrics = element("div", "debug-metrics");
    const pointerScreen = metricRow("screen");
    const pointerWorld = metricRow("world");
    const pointerBounds = metricRow("world bounds");
    this.pointerScreenValue = pointerScreen.value;
    this.pointerWorldValue = pointerWorld.value;
    this.pointerBoundsValue = pointerBounds.value;
    pointerMetrics.append(pointerScreen.row, pointerWorld.row, pointerBounds.row);
    pointerSection.append(
      pointerMetrics,
      element("p", "debug-note", "Camera-derived probe only — no interaction or placement semantics yet.")
    );

    const playerSection = this.section("Player");
    const playerMetrics = element("div", "debug-metrics");
    const tick = metricRow("tick");
    const position = metricRow("position");
    const location = metricRow("location");
    const heldItem = metricRow("held item");
    this.tickValue = tick.value;
    this.positionValue = position.value;
    this.locationValue = location.value;
    this.heldItemValue = heldItem.value;
    playerMetrics.append(tick.row, position.row, location.row, heldItem.row);
    playerSection.append(playerMetrics);

    const npcSection = this.section("NPC-001 LOS probe");
    const npcMetrics = element("div", "debug-metrics");
    const los = metricRow("line of sight");
    const distance = metricRow("distance");
    const entities = metricRow("entities");
    this.losValue = los.value;
    this.distanceValue = distance.value;
    this.entitiesValue = entities.value;
    npcMetrics.append(los.row, distance.row, entities.row);
    npcSection.append(
      npcMetrics,
      element("p", "debug-note", "Raw geometric LOS only — not the future NPC sight model.")
    );

    const eventsSection = this.section("Recent world events");
    this.eventsList = element("ul", "event-list");
    eventsSection.append(this.eventsList);

    content.append(viewSection, pointerSection, playerSection, npcSection, eventsSection);
    this.root.append(header, content);
    this.renderEvents([]);
  }

  update(state: WorldDebugState): void {
    this.zoomValue.textContent = `${state.cameraZoom.toFixed(2)}×`;
    this.overlayValue.textContent = state.debugOverlayVisible ? "shown" : "hidden";
    this.labelsValue.textContent = state.labelsVisible ? "shown" : "hidden";

    if (state.pointerInsideCanvas && state.pointerTarget) {
      this.pointerScreenValue.textContent = `${state.pointerTarget.screen.x.toFixed(1)}, ${state.pointerTarget.screen.y.toFixed(1)}`;
      this.pointerWorldValue.textContent = `${state.pointerTarget.world.x.toFixed(1)}, ${state.pointerTarget.world.y.toFixed(1)}`;
      this.pointerBoundsValue.textContent = state.pointerTarget.insideWorld ? "inside" : "outside";
      this.pointerBoundsValue.classList.toggle("pass", state.pointerTarget.insideWorld);
      this.pointerBoundsValue.classList.toggle("blocked", !state.pointerTarget.insideWorld);
    } else {
      this.pointerScreenValue.textContent = "outside canvas";
      this.pointerWorldValue.textContent = "—";
      this.pointerBoundsValue.textContent = "inactive";
      this.pointerBoundsValue.classList.remove("pass", "blocked");
    }

    this.tickValue.textContent = String(state.tick);
    this.positionValue.textContent = `${state.playerPosition.x.toFixed(1)}, ${state.playerPosition.y.toFixed(1)}`;
    this.locationValue.textContent = state.location;
    this.heldItemValue.textContent = state.heldItem;

    this.losValue.textContent = state.npcLineOfSight ? "VISIBLE" : "OCCLUDED";
    this.losValue.classList.toggle("pass", state.npcLineOfSight);
    this.losValue.classList.toggle("blocked", !state.npcLineOfSight);
    this.distanceValue.textContent = `${state.npcDistance.toFixed(1)} px`;
    this.entitiesValue.textContent = String(state.entityCount);

    this.setPressed(this.labelsButton, state.labelsVisible);
    this.setPressed(this.losButton, state.debugOverlayVisible);
    this.setPressed(this.pointerButton, state.pointerProbeVisible);
    this.renderEvents(state.events);
  }

  public setCollapsed(collapsed: boolean): void {
    this.collapsed = collapsed;
    this.root.classList.toggle("is-collapsed", collapsed);
    this.appRoot.classList.toggle("debug-collapsed", collapsed);
    this.collapseButton.textContent = collapsed ? "›" : "‹";
    this.collapseButton.setAttribute(
      "aria-label",
      collapsed ? "Expand debug workspace" : "Collapse debug workspace"
    );
    this.collapseButton.setAttribute("aria-expanded", String(!collapsed));
  }

  private section(title: string): HTMLElement {
    const section = element("section", "debug-section");
    section.append(element("h3", "debug-section-title", title));
    return section;
  }

  private toggleButton(label: string, shortcut: string | null, action: () => void): HTMLButtonElement {
    const button = element("button", "debug-toggle");
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    const labelNode = element("span", "debug-toggle-label", label);
    button.append(labelNode);
    if (shortcut) button.append(element("span", "debug-shortcut", shortcut));
    button.addEventListener("click", action);
    return button;
  }

  private setPressed(button: HTMLButtonElement, pressed: boolean): void {
    button.setAttribute("aria-pressed", String(pressed));
    button.classList.toggle("is-active", pressed);
  }

  private renderEvents(events: WorldDebugState["events"]): void {
    const signature = events.map((event) => `${event.seq}:${event.type}`).join("|");
    if (signature === this.lastEventSignature && this.eventsList.childElementCount > 0) return;
    this.lastEventSignature = signature;
    this.eventsList.replaceChildren();

    if (events.length === 0) {
      this.eventsList.append(element("li", "event-empty", "No semantic events yet."));
      return;
    }

    for (const event of events) {
      const item = element("li");
      item.append(
        element("div", "event-message", event.message),
        element("div", "event-meta", `#${event.seq} · tick ${event.tick} · ${event.type}`)
      );
      this.eventsList.append(item);
    }
  }
}
