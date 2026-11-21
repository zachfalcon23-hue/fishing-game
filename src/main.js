import { GOOPS, SPOTS, UPGRADES, NOTES, PHASES, FishingGame, conditionText } from './game.js';
import { Scene, loadAssets, GOOP_ART, SPOT_X, SPOT_GAP, WORLD_MIN, WORLD_MAX } from './scene.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const sceneEl = $('scene');
const game = new FishingGame();
const sfx = new Sfx();
let scene = null;

let reelHeld = false;
let tapLatch = false;
const pointer = { px: 0, py: 0 };
const newDex = new Set();
const keys = { left: false, right: false };
const held = { left: false, right: false, drag: 0 };
const walker = { x: SPOT_X[game.state.spot], v: 0, target: null, step: 0 };
const WALK_SPEED = 950;
let dexFilter = 'all';
const snaps = {};

// ---------- icons ----------

const ICON = {
  Dawn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 4v3M5 8l2 2M19 8l-2 2"/></svg>',
  Day: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/></svg>',
  Dusk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 18h16M7 14a5 5 0 0 1 10 0M12 10V6M10 8l2 2 2-2"/></svg>',
  Night: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>',
  rain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 15H7zM8 18l-1 3M12 18l-1 3M16 18l-1 3"/></svg>',
  fog: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9h14M6 13h15M3 17h12"/></svg>',
  storm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 14a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 14M13 12l-3 5h4l-3 5"/></svg>',
  rod: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 21 19 4M19 4v9a3 3 0 0 1-3 3M6 15a2 2 0 1 0 3 3"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="4"/><path d="M4 12v4c0 2.2 3.6 4 8 4s8-1.8 8-4v-4M12 8V3"/></svg>',
  lure: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v4"/><ellipse cx="12" cy="11" rx="4" ry="5"/><path d="M12 16v2a3 3 0 1 1-3 3"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 5M22 9l-5 5"/></svg>',
};
const TAG = { rain: 'RAIN', fog: 'FOG', storm: 'STORM', clear: 'CLEAR', Night: 'NIGHT', Dawn: 'DAWN', Day: 'DAY', Dusk: 'DUSK' };

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
const spotName = (id) => SPOTS.find((s) => s.id === id)?.name || id;

// ---------- panels ----------

function renderDexTabs() {
  const tabs = [['all', 'ALL'], ...SPOTS.map((s) => [s.id, game.state.discovered.includes(s.id) ? s.name.replace(/^The /, '').toUpperCase() : '???'])];
  setHTML('dexTabs', tabs.map(([id, label]) => {
    const p = id === 'all' ? { found: game.dexCount, total: GOOPS.length } : game.spotProgress(id);
    return `<button role="tab" data-tab="${id}" class="${dexFilter === id ? 'on' : ''}" aria-selected="${dexFilter === id}">${label} <i>${p.found}/${p.total}</i></button>`;
  }).join(''));
}

function renderDex() {
  const d = game.state.dex;
  setText('dexCount', `${game.dexCount} / ${GOOPS.length}`);
  setText('dexPill', `${game.dexCount}/${GOOPS.length}`);
  renderDexTabs();
  const list = dexFilter === 'all' ? GOOPS : GOOPS.filter((g) => g.spots.includes(dexFilter));
  $('dexList').innerHTML = list.map((g) => {
    const e = d[g.id];
    const seen = game.state.seen.includes(g.id);
    const n = GOOPS.indexOf(g) + 1;
    const status = e ? `×${e.count}${e.best ? ` · ${e.best} cm` : ''}` : seen ? 'Seen — not caught' : 'Undiscovered';
    return `<button class="dex-entry r-${g.rarity} ${e ? '' : 'locked'} ${seen && !e ? 'seen' : ''} ${newDex.has(g.id) ? 'new' : ''}" data-goop="${g.id}">`
      + `<span class="num">#${String(n).padStart(2, '0')}</span>${e?.shiny ? '<span class="shiny" title="Shiny caught">✦</span>' : ''}`
      + `<img src="${GOOP_ART(g.id)}" alt="" loading="lazy" draggable="false" class="${e?.shiny ? 'is-shiny' : ''}">`
      + `<b>${e || seen ? g.name : '???'}</b><small>${g.rarity.toUpperCase()}</small><span class="count">${status}</span></button>`;
  }).join('');
}

