import { clamp, angleDelta, TAU } from '../core/rng.js';

/* ============================================================
   UI — DOM HUD, compass, subtitles, screens.
   ============================================================ */
export class UI {
  constructor() {
    this.el = {
      app: document.getElementById('app'),
      hud: document.getElementById('hud'),
      objText: document.getElementById('obj-text'),
      objCount: document.getElementById('obj-count'),
      hearts: [...document.querySelectorAll('#hearts i')],
      noise: document.getElementById('noise-fill'),
      dread: document.getElementById('dread-fill'),
      lantern: document.getElementById('lantern-state'),
      lanternValue: document.getElementById('lantern-value'),
      flame: document.getElementById('flame-ico'),
      compassTape: document.getElementById('compass-tape'),
      compassTarget: document.getElementById('compass-target'),
      subtitle: document.getElementById('subtitle'),
      prompt: document.getElementById('prompt'),
      crosshair: document.getElementById('crosshair'),
      flash: document.getElementById('flash'),
      freeze: document.getElementById('freeze'),
      clock: document.getElementById('clock'),
      title: document.getElementById('screen-title'),
      howto: document.getElementById('screen-howto'),
      pause: document.getElementById('screen-pause'),
      end: document.getElementById('screen-end'),
      boot: document.getElementById('loading'),
      bootFill: document.getElementById('boot-fill'),
      bootNote: document.getElementById('boot-note'),
      pingHint: document.getElementById('ping-hint'),
      endKicker: document.getElementById('end-kicker'),
      endTitle: document.getElementById('end-title'),
      endText: document.getElementById('end-text'),
      endStats: document.getElementById('end-stats'),
    };
    this._subTimer = 0;
    this._flashTimer = 0;
    this._buildCompass();
    this._buildHearts();
  }

  _buildCompass() {
    const tape = this.el.compassTape;
    tape.innerHTML = '';
    this.tapeItems = [];
    const cards = { 0: 'С', 90: 'В', 180: 'Ю', 270: 'З' };
    for (let deg = 0; deg < 360; deg += 15) {
      const s = document.createElement('span');
      const isCard = cards[deg] !== undefined;
      s.textContent = isCard ? cards[deg] : '·';
      s.className = isCard ? 'card' : '';
      if (isCard) s.style.fontSize = '12px';
      tape.appendChild(s);
      this.tapeItems.push({ el: s, deg, isCard });
    }
  }

  _buildHearts() {
    this.hearts = this.el.hearts;
    this.maxHearts = this.hearts.length;
  }

  setHearts(n) {
    this.hearts.forEach((h, i) => {
      h.classList.toggle('lost', i >= n);
    });
  }

  hitHeart(n) {
    const h = this.hearts[n];
    if (!h) return;
    h.classList.remove('hit');
    void h.offsetWidth;
    h.classList.add('hit');
  }

  showHud(v) { this.el.hud.classList.toggle('hidden', !v); }

  setObjective(text, count) {
    this.el.objText.textContent = text;
    this.el.objCount.textContent = count;
  }

  setNoise(v) {
    this.el.noise.style.right = `${(1 - clamp(v, 0, 1)) * 100}%`;
  }

  setDread(v) {
    this.el.dread.style.right = `${(1 - clamp(v, 0, 1)) * 100}%`;
  }

  setLantern(on, stunned = false) {
    this.el.lantern.classList.toggle('off', !on);
    this.el.lantern.classList.toggle('stunned', stunned);
    this.el.lanternValue.textContent = stunned ? 'эхо' : on ? 'зажжён' : 'погашен';
    this.el.flame.style.opacity = on || stunned ? '1' : '.25';
  }

