'use strict';
/* ============================================================
   Комнаты, игроки, тик-луп. Режимы подключаются как плагины.
   ============================================================ */

const crypto = require('crypto');
const { clamp, rand } = require('./util');

const MODES = {
  lantern: { title: 'ФОНАРЩИКИ', min: 2, max: 16, ctor: () => require('./modes/lantern') },
  relay: { title: 'ЭСТАФЕТА СВЕТА', min: 2, max: 16, ctor: () => require('./modes/relay') },
  inn: { title: 'ПОСТОЯЛЫЙ ДВОР', min: 3, max: 16, ctor: () => require('./modes/inn') },
};

const COLORS = [
  '#ffb066', '#7fe3d6', '#ff8a7a', '#c6a8ff', '#a8e07a', '#ffd166',
  '#8fd0ff', '#ff9ecd', '#b8b2a1', '#7affc4', '#ffc4a3', '#9fa8ff',
  '#e0e07a', '#7ad1ff', '#ff7ad1', '#c4ff9f',
];

const NAMES_A = ['Тихий', 'Косой', 'Рыжий', 'Хмурый', 'Полый', 'Бледный', 'Кривой', 'Слепой'];
const NAMES_B = ['Фонарщик', 'Гость', 'Сторож', 'Мальчик', 'Вдова', 'Пекарь', 'Егерь', 'Звонарь'];

let idSeq = 1;

function makeToken() { return crypto.randomBytes(8).toString('hex'); }

class Player {
  constructor(name, isBot = false) {
    this.id = 'p' + (idSeq++);
    this.token = isBot ? null : makeToken();
    this.name = (name || '').slice(0, 16) || 'Гость';
    this.color = COLORS[(idSeq - 1) % COLORS.length];
    this.bot = isBot;
    this.ready = isBot;
    this.alive = true;
    this.connected = true;
    this.lastSeen = Date.now();
    this.input = { mx: 0, my: 0, act: false, sprint: false, aim: 0 };
    this.x = 0; this.y = 0; this.dir = 0;
    this.events = [];
    this.stats = { shadow: 0, ignites: 0, catches: 0, votes: 0 };
    this.role = null;
    this.held = null;   // 'lantern' для эстафеты
  }

  push(type, data = {}) {
    this.events.push({ type, ...data });
    if (this.events.length > 24) this.events.shift();
  }

  serialize() {
    return {
      id: this.id, name: this.name, color: this.color, bot: this.bot,
      ready: this.ready, alive: this.alive, connected: this.connected,
      x: Math.round(this.x * 10) / 10, y: Math.round(this.y * 10) / 10,
      dir: Math.round(this.dir * 100) / 100,
    };
  }
}

class Room {
  constructor(code, mode) {
    this.code = code;
    this.mode = mode;
    this.title = MODES[mode].title;
    this.players = new Map();
    this.phase = 'lobby';          // lobby | play | vote | end
    this.host = null;
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
    this.modeState = null;
    this.tickCount = 0;
    this.winner = null;
    this.chat = [];
  }

  get size() { return this.players.size; }
  get alivePlayers() { return [...this.players.values()].filter((p) => p.alive); }

