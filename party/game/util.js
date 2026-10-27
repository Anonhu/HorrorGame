'use strict';
/* ============================================================
   Общие утилиты: математика, коллизии, случайность.
   Сервер авторитетен — клиент только рисует.
   ============================================================ */

const TAU = Math.PI * 2;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const dist2 = (ax, ay, bx, by) => (bx - ax) ** 2 + (by - ay) ** 2;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const norm = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** угол между направлением dir и вектором на цель (0 = смотрит прямо) */
function inCone(dirX, dirY, ax, ay, bx, by, halfAngleRad) {
  const dx = bx - ax, dy = by - ay;
  const l = Math.hypot(dx, dy);
  if (l < 1e-4) return true;
  const dot = (dx / l) * dirX + (dy / l) * dirY;
  return dot > Math.cos(halfAngleRad);
}

/** отрезок против прямоугольника — для стен и дверей */
function segRectHit(ax, ay, bx, by, r) {
  // быстрый тест: ресемплим отрезок
  const steps = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.35));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
  }
  return false;
}

function circleRectResolve(ent, r, radius) {
  const cx = clamp(ent.x, r.x, r.x + r.w);
  const cy = clamp(ent.y, r.y, r.y + r.h);
  const dx = ent.x - cx, dy = ent.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > radius * radius) return false;
  const d = Math.sqrt(d2);
  if (d < 1e-5) {
    // центр внутри — выталкиваем по ближайшей стороне
    const left = ent.x - r.x, right = r.x + r.w - ent.x;
    const top = ent.y - r.y, bottom = r.y + r.h - ent.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) ent.x = r.x - radius;
    else if (m === right) ent.x = r.x + r.w + radius;
    else if (m === top) ent.y = r.y - radius;
    else ent.y = r.y + r.h + radius;
    return true;
  }
  const push = (radius - d) / d;
  ent.x += dx * push;
  ent.y += dy * push;
  return true;
}

/** простая сетка-ускоритель для кругов (деревья, кусты) */
class Grid {
  constructor(cell = 8) { this.cell = cell; this.map = new Map(); }
  key(ix, iy) { return ix + ',' + iy; }
  add(o) {
    const k = this.key(Math.floor(o.x / this.cell), Math.floor(o.y / this.cell));
    if (!this.map.has(k)) this.map.set(k, []);
    this.map.get(k).push(o);
  }
  near(x, y, r) {
    const out = [];
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++) {
      for (let iy = Math.floor((y - r) / c); iy <= Math.floor((y + r) / c); iy++) {
        const arr = this.map.get(this.key(ix, iy));
        if (arr) for (const o of arr) out.push(o);
      }
    }
    return out;
  }
  resolve(ent, radius) {
    for (const o of this.near(ent.x, ent.y, radius + o_r(o))) {
      const dx = ent.x - o.x, dy = ent.y - o.y;
      const min = radius + o.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        ent.x += dx * push;
        ent.y += dy * push;
      }
    }
  }
  blocked(ax, ay, bx, bz) {
    const steps = Math.max(2, Math.ceil(dist(ax, ay, bx, bz) / 3));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = ax + (bx - ax) * t, y = ay + (bz - ay) * t;
      for (const o of this.near(x, y, 2)) {
        if (dist(x, y, o.x, o.y) < o.r * 0.9) return true;
      }
    }
    return false;
  }
}
const o_r = (o) => o.r || 0.5;

module.exports = {
  TAU, clamp, lerp, dist, dist2, rand, randInt, pick, shuffle,
  angleTo, norm, inCone, segRectHit, circleRectResolve, Grid,
};
