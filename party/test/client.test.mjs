/* ============================================================
   Клиентский smoke-тест без браузера: jsdom + заглушка canvas.
   Проверяет, что app.js/net.js/ui.js/render.js реально работают
   на живых снимках всех трёх режимов: экраны, HUD, голосование,
   отрисовка кадра, финальный экран.
   ============================================================ */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const partyDir = path.resolve(here, '..');
const webDir = path.resolve(partyDir, '../web');

let JSDOM = null;
try {
  const reqWeb = createRequire(path.join(webDir, 'package.json'));
  ({ JSDOM } = reqWeb('jsdom'));
} catch {
  // jsdom берём из web/node_modules; если его нет — тест пропускается
}

const PORT = 3917;
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- заглушка 2d-контекста ---------------- */
function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    createPattern: () => ({}),
    measureText: () => ({ width: 24 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    drawImage: () => {},
  };
  return new Proxy(base, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === 'symbol') return undefined;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/* ---------------- окружение ---------------- */
let child = null;
const timers = new Set();
const rafQueue = [];
let errors = [];

async function startServer() {
  child = spawn(process.execPath, ['server.js'], {
    cwd: partyDir,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => errors.push('[server] ' + d.toString()));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(ORIGIN + 'health');
      if (r.ok) return;
    } catch { /* ещё поднимается */ }
    await sleep(120);
  }
  throw new Error('сервер не поднялся');
}

before(async () => { if (JSDOM) await startServer(); });

after(() => {
  for (const id of timers) { clearTimeout(id); clearInterval(id); }
  if (child) child.kill();
});

/* ---------------- общий «браузер» ---------------- */
function installBrowser() {
  const html = fs.readFileSync(path.join(partyDir, 'public/index.html'), 'utf8');
  const dom = new JSDOM(html, { url: ORIGIN + '?room=0000', pretendToBeVisual: false });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(); };
  Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });

  const g = globalThis;
  g.window = window;
  g.document = window.document;
  g.localStorage = window.localStorage;
  g.location = window.location;
  g.history = window.history;
  g.HTMLCanvasElement = window.HTMLCanvasElement;
  g.MouseEvent = window.MouseEvent;
  g.KeyboardEvent = window.KeyboardEvent;

  // rAF: складываем кадры в очередь, драйвим вручную
  g.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
  g.cancelAnimationFrame = () => {};

  // fetch: относительные адреса → на тестовый сервер
  const realFetch = globalThis.fetch.bind(globalThis);
  g.fetch = (url, opts) => realFetch(typeof url === 'string' && url.startsWith('/') ? ORIGIN + url.slice(1) : url, opts);

  // запоминаем таймеры, чтобы погасить их в конце
  const realSetTimeout = globalThis.setTimeout;
  const realSetInterval = globalThis.setInterval;
  g.setTimeout = (fn, ms, ...a) => { const id = realSetTimeout(fn, ms, ...a); timers.add(id); return id; };
  g.setInterval = (fn, ms, ...a) => { const id = realSetInterval(fn, ms, ...a); timers.add(id); return id; };

  window.addEventListener('error', (e) => errors.push('[window] ' + (e.error ? e.error.stack : e.message)));
  return dom;
}

let clock = 0;
function stepFrames(n = 2) {
  for (let i = 0; i < n; i++) {
    const batch = rafQueue.splice(0);
    for (const cb of batch) {
      clock += 16.7;
      try { cb(clock); } catch (e) { errors.push('[frame] ' + (e.stack || e)); }
    }
  }
}

async function waitFor(pred, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (pred()) return true;
    await sleep(50);
  }
  return false;
}

/* ============================================================
   1. UI на «синтетических» снимках: все три режима, голосование,
   финальный экран. Без сервера.
   ============================================================ */
