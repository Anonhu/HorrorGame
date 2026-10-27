'use strict';
/* ============================================================
   ЭСТАФЕТА СВЕТА — один фонарь на всех.
   Кто держит — видит. За ним идёт Собиратель.
   Финал: разбей фонарь у алтаря — и останься.
   ============================================================ */

const { clamp, dist, rand, pick, shuffle, TAU, angleTo } = require('../util');

const CFG = {
  world: { w: 200, h: 64, startX: 8, chapelX: 182 },
  roundTime: 720,
  walk: 4.3,
  sprint: 6.4,
  carrierWalk: 3.7,
  carrierSprint: 5.2,
  lanternDrain: 0.5,
  lanternDrainSprint: 0.9,
  rechargeTime: 8,
  passRange: 3.2,
  shoutCooldown: 15,
  shoutDecoy: 4.5,
  collectorSpeed: 2.65,
  collectorChaseSpeed: 3.15,
  collectorSafeFire: 6.5,
  smashTime: 7,
  altarTime: 3,
  altarHold: 3.0,
  blindRadius: 3.6,
  allyRadius: 7,
  maxPlayers: 16,
};

const FIRES = [{ x: 52, y: 32 }, { x: 104, y: 40 }, { x: 150, y: 24 }];

class RelayMode {
  constructor(room) {
    this.room = room;
    this.t = 0;
    this.done = false;
    this.winner = null;
    this.phase = 'play';
    this.fires = FIRES.map((f, i) => ({ id: i, x: f.x, y: f.y, lit: true }));
    this.lantern = { heldBy: null, x: 0, y: 0, charge: 100, dead: false, onGround: false, groundAt: 0 };
    this.collector = { x: -6, y: 32, stunned: 0, target: null };
    this.decoys = [];
    this.shouts = new Map();
    this.water = { x0: 160, x1: 172 };
    this.trees = this._makeTrees();
    this.altarDoneBy = null;
    this.altarProg = 0;
    this.smashWarning = false;
  }

  _makeTrees() {
    let seed = (Number(this.room.code) * 2246822519) >>> 0;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const trees = [];
    for (let i = 0; i < 120; i++) {
      const x = 14 + rnd() * (CFG.world.w - 26);
      const y = 4 + rnd() * (CFG.world.h - 8);
      if (FIRES.some((f) => dist(x, y, f.x, f.y) < 7)) continue;
      if (x > 176 && Math.abs(y - 32) < 14) continue;   // площадка часовни
      if (x > this.water.x0 - 2 && x < this.water.x1 + 2) continue;
      if (trees.some((t) => dist(x, y, t.x, t.y) < 3.4)) continue;
      trees.push({ x, y, r: 0.55 + rnd() * 0.35, kind: rnd() < 0.3 ? 'bush' : 'tree' });
    }
    return trees;
  }

  start() {
    const list = [...this.room.players.values()];
    list.forEach((p, i) => {
      p.x = 6 + (i % 4) * 2.2;
      p.y = 26 + Math.floor(i / 4) * 3.2;
      p.dir = 0;
      p.alive = true;
      p.done = false;
      p.role = 'blind';
      p.held = null;
      p.charge = 0;
      p.rescueProg = 0;
      p.altarProg = 0;
      p.shoutAt = -99;
    });
    // фонарь у первого игрока
    const first = list[0];
    if (first) {
      first.role = 'carrier';
      first.held = 'lantern';
      this.lantern.heldBy = first.id;
      this.lantern.charge = 100;
    }
    this._toast('Один фонарь. Кто держит — тот видит.', 'info');
    this._toast('Q — передать ближайшему. Пробел — крик (отвлечь Собирателя).', 'info');
  }

  _alive() { return [...this.room.players.values()].filter((p) => p.alive && !p.done); }
  _toast(text, kind = 'info') { for (const p of this.room.players.values()) p.push('toast', { text, kind }); }
  _lanternPos() {
    if (this.lantern.heldBy) {
      const p = this.room.players.get(this.lantern.heldBy);
      if (p) return { x: p.x, y: p.y, held: true, p };
    }
    return { x: this.lantern.x, y: this.lantern.y, held: false, p: null };
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.altarProg = 0;
    this._updatePlayers(dt);
    this._updateLantern(dt);
    this._updateCollector(dt);
    this._updateDecoys(dt);
    this._checkEnd(dt);
  }

