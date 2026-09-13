import { afterEach, describe, expect, it, vi } from "vitest";
import type { CognitionContext, CognitionProposal } from "./contracts";
import { createHearthCognitionProvider } from "./transport";

const context = (): CognitionContext => ({
  version: 1, resident: { id: "npc.ada", name: "Ada", background: "Lubi doglądać podwórza." }, tick: 10,
  reasons: ["review"], observations: [{ id: "player", label: "Gość", kind: "player", position: { x: 1, y: 1 }, seenAtTick: 9 }],
  experiences: [{ id: "experience.1", tick: 9, kind: "noticed", text: "Widzę gościa." }], beliefs: [],
  concerns: [{ id: "concern.1", description: "Obejrzeć podwórze", reason: "Lubię tu zaglądać.", status: "open", evidenceIds: [] }],
  realization: null, places: [{ id: "place.yard", label: "Podwórze" }]
});
const proposal = (): CognitionProposal => ({ version: 1, speech: null, beliefs: [], concerns: [], plan: null, reviewAfterSeconds: 2 });
const result = () => ({ ok: true, proposal: proposal(), usage: { model: "gpt-5.6-luna", inputTokens: 50, outputTokens: 20, totalTokens: 70, elapsedMs: 12 } });
const controller = () => new AbortController();

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("First Hearth browser cognition transport", () => {
  it("sends only the private context to the new route and returns a validated proposal and usage", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result()));
    const input = context();
    const response = await createHearthCognitionProvider({ fetcher })(input, controller().signal);
    expect(response).toEqual({ proposal: proposal(), usage: result().usage });
    expect(fetcher).toHaveBeenCalledWith("/api/hearth/cognition", expect.objectContaining({
      method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, signal: expect.any(AbortSignal)
    }));
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual(input);
  });

  it("supports an explicit endpoint and normalizes unknown token measurements to null", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ ...result(), usage: { model: "gpt-5.6-luna", elapsedMs: 4, inputTokens: "50", outputTokens: -3 } }));
    const response = await createHearthCognitionProvider({ endpoint: "/custom-cognition", fetcher })(context(), controller().signal);
    expect(fetcher.mock.calls[0][0]).toBe("/custom-cognition");
    expect(response.usage).toEqual({ model: "gpt-5.6-luna", elapsedMs: 4, inputTokens: null, outputTokens: null, totalTokens: null });
  });

  it("rejects private-context extras and malformed nested perception before sending", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json(result()));
    const provider = createHearthCognitionProvider({ fetcher });
    const extra = { ...context(), worldSnapshot: { hidden: true } };
    await expect(provider(extra, controller().signal)).rejects.toThrow("Nieprawidłowy prywatny kontekst");
    const bad = context(); bad.observations[0].seenAtTick = 11;
    await expect(provider(bad, controller().signal)).rejects.toThrow("Nieprawidłowy prywatny kontekst");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("validates output against the captured context despite caller mutation during a request", async () => {
    const input = context();
    let resolve!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(done => { resolve = done; }));
    const pending = createHearthCognitionProvider({ fetcher })(input, controller().signal);
    input.places.push({ id: "place.hidden", label: "Unknown at request time" });
    resolve(Response.json({ ...result(), proposal: { ...proposal(), plan: { concernId: "concern.1", steps: [{ skill: "travel", targetId: "place.hidden" }] } } }));
    await expect(pending).rejects.toThrow("Nie udało się odczytać");
  });

  it("rejects malformed proposals, missing explicit nulls, and invalid usage envelopes", async () => {
    const invalid = [
      { ...result(), ok: false }, { ...result(), debug: "private" }, { ...result(), usage: null },
      { ...result(), usage: { ...result().usage, elapsedMs: -1 } },
      { ...result(), proposal: { ...proposal(), speech: undefined } }, { ...result(), proposal: { ...proposal(), plan: undefined } },
      { ...result(), proposal: { ...proposal(), plan: { concernId: "concern.1", steps: [{ skill: "travel", targetId: "hidden" }] } } },
      { ...result(), proposal: { ...proposal(), beliefs: [{ id: "b", claim: "Wiem.", confidence: "expected", evidenceIds: ["invented"] }] } }
    ];
    for (const item of invalid) {
      const fetcher = vi.fn<typeof fetch>(async () => Response.json(item));
      await expect(createHearthCognitionProvider({ fetcher })(context(), controller().signal)).rejects.toThrow("Nie udało się odczytać");
    }
  });

  it("hides server and network error details with stable public messages", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("private key failure", { status: 502 }))
      .mockRejectedValueOnce(new Error("private upstream account error"));
    const provider = createHearthCognitionProvider({ fetcher });
    for (let i = 0; i < 2; i++) await expect(provider(context(), controller().signal)).rejects.toThrow("Namysł mieszkańca jest chwilowo niedostępny.");
    const limited = createHearthCognitionProvider({ fetcher: vi.fn<typeof fetch>(async () => Response.json({ error: "private" }, { status: 429 })) });
    await expect(limited(context(), controller().signal)).rejects.toThrow("Zbyt wiele prób namysłu");
  });

  it("does not start a pre-cancelled request or reveal its abort reason", async () => {
    const fetcher = vi.fn<typeof fetch>(), cancellation = controller();
    cancellation.abort(new Error("private reason"));
    await expect(createHearthCognitionProvider({ fetcher })(context(), cancellation.signal)).rejects.toMatchObject({ name: "AbortError", message: "Przerwano namysł mieszkańca." });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("settles and aborts fetch when a caller cancels an adapter that ignores cancellation", async () => {
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {})), cancellation = controller();
    const pending = createHearthCognitionProvider({ fetcher })(context(), cancellation.signal);
    cancellation.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("bounds the complete request to forty-five seconds and supports a smaller deadline", async () => {
    vi.useFakeTimers();
    for (const timeoutMs of [undefined, 20]) {
      const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
      const pending = createHearthCognitionProvider({ fetcher, timeoutMs })(context(), controller().signal).catch(error => error);
      await vi.advanceTimersByTimeAsync((timeoutMs ?? 45_000) + 1);
      expect(await pending).toMatchObject({ message: "Namysł mieszkańca trwał zbyt długo." });
      expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true);
    }
    expect(() => createHearthCognitionProvider({ timeoutMs: 45_001 })).toThrow("Nieprawidłowy limit czasu");
  });

  it("cancels a stuck response body within the client deadline", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ cancel })));
    const pending = createHearthCognitionProvider({ fetcher, timeoutMs: 50 })(context(), controller().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(51);
    expect(await pending).toMatchObject({ message: "Namysł mieszkańca trwał zbyt długo." });
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects and cancels oversized or invalid UTF-8 response streams", async () => {
    for (const bytes of [new Uint8Array(262_145), new Uint8Array([0xc3, 0x28])]) {
      const cancel = vi.fn();
      const fetcher = vi.fn<typeof fetch>(async () => new Response(new ReadableStream<Uint8Array>({ start(stream) { stream.enqueue(bytes); }, cancel })));
      await expect(createHearthCognitionProvider({ fetcher })(context(), controller().signal)).rejects.toThrow("Nie udało się odczytać");
      expect(cancel).toHaveBeenCalled();
    }
  });

  it("cancels a late response body after a timed-out adapter eventually resolves", async () => {
    vi.useFakeTimers();
    let resolve!: (response: Response) => void;
    const fetcher = vi.fn<typeof fetch>(() => new Promise<Response>(done => { resolve = done; }));
    const pending = createHearthCognitionProvider({ fetcher, timeoutMs: 20 })(context(), controller().signal).catch(error => error);
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toBeInstanceOf(Error);
    const cancel = vi.fn();
    resolve(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalled();
  });
});
