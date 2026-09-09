import type { ResidentViewState } from "../living/types";

export interface LivingPanelActions {
  send(text: string): Promise<void>; retry(): Promise<void>;
  stop(): void; typing(active: boolean): void;
}

export class LivingPanel {
  private readonly input: HTMLTextAreaElement;
  private readonly log: HTMLElement;
  private readonly activity: HTMLElement;
  private readonly pending: HTMLElement;
  private readonly error: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly sendButton: HTMLButtonElement;
  private lastConversationKey = "";

  constructor(root: HTMLElement, private readonly actions: LivingPanelActions) {
    root.className = "living-panel";
    root.setAttribute("aria-label", "Rozmowa z Mirą");
    root.innerHTML = `<header class="resident-header"><div class="resident-avatar" aria-hidden="true">M</div><div><p class="eyebrow">Wspólny świat</p><h2>Mira</h2><p class="resident-activity"></p></div><span class="resident-presence" title="Mieszkanka świata" aria-hidden="true"></span></header>
      <div class="conversation" role="log" aria-label="Historia rozmowy" aria-live="polite"></div>
      <div class="resident-pending" role="status"></div>
      <div class="resident-error" role="alert"></div>
      <button type="button" class="resident-retry">Spróbuj ponownie</button>
      <form class="conversation-form"><label for="resident-message">Napisz do Miry</label><div class="compose-row"><textarea id="resident-message" rows="2" maxlength="800" placeholder="O czym myślisz? Możesz też zaproponować wspólne działanie…"></textarea><button type="submit" aria-label="Wyślij wiadomość">Wyślij <span aria-hidden="true">↗</span></button></div><p class="compose-hint">Enter wysyła · Shift+Enter dodaje wiersz</p></form>
      <footer class="resident-footer"><button type="button" class="resident-stop">Zatrzymaj działanie</button><span>Pamięć tej sesji</span></footer>`;
    this.input = root.querySelector("textarea")!;
    this.log = root.querySelector(".conversation")!;
    this.activity = root.querySelector(".resident-activity")!;
    this.pending = root.querySelector(".resident-pending")!;
    this.error = root.querySelector(".resident-error")!;
    this.retryButton = root.querySelector(".resident-retry")!;
    this.sendButton = root.querySelector('[type="submit"]')!;
    this.input.addEventListener("input", () => this.updateSendButton());
    this.input.addEventListener("focus", () => this.actions.typing(true));
    this.input.addEventListener("blur", () => this.actions.typing(false));
    this.input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Escape") this.input.blur();
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault(); root.querySelector("form")!.requestSubmit();
      }
    });
    this.input.addEventListener("keyup", event => event.stopPropagation());
    root.querySelector("form")!.addEventListener("submit", event => {
      event.preventDefault(); const text = this.input.value.trim();
      if (!text) return;
      this.input.value = ""; this.updateSendButton(); void this.actions.send(text);
    });
    this.retryButton.addEventListener("click", () => { void this.actions.retry(); });
    root.querySelector(".resident-stop")!.addEventListener("click", () => this.actions.stop());
    this.updateSendButton();
  }
  private updateSendButton(): void { this.sendButton.disabled = !this.input.value.trim(); }
  update(state: ResidentViewState): void {
    this.activity.textContent = state.activity;
    this.pending.textContent = state.pending ? "Mira zastanawia się… Możesz dopowiedzieć coś jeszcze." : "";
    this.error.textContent = state.error ?? "";
    this.retryButton.hidden = !state.error;
    const key = state.conversation.map(m => `${m.id}:${m.text}`).join("|");
    if (key === this.lastConversationKey) return;
    this.lastConversationKey = key;
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
    const nodes = state.conversation.map(line => {
      const message = document.createElement("div"); message.className = `conversation-message from-${line.speaker}`;
      const name = document.createElement("span"); name.className = "message-speaker";
      name.textContent = line.speaker === "player" ? "Ty" : line.speaker === "npc" ? state.name : "W świecie";
      const text = document.createElement("p"); text.textContent = line.text;
      message.append(name, text); return message;
    });
    this.log.replaceChildren(...nodes);
    if (atBottom || state.conversation.at(-1)?.speaker === "player") this.log.scrollTop = this.log.scrollHeight;
  }
}
