import { GOOPS, SPOTS, UPGRADES, PHASES, FishingGame } from './game.js';

const canvas = document.querySelector('#gameCanvas');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const game = new FishingGame();

let reelHeld = false;   // pointer/keyboard currently holding reel
let tapLatch = false;   // a press happened since the last frame (so very short taps still count)
let time = 0;
let splash = 0;         // seconds of catch/escape flash remaining
let lightning = 0;
const newDex = new Set();

// ---------- canvas scene ----------

const SKY = {
  Dawn: ['#3b3a63', '#e9906f', '#2a5f77'],
  Day: ['#4a90b8', '#9fd6e6', '#23728f'],
  Dusk: ['#2c2350', '#d9684b', '#1d4560'],
  Night: ['#050b1c', '#12254a', '#0a2a40'],
};
const SPOT_TINT = { pond: '#14516a', reeds: '#27644f', deep: '#0d2f5a' };

function drawSky(w, h) {
  const [top, bottom, water] = SKY[game.timeOfDay] || SKY.Day;
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);
  sky.addColorStop(0, top);
  sky.addColorStop(1, bottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.58);

  if (game.timeOfDay === 'Night') {
    ctx.fillStyle = '#ffffffcc';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 97) % w, (i * 53) % (h * 0.4), 2, 2);
    ctx.fillStyle = '#f4f0d4';
    ctx.beginPath(); ctx.arc(w * 0.85, h * 0.14, 24, 0, Math.PI * 2); ctx.fill();
  }

  const lake = ctx.createLinearGradient(0, h * 0.58, 0, h);
  lake.addColorStop(0, SPOT_TINT[game.spot.id] || water);
  lake.addColorStop(1, '#06283a');
  ctx.fillStyle = lake;
  ctx.fillRect(0, h * 0.58, w, h * 0.42);
}

function drawShore(w, h) {
  ctx.fillStyle = '#071b25';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.57);
  for (let x = 0; x <= w; x += 90) ctx.lineTo(x, h * 0.52 + Math.sin(x * 0.013) * 20);
  ctx.lineTo(w, h * 0.63);
  ctx.lineTo(0, h * 0.63);
  ctx.fill();

  const reedy = game.spot.id === 'reeds';
  ctx.strokeStyle = reedy ? '#4f9a62' : '#376c59';
  ctx.lineWidth = reedy ? 5 : 4;
  const step = reedy ? 22 : 35;
  for (let x = 15; x < w; x += step) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.63);
    ctx.quadraticCurveTo(x - 8, h * 0.5, x + Math.sin(x) * 8 + Math.sin(time + x) * 3, h * (reedy ? 0.4 : 0.43));
    ctx.stroke();
  }
}

function drawWater(w, h) {
  ctx.lineWidth = 2;
  for (let i = 0; i < 34; i++) {
    const x = (i * 71 + time * 35) % w;
    const y = h * 0.65 + ((i * 23) % (h * 0.27));
    ctx.strokeStyle = 'rgba(118,224,219,.12)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 20 + Math.sin(time + i) * 9, y); ctx.stroke();
  }
}