test('UI: экраны, HUD, голосование и итог не падают и не печатают undefined', async (t) => {
  if (!JSDOM) return t.skip('jsdom не установлен');
  installBrowser();
  const { UI } = await import('../public/ui.js');
  clock = 0;
  const ui = new UI();
  const me = { id: 'p1', name: 'Я', color: '#f00' };
  const mk = (mode, gs, world, players = []) => ({
    code: '1234', mode, phase: 'play', you: 'p1', host: 'p1',
    gs, world, players: [{ id: 'p1', name: 'Я', color: '#f00', alive: true }, ...players],
  });

  // ---- Фонарщики, игра ----
  const lantern = mk('lantern', {
    phase: 'play', dawnIn: 420, voteIn: 0, lit: 3,
    fires: [], youShadow: false, shadowActive: true, shadows: {},
  }, {
    kind: 'lantern', cx: 36, cy: 36, r: 34,
    fires: [{ x: 36, y: 15, fuel: 88, lit: true }, { x: 57, y: 36, fuel: 0, lit: false },
      { x: 36, y: 57, fuel: 40, lit: true }, { x: 15, y: 36, fuel: 12, lit: true }],
    piles: [], trees: [], grabbers: [],
  }, [{ id: 'p2', name: 'Бот', alive: true, color: '#0f0', bot: true, charge: 12, logs: 1 }]);
  ui.renderHud(lantern, me);
  let text = document.getElementById('hud').textContent;
  assert.ok(!/undefined|NaN/.test(text), 'HUD фонарщиков: ' + text);
  assert.match(document.getElementById('hud-timer').textContent, /7:00/);

  // ---- Фонарщики, голосование ----
  ui.renderHud(mk('lantern', {
    phase: 'vote', dawnIn: 0, voteIn: 17, lit: 2, votes: { p2: 1 }, yourVote: 'p2',
  }, lantern.world, [{ id: 'p2', name: 'Бот', alive: true, color: '#0f0' }]), me);
  assert.ok(!document.getElementById('vote').classList.contains('hidden'), 'окно голосования открыто');
  assert.match(document.getElementById('vote').textContent, /17с/);
  assert.ok(document.querySelectorAll('#vote button[data-target]').length === 1);

  // ---- Эстафета ----
  ui.renderHud(mk('relay', {
    timeLeft: 300, youCarrier: false,
    lantern: { charge: 44, heldBy: 'p2', onGround: false, smash: 0 },
    collector: { dist: 21 }, shoutCooldown: 3,
  }, {
    kind: 'relay', w: 200, h: 64, chapelX: 182, fires: [], trees: [],
    water: { x0: 160, x1: 172 }, altar: { x: 186, y: 32 },
  }, [{ id: 'p2', name: 'Бот', alive: true, color: '#0f0' }]), me);
  text = document.getElementById('hud').textContent;
  assert.ok(!/undefined|NaN/.test(text), 'HUD эстафеты: ' + text);
  assert.match(text, /Бот/);
  assert.ok(document.getElementById('vote').classList.contains('hidden'), 'в эстафете нет голосования');

  // ---- Постоялый двор, записка обвинения ----
  const innWorld = {
    kind: 'inn', w: 44, h: 40,
    walls: [{ x: 10, y: 10, w: 4, h: 1 }],
    doors: [{ x: 12, y: 11, w: 1, h: 1, locked: true, room: 'larder' }],
    rooms: [{ id: 'hall', name: 'Общий зал', x: 14, y: 14, w: 16, h: 12 },
      { id: 'larder', name: 'Кладовая', x: 2, y: 2, w: 10, h: 10 }],
    candles: [{ x: 17, y: 17, lit: true }, { x: 27, y: 17, lit: true }],
    bodies: [{ x: 20, y: 20, name: 'Петя' }],
  };
  const inn = mk('inn', {
    cycle: 2, cycles: 5, cycleLeft: 40, voteOpen: true, voteLeft: 12,
    votes: { p2: 2 }, finalVotes: {}, yourVote: null, youImpostor: false,
    lockedRoom: 'larder', clues: ['Ты слышал шаги у кладовой.'], killToWin: 2, kills: 1, aliveCount: 3,
  }, innWorld, [
    { id: 'p2', name: 'Бот', alive: true, color: '#0f0' },
    { id: 'p3', name: 'Гость', alive: true, color: '#00f' },
    { id: 'p4', name: 'В подвале', alive: true, cellared: true, color: '#888' },
  ]);
  ui.renderHud(inn, me);
  text = document.getElementById('hud').textContent;
  assert.ok(!/undefined|NaN/.test(text), 'HUD двора: ' + text);
  assert.match(text, /Кладовая/);
  assert.equal(document.querySelectorAll('#vote button[data-target]').length, 2, 'подвальный не в списке');
  ui.toggleClues();
  ui.renderHud(inn, me);
  assert.ok(!document.getElementById('clues').classList.contains('hidden'), 'улики открыты');
  assert.match(document.getElementById('clues').textContent, /шаги/);

  // ---- финальное голосование ----
  const final = mk('inn', {
    cycle: 5, cycles: 5, cycleLeft: 0, voteOpen: true, voteLeft: 9, stage: 'finalvote',
    votes: {}, finalVotes: { p2: 1 }, yourVote: 'p1', youImpostor: false,
    lockedRoom: null, clues: [], killToWin: 2, kills: 2, aliveCount: 3,
  }, innWorld, [{ id: 'p2', name: 'Бот', alive: true, color: '#0f0' }]);
  ui.renderHud(final, me);
  assert.match(document.getElementById('vote').textContent, /НЕ ГОСТЬ/);

  // ---- итоги ----
  const cases = [
    ['lantern', { lit: 2, winners: ['p1'], losers: ['p2'] }],
    ['relay', { reason: 'altar', sacrifice: 'p2', text: 'Фонарь разбит.' }],
    ['inn', { winner: 'guests', text: 'Гости вычислили.', impostors: ['p2'], kills: 2 }],
    ['inn', { winner: 'impostor', text: 'Не гость победил.', impostors: ['p3'], kills: 3 }],
  ];
  for (const [mode, summary] of cases) {
    ui.showEnd({ code: '1234', mode, phase: 'end', you: 'p1', host: 'p1', summary, players: [
      { id: 'p1', name: 'Я' }, { id: 'p2', name: 'Бот' }, { id: 'p3', name: 'Гость' },
    ] }, me, () => {}, () => {});
    const t2 = document.getElementById('screen-end').textContent;
    assert.ok(!/undefined|NaN/.test(t2), 'итог ' + mode + ': ' + t2);
    assert.ok(!document.getElementById('screen-end').classList.contains('hidden'));
  }
  assert.ok(errors.length === 0, 'ошибок нет: ' + errors.join('\n'));
});

