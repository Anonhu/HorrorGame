'use strict';
/* ============================================================
   ПОСТОЯЛЫЙ ДВОР — социальная дедукция в доме с дверями.
   5 циклов по 75 секунд: гаснет свеча, запирается комната,
   всем выдаётся улика, затем голосование.
   ============================================================ */

const { clamp, dist, pick, shuffle, rand, circleRectResolve } = require('../util');

const CFG = {
  cycles: 5,
  cycleTime: 75,
  voteTime: 18,
  finalVoteTime: 30,
  candlesCommon: 4,
  walk: 4.0,
  takeTime: 4.0,          // сколько «не гость» держит жертву
  takeRange: 2.2,
  aloneRadius: 7,
  killToWin: 3,
};

/* ---------------- план дома ---------------- */
class InnMode {
  constructor(room) {
    this.room = room;
    this.t = 0;
    this.done = false;
    this.winner = null;
    this.phase = 'play';
    this.cycle = 0;
    this.cycleT = 0;
    this.stage = 'candle';      // candle → lock → clues → vote
    this.plan = this._makePlan();
    this.walls = this.plan.walls;
    this.doors = this.plan.doors;
    this.rooms = this.plan.rooms;
    this.commonCandles = [];
    this.lockedRoom = null;
    this.bodies = [];
    this.votes = new Map();
    this.finalVotes = new Map();
    this.impostors = [];
    this.kills = 0;
    this.voteOpen = false;
    this.voteDeadline = 0;
    this.results = null;
    this.cluesGiven = new Set();
  }

  /* ---------------- дом ---------------- */
  _wall(x, y, w, h) { return { x, y, w, h }; }

  _makePlan() {
    const walls = [];
    const doors = [];
    const rooms = [];

    const ROOMS = [
      { id: 'hall', name: 'Общий зал', x: 15, y: 15, w: 14, h: 10, doors: [
        { side: 'left', at: 20 }, { side: 'right', at: 20 }, { side: 'top', at: 22 }, { side: 'bottom', at: 22 },
      ] },
      { id: 'b1', name: 'Спальня 1', x: 3, y: 3, w: 10, h: 10, doors: [{ side: 'bottom', at: 8 }] },
      { id: 'b2', name: 'Спальня 2', x: 17, y: 3, w: 10, h: 10, doors: [{ side: 'bottom', at: 22 }] },
      { id: 'b3', name: 'Спальня 3', x: 31, y: 3, w: 10, h: 10, doors: [{ side: 'bottom', at: 36 }] },
      { id: 'kitchen', name: 'Кухня', x: 3, y: 15, w: 10, h: 10, doors: [{ side: 'right', at: 20 }] },
      { id: 'store', name: 'Кладовая', x: 31, y: 15, w: 10, h: 10, doors: [{ side: 'left', at: 20 }] },
      { id: 'b4', name: 'Спальня 4', x: 3, y: 27, w: 10, h: 10, doors: [{ side: 'top', at: 8 }] },
      { id: 'cellar', name: 'Подвал', x: 17, y: 29, w: 10, h: 8, doors: [{ side: 'top', at: 22 }] },
      { id: 'b5', name: 'Спальня 5', x: 31, y: 27, w: 10, h: 10, doors: [{ side: 'top', at: 36 }] },
    ];

    const doorWidth = 2.6;
    for (const r of ROOMS) {
      rooms.push({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h });
      // четыре стены, каждая с проёмом, если указана
      const sides = [
        { side: 'top', x: r.x, y: r.y, horiz: true, len: r.w },
        { side: 'bottom', x: r.x, y: r.y + r.h, horiz: true, len: r.w },
        { side: 'left', x: r.x, y: r.y, horiz: false, len: r.h },
        { side: 'right', x: r.x + r.w, y: r.y, horiz: false, len: r.h },
      ];
      for (const s of sides) {
        const d = r.doors.find((q) => q.side === s.side);
        const segs = [];
        if (!d) {
          segs.push(s.horiz
            ? this._wall(s.x, s.y - 0.45, s.len, 0.9)
            : this._wall(s.x - 0.45, s.y, 0.9, s.len));
        } else {
          const a = d.at - doorWidth / 2, b = d.at + doorWidth / 2;
          if (s.horiz) {
            if (a - s.x > 0.2) segs.push(this._wall(s.x, s.y - 0.45, a - s.x, 0.9));
            if (s.x + s.len - b > 0.2) segs.push(this._wall(b, s.y - 0.45, s.x + s.len - b, 0.9));
          } else {
            if (a - s.y > 0.2) segs.push(this._wall(s.x - 0.45, s.y, 0.9, a - s.y));
            if (s.y + s.len - b > 0.2) segs.push(this._wall(s.x - 0.45, b, 0.9, s.y + s.len - b));
          }
          doors.push({
            room: r.id,
            x: s.horiz ? a : s.x - 0.9,
            y: s.horiz ? s.y - 0.9 : a,
            w: s.horiz ? doorWidth : 1.8,
            h: s.horiz ? 1.8 : doorWidth,
            locked: false,
          });
        }
        walls.push(...segs);
      }
    }

    // внешние стены
    walls.push(this._wall(0, 0, 44, 1), this._wall(0, 39, 44, 1),
      this._wall(0, 0, 1, 40), this._wall(43, 0, 1, 40));

    return { walls, doors, rooms };
  }

