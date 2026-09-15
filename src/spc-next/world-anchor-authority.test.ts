import { describe, expect, it } from "vitest";
import type { SpcWorldOptions, WorldAnchor } from "./contracts";
import { createFiveResidentRegionWorld, FIVE_RESIDENT_ANCHORS } from "./five-resident-region";
import { SpcWorldRuntime } from "./spc-world-runtime";

function options(anchors: WorldAnchor[]): SpcWorldOptions {
  return {
    bounds: { minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 },
    regions: [{ id: "plain", label: "Plain", minX: 0, minY: 0, maxX: 1_000, maxY: 1_000 }],
    anchors,
    chunkSize: 64,
    fixedDeltaSeconds: 1 / 60,
  };
}

const anchor = (): WorldAnchor => ({
  id: "anchor.workbench",
  label: "Workbench",
  kind: "work",
  position: { x: 400, y: 500 },
  radius: 40,
});

describe("SPC authored World anchor authority", () => {
  it("rejects duplicate, poisoned and out-of-bounds authored anchors at construction", () => {
    expect(() => new SpcWorldRuntime(options([anchor(), { ...anchor() }]))).toThrow(/duplicate world anchor/);
    expect(() => new SpcWorldRuntime(options([{ ...anchor(), position: { x: Number.NaN, y: 10 } }]))).toThrow(/finite/);
    expect(() => new SpcWorldRuntime(options([{ ...anchor(), radius: 0 }]))).toThrow(/positive/);
    expect(() => new SpcWorldRuntime(options([{ ...anchor(), position: { x: 990, y: 500 }, radius: 40 }]))).toThrow(/outside world bounds/);
  });

  it("snapshots all authored options and exposes only defensive compatibility reads", () => {
    const source = anchor();
    const authored = [source];
    const worldOptions = options(authored);
    const world = new SpcWorldRuntime(worldOptions);

    source.position.x = 700;
    authored.push({ ...anchor(), id: "anchor.late", position: { x: 700, y: 500 } });
    worldOptions.bounds.maxX = 800;
    worldOptions.regions[0]!.label = "Mutated Plain";

    expect(world.anchor("anchor.workbench")?.position).toEqual({ x: 400, y: 500 });
    expect(world.anchor("anchor.late")).toBeNull();
    expect(world.regionAt({ x: 900, y: 500 })?.label).toBe("Plain");

    const exposedAnchors = world.anchors();
    exposedAnchors[0]!.position.x = 999;
    expect(world.anchor("anchor.workbench")?.position.x).toBe(400);

    const exposedOptions = world.options;
    exposedOptions.bounds.maxX = 200;
    exposedOptions.regions[0]!.label = "Tampered read";
    exposedOptions.anchors?.[0] && (exposedOptions.anchors[0].position.x = 999);
    expect(world.options.bounds.maxX).toBe(1_000);
    expect(world.regions()[0]?.label).toBe("Plain");
    expect(world.anchor("anchor.workbench")?.position.x).toBe(400);
  });

  it("keeps canonical anchor order and derives region membership from the World instead of duplicating region ids", () => {
    const world = createFiveResidentRegionWorld();
    expect(world.anchors().map((candidate) => candidate.id)).toEqual(
      [...FIVE_RESIDENT_ANCHORS].map((candidate) => candidate.id).sort((a, b) => a.localeCompare(b)),
    );
    for (const authored of world.anchors()) {
      expect(world.regionAt(authored.position)).not.toBeNull();
    }
  });

  it("does not inject authored anchors into a resident private mind merely because they exist", () => {
    const world = createFiveResidentRegionWorld();
    world.step();
    const privateState = JSON.stringify(world.residentDiagnostics("resident.mira"));
    expect(privateState).not.toContain("anchor.workshop.bench");
    expect(privateState).not.toContain("anchor.ruins.threshold");
  });
});
