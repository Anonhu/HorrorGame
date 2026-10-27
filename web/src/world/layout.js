import { mulberry32, TAU, lerp } from '../core/rng.js';

/* ============================================================
   The plan of the forest.
   Everything is seeded once so the world is stable, but the
   player never sees the same approach twice thanks to fog.
   ============================================================ */

export const WORLD = {
  radius: 116,          // playable radius
  treeWall: 104,        // dense wall of trunks beyond this
  spawnClear: 14,
  fogDensity: 0.0215,
};

const SHRINE_DEFS = [
  { name: 'КОСТЯНОЙ КРУГ', angle: 34, dist: 60 },
  { name: 'ТИХАЯ ЯМА', angle: 126, dist: 68 },
  { name: 'СТАРЫЙ КАМП', angle: 208, dist: 62 },
  { name: 'СУХОЙ РУЧЕЙ', angle: 296, dist: 72 },
];

export function buildPlan(seed = 2603) {
  const rng = mulberry32(seed);
  const shrines = SHRINE_DEFS.map((d, i) => {
    const a = (d.angle * Math.PI) / 180 + (rng() - 0.5) * 0.06;
    const r = d.dist + (rng() - 0.5) * 6;
    return {
      id: i,
      name: d.name,
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      angle: a,
      radius: 9 + rng() * 2,
    };
  });

  // abandoned camps (Wilderness Bound 26.3) — landmarks between shrines
  const camps = [];
  for (let i = 0; i < 3; i++) {
    const a = shrines[i].angle + 0.62 + rng() * 0.25;
    const r = shrines[i].dist * (0.72 + rng() * 0.12);
    camps.push({
      x: Math.cos(a) * r,
      z: Math.sin(a) * r,
      rot: rng() * TAU,
      radius: 8.5,
      kind: ['tent', 'wagon', 'beds'][i],
    });
  }

  // the crimson leaf trail: spawn → 4 shrines → spawn
  const loop = [{ x: 0, z: 0 }, ...shrines.map((s) => ({ x: s.x, z: s.z })), { x: 0, z: 0 }];
  const path = [];
  for (let i = 0; i < loop.length - 1; i++) {
    const a = loop[i], b = loop[i + 1];
    const segLen = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(segLen / 2.2);
    // gentle meander so it doesn't look like a ruler line
    const nx = -(b.z - a.z) / segLen, nz = (b.x - a.x) / segLen;
    const bend = (rng() - 0.5) * 6;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const wobble = Math.sin(t * Math.PI) * bend * (0.6 + 0.4 * Math.sin(t * 9 + i));
      path.push({
        x: lerp(a.x, b.x, t) + nx * wobble,
        z: lerp(a.z, b.z, t) + nz * wobble,
        seg: i,
        t,
      });
    }
  }

  // way lanterns along the trail
  const waylanterns = [];
  for (let i = 0; i < path.length; i += 7) {
    const p = path[i];
    const nx = Math.cos((p.seg * 1.7) + i) * 2.4;
    const nz = Math.sin((p.seg * 1.7) + i) * 2.4;
    waylanterns.push({ x: p.x + nx, z: p.z + nz, lit: false });
  }

  const distToPath = (x, z) => {
    let best = 1e9;
    for (let i = 0; i < path.length; i += 2) {
      const d = (path[i].x - x) ** 2 + (path[i].z - z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };

  const distToShrine = (x, z) => {
    let best = 1e9;
    for (const s of shrines) best = Math.min(best, Math.hypot(s.x - x, s.z - z));
    return best;
  };

  // can a tree / prop stand here?
  function isFree(x, z, pad = 1.4, forTree = true) {
    const r = Math.hypot(x, z);
    if (r > WORLD.treeWall) return false;
    if (r < WORLD.spawnClear + pad) return false;
    for (const s of shrines) if (Math.hypot(s.x - x, s.z - z) < s.radius + pad) return false;
    for (const c of camps) if (Math.hypot(c.x - x, c.z - z) < c.radius + pad) return false;
    if (forTree && distToPath(x, z) < 2.4 + pad) return false;
    return true;
  }

  return { seed, shrines, camps, path, waylanterns, isFree, distToPath, distToShrine };
}

/* simple spatial hash used for collisions and AI line of sight */
export class CircleGrid {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); }
  key(ix, iz) { return `${ix},${iz}`; }
  add(o) {
    const ix = Math.floor(o.x / this.cell), iz = Math.floor(o.z / this.cell);
    const k = this.key(ix, iz);
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(o);
  }
  near(x, z, radius) {
    const out = [];
    const c = this.cell;
    const ix0 = Math.floor((x - radius) / c), ix1 = Math.floor((x + radius) / c);
    const iz0 = Math.floor((z - radius) / c), iz1 = Math.floor((z + radius) / c);
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const arr = this.map.get(this.key(ix, iz));
        if (arr) out.push(...arr);
      }
    }
    return out;
  }
  /** push a circle out of static colliders */
  resolve(pos, radius) {
    const cand = this.near(pos.x, pos.z, radius + 1.2);
    for (const c of cand) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const min = c.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
      }
    }
    return pos;
  }
  /** true if the segment from a→b is blocked by a solid trunk/prop */
  blocked(ax, az, bx, bz) {
    const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      for (const c of this.near(x, z, 1)) {
        if (Math.hypot(c.x - x, c.z - z) < c.r * 0.9) return true;
      }
    }
    return false;
  }
}