  start() {
    const list = [...this.room.players.values()];
    list.forEach((p, i) => {
      const a = (i / list.length) * Math.PI * 2;
      p.x = 22 + Math.cos(a) * 3.5;
      p.y = 20 + Math.sin(a) * 3;
      p.dir = 0;
      p.alive = true;
      p.done = false;
      p.role = 'guest';
      p.candle = 100;
      p.takeProg = 0;
      p.heldBy = null;
      p.vote = null;
      p.clues = [];
    });

    // «не гость»
    const n = list.length;
    const count = n >= 14 ? 2 : 1;
    const shuffled = shuffle(list);
    this.impostors = shuffled.slice(0, count).map((p) => p.id);
    for (const p of list) {
      if (this.impostors.includes(p.id)) {
        p.role = 'impostor';
        p.push('role', { role: 'impostor' });
      }
    }
    this.killToWin = Math.max(2, Math.floor(n / 2) - 1);

    this.commonCandles = [
      { x: 17, y: 17, lit: true }, { x: 27, y: 17, lit: true },
      { x: 17, y: 23, lit: true }, { x: 27, y: 23, lit: true },
    ];

    this._beginCycle(true);
    this._toast('Свечи горят. До рассвета пять циклов.', 'info');
    this._toast('Кто-то из вас — не гость.', 'warn');
  }

  _beginCycle(first) {
    this.stage = 'candle';
    this.cycleT = 0;
    this.voteOpen = false;
    this.votes.clear();
    for (const p of this.room.players.values()) {
      p.vote = null;
      if (p.cellared) {
        p.cellared = false;
        p.x = 22; p.y = 27.5;
        p.push('toast', { text: 'Подвал открыт. Ты свободен.', kind: 'info' });
      }
    }
    this.lockedRoom = null;
    for (const d of this.doors) d.locked = false;

    // одна общая свеча гаснет
    const lit = this.commonCandles.filter((c) => c.lit);
    if (lit.length > 1) {
      pick(lit).lit = false;
      this._toast('Одна общая свеча погасла.', 'warn');
    }
    if (!first) this.cycle++;
  }

  _alive() { return [...this.room.players.values()].filter((p) => p.alive && !p.done); }
  _aliveImpostors() { return this.impostors.filter((id) => { const p = this.room.players.get(id); return p && p.alive; }); }
  _toast(text, kind = 'info') { for (const p of this.room.players.values()) p.push('toast', { text, kind }); }

  roomOf(p) {
    for (const r of this.rooms) {
      if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return r;
    }
    return { id: 'corridor', name: 'коридор', x: 0, y: 0, w: 44, h: 40 };
  }

  update(dt) {
    if (this.done) return;
    this.t += dt;
    this.cycleT += dt;

    this._updatePlayers(dt);
    this._updateCycle(dt);
    this._checkWin();
  }