  setClock(minutes) {
    // night starts at 23:40 and creeps forward with play time
    const total = 23 * 60 + 40 + Math.floor(minutes);
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    this.el.clock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setCompass(yaw, bearing) {
    const halfFov = Math.PI / 2; // ±90°
    for (const item of this.tapeItems) {
      const world = (item.deg * Math.PI) / 180;
      const diff = angleDelta(yaw, world);
      if (Math.abs(diff) > halfFov * 1.15) { item.el.style.opacity = '0'; continue; }
      const x = 50 + (diff / halfFov) * 50;
      item.el.style.left = `${x}%`;
      const fade = 1 - Math.min(1, Math.abs(diff) / halfFov) * 0.85;
      item.el.style.opacity = String(item.isCard ? fade : fade * 0.6);
    }
    if (bearing === null || bearing === undefined) {
      this.el.compassTarget.style.opacity = '0';
      return;
    }
    const diff = angleDelta(yaw, bearing);
    if (Math.abs(diff) > halfFov) {
      this.el.compassTarget.style.opacity = '0';
      const edge = diff > 0 ? 'calc(100% - 6px)' : '6px';
      this.el.compassTarget.style.left = edge;
      this.el.compassTarget.style.opacity = '.45';
      this.el.compassTarget.textContent = diff > 0 ? '›' : '‹';
      return;
    }
    this.el.compassTarget.textContent = '◆';
    this.el.compassTarget.style.left = `${50 + (diff / halfFov) * 50}%`;
    this.el.compassTarget.style.opacity = '1';
  }

  crosshairAim(v) { this.el.crosshair.classList.toggle('aim', !!v); }

  subtitle(text, { type = 'whisper', duration = 5 } = {}) {
    const el = this.el.subtitle;
    el.textContent = text;
    el.className = `subtitle on ${type === 'warn' ? 'warn' : 'whisper'}`;
    this._subTimer = duration;
  }

  clearSubtitle() {
    this.el.subtitle.classList.remove('on');
    this._subTimer = 0;
  }

  prompt(text, progress = null) {
    const el = this.el.prompt;
    el.classList.remove('hidden');
    if (progress === null) {
      el.innerHTML = text;
    } else {
      el.innerHTML = `${text}<span class="bar"><i style="width:${clamp(progress, 0, 1) * 100}%"></i></span>`;
    }
  }

  hidePrompt() { this.el.prompt.classList.add('hidden'); }

  flash(type = 'white', ms = 160) {
    const f = this.el.flash;
    f.className = `fx-layer flash on ${type}`;
    clearTimeout(this._flashTO);
    this._flashTO = setTimeout(() => {
      f.className = 'fx-layer flash';
    }, ms);
  }

  freezeFrame(on) {
    this.el.freeze.classList.toggle('on', on);
  }

  hurt() {
    this.el.app.classList.add('hurt');
    clearTimeout(this._hurtTO);
    this._hurtTO = setTimeout(() => this.el.app.classList.remove('hurt'), 700);
  }

  lowLife(on) { this.el.app.classList.toggle('lowlife', on); }
  stalked(on) { this.el.app.classList.toggle('stalked', on); }

  showScreen(name) {
    for (const key of ['title', 'howto', 'pause', 'end']) {
      this.el[key].classList.toggle('hidden', key !== name);
    }
    if (!name) {
      for (const key of ['title', 'howto', 'pause', 'end']) this.el[key].classList.add('hidden');
    }
  }

  showEnd({ win, time, pings, shrines, hits }) {
    this.el.endKicker.textContent = win ? 'ОБРЯД ЗАВЕРШЁН' : 'ОБРЯД ПРЕРВАН';
    this.el.endTitle.innerHTML = win ? 'ЛЕС ПРИНЯЛ<br/>ДАР' : 'ЛЕС ЗАБРАЛ<br/>ТЕБЯ';
    this.el.endText.textContent = win
      ? 'Четыре огня — и он отступил. До следующей осени.'
      : 'Ты слышал его шаги. А он — твои.';
    const mm = Math.floor(time / 60), ss = Math.floor(time % 60);
    this.el.endStats.innerHTML = `
      <div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>в лесу</span></div>
      <div><b>${shrines}/4</b><span>тотемов</span></div>
      <div><b>${pings}</b><span>эхо</span></div>
      <div><b>${hits}</b><span>ранений</span></div>`;
    this.showScreen('end');
  }

  boot(p, note) {
    this.el.bootFill.style.width = `${clamp(p, 0, 1) * 100}%`;
    if (note) this.el.bootNote.textContent = note;
  }

  hideBoot() {
    this.el.boot.classList.add('gone');
    setTimeout(() => this.el.boot.classList.add('hidden'), 900);
  }

  hidePingHint() {
    this.el.pingHint.style.opacity = '0';
  }

  tick(dt) {
    if (this._subTimer > 0) {
      this._subTimer -= dt;
      if (this._subTimer <= 0) this.el.subtitle.classList.remove('on');
    }
  }
}