function openDexDetail(id) {
  const g = GOOPS.find((x) => x.id === id);
  if (!g) return;
  const e = game.state.dex[id];
  const seen = game.state.seen.includes(id);
  const knows = game.knows(id);
  const dlg = $('dexDetail');
  dlg.style.setProperty('--rc', `var(--r-${g.rarity.toLowerCase()})`);
  $('ddImg').src = GOOP_ART(id);
  $('ddImg').className = e ? (e.shiny ? 'is-shiny' : '') : 'locked';
  $('ddRarity').textContent = `#${String(GOOPS.indexOf(g) + 1).padStart(2, '0')} · ${g.rarity.toUpperCase()}`;
  $('ddName').textContent = e || seen ? g.name : '???';
  $('ddWhere').textContent = knows ? conditionText(g) : seen ? `Lives at ${g.spots.map(spotName).join(' & ')}` : 'Habitat unknown — keep exploring and look for field notes.';
  $('ddStats').innerHTML = e
    ? `<div><span>CAUGHT</span><b>${e.count}</b></div><div><span>BIGGEST</span><b>${e.best ?? '—'} cm</b></div><div><span>FASTEST</span><b>${e.fastest != null ? `${e.fastest.toFixed(1)}s` : '—'}</b></div><div><span>SHINY</span><b>${e.shiny ? `✦ ${e.shiny}` : '—'}</b></div>`
    : `<div><span>SIZE RANGE</span><b>${knows ? `${g.size[0]}–${g.size[1]} cm` : '???'}</b></div><div><span>FIGHT</span><b>${seen ? g.pattern[0].toUpperCase() + g.pattern.slice(1) : '???'}</b></div>`;
  $('ddHint').textContent = e || seen ? g.hint : '';
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}

function renderSpots() {
  const s = game.state;
  $('spotList').innerHTML = SPOTS.map((sp) => {
    const open = game.spotUnlocked(sp.id);
    const found = s.discovered.includes(sp.id);
    const here = game.here && s.spot === sp.id;
    const p = game.spotProgress(sp.id);
    const done = s.completed.includes(sp.id);
    const bg = snaps[sp.id] ? `style="background-image:url(${snaps[sp.id]})"` : '';
    const sub = !open ? `GoopDex ${game.dexCount}/${sp.unlockAt} to clear the path` : !found ? 'Not yet visited' : `${p.found}/${p.total} Goops${done ? ' · ✓ complete' : ''} · Essence ×${sp.essenceMul}`;
    const btn = here ? '<button class="here" disabled>HERE</button>' : open ? `<button class="go" data-walk="${sp.id}" ${game.busy ? 'disabled' : ''}>WALK</button>` : '<button disabled>🔒</button>';
    return `<div class="spot ${here ? 'current' : ''} ${open ? '' : 'locked'} ${done ? 'done' : ''}" ${bg}><div><b>${open || found ? sp.name : '???'}</b><small>${sub}</small>`
      + `<div class="spot-bar"><i style="width:${(p.found / p.total) * 100}%"></i></div></div>${btn}</div>`;
  }).join('');
}

function renderNotes() {
  const found = game.state.notes;
  setText('notesCount', `${found.length} / ${NOTES.length}`);
  setText('shinies', game.state.stats.shiny);
  $('noteList').innerHTML = found.length
    ? found.map((id) => { const n = NOTES.find((x) => x.id === id); const g = GOOPS.find((x) => x.id === n.reveals); return `<p><b>${g.name}</b> — ${conditionText(g)}</p>`; }).join('')
    : '<p class="muted">Glowing bottles wash up along the shore. Tap one to read it — each reveals where a rare Goop hides.</p>';
}

