/* ============================================================
   UI: экраны, лобби, HUD, голосования, титры.
   ============================================================ */

const $ = (id) => document.getElementById(id);

const MODE_TITLES = {
  lantern: 'ФОНАРЩИКИ',
  relay: 'ЭСТАФЕТА СВЕТА',
  inn: 'ПОСТОЯЛЫЙ ДВОР',
};

const MODE_RULES = {
  lantern: {
    keys: '<b>WASD</b> идти · <b>Shift</b> бежать · <b>E / ЛКМ</b> держать (кормить костёр / заряжать фонарь) · <b>L</b> фонарь вкл/выкл',
    lines: [
      'Четыре костра горят и тратят дрова. Носите дрова: подойдите к куче, потом к костру и держите E.',
      'Фонарь светит, но садится. Заряжается только у горящего костра (держите E без дров).',
      'Каждую минуту один из вас тайно становится Тенью на 30 секунд: у него гаснет фонарь. Тень гасит костёр удержанием E.',
      'Поймать Тень можно лучом фонаря: смотрите в её сторону и держитесь ближе 11 шагов.',
      'На рассвете голосуйте, кто уйдёт по мосту. Мест ровно столько, сколько костров дожило.',
    ],
  },
  relay: {
    keys: '<b>WASD</b> идти · <b>Shift</b> бежать · <b>Q</b> передать фонарь · <b>F / Space</b> крик · <b>E</b> заряжать у костра / разбить у алтаря',
    lines: [
      'Фонарь один на всех. Кто держит — видит далеко, остальные почти слепые.',
      'Фонарь садится. Заряжайте у костров, держа E.',
      'Q — передать ближайшему. Передача стоит немного заряда и требует быть рядом.',
      'Собиратель идёт на свет. Крик (F/Space) создаёт ложный огонёк и отвлекает его на 4 секунды.',
      'Дойдите до часовни и разбейте фонарь у алтаря. Тот, кто разобьёт, останется в лесу.',
    ],
  },
  inn: {
    keys: '<b>WASD</b> ходить · <b>E</b> (только «не гость») забрать гостя · <b>V</b> улики · голосование кнопками',
    lines: [
      'Пять циклов. Каждый цикл гаснет общая свеча и запирается одна комната.',
      'Каждому приходит улика. Часть улик — правда о том, кто где был. Часть — слухи.',
      'Один из вас — «не гость». Он может забрать гостя, если рядом нет свидетелей.',
      'В конце цикла голосуйте: кого запереть в подвале. На рассвете — финальное голосование «кто не гость».',
      'Если ошибётесь — побеждает «не гость».',
    ],
  },
};

export class UI {
  constructor() {
    this.lastVoteKey = '';
    this.cluesOpen = false;
    this.cluesTimer = 0;
    this.bannerTimer = 0;
  }

  setScreen(name) {
    for (const s of ['menu', 'lobby', 'rules', 'end']) {
      $('screen-' + s).classList.toggle('hidden', s !== name);
    }
    $('hud').classList.toggle('hidden', name !== 'game');
  }

  setNetState(text, bad = false) {
    const el = $('net-state');
    if (!el) return;
    el.textContent = text;
    el.style.color = bad ? '#ff8a7a' : '';
  }

  hideBoot() {
    const b = $('boot');
    b.classList.add('gone');
    setTimeout(() => b.classList.add('hidden'), 700);
  }

  netError(text) {
    const el = $('toast-net');
    el.textContent = text;
    el.classList.remove('hidden');
    clearTimeout(this._netTO);
    this._netTO = setTimeout(() => el.classList.add('hidden'), 4000);
  }

  /* ---------------- меню ---------------- */
  renderRooms(rooms) {
    const box = $('rooms');
    if (!rooms.length) { box.innerHTML = ''; return; }
    box.innerHTML = rooms.map((r) =>
      `<button class="room-pill" data-code="${r.code}"><b>${r.code}</b> · ${r.title} · ${r.players}/${r.max}</button>`
    ).join('');
  }

