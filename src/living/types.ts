import type { ItemEntity, Vec2 } from "../world/types";

export interface ItemDescription {
  itemType: "mug" | "hammer" | "lantern" | "any";
  color?: "red" | "blue";
  /** A place suggested by the speaker, not evidence that an object is there. */
  nearPlaceId?: string;
  /** A restriction requested by the player, unlike the suggested search starting point. */
  withinPlaceId?: string;
}

export type ResidentIntent =
  | { kind: "continue" | "idle" | "wait" | "drop" }
  | { kind: "find_item"; description: ItemDescription; quantity: "one" | "all" }
  | { kind: "go" | "follow" | "fetch" | "search"; targetId: string };

export interface ResidentReply { reply: string; intent: ResidentIntent }
export interface ConversationLine { id: number; speaker: "player" | "npc" | "world"; text: string }
export interface KnownEntity {
  id: string; label: string; kind: "player" | "npc" | "item";
  position: Vec2; seenAtTick: number; heldBy?: string | null;
  visible?: boolean;
  source?: "sight" | "body";
  lastCheckedAbsentAtTick?: number;
  observedMotion?: Vec2;
  appearance?: ItemEntity["appearance"];
}
export interface ResidentExperience {
  id: number; tick: number;
  kind: "noticed" | "lost_sight" | "checked_absent" | "heard_call" | "action" | "search";
  text: string;
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
  experiences?: ResidentExperience[];
  currentCommitment?: string;
}
export interface ResidentViewState {
  actorId: string; name: string; activity: string; pending: boolean;
  error: string | null; conversation: ConversationLine[];
  knownEntities: KnownEntity[]; tick: number; lastOutcome: string | null;
  contact?: string;
  experiences?: ResidentExperience[];
}
export type ResidentProvider = (input: ResidentModelInput, signal?: AbortSignal) => Promise<ResidentReply>;