function drawWeather(w, h) {
  const weather = game.state.weather;
  if (weather === 'rain' || weather === 'storm') {
    ctx.strokeStyle = 'rgba(190,220,240,.45)';
    ctx.lineWidth = 1.5;
    const count = weather === 'storm' ? 120 : 70;
    for (let i = 0; i < count; i++) {
      const x = (i * 83 + time * 420) % w;
      const y = (i * 47 + time * 700) % h;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 5, y + 14); ctx.stroke();
    }
  }
  if (weather === 'fog') {
    const fog = ctx.createLinearGradient(0, h * 0.35, 0, h * 0.75);
    fog.addColorStop(0, 'rgba(210,225,230,0)');
    fog.addColorStop(0.5, 'rgba(210,225,230,.38)');
    fog.addColorStop(1, 'rgba(210,225,230,0)');
    ctx.fillStyle = fog;
    ctx.fillRect(0, h * 0.35, w, h * 0.4);
  }
  if (weather === 'storm') {
    if (lightning <= 0 && Math.random() < 0.004) lightning = 0.18;
    if (lightning > 0) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(0.5, lightning * 3)})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.fillStyle = 'rgba(10,15,30,.25)';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawGoop(g, x, y, scale, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = g.color;
  ctx.shadowColor = g.color;
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 19, Math.sin(time) * 0.3, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#10202a';
  ctx.beginPath(); ctx.arc(-7, -5, 3, 0, Math.PI * 2); ctx.arc(7, -5, 3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function draw() {
  const w = canvas.width, h = canvas.height;
  const phase = game.phase;
  drawSky(w, h);
  drawShore(w, h);
  drawWater(w, h);

  // Bobber / hook position: it moves toward the Goop during a fight.
  const fight = game.fight;
  const pull = phase === PHASES.FIGHT && fight ? Math.sin(time * 14) * 3 * fight.tension : 0;
  const reeled = phase === PHASES.FIGHT && fight ? fight.progress : 0;
  const bobX = w * (0.7 - 0.22 * reeled) + pull;
  const dip = phase === PHASES.BITE ? Math.abs(Math.sin(time * 18)) * 12 : phase === PHASES.FIGHT ? 6 : 0;
  const bobY = h * 0.68 + Math.sin(time * 2.6) * 4 + dip;
  const tipX = w * 0.58, tipY = h * 0.4;

  // Rod (flexes with tension) and line.
  const flex = phase === PHASES.FIGHT && fight ? fight.tension * 40 : 0;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#c6a77b';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(w * 0.13, h * 0.8);
  ctx.quadraticCurveTo(w * 0.2, h * 0.25 + flex, tipX, tipY + flex * 0.5);
  ctx.stroke();

  const taut = phase === PHASES.FIGHT && fight ? fight.tension : 0.2;
  ctx.strokeStyle = taut > 0.85 ? '#ff8a7a' : '#d9c9a0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY + flex * 0.5);
  ctx.quadraticCurveTo((tipX + bobX) / 2, (tipY + bobY) / 2 + (1 - taut) * 40, bobX, bobY);
  ctx.stroke();

  ctx.fillStyle = '#ffbc65';
  ctx.beginPath(); ctx.arc(bobX, bobY, 10, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f6f6f3';
  ctx.beginPath(); ctx.arc(bobX, bobY - 4, 6, 0, Math.PI * 2); ctx.fill();

  if (phase === PHASES.BITE) {
    ctx.strokeStyle = '#fff5b2';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(bobX, bobY, 24 + Math.sin(time * 10) * 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff5b2';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', bobX, bobY - 38);
  }

  if (game.goop) {
    if (phase === PHASES.CAST || phase === PHASES.BITE) {
      // a faint silhouette circling below the bobber
      drawGoop({ ...game.goop, color: '#05141c' }, bobX + Math.sin(time * 1.3) * 30, h * 0.82, 0.8, phase === PHASES.BITE ? 0.5 : 0.18);
    } else if (phase === PHASES.FIGHT) {
      drawGoop(game.goop, bobX + 6 + Math.sin(time * 9) * 3 * fight.tension, h * 0.79 + Math.sin(time * 4) * 8, 1, 1);
    } else if (phase === PHASES.CAUGHT) {
      drawGoop(game.goop, w * 0.5, h * 0.72 - Math.max(0, splash) * 60, 1.5 + Math.max(0, splash), 1);
    }
  }

  drawWeather(w, h);

  if (phase === PHASES.ESCAPED && splash > 0) {
    ctx.fillStyle = `rgba(255,90,90,${splash * 0.25})`;
    ctx.fillRect(0, 0, w, h);
  }
}

// ---------- DOM ----------

const PHASE_TAG = { idle: 'READY', cast: 'CASTING', bite: 'BITE!', fight: 'FIGHT', caught: 'CAUGHT', escaped: 'ESCAPED' };
const cache = {};
/** Write to the DOM only when the value actually changed. */
function setText(id, value) {
  value = String(value);
  if (cache[id] === value) return;
  cache[id] = value;
  $(id).textContent = value;
}

function renderDex() {
  const d = game.state.dex;
  setText('dexCount', `${Object.keys(d).length} / ${GOOPS.length}`);
  $('dexList').innerHTML = GOOPS.map((g) => {
    const e = d[g.id];
    const fastest = e?.fastest != null ? ` · best ${e.fastest.toFixed(1)}s` : '';
    return `<div class="dex-entry ${e ? '' : 'locked'} ${newDex.has(g.id) ? 'new' : ''}">`
      + `<span class="dex-dot" style="background:${g.color};color:${g.color}"></span>`
      + `<div><b>${e ? g.name : '???'}</b>`
      + `<small class="rarity-${g.rarity}">${e ? `Caught ×${e.count}${fastest}` : g.rarity}</small></div></div>`;
  }).join('');
}

function renderSpots() {
  const s = game.state;
  $('spotList').innerHTML = SPOTS.map((sp) => {
    const unlocked = s.unlocked.includes(sp.id);
    const current = s.spot === sp.id;
    const affordable = s.essence >= sp.cost;
    const label = current ? 'HERE' : unlocked ? 'GO' : `BUY ${sp.cost}`;
    const disabled = current || game.busy || (!unlocked && !affordable);
    return `<div class="option ${current ? 'current' : ''}"><div><b>${sp.name}</b>`
      + `<small>${sp.goops.length} Goops · Essence ×${sp.essenceMul}${sp.rareMul > 1 ? ` · rarer odds ×${sp.rareMul}` : ''}</small></div>`
      + `<button data-spot="${sp.id}" class="${unlocked ? '' : 'buy'}" ${disabled ? 'disabled' : ''}>${label}</button></div>`;
  }).join('');
}

function renderShop() {
  const s = game.state;
  $('shopList').innerHTML = Object.entries(UPGRADES).map(([kind, u]) => {
    const cost = game.upgradeCost(kind);
    const level = s.gear[kind];
    const btn = cost == null
      ? '<button disabled>MAX</button>'
      : `<button data-buy="${kind}" class="buy" ${s.essence < cost ? 'disabled' : ''}>${cost}</button>`;
    return `<div class="option"><div><b>${u.name} · Lv ${level}/${u.cost.length}</b><small>${u.desc}</small></div>${btn}</div>`;
  }).join('');
}

function renderNotes() {
  const pool = game.spot.goops.map((id) => GOOPS.find((g) => g.id === id));
  const seen = pool.filter((g) => game.state.dex[g.id]).length;
  setText('notes', `${game.spot.name}: ${seen} of ${pool.length} local Goops discovered. `
    + `Weather and time of day change who bites — rain, fog, storms and nights each draw out special Goops.`);
}

let lastLists = '';
function renderLists(force) {
  const s = game.state;
  const sig = JSON.stringify([s.essence, s.spot, s.unlocked, s.gear, Object.keys(s.dex).length, s.stats.caught, game.busy]);
  if (!force && sig === lastLists) return;
  lastLists = sig;
  renderDex(); renderSpots(); renderShop(); renderNotes();
}

function renderFight() {
  const fight = game.fight;
  const active = game.phase === PHASES.FIGHT && fight;
  $('fightUi').classList.toggle('dim', !active);
  if (!active) return;
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
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

function render() {
  const p = game.phase;
  setText('phaseTag', PHASE_TAG[p]);
  setText('weatherTag', `${game.weather.label} · ${game.timeOfDay}`.toUpperCase());
  setText('message', game.message);
  setText('essence', game.state.essence);
  setText('day', game.state.day);
  setText('today', game.state.caughtToday);
  setText('total', game.state.stats.caught);
  setText('spotLabel', game.spot.name.toUpperCase());
  $('castBtn').disabled = game.busy;
  $('reelBtn').classList.toggle('active', reelHeld);
  $('reelBtn').setAttribute('aria-pressed', String(reelHeld));
  if (p !== PHASES.FIGHT && game.fight == null) {
    setText('progressText', '0%');
  }
  renderFight();
  renderLists(false);
  draw();
}

function handleEvents() {
  for (const e of game.events.splice(0)) {
    if (e.type === 'catch') { splash = 1; if (e.detail.firstTime) newDex.add(e.detail.goop); lastLists = ''; }
    if (e.type === 'escaped' || e.type === 'missedBite') splash = 0.8;
    if (e.type === 'reset') { newDex.clear(); lastLists = ''; }
  }
}

// ---------- loop ----------

let last = null;
function loop(ts) {
  const dt = last == null ? 0 : Math.min(0.08, (ts - last) / 1000);
  last = ts;
  time = ts / 1000;
  game.update(dt, { reel: reelHeld || tapLatch });
  tapLatch = false;
  splash = Math.max(0, splash - dt);
  lightning = Math.max(0, lightning - dt);
  handleEvents();
  render();
  requestAnimationFrame(loop);
}

// ---------- input ----------

function press() { reelHeld = true; tapLatch = true; }
function release() { reelHeld = false; }
function cast() { if (game.cast()) { reelHeld = false; lastLists = ''; } }

const reelBtn = $('reelBtn');
reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
window.addEventListener('pointerup', release);
window.addEventListener('pointercancel', release);
window.addEventListener('blur', release);
reelBtn.addEventListener('contextmenu', (e) => e.preventDefault());
reelBtn.addEventListener('click', (e) => e.preventDefault());

$('castBtn').addEventListener('click', () => { cast(); $('castBtn').blur(); });

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); press(); }
  else if (e.code === 'KeyC' || e.code === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON' || e.code === 'KeyC') { e.preventDefault(); cast(); } }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { e.preventDefault(); release(); }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) release(); last = null; });

$('spotList').addEventListener('click', (e) => {
  const id = e.target.closest('[data-spot]')?.dataset.spot;
  if (id && game.travel(id)) lastLists = '';
});
$('shopList').addEventListener('click', (e) => {
  const kind = e.target.closest('[data-buy]')?.dataset.buy;
  if (kind && game.buyUpgrade(kind)) lastLists = '';
});
$('resetBtn').addEventListener('click', () => {
  if (confirm('Reset your GoopDex, Essence and upgrades?')) { game.reset(); lastLists = ''; }
});

renderLists(true);
requestAnimationFrame(loop);