  renderRules() {
    $('rules-content').innerHTML = Object.entries(MODE_RULES).map(([k, v]) => `
      <div class="rule-block">
        <h3>${MODE_TITLES[k]}</h3>
        <ul>${v.lines.map((l) => `<li>${l}</li>`).join('')}</ul>
        <div class="keys">${v.keys}</div>
      </div>`).join('') + `
      <div class="rule-block">
        <h3>Как тестировать с друзьями</h3>
        <ul>
          <li>Один создаёт комнату и присылает друзьям ссылку (кнопка «ПОДЕЛИТЬСЯ» внизу) или код комнаты.</li>
          <li>Друзьям нужен только браузер. Если играете с одного компьютера — открывайте отдельные окна в режиме инкогнито.</li>
          <li>Можно добавить ботов и проверить режим в одиночку, прежде чем звать людей.</li>
          <li>После раунда кнопка «ЕЩЁ РАЗ» возвращает всех в лобби — не нужно заново собираться.</li>
        </ul>
      </div>`;
  }

  /* ---------------- лобби ---------------- */
  renderLobby(snap, me) {
    $('lobby-code').textContent = snap.code;
    $('lobby-mode').textContent = MODE_TITLES[snap.mode] || snap.mode;
    const max = snap.mode === 'inn' ? 16 : 16;
    $('lobby-count').textContent = snap.players.length + '/' + max;

    const ul = $('lobby-players');
    ul.innerHTML = snap.players.map((p) => `
      <li>
        <span class="dot" style="background:${p.color}"></span>
        <span>${escapeHtml(p.name)}</span>
        ${p.bot ? '<span class="bot-tag">БОТ</span>' : ''}
        ${p.id === me.id ? '<span class="you">ЭТО ТЫ</span>' : (p.ready ? '<span class="ok">ГОТОВ</span>' : '')}
        ${snap.host === p.id ? '<span class="bot-tag">ХОЗЯИН</span>' : ''}
      </li>`).join('');

    const rules = MODE_RULES[snap.mode];
    $('lobby-rules').innerHTML = `<ul>${rules.lines.slice(0, 4).map((l) => `<li>${l}</li>`).join('')}</ul>
      <div class="keys">${rules.keys}</div>`;

    $('share-link').value = location.origin + '/?room=' + snap.code;
    const isHost = snap.host === me.id;
    const mine = snap.players.find((p) => p.id === me.id);
    $('btn-ready').classList.toggle('hidden', isHost);
    $('btn-ready').textContent = mine && mine.ready ? 'Я НЕ ГОТОВ' : 'Я ГОТОВ';
    $('btn-start').classList.toggle('hidden', !isHost);
    $('lobby-hint').textContent = isHost
      ? 'ты хозяин: добавь ботов или запускай'
      : 'хозяин запускает игру, когда все готовы';
  }

