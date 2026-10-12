import type * as Phaser from "phaser";

/**
 * Readable top-down depictions for ACTUAL World material IDs only.
 *
 * No World object, collider, affordance, inventory contents, perceived fact or
 * position can originate from this renderer. A basket is a basket rather than
 * a generic brown crate; every visual is centered on World-provided coordinates.
 */
export function paintMaterialShape(
  g: Phaser.GameObjects.Graphics, id: string,
  x: number, y: number, radius: number,
): void {
  const r = Math.max(10, radius);
  const kind = id.split(".")[0];

  if (kind === "basket") {
    g.fillStyle(0xb78751, 0.98);
    g.fillEllipse(x, y + r * 0.06, r * 1.75, r * 1.16);
    g.lineStyle(2, 0xe8c090, 0.95);
    g.strokeEllipse(x, y - r * 0.12, r * 1.8, r * 0.7);
    g.strokeEllipse(x, y - r * 0.56, r * 1.22, r * 1.34);
    g.lineStyle(1, 0x755030, 0.72);
    for(let i=-2;i<=2;i++) {
      g.lineBetween(x+i*4, y-r*0.2, x+i*3, y+r*0.44);
    }
    return;
  }
  if (kind === "parcel") {
    g.fillStyle(0xc8ac75, 0.98);
    g.fillRoundedRect(x-r*0.9,y-r*0.65,r*1.8,r*1.3,3);
    g.lineStyle(2,0x765b39,0.95);
    g.strokeRoundedRect(x-r*0.9,y-r*0.65,r*1.8,r*1.3,3);
    g.lineStyle(2,0xf1d8a9,0.92);
    g.lineBetween(x-r*0.9,y,x+r*0.9,y);
    g.lineBetween(x,y-r*0.65,x,y+r*0.65);
    return;
  }
  if (kind === "bundle" || kind === "timber" || kind === "kindling") {
    const timber = kind === "timber";
    const pieces = kind === "kindling" ? 5 : timber ? 3 : 4;
    const w = kind === "kindling" ? r * 1.3 : r * 1.65;
    const h = kind === "kindling" ? 3 : 6;
    for(let i=0;i<pieces;i++) {
      const py=y+(i-(pieces-1)/2)*(kind==="kindling"?4:6);
      const px=x+(i%2)*3-2;
      g.fillStyle(i%2 ? 0xb18c5c : 0x795739, 0.98);
      g.fillRoundedRect(px-w/2,py-h/2,w,h,2);
      g.lineStyle(1,0xe2c297,0.8);
      g.lineBetween(px-w/2+2,py,px+w/2-2,py);
    }
    g.lineStyle(2,0xe3c58c,0.93);
    g.lineBetween(x-r*0.2,y-r*0.7,x+r*0.15,y+r*0.75);
    return;
  }
  if(kind==="bucket") {
    g.fillStyle(0x768995,0.97);
    g.fillRoundedRect(x-r*0.68,y-r*0.42,r*1.36,r*1.2,4);
    g.lineStyle(2,0xbccbd0,0.96);
    g.strokeEllipse(x,y-r*0.42,r*1.6,r*0.6);
    g.strokeEllipse(x,y-r*0.66,r*1.0,r*1.0);
    g.fillStyle(0x41636b,0.9);
    g.fillEllipse(x,y-r*0.4,r*1.22,r*0.36);
    return;
  }
  if(kind==="satchel") {
    g.fillStyle(0x745448,0.98);
    g.fillRoundedRect(x-r*0.82,y-r*0.45,r*1.64,r*1.25,5);
    g.lineStyle(3,0xc29c72,0.95);
    g.strokeEllipse(x,y-r*0.44,r*1.28,r*1.4);
    g.fillStyle(0xa97d65,0.98);
    g.fillRoundedRect(x-r*0.78,y-r*0.48,r*1.56,r*0.47,3);
    g.fillStyle(0xddc68b,1);
    g.fillCircle(x,y-r*0.1,2.4);
    return;
  }
  if(kind==="fragment") {
    g.fillStyle(0x8c8e94,0.97);
    g.fillTriangle(x-r,y+r*0.45,x+r*0.8,y+r*0.6,x+r*0.2,y-r);
    g.lineStyle(2,0xb6bdc4,0.9);
    g.strokeTriangle(x-r,y+r*0.45,x+r*0.8,y+r*0.6,x+r*0.2,y-r);
    g.lineBetween(x-r*0.25,y+r*0.2,x+r*0.3,y-r*0.25);
    return;
  }
  if(kind==="tablet") {
    g.fillStyle(0x818b92,0.98);
    g.fillRoundedRect(x-r*0.72,y-r*0.9,r*1.44,r*1.8,3);
    g.lineStyle(2,0xbcc3bd,0.88);
    g.strokeRoundedRect(x-r*0.72,y-r*0.9,r*1.44,r*1.8,3);
    g.lineStyle(2,0x3e525d,0.85);
    g.lineBetween(x-r*0.42,y-r*0.4,x+r*0.42,y-r*0.4);
    g.lineBetween(x-r*0.42,y,x+r*0.22,y);
    g.lineBetween(x-r*0.42,y+r*0.4,x+r*0.37,y+r*0.4);
    return;
  }

  // Crate or unknown material: fallback stays legible without inventing a type.
  const half = Math.max(10, radius * 0.9);
  g.fillStyle(0xb78652, 0.96);
  g.fillRect(x-half,y-half*0.72,half*2,half*1.44);
  g.lineStyle(2,0xe4c08c,0.9);
  g.strokeRect(x-half,y-half*0.72,half*2,half*1.44);
  g.lineBetween(x,y-half*0.72,x,y+half*0.72);
}
