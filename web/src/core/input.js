/* ============================================================
   INPUT — keyboard + mouse (pointer lock) + basic touch.
   Exposes a live state object; the game reads it each frame.
   ============================================================ */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouse = { dx: 0, dy: 0, down: false };
    this.locked = false;
    this.hasLockedOnce = false;
    this.freeLook = false;      // iframe / permissions fallback
    this.sensitivity = 1;
    this.enabled = false;
    this.actions = { ping: false, lantern: false, interactHeld: false, interactPressed: false };

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'KeyE', 'KeyF', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
        e.preventDefault();
      }
      if (e.repeat) return;
      this.keys.add(k);
      if (k === 'KeyE') this.actions.ping = true;
      if (k === 'KeyF') this.actions.lantern = true;
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (!this.locked && !this.freeLook && !this.touchId) return;
      this.mouse.dx += e.movementX || 0;
      this.mouse.dy += e.movementY || 0;
    };
    this._onMouseDown = (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.actions.ping = true;
      if (e.button === 2) this.actions.lantern = true;
      this.mouse.down = true;
    };
    this._onMouseUp = () => { this.mouse.down = false; };
    this._onContext = (e) => e.preventDefault();
    this._onPointerLock = () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.locked) { this.hasLockedOnce = true; this.freeLook = false; }
    };
    this._onPointerLockError = () => { this.freeLook = true; };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('contextmenu', this._onContext);
    document.addEventListener('pointerlockchange', this._onPointerLock);
    document.addEventListener('pointerlockerror', this._onPointerLockError);

    this._touch();
  }

  _touch() {
    const el = document.getElementById('app');
    this.touchMove = { x: 0, y: 0 };
    this.touchLook = false;
    this.touchId = null;
    this.lookId = null;
    this.lastTouch = { x: 0, y: 0 };
    this.touchButtons = false;

    el.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.target.closest('button, input, select')) continue;
        const left = t.clientX < window.innerWidth * 0.45;
        if (left && this.touchId === null) {
          this.touchId = t.identifier;
          this.touchMove = { x: t.clientX, y: t.clientY, cx: t.clientX, cy: t.clientY };
        } else if (!left && this.lookId === null) {
          this.lookId = t.identifier;
          this.lastTouch = { x: t.clientX, y: t.clientY };
        } else if (e.touches.length >= 3) {
          this.actions.lantern = true;
        }
      }
      e.preventDefault();
    }, { passive: false });

    el.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          const dx = t.clientX - this.touchMove.cx;
          const dy = t.clientY - this.touchMove.cy;
          const max = 54;
          this.touchMove.x = Math.max(-max, Math.min(max, dx)) / max;
          this.touchMove.y = Math.max(-max, Math.min(max, dy)) / max;
        } else if (t.identifier === this.lookId) {
          this.mouse.dx += (t.clientX - this.lastTouch.x) * 2.0;
          this.mouse.dy += (t.clientY - this.lastTouch.y) * 2.0;
          this.lastTouch = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });

    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.touchId) {
          this.touchId = null;
          this.touchMove = { x: 0, y: 0 };
        }
        if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  requestLock() {
    if (!this.canvas.requestPointerLock) { this.freeLook = true; return; }
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.freeLook = true; });
    } catch {
      this.freeLook = true;
    }
    // some browsers silently refuse inside iframes: fall back to raw mouse look
    clearTimeout(this._lockTO);
    this._lockTO = setTimeout(() => {
      if (!this.locked) { this.freeLook = true; this.onLockFail?.(); }
    }, 700);
  }

  exitLock() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.freeLook = false;
  }

  /** consume frame-accumulated look delta */
  readLook() {
    const s = 0.0022 * this.sensitivity;
    const out = { yaw: -this.mouse.dx * s, pitch: -this.mouse.dy * s };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return out;
  }

  axis() {
    let x = 0, z = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) z -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) z += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    x += this.touchMove.x || 0;
    z += this.touchMove.y || 0;
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  get sprint() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get crouch() { return this.keys.has('ControlLeft') || this.keys.has('KeyC'); }

  consume() {
    const a = { ...this.actions };
    this.actions.ping = false;
    this.actions.lantern = false;
    this.actions.interactPressed = false;
    return a;
  }

  reset() {
    this.keys.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.touchMove = { x: 0, y: 0 };
    this.actions = { ping: false, lantern: false, interactHeld: false, interactPressed: false };
  }
}
