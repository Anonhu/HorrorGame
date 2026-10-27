/* ============================================================
   Склейка: меню → лобби → игра → итог.
   ============================================================ */
import { api, listRooms, Net } from './net.js';
import { Input } from './input.js';
import { Renderer } from './render.js';
import { UI, MODE_TITLES } from './ui.js';

const $ = (id) => document.getElementById(id);

const state = {
  screen: 'menu',
  me: null,          // {id, token, name, code, mode}
  snap: null,
  view: null,        // предсказанная позиция себя
  endShown: false,
  lastPhase: 'lobby',
};

const input = new Input($('cv'));
const renderer = new Renderer($('cv'));
const ui = new UI();

const net = new Net(onSnapshot, (msg) => ui.netError(msg));

/* ============================================================
   старт
   ============================================================ */
async function boot() {
  const saved = localStorage.getItem('nf:name');
  if (saved) $('inp-name').value = saved;
  ui.renderRules();
  const params = new URLSearchParams(location.search);
  if (params.get('room')) $('inp-code').value = params.get('room');

  input.onAction = (type) => {
    if (state.screen !== 'game' || !state.me) return;
    if (type === 'clues') { ui.toggleClues(); return; }
    if (type === 'lantern') { net.queue({ t: 'toggleLantern' }); return; }
    if (type === 'pass') { net.queue({ t: 'pass' }); return; }
    if (type === 'shout') { net.queue({ t: 'shout' }); return; }
  };

  ui.onVote = (target, type) => {
    net.queue({ t: type, target });
  };

  try {
    const info = await listRooms();
    ui.renderRooms(info.rooms || []);
    ui.setNetState('● сервер на связи');
  } catch {
    ui.setNetState('● сервер недоступен', true);
  }
  setInterval(async () => {
    if (state.screen !== 'menu') return;
    try {
      const info = await listRooms();
      ui.renderRooms(info.rooms || []);
      ui.setNetState('● сервер на связи');
    } catch { ui.setNetState('● сервер недоступен', true); }
  }, 4000);

  wireMenu();
  setTimeout(() => ui.hideBoot(), 400);
  requestAnimationFrame(frame);
}

/* ============================================================
   меню
   ============================================================ */
function myName() {
  const v = ($('inp-name').value || '').trim().slice(0, 16) || 'Фонарщик';
  localStorage.setItem('nf:name', v);
  return v;
}

function wireMenu() {
  document.querySelectorAll('.mode-card').forEach((card) => {
    card.onclick = async () => {
      try {
        const res = await api('/api/create', { name: myName(), mode: card.dataset.mode });
        enterRoom(res);
      } catch (e) { ui.netError(e.message); }
    };
  });

  $('btn-join').onclick = async () => {
    const code = ($('inp-code').value || '').trim();
    if (!code) { ui.netError('введи код комнаты'); return; }
    try {
      const res = await api('/api/join', { name: myName(), code });
      enterRoom(res);
    } catch (e) { ui.netError(e.message); }
  };

  $('rooms').onclick = (e) => {
    const btn = e.target.closest('.room-pill');
    if (btn) {
      $('inp-code').value = btn.dataset.code;
      $('btn-join').click();
    }
  };

  $('btn-rules').onclick = () => { ui.setScreen('rules'); state.screen = 'rules'; };
  $('btn-rules-back').onclick = () => { ui.setScreen('menu'); state.screen = 'menu'; };

  $('btn-leave').onclick = async () => {
    if (state.me) await api('/api/leave', state.me).catch(() => {});
    net.stop();
    state.me = null; state.snap = null; state.screen = 'menu';
    ui.setScreen('menu');
  };

  $('btn-ready').onclick = async () => {
    if (!state.me) return;
    const mine = state.snap?.players.find((p) => p.id === state.me.id);
    await api('/api/ready', { ...state.me, ready: !(mine && mine.ready) }).catch((e) => ui.netError(e.message));
  };

  $('btn-bot').onclick = () => addBots(1);
  $('btn-bot3').onclick = () => addBots(3);

  $('btn-start').onclick = async () => {
    if (!state.me) return;
    try { await api('/api/start', state.me); } catch (e) { ui.netError(e.message); }
  };

  $('btn-share').onclick = share;
  $('btn-copy').onclick = share;
  $('btn-again').onclick = async () => {
    if (!state.me) return;
    try { await api('/api/restart', state.me); state.endShown = false; } catch (e) { ui.netError(e.message); }
  };
  $('btn-menu').onclick = () => { location.href = '/'; };
}

async function addBots(n) {
  if (!state.me) return;
  try { await api('/api/bot', { ...state.me, count: n }); } catch (e) { ui.netError(e.message); }
}

async function share() {
  const url = location.origin + '/?room=' + (state.me ? state.me.code : '');
  try {
    await navigator.clipboard.writeText(url);
    ui.toast('Ссылка скопирована: ' + url, 'good');
  } catch {
    ui.toast('Ссылка: ' + url, 'info');
    $('share-link').select?.();
  }
}

function enterRoom(res) {
  state.me = {
    id: res.id, token: res.token, code: res.code, mode: res.mode,
    name: ($('inp-name').value || '').trim() || 'Гость',
  };
  net.setRoom(state.me);
  net.inputProvider = () => {
    if (state.screen !== 'game' || !state.view) return { mx: 0, my: 0, act: false, sprint: false };
    return input.state(renderer.screenOf(state.view.x, state.view.y));
  };
  net.start(160);
  state.screen = 'lobby';
  ui.setScreen('lobby');
  history.replaceState(null, '', '/?room=' + res.code);
}