  /* ---------------- HUD ---------------- */
  renderHud(snap, me) {
    const gs = snap.gs || {};
    $('hud-mode').textContent = MODE_TITLES[snap.mode] || '';
    $('hud-room').textContent = 'КОМНАТА ' + snap.code;

    const timer = $('hud-timer');
    if (snap.mode === 'lantern') {
      timer.textContent = gs.phase === 'vote' ? 'РАССВЕТ · ' + gs.voteIn + 'с'
        : (gs.phase === 'result' ? 'КОНЕЦ' : fmt(gs.dawnIn));
      timer.classList.toggle('warn', gs.phase !== 'play' || gs.dawnIn < 60);
    } else if (snap.mode === 'relay') {
      timer.textContent = fmt(gs.timeLeft || 0);
      timer.classList.toggle('warn', (gs.timeLeft || 0) < 60);
    } else {
      timer.textContent = 'ЦИКЛ ' + gs.cycle + '/' + gs.cycles + ' · ' + gs.cycleLeft + 'с';
      timer.classList.toggle('warn', gs.voteOpen);
    }

    // левый низ: ресурсы
    const stats = [];
    if (snap.mode === 'lantern') {
      const fires = (snap.world.fires || []).map((f, i) => `
        <div class="fire ${f.lit ? '' : 'out'}">
          <div class="lbl"><span>КОСТЁР ${i + 1}</span><span>${f.lit ? Math.round(f.fuel) + '%' : 'ПОГАС'}</span></div>
          <div class="track"><div class="fill" style="width:${f.lit ? f.fuel : 0}%"></div></div>
        </div>`).join('');
      stats.push(`<div class="fire-list">${fires}</div>`);
      const mine = snap.players.find((p) => p.id === me.id) || {};
      stats.push(`<div class="meter charge"><div class="lbl">ФОНАРЬ</div><div class="track"><div class="fill" style="width:${mine.charge || 0}%"></div></div></div>`);
      stats.push(`<div class="chip">ДРОВА <b>${mine.logs || 0}/2</b></div>`);
      if (mine.held) stats.push(`<div class="chip" style="color:#ff8a7a">ТЕБЯ ДЕРЖАТ — СОПРОТИВЛЯЙСЯ</div>`);
      if (gs.youShadow) stats.push(`<div class="chip" style="color:#ff8a7a">ТЕНЬ · <b>${gs.shadowUntil}с</b></div>`);
      else if (gs.shadowActive) stats.push(`<div class="chip" style="color:#ffab9a">КТО-ТО БЕЗ СВЕТА</div>`);
    } else if (snap.mode === 'relay') {
      const lant = gs.lantern || {};
      stats.push(`<div class="meter charge"><div class="lbl">ФОНАРЬ</div><div class="track"><div class="fill" style="width:${lant.charge || 0}%"></div></div></div>`);
      stats.push(`<div class="chip">${gs.youCarrier ? '<b>ТЫ ДЕРЖИШЬ ФОНАРЬ</b>' : 'ДЕРЖИТ: ' + (nameOf(snap, lant.heldBy) || 'на земле')}</div>`);
      stats.push(`<div class="chip">КРИК <b>${gs.shoutCooldown > 0 ? gs.shoutCooldown + 'с' : 'готов'}</b></div>`);
      const c = gs.collector || {};
      stats.push(`<div class="chip">СОБИРАТЕЛЬ <b>${c.dist}м</b></div>`);
      if (lant.onGround) stats.push(`<div class="chip" style="color:#ffab9a">ФОНАРЬ НА ЗЕМЛЕ — ПОДБЕРИТЕ</div>`);
      if (lant.smash > 0) stats.push(`<div class="chip" style="color:#ff8a7a">ЛОМАЕТ ФОНАРЬ: ${Math.ceil(7 - lant.smash)}с</div>`);
      if (gs.altarProg > 0) stats.push(`<div class="chip">АЛТАРЬ <b>${Math.round(gs.altarProg * 100)}%</b></div>`);
    } else {
      stats.push(`<div class="chip">ЖИВЫХ <b>${gs.aliveCount}</b></div>`);
      stats.push(`<div class="chip">ТЕЛ: <b>${(snap.world.bodies || []).length}</b></div>`);
      stats.push(`<div class="chip">СВЕЧЕЙ: <b>${(snap.world.candles || []).filter((c) => c.lit).length}/4</b></div>`);
      if (gs.youImpostor) stats.push(`<div class="chip" style="color:#ff8a7a">НЕ ГОСТЬ · ЗАБРАНО ${gs.kills}/${gs.killToWin}</div>`);
      if (gs.lockedRoom) stats.push(`<div class="chip">ЗАПЕРТО: <b>${roomName(snap, gs.lockedRoom)}</b></div>`);
      const mine = snap.players.find((p) => p.id === me.id) || {};
      if (mine.cellared) stats.push(`<div class="chip" style="color:#ff8a7a">ТЫ В ПОДВАЛЕ</div>`);
    }
    $('hud-stats').innerHTML = stats.join('');

    // роль
    const roleEl = $('hud-role');
    if (snap.mode === 'lantern' && gs.youShadow) {
      roleEl.textContent = 'ТЫ — ТЕНЬ · ' + gs.shadowUntil + 'с · погаси костёр';
      roleEl.classList.remove('hidden');
    } else if (snap.mode === 'inn' && gs.youImpostor) {
      roleEl.textContent = 'ТЫ — НЕ ГОСТЬ · забери ' + gs.killToWin + ' гостей';
      roleEl.classList.remove('hidden');
    } else if (snap.mode === 'relay' && gs.youCarrier) {
      roleEl.textContent = 'ТЫ ДЕРЖИШЬ ФОНАРЬ · Q — передать';
      roleEl.classList.remove('hidden');
    } else {
      roleEl.classList.add('hidden');
    }

    // подсказки
    const help = {
      lantern: 'E — кормить/заряжать · L — фонарь · Shift — бег',
      relay: 'Q — передать фонарь · F — крик · E — зарядить / разбить у алтаря',
      inn: 'E — забрать (только «не гость») · V — улики',
    };
    $('hud-help').textContent = help[snap.mode] || '';

    // голосование
    this._vote(snap, me);
    // улики
    this._clues(snap, me);
  }

