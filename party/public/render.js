/* ============================================================
   Рендер: тёмный top-down мир с настоящим тьмой-маской.
   Свет вырезается из слоя темноты — это и есть главный приём.
   ============================================================ */

const AMBER = '#ffb066';
const EMBER = '#e0562f';
const SPECTRE = '#6fe3d6';
const BONE = '#efe6d2';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cam = { x: 0, y: 0, scale: 28 };
    this.smooth = new Map();
    this.time = 0;
    this.shake = 0;
    this.dark = document.createElement('canvas');
    this.darkCtx = this.dark.getContext('2d');
    this.fog = [];
    for (let i = 0; i < 90; i++) {
      this.fog.push({ x: Math.random(), y: Math.random(), p: Math.random() * 6.28, s: .4 + Math.random() });
    }
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.w = w; this.h = h;
    this.cv.width = Math.floor(w * this.dpr);
    this.cv.height = Math.floor(h * this.dpr);
    this.dark.width = this.cv.width;
    this.dark.height = this.cv.height;
  }

  /** экранная позиция игрока (для прицела) */
  screenOf(x, y) {
    return {
      x: (x - this.cam.x) * this.cam.scale + this.w / 2,
      y: (y - this.cam.y) * this.cam.scale + this.h / 2,
    };
  }

  _smoothPlayers(players, dt) {
    for (const p of players) {
      const s = this.smooth.get(p.id);
      if (!s) { this.smooth.set(p.id, { x: p.x, y: p.y }); continue; }
      const k = 1 - Math.exp(-dt * 14);
      s.x = lerp(s.x, p.x, k);
      s.y = lerp(s.y, p.y, k);
    }
    for (const id of this.smooth.keys()) {
      if (!players.find((p) => p.id === id)) this.smooth.delete(id);
    }
  }

  _pos(p) {
    const s = this.smooth.get(p.id);
    return s || p;
  }

  render(snap, youId, view, dt) {
    const ctx = this.ctx;
    const world = snap.world;
    if (!world) return;
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2);

    const players = snap.players || [];
    this._smoothPlayers(players, dt);

    // ==== камера ====
    const me = players.find((p) => p.id === youId) || null;
    const target = view || (me ? this._pos(me) : { x: world.cx || world.w / 2, y: world.cy || world.h / 2 });
    this.cam.x = lerp(this.cam.x, target.x, 1 - Math.exp(-dt * 8));
    this.cam.y = lerp(this.cam.y, target.y, 1 - Math.exp(-dt * 8));
    const baseScale = Math.min(this.w, this.h) / (world.kind === 'relay' ? 44 : 42);
    this.cam.scale = clamp(baseScale, 12, 34);

    const sx = (Math.random() - .5) * this.shake * 8;
    const sy = (Math.random() - .5) * this.shake * 8;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#04070a';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.translate(this.w / 2 + sx, this.h / 2 + sy);
    ctx.scale(this.cam.scale, this.cam.scale);
    ctx.translate(-this.cam.x, -this.cam.y);

    if (world.kind === 'lantern') this._lanternWorld(ctx, snap, players, me);
    else if (world.kind === 'relay') this._relayWorld(ctx, snap, players, me);
    else this._innWorld(ctx, snap, players, me);

    ctx.restore();

    // ==== тьма и свет ====
    this._lighting(snap, players, me, world);

    // ==== цель на краю экрана ====
    this._objectives(snap, players, me, world);
  }

  /* ================= ОБЩИЕ ЭЛЕМЕНТЫ ================= */
  _groundBase(ctx, color = '#0b1512') {
    ctx.fillStyle = color;
    const pad = 60;
    ctx.fillRect(this.cam.x - this.w / this.cam.scale / 2 - pad, this.cam.y - this.h / this.cam.scale / 2 - pad,
      this.w / this.cam.scale + pad * 2, this.h / this.cam.scale + pad * 2);
  }

  _trees(ctx, trees) {
    for (const t of trees || []) {
      ctx.fillStyle = 'rgba(0,0,0,.45)';
      ctx.beginPath(); ctx.ellipse(t.x + .35, t.y + .45, t.r * 1.25, t.r * .8, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = t.kind === 'bush' ? '#1d2a20' : '#26302a';
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(180,200,180,.10)';
      ctx.lineWidth = .09;
      ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 6.28); ctx.stroke();
      if (t.kind === 'tree') {
        ctx.fillStyle = '#151d19';
        ctx.beginPath(); ctx.arc(t.x - .1, t.y - .12, t.r * .55, 0, 6.28); ctx.fill();
      }
    }
  }

  _fire(ctx, f, lit = f.lit, scale = 1) {
    // камни
    ctx.fillStyle = '#2b2f2c';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283;
      ctx.beginPath();
      ctx.arc(f.x + Math.cos(a) * .95 * scale, f.y + Math.sin(a) * .75 * scale, .26 * scale, 0, 6.28);
      ctx.fill();
    }
    // угли
    ctx.fillStyle = lit ? '#7a2a0c' : '#1a1c1a';
    ctx.beginPath(); ctx.ellipse(f.x, f.y, .7 * scale, .5 * scale, 0, 0, 6.28); ctx.fill();
    if (lit) {
      const t = this.time;
      for (let i = 0; i < 4; i++) {
        const fl = 0.55 + Math.sin(t * (7 + i) + i * 2) * 0.18;
        ctx.fillStyle = i < 2 ? 'rgba(255,190,110,.85)' : 'rgba(255,120,40,.55)';
        ctx.beginPath();
        ctx.ellipse(f.x + Math.sin(t * 3 + i) * .18, f.y - .25 - i * .12,
          (.34 - i * .05) * fl * scale, (.5 - i * .07) * fl * scale, 0, 0, 6.28);
        ctx.fill();
      }
    }
  }

  _playersCommon(ctx, players, youId, opts = {}) {
    for (const p of players) {
      const pos = this._pos(p);
      const isMe = p.id === youId;
      const dead = p.alive === false;
      const color = p.color || AMBER;

      // тень
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.beginPath(); ctx.ellipse(pos.x + .15, pos.y + .38, .52, .3, 0, 0, 6.28); ctx.fill();

      if (dead) {
        ctx.globalAlpha = .55;
        ctx.fillStyle = '#3a3f3a';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, .48, 0, 6.28); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }

      // тело
      const grad = ctx.createRadialGradient(pos.x - .12, pos.y - .16, .05, pos.x, pos.y, .62);
      grad.addColorStop(0, '#f2ead8');
      grad.addColorStop(.55, color);
      grad.addColorStop(1, 'rgba(0,0,0,.7)');
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, .46, 0, 6.28); ctx.fill();

      // направление
      ctx.fillStyle = 'rgba(10,12,10,.85)';
      ctx.beginPath();
      ctx.arc(pos.x + Math.cos(p.dir || 0) * .3, pos.y + Math.sin(p.dir || 0) * .3, .13, 0, 6.28);
      ctx.fill();

      // свой маркер
      if (isMe) {
        ctx.strokeStyle = 'rgba(255,176,102,.75)';
        ctx.lineWidth = .1;
        ctx.beginPath(); ctx.arc(pos.x, pos.y, .72, 0, 6.28); ctx.stroke();
      }

      // фонарь в руках
      if (p.held && opts && opts.lanternGlow) {
        ctx.fillStyle = 'rgba(255,210,140,.9)';
        ctx.beginPath(); ctx.arc(pos.x + .32, pos.y - .3, .16, 0, 6.28); ctx.fill();
      }

      // имя
      ctx.font = '0.92px "Inter", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = isMe ? 'rgba(255,220,180,.95)' : 'rgba(230,225,210,.72)';
      ctx.fillText(p.name || '', pos.x, pos.y - .78);

      if (p.cellared) {
        ctx.fillStyle = 'rgba(255,120,90,.9)';
        ctx.font = '.75px "Inter", Arial';
        ctx.fillText('в подвале', pos.x, pos.y + 1.1);
      }
    }
  }

  /* ================= ФОНАРЩИКИ ================= */
  _lanternWorld(ctx, snap, players, me) {
    const w = snap.world;
    const gs = snap.gs || {};
    this._groundBase(ctx, '#0a1411');

    // круги вокруг костров — «жизнь» мира
    for (const f of w.fires) {
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.lit ? 9 : 4);
      g.addColorStop(0, f.lit ? 'rgba(255,150,70,.20)' : 'rgba(60,70,64,.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(f.x, f.y, f.lit ? 9 : 4, 0, 6.28); ctx.fill();
    }

    // граница леса
    ctx.strokeStyle = 'rgba(120,160,150,.10)';
    ctx.lineWidth = .35;
    ctx.beginPath(); ctx.arc(w.cx, w.cy, w.r, 0, 6.28); ctx.stroke();

    this._trees(ctx, w.trees);

    // дрова
    for (const p of w.piles) {
      if (p.amount <= 0) continue;
      ctx.fillStyle = '#3a2a18';
      for (let i = 0; i < p.amount; i++) {
        ctx.save();
        ctx.translate(p.x + (i - 1) * .26, p.y - i * .18);
        ctx.rotate(-.35 + i * .12);
        ctx.fillRect(-.32, -.14, .64, .28);
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(255,180,110,.14)';
      ctx.beginPath(); ctx.arc(p.x, p.y, .85, 0, 6.28); ctx.fill();
    }

    // костры
    for (const f of w.fires) this._fire(ctx, f);

    // тянущиеся
    for (const g of w.grabbers || []) {
      ctx.save();
      ctx.translate(g.x, g.y);
      ctx.fillStyle = g.stunned ? 'rgba(120,220,210,.85)' : '#0b0d0c';
      ctx.strokeStyle = g.stunned ? 'rgba(150,255,245,.9)' : 'rgba(150,60,40,.55)';
      ctx.lineWidth = .07;
      for (let i = 0; i < 5; i++) {
        const a = this.time * 1.4 + i * 1.25;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(Math.cos(a) * .7, Math.sin(a) * .7, Math.cos(a + .8) * 1.3, Math.sin(a + .8) * 1.3);
        ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(0, 0, .55, 0, 6.28); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    this._playersCommon(ctx, players, snap.you, { lanternGlow: true });

    // прогресс гашения/ловли над собой
    if (me) {
      const p = players.find((q) => q.id === me.id);
      if (p && p.douseProg > 0) this._ringProgress(ctx, this._pos(p), p.douseProg, '#e0562f');
      if (p && p.feedProg > 0) this._ringProgress(ctx, this._pos(p), p.feedProg, AMBER);
      if (p && p.chargeProg > 0) this._ringProgress(ctx, this._pos(p), p.chargeProg, SPECTRE);
      if (p && p.catchProg > 0) this._ringProgress(ctx, this._pos(p), p.catchProg, '#ff5a3c');
      if (p && p.rescueProg > 0) this._ringProgress(ctx, this._pos(p), p.rescueProg, SPECTRE);
    }
  }

  _ringProgress(ctx, pos, v, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = .16;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 1.35, .42, -Math.PI / 2, -Math.PI / 2 + 6.283 * clamp(v, 0, 1));
    ctx.stroke();
  }

  /* ================= ЭСТАФЕТА ================= */
  _relayWorld(ctx, snap, players, me) {
    const w = snap.world;
    const gs = snap.gs || {};
    this._groundBase(ctx, '#091210');

    // земляная полоса
    ctx.fillStyle = '#0e1a15';
    ctx.fillRect(0, 0, w.w, w.h);

    // тропа
    ctx.strokeStyle = 'rgba(180,150,100,.10)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(4, 32);
    ctx.bezierCurveTo(60, 20, 120, 44, 176, 32);
    ctx.stroke();

    // вода
    if (w.water) {
      const g = ctx.createLinearGradient(0, 0, 0, w.h);
      g.addColorStop(0, 'rgba(20,50,58,.85)');
      g.addColorStop(1, 'rgba(10,30,38,.9)');
      ctx.fillStyle = g;
      ctx.fillRect(w.water.x0, 0, w.water.x1 - w.water.x0, w.h);
      ctx.strokeStyle = 'rgba(111,227,214,.18)';
      ctx.lineWidth = .08;
      for (let i = 0; i < 16; i++) {
        const y = (i / 16) * w.h;
        const off = Math.sin(this.time * .8 + i) * .6;
        ctx.beginPath();
        ctx.moveTo(w.water.x0 + .6 + off, y);
        ctx.lineTo(w.water.x1 - .6 + off, y + .4);
        ctx.stroke();
      }
    }

    // часовня
    const cx = w.chapelX;
    ctx.fillStyle = '#241d18';
    ctx.fillRect(cx, 22, 18, 20);
    ctx.fillStyle = '#171310';
    ctx.fillRect(cx + 2, 24, 14, 16);
    ctx.fillStyle = 'rgba(255,176,102,.16)';
    ctx.beginPath(); ctx.arc(cx + 9, 32, 6, 0, 6.28); ctx.fill();
    ctx.fillStyle = AMBER;
    ctx.beginPath(); ctx.arc(cx + 9, 32, 1.1, 0, 6.28); ctx.fill();

    this._trees(ctx, w.trees);
    for (const f of w.fires) this._fire(ctx, f, true, .9);

    // Собиратель
    if (w.kind === 'relay' && gs.collector) {
      const c = gs.collector;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.beginPath(); ctx.ellipse(0, .5, 1.1, .4, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = c.stunned ? '#2a4a48' : '#080a09';
      ctx.beginPath();
      ctx.moveTo(-.5, .6); ctx.lineTo(-.35, -1.1); ctx.lineTo(0, -1.6);
      ctx.lineTo(.35, -1.1); ctx.lineTo(.5, .6); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = c.stunned ? 'rgba(111,227,214,.8)' : 'rgba(200,70,40,.5)';
      ctx.lineWidth = .08;
      ctx.beginPath(); ctx.arc(0, -.5, 1.15, 0, 6.28); ctx.stroke();
      ctx.restore();
    }

    // брошенный фонарь
    if (gs.lantern && gs.lantern.onGround) {
      ctx.fillStyle = 'rgba(255,200,120,.9)';
      ctx.beginPath(); ctx.arc(gs.lantern.x, gs.lantern.y, .3, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,60,.7)';
      ctx.lineWidth = .08;
      ctx.beginPath(); ctx.arc(gs.lantern.x, gs.lantern.y, .7 + Math.sin(this.time * 4) * .1, 0, 6.28); ctx.stroke();
    }

    // крики-приманки
    for (const d of gs.decoys || []) {
      ctx.strokeStyle = 'rgba(160,220,255,.35)';
      ctx.lineWidth = .08;
      for (let i = 0; i < 3; i++) {
        const r = ((this.time * 1.2 + i * .6) % 2) * 2.2;
        ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, 6.28); ctx.stroke();
      }
    }

    this._playersCommon(ctx, players, snap.you, { lanternGlow: true });

    if (me) {
      const p = players.find((q) => q.id === me.id);
      if (p && p.altarProg > 0) this._ringProgress(ctx, this._pos(p), p.altarProg, AMBER);
      if (p && p.charge > 0) this._ringProgress(ctx, this._pos(p), p.charge / 8, SPECTRE);
    }
  }

  /* ================= ПОСТОЯЛЫЙ ДВОР ================= */
  _innWorld(ctx, snap, players, me) {
    const w = snap.world;
    this._groundBase(ctx, '#080b0c');

    // полы комнат
    for (const r of w.rooms || []) {
      ctx.fillStyle = r.id === 'hall' ? '#1a1512' : (r.id === 'cellar' ? '#12100f' : '#151210');
      ctx.fillRect(r.x, r.y, r.w, r.h);
      // половицы
      ctx.strokeStyle = 'rgba(0,0,0,.35)';
      ctx.lineWidth = .06;
      for (let y = r.y + 1; y < r.y + r.h; y += 1.2) {
        ctx.beginPath(); ctx.moveTo(r.x + .4, y); ctx.lineTo(r.x + r.w - .4, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(239,230,210,.16)';
      ctx.font = '.62px "Inter", Arial';
      ctx.textAlign = 'left';
      ctx.fillText(r.name.toUpperCase(), r.x + .8, r.y + 1.6);
    }
    // общий ковёр в зале
    ctx.fillStyle = 'rgba(120,40,30,.16)';
    ctx.beginPath(); ctx.arc(22, 20, 3.4, 0, 6.28); ctx.fill();

    // стены
    for (const wall of w.walls || []) {
      ctx.fillStyle = '#33241a';
      ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      ctx.fillRect(wall.x, wall.y + wall.h - .22, wall.w, .22);
    }
    // двери
    for (const d of w.doors || []) {
      if (d.locked) {
        ctx.fillStyle = 'rgba(210,69,43,.85)';
        ctx.fillRect(d.x, d.y, d.w, d.h);
        ctx.strokeStyle = 'rgba(255,120,90,.6)';
        ctx.lineWidth = .08;
        ctx.strokeRect(d.x, d.y, d.w, d.h);
      } else {
        ctx.strokeStyle = 'rgba(255,176,102,.25)';
        ctx.lineWidth = .06;
        ctx.strokeRect(d.x, d.y, d.w, d.h);
      }
    }

    // общие свечи
    for (const c of w.candles || []) {
      ctx.fillStyle = c.lit ? '#ffe9b0' : '#2a2724';
      ctx.beginPath(); ctx.arc(c.x, c.y, .22, 0, 6.28); ctx.fill();
      if (c.lit) {
        const fl = .32 + Math.sin(this.time * 9 + c.x) * .05;
        ctx.fillStyle = 'rgba(255,176,102,.35)';
        ctx.beginPath(); ctx.arc(c.x, c.y, fl * 2.2, 0, 6.28); ctx.fill();
      }
    }

    // тела
    for (const b of w.bodies || []) {
      ctx.fillStyle = 'rgba(20,20,20,.85)';
      ctx.beginPath(); ctx.ellipse(b.x, b.y, .75, .42, .4, 0, 6.28); ctx.fill();
      ctx.strokeStyle = 'rgba(180,60,40,.6)';
      ctx.lineWidth = .07;
      ctx.beginPath(); ctx.ellipse(b.x, b.y, .9, .55, .4, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(220,90,70,.85)';
      ctx.font = '.7px "Inter", Arial';
      ctx.textAlign = 'center';
      ctx.fillText('тело: ' + b.name, b.x, b.y - 1);
    }

    this._playersCommon(ctx, players, snap.you);

    if (me) {
      const p = players.find((q) => q.id === me.id);
      if (p && p.takeProg > 0) this._ringProgress(ctx, this._pos(p), p.takeProg, EMBER);
    }
  }

  /* ================= ТЬМА ================= */
  _lighting(snap, players, me, world) {
    const gs = snap.gs || {};
    const lights = [];
    const add = (x, y, r, color, strength = 1) => lights.push({ x, y, r, color, strength });

    const kind = world.kind;
    if (kind === 'lantern') {
      for (const f of world.fires) {
        if (f.lit) add(f.x, f.y, 13 + Math.sin(this.time * 6 + f.x) * .8, '255,170,90', 1.15);
        else add(f.x, f.y, 2.2, '120,40,30', .5);
      }
      for (const p of players) {
        if (!p.alive) continue;
        const pos = this._pos(p);
        const isMe = p.id === snap.you;
        if (p.lantern) add(pos.x, pos.y, isMe ? 16 : 9, '255,180,110', isMe ? 1.25 : .7);
        else if (isMe) add(pos.x, pos.y, 5.2, '150,180,200', .5);
        else add(pos.x, pos.y, 1.6, '160,160,160', .35);
      }
      for (const g of world.grabbers || []) add(g.x, g.y, 2.4, '200,60,40', .5);
    } else if (kind === 'relay') {
      for (const f of world.fires) add(f.x, f.y, 10, '255,170,90', 1);
      const lant = gs.lantern;
      const carrier = players.find((p) => p.id === gs.lantern?.heldBy);
      const carrierPos = carrier ? this._pos(carrier) : null;
      const isCarrier = lant && lant.heldBy === snap.you;
      if (lant && !lant.onGround && carrierPos) {
        add(carrierPos.x, carrierPos.y, isCarrier ? 17 : 7, '255,190,120', isCarrier ? 1.3 : .6);
      }
      if (lant && lant.onGround) add(lant.x, lant.y, 12, '255,190,120', 1.1);
      for (const p of players) {
        if (!p.alive) continue;
        const pos = this._pos(p);
        const isMe = p.id === snap.you;
        if (isMe) {
          if (isCarrier) add(pos.x, pos.y, 17, '255,190,120', 1.3);
          else add(pos.x, pos.y, 3.4, '150,180,200', .55);
        } else if (!isCarrier) {
          // слепой видит союзников только вблизи
          const mine = players.find((q) => q.id === snap.you);
          const d = mine ? dist(mine.x, mine.y, p.x, p.y) : 99;
          if (d < 7) add(pos.x, pos.y, 2.6, '220,230,235', .9);
        }
      }
    } else {
      const candles = (world.candles || []).filter((c) => c.lit).length;
      for (const c of world.candles || []) if (c.lit) add(c.x, c.y, 8.5, '255,180,110', 1);
      for (const p of players) {
        if (!p.alive) continue;
        const pos = this._pos(p);
        if ((p.candle || 0) > 0 || p.id === snap.you) add(pos.x, pos.y, 4.6, '255,200,150', .8);
      }
      for (const b of world.bodies || []) add(b.x, b.y, 2.2, '180,50,40', .45);
    }

    const alpha = kind === 'inn' ? 0.80 : kind === 'relay' ? 0.95 : 0.92;

    const dctx = this.darkCtx;
    dctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    dctx.clearRect(0, 0, this.w, this.h);
    dctx.fillStyle = `rgba(3,6,8,${alpha})`;
    dctx.fillRect(0, 0, this.w, this.h);
    dctx.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      const s = this.screenOf(l.x, l.y);
      const r = l.r * this.cam.scale;
      const g = dctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      g.addColorStop(0, `rgba(0,0,0,${l.strength})`);
      g.addColorStop(.55, `rgba(0,0,0,${l.strength * .72})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      dctx.fillStyle = g;
      dctx.beginPath(); dctx.arc(s.x, s.y, r, 0, 6.28); dctx.fill();
    }
    dctx.globalCompositeOperation = 'source-over';

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.dark, 0, 0, this.w, this.h);

    // тёплый ореол поверх тьмы
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (l.strength < .8) continue;
      const s = this.screenOf(l.x, l.y);
      const r = l.r * this.cam.scale * .85;
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      const c = l.color;
      g.addColorStop(0, `rgba(${c},.20)`);
      g.addColorStop(.5, `rgba(${c},.07)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, 6.28); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    // туман
    ctx.fillStyle = 'rgba(150,200,195,.030)';
    for (const f of this.fog) {
      const x = ((f.x + this.time * 0.004 * f.s) % 1) * this.w;
      const y = ((f.y + Math.sin(this.time * .2 + f.p) * .01) % 1) * this.h;
      ctx.beginPath(); ctx.arc(x, y, 40 * f.s, 0, 6.28); ctx.fill();
    }
  }

  /* ================= маркеры цели ================= */
  _objectives(snap, players, me, world) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const gs = snap.gs || {};
    const marks = [];

    if (world.kind === 'lantern') {
      for (const f of world.fires) {
        if (f.lit && f.fuel > 25) continue;
        marks.push({ x: f.x, y: f.y, color: f.lit ? AMBER : EMBER, label: f.lit ? '' : '!' });
      }
      if (gs.youShadow && me) {
        const target = world.fires.filter((f) => f.lit)
          .sort((a, b) => dist(me.x, me.y, a.x, a.y) - dist(me.x, me.y, b.x, b.y))[0];
        if (target) marks.push({ x: target.x, y: target.y, color: EMBER, label: '▼' });
      }
    } else if (world.kind === 'relay') {
      const lant = gs.lantern;
      if (lant && lant.onGround) marks.push({ x: lant.x, y: lant.y, color: AMBER, label: '✦' });
      if (!gs.youCarrier) {
        const carrier = players.find((p) => p.id === lant?.heldBy);
        if (carrier) marks.push({ x: carrier.x, y: carrier.y, color: AMBER, label: '☀' });
      }
      const altar = world.altar || { x: world.chapelX + 4, y: 32 };
      marks.push({ x: altar.x, y: altar.y, color: SPECTRE, label: '▲' });
    }

    for (const m of marks) {
      const s = this.screenOf(m.x, m.y);
      const pad = 34;
      const inside = s.x > pad && s.x < this.w - pad && s.y > pad && s.y < this.h - pad;
      if (inside) continue;
      // стрелка у края
      const cx = this.w / 2, cy = this.h / 2;
      const a = Math.atan2(s.y - cy, s.x - cx);
      const rx = this.w / 2 - pad, ry = this.h / 2 - pad;
      const t = Math.min(Math.abs(rx / Math.cos(a)), Math.abs(ry / Math.sin(a)));
      const x = cx + Math.cos(a) * t;
      const y = cy + Math.sin(a) * t;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = m.color;
      ctx.globalAlpha = .75;
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, 7); ctx.lineTo(-6, -7); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (m.label) {
        ctx.fillStyle = m.color;
        ctx.globalAlpha = .9;
        ctx.font = '11px "Inter", Arial';
        ctx.textAlign = 'center';
        ctx.fillText(m.label, x, y + 20);
      }
      ctx.globalAlpha = 1;
    }
  }
}
