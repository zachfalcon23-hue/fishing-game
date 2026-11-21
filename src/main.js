import { GOOPS, SPOTS, UPGRADES, PHASES, FishingGame } from './game.js';
import { Scene, loadAssets, GOOP_ART } from './scene.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const game = new FishingGame();
const sfx = new Sfx();
let scene = null;

let reelHeld = false;   // pointer/keyboard currently holding reel
let tapLatch = false;   // a press happened since the last frame (so very short taps still count)
const pointer = { px: 0, py: 0 };
const newDex = new Set();

// ---------- icons ----------

const ICON = {
  Dawn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M5 8l2 2M19 8l-2 2"/></svg>',
  Day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  Dusk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 10V6M10 8l2 2 2-2"/></svg>',
  Night: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  clear: '',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15H7zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9h14M6 13h15M3 17h12"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 14M13 12l-3 5h4l-3 5"/></svg>',
  rod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 21 19 4M19 4v9a3 3 0 0 1-3 3M6 15a2 2 0 1 0 3 3"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="4"/><path d="M4 12v4c0 2.2 3.6 4 8 4s8-1.8 8-4v-4M12 8V3"/></svg>',
  lure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v4"/><ellipse cx="12" cy="11" rx="4" ry="5"/><path d="M12 16v2a3 3 0 1 1-3 3"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 5M22 9l-5 5"/></svg>',
};
const BAIT = { rain: 'RAIN', fog: 'FOG', storm: 'STORM', Night: 'NIGHT', Dawn: 'DAWN' };

// ---------- DOM helpers ----------

const PHASE_TAG = { idle: 'READY', cast: 'LINE OUT', bite: 'BITE!', fight: 'FIGHT!', caught: 'CAUGHT!', escaped: 'ESCAPED' };
const PHASE_CLASS = { bite: 'hot', fight: 'hot', caught: 'win', escaped: 'lose' };
const cache = {};
function setText(id, value) {
  value = String(value);
  if (cache[id] === value) return;
  cache[id] = value;
  $(id).textContent = value;
}
function setHTML(id, value) {
  if (cache[`h:${id}`] === value) return;
  cache[`h:${id}`] = value;
  $(id).innerHTML = value;
}

// ---------- panels ----------

const thumbs = {};
function renderDex() {
  const d = game.state.dex;
  const found = Object.keys(d).length;
  setText('dexCount', `${found} / ${GOOPS.length}`);
  setText('found', `${found}/${GOOPS.length}`);
  $('dexList').innerHTML = GOOPS.map((g) => {
    const e = d[g.id];
    const likes = [...(g.likes?.weather || []), ...(g.likes?.time || [])].map((k) => BAIT[k]).filter(Boolean);
    const fastest = e?.fastest != null ? ` · ${e.fastest.toFixed(1)}s` : '';
    return `<div class="dex-entry r-${g.rarity} ${e ? '' : 'locked'} ${newDex.has(g.id) ? 'new' : ''}">`
      + (likes.length ? `<span class="bait">${likes.join(' · ')}</span>` : '')
      + `<img src="${GOOP_ART(g.id)}" alt="${e ? g.name : 'Undiscovered Goop'}" loading="lazy" draggable="false">`
      + `<b>${e ? g.name : '???'}</b><small>${g.rarity.toUpperCase()}</small>`
      + `<span class="count">${e ? `Caught ×${e.count}${fastest}` : 'Not yet caught'}</span></div>`;
  }).join('');
}

function renderSpots() {
  const s = game.state;
  $('spotList').innerHTML = SPOTS.map((sp) => {
    const unlocked = s.unlocked.includes(sp.id);
    const current = s.spot === sp.id;
    const affordable = s.essence >= sp.cost;
    const label = current ? 'HERE' : unlocked ? 'GO' : `${sp.cost}`;
    const disabled = current || game.busy || (!unlocked && !affordable);
    const bg = thumbs[sp.id] ? `style="background-image:url(${thumbs[sp.id]})"` : '';
    return `<div class="spot ${current ? 'current' : ''} ${unlocked ? '' : 'locked'}" ${bg}><div><b>${sp.name}</b>`
      + `<small>${sp.goops.length} Goops · Essence ×${sp.essenceMul}${sp.rareMul > 1 ? ` · rare ×${sp.rareMul}` : ''}</small></div>`
      + `<button data-spot="${sp.id}" class="${current ? 'here' : unlocked ? 'go' : ''}" ${disabled ? 'disabled' : ''}>${unlocked ? label : `🔒 ${label}`}</button></div>`;
  }).join('');
}

function renderShop() {
  const s = game.state;
  $('shopList').innerHTML = Object.entries(UPGRADES).map(([kind, u]) => {
    const cost = game.upgradeCost(kind);
    const level = s.gear[kind];
    const pips = u.cost.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    const btn = cost == null
      ? '<button disabled>MAX</button>'
      : `<button data-buy="${kind}" ${s.essence < cost ? 'disabled' : ''}>${cost}</button>`;
    return `<div class="option"><span class="ico">${ICON[kind]}</span><div class="txt"><b>${u.name} · Lv ${level}/${u.cost.length}</b><small>${u.desc}</small><div class="pips">${pips}</div></div>${btn}</div>`;
  }).join('');
}

