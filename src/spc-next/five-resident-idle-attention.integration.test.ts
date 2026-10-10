import { describe, expect, it } from "vitest";
import { createFiveResidentRegionComposition } from "./five-resident-region";
import { FiveResidentCausalLifeRuntime } from "./five-resident-causal-life-runtime";

const JAN = "resident.janek";
const PLAYER = "player.jozz";
const PLAYER_WEST = { x: 1_750, y: 720 };

function scenario(optIn = true, playerStart = PLAYER_WEST) {
  const composition = createFiveResidentRegionComposition({ playerStart });
  const runtime = new FiveResidentCausalLifeRuntime(composition, {
    idlePhysicalAttention: optIn,
  });
  const { world } = composition;
  const janek = composition.runtimes[JAN];
  expect(runtime.ownership(JAN)).toBe("recovered_life");
  return { world, runtime, janek, life: runtime.life(JAN)! };
}

function facedJanek(s: ReturnType<typeof scenario>) {
  return s.world.publicSnapshot().actors.find(a => a.id === JAN)!.facing;
}

describe("R6 opt-in idle contact: body attends, semantic speech remains unresolved; NO provider", () => {
  it("orients to PRIVATE directed hearing with one focused local run and then returns to idle", () => {
    const s = scenario();
    const initial = facedJanek(s);
    expect(initial.x).toBeGreaterThan(0);
    const firstSpeech = s.world.speak(PLAYER, "Janek, słyszysz mnie?", 420, [JAN]);
    const heard = s.runtime.advanceOneWorldTick();
    expect(heard.tick).toBe(1);
    const contact = s.runtime.interruption(JAN)?.current();
    expect(contact).toMatchObject({
      status: "active", originPerceptId: expect.any(String),
      mainMatterId: null, mainRunId: null, responseOccurrenceId: null,
    });
    expect(contact).not.toBeNull();
    expect(s.life.focus.focusedRun()).toBe(contact!.interruptRunId);
    expect(s.life.kernel.matter(contact!.interruptMatterId)).toMatchObject({
      status: "active", activeRunId: contact!.interruptRunId,
    });
    const originalPressure = s.janek.pendingCognitionReasons().filter(
      p => p.kind === "heard_speech" && p.evidenceIds.length > 0,
    );
    expect(originalPressure).toHaveLength(1);
    expect(s.janek.diagnostics().recentPercepts.some(
      p => p.occurrenceId === firstSpeech.id && p.addressed,
    )).toBe(true);

    const oriented = s.runtime.advanceOneWorldTick();
    expect(oriented.interruptions[JAN]).toMatchObject({
      status: "attended_idle", attention: { oriented: true },
    });
    const after = facedJanek(s);
    expect(after.x).toBeLessThan(-0.95);
    expect(Math.abs(after.y)).toBeLessThan(0.05);
    const responseSpeech = s.world.diagnostics().recentOccurrences
      .filter(e => e.kind === "speech" && e.actorId === JAN);
    expect(responseSpeech).toHaveLength(0);

    let settled = false;
    for (let i = 0; i < 32; i += 1) {
      const step = s.runtime.advanceOneWorldTick();
      if (step.interruptions[JAN]?.status === "settled_idle") {
        settled = true;
        break;
      }
    }
    expect(settled).toBe(true);
    expect(s.runtime.interruption(JAN)?.current()).toBeNull();
    expect(s.life.focus.focusedRun()).toBeNull();
    expect(s.life.kernel.matter(contact!.interruptMatterId)).toMatchObject({
      status: "resolved", activeRunId: null,
    });
    expect(s.janek.pendingCognitionReasons().some(
      p => p.kind === "heard_speech" && p.id === originalPressure[0]!.id,
    )).toBe(true);
    expect(s.world.publicSnapshot().residents).toHaveLength(5);
    console.info("SPC_IDLE_BODILY_ATTENTION_ONLY", JSON.stringify({
      localGazeWest: after.x, originalSemanticSpeechStillPending: true,
      respondedWithSpeech: false, authoredMeaning: false, providerCalls: 0,
    }));
  });

  it("preserves the established idle-no-body-response baseline unless opted in", () => {
    const s=scenario(false);
    const before=facedJanek(s);
    s.world.speak(PLAYER,"Janek?",420,[JAN]);
    for(let i=0;i<42;i++) s.runtime.advanceOneWorldTick();
    expect(s.runtime.interruption(JAN)?.current()).toBeNull();
    expect(s.life.currentLifeView().matters).toHaveLength(0);
    expect(s.life.focus.focusedRun()).toBeNull();
    expect(facedJanek(s)).toEqual(before);
    expect(s.janek.pendingCognitionReasons().filter(p=>p.kind==="heard_speech")).toHaveLength(1);
  });

  it("does not respond to non-addressed audible speech or an inaudible address", () => {
    const local=scenario();
    local.world.speak(PLAYER,"Zwykła rozmowa w tle",420,[]);
    for(let i=0;i<4;i++) local.runtime.advanceOneWorldTick();
    expect(local.runtime.interruption(JAN)?.current()).toBeNull();
    expect(local.life.focus.focusedRun()).toBeNull();
    expect(local.janek.pendingCognitionReasons()).toEqual([]);

    const distant=scenario(true,{x:400,y:1400});
    distant.world.speak(PLAYER,"Janek, jesteś tam?",420,[JAN]);
    for(let i=0;i<4;i++) distant.runtime.advanceOneWorldTick();
    expect(distant.runtime.interruption(JAN)?.current()).toBeNull();
    expect(distant.janek.pendingCognitionReasons()).toEqual([]);
  });

  it("bounds repeated player calls without creating NPC-to-NPC speech echoes", () => {
    const s=scenario();
    for(let i=0;i<6;i++) s.world.speak(PLAYER,`Janek! próba ${i}`,420,[JAN]);
    s.runtime.advanceOneWorldTick();
    expect(s.runtime.interruption(JAN)?.current()).not.toBeNull();
    for(let i=0;i<55;i++) s.runtime.advanceOneWorldTick();
    expect(s.runtime.interruption(JAN)?.current()).toBeNull();
    expect(s.life.focus.focusedRun()).toBeNull();
    expect(s.janek.pendingCognitionReasons().filter(p=>p.kind==="heard_speech")).toHaveLength(6);
    expect(s.world.diagnostics().recentOccurrences.filter(o =>
      o.kind==="speech" && o.actorId!==PLAYER,
    )).toHaveLength(0);
    const localAttentionMatters=s.life.currentLifeView().matters.filter(m =>
      m.originEvidence?.kind==="addressed_speech_physical_attention",
    );
    expect(localAttentionMatters.length).toBeLessThanOrEqual(1);
    const after=s.world.publicSnapshot().actors.find(a=>a.id===JAN)!.position;
    expect(after).toEqual({x:1900,y:720});
  });
});