function renderShop() {
  const s = game.state;
  $('shopList').innerHTML = Object.entries(UPGRADES).map(([kind, u]) => {
    const cost = game.upgradeCost(kind);
    const level = s.gear[kind];
    const pips = u.cost.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('');
    const btn = cost == null ? '<button disabled>MAX</button>' : `<button data-buy="${kind}" ${s.essence < cost ? 'disabled' : ''}>${cost}</button>`;
    return `<div class="option"><span class="ico">${ICON[kind]}</span><div class="txt"><b>${u.name} · Lv ${level}/${u.cost.length}</b><small>${u.desc}</small><div class="pips">${pips}</div></div>${btn}</div>`;
  }).join('');
}

function renderMinimap() {
  const s = game.state;
  const span = WORLD_MAX - WORLD_MIN;
  const pct = (x) => `${((x - WORLD_MIN) / span) * 92 + 4}%`;
  const pins = SPOTS.map((sp) => {
    const open = game.spotUnlocked(sp.id);
    const p = game.spotProgress(sp.id);
    const cls = [open ? 'open' : 'locked', s.spot === sp.id && game.here ? 'here' : '', s.completed.includes(sp.id) ? 'done' : ''].join(' ');
    const label = open || s.discovered.includes(sp.id) ? sp.name.replace(/^The /, '') : '???';
    return `<button class="mm-pin ${cls}" style="left:${pct(SPOT_X[sp.id])}" data-walk="${sp.id}" title="${label}${open ? ` · ${p.found}/${p.total}` : ` · needs GoopDex ${sp.unlockAt}`}" aria-label="${label}"><i>${open ? '' : '🔒'}</i><span>${label}</span></button>`;
  }).join('');
  setHTML('minimap', `<div class="mm-track"></div>${pins}<span class="mm-me" id="mmMe"></span>`);
  const me = $('mmMe');
  if (me) me.style.left = pct(walker.x);
}

let lastLists = '';
function renderLists(force) {
  const s = game.state;
  const sig = JSON.stringify([s.essence, s.spot, game.here, s.discovered, s.gear, game.dexCount, s.stats.caught, s.notes.length, s.completed, game.busy, dexFilter, Object.keys(snaps).length, s.seen.length]);
  if (!force && sig === lastLists) return;
  lastLists = sig;
  renderDex(); renderSpots(); renderShop(); renderNotes(); renderMinimap();
}

