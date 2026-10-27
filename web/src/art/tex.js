import * as THREE from 'three';
import { mulberry32, TAU } from '../core/rng.js';

/* ============================================================
   Procedural canvas textures — zero external assets.
   The palette is deliberate: ink, bone, amber, ember, spectre.
   ============================================================ */

const cache = new Map();
function memo(key, make) {
  if (cache.has(key)) return cache.get(key);
  const t = make();
  cache.set(key, t);
  return t;
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function tex(c, { repeat = 1, srgb = true, filter = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (!filter) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; }
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/* ---------------- radial glow (flames, moon, fireflies) ---------------- */
export function glowTexture(inner = '#fff7d6', mid = '#ffb454', outer = 'rgba(255,90,20,0)') {
  return memo(`glow:${inner}:${mid}:${outer}`, () => {
    const s = 128, c = canvas(s), g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, inner);
    grd.addColorStop(0.28, mid);
    grd.addColorStop(0.62, outer);
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    return tex(c);
  });
}

/* ---------------- poplar bark: pale bone trunk, dark scars ---------------- */
export function poplarBark(seed = 7) {
  return memo(`poplar:${seed}`, () => {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(seed);
    // dirty bone base
    const base = g.createLinearGradient(0, 0, s, 0);
    base.addColorStop(0, '#c9c2b2');
    base.addColorStop(0.35, '#e6dfcd');
    base.addColorStop(0.62, '#b9b2a2');
    base.addColorStop(1, '#8f897c');
    g.fillStyle = base; g.fillRect(0, 0, s, s);

    // mottled stains
    for (let i = 0; i < 260; i++) {
      const x = r() * s, y = r() * s, rad = 2 + r() * 16;
      g.globalAlpha = 0.03 + r() * 0.11;
      g.fillStyle = r() > 0.5 ? '#5c5850' : '#f2ecdd';
      g.beginPath(); g.ellipse(x, y, rad * (0.4 + r()), rad * (0.5 + r() * 1.4), r() * TAU, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;

    // horizontal bark scars — the trademark poplar "eyes"
    for (let i = 0; i < 34; i++) {
      const y = r() * s, w = 12 + r() * 46, h = 2 + r() * 5;
      const x = r() * s;
      g.fillStyle = 'rgba(28,26,24,0.72)';
      g.beginPath(); g.ellipse(x, y, w / 2, h / 2, (r() - 0.5) * 0.2, 0, TAU); g.fill();
      // wet highlight under scar
      g.fillStyle = 'rgba(245,240,225,0.18)';
      g.fillRect(x - w / 2, y + h / 2 + 1, w, 1.5);
    }
    // vertical cracks
    for (let i = 0; i < 18; i++) {
      const x = r() * s;
      g.strokeStyle = `rgba(30,28,26,${0.1 + r() * 0.25})`;
      g.lineWidth = 0.6 + r() * 1.4;
      g.beginPath(); g.moveTo(x, 0);
      let yy = 0, xx = x;
      while (yy < s) { yy += 12 + r() * 30; xx += (r() - 0.5) * 7; g.lineTo(xx, yy); }
      g.stroke();
    }
    // grime at the base (v=0 bottom of the wrap when mapped upright)
    const dirt = g.createLinearGradient(0, s, 0, s * 0.6);
    dirt.addColorStop(0, 'rgba(15,20,18,0.85)');
    dirt.addColorStop(1, 'rgba(15,20,18,0)');
    g.fillStyle = dirt; g.fillRect(0, 0, s, s);
    return tex(c, { repeat: 1 });
  });
}

/* ---------------- leaf canopy card (alpha-tested cut-outs) ---------------- */
export function leafCard(seed = 3, hue = 'ember') {
  return memo(`leaf:${seed}:${hue}`, () => {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(seed);
    g.clearRect(0, 0, s, s);

    const palettes = {
      ember: ['#d2452b', '#a32a1d', '#ff7a3d', '#6d1b14', '#e8a04a'],
      gold: ['#e59a34', '#c46f1f', '#ffc860', '#8a4a12', '#f2c46a'],
      blood: ['#8c241a', '#5d130f', '#c4402b', '#3d0b09', '#e0703a'],
      ash: ['#6b6559', '#4a4740', '#8f8878', '#2f2d29', '#a9a08c'],
    };
    const cols = palettes[hue] || palettes.ember;

    // cluster: many small leaves placed in blobs around the centre
    const blobs = 9;
    for (let b = 0; b < blobs; b++) {
      const a = (b / blobs) * TAU + r();
      const dist = s * (0.06 + r() * 0.24);
      const bx = s / 2 + Math.cos(a) * dist;
      const by = s / 2 + Math.sin(a) * dist * 0.9;
      const count = 40 + r() * 70;
      for (let i = 0; i < count; i++) {
        const ang = r() * TAU;
        const rad = Math.pow(r(), 0.62) * s * (0.10 + r() * 0.14);
        const x = bx + Math.cos(ang) * rad;
        const y = by + Math.sin(ang) * rad * 0.92;
        const w = 7 + r() * 15, h = 4 + r() * 9;
        g.save();
        g.translate(x, y);
        g.rotate(r() * TAU);
        g.fillStyle = cols[(r() * cols.length) | 0];
        g.globalAlpha = 0.82 + r() * 0.18;
        // diamond-ish leaf
        g.beginPath();
        g.moveTo(0, -h); g.quadraticCurveTo(w, -h * 0.12, 0, h);
        g.quadraticCurveTo(-w, -h * 0.12, 0, -h);
        g.fill();
        // vein
        if (r() > 0.55) {
          g.strokeStyle = 'rgba(20,14,10,0.25)';
          g.lineWidth = 0.7;
          g.beginPath(); g.moveTo(0, -h * 0.8); g.lineTo(0, h * 0.8); g.stroke();
        }
        g.restore();
      }
    }

    // punch holes so moonlight reads through the canopy
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 34; i++) {
      const x = r() * s, y = r() * s, rad = 2 + r() * 20;
      g.globalAlpha = 0.5 + r() * 0.5;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    t.repeat.set(1, 1);
    return t;
  });
}

/* ---------------- mossy, leaf-strewn ground ---------------- */
export function groundTexture(seed = 11) {
  return memo(`ground:${seed}`, () => {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(seed);
    g.fillStyle = '#101b18'; g.fillRect(0, 0, s, s);
    // moss patches
    for (let i = 0; i < 1400; i++) {
      const x = r() * s, y = r() * s, rad = 2 + r() * 26;
      g.globalAlpha = 0.05 + r() * 0.16;
      g.fillStyle = ['#1d3029', '#24382c', '#0c1513', '#2b4030', '#16241f'][(r() * 5) | 0];
      g.beginPath(); g.ellipse(x, y, rad, rad * (0.5 + r()), r() * TAU, 0, TAU); g.fill();
    }
    // fallen poplar leaves
    for (let i = 0; i < 620; i++) {
      const x = r() * s, y = r() * s;
      const w = 3 + r() * 8, h = 2 + r() * 4;
      g.globalAlpha = 0.35 + r() * 0.5;
      g.fillStyle = ['#7e2a1b', '#a8551f', '#d18431', '#5b1a12', '#c26a24'][(r() * 5) | 0];
      g.save(); g.translate(x, y); g.rotate(r() * TAU);
      g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, TAU); g.fill();
      g.restore();
    }
    // scattered twigs
    g.globalAlpha = 0.5;
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = 'rgba(18,14,10,0.7)';
      g.lineWidth = 0.8 + r() * 1.6;
      const x = r() * s, y = r() * s, a = r() * TAU, l = 6 + r() * 26;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    g.globalAlpha = 1;
    return tex(c, { repeat: 34 });
  });
}

/* ---------------- dark stone for shrines ---------------- */
export function stoneTexture(seed = 5) {
  return memo(`stone:${seed}`, () => {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(seed);
    g.fillStyle = '#2a2e2c'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i++) {
      const x = r() * s, y = r() * s, rad = 1 + r() * 9;
      g.globalAlpha = 0.06 + r() * 0.2;
      g.fillStyle = r() > 0.5 ? '#454a45' : '#161a19';
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    g.globalAlpha = 0.55;
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = 'rgba(10,12,11,0.8)'; g.lineWidth = 0.6 + r() * 1.2;
      g.beginPath();
      let x = r() * s, y = r() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
    return tex(c, { repeat: 1 });
  });
}

/* ---------------- ritual ring decal (bone runes on transparent) ---------------- */
export function runeRingTexture(seed = 21) {
  return memo(`runes:${seed}`, () => {
    const s = 512, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(seed);
    g.clearRect(0, 0, s, s);
    const cx = s / 2, cy = s / 2;
    g.strokeStyle = 'rgba(255,155,61,0.85)';
    g.lineWidth = 2.2;
    g.beginPath(); g.arc(cx, cy, s * 0.42, 0, TAU); g.stroke();
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(255,210,150,0.45)';
    g.beginPath(); g.arc(cx, cy, s * 0.36, 0, TAU); g.stroke();
    g.beginPath(); g.arc(cx, cy, s * 0.47, 0, TAU); g.stroke();
    // glyphs
    const glyphs = 26;
    for (let i = 0; i < glyphs; i++) {
      const a = (i / glyphs) * TAU;
      const rad = s * 0.39;
      const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
      g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2);
      g.strokeStyle = `rgba(255,180,90,${0.5 + r() * 0.5})`;
      g.lineWidth = 1.6;
      const strokes = 2 + ((r() * 3) | 0);
      g.beginPath();
      for (let k = 0; k < strokes; k++) {
        const ax = (r() - 0.5) * 10, ay = (r() - 0.5) * 14;
        g.moveTo(ax, ay); g.lineTo((r() - 0.5) * 12, (r() - 0.5) * 14);
      }
      g.stroke(); g.restore();
    }
    // inner spiral
    g.strokeStyle = 'rgba(255,155,61,0.55)'; g.lineWidth = 1.4;
    g.beginPath();
    for (let t = 0; t < TAU * 3; t += 0.05) {
      const rad = (t / (TAU * 3)) * s * 0.3;
      const x = cx + Math.cos(t) * rad, y = cy + Math.sin(t) * rad;
      t === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/* ---------------- pumpkin face (emissive) ---------------- */
export function pumpkinFaceTexture() {
  return memo('pumpkin', () => {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    // carved triangles + jagged mouth, warm ember interior
    const glow = g.createRadialGradient(s / 2, s / 2, 10, s / 2, s / 2, s * 0.6);
    glow.addColorStop(0, '#ffd98a');
    glow.addColorStop(0.5, '#ff9b3d');
    glow.addColorStop(1, '#7a2a0c');
    g.fillStyle = glow;
    const tri = (x, y, w, h, flip) => {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + w, flip ? y - h : y);
      g.lineTo(x + w / 2, y + h * (flip ? 0.1 : 1));
      g.closePath(); g.fill();
    };
    tri(s * 0.20, s * 0.34, s * 0.18, s * 0.16, true);
    tri(s * 0.62, s * 0.34, s * 0.18, s * 0.16, true);
    // jagged mouth
    g.beginPath();
    g.moveTo(s * 0.26, s * 0.62);
    const teeth = 6;
    for (let i = 0; i <= teeth; i++) {
      const x = s * 0.26 + (s * 0.48 * i) / teeth;
      g.lineTo(x, s * 0.62 + (i % 2 ? s * 0.13 : 0));
    }
    g.lineTo(s * 0.74, s * 0.80);
    g.lineTo(s * 0.26, s * 0.80);
    g.closePath(); g.fill();
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/* ---------------- star / particle sprite ---------------- */
export function dotTexture() {
  return memo('dot', () => {
    const s = 64, c = canvas(s), g = c.getContext('2d');
    const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.35, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
    return tex(c);
  });
}

/* ---------------- soft fog ribbon ---------------- */
export function fogTexture() {
  return memo('fog', () => {
    const s = 256, c = canvas(s), g = c.getContext('2d');
    const r = mulberry32(99);
    g.clearRect(0, 0, s, s);
    for (let i = 0; i < 42; i++) {
      const x = s / 2 + (r() - 0.5) * s * 0.8;
      const y = s / 2 + (r() - 0.5) * s * 0.6;
      const rad = s * (0.08 + r() * 0.22);
      const grd = g.createRadialGradient(x, y, 0, x, y, rad);
      grd.addColorStop(0, `rgba(180,215,210,${0.05 + r() * 0.07})`);
      grd.addColorStop(1, 'rgba(180,215,210,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
    }
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

/* ---------------- autumn leaf decal for trails ---------------- */
export function trailLeafTexture() {
  return memo('trailLeaf', () => {
    const s = 64, c = canvas(s), g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    g.translate(s / 2, s / 2);
    g.fillStyle = '#ffb066';
    g.beginPath();
    g.moveTo(0, -22); g.quadraticCurveTo(20, -4, 0, 22); g.quadraticCurveTo(-20, -4, 0, -22);
    g.fill();
    g.strokeStyle = 'rgba(120,40,10,0.5)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 20); g.stroke();
    const t = tex(c);
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose?.();
  cache.clear();
}
