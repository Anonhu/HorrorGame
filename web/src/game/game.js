import * as THREE from 'three';
import { Forest } from '../world/forest.js';
import { Props } from '../world/props.js';
import { buildPlan, WORLD } from '../world/layout.js';
import { Player } from './player.js';
import { Stag, STAG } from './stag.js';
import { Echo } from './echo.js';
import { FX } from '../fx/fx.js';
import { AudioEngine } from '../audio/audio.js';
import { Input } from '../core/input.js';
import { clamp, damp, rand, TAU, angleDelta } from '../core/rng.js';

/* ============================================================
   GAME — the ritual loop.
   ============================================================ */
export class Game {
  constructor(ui) {
    this.ui = ui;
    this.state = 'boot';
    this.time = 0;
    this.last = performance.now() / 1000;
    this.quality = 'high';
    this.health = 3;
    this.maxHealth = 3;
    this.noise = 0;
    this.dread = 0;
    this.igniteProg = 0;
    this.ritualProg = 0;
    this.targetShrine = null;
    this.stats = { pings: 0, hits: 0, shrines: 0 };
    this.hitsTaken = 0;
    this.elapsed = 0;
    this.ended = false;
    this.eventTimer = 14;
    this.hintStage = 0;
    this.hintTimer = 0;
    this.pingCooldown = 0;
    this.titleAngle = 0;
    this.stagSeenOnce = false;
    this.warnedStare = false;
    this.input = null;
  }

  /* ---------------- boot ---------------- */
  async init() {
    const canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, powerPreference: 'high-performance', alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.setClearColor(0x05080b, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 600);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.ui.boot(0.1, 'прокладываем тропу…');
    await frame();

    this.plan = buildPlan(2603);
    this.ui.boot(0.25, 'выращиваем поплары…');
    await frame();

    this.forest = new Forest(this.scene, this.plan, this.quality);
    this.colliders = this.forest.colliders;
    this.ui.boot(0.5, 'зажигаем тыквы…');
    await frame();

    this.props = new Props(this.scene, this.plan, this.colliders);
    this.ui.boot(0.66, 'зовём того, кто слушает…');
    await frame();

    this.fx = new FX(this.scene, this.quality);
    this.player = new Player(this.camera, this.scene, this.colliders, this.fx);
    this.stag = new Stag(this.scene, this.colliders);
    this.echo = new Echo(this.scene, this.forest, this.props, this.stag, this.colliders);
    this.audio = new AudioEngine();
    this.input = new Input(canvas);
    this.input.canvas = canvas;

    this._wireStag();
    // footstep audio is driven by the loop (footstepTick); here we only
    // spawn visual dust so the two never double-trigger
    this.player.onStep = () => {};

    this.ui.boot(0.85, 'гасим свет…');
    await frame();
    this._wireResize();
    this.ui.boot(1, 'готово');

    this._titleCamera(true);
    this.state = 'title';
    this.ui.hideBoot();
    this._loop();
  }

  _wireStag() {
    this.stag.onCall = (type, stag) => {
      switch (type) {
        case 'wake':
          this.audio.stinger();
          this.audio.stagCall(true);
          this.ui.subtitle('…оно проснулось', { duration: 4 });
          this.ui.stalked(true);
          break;
        case 'freeze':
          this.audio.stagCrack();
          this.ui.freezeFrame(true);
          if (!this.stagSeenOnce) {
            this.stagSeenOnce = true;
            this.ui.subtitle('ОНО ЗАМЕРЛО. НЕ СМОТРИ ДОЛГО.', { type: 'warn', duration: 5 });
          }
          break;
        case 'release':
          this.ui.freezeFrame(false);
          this.ui.subtitle('…шаги за спиной', { duration: 3 });
          break;
        case 'warn':
          this.audio.whisper();
          this.ui.subtitle('отвернись', { type: 'warn', duration: 2.2 });
          break;
        case 'gaze_limit':
          this.audio.stinger();
          this.audio.stagCall(false);
          this.ui.subtitle('НЕ СМОТРИ!', { type: 'warn', duration: 2.2 });
          this.ui.freezeFrame(false);
          this.player.addShake(0.5);
          break;
        case 'lunge':
          this.audio.stagCall(false);
          this.player.addShake(0.25);
          break;
        case 'charge':
          this.audio.stinger();
          this.audio.stagCall(false);
          break;
      }
    };
  }