  _updatePlayers(dt) {
    for (const p of this._alive()) {
      if (p.stunnedUntil > this.t) { p.input.mx = 0; p.input.my = 0; continue; }
      const carrier = this.lantern.heldBy === p.id;
      const inWater = p.x > this.water.x0 && p.x < this.water.x1;
      let speed = carrier
        ? (p.input.sprint ? CFG.carrierSprint : CFG.carrierWalk)
        : (p.input.sprint ? CFG.sprint : CFG.walk);
      if (inWater) speed *= 0.62;
      this._move(p, p.input.mx, p.input.my, speed * dt);

      // заряда фонаря
      if (carrier) {
        const drain = (p.input.sprint ? CFG.lanternDrainSprint : CFG.lanternDrain) * dt;
        this.lantern.charge = clamp(this.lantern.charge - drain, 0, 100);
        if (this.lantern.charge <= 0) {
          this.lantern.dead = true;
          this._toast('Фонарь погас. Нужен огонь.', 'warn');
        }
        // зарядка у костра
        const fire = this.fires.find((f) => dist(p.x, p.y, f.x, f.y) < 4);
        if (fire && p.input.act && this.lantern.charge < 100) {
          p.charge = (p.charge || 0) + dt;
          if (p.charge >= CFG.rechargeTime) {
            p.charge = 0;
            this.lantern.charge = 100;
            this.lantern.dead = false;
            this._toast('Фонарь заряжен.', 'good');
          }
        } else {
          p.charge = Math.max(0, (p.charge || 0) - dt * 2);
        }
        // алтарь
        if (p.x >= CFG.world.chapelX) {
          if (p.input.act) {
            p.altarProg = (p.altarProg || 0) + dt;
            this.altarProg = this.altarProg = clamp(p.altarProg / CFG.altarTime, 0, 1);
            if (p.altarProg >= CFG.altarTime) this._endBySacrifice(p);
          } else {
            p.altarProg = Math.max(0, (p.altarProg || 0) - dt);
          }
        }
      } else {
        // слепой: может кричать
        p.altarProg = 0;
      }
    }
  }

