import type { ActionAttemptRecord } from "../execution/execution-driver";

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

function cognitionCorrelationText(attempt: ActionAttemptRecord): string | null {
  const cause = attempt.executorRun?.cause;
  if (!cause || cause.kind !== "cognition" || cause.sessionId === undefined) return null;
  return `s${cause.sessionId}/c${cause.cycleId}`;
}

function sourceText(attempt: ActionAttemptRecord): string {
  if (attempt.source === "player") return "player channel";
  if (!attempt.executorRun) return "executor · provenance missing";
  const correlation = cognitionCorrelationText(attempt);
  return correlation
    ? `executor #${attempt.executorRun.runId} · cognition ${correlation}`
    : `executor #${attempt.executorRun.runId} · ${attempt.executorRun.cause.kind}`;
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
        "Execution-driver truth: every recent player-channel and executor atomic attempt, including rejected attempts. Executor attempts retain accepted run/cause provenance. Diagnostic only — not semantic World event history."
      )
    );
    this.list = element("ul", "event-list");
    section.append(this.list);
    root.append(section);
    this.update([]);
  }

  update(attempts: readonly ActionAttemptRecord[]): void {
    const signature = attempts
      .map((attempt) => {
        const run = attempt.executorRun;
        return `${attempt.seq}:${attempt.source}:${run?.runId ?? "-"}:${run?.cause.kind ?? "-"}:${cognitionCorrelationText(attempt) ?? "-"}:${attempt.status}:${attempt.code}`;
      })
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