  _updatePlayers(dt) {
    const frozen = this.stage === 'finalvote';
    for (const p of this._alive()) {
      if (p.heldBy) { p.takeProg = 0; continue; }
      if (p.x >= 0 && p.y >= 0) {
        // движение
        if (!frozen && !this._inCellarLocked(p)) {
          const step = CFG.walk * dt;
          p.x += p.input.mx * step;
          p.y += p.input.my * step;
        }
        this._collide(p);
        // свеча
        p.candle = clamp((p.candle ?? 100) - dt * 0.22, 0, 100);
      }
    }

    // «не гость»: забрать гостя наедине
    for (const id of this._aliveImpostors()) {
      const imp = this.room.players.get(id);
      if (!imp || !imp.input.act) { if (imp) imp.takeProg = 0; continue; }
      const victims = this._alive().filter((q) =>
        q.id !== imp.id && !this.impostors.includes(q.id) && dist(q.x, q.y, imp.x, imp.y) < CFG.takeRange);
      if (!victims.length) { imp.takeProg = 0; continue; }
      const victim = victims[0];
      const third = this._alive().some((q) =>
        q.id !== imp.id && q.id !== victim.id && dist(q.x, q.y, imp.x, imp.y) < CFG.aloneRadius);
      if (third && victim.candle > 5) {
        imp.takeProg = Math.max(0, imp.takeProg - dt);
        imp.push('toast', { text: 'Свидетели рядом', kind: 'warn' });
        continue;
      }
      imp.takeProg += dt;
      if (imp.takeProg >= CFG.takeTime) {
        imp.takeProg = 0;
        this._kill(victim, imp);
      }
    }
  }

  _inCellarLocked(p) {
    const room = this.roomOf(p);
    if (room.id === 'cellar' && this.lockedRoom === 'cellar') return true;
    if (p.cellared) return true;
    return false;
  }

  _collide(p) {
    for (const w of this.walls) circleRectResolve(p, w, 0.42);
    for (const d of this.doors) if (d.locked) circleRectResolve(p, d, 0.42);
    // проём подвала всегда закрыт, если игрока туда заперли
    p.x = clamp(p.x, 1.2, 42.8);
    p.y = clamp(p.y, 1.2, 38.8);
  }

  _updateCycle(dt) {
    if (this.stage === 'candle' && this.cycleT > 12) {
      // запираем комнату
      const candidates = this.rooms.filter((r) => r.id !== 'hall' && r.id !== 'cellar');
      const room = pick(candidates);
      this.lockedRoom = room.id;
      for (const d of this.doors) if (d.room === room.id) d.locked = true;
      this._toast('Дверь в «' + room.name + '» заперлась.', 'warn');
      this.stage = 'lock';
    } else if (this.stage === 'lock' && this.cycleT > 24) {
      this._giveClues();
      this.stage = 'clues';
    } else if (this.stage === 'clues' && this.cycleT > CFG.cycleTime - CFG.voteTime) {
      this.stage = 'vote';
      this.voteOpen = true;
      this.voteDeadline = this.t + CFG.voteTime;
      this._toast('Голосование: кого запереть в подвале?', 'warn');
    }

    if (this.stage === 'vote' && this.t >= this.voteDeadline) {
      this._resolveCycleVote();
    }
  }

  _giveClues() {
    const alive = this._alive();
    for (const p of alive) {
      if (p.clues.length > 12) p.clues.shift();
      // 50% улик — настоящая информация о позиции игрока
      const real = Math.random() < 0.55;
      const other = pick(alive.filter((q) => q.id !== p.id)) || null;
      let text;
      if (real && other) {
        const room = this.roomOf(other);
        text = (other.name + ' был(а) в «' + room.name + '» в начале этого цикла.');
      } else {
        const room = pick(this.rooms.filter((r) => r.id !== 'hall'));
        const names = ['кто-то', 'гость в тени', 'неизвестный'];
        text = pick([
          'В «' + room.name + '» пахло гарью от чужой свечи.',
          'Дверь в «' + room.name + '» скрипела, когда ' + pick(names) + ' проходил(а).',
          'На полу в «' + room.name + '» остался пепел. Свеча там гасла не сама.',
          '' + pick(names) + ' стоял(а) слишком близко к темноте.',
        ]);
      }
      p.clues.push(text);
      p.push('clue', { text });
    }
  }

  _kill(victim, imp) {
    if (!victim.alive) return;
    victim.alive = false;
    victim.done = true;
    victim.heldBy = null;
    this.kills++;
    this.bodies.push({
      id: 'b' + this.bodies.length,
      x: Math.round(victim.x * 10) / 10,
      y: Math.round(victim.y * 10) / 10,
      name: victim.name,
      color: victim.color,
      at: Math.round(this.t),
    });
    victim.push('dead', { text: 'Тебя забрали. Ты можешь только смотреть.' });
    this._toast('Тело найдено: ' + victim.name + '.', 'warn');
    for (const p of this._alive()) p.push('body', { name: victim.name });
    imp.stats = imp.stats || {};
    imp.stats.kills = (imp.stats.kills || 0) + 1;
  }