  _move(p, mx, my, step) {
    p.x += mx * step;
    p.y += my * step;
    p.x = clamp(p.x, 3, CFG.world.w - 3);
    p.y = clamp(p.y, 3, CFG.world.h - 3);
    for (const t of this.trees) {
      const dx = p.x - t.x, dy = p.y - t.y;
      const min = t.r + 0.45;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 1e-4) { p.x = t.x + (dx / d) * min; p.y = t.y + (dy / d) * min; }
    }
  }

  _updateLantern(dt) {
    if (!this.lantern.heldBy && this.lantern.onGround) {
      // подбор
      for (const p of this._alive()) {
        if (dist(p.x, p.y, this.lantern.x, this.lantern.y) < 1.9) {
          this._give(p);
          this.lantern.onGround = false;
          this._toast('Фонарь снова в руках.', 'good');
          break;
        }
      }
      // Собиратель ломает брошенный фонарь
      if (this.lantern.onGround && this.collector.x !== null &&
          dist(this.collector.x, this.collector.y, this.lantern.x, this.lantern.y) < 2.0) {
        this.lantern.smash = (this.lantern.smash || 0) + dt;
        if (this.lantern.smash > CFG.smashTime) {
          this._end('collector');
        } else if (this.lantern.smash > 2 && !this.smashWarning) {
          this.smashWarning = true;
          this._toast('Собиратель ломает брошенный фонарь! Верните его!', 'warn');
        }
      } else {
        this.lantern.smash = 0;
        this.smashWarning = false;
      }
    }
  }

  _give(p) {
    this.lantern.heldBy = p.id;
    p.held = 'lantern';
    p.role = 'carrier';
    for (const q of this.room.players.values()) {
      if (q.id !== p.id && q.held === 'lantern') { q.held = null; q.role = 'blind'; }
    }
    this.lantern.smash = 0;
    this.smashWarning = false;
  }

  _dropLantern(x, y, penalty = 15) {
    const p = this.room.players.get(this.lantern.heldBy);
    if (p) { p.held = null; p.role = 'blind'; }
    this.lantern.heldBy = null;
    this.lantern.onGround = true;
    this.lantern.x = x;
    this.lantern.y = y;
    this.lantern.charge = clamp(this.lantern.charge - penalty, 0, 100);
    if (this.lantern.charge <= 0) this.lantern.dead = true;
    this.lantern.groundAt = this.t;
  }

  _updateCollector(dt) {
    const c = this.collector;
    if (c.stunned > this.t) return;

    // цели: фонарь (в руках или на земле) + приманки от криков
    const lights = [];
    const lp = this._lanternPos();
    if (lp) lights.push({ x: lp.x, y: lp.y, kind: 'lantern' });
    for (const d of this.decoys) lights.push({ x: d.x, y: d.y, kind: 'decoy' });

    // ближайший источник, но не у костра
    let target = null, bd = 1e9;
    for (const l of lights) {
      if (this.fires.some((f) => dist(l.x, l.y, f.x, f.y) < CFG.collectorSafeFire)) continue;
      const d = dist(c.x, c.y, l.x, l.y);
      if (d < bd) { bd = d; target = l; }
    }
    c.target = target ? { x: target.x, y: target.y } : null;

    let speed = CFG.collectorSpeed;
    let tx = null, ty = null;
    if (target) {
      tx = target.x; ty = target.y;
      if (target.kind === 'lantern') speed = CFG.collectorChaseSpeed;
    } else {
      // бесцельно дрейфует к последней точке фонаря
      tx = c.x + 10; ty = c.y;
    }
    const a = angleTo(c.x, c.y, tx, ty);
    c.x += Math.cos(a) * speed * dt;
    c.y += Math.sin(a) * speed * dt;

    // контакт с несущим
    if (this.lantern.heldBy) {
      const holder = this.room.players.get(this.lantern.heldBy);
      if (holder && dist(c.x, c.y, holder.x, holder.y) < 1.6) {
        this._dropLantern(holder.x + rand(-0.8, 0.8), holder.y + rand(-0.8, 0.8), 15);
        holder.stunnedUntil = this.t + 2.2;
        holder.push('toast', { text: 'Собиратель сбил фонарь!', kind: 'warn' });
        this._toast('Собиратель сбил фонарь. Подберите его!', 'warn');
        c.stunned = this.t + 2.0;
        c.x += Math.cos(a) * 2.2;
        c.y += Math.sin(a) * 2.2;
      }
    }
  }

  _updateDecoys(dt) {
    this.decoys = this.decoys.filter((d) => d.until > this.t);
  }

  _checkEnd(dt) {
    if (this.t > CFG.roundTime) {
      this._end('time');
      return;
    }
    if (this._alive().length === 0) this._end('collector');
  }

  _endBySacrifice(p) {
    if (this.done) return;
    this.altarDoneBy = p.id;
    p.altarDone = true;
    this._end('altar');
  }

  _end(reason) {
    if (this.done) return;
    this.done = true;
    this.reason = reason;
    if (reason === 'altar') {
      this.winner = 'survivors';
    } else {
      this.winner = 'forest';
    }
    this.phase = 'result';
    this.finalReasons = {
      altar: 'Фонарь разбит. ' + (this.altarDoneBy ? 'Один остался в лесу.' : ''),
      collector: 'Собиратель забрал фонарь.',
      time: 'До часовни не дошли.',
    };
    this._toast(this.finalReasons[reason] || 'Конец', reason === 'altar' ? 'good' : 'warn');
  }

  action(p, act) {
    if (act.t === 'pass') {
      if (this.lantern.heldBy !== p.id) return;
      const others = this._alive().filter((q) => q.id !== p.id && dist(q.x, q.y, p.x, p.y) <= CFG.passRange);
      if (!others.length) { p.push('toast', { text: 'Рядом никого', kind: 'warn' }); return; }
      const near = others.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
      this.lantern.charge = clamp(this.lantern.charge - 2, 0, 100);
      this._give(near);
      near.push('toast', { text: 'Ты держишь фонарь', kind: 'good' });
      p.push('toast', { text: 'Фонарь передан', kind: 'info' });
    }
    if (act.t === 'shout') {
      const last = this.shouts.get(p.id) || -99;
      if (this.t - last < CFG.shoutCooldown) return;
      this.shouts.set(p.id, this.t);
      this.decoys.push({ x: p.x, y: p.y, until: this.t + CFG.shoutDecoy });
      for (const q of this.room.players.values()) {
        q.push('shout', { x: Math.round(p.x), y: Math.round(p.y), name: p.name });
      }
    }
  }

  botThink(p, dt) {
    if (!p.alive || p.done) { p.input.mx = 0; p.input.my = 0; return; }
    const carrier = this.lantern.heldBy === p.id;
    const lx = carrier ? p.x : this.lantern.x;
    const ly = carrier ? p.y : this.lantern.y;

    let tx = 0, ty = 0, act = false;
    if (carrier) {
      const lowCharge = this.lantern.charge < 35 || this.lantern.dead;
      const fire = lowCharge
        ? this.fires.slice().sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0]
        : null;
      if (fire) { tx = fire.x; ty = fire.y; act = dist(p.x, p.y, fire.x, fire.y) < 3.5; }
      else { tx = CFG.world.chapelX + 6; ty = 32; }
      // сброс фонаря при опасности — боты иногда передают
      const others = this._alive().filter((q) => q.id !== p.id);
      if (others.length && Math.random() < 0.002) {
        const near = others.find((q) => dist(q.x, q.y, p.x, p.y) < 3);
        if (near) this._give(near);
      }
      // алтарь
      if (p.x > CFG.world.chapelX - 2 && !this.done) {
        p.input.mx = 0; p.input.my = 0; p.input.act = true;
        return;
      }
    } else {
      // слепые идут за фонарём, но чуть в стороне
      const off = (p.id.charCodeAt(1) % 5) - 2;
      tx = lx - 4;
      ty = ly + off * 2.2;
      const c = this.collector;
      if (dist(c.x, c.y, p.x, p.y) < 4 && this.t - (this.shouts.get(p.id) || -99) > CFG.shoutCooldown) {
        this.action(p, { t: 'shout' });
      }
    }
    const a = angleTo(p.x, p.y, tx, ty);
    const d = dist(p.x, p.y, tx, ty);
    if (d > 1.5) { p.input.mx = Math.cos(a); p.input.my = Math.sin(a); p.dir = a; }
    else { p.input.mx = 0; p.input.my = 0; }
    p.input.act = act;
  }

  snapshotFor(p) {
    const carrier = this.lantern.heldBy === p.id;
    const players = [...this.room.players.values()].map((q) => {
      const o = q.serialize();
      o.held = q.held === 'lantern';
      o.charge = q.id === p.id ? Math.round((q.charge || 0) * 10) / 10 : 0;
      o.altarProg = q.id === p.id ? this.altarProg : 0;
      o.stunned = (q.stunnedUntil || 0) > this.t;
      return o;
    });
    return {
      world: {
        kind: 'relay',
        w: CFG.world.w, h: CFG.world.h,
        chapelX: CFG.world.chapelX,
        fires: this.fires.map((f) => ({ x: f.x, y: f.y, lit: f.lit })),
        trees: this.trees,
        water: this.water,
        altar: { x: CFG.world.chapelX + 4, y: 32 },
      },
      gs: {
        t: Math.round(this.t),
        phase: this.phase,
        timeLeft: Math.max(0, Math.round(CFG.roundTime - this.t)),
        youCarrier: !!carrier,
        lantern: {
          x: Math.round(this.lantern.x * 10) / 10,
          y: Math.round(this.lantern.y * 10) / 10,
          charge: Math.round(this.lantern.charge),
          onGround: !!this.lantern.onGround,
          heldBy: this.lantern.heldBy,
          smash: Math.round((this.lantern.smash || 0) * 10) / 10,
        },
        collector: {
          x: Math.round(this.collector.x * 10) / 10,
          y: Math.round(this.collector.y * 10) / 10,
          stunned: this.collector.stunned > this.t,
          dist: Math.round(dist(this.collector.x, this.collector.y, p.x, p.y) * 10) / 10,
        },
        decoys: this.decoys.map((d) => ({ x: Math.round(d.x), y: Math.round(d.y) })),
        shoutCooldown: Math.max(0, Math.ceil(CFG.shoutCooldown - (this.t - (this.shouts.get(p.id) || -99)))),
        blindRadius: CFG.blindRadius,
        allyRadius: CFG.allyRadius,
        altarProg: this.altarProg,
        reason: this.reason || null,
        finalReasons: this.finalReasons || null,
      },
      players,
    };
  }

  finalSummary() {
    return {
      kind: 'relay',
      reason: this.reason,
      text: this.finalReasons ? this.finalReasons[this.reason] : '',
      sacrifice: this.altarDoneBy,
    };
  }
}

module.exports = RelayMode;
module.exports.CFG = CFG;