  /* ---------------- sizing ---------------- */
  _wireResize() {
    this._onResize = () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'low' ? 1 : 1.65));
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', this._onResize);
  }

  setQuality(q) {
    this.quality = q;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q === 'low' ? 1 : 1.65));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /* ---------------- state ---------------- */
  async start() {
    await this.audio.start();
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.input.enabled = true;
    this.input.reset();
    this.state = 'playing';
    this.ended = false;
    this.input.requestLock();
    this.hintTimer = 0;
    this.hintStage = 0;
    this.ui.subtitle('не беги. оно слышит шаги.', { duration: 5 });
    this.ui.setObjective('зажги четыре тотема', '0 / 4');
    this.ui.setHearts(this.health);
    this.ui.hidePingHint();
    setTimeout(() => { this.ui.el.pingHint.style.opacity = '.35'; }, 4000);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.exitLock();
    this.input.reset();
    this.ui.showScreen('pause');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.showScreen(null);
    this.state = 'playing';
    this.input.enabled = true;
    this.last = performance.now() / 1000;
    this.input.requestLock();
  }

  restart() {
    this.health = this.maxHealth;
    this.noise = 0;
    this.dread = 0;
    this.igniteProg = 0;
    this.ritualProg = 0;
    this.elapsed = 0;
    this.hitsTaken = 0;
    this.stats = { pings: 0, hits: 0, shrines: 0 };
    this.ended = false;
    this.eventTimer = 14;
    this.hintStage = 0;
    this.pingCooldown = 0;
    this.player.reset();
    this.stag.reset();
    this.props.reset();
    this.ui.setHearts(this.health);
    this.ui.lowLife(false);
    this.ui.stalked(false);
    this.ui.freezeFrame(false);
    this.ui.setObjective('зажги четыре тотема', '0 / 4');
    this.ui.showScreen(null);
    this.ui.showHud(true);
    this.ui.setDread(0);
    this.ui.setNoise(0);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.reset();
    this.input.requestLock();
    this.last = performance.now() / 1000;
    this.ui.subtitle('не беги. оно слышит шаги.', { duration: 5 });
  }

  quitToMenu() {
    this.state = 'title';
    this.input.enabled = false;
    this.input.exitLock();
    this.ui.showHud(false);
    this.ui.showScreen('title');
    this._titleCamera(true);
  }

  _titleCamera(instant = false) {
    this.titleAngle = Math.PI * 0.3;
    this.camera.position.set(Math.cos(this.titleAngle) * 18, 2.6, Math.sin(this.titleAngle) * 18);
    this.camera.lookAt(0, 1.4, 0);
  }

  /* ---------------- main loop ---------------- */
  _loop = () => {
    requestAnimationFrame(this._loop);
    const now = performance.now() / 1000;
    let dt = Math.min(0.05, now - this.last);
    this.last = now;

    if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'title') {
      this.titleAngle += dt * 0.035;
      this.camera.position.set(Math.cos(this.titleAngle) * 18, 2.4 + Math.sin(now * 0.2) * 0.2, Math.sin(this.titleAngle) * 18);
      this.camera.lookAt(0, 1.5, 0);
      this.forest.update(dt, now, { x: 0, z: 0 });
      this.props.update(dt, now);
      this.fx.update(dt, now, { x: 0, z: 0 });
      this.echo.update(dt, now, this.player);
    } else if (this.state === 'dying' || this.state === 'winning') {
      this._endUpdate(dt, now);
    } else if (this.state === 'paused') {
      // frozen frame, but keep the ambience moving very slowly
    }
    this.ui.tick(dt);
    this.renderer.render(this.scene, this.camera);
  };

  /* ---------------- gameplay ---------------- */
  update(dt) {
    this.time += dt;
    this.elapsed += dt;
    this.pingCooldown = Math.max(0, this.pingCooldown - dt);

    const actions = this.input.consume();
    const stats = this.player.update(dt, this.input, this.time);

    // ---- lantern ----
    if (actions.lantern) {
      this.player.setLantern(!this.player.lanternOn);
      this.audio.stagCrack();
    }

    // ---- noise: the core resource ----
    const targetNoise = stats.noise;
    this.noise = clamp(damp(this.noise, clamp(targetNoise, 0, 100), 2.4, dt) - dt * 2.5, 0, 100);

    // ---- echo ping ----
    if (actions.ping && this.pingCooldown <= 0) {
      this.pingCooldown = 2.1;
      this.stats.pings++;
      this.noise = clamp(this.noise + 30, 0, 100);
      const fwd = this.player.forward();
      const target = this._currentTarget();
      this.echo.ping(this.player, target);
      this.audio.ping();
      this.ui.flash('teal', 180);
      this.player.addShake(0.06);
      if (this.stag.mode === 'dormant' && Math.hypot(this.stag.pos.x - this.player.pos.x, this.stag.pos.z - this.player.pos.z) < 34) {
        this.ui.subtitle('что-то большое… рядом', { duration: 3 });
      }
    }

    // ---- stag ----
    const forward = this.player.forward();
    const stagInfo = this.stag.update({
      dt, time: this.time, player: this.player, forward,
      noise: this.noise, audio: this.audio, fx: this.fx,
      onDamage: (stag, dmg) => this._onDamage(stag, dmg),
    });

    // ---- shrine ignition by standing in the ring ----
    this._updateIgnite(dt, stats);

    // ---- ritual finish ----
    if (this.props.ritual.active) {
      const d = Math.hypot(this.player.pos.x, this.player.pos.z);
      if (d < 5.6) {
        this.ritualProg = clamp(this.ritualProg + dt / 6, 0, 1);
        this.ui.prompt('НЕ ДВИГАЙСЯ · ОБРЯД ИДЁТ', this.ritualProg);
        this.ui.crosshairAim(true);
        this.noise = clamp(this.noise + dt * 12, 0, 100);
        if (this.ritualProg >= 1) this._win();
      } else {
        this.ritualProg = Math.max(0, this.ritualProg - dt * 0.2);
        this.ui.hidePrompt();
      }
    } else {
      this.ui.hidePrompt();
    }

    // ---- dread ----
    const gaze = stagInfo.gaze;
    const prox = clamp(1 - stagInfo.dist / 30, 0, 1);
    this.dread = damp(this.dread, clamp(Math.max(gaze, prox * stagInfo.awareness, stagInfo.stunned ? 0.3 : 0), 0, 1), 3, dt);

    // ---- director ----
    this._director(dt, stagInfo);

    // ---- HUD ----
    const shrineCount = this.props.litCount();
    const target = this._currentTarget();
    const bearing = target ? Math.atan2(-(target.x - this.player.pos.x), -(target.z - this.player.pos.z)) : null;
    this.ui.setCompass(this.player.yaw, bearing);
    this.ui.setNoise(this.noise / 100);
    this.ui.setDread(this.dread);
    this.ui.setLantern(this.player.lanternOn, stagInfo.stunned);
    this.ui.setClock(this.elapsed / 6);
    this.ui.lowLife(this.health === 1);
    this.ui.stalked(stagInfo.mode !== 'dormant' && stagInfo.dist < 26);
    if (this.props.ritual.active) {
      this.ui.setObjective('вернись в круг', `${Math.round(this.ritualProg * 100)}%`);
    } else {
      this.ui.setObjective('зажги четыре тотема', `${shrineCount} / 4`);
    }

    this.ui.crosshairAim(this.player.speed > 0.2 || stagInfo.dist < 12);

    // freeze overlay only while actually frozen in view
    this.ui.freezeFrame(stagInfo.frozen);

    // fov kick while sprinting
    const wantFov = this.player.sprinting ? 81 : 74;
    this.camera.fov = damp(this.camera.fov, wantFov, 3, dt);
    this.camera.updateProjectionMatrix();

    // ---- world ----
    this.forest.update(dt, this.time, this.player.pos);
    this.props.update(dt, this.time);
    this.fx.update(dt, this.time, this.player.pos);
    this.echo.update(dt, this.time, this.player);

    // ---- audio mix ----
    this.audio.update(
      clamp(this.dread * 0.7 + stagInfo.awareness * 0.5, 0, 1),
      this.player.sprinting, dt
    );
    this.audio.footstepTick(dt, this.player.speed, this.player.crouching);
    this.audio.heartbeatTick(dt, this.dread);

    // ---- pointer lock loss = pause (only if we ever had a real lock) ----
    if (this.input.hasLockedOnce && !this.input.locked && !this.input.freeLook
        && !this.input.touchId && !this.input.lookId && this.elapsed > 1.2) {
      this.pause();
    }
  }

  _updateIgnite(dt, stats) {
    if (this.props.ritual.active) return;
    const near = this.props.shrines
      .filter((s) => !s.lit)
      .map((s) => ({ s, d: Math.hypot(s.x - this.player.pos.x, s.z - this.player.pos.z) }))
      .filter((o) => o.d < 4.6)
      .sort((a, b) => a.d - b.d)[0];

    if (!near) {
      this.igniteProg = Math.max(0, this.igniteProg - dt * 1.5);
      if (this.igniteProg > 0.02) this.ui.prompt('тотем остывает…', this.igniteProg);
      else this.ui.hidePrompt();
      return;
    }

    const calm = this.player.speed < 0.7;
    if (calm) {
      this.igniteProg = clamp(this.igniteProg + dt / 2.4, 0, 1);
      this.ui.prompt('СТОЙ В КРУГЕ · ЗАЖИГАЙ ТОТЕМ', this.igniteProg);
      this.ui.crosshairAim(true);
      if (this.igniteProg >= 1) this._ignite(near.s);
    } else {
      this.igniteProg = Math.max(0, this.igniteProg - dt * 0.6);
      this.ui.prompt('ОСТАНОВИСЬ, ЧТОБЫ ЗАЖЕЧЬ', this.igniteProg);
    }
  }

  _ignite(shrine) {
    if (shrine.lit) return;
    this.props.ignite(shrine);
    this.stats.shrines++;
    this.igniteProg = 0;
    this.noise = clamp(this.noise + 22, 0, 100);
    this.fx.emberBurst(shrine.x, 1.8, shrine.z, 40);
    this.fx.soulColumn(shrine.x, shrine.z, 34);
    this.audio.chime(this.stats.shrines - 1);
    this.audio.stinger();
    this.ui.flash('white', 220);
    this.player.addShake(0.18);
    this.ui.hidePrompt();
    this.ui.setHearts(this.health);

    const lines = [
      'первый огонь. он услышал.',
      'второй. лес стал тише.',
      'третий. шаги ближе.',
    ];
    if (this.stats.shrines < 4) {
      this.ui.subtitle(lines[this.stats.shrines - 1] || '…', { duration: 5 });
      this.stag.awareness = Math.min(1, this.stag.awareness + 0.35);
      this.stag.attackCooldown = Math.max(0, this.stag.attackCooldown - 4);
      if (this.stag.mode === 'dormant') {
        this.stag.playerRef = this.player;
        this.stag._wake();
        this.stag.mode = 'stalk';
        this.stag.mesh.visible = true;
      }
    } else {
      this.props.setRitualActive(true);
      this.ui.subtitle('ЧЕТЫРЕ. ВЕРНИСЬ К КРУГУ.', { type: 'warn', duration: 6 });
      this.audio.stinger();
      this.audio.stagCall(false);
      this.ui.flash('teal', 380);
      this.player.addShake(0.5);
      this.stag.playerRef = this.player;
      this.stag.mode = 'charge';
      this.stag.timer = 0;
      this.stag.damageDealt = true;
      this.stag.mesh.visible = true;
      this.stag.attackCooldown = 0;
    }
  }

  _currentTarget() {
    if (this.props.ritual.active) return { x: 0, z: 0 };
    const { shrine } = this.props.nearestUnlitShrine(this.player.pos);
    if (shrine) return shrine;
    return { x: 0, z: 0 };
  }

  _onDamage(stag, dmg) {
    if (this.state !== 'playing') return;
    this.health -= dmg;
    this.hitsTaken++;
    this.stats.hits++;
    const dx = this.player.pos.x - stag.pos.x;
    const dz = this.player.pos.z - stag.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    this.player.hurt((dx / l) * 1.2, (dz / l) * 1.2);
    this.ui.hurt();
    this.ui.flash('red', 320);
    this.ui.hitHeart(this.health);
    this.ui.setHearts(this.health);
    this.ui.subtitle(this.health > 1 ? 'ОНО КОСНУЛОСЬ ТЕБЯ' : 'ЕЩЁ ОДИН УДАР — И ВСЁ', { type: 'warn', duration: 3.2 });
    this.audio.hit();
    this.audio.stinger();
    this.audio.heartbeat(1.4);
    this.dread = 1;
    if (this.health <= 0) this._die();
    else this.noise = 100;
  }

  _director(dt, stagInfo) {
    this.eventTimer -= dt;
    if (this.eventTimer <= 0) {
      this.eventTimer = rand(16, 30) - this.stats.shrines * 1.5;
      const r = Math.random();
      if (r < 0.32) {
        this.audio.whisper();
        const lines = [
          '…слышишь?',
          '…не оглядывайся',
          '…листва помнит тебя',
          '…четыре огня',
          '…оно уже здесь',
        ];
        this.ui.subtitle(lines[(Math.random() * lines.length) | 0], { duration: 3.5 });
      } else if (r < 0.62) {
        this.audio.stagCall(true);
      } else if (r < 0.8) {
        this.audio.stagCrack();
        this.player.addShake(0.05);
      } else if (r < 0.92) {
        this.audio.whisper();
        this.ui.flash('teal', 90);
      } else {
        this.fx.emberBurst(this.player.pos.x + rand(-6, 6), 1.2, this.player.pos.z + rand(-6, 6), 8);
      }
    }

    // contextual hints, once each
    this.hintTimer += dt;
    if (this.hintStage === 0 && this.elapsed > 16) {
      this.hintStage = 1;
      this.ui.subtitle('E — эхо. оно покажет тропу и его.', { duration: 5 });
    }
    if (this.hintStage === 1 && this.elapsed > 42) {
      this.hintStage = 2;
      this.ui.subtitle('иди по кровавой листве. она ведёт к тотемам.', { duration: 5 });
    }
    if (this.hintStage === 2 && stagInfo.dist < 24 && stagInfo.mode !== 'dormant') {
      this.hintStage = 3;
      this.ui.subtitle('смотри на него — но не дольше трёх секунд.', { duration: 5 });
    }
    if (stagInfo.gaze > 0.72 && !this.warnedStare) {
      this.warnedStare = true;
      this.ui.subtitle('ОТВЕРНИСЬ', { type: 'warn', duration: 1.6 });
    }
    if (stagInfo.gaze < 0.2) this.warnedStare = false;
  }

  _die() {
    this.state = 'dying';
    this.ended = true;
    this.endT = 0;
    this.player.die();
    this.audio.stinger();
    this.audio.hit();
    this.ui.freezeFrame(false);
    this.ui.flash('red', 500);
    this.input.enabled = false;
    this.ui.subtitle('', { duration: 0.1 });
    setTimeout(() => this.ui.showEnd({
      win: false, time: this.elapsed, pings: this.stats.pings,
      shrines: this.stats.shrines, hits: this.stats.hits,
    }), 2600);
  }

  _win() {
    this.state = 'winning';
    this.ended = true;
    this.endT = 0;
    this.ritualProg = 1;
    this.ui.hidePrompt();
    this.ui.flash('white', 900);
    this.ui.subtitle('ЛЕС ПРИНЯЛ ДАР', { duration: 4 });
    this.audio.victory();
    this.input.enabled = false;
    this.props.setRitualActive(true);
    this.fx.soulColumn(0, 0, 80);
    this.player.addShake(0.3);
    setTimeout(() => this.ui.showEnd({
      win: true, time: this.elapsed, pings: this.stats.pings,
      shrines: this.stats.shrines, hits: this.stats.hits,
    }), 3200);
  }

  _endUpdate(dt, time) {
    this.endT += dt;
    const dying = this.state === 'dying';
    this.player.update(dt, this.input, time);
    this.forest.update(dt, time, this.player.pos);
    this.props.update(dt, time);
    this.fx.update(dt, time, this.player.pos);
    this.echo.update(dt, time, this.player);
    this.audio.update(dying ? 1 : 0.2, false, dt);
    if (dying) {
      // the stag leans over the body
      const s = this.stag;
      if (s.mesh) {
        s.mesh.visible = true;
        const dx = this.player.pos.x - s.pos.x, dz = this.player.pos.z - s.pos.z;
        const l = Math.hypot(dx, dz) || 1;
        if (l > 2.2) {
          s.pos.x += (dx / l) * dt * 2.4;
          s.pos.z += (dz / l) * dt * 2.4;
        }
        s.mesh.position.set(s.pos.x, 0, s.pos.z);
        s.yaw += angleDelta(s.yaw, Math.atan2(dx, dz)) * dt * 4;
        s.mesh.rotation.y = s.yaw;
        if (s.rig) s.rig.head.rotation.x = -0.4;
      }
    } else {
      this.ui.freezeFrame(true);
    }
  }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
