import type { Vec2 } from "../world/types";

export type ResidentIntent =
  | { kind: "continue" | "idle" | "wait" | "drop" }
  | { kind: "go" | "follow" | "fetch"; targetId: string };

export interface ResidentReply { reply: string; intent: ResidentIntent }
export interface ConversationLine { id: number; speaker: "player" | "npc" | "world"; text: string }
export interface KnownEntity {
  id: string; label: string; kind: "player" | "npc" | "item";
  position: Vec2; seenAtTick: number; heldBy?: string | null;
}
export interface ResidentModelInput {
  actorId: string;
  actorName: string;
  latestUtterance: string;
  conversation: Array<Pick<ConversationLine, "speaker" | "text">>;
  currentActivity: string;
  heldItemId: string | null;
  knownEntities: KnownEntity[];
  places: Array<{id:string;label:string}>;
}
export interface ResidentViewState {
  actorId: string; name: string; activity: string; pending: boolean;
  error: string | null; conversation: ConversationLine[];
  knownEntities: KnownEntity[]; tick: number; lastOutcome: string | null;
}
export type ResidentProvider = (input: ResidentModelInput, signal?: AbortSignal) => Promise<ResidentReply>;
