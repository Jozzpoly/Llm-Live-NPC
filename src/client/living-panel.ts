import type { ResidentViewState } from "../living/types";

export interface LivingPanelActions {
  send(text: string, mode: "quiet" | "normal" | "call"): Promise<void>; retry(): Promise<void>;
  stop(): void; call(): void; typing(active: boolean): void;
  select?(actorId: string): void;
}

export class LivingPanel {
  private readonly input: HTMLTextAreaElement;
  private readonly log: HTMLElement;
  private readonly activity: HTMLElement;
  private readonly pending: HTMLElement;
  private readonly error: HTMLElement;
  private readonly retryButton: HTMLButtonElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly contact: HTMLElement;
  private readonly name: HTMLElement;
  private readonly avatar: HTMLElement;
  private readonly selection: HTMLSelectElement;
  private readonly volume: HTMLSelectElement;
  private readonly callButton: HTMLButtonElement;
  private lastConversationKey = "";

  constructor(root: HTMLElement, private readonly actions: LivingPanelActions) {
    root.className = "living-panel";
    root.setAttribute("aria-label", "Mieszkańcy i wspólna rozmowa");
    root.innerHTML = `<header class="resident-header"><div class="resident-avatar" aria-hidden="true">M</div><div><p class="eyebrow">Wspólny świat</p><h2>Mira</h2><p class="resident-activity"></p></div><span class="resident-presence" title="Mieszkanka świata" aria-hidden="true"></span></header>
      <label class="resident-selection">Mieszkaniec <select aria-label="Wybrany mieszkaniec"></select></label>
      <div class="conversation" role="log" aria-label="Usłyszane rozmowy" aria-live="polite"></div>
      <div class="resident-pending" role="status"></div>
      <div class="resident-error" role="alert"></div>
      <button type="button" class="resident-retry">Spróbuj ponownie</button>
      <form class="conversation-form"><label for="resident-message">Powiedz coś osobom w pobliżu</label><div class="compose-row"><textarea id="resident-message" rows="2" maxlength="800" placeholder="Mira, chodźmy razem…"></textarea><button type="submit" aria-label="Wyślij wiadomość">Powiedz <span aria-hidden="true">↗</span></button></div><label class="speech-volume">Głos <select aria-label="Głośność wypowiedzi"><option value="normal">Zwykły</option><option value="quiet">Cichy</option><option value="call">Wołanie</option></select></label><p class="compose-hint">Użyj imienia, aby zwrócić się do konkretnej osoby.<br>Enter wysyła · Shift+Enter dodaje wiersz</p></form>
      <div class="resident-contact"><span></span><button type="button" class="resident-call">Zawołaj Mirę</button></div>
      <footer class="resident-footer"><button type="button" class="resident-stop">Zatrzymaj działanie</button><span>Pamięć tej sesji</span></footer>`;
    this.input = root.querySelector("textarea")!;
    this.log = root.querySelector(".conversation")!;
    this.activity = root.querySelector(".resident-activity")!;
    this.pending = root.querySelector(".resident-pending")!;
    this.error = root.querySelector(".resident-error")!;
    this.retryButton = root.querySelector(".resident-retry")!;
    this.sendButton = root.querySelector('[type="submit"]')!;
    this.contact = root.querySelector(".resident-contact span")!;
    this.name = root.querySelector("h2")!;
    this.avatar = root.querySelector(".resident-avatar")!;
    this.selection = root.querySelector(".resident-selection select")!;
    this.volume = root.querySelector(".speech-volume select")!;
    this.callButton = root.querySelector(".resident-call")!;
    this.selection.addEventListener("change", () => this.actions.select?.(this.selection.value));
    root.querySelector(".resident-call")!.addEventListener("click", () => this.actions.call());
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
      const mode = this.volume.value === "quiet" ? "quiet" : this.volume.value === "call" ? "call" : "normal";
      this.input.value = ""; this.updateSendButton(); void this.actions.send(text, mode);
    });
    this.retryButton.addEventListener("click", () => { void this.actions.retry(); });
    root.querySelector(".resident-stop")!.addEventListener("click", () => this.actions.stop());
    this.updateSendButton();
  }
  private updateSendButton(): void { this.sendButton.disabled = !this.input.value.trim(); }
  update(state: ResidentViewState & { residents?: Array<{ id: string; name: string }> }): void {
    this.name.textContent = state.name;
    this.avatar.textContent = state.name.slice(0, 1);
    this.callButton.textContent = "Zawołaj: " + state.name;
    const residents = state.residents ?? [{ id: state.actorId, name: state.name }];
    if (JSON.stringify([...this.selection.options].map(o => [o.value, o.text])) !== JSON.stringify(residents.map(r => [r.id, r.name]))) {
      this.selection.replaceChildren(...residents.map(r => new Option(r.name, r.id)));
    }
    this.selection.value = state.actorId;
    this.activity.textContent = state.activity;
    this.contact.textContent = state.contact ?? "";
    this.pending.textContent = state.pending ? state.name + " zastanawia się… Możesz dopowiedzieć coś jeszcze." : "";
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
