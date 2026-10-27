'use strict';
/* ============================================================
   ФОНАРЩИКИ — PvPvE, 4 костра, дрова, тайная Тень.
   Раунд 10 минут, затем рассвет и голосование «кто уйдёт».
   ============================================================ */

const { clamp, dist, rand, pick, shuffle, TAU, angleTo } = require('../util');

const WORLD = {
  r: 34, cx: 36, cy: 36,
  fires: [
    { x: 36, y: 15 },
    { x: 57, y: 36 },
    { x: 36, y: 57 },
    { x: 15, y: 36 },
  ],
  piles: [
    { x: 36, y: 24 }, { x: 45, y: 20 }, { x: 52, y: 29 }, { x: 44, y: 41 },
    { x: 50, y: 50 }, { x: 36, y: 46 }, { x: 24, y: 52 }, { x: 20, y: 41 },
    { x: 27, y: 30 }, { x: 21, y: 22 }, { x: 30, y: 20 }, { x: 42, y: 32 },
  ],
};

const CFG = {
  roundTime: 600,          // 10 минут до рассвета
  voteTime: 30,
  fireFuel: 100,
  fireDrain: 0.55,         // %/с при 8+ игроках
  feedTime: 1.5,
  feedAmount: 35,
  chargeMax: 100,
  chargeDrain: 0.35,
  chargeDrainSprintMul: 1.6,
  rechargeTime: 1.5,
  rechargeAmount: 40,
  walk: 4.3,
  sprint: 6.4,
  shadowEvery: 60,
  shadowTime: 30,
  shadowSpeed: 1.25,
  douseTime: 5,
  catchTime: 1.5,
  catchRange: 11,
  catchCone: 0.55,         // рад, полуугол ~31°
  stunTime: 4,
  grabberSpeed: 2.2,
  grabberDps: 0,           // хватает мгновенно
  carryTime: 8,            // сколько держит, пока не спасут
  rescueTime: 1.2,
  pileAmount: 3,
  pileRespawn: 20,
  maxCarry: 2,
};

class LanternMode {
  constructor(room) {
    this.room = room;
    this.t = 0;
    this.done = false;
    this.winner = null;
    this.phase = 'play';
    this.fires = WORLD.fires.map((f, i) => ({ id: i, x: f.x, y: f.y, fuel: CFG.fireFuel, lit: true, outAt: 0 }));
    this.piles = WORLD.piles.map((p, i) => ({ id: i, x: p.x, y: p.y, amount: CFG.pileAmount, cool: 0 }));
    this.trees = this._makeTrees();
    this.shadow = null;
    this.nextShadowAt = CFG.shadowEvery;
    this.lastShadowId = null;
    this.grabbers = [];
    this.grabSeq = 1;
    this.votes = new Map();
    this.results = null;
    this.voteDeadline = 0;
    this.dawnAt = CFG.roundTime;
  }

  _makeTrees() {
    let seed = (Number(this.room.code) * 2654435761) >>> 0;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const trees = [];
    for (let i = 0; i < 90; i++) {
      const a = rnd() * TAU;
      const r = 6 + rnd() * (WORLD.r - 8);
      const x = WORLD.cx + Math.cos(a) * r;
      const y = WORLD.cy + Math.sin(a) * r;
      // не сажаем на костёр, тропы и точки дров
      if (WORLD.fires.some((f) => dist(x, y, f.x, f.y) < 7)) continue;
      if (WORLD.piles.some((p) => dist(x, y, p.x, p.y) < 3)) continue;
      if (trees.some((t) => dist(x, y, t.x, t.y) < 3.2)) continue;
      trees.push({ x, y, r: 0.55 + rnd() * 0.35, kind: rnd() < 0.25 ? 'bush' : 'tree' });
    }
    return trees;
  }

