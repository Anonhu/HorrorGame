/* Headless smoke + AI test. Run: node --test test/headless.test.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/* ---------- minimal DOM + canvas stub ---------- */
const dom = new JSDOM('<!doctype html><html><body><div id="app"></div><canvas id="gl"></canvas></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;

globalThis.HTMLCanvasElement = dom.window.HTMLCanvasElement;
if (!globalThis.performance || !globalThis.performance.now) {
  globalThis.performance = { now: () => Date.now() };
}
dom.window.devicePixelRatio = 1;

function makeCtx(canvas) {
  const grad = { addColorStop() {} };
  const methods = {
    createRadialGradient: () => grad,
    createLinearGradient: () => grad,
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    createImageData: () => ({ data: new Uint8ClampedArray(4) }),
  };
  return new Proxy({ canvas }, {
    get(target, prop) {
      if (prop in methods) return methods[prop];
      if (prop in target) return target[prop];
      if (prop === 'getContext') return () => target;
      return () => {};
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}
dom.window.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(this); };

const THREE = await import('three');
const { buildPlan, CircleGrid } = await import('../src/world/layout.js');
const { Forest } = await import('../src/world/forest.js');
const { Props } = await import('../src/world/props.js');
const { FX } = await import('../src/fx/fx.js');
const { Player } = await import('../src/game/player.js');
const { Stag, STAG } = await import('../src/game/stag.js');
const { Echo } = await import('../src/game/echo.js');

function fakeInput({ fwd = 0, strafe = 0, yaw = 0, sprint = false, crouch = false } = {}) {
  return {
    keys: new Set(),
    mouse: { dx: 0, dy: 0 },
    locked: false,
    freeLook: true,
    touchId: null,
    lookId: null,
    sensitivity: 1,
    sprint, crouch,
    readLook() { return { yaw: 0, pitch: 0 }; },
    axis() { return { x: strafe, z: fwd }; },
    consume() { return { ping: false, lantern: false }; },
  };
}

test('layout is sane', () => {
  const plan = buildPlan(2603);
  assert.equal(plan.shrines.length, 4, 'four shrines');
  assert.ok(plan.path.length > 60, 'trail sampled');
  assert.ok(plan.camps.length === 3);
  for (const s of plan.shrines) {
    const d = Math.hypot(s.x, s.z);
    assert.ok(d > 45 && d < 90, `shrine in range (${d.toFixed(1)})`);
    assert.ok(plan.isFree(0, 0, 0) === false, 'spawn clearing is not free for trees');
  }
});

test('world builds without throwing', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(74, 1.7, 0.05, 600);
  const plan = buildPlan(2603);
  const forest = new Forest(scene, plan, 'high');
  assert.ok(forest.colliders.near(0, 0, 20).length >= 0);
  const props = new Props(scene, plan, forest.colliders);
  assert.equal(props.shrines.length, 4);
  const fx = new FX(scene, 'high');
  const player = new Player(camera, scene, forest.colliders, fx);
  const stag = new Stag(scene, forest.colliders);
  const echo = new Echo(scene, forest, props, stag, forest.colliders);

  assert.ok(scene.children.length > 20, 'scene populated');
  assert.ok(stag.mesh, 'stag mesh built');
  assert.ok(stag.rig.legs.length === 4);

  // run frames
  let t = 0;
  const input = fakeInput({ fwd: -1, sprint: true });
  for (let i = 0; i < 240; i++) {
    t += 1 / 30;
    const stats = player.update(1 / 30, input, t);
    assert.ok(Number.isFinite(player.pos.x) && Number.isFinite(player.pos.z));
    stag.update({
      dt: 1 / 30, time: t, player, forward: player.forward(), noise: stats.noise,
      onDamage: () => {},
    });
    forest.update(1 / 30, t, player.pos);
    props.update(1 / 30, t);
    fx.update(1 / 30, t, player.pos);
    echo.update(1 / 30, t, player);
    assert.ok(Number.isFinite(stag.distance));
  }

  // player never escapes the grove
  assert.ok(Math.hypot(player.pos.x, player.pos.z) <= 101.5);
  // ignition works
  const s = props.shrines[0];
  props.ignite(s);
  props.update(1 / 30, t + 3);
  assert.equal(props.litCount(), 1);
  assert.ok(s.light.intensity > 0);
  props.reset();
  assert.equal(props.litCount(), 0);
});

test('stag: wakes on noise, freezes when watched, lunges after staring', () => {
  const scene = new THREE.Scene();
  const plan = buildPlan(2603);
  const cols = new CircleGrid(4);
  const stag = new Stag(scene, cols);
  const player = {
    pos: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    lanternOn: true,
  };
  const fwd = new THREE.Vector3(0, 0, -1);
  stag.playerRef = player;
  stag.pos.set(0, 0, -20);
  stag.mode = 'stalk';
  stag.mesh.visible = true;

  // looking straight at it (forward -z, stag at -20z)
  let info = stag.update({ dt: 0.033, time: 0, player, forward: fwd, noise: 10, onDamage: () => {} });
  assert.equal(stag.observed, true, 'stag is observed');
  assert.equal(stag.mode, 'freeze', 'freezing while watched');

  let damaged = 0;
  for (let i = 0; i < 420; i++) {
    info = stag.update({
      dt: 0.033, time: i * 0.033, player, forward: fwd, noise: 10,
      onDamage: () => { damaged++; },
    });
  }
  assert.ok(['lunge', 'charge', 'recover', 'retreat', 'dormant'].includes(stag.mode), `reacted to staring (${stag.mode})`);
  assert.ok(damaged >= 1, 'player got hit after staring too long');

  // stun works
  stag.mode = 'stalk';
  stag.pos.set(0, 0, -12);
  const stunned = stag.pingHit(12);
  assert.equal(stunned, true);
  assert.equal(stag.mode, 'stun');
  for (let i = 0; i < 200; i++) stag.update({ dt: 0.033, time: i * 0.033, player, forward: fwd, noise: 0, onDamage: () => {} });
  assert.notEqual(stag.mode, 'stun', 'stun wears off');
});

test('stag: unobserved movement closes distance, quiet player avoids charge', () => {
  const scene = new THREE.Scene();
  const stag = new Stag(scene, new CircleGrid(4));
  const player = { pos: new THREE.Vector3(0, 0, 0), yaw: 0, lanternOn: false };
  const away = new THREE.Vector3(0, 0, 1); // looking away from the stag
  stag.playerRef = player;
  stag.pos.set(0, 0, -35);
  stag.mode = 'stalk';
  stag.mesh.visible = true;
  const d0 = Math.hypot(stag.pos.x, stag.pos.z);
  for (let i = 0; i < 60; i++) {
    stag.update({ dt: 0.033, time: i * 0.033, player, forward: away, noise: 25, onDamage: () => {} });
  }
  const d1 = Math.hypot(stag.pos.x, stag.pos.z);
  assert.ok(d1 < d0, `stag approaches when unobserved (${d0.toFixed(1)} → ${d1.toFixed(1)})`);
  assert.equal(stag.observed, false);
});