/* ============================================================
   2. Живой клиент: создаём комнату, добавляем ботов, стартуем и
   рисуем кадры на настоящих снимках — для каждого режима.
   ============================================================ */
test('Клиент: все три режима играются через app.js (jsdom)', async (t) => {
  if (!JSDOM) return t.skip('jsdom не установлен');
  errors = [];
  await import('../public/app.js');
  // boot() выполнил первый запрос комнат
  await waitFor(() => document.getElementById('net-state').textContent.includes('на связи'), 4000);

  for (const mode of ['lantern', 'relay', 'inn']) {
    // назад в меню
    document.getElementById('btn-leave').click();
    await sleep(350);
    stepFrames(3);

    const card = document.querySelector(`.mode-card[data-mode="${mode}"]`);
    assert.ok(card, 'есть карточка режима ' + mode);
    card.click();

    const inLobby = await waitFor(() => !document.getElementById('screen-lobby').classList.contains('hidden'), 4000);
    assert.ok(inLobby, mode + ': попали в лобби');
    assert.match(document.getElementById('lobby-mode').textContent, /[А-Я]/);

    // боты
    document.getElementById('btn-bot3').click();
    await sleep(400);
    document.getElementById('btn-bot').click();
    await sleep(400);
    const players = document.querySelectorAll('#lobby-players li').length;
    assert.ok(players >= 4, mode + ': в лобби есть боты, игроков ' + players);

    // старт
    document.getElementById('btn-start').click();
    const inGame = await waitFor(() => !document.getElementById('hud').classList.contains('hidden'), 5000);
    assert.ok(inGame, mode + ': игра началась');

    // несколько секунд реального времени, кадры дёргаем сами
    for (let i = 0; i < 12; i++) {
      await sleep(120);
      stepFrames(2);
    }
    const stats = document.getElementById('hud-stats').textContent;
    assert.ok(stats.trim().length > 0, mode + ': HUD заполнен');
    assert.ok(!/undefined|NaN/.test(stats), mode + ': HUD без дыр — ' + stats);
    assert.ok(!/undefined|NaN/.test(document.getElementById('hud-timer').textContent));
    assert.ok(!/undefined|NaN/.test(document.getElementById('hud-role').textContent));

    // нажмём кнопки ввода — не должно ломаться
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyD' }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { code: 'KeyE' }));
    await sleep(200);
    stepFrames(4);
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyD' }));
    window.dispatchEvent(new window.KeyboardEvent('keyup', { code: 'KeyE' }));

    assert.ok(errors.length === 0, mode + ': без ошибок — ' + errors.join('\n'));
  }

  // кадры в конце
  stepFrames(6);
  assert.ok(errors.length === 0, 'ошибок нет: ' + errors.join('\n'));
});