  /* ---------------- старт ---------------- */
  start() {
    const list = [...this.room.players.values()];
    const spots = shuffle([
      { x: 36, y: 40 }, { x: 33, y: 33 }, { x: 40, y: 31 },
      { x: 30, y: 38 }, { x: 42, y: 39 }, { x: 34, y: 28 },
      { x: 39, y: 44 }, { x: 28, y: 30 }, { x: 44, y: 35 },
      { x: 31, y: 45 }, { x: 41, y: 26 }, { x: 26, y: 40 },
      { x: 46, y: 42 }, { x: 37, y: 25 }, { x: 29, y: 26 }, { x: 43, y: 47 },
    ]);
    list.forEach((p, i) => {
      const s = spots[i % spots.length];
      p.x = s.x; p.y = s.y; p.dir = 0;
      p.charge = CFG.chargeMax;
      p.logs = 0;
      p.lanternOn = true;
      p.feedProg = 0;
      p.chargeProg = 0;
      p.douseProg = 0;
      p.catchProg = 0;
      p.rescueProg = 0;
      p.heldBy = null;
      p.role = 'keeper';
      p.alive = true;
      p.done = false;
      p.stunnedUntil = 0;
    });
    this._pushToast('Четыре костра. Держите огонь.');
  }

  _alive() { return [...this.room.players.values()].filter((p) => p.alive && !p.done); }
  _nearFire(p, r = 2.8) {
    return this.fires.find((f) => dist(p.x, p.y, f.x, f.y) <= r);
  }
  _drainScale() {
    const n = Math.max(2, this._alive().length);
    return clamp(8 / n, 0.55, 1.35);
  }

  _pushToast(text, kind = 'info') {
    for (const p of this.room.players.values()) p.push('toast', { text, kind });
  }

  /* ---------------- тик ---------------- */
  update(dt) {
    if (this.done) return;
    this.t += dt;

    if (this.phase === 'play') {
      this._updateFires(dt);
      this._updatePlayers(dt);
      this._updateShadow(dt);
      this._updateGrabbers(dt);
      this._updatePiles(dt);
      if (this.t >= this.dawnAt) this._dawn();
    } else if (this.phase === 'vote') {
      this._updatePlayers(dt, true);
      this._updateGrabbers(dt);
      if (this.t >= this.voteDeadline) this._resolveVote();
    }
  }

  _updateFires(dt) {
    const scale = this._drainScale();
    for (const f of this.fires) {
      if (!f.lit) continue;
      f.fuel -= CFG.fireDrain * scale * dt;
      if (f.fuel <= 0) {
        f.fuel = 0;
        f.lit = false;
        f.outAt = this.t;
        this._spawnGrabbers(f);
        this._pushToast('Костёр погас. Из темноты тянутся руки.', 'warn');
      }
    }
  }