/* ============================================================
   снимки состояния
   ============================================================ */
function onSnapshot(snap) {
  if (!state.me) return;
  state.snap = snap;

  // события для игрока
  for (const ev of snap.events || []) handleEvent(ev, snap);

  if (snap.phase === 'lobby') {
    if (state.screen !== 'lobby') {
      state.screen = 'lobby';
      ui.setScreen('lobby');
    }
    net.rate = 160;
    ui.renderLobby(snap, state.me);
    state.endShown = false;
    state.view = null;
  } else if (snap.phase === 'end') {
    if (state.screen === 'game') ui.renderHud(snap, state.me);
    if (!state.endShown) {
      state.endShown = true;
      setTimeout(() => ui.showEnd(snap, state.me, async () => {
        try { await api('/api/restart', state.me); } catch (e) { ui.netError(e.message); }
      }, () => { location.href = '/'; }), 900);
    }
  } else {
    if (state.screen !== 'game') {
      state.screen = 'game';
      ui.setScreen('game');
      const me = snap.players.find((p) => p.id === state.me.id);
      state.view = me ? { x: me.x, y: me.y } : null;
      const hints = {
        lantern: 'несите дрова, кормите костры, держите фонари заряженными',
        relay: 'фонарь один: донесите его до часовни и разбейте у алтаря',
        inn: 'свечи гаснут. слушайте, кто где был',
      };
      ui.banner('РАУНД НАЧАЛСЯ', MODE_TITLES[snap.mode] || '', hints[snap.mode] || '', 3600);
    }
    net.rate = 66;
    if (!state.view) {
      const me = snap.players.find((p) => p.id === state.me.id);
      state.view = me ? { x: me.x, y: me.y } : { x: 0, y: 0 };
    }
    ui.renderHud(snap, state.me);
  }
  state.lastPhase = snap.phase;
}

function handleEvent(ev, snap) {
  switch (ev.type) {
    case 'toast': ui.toast(ev.text, ev.kind || 'info'); break;
    case 'role':
      if (ev.role === 'shadow') ui.banner('РОЛЬ', 'ТЫ — ТЕНЬ', 'у тебя 30 секунд. погаси костёр', 4000);
      if (ev.role === 'impostor') ui.banner('РОЛЬ', 'ТЫ — НЕ ГОСТЬ', 'забирай гостей, когда рядом никого', 5000);
      if (ev.role === 'keeper') ui.banner('ВОЗВРАТ', 'ТЫ СНОВА ФОНАРЩИК', 'свет вернулся', 2200);
      break;
    case 'dead': ui.banner('КОНЕЦ', 'ТЕБЯ ЗАБРАЛИ', ev.text || ev.reason || 'теперь ты только смотришь', 3500); break;
    case 'dawn': ui.banner('РАССВЕТ', 'КОСТРОВ: ' + ev.lit, 'мост выдержит ' + ev.bridge, 4000); break;
    case 'clue': ui.showClueFlash(); ui.toast(ev.text || 'новая улика (V)', 'info'); break;
    case 'body': ui.toast('тело найдено: ' + ev.name, 'warn'); break;
    case 'shout': ui.toast((ev.name || 'Кто-то') + ' кричит где-то рядом', 'info'); break;
    case 'grabbed': ui.banner('ТЯНУТ', 'ТЕБЯ ДЕРЖАТ', 'напарник может тебя вытащить светом', 2500); break;
  }
}

/* ============================================================
   игровой цикл
   ============================================================ */
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (state.screen !== 'game' || !state.snap || !state.snap.world) return;

  predict(dt);
  renderer.render(state.snap, state.me.id, state.view, dt);
}

/** лёгкое предсказание своей позиции: отзывчиво на 100мс сети */
function predict(dt) {
  const snap = state.snap;
  const me = snap.players.find((p) => p.id === state.me.id);
  if (!me || !state.view) return;
  if (me.alive === false || me.held) {
    state.view.x = me.x; state.view.y = me.y;
    return;
  }

  const inp = input.state();
  let speed = 4.3;
  if (snap.mode === 'lantern') {
    const mine = snap.players.find((p) => p.id === state.me.id) || {};
    const shadow = snap.gs && snap.gs.youShadow;
    speed = (inp.sprint ? 6.4 : 4.3) * (shadow ? 1.25 : 1);
  } else if (snap.mode === 'relay') {
    const carrier = snap.gs && snap.gs.youCarrier;
    speed = carrier ? (inp.sprint ? 5.2 : 3.7) : (inp.sprint ? 6.4 : 4.3);
  } else {
    speed = 4.0;
  }
  if (me.cellared) speed = 0;

  state.view.x += inp.mx * speed * dt;
  state.view.y += inp.my * speed * dt;

  // мягкая коррекция к серверу
  const dx = me.x - state.view.x;
  const dy = me.y - state.view.y;
  const d = Math.hypot(dx, dy);
  if (d > 3.5) { state.view.x = me.x; state.view.y = me.y; }
  else {
    const k = 1 - Math.exp(-dt * 6);
    state.view.x += dx * k;
    state.view.y += dy * k;
  }
}

boot();