  _vote(snap, me) {
    const gs = snap.gs || {};
    const box = $('vote');
    const isVote = (snap.mode === 'lantern' && gs.phase === 'vote') ||
                   (snap.mode === 'inn' && gs.voteOpen);
    if (!isVote) { box.classList.add('hidden'); this.lastVoteKey = ''; return; }

    const final = snap.mode === 'inn' && gs.stage === 'finalvote';
    const counts = final ? (gs.finalVotes || {}) : (gs.votes || {});
    const left = snap.mode === 'lantern' ? (gs.voteIn || 0) : (gs.voteLeft || 0);
    const alive = snap.players.filter((p) => p.alive !== false && p.id !== me.id &&
      !(snap.mode === 'inn' && p.cellared));
    const key = snap.mode + ':' + final + ':' + left + ':' + alive.map((p) => p.id).join(',') + ':' + gs.yourVote;
    if (key === this.lastVoteKey) return;
    this.lastVoteKey = key;

    const title = snap.mode === 'lantern'
      ? 'КТО УЙДЁТ ПО МОСТУ? ОСТАЛОСЬ ' + left + 'с'
      : (final ? 'КТО НЕ ГОСТЬ? ' + left + 'с' : 'КОГО В ПОДВАЛ? ' + left + 'с');

    box.innerHTML = `<div class="v-title"><span>${title}</span><span>${gs.yourVote ? 'голос отдан' : 'выбери'}</span></div>
      <div class="v-grid">${alive.map((p) => `
        <button data-target="${p.id}" class="${gs.yourVote === p.id ? 'voted' : ''}">
          ${escapeHtml(p.name)}${counts[p.id] ? `<span class="cnt">${counts[p.id]}</span>` : ''}
        </button>`).join('')}</div>`;
    box.classList.remove('hidden');
    box.querySelectorAll('button[data-target]').forEach((b) => {
      b.onclick = () => {
        if (this.onVote) this.onVote(b.dataset.target, final ? 'finalVote' : 'vote');
      };
    });
  }

  _clues(snap) {
    const gs = snap.gs || {};
    const box = $('clues');
    const has = snap.mode === 'inn' && Array.isArray(gs.clues) && gs.clues.length > 0;
    if (!has) { box.classList.add('hidden'); return; }
    const clues = gs.clues.slice(-6);
    const html = `<div class="c-title">УЛИКИ · V чтобы скрыть</div><ul>${clues.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>`;
    if (box.innerHTML !== html) box.innerHTML = html;
    const show = this.cluesOpen || performance.now() < this.cluesTimer;
    box.classList.toggle('hidden', !show);
  }

