import type { WorldAnchor } from "../spc-next/contracts";
import {
  SPC_ART_PREVIEW_MAX_BYTES,
  validateLocalGroundImageSignature,
  validateLocalGroundImageSource,
} from "./spc-next-local-art-contract";

/**
 * Private/local portable art reference, NOT a World-save or official SPC
 * asset-pack schema. Keep the editor payload outside the cognition/runtime.
 * Hash enables exact provenance after a future session, not asset promotion.
 */
export const SPC_LOCAL_ART_CANDIDATE_FORMAT = "spc-local-art-candidate-v1";
export const SPC_LOCAL_ART_CANDIDATE_MAX_JSON = 6_000_000;

export interface LocalArtFileSource {
  name: string;
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface LocalArtCandidateRestored {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
  anchorId: string;
  worldWidth: number;
  opacity: number;
}

function requirePlacement(
  anchors: readonly WorldAnchor[], anchorId: string, width: number, opacity: number,
): void {
  if (!anchors.some(a => a.id === anchorId)) throw new Error("Brak wybranego miejsca w World.");
  if (!Number.isFinite(width) || width < 64 || width > 1600
    || !Number.isFinite(opacity) || opacity < 0.1 || opacity > 1) {
    throw new Error("Nieprawidłowa skala lub krycie grafiki.");
  }
}

function safeName(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128
    && !/[\\/<>\u0000-\u001f]/u.test(value);
}

function hex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function hash(bytes: Uint8Array): Promise<string> {
  // Byte slice provides an exact ArrayBuffer, not a SharedArrayBuffer view.
  const owned = new Uint8Array(bytes.length);
  owned.set(bytes);
  return hex(await crypto.subtle.digest("SHA-256", owned.buffer));
}

function encode(bytes: Uint8Array): string {
  // Small capped images only; no remote blob references or unsafe URL paths.
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

function decode(raw: string): Uint8Array {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(raw)
    || raw.length > Math.ceil(SPC_ART_PREVIEW_MAX_BYTES / 3) * 4 + 4) {
    throw new Error("Zakodowany obraz ma nieprawidłowy format lub rozmiar.");
  }
  let binary: string;
  try { binary = atob(raw); } catch { throw new Error("Uszkodzony zapis obrazu."); }
  if (binary.length < 1 || binary.length > SPC_ART_PREVIEW_MAX_BYTES) {
    throw new Error("Obraz przekracza limit 4 MB.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function keys(value: Record<string, unknown>, names: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...names].sort();
  return actual.length === expected.length && actual.every((x, i) => x === expected[i]);
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function exportLocalArtCandidate(
  source: LocalArtFileSource,
  anchorId: string,
  worldWidth: number,
  opacity: number,
  anchors: readonly WorldAnchor[],
): Promise<string> {
  validateLocalGroundImageSource(source);
  requirePlacement(anchors, anchorId, worldWidth, opacity);
  if (!safeName(source.name)) throw new Error("Nieprawidłowa nazwa grafiki.");
  const bytes = new Uint8Array(await source.arrayBuffer());
  if (bytes.length !== source.size) throw new Error("Zmieniony plik źródłowy.");
  validateLocalGroundImageSignature(source.type, bytes);
  const checksum = await hash(bytes);
  const result = JSON.stringify({
    format: SPC_LOCAL_ART_CANDIDATE_FORMAT,
    version: 1,
    placement: { anchorId, worldWidth, opacity },
    image: { fileName: source.name, mime: source.type, sha256: checksum, base64: encode(bytes) },
  }, null, 2);
  if (result.length > SPC_LOCAL_ART_CANDIDATE_MAX_JSON) {
    throw new Error("Paczka podglądu przekracza limit.");
  }
  return result;
}

export async function importLocalArtCandidate(
  json: string, anchors: readonly WorldAnchor[],
): Promise<LocalArtCandidateRestored> {
  if (json.length > SPC_LOCAL_ART_CANDIDATE_MAX_JSON) {
    throw new Error("Paczka przekracza limit 6 MB.");
  }
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { throw new Error("Nieprawidłowy JSON podglądu."); }
  if (!record(raw) || !keys(raw, ["format", "version", "placement", "image"])
    || raw.format !== SPC_LOCAL_ART_CANDIDATE_FORMAT || raw.version !== 1
    || !record(raw.placement) || !keys(raw.placement, ["anchorId", "worldWidth", "opacity"])
    || !record(raw.image) || !keys(raw.image, ["fileName", "mime", "sha256", "base64"])) {
    throw new Error("Nieznany lub nieprawidłowy format podglądu.");
  }
  const place = raw.placement, image = raw.image;
  if (typeof place.anchorId !== "string"
    || typeof place.worldWidth !== "number" || typeof place.opacity !== "number") {
    throw new Error("Nieprawidłowe współrzędne prezentacji.");
  }
  requirePlacement(anchors, place.anchorId, place.worldWidth, place.opacity);
  if (!safeName(image.fileName) || typeof image.mime !== "string"
    || typeof image.base64 !== "string"
    || typeof image.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(image.sha256)) {
    throw new Error("Nieprawidłowe pochodzenie assetu.");
  }
  const bytes = decode(image.base64);
  validateLocalGroundImageSource({ type: image.mime, size: bytes.length });
  validateLocalGroundImageSignature(image.mime, bytes);
  if (await hash(bytes) !== image.sha256) {
    throw new Error("Suma SHA-256 obrazu jest niezgodna z zapisem.");
  }
  return {
    fileName: image.fileName, mime: image.mime, bytes,
    anchorId: place.anchorId, worldWidth: place.worldWidth, opacity: place.opacity,
  };
}