  _spawnGrabbers(fire) {
    const total = this.grabbers.length;
    const n = Math.min(2, Math.max(0, 8 - total));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      this.grabbers.push({
        id: 'g' + (this.grabSeq++),
        x: fire.x + Math.cos(a) * 3.5,
        y: fire.y + Math.sin(a) * 3.5,
        home: { x: fire.x, y: fire.y },
        holding: null,
        stunnedUntil: 0,
      });
    }
  }

  _updatePiles(dt) {
    for (const p of this.piles) {
      if (p.amount <= 0) {
        p.cool -= dt;
        if (p.cool <= 0) { p.amount = CFG.pileAmount; p.cool = 0; }
      }
    }
    // авто-подбор
    for (const p of this._alive()) {
      if (p.heldBy || (p.logs || 0) >= CFG.maxCarry) continue;
      for (const pile of this.piles) {
        if (pile.amount <= 0) continue;
        if (dist(p.x, p.y, pile.x, pile.y) < 1.8) {
          pile.amount--;
          p.logs = (p.logs || 0) + 1;
          if (pile.amount <= 0) pile.cool = CFG.pileRespawn;
          p.push('toast', { text: 'Дров: ' + p.logs, kind: 'info' });
          break;
        }
      }
    }
  }

  _updatePlayers(dt, frozen = false) {
    for (const p of this.room.players.values()) {
      if (!p.alive || p.done) continue;
      if (p.heldBy) { p.feedProg = 0; continue; }
      if (frozen) continue; // на голосовании двигаться нельзя

      const isShadow = this.shadow && this.shadow.id === p.id && this.t < this.shadow.until;
      const stunned = (p.stunnedUntil || 0) > this.t;
      const sprint = p.input.sprint && !stunned;
      const speed = (sprint ? CFG.sprint : CFG.walk) * (isShadow ? CFG.shadowSpeed : 1);
      if (!stunned) this._move(p, p.input.mx, p.input.my, speed * dt);

      // ---- фонарь ----
      if (isShadow) {
        p.lanternOn = false;
      } else if (p.charge > 0 && p.toggleRequest) {
        p.lanternOn = !p.lanternOn;
      }
      p.toggleRequest = false;

      const fire = this._nearFire(p);
      // взаимодействие: кормить или заряжать
      if (fire && p.input.act && !stunned) {
        if ((p.logs || 0) > 0) {
          p.feedProg += dt;
          p.chargeProg = 0;
          if (p.feedProg >= CFG.feedTime) {
            p.feedProg = 0;
            p.logs--;
            if (!fire.lit) {
              fire.lit = true;
              fire.fuel = CFG.feedAmount;
              this._pushToast('Костёр снова горит!', 'good');
              p.stats.ignites++;
            } else {
              fire.fuel = Math.min(CFG.fireFuel, fire.fuel + CFG.feedAmount);
            }
          }
        } else {
          p.chargeProg += dt;
          p.feedProg = 0;
          if (p.chargeProg >= CFG.rechargeTime) {
            p.chargeProg = 0;
            p.charge = Math.min(CFG.chargeMax, p.charge + CFG.rechargeAmount);
          }
        }
      } else {
        p.feedProg = Math.max(0, (p.feedProg || 0) - dt * 2);
        p.chargeProg = Math.max(0, (p.chargeProg || 0) - dt * 2);
      }

      // ---- заряд фонаря ----
      if (p.lanternOn && p.charge > 0) {
        const drain = CFG.chargeDrain * (sprint ? CFG.chargeDrainSprintMul : 1);
        p.charge = Math.max(0, p.charge - drain * dt);
        if (p.charge <= 0) p.lanternOn = false;
      }

      // ---- помощь попавшим в руки ----
      p.rescueProg = 0;
      for (const g of this.grabbers) {
        if (g.holding && dist(p.x, p.y, g.x, g.y) < 3.2 && p.lanternOn) {
          g.rescueProg = (g.rescueProg || 0) + dt;
          p.rescueProg = g.rescueProg / CFG.rescueTime;
          if (g.rescueProg >= CFG.rescueTime) this._freeFromGrabber(g);
        }
      }
    }
  }

  _move(p, mx, my, step) {
    p.x += mx * step;
    p.y += my * step;
    // стены мира
    const dx = p.x - WORLD.cx, dy = p.y - WORLD.cy;
    const d = Math.hypot(dx, dy);
    if (d > WORLD.r) { p.x = WORLD.cx + (dx / d) * WORLD.r; p.y = WORLD.cy + (dy / d) * WORLD.r; }
    // деревья
    for (const t of this.trees) {
      const ddx = p.x - t.x, ddy = p.y - t.y;
      const min = t.r + 0.45;
      const dd = Math.hypot(ddx, ddy);
      if (dd < min && dd > 1e-4) {
        p.x = t.x + (ddx / dd) * min;
        p.y = t.y + (ddy / dd) * min;
      }
    }
  }

  /* ---------------- Тень ---------------- */
  _updateShadow(dt) {
    // назначение
    if (!this.shadow && this.t >= this.nextShadowAt && this.phase === 'play') {
      const cands = this._alive().filter((p) => !p.bot || true);
      if (cands.length >= 2) {
        let pool = cands.filter((p) => p.id !== this.lastShadowId);
        if (!pool.length) pool = cands;
        const victim = pick(pool);
        this.shadow = { id: victim.id, until: this.t + CFG.shadowTime, catchProg: 0 };
        this.lastShadowId = victim.id;
        victim.role = 'shadow';
        victim.lanternOn = false;
        victim.stunnedUntil = 0;
        victim.stats.shadow++;
        victim.push('role', { role: 'shadow', until: CFG.shadowTime });
      }
      this.nextShadowAt = this.t + CFG.shadowEvery;
    }

    if (!this.shadow) return;
    const s = this.shadow;
    const p = this.room.players.get(s.id);
    if (!p || !p.alive) { this._endShadow(true); return; }

    // гашение костра
    const fire = this._nearFire(p, 2.8);
    if (fire && fire.lit && p.input.act && (p.stunnedUntil || 0) <= this.t) {
      p.douseProg = (p.douseProg || 0) + dt;
      if (p.douseProg >= CFG.douseTime) {
        fire.fuel = 0;
        fire.lit = false;
        fire.outAt = this.t;
        p.douseProg = 0;
        this._spawnGrabbers(fire);
        this._pushToast('Костёр погасили. Тень среди нас.', 'warn');
        this._endShadow(false);
        return;
      }
    } else {
      p.douseProg = Math.max(0, (p.douseProg || 0) - dt * 1.5);
    }

    // ловля светом
    let catchRate = 0;
    for (const q of this._alive()) {
      if (q.id === p.id) continue;
      if (!q.lanternOn || q.charge <= 0) continue;
      if (dist(q.x, q.y, p.x, p.y) > CFG.catchRange) continue;
      const ang = Math.atan2(p.y - q.y, p.x - q.x);
      let diff = Math.abs(((ang - q.dir + Math.PI * 3) % TAU) - Math.PI);
      if (diff < CFG.catchCone) { catchRate = Math.max(catchRate, 1); }
    }
    if (catchRate > 0) {
      s.catchProg += dt;
      p.catchProg = s.catchProg / CFG.catchTime;
      if (s.catchProg >= CFG.catchTime) {
        p.stunnedUntil = this.t + CFG.stunTime;
        const catcher = this._alive().find((q) => q.id !== p.id && q.lanternOn &&
          dist(q.x, q.y, p.x, p.y) <= CFG.catchRange);
        if (catcher) catcher.stats.catches++;
        this._pushToast('Тень поймана светом.', 'good');
        this._endShadow(false);
      }
    } else {
      s.catchProg = Math.max(0, s.catchProg - dt * 0.7);
      p.catchProg = s.catchProg / CFG.catchTime;
    }

    if (this.t >= s.until) this._endShadow(false);
  }

  _endShadow(silent) {
    if (!this.shadow) return;
    const p = this.room.players.get(this.shadow.id);
    if (p) {
      p.role = 'keeper';
      p.douseProg = 0;
      p.catchProg = 0;
      p.lanternOn = p.charge > 0;
      if (!silent) p.push('role', { role: 'keeper', until: 0 });
    }
    this.shadow = null;
  }

  /* ---------------- Тянущиеся ---------------- */
  _updateGrabbers(dt) {
    for (const g of [...this.grabbers]) {
      if (g.holding) {
        const victim = this.room.players.get(g.holding);
        if (!victim || !victim.alive) { g.holding = null; continue; }
        victim.x = g.x; victim.y = g.y;
        g.holdLeft = (g.holdLeft || CFG.carryTime) - dt;
        if (g.holdLeft <= 0) {
          victim.alive = false;
          victim.done = true;
          victim.push('dead', { reason: 'Тянущиеся забрали тебя' });
          g.holding = null;
          this.grabbers = this.grabbers.filter((q) => q !== g);
          this._checkAllOut();
        }
        continue;
      }
      if ((g.stunnedUntil || 0) > this.t) continue;
      // цель — ближайший живой
      let target = null, bd = 26;
      for (const p of this._alive()) {
        const d = dist(g.x, g.y, p.x, p.y);
        if (d < bd) { bd = d; target = p; }
      }
      if (target) {
        const ang = angleTo(g.x, g.y, target.x, target.y);
        g.x += Math.cos(ang) * CFG.grabberSpeed * dt;
        g.y += Math.sin(ang) * CFG.grabberSpeed * dt;
        if (dist(g.x, g.y, target.x, target.y) < 1.1 && !target.heldBy) {
          g.holding = target.id;
          g.holdLeft = CFG.carryTime;
          g.rescueProg = 0;
          target.heldBy = g.id;
          target.feedProg = 0;
          target.push('grabbed', { by: g.id });
        }
      } else {
        // возвращается к своему костру
        const ang = angleTo(g.x, g.y, g.home.x, g.home.y);
        if (dist(g.x, g.y, g.home.x, g.home.y) > 2) {
          g.x += Math.cos(ang) * CFG.grabberSpeed * 0.6 * dt;
          g.y += Math.sin(ang) * CFG.grabberSpeed * 0.6 * dt;
        }
      }
    }
  }

  _freeFromGrabber(g) {
    if (!g.holding) return;
    const victim = this.room.players.get(g.holding);
    if (victim) {
      victim.heldBy = null;
      victim.push('toast', { text: 'Тебя вытащили из тьмы', kind: 'good' });
    }
    g.holding = null;
    g.stunnedUntil = this.t + 3;
    g.rescueProg = 0;
  }

  _checkAllOut() {
    if (this._alive().length === 0 && this.phase === 'play') {
      this.done = true;
      this.winner = 'forest';
    }
  }

  /* ---------------- рассвет и голосование ---------------- */
  _dawn() {
    this.t = this.dawnAt;
    const lit = this.fires.filter((f) => f.lit).length;
    this.litAtDawn = lit;
    if (lit <= 0) {
      this.phase = 'result';
      this.results = { lit: 0, bridge: 0, winners: [], losers: this._alive().map((p) => p.id) };
      this.done = true;
      this.winner = 'forest';
      return;
    }
    this.phase = 'vote';
    this.voteDeadline = this.t + CFG.voteTime;
    this.votes.clear();
    for (const p of this._alive()) {
      p.push('dawn', { lit, bridge: lit });
    }
  }

  vote(voter, targetId) {
    if (this.phase !== 'vote') return;
    if (!voter.alive) return;
    if (targetId === voter.id) return;
    const target = this.room.players.get(targetId);
    if (!target || !target.alive) return;
    this.votes.set(voter.id, targetId);
  }

  _resolveVote() {
    const alive = this._alive();
    const bridge = clamp(this.litAtDawn || 0, 1, 4);
    const counts = new Map();
    for (const p of alive) counts.set(p.id, 0);
    for (const t of this.votes.values()) counts.set(t, (counts.get(t) || 0) + 1);
    // боты голосуют, если ещё не успели
    for (const p of alive) {
      if (p.bot && !this.votes.has(p.id)) {
        const others = alive.filter((q) => q.id !== p.id);
        if (others.length) {
          const t = pick(others);
          this.votes.set(p.id, t.id);
          counts.set(t.id, (counts.get(t.id) || 0) + 1);
        }
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || Math.random() - 0.5);
    const winners = ranked.slice(0, bridge).map(([id]) => id);
    this.results = {
      lit: this.litAtDawn,
      bridge,
      winners,
      losers: alive.filter((p) => !winners.includes(p.id)).map((p) => p.id),
      counts: Object.fromEntries(counts),
      votes: Object.fromEntries(this.votes),
    };
    this.phase = 'result';
    this.done = true;
    this.winner = 'keepers';
  }

  /* ---------------- события ---------------- */
  action(p, act) {
    if (act.t === 'toggleLantern') { p.toggleRequest = true; return; }
    if (act.t === 'vote') { this.vote(p, act.target); return; }
  }

  /* ---------------- боты ---------------- */
  botThink(p, dt) {
    if (!p.alive || p.done || p.heldBy) { p.input.mx = 0; p.input.my = 0; p.input.act = false; return; }
    const isShadow = this.shadow && this.shadow.id === p.id && this.t < this.shadow.until;

    let goal = null, act = false;

    if (isShadow) {
      const fire = this.fires.filter((f) => f.lit).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
      if (fire) {
        goal = fire;
        act = dist(p.x, p.y, fire.x, fire.y) < 2.4;
      }
    } else {
      const needFire = this.fires.filter((f) => f.fuel < 55).sort((a, b) => a.fuel - b.fuel)[0];
      const pile = this.piles.filter((q) => q.amount > 0).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
      if ((p.logs || 0) < CFG.maxCarry && pile && (!needFire || dist(p.x, p.y, pile.x, pile.y) < 26)) {
        goal = pile;
      } else if (needFire) {
        goal = needFire;
        act = dist(p.x, p.y, needFire.x, needFire.y) < 2.4;
      } else if (p.charge < 45) {
        const fire = this.fires.filter((f) => f.lit).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
        if (fire) { goal = fire; act = dist(p.x, p.y, fire.x, fire.y) < 2.4; }
      } else {
        const fire = this.fires.filter((f) => f.lit).sort((a, b) => dist(p.x, p.y, a.x, a.y) - dist(p.x, p.y, b.x, b.y))[0];
        if (fire) goal = fire;
      }
    }

    if (goal) {
      const a = angleTo(p.x, p.y, goal.x, goal.y);
      const d = dist(p.x, p.y, goal.x, goal.y);
      if (d > 1.4) {
        p.input.mx = Math.cos(a);
        p.input.my = Math.sin(a);
        p.dir = a;
      } else {
        p.input.mx = 0; p.input.my = 0;
      }
      p.input.sprint = d > 12 && (p.logs || 0) < 1 && Math.random() < 0.02;
    } else {
      p.input.mx = 0; p.input.my = 0;
    }
    p.input.act = act;

    if (this.phase === 'vote' && !this.votes.has(p.id)) {
      const others = this._alive().filter((q) => q.id !== p.id);
      if (others.length) this.vote(p, pick(others).id);
    }
  }

  /* ---------------- снимок для клиента ---------------- */
  snapshotFor(p) {
    const isShadow = this.shadow && this.shadow.id === p.id && this.t < this.shadow.until;
    const counts = {};
    for (const t of this.votes.values()) counts[t] = (counts[t] || 0) + 1;
    const players = [...this.room.players.values()].map((q) => {
      const o = q.serialize();
      o.lantern = !!q.lanternOn && q.charge > 0;
      o.charge = Math.round(q.charge || 0);
      o.logs = q.logs || 0;
      o.held = q.heldBy ? true : false;
      o.feedProg = q.id === p.id ? clamp((q.feedProg || 0) / CFG.feedTime, 0, 1) : 0;
      o.chargeProg = q.id === p.id ? clamp((q.chargeProg || 0) / CFG.rechargeTime, 0, 1) : 0;
      o.douseProg = q.id === p.id ? clamp((q.douseProg || 0) / CFG.douseTime, 0, 1) : 0;
      o.catchProg = q.id === p.id ? clamp(q.catchProg || 0, 0, 1) : 0;
      o.rescueProg = q.id === p.id ? clamp(q.rescueProg || 0, 0, 1) : 0;
      if (q.id === p.id) o.role = q.role;
      return o;
    });
    return {
      world: {
        kind: 'lantern',
        r: WORLD.r, cx: WORLD.cx, cy: WORLD.cy,
        fires: this.fires.map((f) => ({
          x: f.x, y: f.y, fuel: Math.round(f.fuel), lit: f.lit,
        })),
        piles: this.piles.map((q) => ({ x: q.x, y: q.y, amount: q.amount })),
        trees: this.trees,
        grabbers: this.grabbers.map((g) => ({
          x: Math.round(g.x * 10) / 10, y: Math.round(g.y * 10) / 10,
          holding: g.holding ? true : false, stunned: (g.stunnedUntil || 0) > this.t,
        })),
      },
      gs: {
        t: Math.round(this.t),
        phase: this.phase,
        dawnIn: Math.max(0, Math.round(this.dawnAt - this.t)),
        voteIn: this.phase === 'vote' ? Math.max(0, Math.round(this.voteDeadline - this.t)) : 0,
        lit: this.fires.filter((f) => f.lit).length,
        shadowActive: !!this.shadow,
        youShadow: !!isShadow,
        shadowUntil: isShadow ? Math.max(0, Math.round(this.shadow.until - this.t)) : 0,
        nextShadowIn: this.shadow ? 0 : Math.max(0, Math.round(this.nextShadowAt - this.t)),
        votes: counts,
        yourVote: this.votes.get(p.id || '') || null,
        results: this.results,
        config: { roundTime: CFG.roundTime, carrierTime: CFG.carryTime },
      },
      players,
    };
  }

  finalSummary() {
    const lit = this.litAtDawn || 0;
    return {
      kind: 'lantern', lit,
      winners: (this.results && this.results.winners) || [],
      losers: (this.results && this.results.losers) || [],
      counts: (this.results && this.results.counts) || {},
      votes: (this.results && this.results.votes) || {},
    };
  }
}

module.exports = LanternMode;
module.exports.CFG = CFG;
module.exports.WORLD = WORLD;
