import type { ResidentViewState } from "../living/types";

export interface LivingPanelActions {
  send(text: string, mode: "quiet" | "normal" | "call"): Promise<void>;
  retry(): Promise<void>;
  typing(active: boolean): void;
}

/** The play surface contains only the player's speech and received conversation. */
export class LivingPanel {
  private readonly listeners = new AbortController();
  private readonly input: HTMLTextAreaElement;
  private readonly form: HTMLFormElement;
  private readonly log: HTMLElement;
  private readonly history: HTMLElement;
  private readonly historyButton: HTMLButtonElement;
  private readonly composeButton: HTMLButtonElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly error: HTMLElement;
  private readonly volume: HTMLSelectElement;
  private composing = false;
  private lastConversationKey = "";
  private submissionError: string | null = null;

  constructor(private readonly root: HTMLElement, private readonly actions: LivingPanelActions) {
    root.className = "living-panel";
    root.setAttribute("aria-label", "Rozmowa w świecie");
    root.innerHTML = `<div class="speech-dock-bar">
        <button type="button" class="compose-open" aria-expanded="false" aria-controls="hearth-compose">Powiedz coś <kbd>Enter</kbd></button>
        <button type="button" class="conversation-toggle" aria-expanded="false" aria-controls="hearth-heard">Usłyszane <span>0</span></button>
      </div>
      <section id="hearth-heard" class="heard-history" aria-label="Usłyszane rozmowy" hidden>
        <div class="heard-heading"><span>Twoje usłyszane rozmowy</span><button type="button" class="history-close" aria-label="Zamknij usłyszane rozmowy">×</button></div>
        <div class="conversation" role="log" aria-label="Usłyszane rozmowy" aria-live="polite"></div>
      </section>
      <form id="hearth-compose" class="conversation-form" hidden>
        <label for="resident-message">Powiedz coś osobom w pobliżu</label>
        <div class="compose-row"><textarea id="resident-message" rows="2" maxlength="800" placeholder="Użyj imienia, by zwrócić się do kogoś…"></textarea><button type="submit">Powiedz <span aria-hidden="true">↗</span></button></div>
        <div class="compose-options"><label class="speech-volume">Głos <select aria-label="Głośność wypowiedzi"><option value="normal">Zwykły</option><option value="quiet">Cichy</option><option value="call">Wołanie</option></select></label><button type="button" class="compose-close">Wróć do ruchu <kbd>Esc</kbd></button></div>
        <p class="compose-hint">Enter wysyła i oddaje ruch · Shift+Enter dodaje wiersz</p>
      </form>
      <div class="resident-error" role="status"></div><button type="button" class="resident-retry" hidden>Wznów połączenie</button>`;
    this.input = root.querySelector("textarea")!;
    this.form = root.querySelector("form")!;
    this.log = root.querySelector(".conversation")!;
    this.history = root.querySelector(".heard-history")!;
    this.historyButton = root.querySelector(".conversation-toggle")!;
    this.composeButton = root.querySelector(".compose-open")!;
    this.sendButton = root.querySelector('[type="submit"]')!;
    this.retryButton = root.querySelector(".resident-retry")!;
    this.error = root.querySelector(".resident-error")!;
    this.volume = root.querySelector("select")!;
    const options = { signal: this.listeners.signal };

    this.composeButton.addEventListener("click", () => this.openComposer(), options);
    root.querySelector(".compose-close")!.addEventListener("click", () => this.closeComposer(), options);
    this.historyButton.addEventListener("click", () => this.setHistoryOpen(this.history.hidden === true), options);
    root.querySelector(".history-close")!.addEventListener("click", () => this.setHistoryOpen(false), options);
    this.retryButton.addEventListener("click", () => { void this.actions.retry(); }, options);
    this.input.addEventListener("input", () => this.updateSendButton(), options);
    this.input.addEventListener("compositionstart", () => { this.composing = true; }, options);
    this.input.addEventListener("compositionend", () => { this.composing = false; }, options);
    this.form.addEventListener("focusin", () => this.actions.typing(true), options);
    this.form.addEventListener("focusout", event => {
      if (!(event.relatedTarget instanceof Node) || !this.form.contains(event.relatedTarget)) this.actions.typing(false);
    }, options);
    this.input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (this.isComposing(event)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeComposer();
      } else if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!event.repeat) this.form.requestSubmit();
      }
    }, options);
    this.input.addEventListener("keyup", event => event.stopPropagation(), options);
    this.form.addEventListener("submit", event => {
      event.preventDefault();
      if (this.composing) return;
      const words = this.input.value.trim();
      if (!words) return;
      const mode = this.volume.value === "quiet" ? "quiet" : this.volume.value === "call" ? "call" : "normal";
      this.input.value = "";
      this.submissionError = null;
      this.updateSendButton();
      // Release input synchronously, before waiting for any response or next frame.
      this.closeComposer();
      void this.actions.send(words, mode).catch(error => {
        this.submissionError = error instanceof Error ? error.message : "Nie udało się wypowiedzieć wiadomości.";
        this.error.textContent = this.submissionError;
      });
    }, options);
    window.addEventListener("keydown", event => {
      if (event.defaultPrevented || this.isComposing(event) || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      const target = event.target;
      const interactive = target instanceof Element && target.closest("input, textarea, select, button, a, summary, [contenteditable='true'], [role='button']");
      if (event.key === "Enter" && !interactive) {
        event.preventDefault();
        event.stopPropagation();
        this.openComposer();
      } else if (event.key === "Escape" && !this.form.hidden && target !== this.input) {
        event.preventDefault();
        this.closeComposer();
      }
    }, { ...options, capture: true });
    this.updateSendButton();
  }

  private isComposing(event: KeyboardEvent): boolean {
    return this.composing || event.isComposing || event.keyCode === 229;
  }

  openComposer(): void {
    this.form.hidden = false;
    this.root.classList.add("is-composing");
    this.composeButton.setAttribute("aria-expanded", "true");
    this.input.focus({ preventScroll: true });
  }

  closeComposer(): void {
    if (document.activeElement instanceof HTMLElement && this.root.contains(document.activeElement)) document.activeElement.blur();
    this.actions.typing(false);
    this.form.hidden = true;
    this.root.classList.remove("is-composing");
    this.composeButton.setAttribute("aria-expanded", "false");
  }

  private setHistoryOpen(open: boolean): void {
    this.history.hidden = !open;
    this.historyButton.setAttribute("aria-expanded", String(open));
    if (open) this.log.scrollTop = this.log.scrollHeight;
  }

  private updateSendButton(): void { this.sendButton.disabled = !this.input.value.trim(); }

  update(state: ResidentViewState): void {
    this.error.textContent = this.submissionError ?? (state.error ? `Połączenie z mieszkańcem: ${state.error}` : "");
    this.retryButton.hidden = !state.error;
    const key = state.conversation.map(m => `${m.id}:${m.speaker}:${m.text}`).join("|");
    if (key === this.lastConversationKey) return;
    this.lastConversationKey = key;
    this.historyButton.querySelector("span")!.textContent = String(state.conversation.length);
    const atBottom = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 80;
    const nodes = state.conversation.map(line => {
      const message = document.createElement("div");
      message.className = `conversation-message from-${line.speaker}`;
      const speaker = document.createElement("span");
      speaker.className = "message-speaker";
      speaker.textContent = line.speaker === "player" ? "Ty" : line.speaker === "npc" ? state.name : "Usłyszane";
      const words = document.createElement("p");
      words.textContent = line.text;
      message.append(speaker, words);
      return message;
    });
    this.log.replaceChildren(...nodes);
    if (atBottom || state.conversation.at(-1)?.speaker === "player") this.log.scrollTop = this.log.scrollHeight;
  }

  destroy(): void {
    this.closeComposer();
    this.listeners.abort();
    this.root.remove();
  }
}