function renderFight() {
  const fight = game.fight;
  const active = game.phase === PHASES.FIGHT && fight;
  const hud = $('fightUi');
  hud.classList.toggle('dim', !active);
  if (!active) return;
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  hud.classList.toggle('in-zone', fight.tension >= fight.safeLo && fight.tension <= fight.safeHi);
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
function toast(text) { game.message = text; }
function render(dt) {
  const p = game.phase;
  const walking = Math.abs(walker.v) > 30;
  setText('phaseTag', walking ? 'WALKING' : !game.here ? 'EXPLORING' : PHASE_TAG[p]);
  $('phaseTag').className = `chip phase ${walking || !game.here ? '' : PHASE_CLASS[p] || ''}`;
  const w = game.state.weather;
  setHTML('weatherTag', `${ICON[game.timeOfDay]}${ICON[w] || ''}<span>${game.weather.label} · ${game.timeOfDay}</span>`);
  if (game.message !== lastMessage) {
    lastMessage = game.message;
    setText('message', game.message);
    const m = $('message'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
    m.classList.toggle('empty', !game.message);
  }
  renderEssence(dt);
  setText('day', game.state.day);
  setText('today', game.state.caughtToday);
  setText('total', game.state.stats.caught);
  const near = nearestSpot();
  setText('spotLabel', (game.here ? game.spot.name : `Walking to ${near.name}`).toUpperCase());
  const prog = game.spotProgress(game.here ? game.spot.id : near.id);
  setText('spotProg', `${prog.found}/${prog.total}`);
  $('castBtn').disabled = game.busy || !game.here || walking;
  const free = !game.busy;
  $('leftBtn').disabled = !free; $('rightBtn').disabled = !free;
  $('walkHint').classList.toggle('show', free && game.here && game.state.stats.caught < 3 && !walking);
  const reel = $('reelBtn');
  reel.classList.toggle('active', reelHeld);
  reel.classList.toggle('ready', p === PHASES.BITE && !reelHeld);
  reel.setAttribute('aria-pressed', String(reelHeld));
  if (p !== PHASES.CAUGHT) $('catchCard').hidden = true;
  sceneEl.classList.toggle('caught', p === PHASES.CAUGHT);
  const me = $('mmMe');
  if (me) me.style.left = `${((walker.x - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * 92 + 4}%`;
  renderFight();
  renderLists(false);
}

function showCatchCard(c) {
  const g = GOOPS.find((x) => x.id === c.goop);
  if (!g) return;
  const card = $('catchCard');
  card.style.setProperty('--rc', c.shiny ? '#fff27a' : `var(--r-${g.rarity.toLowerCase()})`);
  $('ccName').textContent = `${c.shiny ? '✦ ' : ''}${g.name}`;
  $('ccRarity').textContent = `${c.shiny ? 'SHINY · ' : ''}${g.rarity.toUpperCase()}`;
  $('ccReward').textContent = `+${c.reward} Essence`;
  $('ccSize').textContent = `${c.size} cm${c.record ? ' · RECORD!' : ''}`;
  $('ccTime').textContent = `${c.time.toFixed(1)}s`;
  const badge = $('ccNew');
  badge.hidden = !(c.firstTime || c.record || c.shiny);
  badge.textContent = c.firstTime ? 'NEW!' : c.shiny ? 'SHINY!' : 'RECORD!';
  const p = game.spotProgress(game.spot.id);
  $('ccHint').textContent = `${game.spot.name}: ${p.found}/${p.total} found · cast again or walk on`;
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
      case 'hooked': sfx.hook(); navigator.vibrate?.(30); lastLists = ''; break;
      case 'catch':
        if (e.detail.firstTime) newDex.add(e.detail.goop);
        lastLists = ''; pendingCatch = e.detail; sfx.splash(true);
        break;
      case 'escaped': sfx.snap(); navigator.vibrate?.([40, 40, 80]); break;
      case 'missedBite': sfx.splash(); break;
      case 'upgrade': sfx.coin(); lastLists = ''; break;
      case 'discover':
        sfx.discover(); lastLists = '';
        setTimeout(() => { if (scene && game.here && game.state.spot === e.detail.spot) { snaps[e.detail.spot] = scene.snapshot(360); lastLists = ''; } }, 1600);
        break;
      case 'travel': lastLists = ''; if (!snaps[e.detail.spot]) setTimeout(() => { if (scene && game.here) { snaps[game.state.spot] = scene.snapshot(360); lastLists = ''; } }, 1600); break;
      case 'unlock': setTimeout(() => { toast(`The path to ${spotName(e.detail.spot)} is clear! Walk on to explore.`); sfx.discover(); }, 2600); lastLists = ''; break;
      case 'spotComplete': setTimeout(() => { toast(`${spotName(e.detail.spot)} complete! +${e.detail.bonus} Essence bonus`); sfx.coin(); }, 3200); break;
      case 'note': sfx.note(); lastLists = ''; break;
      case 'reset': newDex.clear(); lastLists = ''; shownEssence = null; walker.x = SPOT_X.dock; walker.target = null; break;
      default: break;
    }
  }
}

// ---------- walking ----------

function nearestSpot() {
  let best = SPOTS[0], dist = Infinity;
  for (const s of SPOTS) { const d = Math.abs(SPOT_X[s.id] - walker.x); if (d < dist) { dist = d; best = s; } }
  return best;
}

