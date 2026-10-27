/* ============================================================
   Ввод: WASD, мышь (прицел), E/ЛКМ — действие, Shift — бег,
   Q — передать фонарь (эстафета), F — крик (эстафета),
   L — фонарь вкл/выкл (Фонарщики), V — улики (Двор).
   ============================================================ */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, down: false };
    this.onAction = null;   // (type) => void  — для одноразовых действий

    this._down = (e) => {
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyQ' && this.onAction) this.onAction('pass');
      if (k === 'KeyF' && this.onAction) this.onAction('shout');
      if (k === 'KeyL' && this.onAction) this.onAction('lantern');
      if (k === 'KeyV' && this.onAction) this.onAction('clues');
      if (k === 'Space' && this.onAction) this.onAction('shout');
    };
    this._up = (e) => this.keys.delete(e.code);
    this._move = (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left;
      this.mouse.y = e.clientY - r.top;
    };
    this._md = (e) => { if (e.button === 0) this.mouse.down = true; };
    this._mu = () => { this.mouse.down = false; };
    this._blur = () => { this.keys.clear(); this.mouse.down = false; };

    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('mousemove', this._move);
    window.addEventListener('mousedown', this._md);
    window.addEventListener('mouseup', this._mu);
    window.addEventListener('blur', this._blur);
  }

  /** состояние для сервера */
  state(playerScreen) {
    let mx = 0, my = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) my -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) my += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) mx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) mx += 1;
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    const st = {
      mx, my,
      act: this.keys.has('KeyE') || this.mouse.down,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
    };
    if (playerScreen && Number.isFinite(playerScreen.x)) st.aim = this.aimAngle(playerScreen);
    return st;
  }

  /** направление взгляда от игрока к курсору (экранные координаты) */
  aimAngle(playerScreen) {
    if (!playerScreen) return 0;
    return Math.atan2(this.mouse.y - playerScreen.y, this.mouse.x - playerScreen.x);
  }
}
