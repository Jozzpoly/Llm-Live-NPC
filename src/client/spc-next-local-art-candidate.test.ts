import { describe, expect, it } from "vitest";
import { FIVE_RESIDENT_ANCHORS } from "../spc-next/five-resident-region";
import { exportLocalArtCandidate, importLocalArtCandidate } from "./spc-next-local-art-candidate";

const minimalPng = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3);
const source = {
  name: "owner-floor.png",
  type: "image/png",
  size: minimalPng.length,
  async arrayBuffer(): Promise<ArrayBuffer> {
    return new Uint8Array(minimalPng).buffer;
  },
};
describe("private site-art candidate round trip", () => {
  it("exports and imports an exact source with stable anchor, scale, opacity and SHA", async () => {
    const packed = await exportLocalArtCandidate(
      source, "anchor.forest.cache", 520, 0.7, FIVE_RESIDENT_ANCHORS,
    );
    const restored = await importLocalArtCandidate(packed, FIVE_RESIDENT_ANCHORS);
    expect(restored.fileName).toBe("owner-floor.png");
    expect(restored.mime).toBe("image/png");
    expect(restored.bytes).toEqual(minimalPng);
    expect(restored.anchorId).toBe("anchor.forest.cache");
    expect(restored.worldWidth).toBe(520);
    expect(restored.opacity).toBe(0.7);
    expect(JSON.parse(packed).image.sha256).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not accept a modified or injected artifact", async () => {
    const packed = await exportLocalArtCandidate(
      source, "anchor.workshop.bench", 480, 0.8, FIVE_RESIDENT_ANCHORS,
    );
    const broken = JSON.parse(packed);
    // Tamper the cryptographic witness itself: this MUST change the input,
    // unlike a string replace on a Base64 substring that may not exist.
    broken.image.sha256 = "0".repeat(64);
    await expect(importLocalArtCandidate(JSON.stringify(broken), FIVE_RESIDENT_ANCHORS)).rejects.toThrow();
    const unknown = JSON.parse(packed);
    unknown.world = { actorPositions: [{ id: "resident.janek", x: 0 }] };
    await expect(importLocalArtCandidate(JSON.stringify(unknown), FIVE_RESIDENT_ANCHORS)).rejects.toThrow(/format/);
    const unknownPlace = JSON.parse(packed);
    unknownPlace.placement.anchorId = "anchor.fake";
    await expect(importLocalArtCandidate(JSON.stringify(unknownPlace), FIVE_RESIDENT_ANCHORS)).rejects.toThrow(/miejsca/);
  });
});
