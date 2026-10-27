'use strict';
/* ============================================================
   НОЧЬ ФОНАРЕЙ — сервер трёх режимов.
   Без зависимостей: статика + JSON API + авторитетный тик 20 Гц.
   Транспорт — HTTP-поллинг (15 Гц), чтобы работать через любой прокси.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { RoomManager, MODES } = require('./game/rooms');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC = path.join(__dirname, 'public');

const manager = new RoomManager();
const TICK_MS = 50;

/* ---------------- статика ---------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.join(PUBLIC, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(PUBLIC, 'index.html'), (e2, html) => {
        if (e2) { res.writeHead(404).end('not found'); return; }
        res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=60',
    });
    res.end(data);
  });
}

/* ---------------- JSON API ---------------- */
function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 200000) req.destroy();
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function auth(room, body) {
  if (!room) return { error: 'Комната не найдена' };
  const p = room.players.get(body.id);
  if (!p) return { error: 'Тебя нет в комнате' };
  if (!p.bot && p.token !== body.token) return { error: 'Неверный токен' };
  p.lastSeen = Date.now();
  p.connected = true;
  return { player: p };
}

async function api(req, res, pathname) {
  const body = await readBody(req);

  if (pathname === '/api/rooms') {
    return send(res, 200, { rooms: manager.list(), modes: Object.keys(MODES).map((k) => ({
      id: k, title: MODES[k].title, min: MODES[k].min, max: MODES[k].max,
    })) });
  }

  if (pathname === '/api/create') {
    const mode = String(body.mode || 'lantern');
    if (!MODES[mode]) return send(res, 400, { error: 'Неизвестный режим' });
    const room = manager.create(mode);
    const p = room.addPlayer(body.name || 'Хозяин');
    return send(res, 200, { code: room.code, id: p.id, token: p.token, mode });
  }

  if (pathname === '/api/join') {
    const room = manager.get(body.code);
    if (!room) return send(res, 404, { error: 'Комната не найдена. Проверь код.' });
    if (room.phase !== 'lobby') return send(res, 409, { error: 'Игра уже идёт' });
    if (room.players.size >= MODES[room.mode].max) return send(res, 409, { error: 'Комната полная' });
    const p = room.addPlayer(body.name || 'Гость');
    return send(res, 200, { code: room.code, id: p.id, token: p.token, mode: room.mode });
  }

  const room = manager.get(body.code);
  if (!room) return send(res, 404, { error: 'Комната не найдена' });

  if (pathname === '/api/ready') {
    const { player, error } = auth(room, body);
    if (error) return send(res, 400, { error });
    player.ready = !!body.ready;
    return send(res, 200, room.snapshotFor(player));
  }

  if (pathname === '/api/bot') {
    const { player, error } = auth(room, body);
    if (error) return send(res, 400, { error });
    const count = Math.max(1, Math.min(8, Number(body.count) || 1));
    for (let i = 0; i < count; i++) {
      if (room.players.size >= MODES[room.mode].max) break;
      room.addPlayer(null, true);
    }
    return send(res, 200, room.snapshotFor(player));
  }

  if (pathname === '/api/start') {
    const { player, error } = auth(room, body);
    if (error) return send(res, 400, { error });
    if (room.host !== player.id) return send(res, 403, { error: 'Начать может только хозяин' });
    if (room.players.size < MODES[room.mode].min) {
      return send(res, 409, { error: 'Нужно минимум ' + MODES[room.mode].min + ' игрока' });
    }
    room.start();
    return send(res, 200, room.snapshotFor(player));
  }

  if (pathname === '/api/restart') {
    const { player, error } = auth(room, body);
    if (error) return send(res, 400, { error });
    if (room.host !== player.id) return send(res, 403, { error: 'Перезапустить может только хозяин' });
    room.reset();
    return send(res, 200, room.snapshotFor(player));
  }

  if (pathname === '/api/sync') {
    const { player, error } = auth(room, body);
    if (error) return send(res, 400, { error });
    if (body.input) room.setInput(player.id, body.input);
    const acts = Array.isArray(body.actions) ? body.actions.slice(0, 6) : [];
    for (const act of acts) room.action(player.id, act);
    for (const q of room.players.values()) q.ready = q.bot ? true : q.ready;
    return send(res, 200, room.snapshotFor(player));
  }

  if (pathname === '/api/leave') {
    const { player } = auth(room, body);
    if (player) room.removePlayer(player.id);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Неизвестный запрос' });
}

/* ---------------- сервер ---------------- */
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const pathname = url.pathname;

  // превью-прокси: разрешаем любой origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

  if (pathname.startsWith('/api/')) {
    if (req.method !== 'POST' && pathname !== '/api/rooms') {
      return send(res, 405, { error: 'Только POST' });
    }
    api(req, res, pathname).catch((e) => {
      console.error('[api]', plan(e));
      try { send(res, 500, { error: 'Внутренняя ошибка' }); } catch { /* ignore */ }
    });
    return;
  }

  if (pathname === '/health') return send(res, 200, { ok: true, rooms: manager.rooms.size, uptime: process.uptime() });
  serveStatic(req, res, pathname);
});

function plan(e) { return (e && (e.stack || e.message)) || String(e); }

/* авторитетный тик */
setInterval(() => {
  try {
    manager.tick(TICK_MS / 1000);
  } catch (e) {
    console.error('[tick]', plan(e));
  }
}, TICK_MS);

server.listen(PORT, HOST, () => {
  console.log('НОЧЬ ФОНАРЕЙ · сервер на http://' + HOST + ':' + PORT);
  console.log('режимы: ' + Object.keys(MODES).join(', '));
});

process.on('uncaughtException', (e) => console.error('[uncaught]', plan(e)));
process.on('unhandledRejection', (e) => console.error('[rejection]', plan(e)));