  addPlayer(name, isBot = false) {
    if (this.players.size >= MODES[this.mode].max) return null;
    const p = new Player(name, isBot);
    if (isBot) p.name = (name || NAMES_A[(Math.random() * NAMES_A.length) | 0] + ' ' +
      NAMES_B[(Math.random() * NAMES_B.length) | 0]).split(' ')[0] + ' ' +
      (NAMES_B[(Math.random() * NAMES_B.length) | 0]);
    this.players.set(p.id, p);
    if (!this.host) this.host = p.id;
    this.lastActivity = Date.now();
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.phase === 'lobby') {
      this.players.delete(id);
    } else {
      p.connected = false;
      p.alive = false;
      p.done = true;
    }
    if (this.host === id) {
      const next = [...this.players.values()].find((q) => !q.bot && q.connected);
      this.host = next ? next.id : null;
    }
    this.lastActivity = Date.now();
  }

  canStart() {
    const humans = [...this.players.values()].filter((p) => !p.bot);
    const total = this.players.size;
    return humans.length >= 1 &&
      total >= MODES[this.mode].min &&
      [...this.players.values()].every((p) => p.ready || p.bot);
  }

  start() {
    if (this.phase !== 'lobby') return false;
    const spec = MODES[this.mode];
    if (this.players.size < spec.min) return false;
    const Mode = spec.ctor();
    this.modeState = new Mode(this);
    this.phase = 'play';
    this.lastActivity = Date.now();
    for (const p of this.players.values()) {
      p.alive = true;
      p.events = [];
    }
    this.modeState.start();
    return true;
  }

  setInput(id, input) {
    const p = this.players.get(id);
    if (!p) return;
    p.lastSeen = Date.now();
    p.connected = true;
    p.input.mx = clamp(Number(input.mx) || 0, -1, 1);
    p.input.my = clamp(Number(input.my) || 0, -1, 1);
    if (Math.hypot(p.input.mx, p.input.my) > 1) {
      const l = Math.hypot(p.input.mx, p.input.my);
      p.input.mx /= l; p.input.my /= l;
    }
    p.input.act = !!input.act;
    p.input.sprint = !!input.sprint;
    if (Number.isFinite(input.aim)) p.input.aim = input.aim;
    const dx = p.input.mx, dy = p.input.my;
    if (Number.isFinite(p.input.aim)) p.dir = p.input.aim;
    else if (Math.hypot(dx, dy) > 0.15) p.dir = Math.atan2(dy, dx);
    this.lastActivity = Date.now();
  }

  action(id, act) {
    const p = this.players.get(id);
    if (!p || !this.modeState) return;
    if (this.modeState.action) this.modeState.action(p, act || {});
  }

  tick(dt) {
    this.tickCount++;
    // если человек молчит дольше 2 секунд — не двигаем его (закрыл вкладку)
    if (this.phase === 'play') {
      const now = Date.now();
      for (const p of this.players.values()) {
        if (p.bot || now - p.lastSeen < 2000) continue;
        p.input.mx = 0; p.input.my = 0; p.input.act = false;
      }
    }
    // боты: отключаем, если игра не идёт
    if (this.modeState && this.phase !== 'lobby') {
      if (this.modeState.botThink) {
        for (const p of this.players.values()) {
          if (p.bot && p.alive) this.modeState.botThink(p, dt);
        }
      }
      this.modeState.update(dt);
      if (this.modeState.done) this.finish(this.modeState.winner);
    }
    // выкидываем давно отключившихся людей из лобби
    if (this.phase === 'lobby') {
      for (const p of [...this.players.values()]) {
        if (!p.bot && Date.now() - p.lastSeen > 25000) this.removePlayer(p.id);
      }
    }
  }

  reset() {
    this.phase = 'lobby';
    this.modeState = null;
    this.winner = null;
    this.summary = null;
    this.endedAt = 0;
    for (const p of this.players.values()) {
      p.alive = true;
      p.done = false;
      p.ready = p.bot;
      p.role = null;
      p.held = null;
      p.cellared = false;
      p.charge = 100;
      p.logs = 0;
      p.events = [];
      p.input = { mx: 0, my: 0, act: false, sprint: false, aim: 0 };
    }
    this.lastActivity = Date.now();
  }

  finish(winner) {
    if (this.phase === 'end') return;
    this.phase = 'end';
    this.winner = winner || null;
    this.endedAt = Date.now();
    if (this.modeState && this.modeState.finalSummary) {
      this.summary = this.modeState.finalSummary();
    }
  }

  snapshotFor(p) {
    const base = {
      code: this.code,
      mode: this.mode,
      title: this.title,
      phase: this.phase,
      host: this.host,
      you: p.id,
      serverTime: Date.now(),
      players: [...this.players.values()].map((q) => q.serialize()),
      events: p.events.splice(0),
      winner: this.winner,
      summary: this.summary || null,
    };
    if (this.modeState && this.modeState.snapshotFor) {
      Object.assign(base, this.modeState.snapshotFor(p));
    }
    return base;
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.lastGc = Date.now();
  }

  create(mode) {
    if (!MODES[mode]) return null;
    let code;
    do {
      code = String(Math.floor(1000 + Math.random() * 9000));
    } while (this.rooms.has(code));
    const room = new Room(code, mode);
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get(String(code || '').trim()); }

  list() {
    return [...this.rooms.values()]
      .filter((r) => r.phase === 'lobby' && r.players.size < MODES[r.mode].max)
      .map((r) => ({ code: r.code, mode: r.mode, title: r.title, players: r.players.size, max: MODES[r.mode].max }));
  }

  /** единый тик на все комнаты */
  tick(dt) {
    for (const room of this.rooms.values()) room.tick(dt);
    const now = Date.now();
    if (now - this.lastGc > 5000) {
      this.lastGc = now;
      for (const [code, room] of this.rooms) {
        const idle = now - room.lastActivity;
        const empty = room.players.size === 0;
        const staleEnd = room.phase === 'end' && now - (room.endedAt || 0) > 90000;
        if (empty || (room.phase === 'lobby' && idle > 600000) || idle > 1800000 || staleEnd) {
          this.rooms.delete(code);
        }
      }
    }
  }
}

module.exports = { RoomManager, Room, MODES, COLORS, NAMES_A, NAMES_B, rand };
