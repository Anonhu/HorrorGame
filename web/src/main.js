import './style.css';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';

/* ============================================================
   ЛЕС СЛУШАЕТ — boot + menus
   ============================================================ */
const ui = new UI();
const game = new Game(ui);
window.__game = game; // handy for debugging / automated checks

const $ = (id) => document.getElementById(id);
const isTouch = window.matchMedia('(pointer: coarse)').matches;

function syncHowtoForInput() {
  const keys = document.querySelector('#screen-howto .keys');
  if (!keys) return;
  if (isTouch) {
    keys.innerHTML = `
      <li><b>левый палец</b> идти</li>
      <li><b>правый палец</b> смотреть</li>
      <li><b>двойной тап</b> эхо</li>
      <li><b>три пальца</b> фонарь</li>`;
  }
}

async function boot() {
  syncHowtoForInput();
  await game.init();

  $('btn-start').addEventListener('click', async () => {
    $('screen-title').classList.add('hidden');
    // pointer lock needs the gesture: request it before any await
    game.input.canvas?.requestPointerLock?.();
    await game.start();
    game.input.requestLock();
  });

  $('btn-howto').addEventListener('click', () => {
    ui.showScreen('howto');
  });
  $('btn-howto-back').addEventListener('click', () => {
    ui.showScreen(game.state === 'paused' ? 'pause' : 'title');
  });

  const btnSound = $('btn-sound');
  btnSound.addEventListener('click', () => {
    const on = !game.audio.enabled;
    game.audio.setEnabled(on);
    btnSound.textContent = `ЗВУК: ${on ? 'ВКЛ' : 'ВЫКЛ'}`;
  });

  $('btn-resume').addEventListener('click', () => game.resume());
  $('btn-pause-howto').addEventListener('click', () => ui.showScreen('howto'));
  $('btn-quit').addEventListener('click', () => game.quitToMenu());
  $('btn-retry').addEventListener('click', () => game.restart());
  $('btn-end-menu').addEventListener('click', () => game.quitToMenu());

  $('opt-sens').addEventListener('input', (e) => {
    game.input.sensitivity = parseFloat(e.target.value);
  });
  $('opt-vol').addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    game.audio.setVolume(v);
    game.audio.enabled = v > 0.001;
    $('btn-sound').textContent = `ЗВУК: ${game.audio.enabled ? 'ВКЛ' : 'ВЫКЛ'}`;
  });
  $('opt-quality').addEventListener('change', (e) => game.setQuality(e.target.value));

  // Esc → pause (pointer lock usually handles this, but keyboards vary)
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (game.state === 'playing') game.pause();
    }
    if (e.code === 'KeyP' && game.state === 'paused') game.resume();
  });

  // clicking the canvas after a lost lock re-captures it
  document.getElementById('gl').addEventListener('click', () => {
    if (game.state === 'playing' && !game.input.locked) game.input.requestLock();
  });

  window.addEventListener('blur', () => {
    if (game.state === 'playing') game.pause();
  });

  // audio needs a first gesture; wire it to any pointer down once
  const armAudio = () => {
    game.audio.start();
    window.removeEventListener('pointerdown', armAudio);
  };
  window.addEventListener('pointerdown', armAudio, { once: true });
}

boot().catch((err) => {
  console.error(err);
  const note = document.getElementById('boot-note');
  if (note) {
    note.textContent = 'не удалось разбудить лес — открой консоль';
    note.style.color = '#d2452b';
  }
});