function renderNotes() {
  const pool = game.spot.goops.map((id) => GOOPS.find((g) => g.id === id));
  const seen = pool.filter((g) => game.state.dex[g.id]).length;
  setText('notes', `${game.spot.name}: ${seen} of ${pool.length} local Goops discovered. `
    + 'Weather and time of day change who bites — rain, fog, storms and nights each draw out special Goops.');
}

let lastLists = '';
function renderLists(force) {
  const s = game.state;
  const sig = JSON.stringify([s.essence, s.spot, s.unlocked, s.gear, Object.keys(s.dex).length, s.stats.caught, game.busy, Object.keys(thumbs).length]);
  if (!force && sig === lastLists) return;
  lastLists = sig;
  renderDex(); renderSpots(); renderShop(); renderNotes();
}

function renderFight() {
  const fight = game.fight;
  const active = game.phase === PHASES.FIGHT && fight;
  const hud = $('fightUi');
  hud.classList.toggle('dim', !active);
  if (!active) return;
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const inZone = fight.tension >= fight.safeLo && fight.tension <= fight.safeHi;
  hud.classList.toggle('in-zone', inZone);
  hud.classList.toggle('danger', fight.tension > 0.88 || fight.tension < 0.15);
  $('tensionBar').style.width = `${fight.tension * 100}%`;
  $('needle').style.left = `${fight.tension * 100}%`;
  $('safeZone').style.left = `${fight.safeLo * 100}%`;
  $('safeZone').style.width = `${(fight.safeHi - fight.safeLo) * 100}%`;
  $('progressBar').style.width = `${fight.progress * 100}%`;
  $('staminaBar').style.width = `${pct(fight.stamina / game.goop.stamina)}%`;
  setText('tensionText', `${pct(fight.tension)}%`);
  setText('progressText', `${pct(fight.progress)}%`);
  setText('staminaText', `${pct(fight.stamina / game.goop.stamina)}%`);
}

let shownEssence = null;
function renderEssence(dt) {
  const target = game.state.essence;
  if (shownEssence == null) shownEssence = target;
  if (shownEssence !== target) {
    const step = Math.max(1, Math.ceil(Math.abs(target - shownEssence) * dt * 6));
    shownEssence += Math.sign(target - shownEssence) * Math.min(step, Math.abs(target - shownEssence));
  }
  setText('essence', shownEssence);
}

