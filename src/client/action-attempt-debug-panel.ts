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

function sourceText(attempt: ActionAttemptRecord): string {
  if (attempt.source === "player") return "player channel";
  const run = attempt.executorRun;
  if (!run) return "executor · provenance missing";
  if (run.cause.kind === "cognition") {
    return `executor #${run.runId} · cognition · ${run.cause.correlationId}`;
  }
  return `executor #${run.runId} · ${run.cause.kind}`;
}

function sourceSignature(attempt: ActionAttemptRecord): string {
  const run = attempt.executorRun;
  if (!run) return attempt.source;
  const correlation = run.cause.kind === "cognition" ? run.cause.correlationId : "";
  return `${attempt.source}:${run.runId}:${run.cause.kind}:${correlation}`;
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
        "Execution-frame truth: every player-channel and executor atomic attempt, including rejected attempts. Executor attempts retain run/cause provenance. This is bounded debug history, not semantic World event history."
      )
    );
    this.list = element("ul", "event-list");
    section.append(this.list);
    root.append(section);
    this.update([]);
  }

  update(attempts: readonly ActionAttemptRecord[]): void {
    const signature = attempts
      .map((attempt) => `${attempt.seq}:${sourceSignature(attempt)}:${attempt.status}:${attempt.code}`)
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
      item.append(
        element(
          "div",
          "event-message",
          `${sourceText(attempt)} · ${attempt.actorId} · ${attempt.action}${attempt.targetId ? ` → ${attempt.targetId}` : ""}`
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