function gateX() {
  const next = SPOTS.find((s) => !game.spotUnlocked(s.id));
  return next ? SPOT_X[next.id] - SPOT_GAP * 0.5 : null;
}

let gateWarned = 0;
function updateWalk(dt) {
  const gate = gateX();
  const maxX = gate != null ? gate - 300 : WORLD_MAX;
  let dir = (keys.right || held.right ? 1 : 0) - (keys.left || held.left ? 1 : 0) + held.drag;
  dir = Math.max(-1, Math.min(1, dir));
  const free = !game.busy && !$('dexDetail').open;
  if (!free) dir = 0;
  if (dir) {
    walker.target = null;
    walker.v += (dir * WALK_SPEED - walker.v) * Math.min(1, dt * 6);
  } else {
    if (walker.target == null && Math.abs(walker.v) < WALK_SPEED * 0.9) walker.target = SPOT_X[nearestSpot().id];
    if (walker.target != null) {
      const want = Math.max(-WALK_SPEED, Math.min(WALK_SPEED, (walker.target - walker.x) * 3.2));
      walker.v += (want - walker.v) * Math.min(1, dt * 7);
    } else walker.v *= Math.exp(-dt * 6);
  }
  walker.x += walker.v * dt;
  if (walker.x > maxX) {
    walker.x = maxX; walker.v = 0; walker.target = SPOT_X[nearestSpot().id];
    if (performance.now() - gateWarned > 4000) {
      gateWarned = performance.now();
      const next = SPOTS.find((s) => !game.spotUnlocked(s.id));
      toast(`The path is overgrown. Fill your GoopDex to ${next.unlockAt} to reach ${next.name}.`);
      sfx.bump();
    }
  }
  if (walker.x < WORLD_MIN) { walker.x = WORLD_MIN; walker.v = Math.max(0, walker.v); }
  // arrive / leave
  const near = nearestSpot();
  const atSpot = Math.abs(walker.x - SPOT_X[near.id]) < 10 && Math.abs(walker.v) < 25;
  if (atSpot && !(game.here && game.state.spot === near.id) && !game.busy) {
    walker.x = SPOT_X[near.id]; walker.v = 0; walker.target = null;
    game.travel(near.id);
  } else if (game.here && Math.abs(walker.x - SPOT_X[game.state.spot]) > 60) {
    game.leave();
    $('catchCard').hidden = true;
  }
  // footsteps
  if (Math.abs(walker.v) > 220) { walker.step -= dt; if (walker.step <= 0) { sfx.step(); walker.step = 0.34; } }
}

function walkTo(id) {
  if (game.busy || !game.spotUnlocked(id)) return;
  walker.target = SPOT_X[id];
  sfx.unlock();
}

// ---------- loop ----------

let last = null;
let clickTimer = 0;
function loop(ts) {
  const dt = last == null ? 0 : Math.min(0.08, (ts - last) / 1000);
  last = ts;
  updateWalk(dt);
  game.update(dt, { reel: reelHeld || tapLatch });
  tapLatch = false;
  handleEvents();
  if (scene) {
    scene.reeling = reelHeld && game.phase === PHASES.FIGHT;
    scene.render(game, dt, { ...pointer, camX: walker.x, walkSpeed: walker.v / WALK_SPEED, gate: gateX() });
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
function release() { reelHeld = false; held.left = false; held.right = false; held.drag = 0; }
function cast() {
  sfx.unlock();
  if (!game.here) { toast('Walk to a fishing spot to cast.'); return; }
  if (game.cast()) { reelHeld = false; lastLists = ''; $('catchCard').hidden = true; }
}

const reelBtn = $('reelBtn');
reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
for (const [id, side] of [['leftBtn', 'left'], ['rightBtn', 'right']]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); held[side] = true; });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', () => { release(); keys.left = keys.right = false; });
reelBtn.addEventListener('contextmenu', (e) => e.preventDefault());
reelBtn.addEventListener('click', (e) => e.preventDefault());
$('castBtn').addEventListener('click', () => { cast(); $('castBtn').blur(); });