let lastMessage = '';
function render(dt) {
  const p = game.phase;
  setText('phaseTag', PHASE_TAG[p]);
  const tag = $('phaseTag');
  tag.className = `chip phase ${PHASE_CLASS[p] || ''}`;
  const w = game.state.weather;
  setHTML('weatherTag', `${ICON[game.timeOfDay]}${ICON[w] || ''}<span>${game.weather.label} · ${game.timeOfDay}</span>`);
  if (game.message !== lastMessage) {
    lastMessage = game.message;
    setText('message', game.message);
    const m = $('message'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
  }
  renderEssence(dt);
  setText('day', game.state.day);
  setText('today', game.state.caughtToday);
  setText('total', game.state.stats.caught);
  setText('spotLabel', game.spot.name.toUpperCase());
  $('castBtn').disabled = game.busy;
  const reel = $('reelBtn');
  reel.classList.toggle('active', reelHeld);
  reel.classList.toggle('ready', p === PHASES.BITE && !reelHeld);
  reel.setAttribute('aria-pressed', String(reelHeld));
  if (p !== PHASES.CAUGHT) $('catchCard').hidden = true;
  sceneEl.classList.toggle('caught', p === PHASES.CAUGHT);
  renderFight();
  renderLists(false);
}

function showCatchCard(detail) {
  const g = GOOPS.find((x) => x.id === detail.goop);
  if (!g) return;
  const card = $('catchCard');
  const rc = { Common: 'var(--r-common)', Uncommon: 'var(--r-uncommon)', Rare: 'var(--r-rare)', Epic: 'var(--r-epic)' }[g.rarity];
  card.style.setProperty('--rc', rc);
  $('ccName').textContent = g.name;
  $('ccRarity').textContent = g.rarity.toUpperCase();
  $('ccReward').textContent = `+${detail.reward} Essence`;
  $('ccTime').textContent = `${(game.fight?.elapsed ?? 0).toFixed(1)}s fight`;
  $('ccNew').hidden = !detail.firstTime;
  card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

// ---------- events ----------

let pendingCatch = null;
function handleEvents() {
  for (const e of game.events.splice(0)) {
    scene?.onEvent(e, game);
    switch (e.type) {
      case 'cast': sfx.cast(); break;
      case 'bite': sfx.bite(); navigator.vibrate?.(60); break;
      case 'hooked': sfx.hook(); navigator.vibrate?.(30); break;
      case 'catch':
        if (e.detail.firstTime) newDex.add(e.detail.goop);
        lastLists = '';
        pendingCatch = e.detail;
        sfx.splash(true);
        break;
      case 'escaped': sfx.snap(); navigator.vibrate?.([40, 40, 80]); break;
      case 'missedBite': sfx.splash(); break;
      case 'upgrade': case 'unlock': sfx.coin(); lastLists = ''; break;
      case 'travel': lastLists = ''; break;
      case 'reset': newDex.clear(); lastLists = ''; shownEssence = null; break;
      default: break;
    }
  }
}

// ---------- loop ----------

let last = null;
let clickTimer = 0;
function loop(ts) {
  const dt = last == null ? 0 : Math.min(0.08, (ts - last) / 1000);
  last = ts;
  game.update(dt, { reel: reelHeld || tapLatch });
  tapLatch = false;
  handleEvents();
  if (scene) {
    scene.reeling = reelHeld && game.phase === PHASES.FIGHT;
    scene.render(game, dt, pointer);
    scene.trackPerf(dt);
  }
  if (game.phase === PHASES.FIGHT && reelHeld) {
    clickTimer -= dt;
    if (clickTimer <= 0) { sfx.click(game.fight?.tension ?? 0.5); clickTimer = 0.07; if ((game.fight?.tension ?? 0) > 0.9) sfx.strain(); }
  }
  sfx.setAmbience({ night: game.timeOfDay === 'Night' || game.timeOfDay === 'Dusk', rain: ['rain', 'storm'].includes(game.state.weather) ? game.state.weather : null });
  render(dt);
  requestAnimationFrame(loop);
}

// ---------- input ----------

function press() { sfx.unlock(); reelHeld = true; tapLatch = true; }
function release() { reelHeld = false; }
function cast() { sfx.unlock(); if (game.cast()) { reelHeld = false; lastLists = ''; $('catchCard').hidden = true; } }

const reelBtn = $('reelBtn');
reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
reelBtn.addEventListener('contextmenu', (e) => e.preventDefault());
reelBtn.addEventListener('click', (e) => e.preventDefault());
$('castBtn').addEventListener('click', () => { cast(); $('castBtn').blur(); });

// Tapping the scene itself: cast when idle, otherwise act as the reel button.
const sceneEl = $('scene');
sceneEl.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (game.busy) { e.preventDefault(); press(); } else cast();
});
sceneEl.addEventListener('pointermove', (e) => {
  const r = sceneEl.getBoundingClientRect();
  if (e.pointerType !== 'mouse') return;
  pointer.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
  pointer.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
});
sceneEl.addEventListener('pointerleave', () => { pointer.px = 0; pointer.py = 0; });
sceneEl.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); press(); }
  else if (e.code === 'KeyC' || e.code === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON' || e.code === 'KeyC') { e.preventDefault(); cast(); } }
  else if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') { e.preventDefault(); release(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); last = null; });

$('spotList').addEventListener('click', (e) => {
  const id = e.target.closest('[data-spot]')?.dataset.spot;
  if (id && game.travel(id)) { lastLists = ''; sceneEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});
$('shopList').addEventListener('click', (e) => {
  const kind = e.target.closest('[data-buy]')?.dataset.buy;
  if (kind && game.buyUpgrade(kind)) { lastLists = ''; const w = document.querySelector('.wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
});
$('resetBtn').addEventListener('click', () => {
  if (confirm('Reset your GoopDex, Essence and upgrades?')) { game.reset(); lastLists = ''; }
});

function toggleMute() { sfx.unlock(); sfx.setMuted(!sfx.muted); paintMute(); }
function paintMute() { const b = $('muteBtn'); b.innerHTML = sfx.muted ? ICON.soundOff : ICON.soundOn; b.setAttribute('aria-pressed', String(sfx.muted)); }
$('muteBtn').addEventListener('click', toggleMute);
paintMute();

let resizeRaf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(resizeRaf); resizeRaf = requestAnimationFrame(() => scene?.resize()); });

// ---------- boot ----------

async function boot() {
  renderLists(true);
  const assets = await loadAssets(GOOPS.map((g) => g.id), (p) => {
    $('loadFill').style.width = `${Math.round(p * 100)}%`;
    $('loadFill').parentElement.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  });
  scene = new Scene(canvas, assets, GOOPS);
  scene.onSplash = () => sfx.splash();
  scene.onReveal = () => { if (pendingCatch) { showCatchCard(pendingCatch); sfx.catch(GOOPS.find((g) => g.id === pendingCatch.goop)?.rarity); pendingCatch = null; } };
  scene.onThunder = () => sfx.thunder();
  window.__goop = { game, scene };
  // Travel-card thumbnails rendered from the live layers (deferred so the first frame is not delayed).
  setTimeout(() => {
    for (const sp of SPOTS) { try { thumbs[sp.id] = scene.thumbnail(sp.id, 'Night', 360).toDataURL('image/webp', 0.8); } catch { /* ignore */ } }
    lastLists = '';
  }, 300);
  $('loadHint').textContent = 'The Goops are biting.';
  const start = $('startBtn');
  start.hidden = false;
  const go = () => { sfx.unlock(); $('loader').classList.add('gone'); };
  start.addEventListener('click', go, { once: true });
  if (new URLSearchParams(location.search).has('skipintro')) go();
  requestAnimationFrame(loop);
}
boot();
