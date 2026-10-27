/* ============================================================
   Headless-симуляция всех трёх режимов: боты играют раунд.
   Запуск: node --test test/
   ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Room } = require('../game/rooms.js');
const LanternMode = require('../game/modes/lantern.js');
const RelayMode = require('../game/modes/relay.js');
const InnMode = require('../game/modes/inn.js');

function makeRoom(mode, bots) {
  const room = new Room('1234', mode);
  for (let i = 0; i < bots; i++) room.addPlayer('Бот' + i, true);
  const host = room.addPlayer('Хозяин', false);
  room.host = host.id;
  return { room, host };
}

function runPinned(room, seconds, pins, dt = 0.05) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    for (const { p, x, y } of pins) { p.x = x; p.y = y; }
    room.tick(dt);
  }
}

function run(room, seconds, dt = 0.05) {
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) room.tick(dt);
}

function assertSane(room) {
  for (const p of room.players.values()) {
    assert.ok(Number.isFinite(p.x), 'x is finite');
    assert.ok(Number.isFinite(p.y), 'y is finite');
  }
}

test('Фонарщики: полный раунд с ботами не падает и доходит до конца', () => {
  const { room, host } = makeRoom('lantern', 6);
  assert.equal(room.phase, 'lobby');
  assert.ok(room.start(), 'старт');
  assert.equal(room.phase, 'play');
  assert.ok(room.modeState.fires.length === 4, 'четыре костра');

  const botX = [...room.players.values()].find((p) => p.bot).x;
  room.players.get(host.id).input = { mx: 1, my: 0, act: false, sprint: false, aim: 0 };
  const startX = room.players.get(host.id).x;
  run(room, 20);
  assertSane(room);
  assert.notEqual(room.players.get(host.id).x, startX, 'игрок двигается по input');
  assert.ok([...room.players.values()].some((p) => p.bot && p.x !== botX), 'боты двигаются');

  // 10 минут + голосование
  run(room, 660);
  assertSane(room);
  assert.ok(['vote', 'result', 'end'].includes(room.modeState.phase) || room.phase === 'end',
    'дошли до рассвета: ' + room.modeState.phase);

  run(room, 40);
  assert.equal(room.phase, 'end', 'раунд завершён');
  assert.ok(room.summary, 'есть итог для экрана концовки');
  assert.equal(typeof room.summary.lit, 'number', 'итог знает, сколько костров дожило');
  assert.ok(Array.isArray(room.summary.winners), 'итог знает победителей');

  const snap = room.snapshotFor(room.players.get(host.id));
  const json = JSON.stringify(snap);
  assert.ok(json.length > 500, 'снимок не пустой');
  assert.ok(snap.world.fires.length === 4);
  assert.ok(Array.isArray(snap.players));
});

test('Фонарщики: Тень появляется, гаснет свет и её ловят лучом', () => {
  const { room, host } = makeRoom('lantern', 4);
  room.start();
  const st = room.modeState;
  run(room, 62);
  assert.ok(st.shadow, 'тень назначена к 62-й секунде');
  const shadowPlayer = room.players.get(st.shadow.id);
  assert.equal(shadowPlayer.role, 'shadow');
  assert.equal(shadowPlayer.lanternOn, false, 'у тени гаснет фонарь');
  assert.ok(st.shadow.until > st.t, 'тень активна');

  // светящий фонарщик встаёт слева от тени и смотрит на восток
  let catcher = room.players.get(host.id);
  if (catcher.id === shadowPlayer.id) {
    catcher = [...room.players.values()].find((p) => p.id !== shadowPlayer.id && p.alive);
    catcher.bot = false; // выключаем ботоводство, чтобы он стоял на месте
  }
  catcher.alive = true;
  catcher.x = shadowPlayer.x - 3;
  catcher.y = shadowPlayer.y;
  catcher.lanternOn = true;
  catcher.charge = 100;
  catcher.dir = 0;
  catcher.input.mx = 0; catcher.input.my = 0; catcher.input.act = false;
  room.setInput(catcher.id, { mx: 0, my: 0, aim: 0 });   // как будто мышью целимся в тень

  // тень стоит на месте
  shadowPlayer.input.mx = 0; shadowPlayer.input.my = 0;
  run(room, 1.0);
  assert.ok(st.shadow === null || st.shadow.catchProg > 0, 'ловля лучом идёт: ' + JSON.stringify(st.shadow));
  run(room, 2.0);
  assert.ok(st.shadow === null || st.shadow.id !== shadowPlayer.id, 'тень поймана или отпущена');
  assertSane(room);
});

test('Эстафета света: фонарь передаётся, Собиратель идёт, финал срабатывает', () => {
  const { room, host } = makeRoom('relay', 5);
  room.start();
  const st = room.modeState;
  assert.ok(st.lantern.heldBy, 'фонарь у кого-то в руках');

  const carrier = room.players.get(st.lantern.heldBy);
  // ставим второго рядом и передаём
  const other = [...room.players.values()].find((p) => p.id !== carrier.id);
  other.x = carrier.x + 1; other.y = carrier.y;
  room.action(carrier.id, { t: 'pass' });
  assert.equal(st.lantern.heldBy, other.id, 'фонарь передан');

  run(room, 30);
  assertSane(room);
  assert.ok(Number.isFinite(st.collector.x), 'Собиратель двигается');

  // телепортируем носителя к алтарю и держим действие
  const c2 = room.players.get(st.lantern.heldBy);
  c2.x = RelayMode.CFG.world.chapelX + 1;
  c2.y = 32;
  c2.input.act = true;
  run(room, 8);
  assert.equal(room.phase, 'end', 'раунд закончился');
  assert.ok(room.modeState.reason, 'есть причина финала');
  const snap = room.snapshotFor(room.players.get(host.id));
  assert.ok(snap.gs.lantern, 'снимок содержит фонарь');
});

test('Постоялый двор: роли выданы, убийство и голосование работают', () => {
  const { room, host } = makeRoom('inn', 6);
  room.start();
  const st = room.modeState;
  assert.equal(st.impostors.length, 1, 'один не гость');
  assert.ok(st.walls.length > 20, 'стены построены');
  assert.ok(st.rooms.length === 9, 'девять комнат');

  run(room, 30);
  assertSane(room);

  // «не гость» рядом с жертвой, свидетелей нет
  const imp = room.players.get(st.impostors[0]);
  imp.bot = false;                      // управляем им вручную
  const victim = [...room.players.values()].find((p) => p.id !== imp.id && !st.impostors.includes(p.id));
  const pins = [
    { p: imp, x: 22, y: 20 },
    { p: victim, x: 22.6, y: 20.2 },
  ];
  for (const p of room.players.values()) {
    if (p.id !== imp.id && p.id !== victim.id) pins.push({ p, x: 5, y: 5 });
  }
  imp.input.act = true;
  runPinned(room, 5.5, pins);
  assert.equal(imp.input.act, true, 'кнопка действия не сброшена');
  const dbg = {
    stage: st.stage, cycleT: +st.cycleT.toFixed(1), take: +imp.takeProg.toFixed(2),
    act: imp.input.act, dist: +Math.hypot(imp.x - victim.x, imp.y - victim.y).toFixed(2),
    impPos: [+imp.x.toFixed(1), +imp.y.toFixed(1)], vPos: [+victim.x.toFixed(1), +victim.y.toFixed(1)],
    cellared: [imp.cellared, victim.cellared], done: [imp.done, victim.done],
    alive: [imp.alive, victim.alive], impostors: st.impostors, impId: imp.id, vId: victim.id,
    room: st.roomOf(imp).name,
  };
  assert.equal(victim.alive, false, 'жертва забрана: ' + JSON.stringify(dbg));
  assert.ok(st.bodies.length === 1, 'тело осталось');

  // добиваем до рассвета
  run(room, 420);
  assertSane(room);
  assert.equal(room.phase, 'end', 'раунд завершён');
  assert.ok(['guests', 'impostor'].includes(st.winner), 'есть победитель');

  const snap = room.snapshotFor(room.players.get(host.id));
  assert.ok(snap.world.walls.length > 20);
  assert.ok(Array.isArray(snap.gs.clues));
});

test('Постоялый двор: двери запираются и комнаты объявляются', () => {
  const { room } = makeRoom('inn', 5);
  room.start();
  const st = room.modeState;
  run(room, 14);
  assert.ok(st.lockedRoom, 'комната заперта к 14-й секунде');
  const locked = st.doors.filter((d) => d.locked);
  assert.ok(locked.length > 0, 'есть запертые двери');
  assert.ok(locked.every((d) => d.room === st.lockedRoom), 'заперта именно та комната');
});

test('Снимки всех режимов сериализуются и не содержат NaN', () => {
  for (const mode of ['lantern', 'relay', 'inn']) {
    const { room, host } = makeRoom(mode, 4);
    room.start();
    run(room, 12);
    const snap = room.snapshotFor(room.players.get(host.id));
    const json = JSON.stringify(snap);
    assert.ok(!json.includes('null,"x"'), 'нет битых координат');
    assert.ok(!/NaN|Infinity/.test(json), 'нет NaN/Infinity в ' + mode);
    assert.ok(snap.gs && snap.world, 'есть gs и world');
  }
});
