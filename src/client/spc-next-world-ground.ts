import type * as Phaser from "phaser";
import type { WorldAnchor } from "../spc-next/contracts";
import { createFiveResidentNavigationGraph } from "../spc-next/five-resident-navigation";

/**
 * World-ground visual language for the existing five-SPC sandbox.
 *
 * Draw ONLY flat ground, grass, worn pathways, worn stone, soil, leaf litter
 * and small non-solid marks under actual World anchors. No entity or collider is
 * created, nothing feeds perception/navigation, and no marker implies a working
 * structure. This intentionally avoids the old temptation to paint attractive
 * but physically nonexistent walls, doors or trees.
 *
 * Deterministic anchored rendering; no redraw cost per World tick.
 */
export function paintFiveResidentGround(
  graphics: Phaser.GameObjects.Graphics,
  anchors: readonly WorldAnchor[],
): void {
  // The tracks follow the SAME explicit navigation waypoints that resident
  // movement uses, not invented straight chords between distant site markers.
  // Even here they remain non-solid FLOOR marks, not a second navmesh.
  const navigation = createFiveResidentNavigationGraph();
  const connectedRegions: ReadonlyArray<readonly [string, string]> = [
    ["hearth", "workshop"],
    ["hearth", "fields"],
    ["workshop", "crossroads"],
    ["workshop", "fields"],
    ["crossroads", "old-road"],
    ["crossroads", "forest-edge"],
    ["fields", "forest-edge"],
    ["old-road", "ruins"],
    ["forest-edge", "deep-wilds"],
    ["ruins", "deep-wilds"],
  ];
  for (const [fromRegionId, toRegionId] of connectedRegions) {
    const start = navigation.destinationPoint(fromRegionId);
    const path = navigation.route(
      fromRegionId,
      toRegionId,
      new Set([fromRegionId, toRegionId]),
    );
    if (!start || !path) continue;
    const points = [start, ...path.waypoints];
    const seed = hash(fromRegionId + ":" + toRegionId);
    for (let segment = 1; segment < points.length; segment++) {
      const from = points[segment - 1]!;
      const to = points[segment]!;
      // Narrow quiet worn trails support legibility without swallowing the
      // forest, fields or ruins with unrealistic wide highway crossings.
      graphics.lineStyle(82, 0x4d402d, 0.17);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
      graphics.lineStyle(51, 0xa58a68, 0.115);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
      graphics.lineStyle(22, 0xd2b38b, 0.075);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
      for (let i = 0; i < 20; i++) {
        const t = (i + fraction(seed, segment * 101 + i)) / 20;
        const x = from.x + (to.x - from.x) * t;
        const y = from.y + (to.y - from.y) * t;
        const angle = fraction(seed, segment * 113 + i * 7 + 1) * Math.PI * 2;
        const distance = 28 + fraction(seed, segment * 131 + i * 5 + 2) * 38;
        graphics.fillStyle(0xd1b28a, 0.06 + fraction(seed, i + 91) * 0.09);
        graphics.fillCircle(
          x + Math.cos(angle) * distance,
          y + Math.sin(angle) * distance,
          2 + fraction(seed, i + 129) * 5,
        );
      }
    }
  }

  for (const anchor of anchors) {
    // A visual neighbourhood of an ACTUAL site, not an extra authored object.
    const seed = hash(anchor.id);
    const x = anchor.position.x;
    const y = anchor.position.y;
    const range = anchor.id.includes("forest") ? 590
      : anchor.id.includes("wilds") ? 540
      : anchor.id.includes("fields") ? 470
      : anchor.id.includes("ruins") ? 475 : 325;

    graphics.fillStyle(0x0b1714, 0.14);
    graphics.fillEllipse(x, y, range * 1.7, range * 1.3);

    // Patchy walkable ground rather than fictional raised solids.
    const patches = anchor.id.includes("forest") || anchor.id.includes("wilds") ? 420 : 210;
    for (let i = 0; i < patches; i++) {
      const theta = fraction(seed, i * 5 + 1) * Math.PI * 2;
      const radius = Math.sqrt(fraction(seed, i * 7 + 2)) * range;
      const px = x + Math.cos(theta) * radius;
      const py = y + Math.sin(theta) * radius * 0.77;
      const variation = fraction(seed, i * 11 + 3);
      const size = 4 + variation * (anchor.id.includes("forest") ? 21 : 14);
      const color = anchor.id.includes("ruins") ? (variation > 0.5 ? 0x777b81 : 0x544c46)
        : anchor.id.includes("workshop") ? (variation > 0.45 ? 0x9b8d78 : 0x626056)
        : anchor.id.includes("hearth") ? (variation > 0.45 ? 0x947653 : 0x85765b)
        : anchor.id.includes("fields") ? (variation > 0.5 ? 0x7b6c40 : 0x5f7549)
        : variation > 0.5 ? 0x69895c : 0x46664f;
      graphics.fillStyle(color, 0.13 + fraction(seed, i * 13 + 4) * 0.21);
      graphics.fillEllipse(px, py, size * (1 + variation), size * 0.6);
    }

    if (anchor.id.includes("hearth")) drawHearthGround(graphics, x, y, seed);
    else if (anchor.id.includes("workshop")) drawWorkshopGround(graphics, x, y, seed);
    else if (anchor.id.includes("crossroads")) drawCrossroadsGround(graphics, x, y, seed);
    else if (anchor.id.includes("fields")) drawFieldGround(graphics, x, y, seed);
    else if (anchor.id.includes("forest")) drawForestGround(graphics, x, y, seed);
    else if (anchor.id.includes("ruins")) drawRuinGround(graphics, x, y, seed);
    else if (anchor.id.includes("wilds")) drawWildGround(graphics, x, y);
  }
}

function drawHearthGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  g.fillStyle(0x9b6b4e, 0.24);
  g.fillCircle(x, y, 175);
  g.fillStyle(0xe9b36a, 0.12);
  g.fillCircle(x, y, 88);
  g.lineStyle(10, 0xd6b58b, 0.22);
  g.strokeCircle(x, y, 80);
  for (let i = 0; i < 30; i++) {
    const theta = i / 30 * Math.PI * 2;
    const r = 110 + fraction(seed, i) * 160;
    g.fillStyle(0xd0b794, 0.11 + fraction(seed, i + 31) * 0.16);
    g.fillCircle(x + Math.cos(theta) * r, y + Math.sin(theta) * r, 7 + fraction(seed, i + 53) * 10);
  }
}

function drawWorkshopGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  g.fillStyle(0x8b8070, 0.19);
  g.fillRoundedRect(x - 245, y - 160, 490, 320, 22);
  for (let row = 0; row < 7; row++) for (let col = 0; col < 12; col++) {
    const wobble = fraction(seed, row * 23 + col);
    const dx = x - 235 + col * 39 + (row % 2) * 14;
    const dy = y - 152 + row * 43;
    g.fillStyle(wobble > 0.5 ? 0x9d9887 : 0x514e4d, 0.12 + wobble * 0.2);
    g.fillRect(dx + 2, dy + 2, 33, 32);
  }
  // Pale sawdust flecks are surface texture only, not pickupable supplies.
  for(let i = 0; i < 110; i++) {
    const px = x - 260 + fraction(seed, i * 3) * 520;
    const py = y - 190 + fraction(seed, i * 3 + 1) * 380;
    g.fillStyle(0xdcb67d, 0.13 + fraction(seed, i * 3 + 2) * 0.2);
    g.fillRect(px, py, 2 + (i % 3), 6);
  }
}

function drawCrossroadsGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  g.fillStyle(0xb49b77, 0.14);
  g.fillEllipse(x, y, 480, 365);
  for (let i = 0; i < 72; i++) {
    const angle = fraction(seed, i * 3) * Math.PI * 2;
    const r = Math.sqrt(fraction(seed, i * 5 + 1)) * 240;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r * 0.7;
    g.lineStyle(3, 0xd3c4a7, 0.09 + fraction(seed, i * 7 + 2) * 0.13);
    g.strokeRect(px, py, 13 + (i % 4) * 4, 10 + (i % 3) * 5);
  }
}

function drawFieldGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  g.fillStyle(0x785f35, 0.18);
  g.fillRoundedRect(x - 390, y - 305, 780, 610, 30);
  for(let row=0; row<20; row++) {
    const dy = y - 280 + row * 29;
    g.lineStyle(11, row % 3 === 0 ? 0x997d49 : 0x544f37, 0.22);
    g.lineBetween(x - 360, dy, x + 340, dy - 18);
    for(let col=0; col<28; col++) {
      if (fraction(seed,row * 43 + col)>0.25) {
        const px = x - 335 + col * 25;
        g.fillStyle(0x89aa5f, 0.17 + fraction(seed, row * 41 + col) * 0.23);
        g.fillCircle(px, dy - 4, 3 + (col % 4));
      }
    }
  }
}

function drawForestGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  // Leaf-litter canopy *shadows* and low vegetation: no visible solid trunks.
  for(let i=0; i<280; i++) {
    const theta = fraction(seed,i*13) * 2 * Math.PI;
    const distance = Math.sqrt(fraction(seed,i*17+1)) * 570;
    const px=x+Math.cos(theta)*distance, py=y+Math.sin(theta)*distance*0.8;
    g.fillStyle(i%4===0 ? 0x8b7846 : 0x335a48, 0.12 + fraction(seed,i*17+2)*0.23);
    g.fillEllipse(px,py,18+(i%5)*6,9+(i%4)*4);
    if(i%3===0) {
      g.lineStyle(2,0x9db87c,0.18);
      g.lineBetween(px-7,py+8,px-2,py-3);
      g.lineBetween(px+4,py+7,px+8,py-5);
    }
  }
}

function drawRuinGround(g: Phaser.GameObjects.Graphics, x: number, y: number, seed: number): void {
  g.fillStyle(0x625d60, 0.22);
  g.fillEllipse(x,y,700,500);
  // Fragmented floor slabs, with no implied standing wall/collider.
  for(let row=0;row<9;row++)for(let col=0;col<13;col++) {
    const t = fraction(seed,row*19+col);
    if(t<0.18) continue;
    const px=x-315+col*50+(row%2)*12;
    const py=y-195+row*48;
    g.fillStyle(t>0.5 ? 0x9a9793 : 0x77706d,0.1+t*0.16);
    g.fillRect(px,py,42,39);
    if(t>0.7) {
      g.lineStyle(2,0x24272b,0.2);
      g.lineBetween(px+8,py+4,px+26,py+23);
    }
  }
}

function drawWildGround(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  for(let r=105;r<=470;r+=72) {
    g.lineStyle(7,0x8a9e87,0.09);
    g.strokeEllipse(x,y,r*2,r*1.35);
  }
}

function hash(text: string): number {
  let h=2166136261;
  for(let i=0;i<text.length;i++) {
    h=Math.imul(h^text.charCodeAt(i),16777619);
  }
  return h>>>0;
}
function fraction(seed:number,index:number):number {
  let h=Math.imul(seed^(index+1),0x45d9f3b);
  h=Math.imul(h^(h>>>16),0x45d9f3b);
  return ((h^(h>>>16))>>>0)/4294967296;
}