  showClueFlash() {
    this.cluesTimer = performance.now() + 6000;
  }

  toggleClues() {
    this.cluesOpen = !this.cluesOpen;
  }

  /* ---------------- уведомления ---------------- */
  toast(text, kind = 'info') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .5s'; }, 3600);
    setTimeout(() => el.remove(), 4200);
  }

  banner(kick, title, sub, ms = 3200) {
    const b = $('banner');
    b.innerHTML = `<div class="b-kick">${kick}</div><div class="b-title">${title}</div>${sub ? `<div class="b-sub">${sub}</div>` : ''}`;
    b.classList.remove('hidden');
    clearTimeout(this.bannerTO);
    this.bannerTO = setTimeout(() => b.classList.add('hidden'), ms);
  }

  /* ---------------- конец раунда ---------------- */
  showEnd(snap, me, onAgain, onMenu) {
    const summary = snap.summary || {};
    let kick = 'ИТОГ';
    let title = 'КОНЕЦ';
    let text = '';
    const rows = [];

    if (snap.mode === 'lantern') {
      const s = summary;
      const winners = (s.winners || []).map((id) => nameOf(snap, id)).filter(Boolean);
      kick = s.lit > 0 ? 'РАССВЕТ' : 'ТЬМА';
      title = s.lit > 0 ? 'МОСТ ВЫДЕРЖАЛ' : 'НИКТО НЕ УШЁЛ';
      text = s.lit > 0
        ? `Костров дожило: ${s.lit}. Ушли: ${winners.join(', ') || 'никто'}.`
        : 'Все костры погасли. Лес забрал всех.';
      rows.push(['костров', s.lit || 0], ['ушли', winners.length]);
    } else if (snap.mode === 'relay') {
      kick = summary.reason === 'altar' ? 'АЛТАРЬ' : 'ЛЕС';
      title = summary.reason === 'altar' ? 'ФОНАРЬ РАЗБИТ' : 'ФОНАРЬ ПОТЕРЯН';
      const hero = nameOf(snap, summary.sacrifice);
      text = summary.reason === 'altar'
        ? `${hero || 'Кто-то'} остался в лесу. Остальные вышли.`
        : (summary.text || 'До часовни не дошли.');
      rows.push(['причина', summary.reason === 'altar' ? 'жертва' : 'провал']);
    } else {
      const s = summary;
      const impNames = (s.impostors || []).map((id) => nameOf(snap, id)).filter(Boolean);
      kick = s.winner === 'guests' ? 'РАССВЕТ' : 'ТЬМА';
      title = s.winner === 'guests' ? 'ГОСТИ ВЫЧИСЛИЛИ' : 'НЕ ГОСТЬ ПОБЕДИЛ';
      text = (s.text || '') + (impNames.length ? ' «Не гость»: ' + impNames.join(', ') + '.' : '');
      rows.push(['забрано', s.kills || 0], ['улики', '—']);
    }

    $('end-kicker').textContent = kick;
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-stats').innerHTML = rows.map(([k, v]) => `<div><b>${v}</b><span>${k}</span></div>`).join('');
    $('btn-again').onclick = onAgain;
    $('btn-menu').onclick = onMenu;
    $('btn-again').classList.toggle('hidden', snap.host !== me.id);
    this.setScreen('end');
  }
}

/* ---------------- утилиты ---------------- */
export function fmt(sec) {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

export function nameOf(snap, id) {
  const p = (snap.players || []).find((q) => q.id === id);
  return p ? p.name : null;
}

export function roomName(snap, id) {
  const r = (snap.world.rooms || []).find((q) => q.id === id);
  return r ? r.name : '—';
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