// Scene: tap to cast / reel / pick up a note; drag sideways to walk.
let drag = null;
sceneEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.minimap')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (game.busy) { e.preventDefault(); press(); return; }
  drag = { x: e.clientX, y: e.clientY, moved: false };
});
sceneEl.addEventListener('pointermove', (e) => {
  const r = sceneEl.getBoundingClientRect();
  if (e.pointerType === 'mouse') {
    pointer.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  if (drag && !game.busy) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 18) { drag.moved = true; held.drag = dx > 0 ? -1 : 1; } // drag the world: pull left to walk right
  }
});
sceneEl.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null; held.drag = 0;
  if (d.moved || game.busy) return;
  // a tap: pick up a note under the finger, otherwise cast
  if (scene) {
    const r = canvas.getBoundingClientRect();
    const k = canvas.width / Math.max(r.width, r.height * 16 / 9);
    const offX = (r.width - Math.max(r.width, r.height * 16 / 9)) / 2;
    const offY = (r.height - Math.max(r.height, r.width * 9 / 16)) / 2;
    const id = scene.hitNote((e.clientX - r.left - offX) * k, (e.clientY - r.top - offY) * k, game);
    if (id) {
      const note = NOTES.find((n) => n.id === id);
      if (note.spot !== game.state.spot || !game.here) { walkTo(note.spot); toast('Walk over to pick it up.'); return; }
      if (game.collectNote(id)) return;
    }
  }
  cast();
});
sceneEl.addEventListener('pointerleave', () => { pointer.px = 0; pointer.py = 0; });
sceneEl.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if ($('dexDetail').open) return;
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = true; e.preventDefault(); sfx.unlock(); return; }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = true; e.preventDefault(); sfx.unlock(); return; }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); press(); }
  else if (e.code === 'KeyC' || e.code === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON' || e.code === 'KeyC') { e.preventDefault(); cast(); } }
  else if (e.code === 'KeyM') toggleMute();
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { e.preventDefault(); reelHeld = false; }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') keys.left = false;
  if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); keys.left = keys.right = false; } last = null; });

document.addEventListener('click', (e) => {
  const walk = e.target.closest('[data-walk]')?.dataset.walk;
  if (walk) { walkTo(walk); if (e.target.closest('#spotList')) sceneEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (tab) { dexFilter = tab; lastLists = ''; return; }
  const goop = e.target.closest('[data-goop]')?.dataset.goop;
  if (goop) { openDexDetail(goop); return; }
});
$('dexClose').addEventListener('click', () => $('dexDetail').close?.() ?? $('dexDetail').removeAttribute('open'));
$('dexDetail').addEventListener('click', (e) => { if (e.target === $('dexDetail')) $('dexDetail').close?.(); });
$('shopList').addEventListener('click', (e) => {
  const kind = e.target.closest('[data-buy]')?.dataset.buy;
  if (kind && game.buyUpgrade(kind)) { lastLists = ''; const w = document.querySelector('.wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
});
$('resetBtn').addEventListener('click', () => { if (confirm('Reset your GoopDex, Essence and upgrades?')) { game.reset(); lastLists = ''; } });

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
  scene = new Scene(canvas, assets);
  scene.onSplash = () => sfx.splash();
  scene.onReveal = () => {
    if (!pendingCatch) return;
    showCatchCard(pendingCatch);
    sfx.catch(GOOPS.find((g) => g.id === pendingCatch.goop)?.rarity, pendingCatch.shiny);
    pendingCatch = null;
  };
  scene.onThunder = () => sfx.thunder();
  window.__goop = { game, scene, walker };
  $('loadHint').textContent = 'The Goops are biting.';
  const start = $('startBtn');
  start.hidden = false;
  const go = () => { sfx.unlock(); $('loader').classList.add('gone'); };
  start.addEventListener('click', go, { once: true });
  if (new URLSearchParams(location.search).has('skipintro')) go();
  requestAnimationFrame(loop);
}
boot();
