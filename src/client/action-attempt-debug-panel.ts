import type { ActionAttemptRecord } from "../execution/action-attempt-history";

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

export class ActionAttemptDebugPanel {
  private readonly list: HTMLUListElement;
  private lastSignature = "";

  constructor(root: HTMLElement) {
    const section = element("section", "debug-section");
    section.append(
      element("h3", "debug-section-title", "Recent action attempts"),
      element(
        "p",
        "debug-note",
        "Execution-frame truth: every player-channel and executor atomic attempt, including rejected attempts. This is bounded debug history, not semantic World event history."
      )
    );
    this.list = element("ul", "event-list");
    section.append(this.list);
    root.append(section);
    this.update([]);
  }

  update(attempts: readonly ActionAttemptRecord[]): void {
    const signature = attempts
      .map((attempt) => `${attempt.seq}:${attempt.source}:${attempt.status}:${attempt.code}`)
      .join("|");
    if (signature === this.lastSignature && this.list.childElementCount > 0) return;
    this.lastSignature = signature;
    this.list.replaceChildren();

    if (attempts.length === 0) {
      this.list.append(element("li", "event-empty", "No atomic action attempts yet."));
      return;
    }

    for (const attempt of [...attempts].reverse()) {
      const item = element("li");
      const source = attempt.source === "player" ? "player channel" : "executor";
      item.append(
        element(
          "div",
          "event-message",
          `${source} · ${attempt.actorId} · ${attempt.action}${attempt.targetId ? ` → ${attempt.targetId}` : ""}`
        ),
        element(
          "div",
          "event-meta",
          `#${attempt.seq} · tick ${attempt.tick} · ${attempt.status} · ${attempt.code}`
        )
      );
      this.list.append(item);
    }
  }
}
