/* ============================================================
   Сеть: HTTP-поллинг 15 Гц. Работает через любой прокси и iframe.
   ============================================================ */
export async function api(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Ошибка ' + res.status));
  return data;
}

export async function listRooms() {
  const res = await fetch('/api/rooms', { cache: 'no-store' });
  return res.json();
}

export class Net {
  constructor(onSnapshot, onError) {
    this.onSnapshot = onSnapshot;
    this.onError = onError;
    this.room = null;      // {code, id, token, mode}
    this.timer = null;
    this.rate = 66;        // мс между синхронизациями
    this.actions = [];
    this.pending = false;
    this.failures = 0;
    this.lastOk = 0;
    this.inputProvider = null;
  }

  setRoom(room) {
    this.room = room;
  }

  queue(action) {
    if (this.actions.length < 12) this.actions.push(action);
  }

  start(rate = 66) {
    this.rate = rate;
    if (this.timer) clearTimeout(this.timer);
    const loop = async () => {
      await this.sync();
      this.timer = setTimeout(loop, this.rate);
    };
    loop();
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  async sync(inputArg) {
    if (!this.room || this.pending) return;
    const input = this.inputProvider ? this.inputProvider() : (inputArg || { mx: 0, my: 0, act: false, sprint: false });
    this.pending = true;
    try {
      const acts = this.actions.splice(0, 6);
      const snap = await api('/api/sync', {
        code: this.room.code,
        id: this.room.id,
        token: this.room.token,
        input,
        actions: acts,
      });
      this.failures = 0;
      this.lastOk = performance.now();
      this.onSnapshot(snap);
    } catch (e) {
      this.failures++;
      if (this.failures === 3) this.onError('связь с лесом потеряна…');
      if (this.failures > 12) {
        this.stop();
        this.onError('Сервер не отвечает. Перезагрузи страницу.');
      }
    } finally {
      this.pending = false;
    }
  }
}