  action(p, act) {
    if (act.t === 'vote' && this.voteOpen) {
      const target = this.room.players.get(act.target);
      if (!target || !target.alive || target.id === p.id) return;
      this.votes.set(p.id, target.id);
      p.vote = target.id;
      p.push('toast', { text: 'Голос за ' + target.name, kind: 'info' });
    }
    if (act.t === 'finalVote' && this.stage === 'finalvote') {
      const target = this.room.players.get(act.target);
      if (!target || !target.alive || target.id === p.id) return;
      this.finalVotes.set(p.id, target.id);
      p.vote = target.id;
    }
  }

  _resolveCycleVote() {
    const alive = this._alive();
    const counts = new Map();
    for (const id of alive.map((p) => p.id)) counts.set(id, 0);
    for (const t of this.votes.values()) counts.set(t, (counts.get(t) || 0) + 1);
    if (this.votes.size === 0) {
      // никто не голосовал — запираем случайного
      const t = pick(alive);
      if (t) counts.set(t.id, (counts.get(t.id) || 0) + 1);
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const jailedId = ranked[0] && ranked[0][1] > 0 ? ranked[0][0] : null;
    const jailed = jailedId ? this.room.players.get(jailedId) : null;

    if (jailed) {
      jailed.cellared = true;
      jailed.x = 22;
      jailed.y = 33;
      jailed.push('toast', { text: 'Тебя заперли в подвале на цикл', kind: 'warn' });
      this._toast(jailed.name + ' заперт(а) в подвале.', 'warn');
      // из подвала выпускаем в начале следующего цикла (см. _beginCycle)
    }
    this.voteOpen = false;

    if (this.cycle >= CFG.cycles - 1) {
      this._startFinalVote();
    } else {
      this._beginCycle(false);
    }
  }

  _startFinalVote() {
    this.stage = 'finalvote';
    this.voteOpen = true;
    this.voteDeadline = this.t + CFG.finalVoteTime;
    this._toast('Рассвет. Кто не гость? Голосуйте.', 'warn');
  }

  _checkWin() {
    const alive = this._alive();
    const aliveImp = this._aliveImpostors();
    if (aliveImp.length === 0) { this._finish('guests', 'Гостей не осталось — но и «не гостей» тоже.'); return; }
    if (this.kills >= this.killToWin) { this._finish('impostor', '«Не гость» забрал достаточно.'); return; }
    if (alive.length <= 2 && aliveImp.length >= 1) { this._finish('impostor', 'В доме почти никого не осталось.'); return; }
    if (this.stage === 'finalvote' && this.t >= this.voteDeadline) {
      const counts = new Map();
      for (const p of alive) counts.set(p.id, 0);
      for (const t of this.finalVotes.values()) counts.set(t, (counts.get(t) || 0) + 1);
      if (this.finalVotes.size === 0) {
        this._finish('impostor', 'Никто не решился назвать имя.');
        return;
      }
      const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
      const accused = ranked[0][0];
      if (this.impostors.includes(accused)) {
        this._finish('guests', 'Гости вычислили чужака.');
      } else {
        this._finish('impostor', 'Обвинили не того.');
      }
    }
  }

  _finish(winner, text) {
    if (this.done) return;
    this.done = true;
    this.winner = winner;
    this.phase = 'result';
    this.results = {
      winner,
      text,
      impostors: this.impostors,
      kills: this.kills,
      bodies: this.bodies,
    };
  }

  /* ---------------- боты ---------------- */
  botThink(p, dt) {
    if (!p.alive || p.done || p.cellared) { p.input.mx = 0; p.input.my = 0; p.input.act = false; return; }
    const isImp = this.impostors.includes(p.id);
    p.botTimer = (p.botTimer || 0) - dt;
    p.botGoal = p.botGoal || this._randomRoomPoint();

    if (isImp) {
      const victims = this._alive().filter((q) => q.id !== p.id && !this.impostors.includes(q.id));
      if (victims.length) {
        const alone = victims.filter((v) => !this._alive().some((q) =>
          q.id !== p.id && q.id !== v.id && dist(q.x, q.y, v.x, v.y) < CFG.aloneRadius));
        const pool = alone.length ? alone : victims;
        const target = pool.sort((a, b) => dist(a.x, a.y, p.x, p.y) - dist(b.x, b.y, p.x, p.y))[0];
        this._moveBotTo(p, target.x, target.y, dt);
        p.input.act = dist(p.x, p.y, target.x, target.y) < CFG.takeRange - 0.2;
        return;
      }
    }

    if (p.botTimer <= 0) {
      p.botTimer = rand(4, 9);
      p.botGoal = this._randomRoomPoint();
    }
    this._moveBotTo(p, p.botGoal.x, p.botGoal.y, dt);
    p.input.act = false;

    if (this.voteOpen) {
      const alive = this._alive().filter((q) => q.id !== p.id);
      if (alive.length && !p.vote) {
        // боты иногда голосуют «правильно»
        const impAlive = alive.filter((q) => this.impostors.includes(q.id));
        const target = (impAlive.length && Math.random() < 0.45) ? pick(impAlive) : pick(alive);
        if (this.stage === 'finalvote') this.action(p, { t: 'finalVote', target: target.id });
        else this.action(p, { t: 'vote', target: target.id });
      }
    }
  }

  _randomRoomPoint() {
    const r = pick(this.rooms);
    return { x: r.x + 1.5 + Math.random() * (r.w - 3), y: r.y + 1.5 + Math.random() * (r.h - 3) };
  }

  _moveBotTo(p, tx, ty, dt) {
    // грубый обход стен: если упёрлись — идём в обход
    const a = Math.atan2(ty - p.y, tx - p.x);
    const before = { x: p.x, y: p.y };
    p.input.mx = Math.cos(a);
    p.input.my = Math.sin(a);
    p.dir = a;
    // если стоит на месте больше секунды — берём новую цель
    if (dist(before.x, before.y, p.x, p.y) < 0.05) {
      p.stuck = (p.stuck || 0) + dt;
      if (p.stuck > 1.2) { p.botGoal = this._randomRoomPoint(); p.stuck = 0; }
    } else p.stuck = 0;
  }

  /* ---------------- снимок ---------------- */
  snapshotFor(p) {
    const isImp = this.impostors.includes(p.id);
    const counts = {};
    for (const t of this.votes.values()) counts[t] = (counts[t] || 0) + 1;
    const finalCounts = {};
    for (const t of this.finalVotes.values()) finalCounts[t] = (finalCounts[t] || 0) + 1;
    const players = [...this.room.players.values()].map((q) => {
      const o = q.serialize();
      o.candle = Math.round(q.candle ?? 100);
      o.room = this.roomOf(q).name;
      o.cellared = !!q.cellared;
      o.takeProg = q.id === p.id ? clamp((q.takeProg || 0) / CFG.takeTime, 0, 1) : 0;
      return o;
    });
    return {
      world: {
        kind: 'inn',
        w: 44, h: 40,
        walls: this.walls,
        doors: this.doors.map((d) => ({ x: d.x, y: d.y, w: d.w, h: d.h, locked: d.locked, room: d.room })),
        rooms: this.rooms.map((r) => ({ id: r.id, name: r.name, x: r.x, y: r.y, w: r.w, h: r.h })),
        candles: this.commonCandles,
        bodies: this.bodies,
      },
      gs: {
        t: Math.round(this.t),
        phase: this.phase,
        cycle: this.cycle + 1,
        cycles: CFG.cycles,
        stage: this.stage,
        cycleLeft: Math.max(0, Math.round(CFG.cycleTime - this.cycleT)),
        voteOpen: this.voteOpen,
        voteLeft: this.voteOpen ? Math.max(0, Math.round(this.voteDeadline - this.t)) : 0,
        votes: counts,
        finalVotes: finalCounts,
        yourVote: p.vote,
        youImpostor: isImp,
        lockedRoom: this.lockedRoom,
        clues: p.clues || [],
        killToWin: this.killToWin,
        kills: this.kills,
        aliveCount: this._alive().length,
        results: this.results,
      },
      players,
    };
  }

  finalSummary() {
    return {
      kind: 'inn',
      winner: this.winner,
      text: this.results ? this.results.text : '',
      impostors: this.impostors,
      kills: this.kills,
    };
  }
}

module.exports = InnMode;
module.exports.CFG = CFG;
