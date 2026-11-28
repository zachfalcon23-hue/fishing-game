import {
  MOVE_INFO, fightReadout, GOOPS, SPOTS, SPOT_BY, UPGRADES, NOTES, PHASES, BAITS, SETS, TASTES, MOON, REROLL_COST, WEATHER,
  RODS, SKINS, BOBBERS, LINES, LURES, CHARMS, FINDER_COST, BUDDY_TRAIN, buddyBonus, QUESTS, DECOR, THEMES, TANK_CAP, DECOR_SLOTS,
  HABITAT_RESEARCH_TIERS, HABITAT_INTERACTIONS, FishingGame, conditionText, tasteBait,
} from './game.js';
import { Scene, loadAssets, GOOP_ART, SPOT_X, SPOT_GAP, WORLD_MIN, WORLD_MAX, CLUE_X, toShore, fromShore } from './scene.js';
import { Sfx } from './audio.js';
import { Tank } from './aquarium.js';
import { SessionTelemetry, downloadJSONFile } from './telemetry.js';
import { HOLLOW, moveHollowPlayer, nearbyHollowDiscovery, sanitizeHollowSave } from './exploration.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const sceneEl = $('scene');
const game = new FishingGame();
if (game.saveStore.lastLoadRecovered) game.message = 'Recovered your last valid save from backup. Your progress has been restored.';
const sessionTelemetry = new SessionTelemetry();
const sfx = new Sfx();
let scene = null;

let reelHeld = false;
let drag = null;
let tapLatch = false;
let steerLatch = 0; // a fresh steer (◀ / ▶) for signature moves
let fightSwipe = null;
const pointer = { px: 0, py: 0 };
const newDex = new Set();
const keys = { left: false, right: false };
const held = { left: false, right: false, drag: 0 };
const pressAt = { left: 0, right: 0, keyLeft: 0, keyRight: 0 };
const walker = { x: fromShore(game.state.shore ?? 0), v: 0, target: null, step: 0 };
const HOLLOW_SAVE_KEY = 'goop-fishing-reedbed-hollow-v1';
const hollowSaved = (() => { try { return sanitizeHollowSave(JSON.parse(localStorage.getItem(HOLLOW_SAVE_KEY) || 'null')); } catch { return sanitizeHollowSave(null); } })();
const hollow = { ...hollowSaved, active: false, returnX: fromShore(game.state.shore ?? 0), input: { x: 0, y: 0 }, prompt: null, canvas: null, ctx: null, lastSaved: { ...hollowSaved.position } };
 // Import discoveries made before the Field Journal integration into the main save.
for (const id of hollow.discovered) {
  const discovery = HOLLOW.discoveries.find((item) => item.id === id);
  if (discovery) game.recordExplorationNote(discovery);
}
function saveHollow() {
  try { localStorage.setItem(HOLLOW_SAVE_KEY, JSON.stringify({ position: hollow.position, discovered: hollow.discovered })); hollow.lastSaved = { ...hollow.position }; } catch { /* exploration remains playable when storage is unavailable */ }
}
function buildHollowOverlay() {
  if (hollow.canvas) return;
  const overlay = document.createElement('div');
  overlay.id = 'hollowOverlay';
  overlay.innerHTML = `
    <canvas aria-label="Reedbed Hollow exploration area"></canvas>
    <div class="hollow-head"><div><small>NORTH POND · SIDE TRAIL</small><b>REEDBED HOLLOW</b></div><span id="hollowCount">0 / ${HOLLOW.discoveries.length} NOTES</span></div>
    <div class="hollow-note" id="hollowNote">Follow the trail. Look closely — the reeds hide more than fish.</div>
    <div class="hollow-actions"><button type="button" data-hollow-exit>↩ RETURN TO POND</button><button type="button" data-hollow-interact id="hollowInteract" disabled>🔎 INVESTIGATE</button></div>
    <div class="hollow-pad" aria-label="Movement controls">
      <button type="button" data-hollow-dir="up" aria-label="Walk up">▲</button>
      <div><button type="button" data-hollow-dir="left" aria-label="Walk left">◀</button><button type="button" data-hollow-dir="down" aria-label="Walk down">▼</button><button type="button" data-hollow-dir="right" aria-label="Walk right">▶</button></div>
    </div>`;
  sceneEl.appendChild(overlay);
  hollow.canvas = overlay.querySelector('canvas');
  hollow.ctx = hollow.canvas.getContext('2d');
  overlay.querySelector('[data-hollow-exit]').addEventListener('click', exitHollow);
  overlay.querySelector('[data-hollow-interact]').addEventListener('click', interactHollow);
  for (const button of overlay.querySelectorAll('[data-hollow-dir]')) {
    const dir = button.dataset.hollowDir;
    const vector = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const down = (e) => { e.preventDefault(); hollow.input.x = vector[0]; hollow.input.y = vector[1]; button.setPointerCapture?.(e.pointerId); };
    const up = () => { hollow.input.x = 0; hollow.input.y = 0; };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }
  const style = document.createElement('style');
  style.textContent = `
    .side-btn[hidden]{display:none!important}
    #hollowOverlay{position:absolute;inset:0;z-index:12;display:none;overflow:hidden;background:#183b2c;color:#f2ffe9;font-family:var(--body);touch-action:none}
    .scene.exploring #hollowOverlay{display:block}
    .scene.exploring>#gameCanvas,.scene.exploring>.hud-top,.scene.exploring>.hud-left,.scene.exploring>.side-btns,.scene.exploring>.minimap,.scene.exploring>.toast,.scene.exploring>.walk-hint,.scene.exploring>.move-prompt,.scene.exploring>.fight-hud,.scene.exploring>.catch-card{visibility:hidden}
    #hollowOverlay canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
    .hollow-head{position:absolute;top:12px;left:14px;right:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;pointer-events:none;text-shadow:0 2px 5px #10251b}
    .hollow-head small{display:block;font-size:9px;letter-spacing:.17em;font-weight:900;color:#d4f2bd}
    .hollow-head b{display:block;font:24px var(--display);letter-spacing:.04em;color:#f1ffbd}
    .hollow-head span{padding:7px 11px;border:1px solid #c5e6a7;border-radius:99px;background:#102c24cc;font-size:10px;font-weight:900}
    .hollow-note{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);width:min(470px,58%);padding:10px 14px;border:1px solid #c5e6a7aa;border-radius:14px;background:#102c24df;text-align:center;font-size:12px;line-height:1.4;box-shadow:0 8px 22px #08160e88;pointer-events:none}
    .hollow-actions{position:absolute;right:14px;bottom:14px;display:flex;gap:8px}
    .hollow-actions button,.hollow-pad button{border:1px solid #d8efb5;border-radius:12px;background:#183c2deF;color:#f5ffd9;font:900 11px var(--body);padding:10px 13px;box-shadow:0 3px 0 #0b2017;touch-action:none}
    .hollow-actions button:disabled{opacity:.4}
    .hollow-pad{position:absolute;left:12px;bottom:12px;display:grid;justify-items:center;gap:4px}
    .hollow-pad>div{display:flex;gap:4px}
    .hollow-pad button{width:42px;height:38px;padding:0;font-size:16px}
    @media(max-width:650px){.hollow-head{top:7px;left:8px;right:8px}.hollow-head b{font-size:18px}.hollow-head small{font-size:7px}.hollow-head span{font-size:8px;padding:5px 7px}.hollow-note{bottom:100px;width:calc(100% - 20px);font-size:10px;padding:7px 9px}.hollow-actions{right:8px;bottom:10px;flex-direction:column}.hollow-actions button{font-size:9px;padding:8px}.hollow-pad{left:8px;bottom:8px}.hollow-pad button{width:34px;height:32px}}
  `;
  document.head.appendChild(style);
}
function enterHollow() {
  if (game.busy || !game.spotUnlocked('reeds') || Math.abs(walker.x - SPOT_X.reeds) > 360) return;
  buildHollowOverlay();
  hollow.returnX = walker.x;
  hollow.active = true;
  hollow.input.x = hollow.input.y = 0;
  sceneEl.classList.add('exploring');
  $('hollowCount').textContent = `${hollow.discovered.length} / ${HOLLOW.discoveries.length} NOTES`;
  sfx.step();
}
function exitHollow() {
  hollow.active = false;
  hollow.input.x = hollow.input.y = 0;
  sceneEl.classList.remove('exploring');
  walker.x = hollow.returnX;
  walker.v = 0; walker.target = null;
  game.setShore(toShore(walker.x));
  saveHollow();
  if (hollow.discovered.length) notify(`Reedbed Hollow field notes: ${hollow.discovered.length} / ${HOLLOW.discoveries.length} discoveries recorded.`, 3000);
  sfx.step();
}
function interactHollow() {
  if (!hollow.prompt) return;
  if (!hollow.discovered.includes(hollow.prompt.id)) {
    const recorded = game.recordExplorationNote(hollow.prompt);
    if (!recorded) {
      notify('The Field Journal could not record this discovery. Your exploration progress is still available.', 2800);
      return;
    }
    hollow.discovered.push(hollow.prompt.id);
    saveHollow();
    $('hollowNote').textContent = `FIELD NOTE · ${hollow.prompt.title}: ${hollow.prompt.note}`;
    $('hollowCount').textContent = `${hollow.discovered.length} / ${HOLLOW.discoveries.length} NOTES`;
    renderNotes();
    sfx.note();
  } else {
    $('hollowNote').textContent = hollow.prompt.note;
  }
  renderHollow();
}
function renderHollow() {
  if (!hollow.active || !hollow.canvas) return;
  const rect = sceneEl.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(rect.width * dpr)), h = Math.max(1, Math.round(rect.height * dpr));
  if (hollow.canvas.width !== w || hollow.canvas.height !== h) { hollow.canvas.width = w; hollow.canvas.height = h; }
  const g = hollow.ctx, cw = rect.width, ch = rect.height;
  g.setTransform(dpr,0,0,dpr,0,0);
  const cameraX = Math.max(cw/2, Math.min(HOLLOW.width-cw/2, hollow.position.x));
  const cameraY = Math.max(ch/2, Math.min(HOLLOW.height-ch/2, hollow.position.y));
  const sx = (x) => x-cameraX+cw/2, sy = (y) => y-cameraY+ch/2;
  const sky = g.createLinearGradient(0,0,0,ch); sky.addColorStop(0,'#79a88a'); sky.addColorStop(.55,'#46765a'); sky.addColorStop(1,'#244b38');
  g.fillStyle=sky;g.fillRect(0,0,cw,ch);
  // distant tree canopy and layered marsh floor
  for(let i=0;i<42;i++){const x=(i*173+91)%HOLLOW.width,y=(i*97+43)%HOLLOW.height;const px=sx(x),py=sy(y);if(px<-100||px>cw+100||py<-100||py>ch+100)continue;g.fillStyle=i%3?'#315b3e':'#3d7048';g.beginPath();g.arc(px,py,42+(i%4)*9,0,Math.PI*2);g.fill();g.fillStyle='#73965a';g.globalAlpha=.18;g.beginPath();g.arc(px-12,py-14,22,0,Math.PI*2);g.fill();g.globalAlpha=1;}
  // shallow water pools flanking the trail
  for(const [x,y,rx,ry] of [[300,560,210,95],[1120,850,190,130],[1500,720,210,105],[1450,230,160,75]]){g.fillStyle='#397d78';g.beginPath();g.ellipse(sx(x),sy(y),rx,ry,0,0,Math.PI*2);g.fill();g.strokeStyle='#9bd2ae';g.globalAlpha=.3;g.lineWidth=3;g.stroke();g.globalAlpha=1;}
  // trail base and packed-earth center, including both branches
  for(const path of HOLLOW.paths){g.beginPath();path.forEach(([x,y],i)=>i?g.lineTo(sx(x),sy(y)):g.moveTo(sx(x),sy(y)));g.lineCap='round';g.lineJoin='round';g.strokeStyle='#352f25';g.lineWidth=HOLLOW.corridor*2.1;g.stroke();g.strokeStyle='#b69a68';g.lineWidth=HOLLOW.corridor*1.72;g.stroke();g.strokeStyle='#d2b982';g.lineWidth=HOLLOW.corridor*1.2;g.stroke();g.strokeStyle='#9b835c';g.lineWidth=3;g.setLineDash([12,18]);g.stroke();g.setLineDash([]);}
  // reeds and stones make the path edges legible
  for(let i=0;i<70;i++){const x=(i*137+230)%HOLLOW.width,y=(i*191+170)%HOLLOW.height;if(!HOLLOW.paths.some(path=>path.slice(1).some((b,j)=>{const a=path[j],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));const distance=Math.hypot(x-a[0]-dx*t,y-a[1]-dy*t);return distance>HOLLOW.corridor+12&&distance<180;})))continue;const px=sx(x),py=sy(y);g.strokeStyle=i%2?'#b0c66a':'#6d9b4e';g.lineWidth=3;g.beginPath();for(let j=0;j<3;j++){g.moveTo(px,py);g.quadraticCurveTo(px+(j-1)*9-8,py-17,px+(j-1)*14,py-35-(i%4)*4);}g.stroke();}
  // authored points of interest
  for(const item of HOLLOW.discoveries){const x=sx(item.x),y=sy(item.y),found=hollow.discovered.includes(item.id);g.fillStyle=found?'#c7e6a4':'#ffe58a';g.globalAlpha=found?.38:.95;g.beginPath();g.arc(x,y,found?13:19,0,Math.PI*2);g.fill();g.globalAlpha=1;g.strokeStyle='#263e2a';g.lineWidth=4;g.stroke();g.font='bold 22px sans-serif';g.textAlign='center';g.fillStyle='#182c20';g.fillText(({ 'trail-marker':'⚑','lost-satchel':'🎒','hidden-pool':'◉','lookout':'⌖' })[item.id],x,y+7);if(!found){g.font='900 13px sans-serif';g.fillStyle='#fff';g.fillText(item.title.toUpperCase(),x,y-30);}}
  // player shadow and character
  const px=sx(hollow.position.x),py=sy(hollow.position.y);
  g.fillStyle='#10251b88';g.beginPath();g.ellipse(px,py+17,18,8,0,0,Math.PI*2);g.fill();
  g.fillStyle='#9bf36b';g.beginPath();g.arc(px,py,14,0,Math.PI*2);g.fill();g.strokeStyle='#183b22';g.lineWidth=4;g.stroke();g.fillStyle='#102b20';g.beginPath();g.arc(px-5,py-3,2.2,0,Math.PI*2);g.arc(px+5,py-3,2.2,0,Math.PI*2);g.fill();
  hollow.prompt=nearbyHollowDiscovery(hollow.position);
  const btn=$('hollowInteract');btn.disabled=!hollow.prompt;btn.textContent=hollow.prompt?(hollow.discovered.includes(hollow.prompt.id)?'📖 READ FIELD NOTE':'🔎 INVESTIGATE'):'🔎 NO DISCOVERY NEARBY';
}
function updateHollow(dt) {
  if (!hollow.active) return;
  hollow.position=moveHollowPlayer(hollow.position,hollow.input,dt);
  if (Math.hypot(hollow.position.x-hollow.lastSaved.x,hollow.position.y-hollow.lastSaved.y)>70) saveHollow();
  if (hollow.prompt) hollow.prompt=nearbyHollowDiscovery(hollow.position);
  renderHollow();
}

const WALK_SPEED = 950;
const TAP_MS = 230;
let dexFilter = 'all';
const snaps = {};
const SECRETS = ['sandbar', 'cave', 'wreck'];
const SPOT_ICON = { sandbar: '🌙', dock: '⚓', lily: '🪷', reeds: '🌾', boulder: '🪨', falls: '💧', cave: '💎', grotto: '🍄', deep: '🌀', wreck: '🛶' };
const HABITAT_EVENT_BY_ID = new Map(HABITAT_INTERACTIONS.map((interaction) => [interaction.id, interaction]));
const WIGGS = [
  '“Bait matters, kid. Match what they like to eat and they’ll come running.”',
  '“Keep the needle in the green and don’t let go. The longer you hold it, the faster they tire.”',
  '“See a big Goop flash red? Let off the reel. Fighting a lunge head-on never works.”',
  '“Hook ’em the instant the bobber dips. A clean hook is half the fight.”',
  '“Full moon every fifth night. The legends get restless.”',
  '“Feeding frenzies don’t last. When you see the water boil, go!”',
  '“You don’t have to stand on a spot to fish, you know. Cast anywhere along the shore.”',
];

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
  map: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2V6zM9 4v14M15 6v14"/></svg>',
  board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M7 20l2-4M17 20l-2-4M7 8h6M7 12h10"/></svg>',
  soundOn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM16 8.5a5 5 0 0 1 0 7M19 5.5a9 9 0 0 1 0 13"/></svg>',
  soundOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4zM17 9l5 5M22 9l-5 5"/></svg>',
};

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
const spotName = (id) => SPOT_BY[id]?.name || id;
const goopName = (id) => GOOPS.find((g) => g.id === id)?.name || id;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function openDialog(id) { const d = $(id); if (d.open) return; if (d.showModal) d.showModal(); else d.setAttribute('open', ''); sfx.unlock(); }
function closeDialog(id) { const d = $(id); if (d.close) d.close(); else d.removeAttribute('open'); }
const anyDialogOpen = () => [...document.querySelectorAll('dialog')].some((d) => d.open);

// First-session guide: shown once per browser, and always available from the ? button.
const GUIDE_SEEN_KEY = 'goop-fishing-guide-seen-v1';
let guideStep = 0;
function renderGuide() {
  const steps = [...$('guideSteps').querySelectorAll('[data-guide-step]')];
  guideStep = Math.max(0, Math.min(steps.length - 1, guideStep));
  steps.forEach((step, index) => { step.hidden = index !== guideStep; });
  $('guideCount').textContent = (guideStep + 1) + ' / ' + steps.length;
  $('guideProgress').style.width = (((guideStep + 1) / steps.length) * 100) + '%';
  $('guidePrev').disabled = guideStep === 0;
  $('guideNext').hidden = guideStep === steps.length - 1;
  $('guideFinish').hidden = guideStep !== steps.length - 1;
}
function openGuide() {
  guideStep = 0;
  renderGuide();
  openDialog('guideDlg');
}
function guideSeen() {
  try { return localStorage.getItem(GUIDE_SEEN_KEY) === '1'; } catch { return true; }
}
function markGuideSeen() {
  try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* guide remains available from the ? button */ }
}
$('guideBtn').addEventListener('click', openGuide);
$('guidePrev').addEventListener('click', () => { guideStep -= 1; renderGuide(); });
$('guideNext').addEventListener('click', () => { guideStep += 1; renderGuide(); });
$('guideFinish').addEventListener('click', () => { markGuideSeen(); closeDialog('guideDlg'); });

// Toasts that arrive together are shown one after another.
const notes = [];
let noteAt = 0;
function notify(text, gap = 2600) { notes.push({ text, gap }); }
function pumpNotes() {
  const now = performance.now();
  if (notes.length && now >= noteAt) { const n = notes.shift(); game.message = n.text; noteAt = now + n.gap; }
}

// ---------- panels ----------

function renderDexTabs() {
  const tabs = [['all', 'ALL'], ...SPOTS.filter((s) => !s.secret || game.state.discovered.includes(s.id)).map((s) => [s.id, game.state.discovered.includes(s.id) ? s.name.replace(/^The /, '').toUpperCase() : '???'])];
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
    const status = e ? `×${e.count}${e.best ? ` · ${e.best} cm` : ''}${e.qualityGrade ? ` · ${e.qualityGrade}` : ''}` : seen ? 'Seen — not caught' : 'Undiscovered';
    const buddy = game.state.buddy === g.id ? '<span class="buddy-tag" title="Your buddy">BUDDY</span>' : '';
    return `<button class="dex-entry r-${g.rarity} ${e ? '' : 'locked'} ${seen && !e ? 'seen' : ''} ${newDex.has(g.id) ? 'new' : ''}" data-goop="${g.id}">`
      + `<span class="num">#${String(n).padStart(2, '0')}</span>${e?.shiny ? '<span class="shiny" title="Shiny caught">✦</span>' : ''}${buddy}`
      + `<img src="${GOOP_ART(g.id)}" alt="" loading="lazy" draggable="false" class="${e?.shiny ? 'is-shiny' : ''}">`
      + `<b>${e || seen ? g.name : '???'}</b><small>${g.rarity.toUpperCase()}</small><span class="count">${status}</span></button>`;
  }).join('');
}

let detailId = null;
function openDexDetail(id) {
  const g = GOOPS.find((x) => x.id === id);
  if (!g) return;
  detailId = id;
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
  const bait = BAITS[tasteBait(g.taste)];
  $('ddStats').innerHTML = e
    ? `<div><span>CAUGHT</span><b>${e.count}</b></div><div><span>BIGGEST</span><b>${e.best ?? '—'} cm</b></div><div><span>FASTEST</span><b>${e.fastest != null ? `${e.fastest.toFixed(1)}s` : '—'}</b></div><div><span>BEST QUALITY</span><b>${e.qualityGrade ? `${e.qualityGrade} · ${e.qualityBest}/100` : '—'}</b></div><div><span>SHINY</span><b>${e.shiny ? `✦ ${e.shiny}` : '—'}</b></div>`
    : `<div><span>SIZE RANGE</span><b>${knows ? `${g.size[0]}–${g.size[1]} cm` : '???'}</b></div><div><span>FIGHT</span><b>${seen ? g.pattern[0].toUpperCase() + g.pattern.slice(1) : '???'}</b></div>`;
  $('ddBait').innerHTML = e || knows ? `Favourite food: <b>${TASTES[g.taste]}</b> — try ${bait.icon} <b>${bait.name}</b>` : '';
  $('ddHint').textContent = e || seen ? g.hint : '';
  const btn = $('ddBuddy');
  btn.hidden = !e;
  btn.textContent = game.state.buddy === id ? '✓ YOUR BUDDY' : 'MAKE BUDDY';
  btn.classList.toggle('on', game.state.buddy === id);
  const trackBtn = $('ddTrack');
  const canTrack = !!e || seen || knows;
  trackBtn.hidden = !canTrack;
  trackBtn.disabled = game.busy;
  trackBtn.title = game.busy ? 'Finish the current cast before changing your hunt target.' : '';
  trackBtn.textContent = game.state.trackedGoop === id ? 'STOP TRACKING' : 'TRACK THIS GOOP';
  trackBtn.classList.toggle('on', game.state.trackedGoop === id);
  openDialog('dexDetail');
}

function renderSpots() {
  const s = game.state;
  $('spotList').innerHTML = SPOTS.filter((sp) => !sp.secret || s.discovered.includes(sp.id)).map((sp) => {
    const open = game.spotUnlocked(sp.id);
    const found = s.discovered.includes(sp.id);
    const here = game.here && s.spot === sp.id;
    const p = game.spotProgress(sp.id);
    const done = s.completed.includes(sp.id);
    const bg = snaps[sp.id] ? `style="background-image:url(${snaps[sp.id]})"` : '';
    const sub = !open ? `GoopDex ${game.dexCount}/${sp.unlockAt} to clear the path` : !found ? 'Not yet visited' : `${p.found}/${p.total} Goops${done ? ' · ✓ complete' : ''} · Essence ×${sp.essenceMul}`;
    const btn = here ? '<button class="here" disabled>HERE</button>' : open ? `<button class="go" data-walk="${sp.id}" ${game.busy ? 'disabled' : ''}>WALK</button>` : '<button disabled>🔒</button>';
    const tags = `${s.frenzy === sp.id ? '<em class="tag frenzy">✦ FRENZY</em>' : ''}${s.visitor?.spot === sp.id ? '<em class="tag visitor">VISITOR</em>' : ''}${sp.secret ? '<em class="tag secret">SECRET</em>' : ''}`;
    const activity = open ? game.activityAt(sp.id) : 0;
    const activityNames = ['QUIET', 'RIPPLES', 'FEEDING', 'FRENZY'];
    const activityHTML = open ? `<span class="spot-activity a-${activity}" title="Local feeding activity: ${activityNames[activity]}"><i></i><i></i><i></i><b>${activityNames[activity]}</b></span>` : '';
    const roster = sp.goops.slice(0, 6).map((id) => {
      const known = s.dex[id] || s.seen.includes(id);
      const g = GOOPS.find((x) => x.id === id);
      return `<span class="spot-resident ${known ? 'known' : 'unknown'}" title="${known ? esc(g.name) : 'Undiscovered species'}">${known ? `<button data-goop="${id}" aria-label="Open ${esc(g.name)} field guide"><img src="${GOOP_ART(id)}" alt="" loading="lazy"></button>` : `<img src="${GOOP_ART(id)}" alt="" loading="lazy">`}</span>`;
    }).join('');
    const extra = Math.max(0, sp.goops.length - 6);
    const rosterHTML = open ? `<div class="spot-roster" aria-label="Resident species">${roster}${extra ? `<span class="spot-more">+${extra}</span>` : ''}</div>` : '';
    const study = found && open ? game.habitatResearch(sp.id) : null;
    const nextStudyTier = study ? HABITAT_RESEARCH_TIERS[study.rank] : null;
    const activeStudyBenefits = study ? HABITAT_RESEARCH_TIERS.slice(0, study.rank).map((tier) => tier.benefit) : [];
    const studyHint = [
      activeStudyBenefits.length ? `Active: ${activeStudyBenefits.join(' ')}` : 'No local research perks active yet.',
      nextStudyTier ? `Next rank: ${nextStudyTier.name} — ${nextStudyTier.benefit}` : 'Habitat fully surveyed.',
    ].join(' ');
    const studyStatus = !study ? '' : study.rank === HABITAT_RESEARCH_TIERS.length ? 'MASTERED' : `${study.points}/${study.next} RP`;
    const evidenceChips = (items, label, format = (value) => value) => items.length
      ? `<span class="research-evidence"><b>${label}</b> ${items.slice(0, 4).map((value) => `<i>${esc(format(value))}</i>`).join('')}${items.length > 4 ? `<i>+${items.length - 4}</i>` : ''}</span>`
      : '';
    const speciesEvidence = study?.species?.map((id) => GOOPS.find((g) => g.id === id)?.name || 'Unknown species') || [];
    const evidenceHTML = study ? [
      evidenceChips(speciesEvidence, 'SPECIES'),
      evidenceChips(study.times, 'LIGHT'),
      evidenceChips(study.weather, 'WEATHER', (key) => WEATHER[key]?.label || key),
      evidenceChips(study.baits, 'BAIT', (key) => BAITS[key]?.name || key),
      evidenceChips(study.qualityGrades || [], 'SPECIMENS'),
      evidenceChips((study.observations || []).map((entry) => {
        const event = HABITAT_EVENT_BY_ID.get(entry.id);
        return event ? `${event.icon} ${event.name}` : entry.id;
      }), 'OBSERVED'),
    ].filter(Boolean).join('') : '';
    const nextResearchHTML = nextStudyTier
      ? `<small class="spot-research-next">NEXT: ${esc(nextStudyTier.name)} · ${Math.max(0, nextStudyTier.points - study.points)} RP TO GO — ${esc(nextStudyTier.benefit)}</small>`
      : '<small class="spot-research-next mastered">ALL FOUR FIELD RANKS MASTERED · THIS HABITAT IS FULLY SURVEYED</small>';
    const researchHTML = study ? `<div class="spot-research" title="${esc(studyHint)}">
      <div class="spot-research-head"><span>FIELD JOURNAL</span><b>${study.rank ? `RANK ${study.rank} · ${study.title}` : 'UNSURVEYED'}</b></div>
      <div class="spot-research-track" role="progressbar" aria-label="${esc(sp.name)} field research" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(study.progress * 100)}"><i style="width:${Math.round(study.progress * 100)}%"></i></div>
      <div class="spot-research-summary"><b>${studyStatus}</b><span>${study.catches} landed samples</span><span>${study.perfect} perfect hooks</span></div>
      ${nextResearchHTML}
      ${evidenceHTML ? `<div class="spot-evidence" aria-label="Recorded field evidence">${evidenceHTML}</div>` : '<small class="spot-research-empty">Land your first catch here to begin recording local evidence.</small>'}
    </div>` : '';
    return `<div class="spot ${here ? 'current' : ''} ${open ? '' : 'locked'} ${done ? 'done' : ''}" ${bg}><div class="spot-copy"><b>${open || found ? sp.name : '???'} ${tags}</b><small>${sub}</small>`
      + `<div class="spot-bar"><i style="width:${(p.found / p.total) * 100}%"></i></div><div class="spot-meta">${activityHTML}${rosterHTML}</div>${researchHTML}</div>${btn}</div>`;
  }).join('');
}

function renderNotes() {
  const found = game.state.notes;
  setText('notesCount', `${found.length} / ${NOTES.length}`);
  setText('shinies', game.state.stats.shiny);
  $('noteList').innerHTML = found.length
    ? found.map((id) => { const n = NOTES.find((x) => x.id === id); const g = GOOPS.find((x) => x.id === n.reveals); return `<p><b>${g.name}</b> — ${conditionText(g)}</p>`; }).join('')
    : '<p class="muted">Glowing bottles wash up along the shore. Tap one to read it — each reveals where a rare Goop hides.</p>';
  const explorationNotes = (game.state.explorationNotes || []).map((entry) => ({
    type: 'exploration', day: entry.day, entry,
  }));
  const observations = SPOTS.flatMap((spot) => game.habitatResearch(spot.id).observations.map((entry) => ({
    type: 'habitat', day: entry.day, spot, entry,
  })));
  const journalEntries = [...explorationNotes, ...observations].sort((a, b) => b.day - a.day);
  $('observationList').innerHTML = journalEntries.length ? journalEntries.map((item) => {
    if (item.type === 'exploration') {
      const entry = item.entry;
      const weather = WEATHER[entry.weather]?.label || entry.weather;
      return `<div class="observation-row exploration-entry"><span class="observation-icon">🧭</span><div><b>${esc(entry.title)}</b><small>REEDBED HOLLOW · Day ${entry.day} · ${esc(entry.time)} · ${esc(weather)}</small><p>${esc(entry.note)}</p></div></div>`;
    }
    const { spot, entry } = item;
    const event = HABITAT_EVENT_BY_ID.get(entry.id);
    const weather = WEATHER[entry.weather]?.label || entry.weather;
    return `<div class="observation-row"><span class="observation-icon">${event?.icon || '👁'}</span><div><b>${esc(event?.name || entry.id)}</b><small>${esc(spot.name)} · Day ${entry.day} · ${esc(entry.time)} · ${esc(weather)}</small><p>${esc(event?.description || 'A habitat interaction was recorded.')}</p></div></div>`;
  }).join('') : '<p class="muted">Explore the shoreline and Reedbed Hollow, or observe habitat clues, to build your Field Journal.</p>';
  const log = game.state.catchLog || [];
  $('catchLogList').innerHTML = log.length ? log.slice(0, 8).map((entry) => {
    const goop = GOOPS.find((item) => item.id === entry.goop);
    const date = entry.at ? new Date(entry.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : `Day ${entry.day}`;
    const weather = WEATHER[entry.weather]?.label || entry.weather;
    const bait = BAITS[entry.bait]?.name || entry.bait;
    return `<div class="catch-log-row r-${entry.rarity.toLowerCase()}">
      <img src="${GOOP_ART(entry.goop)}" alt="" loading="lazy">
      <div class="catch-log-copy"><b>${entry.shiny ? '✦ ' : ''}${esc(goop?.name || entry.goop)}</b><small>${esc(spotName(entry.spot))} · ${date} · ${esc(entry.time)} · ${esc(weather)}</small><small>${esc(bait)} bait · ${entry.size.toFixed(1)} cm · ${esc(entry.qualityGrade)} (${entry.qualityScore})</small></div>
      <strong>+${entry.reward}</strong>
    </div>`;
  }).join('') : '<p class="muted">Your recent landings will appear here. Every catch is saved to this local log.</p>';
}

function baitRows() {
  const s = game.state;
  return Object.entries(BAITS).map(([k, b]) => {
    const n = k === 'worm' ? '∞' : s.baits[k] || 0;
    const on = s.bait === k;
    const use = on ? '<button class="on" disabled>IN USE</button>' : `<button class="use" data-bait="${k}" ${k !== 'worm' && !s.baits[k] ? 'disabled' : ''}>USE</button>`;
    const buy = b.cost ? `<button data-buybait="${k}" ${s.essence < b.cost ? 'disabled' : ''} title="Buy ${b.pack}">+${b.pack} · ${b.cost}</button>` : '';
    return `<div class="option bait-row ${on ? 'equipped' : ''} ${shelfFocus?.kind === 'bait' && shelfFocus.id === k ? 'shelf-selected' : ''}" data-shelf-bait="${k}"><span class="ico emoji">${b.icon}</span><div class="txt"><b>${b.name} <i class="own">×${n}</i></b><small>${b.desc}</small></div><div class="btns">${use}${buy}</div></div>`;
  }).join('');
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
  setHTML('loadoutCard', loadoutHTML());
  if (view === 'shack') { renderTackle(); renderQuest(); drawRack(); }
  if (view === 'aquarium') renderTank();
  const b = BAITS[s.bait];
  setHTML('baitBtn', `<span class="emoji">🎣</span><i>${b.icon}${s.bait === 'worm' ? '' : s.baits[s.bait] || 0}</i>`);
  $('baitBtn').title = `Tackle box · bait: ${b.name}`;
  const buddy = s.buddy ? GOOPS.find((g) => g.id === s.buddy) : null;
  setHTML('buddyLine', buddy
    ? `<img src="${GOOP_ART(buddy.id)}" alt=""><span><b>${buddy.name}</b> is your buddy · level ${s.buddyLv + 1} · +${Math.round(buddyBonus(s.buddyLv) * 100)}% Essence. It spots secrets nearby. Feed it treats in the tackle box to help it grow.</span>`
    : '<span>No buddy yet. Open any Goop you’ve caught in the GoopDex and tap <b>MAKE BUDDY</b>.</span>');
}

function bountyHTML() {
  const s = game.state;
  return s.bounties.map((b) => {
    const pct = Math.round((b.have / b.need) * 100);
    const bait = b.bait ? ` + ${BAITS[b.bait].icon}×${b.baitN}` : '';
    return `<div class="bounty ${b.done ? 'done' : ''}"><div class="b-text"><b>${esc(b.text)}</b><small>${b.done ? '✓ Paid out' : `${b.have} / ${b.need}`}</small><div class="spot-bar wide"><i style="width:${pct}%"></i></div></div><div class="b-reward">+${b.essence}<small>ESSENCE${bait}</small></div></div>`;
  }).join('') || '<p class="muted">No bounties posted.</p>';
}

function renderBounties() {
  const html = bountyHTML();
  setHTML('bountyList', html);
  if ($('bountyDlg').open) setHTML('bountyDlgList', html);
  const done = game.state.bounties.filter((b) => b.done).length;
  setText('bountyCount', `${done} / ${game.state.bounties.length}`);
  setHTML('boardBtn', `${ICON.board}<i>${done}/${game.state.bounties.length}</i>`);
  const canReroll = game.state.essence >= REROLL_COST && game.state.bounties.some((b) => !b.done);
  for (const id of ['rerollBtn', 'rerollBtn2']) { $(id).disabled = !canReroll; $(id).textContent = `NEW BOUNTIES · ${REROLL_COST}`; }
}

function renderSets() {
  const s = game.state;
  setText('setCount', `${s.sets.length} / ${SETS.length}`);
  $('setList').innerHTML = SETS.map((set) => {
    const done = s.sets.includes(set.id);
    const have = set.goops.filter((id) => s.dex[id]).length;
    const faces = set.goops.map((id) => {
      const e = s.dex[id];
      const seen = s.seen.includes(id);
      return `<img src="${GOOP_ART(id)}" alt="${e || seen ? esc(goopName(id)) : '???'}" title="${e || seen ? esc(goopName(id)) : '???'}" class="${e ? '' : 'locked'}" loading="lazy">`;
    }).join('');
    return `<div class="set ${done ? 'done' : ''}"><div class="set-head"><span class="trophy">${done ? '🏆' : set.icon}</span><b>${set.name}</b><small>${done ? 'COMPLETE' : `${have}/${set.goops.length} · +${set.reward}`}</small></div><div class="faces">${faces}</div></div>`;
  }).join('');
}

/** The pond map: spots around the shore, with fog over what you have not found. */
function renderMap() {
  const s = game.state;
  const cx = 500, cy = 200, rx = 420, ry = 150;
  const at = (pos) => {
    const u = (pos + 1) / 9;
    const a = (1 - u) * (Math.PI + 0.32) + u * -0.32;
    return [cx + rx * Math.cos(a), cy - ry * Math.sin(a)];
  };
  const rumor = game.rumor();
  const pins = SPOTS.map((sp) => {
    const [x, y] = at(sp.pos);
    const found = s.discovered.includes(sp.id);
    const open = game.spotUnlocked(sp.id);
    if (sp.secret && !found && rumor?.spot !== sp.id) return '';
    const cls = ['pin', open ? 'open' : 'locked', found ? 'found' : 'fog', game.here && s.spot === sp.id ? 'here' : '', s.completed.includes(sp.id) ? 'done' : '', sp.secret ? 'secret' : ''].join(' ');
    const label = found ? sp.name.replace(/^The /, '') : open ? 'Unexplored' : sp.secret ? '???' : `🔒 ${sp.unlockAt}`;
    const p = game.spotProgress(sp.id);
    const badge = `${s.frenzy === sp.id ? '<text class="bdg" dx="22" dy="-20">✦</text>' : ''}${s.visitor?.spot === sp.id ? '<text class="bdg v" dx="-30" dy="-20">👁</text>' : ''}`;
    const accessibleLabel = open
      ? `${label}. Walk to this spot.`
      : sp.secret
        ? 'Hidden location. Not yet accessible.'
        : `${sp.name}. Locked. Requires GoopDex ${sp.unlockAt}.`;
    return `<g class="${cls}" ${open ? `data-walk="${sp.id}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" role="${open ? 'button' : 'img'}" ${open ? 'tabindex="0" focusable="true"' : ''} aria-label="${esc(accessibleLabel)}">`
      + `<circle r="26"/><text class="ico" dy="8">${found ? SPOT_ICON[sp.id] : open ? '•' : sp.secret ? '?' : '🔒'}</text>${badge}`
      + `<text class="lbl" dy="48">${esc(label)}</text>${found ? `<text class="sub" dy="64">${p.found}/${p.total}</text>` : ''}</g>`;
  }).join('');
  const [mx, my] = at(Math.max(-1, Math.min(8, toShore(walker.x))));
  const fog = SPOTS.filter((sp) => !s.discovered.includes(sp.id)).map((sp) => { const [x, y] = at(sp.pos); return `<circle class="fogc" cx="${x}" cy="${y}" r="70"/>`; }).join('');
  $('mapSvg').innerHTML = `<defs><radialGradient id="pondg" cx="50%" cy="45%"><stop offset="0" stop-color="#1b6a86"/><stop offset=".7" stop-color="#0c3a52"/><stop offset="1" stop-color="#082636"/></radialGradient>`
    + `<filter id="fogblur"><feGaussianBlur stdDeviation="14"/></filter></defs>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx + 46}" ry="${ry + 46}" fill="#16361f" stroke="#2f6b34" stroke-width="3"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${rx - 34}" ry="${ry - 34}" fill="url(#pondg)" stroke="#8df28a" stroke-opacity=".35" stroke-width="2"/>`
    + `<path d="M${at(-1).join(' ')} ${Array.from({ length: 37 }, (_, i) => at(-1 + i / 4).join(' ')).map((p) => `L${p}`).join(' ')}" fill="none" stroke="#e8d9a8" stroke-opacity=".5" stroke-width="4" stroke-dasharray="2 10" stroke-linecap="round"/>`
    + `<g filter="url(#fogblur)">${fog}</g>${pins}`
    + `<g class="me" transform="translate(${mx.toFixed(1)} ${(my - 40).toFixed(1)})"><path d="M-9 -14h18l-9 14z"/></g>`;
  const v = s.visitor;
  const parts = [`Day ${s.day} · ${game.timeOfDay} · ${game.weather.label}`, `${MOON[game.moon]}${game.fullMoon ? ' — legends stir tonight!' : ''}`];
  if (s.frenzy) parts.push(`✦ Feeding frenzy at ${spotName(s.frenzy)}`);
  if (v) parts.push(`👁 ${s.seen.includes(v.goop) ? goopName(v.goop) : 'A rare Goop'} is visiting ${spotName(v.spot)} today`);
  setHTML('mapNews', parts.map((p) => `<span>${esc(p)}</span>`).join(''));
  setHTML('mapRumor', rumor ? `<b>Old Wiggs:</b> ${esc(rumor.text)}` : s.discovered.filter((id) => SECRETS.includes(id)).length === 3 ? '<b>Old Wiggs:</b> “You’ve found every secret on this pond. I’m impressed.”' : '<b>Old Wiggs:</b> “Fill that GoopDex and the path will open up. Then come ask me again.”');
}

function renderMinimap() {
  const s = game.state;
  const span = WORLD_MAX - WORLD_MIN;
  const pct = (x) => `${((x - WORLD_MIN) / span) * 92 + 4}%`;
  const pins = SPOTS.filter((sp) => !sp.secret || s.discovered.includes(sp.id)).map((sp) => {
    const open = game.spotUnlocked(sp.id);
    const p = game.spotProgress(sp.id);
    const cls = [open ? 'open' : 'locked', s.spot === sp.id && game.here ? 'here' : '', s.completed.includes(sp.id) ? 'done' : '', s.frenzy === sp.id ? 'frenzy' : '', sp.secret ? 'secret' : ''].join(' ');
    const label = open || s.discovered.includes(sp.id) ? sp.name.replace(/^The /, '') : '???';
    return `<button class="mm-pin ${cls}" style="left:${pct(SPOT_X[sp.id])}" data-walk="${sp.id}" title="${label}${open ? ` · ${p.found}/${p.total}` : ` · needs GoopDex ${sp.unlockAt}`}" aria-label="${label}"><i>${open ? '' : '🔒'}</i><span>${label}</span></button>`;
  }).join('');
  const clues = SECRETS.filter((id) => game.secretVisible(id)).map((id) => `<span class="mm-clue" style="left:${pct(CLUE_X[id])}" title="Something is out there…">?</span>`).join('');
  setHTML('minimap', `<div class="mm-track"></div>${pins}${clues}<span class="mm-me" id="mmMe"></span>`);
  const me = $('mmMe');
  if (me) me.style.left = pct(walker.x);
}

let lastLists = '';
function renderLists(force) {
  const s = game.state;
  const sig = JSON.stringify([s.essence, s.spot, game.here, s.discovered, s.gear, game.dexCount, s.stats.caught, s.notes.length, s.catchLog?.length || 0, s.completed, game.busy, dexFilter,
    Object.keys(snaps).length, s.seen.length, s.bait, s.baits, s.buddy, s.buddyLv, s.equip, s.owned, s.finder, s.tips.length, s.sets, s.bounties.map((b) => b.have + b.id), s.frenzy, s.visitor, s.timeIndex, s.weather, s.activity, s.research, SECRETS.map((id) => game.secretVisible(id))]);
  if (!force && sig === lastLists) return;
  lastLists = sig;
  renderDex(); renderSpots(); renderShop(); renderNotes(); renderMinimap(); renderBounties(); renderSets();
  if ($('mapDlg').open) renderMap();
}

function renderFight() {
  const fight = game.fight;
  const active = game.phase === PHASES.FIGHT && fight;
  const hud = $('fightUi');
  hud.classList.toggle('dim', !active);
  hud.setAttribute('aria-hidden', active ? 'false' : 'true');
  renderMove(active ? fight : null);
  const cue = active ? fightReadout(fight) : null;
  const cueEl = $('fightCue');
  cueEl.hidden = !cue;
  if (cue) {
    cueEl.dataset.kind = cue.kind;
    cueEl.classList.toggle('urgent', !!cue.urgent);
    setText('fightCueTitle', cue.title);
    setText('fightCueAction', cue.action);
    setText('fightCueTime', cue.time == null ? '' : `${cue.time.toFixed(1)}s`);
    cueEl.classList.toggle('metered', cue.ratio != null);
    $('fightCueFill').style.width = `${Math.round((cue.ratio ?? 0) * 100)}%`;
  }
  if (!active) return;
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  const shift = (fight.zoneShift || 0) + (fight.crystalOffset || 0);
  const lo = fight.safeLo + shift, hi = fight.safeHi + shift;
  const m = fight.move;
  const paused = fight.breakT > 0 || (m && ['tug', 'rhythm', 'thrash'].includes(m.type));
  hud.classList.toggle('paused', !!paused);
  hud.classList.toggle('in-zone', fight.tension >= lo && fight.tension <= hi);
  hud.classList.toggle('danger', !paused && (fight.tension > 0.88 || fight.tension < 0.15));
  hud.classList.toggle('warn', !!fight.warn || !!fight.flowSurge || !!fight.sporeActive || !!fight.pressureActive || !!fight.wreckSnagActive);
  hud.classList.toggle('drifting', m?.type === 'current');
  $('tensionBar').style.width = `${fight.tension * 100}%`;
  $('needle').style.left = `${fight.tension * 100}%`;
  $('safeZone').style.left = `${lo * 100}%`;
  $('safeZone').style.width = `${(hi - lo) * 100}%`;
  $('progressBar').style.width = `${fight.progress * 100}%`;
  const staminaPct = pct(fight.stamina / (fight.maxStamina || game.goop.stamina));
  $('staminaBar').style.width = `${staminaPct}%`;
  setText('tensionText', `${pct(fight.tension)}%`);
  setText('progressText', `${pct(fight.progress)}%`);
  setText('staminaText', `${staminaPct}%`);
  setText('heftText', `${fight.sizeClass || 'AVERAGE'} SIZE`);
  hud.classList.toggle('size-heavy', fight.sizeClass === 'HEAVY');
  hud.classList.toggle('size-light', fight.sizeClass === 'LIGHT');
  setText('tensionLbl', fight.warn ? 'EASE OFF!' : fight.flowSurge ? 'CURRENT!' : fight.flowWarning ? 'SURGE SOON' : fight.sporeWarning ? 'BLOOM SOON' : fight.sporeActive ? 'SPORE BLOOM!' : fight.pressureWarning ? 'DROP SOON' : fight.pressureActive ? 'PRESSURE!' : fight.wreckSnagWarning ? 'SNAG SOON' : fight.wreckSnagActive ? 'CUT FREE!' : fight.crystalWarning ? 'PRISM SHIFT' : fight.crystalOffset ? 'FOLLOW BAND' : paused ? 'HOLD ON' : m?.type === 'current' ? 'FOLLOW' : 'TENSION');
  const c = fight.combo || 1;
  const combo = $('combo');
  combo.classList.toggle('show', c > 1 && !paused);
  setText('combo', c > 1 ? `STREAK ×${c.toFixed(2).replace(/0$/, '')}` : '');
  // stage pips and markers on the catch bar
  setHTML('stagePips', fight.stages > 1 ? Array.from({ length: fight.stages }, (_, i) => `<i class="${i + 1 < fight.stage ? 'done' : i + 1 === fight.stage ? 'now' : ''}"></i>`).join('') : '');
  setHTML('stageMarks', fight.stages > 1 ? Array.from({ length: fight.stages - 1 }, (_, i) => `<i style="left:${((i + 1) / fight.stages) * 100}%"></i>`).join('') : '');
  // steer buttons light up during steering moves
  const steerDir = m?.type === 'swerve' ? m.dir : m?.type === 'thrash' ? { L: -1, R: 1 }[m.steps[m.idx]] || 0 : 0;
  $('leftBtn').classList.toggle('steer', steerDir === -1);
  $('rightBtn').classList.toggle('steer', steerDir === 1);
  $('reelBtn').classList.toggle('mash', m?.type === 'tug' || m?.type === 'rhythm' || (m?.type === 'thrash' && m.steps[m.idx] === 'T') || (m?.type === 'fakeout' && m.state === 'surge'));
  $('reelBtn').classList.toggle('hands-off', m?.type === 'fakeout' && m.state === 'still');
}

/** The big prompt in the middle of the scene for each signature move. */
let moveKey = '';
function renderMove(fight) {
  const el = $('movePrompt');
  const m = fight?.move;
  const brk = fight && fight.breakT > 0;
  if (!m && !brk) { if (moveKey) { el.className = 'move-prompt'; el.innerHTML = ''; moveKey = ''; } return; }
  if (brk) {
    const k = `break${fight.stage}`;
    if (moveKey !== k) { moveKey = k; el.className = 'move-prompt show break'; el.innerHTML = `<div class="mp-title">IT BREAKS AWAY!</div><div class="mp-big">STAGE ${fight.stage + 1} <small>/ ${fight.stages}</small></div><div class="mp-how">Catch your breath — it’s coming back angrier</div>`; }
    return;
  }
  const info = MOVE_INFO[m.type];
  const k = `${m.type}${fight.moveCount}`;
  if (moveKey !== k) {
    moveKey = k;
    el.className = `move-prompt show mv-${m.type}`;
    let body = '';
    if (m.type === 'swerve') body = `<div class="mp-arrow ${m.dir < 0 ? 'l' : 'r'}"><span>${m.dir < 0 ? '◀' : '▶'}</span><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="ring" id="mpRing"/></svg></div>`;
    else if (m.type === 'tug') body = `<div class="tug"><span class="side goop">${esc(game.goop.name)}</span><div class="rope"><i class="mid"></i><b id="tugKnot"></b></div><span class="side you">YOU</span></div>`;
    else if (m.type === 'fakeout') body = '<div class="sleep" id="sleepFace"><span>😴</span><b>HANDS OFF…</b></div>';
    else if (m.type === 'rhythm') body = `<div class="lane" id="lane"><i class="target"></i>${Array.from({ length: m.n }, (_, i) => `<b class="note" data-i="${i}"></b>`).join('')}</div>`;
    else if (m.type === 'current') body = '<div class="cur"><div class="cur-bar"><i id="curFill"></i><em style="left:60%"></em></div><small>stay in the zone 60% of the time</small></div>';
    else if (m.type === 'thrash') body = `<div class="steps">${m.steps.map((s, i) => `<b data-i="${i}">${s === 'L' ? '◀' : s === 'R' ? '▶' : '●'}</b>`).join('')}</div><div class="step-time"><i id="stepTime"></i></div>`;
    el.innerHTML = `<div class="mp-title">${info.name.toUpperCase()}!</div>${body}<div class="mp-how">${info.how}${m.type === 'swerve' || m.type === 'thrash' ? ' <span class="keys">(◀ ▶ buttons, swipe, or arrow keys)</span>' : ''}</div>`;
  }
  // live parts
  if (m.type === 'swerve') { const r = $('mpRing'); if (r) r.style.strokeDashoffset = String(276 * Math.min(1, m.t / m.window)); }
  else if (m.type === 'tug') { const kn = $('tugKnot'); if (kn) kn.style.left = `${50 + m.pos * 50}%`; }
  else if (m.type === 'fakeout') {
    const f = $('sleepFace');
    if (f) {
      const state = m.state === 'surge' ? 'now' : fight.tell ? 'tell' : 'still';
      if (f.dataset.s !== state) { f.dataset.s = state; f.innerHTML = state === 'now' ? '<span>😠</span><b>NOW! REEL!</b>' : state === 'tell' ? '<span>👀</span><b>…</b>' : '<span>😴</span><b>HANDS OFF…</b>'; el.classList.toggle('now', state === 'now'); }
    }
  } else if (m.type === 'rhythm') {
    const lane = $('lane');
    if (lane) for (const n of lane.querySelectorAll('.note')) {
      const i = Number(n.dataset.i), dtb = m.lead + i * m.gap - m.t;
      n.style.left = `${12 + Math.max(-0.2, dtb) / 1.6 * 88}%`;
      n.className = `note ${m.judged[i] === true ? 'hit' : m.judged[i] === false ? 'miss' : ''}`;
    }
  } else if (m.type === 'current') { const cf = $('curFill'); if (cf) cf.style.width = `${Math.min(100, (m.inZone / m.dur) * 100)}%`; }
  else if (m.type === 'thrash') {
    el.querySelectorAll('.steps b').forEach((b) => { const i = Number(b.dataset.i); b.className = i < m.idx ? 'done' : i === m.idx ? 'now' : ''; });
    const st = $('stepTime'); if (st) st.style.width = `${Math.max(0, 1 - m.stepT / m.window) * 100}%`;
  }
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
function renderSessionTelemetry() {
  const summary = sessionTelemetry.summary();
  const formatSeconds = ms => ms == null ? '—' : (ms / 1000).toFixed(1) + 's';
  setText('sessionRounds', String(summary.completedRounds));
  setText('sessionCatchRate', summary.catchRate == null ? '—' : Math.round(summary.catchRate * 100) + '%');
  setText('sessionFightTime', formatSeconds(summary.averageFightMs));
  setText('sessionEssence', summary.catchReward.toLocaleString());
  const rate = summary.catchesPerHour == null ? '—' : Math.round(summary.catchesPerHour) + ' catches/hour';
  setText('sessionNotice', summary.events.casts + ' casts · ' + summary.events.hooks + ' hooked · ' + summary.events.misses + ' missed · ' + summary.events.escapes + ' broke free · ' + rate);
  $('exportSessionBtn').disabled = summary.events.casts === 0;
}
function render(dt) {
  const exploreBtn = $('exploreBtn');
  if (exploreBtn) exploreBtn.hidden = hollow.active || !game.spotUnlocked('reeds') || Math.abs(walker.x - SPOT_X.reeds) > 360 || game.busy;
  const p = game.phase;
  const walking = Math.abs(walker.v) > 30;
  setText('phaseTag', walking ? 'WALKING' : PHASE_TAG[p]);
  $('phaseTag').className = `chip phase ${walking ? '' : PHASE_CLASS[p] || ''}`;
  const w = game.state.weather;
  setHTML('weatherTag', `${ICON[game.timeOfDay]}${ICON[w] || ''}<span>${game.weather.label} · ${game.timeOfDay}</span>`);
  pumpNotes();
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
  const z = game.zone();
  const near = z.spot;
  const arrow = walker.v < -30 ? '◀ ' : '';
  const arrowR = walker.v > 30 ? ' ▶' : '';
  const label = game.here ? game.spot.name : z.between ? `Shore · ${z.between[0].name.replace(/^The /, '')} ↔ ${z.between[1].name.replace(/^The /, '')}` : `Shore near ${near.name.replace(/^The /, '')}`;
  setText('spotLabel', `${arrow}${label}${arrowR}`.toUpperCase());
  const prog = game.spotProgress(near.id);
  setText('spotProg', `${prog.found}/${prog.total}`);
  // event chip: frenzy nearby / full moon / visitor
  const s = game.state;
  const evs = [];
  const ecology = game.ecosystemStatus();
  evs.push(`<span class="ev activity" title="${ecology.description}">◉ ${ecology.label}</span>`);
  if (z.mix.some(([spot, share]) => spot.id === 'reeds' && share >= 0.65)) {
    evs.push('<span class="ev" title="Dense cattails shelter feeding schools. Each cast builds water activity twice as fast here.">🌾 REED COVER · ACTIVITY ×2</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'boulder' && share >= 0.65)) {
    evs.push('<span class="ev" title="Rocky eddies narrow the safe tension window during fights. Better line upgrades can offset the strain.">🪨 ROCKY CURRENT · TIGHTER LINE WINDOW</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'falls' && share >= 0.65)) {
    evs.push('<span class="ev" title="The waterfall current pulses every six seconds during fights. Watch for CURRENT BUILDING, then manage the stronger pull during the surge.">💧 FALLS CURRENT · SURGE CYCLES</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'cave' && share >= 0.65)) {
    evs.push('<span class="ev" title="Crystal refraction shifts the safe line window every five seconds. Watch the warning and follow the moving green band.">🔮 PRISM LIGHT · SHIFTING LINE WINDOW</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'grotto' && share >= 0.65)) {
    evs.push('<span class="ev" title="Glowshroom spores bloom every eight seconds. The Goop pulls less and reeling is more effective during the short luminous window.">🍄 SPORE BLOOM · TIMED REEL WINDOW</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'deep' && share >= 0.65)) {
    evs.push('<span class="ev" title="Abyssal pressure sinks the line every nine seconds. Watch for the warning and reel through the short pressure drop to prevent slack.">⬇️ ABYSSAL PRESSURE · REEL THROUGH THE DROP</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'dock' && share >= 0.65) && game.timeOfDay === 'Night') {
    evs.push('<span class="ev" title="The Old Dock lanterns draw rare Goops that naturally feed after dark, including Lanternfin and Drowsy.">🏮 LANTERN WAKE · NIGHT FEEDERS</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'lily' && share >= 0.65) && (game.timeOfDay === 'Dawn' || game.timeOfDay === 'Dusk')) {
    evs.push('<span class="ev petal" title="Dawn and dusk petals gather rare drift-pattern Goops along the Lily Cove bloom line.">🌸 PETAL DRIFT · RARE DRIFTERS</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'sandbar' && share >= 0.65) && game.fullMoon && game.timeOfDay === 'Night') {
    evs.push('<span class="ev moon" title="Full-moon tide pools at the Moonlit Sandbar favour larger specimens. The size bonus is locked in when you cast.">🌕 MOON-TIDE · TROPHY GOOPS</span>');
  }
  if (z.mix.some(([spot, share]) => spot.id === 'wreck' && share >= 0.65)) {
    evs.push('<span class="ev" title="Loose wreck rigging catches your line every eight seconds. Watch the direction cue and steer that way to cut free.">⚓ WRECK RIGGING · CUT FREE WITH STEERING</span>');
  }
  const sighting = view === 'pond' ? scene?.currentSighting : null;
  if (sighting) {
    const hint = `Observed in ${sighting.habitatName}. Current habitat, weather and time rules permit this Goop to bite; a sighting is not a guaranteed catch.`;
    evs.push(`<span class="ev sighting" title="${esc(hint)}">👁 ${esc(sighting.name.toUpperCase())} · ${esc(sighting.rarity.toUpperCase())} SEEN</span>`);
  }
  if (s.frenzy && z.mix.some(([sp, k]) => sp.id === s.frenzy && k >= 0.5)) evs.push('<span class="ev frenzy">✦ FRENZY HERE</span>');
  else if (s.frenzy) evs.push(`<span class="ev">✦ FRENZY · ${spotName(s.frenzy).replace(/^The /, '').toUpperCase()}</span>`);
  if (game.fullMoon && game.timeOfDay === 'Night') evs.push('<span class="ev moon">🌕 FULL MOON</span>');
  const localInteraction = z.mix.filter(([spot, share]) => share >= 0.45)
    .map(([spot, share]) => ({ spot, share, interaction: game.habitatInteraction(spot.id) }))
    .filter((entry) => entry.interaction)
    .sort((a, b) => b.share - a.share)[0];
  if (localInteraction) {
    const { spot, interaction } = localInteraction;
    const logged = game.habitatResearch(spot.id).observations.some((entry) => entry.id === interaction.id);
    evs.push(`<span class="ev interaction" title="${esc(interaction.description)}">${interaction.icon} ${esc(interaction.name.toUpperCase())} · ${esc(interaction.clue)}</span>`);
    evs.push(`<button type="button" class="ev-observe" data-observe-interaction data-spot="${spot.id}" data-interaction-id="${interaction.id}" ${logged || game.busy ? 'disabled' : ''}>${logged ? '✓ LOGGED IN FIELD JOURNAL' : '👁 OBSERVE · +8 RESEARCH'}</button>`);
  }
  setHTML('eventTag', evs.join(''));
  $('castBtn').disabled = game.busy || walking;
  setHTML('castBtn', game.here ? 'CAST LINE <kbd>C</kbd>' : 'CAST HERE <kbd>C</kbd>');
  const free = !game.busy;
  const steering = game.phase === PHASES.FIGHT || (game.phase === PHASES.CAST && !!game.sight);
  $('leftBtn').disabled = !free && !steering; $('rightBtn').disabled = !free && !steering;
  $('leftBtn').classList.toggle('steer-mode', steering); $('rightBtn').classList.toggle('steer-mode', steering);
  $('walkHint').classList.toggle('show', free && !walking && game.state.stats.caught < 3 && game.state.discovered.length < 3 && p === PHASES.IDLE);
  const reel = $('reelBtn');
  reel.classList.toggle('active', reelHeld);
  reel.classList.toggle('ready', p === PHASES.BITE && !reelHeld);
  reel.setAttribute('aria-pressed', String(reelHeld));
  if (p !== PHASES.CAUGHT) $('catchCard').hidden = true;
  sceneEl.classList.toggle('caught', p === PHASES.CAUGHT);
  sceneEl.classList.toggle('fighting', game.busy);
  const me = $('mmMe');
  if (me) me.style.left = `${((walker.x - WORLD_MIN) / (WORLD_MAX - WORLD_MIN)) * 92 + 4}%`;
  if (scene) scene.boardAlert = boardUnseen();
  $('boardBtn').classList.toggle('alert', boardUnseen());
  renderFight();
  renderLists(false);
  renderFinder();
  renderHuntChip();
  renderQuestChip();
}

function showCatchCard(c) {
  const g = GOOPS.find((x) => x.id === c.goop);
  if (!g) return;
  const card = $('catchCard');
  card.style.setProperty('--rc', c.shiny ? '#fff27a' : `var(--r-${g.rarity.toLowerCase()})`);
  const art = $('ccArt');
  art.src = GOOP_ART(g.id);
  art.alt = `${c.shiny ? 'Shiny ' : ''}${g.name} caught`;
  card.classList.toggle('is-shiny', Boolean(c.shiny));
  card.dataset.rarity = g.rarity.toLowerCase();
  $('ccName').textContent = `${c.shiny ? '✦ ' : ''}${g.name}`;
  $('ccRarity').textContent = `${c.shiny ? 'SHINY · ' : ''}${g.rarity.toUpperCase()}`;
  const specimen = c.quality || { score: 0, grade: 'Rough' };
  $('ccQuality').textContent = `${specimen.grade.toUpperCase()} SPECIMEN · ${specimen.score}/100`;
  card.dataset.quality = specimen.grade.toLowerCase();
  $('ccReward').textContent = `+${c.reward} Essence`;
  $('ccSize').textContent = `${c.size} cm${c.record ? ' · RECORD!' : ''}`;
  $('ccTime').textContent = `${c.time.toFixed(1)}s`;
  const extras = [];
  if (c.perfect) extras.push('PERFECT HOOK');
  else if (c.hookGrade === 'clean') extras.push('CLEAN HOOK');
  if (c.combo > 1) extras.push(`BEST STREAK ×${c.combo.toFixed(2).replace(/0$/, '')}`);
  if (c.skillBonus > 0) extras.push(`SKILL BONUS +${Math.round(c.skillBonus * 100)}%`);
  $('ccExtra').textContent = extras.join(' · ');
  const progression = [];
  if (c.research) {
    progression.push(c.research.rank > c.research.previousRank
      ? `FIELD RESEARCH +${c.research.earned} RP · ${c.research.title.toUpperCase()} RANK ${c.research.rank}`
      : `FIELD RESEARCH +${c.research.earned} RP · ${c.research.total} RP TOTAL`);
  }
  if (c.bonusEssence > 0) progression.push(`BONUS +${c.bonusEssence} ESSENCE`);
  if (c.progressMilestones?.length) progression.push(...c.progressMilestones.map((item) => item.toUpperCase()));
  if (c.qualityRecord) progression.push(`NEW ${specimen.grade.toUpperCase()} QUALITY RECORD · ${specimen.score}/100`);
  $('ccProgress').textContent = progression.join(' · ');
  const badge = $('ccNew');
  badge.hidden = !(c.firstTime || c.record || c.shiny || c.qualityRecord);
  badge.textContent = c.firstTime ? 'NEW!' : c.shiny ? 'SHINY!' : c.qualityRecord ? 'QUALITY!' : 'RECORD!';
  const habitatId = c.research?.spot && SPOT_BY[c.research.spot] ? c.research.spot : game.spot.id;
  const habitat = SPOT_BY[habitatId] || game.spot;
  const p = game.spotProgress(habitatId);
  $('ccHint').textContent = `${habitat.name}: ${p.found}/${p.total} found · cast again or walk on`;
  card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

// ---------- bounty board "seen" marker ----------

function boardUnseen() {
  try { return localStorage.getItem('goop-board-seen') !== `${game.state.bountyDay}`; } catch { return false; }
}
function markBoardSeen() { try { localStorage.setItem('goop-board-seen', `${game.state.bountyDay}`); } catch { /* ignore */ } }

// ---------- events ----------

let pendingCatch = null;
function addCatchProgress(amount, milestone) {
  if (!pendingCatch) return;
  const bonus = Math.max(0, Math.floor(Number(amount) || 0));
  pendingCatch.bonusEssence = (pendingCatch.bonusEssence || 0) + bonus;
  if (milestone) pendingCatch.progressMilestones.push(milestone);
}
function handleEvents() {
  for (const e of game.events.splice(0)) {
    scene?.onEvent(e, game);
    const d = e.detail;
    switch (e.type) {
      case 'cast': sfx.cast(); break;
      case 'bite': sfx.bite(); navigator.vibrate?.(60); break;
      case 'hooked': sfx.hook(); if (d.perfect) sfx.perfect(); navigator.vibrate?.(30); lastLists = ''; break;
      case 'lunge': sfx.snap(); navigator.vibrate?.([60, 30, 60]); break;
      case 'moveStart': sfx.moveStart(d.move); navigator.vibrate?.(25); break;
      case 'moveWin': sfx.moveWin(); navigator.vibrate?.([20, 40, 20]); break;
      case 'moveFail': sfx.moveFail(); navigator.vibrate?.(90); break;
      case 'beat': sfx.beat(); navigator.vibrate?.(12); break;
      case 'beatHit': sfx.beatHit(); break;
      case 'beatMiss': sfx.bump(); break;
      case 'step': sfx.beatHit(); break;
      case 'surge': sfx.splash(true); navigator.vibrate?.(60); break;
      case 'breakaway': sfx.splash(true); sfx.gong(); navigator.vibrate?.([80, 60, 120]); break;
      case 'stage': sfx.gong(); break;
      case 'dodge': sfx.dodge(); break;
      case 'combo': sfx.combo(d.combo); break;
      case 'catch':
        if (d.firstTime) newDex.add(d.goop);
        lastLists = '';
        pendingCatch = { ...d, bonusEssence: 0, progressMilestones: [], research: null };
        sfx.splash(true); scene?.cheer(); tank?.sync(game.state, tankIdx);
        if (d.firstTime) {
          const nm = goopName(d.goop);
          setTimeout(() => notify(d.tank >= 0 ? `🐠 ${nm} moved into ${game.state.tank.tanks[d.tank].name}.` : `🐠 Your tanks are full — ${nm} is waiting in storage at the Aquarium.`, 2600), 3800);
        }
        break;
      case 'research':
        if (pendingCatch && d) pendingCatch.research = d;
        lastLists = '';
        if (d.rank > d.previousRank) {
          const tier = HABITAT_RESEARCH_TIERS[d.rank - 1];
          notify(`📖 ${spotName(d.spot)} research reached rank ${d.rank}: ${tier.name}! ${tier.benefit}`, 3900);
          sfx.discover();
        } else if (d.firstSample) {
          notify(`📖 Field research started at ${spotName(d.spot)} · +${d.earned} RP. Study different species, times, weather and baits.`, 3900);
          sfx.note();
        }
        break;
      case 'observation':
        if (d.discovered) {
          notify(`📖 ${spotName(d.spot)} · ${d.name} recorded in the Field Journal · +${d.earned} RP`, 3600);
          sfx.discover();
        }
        lastLists = '';
        break;
      case 'escaped': sfx.snap(); navigator.vibrate?.([40, 40, 80]); break;
      case 'missedBite': sfx.splash(); break;
      case 'upgrade': case 'buyBait': case 'lure': case 'finder': case 'buddyTrain': sfx.coin(); lastLists = ''; bumpWallet(); break;
      case 'tackle': if (d.bought) { sfx.coin(); bumpWallet(); } else sfx.note(); lastLists = ''; break;
      case 'charm': sfx.secret(); lastLists = ''; bumpWallet(); finderSig = ''; break;
      case 'tip': lastLists = ''; break;
      case 'questReady': setTimeout(() => { notify(`📜 Quest complete: ${d.title}! Visit Old Wiggs at the Bait Shack.`, 3400); sfx.discover(); }, 2200); break;
      case 'questClaim': lastLists = ''; break;
      case 'tips': case 'decor': lastLists = ''; break;
      case 'bait': sfx.note(); lastLists = ''; break;
      case 'baitOut': notify(`Out of ${BAITS[d.bait].name} — back to worms. Restock in the bait box.`, 3000); lastLists = ''; break;
      case 'buddy': sfx.discover(); lastLists = ''; break;
      case 'discover':
        sfx.discover(); lastLists = '';
        setTimeout(() => { if (scene && game.here && game.state.spot === d.spot) { snaps[d.spot] = scene.snapshot(360); lastLists = ''; } }, 1600);
        break;
      case 'secret': sfx.secret(); lastLists = ''; walker.target = SPOT_X[d.spot]; navigator.vibrate?.([30, 50, 30, 50, 90]); break;
      case 'travel': lastLists = ''; if (!snaps[d.spot]) setTimeout(() => { if (scene && game.here) { snaps[game.state.spot] = scene.snapshot(360); lastLists = ''; } }, 1600); break;
      case 'unlock': setTimeout(() => { notify(`The path to ${spotName(d.spot)} is clear! Walk on to explore.`, 3200); sfx.discover(); }, 2400); lastLists = ''; break;
      case 'spotComplete':
        addCatchProgress(d.bonus, `${spotName(d.spot)} completed`);
        setTimeout(() => { notify(`${spotName(d.spot)} complete! +${d.bonus} Essence bonus`); sfx.coin(); }, 3000);
        break;
      case 'set': {
        const completedSet = SETS.find((x) => x.id === d.set);
        addCatchProgress(d.reward, completedSet ? `Collection: ${completedSet.name}` : 'Collection completed');
        setTimeout(() => { notify(`🏆 Collection complete: ${completedSet?.name || 'set'}! +${d.reward} Essence`, 3400); sfx.fanfare(); }, 3200);
        lastLists = '';
        break;
      }
      case 'bounty': addCatchProgress(d.essence, 'Bounty completed'); setTimeout(() => { notify(`📜 Bounty done: ${d.text}! +${d.essence}${d.bait ? ` and ${BAITS[d.bait].icon}×${d.baitN}` : ''}`, 3400); sfx.fanfare(); }, 2600); lastLists = ''; break;
      case 'newDay':
        if (d.day > 1) notify(`☀️ Day ${d.day}: new bounties on the board${d.fullMoon ? ' · full moon tonight!' : ''}`, 3200);
        lastLists = '';
        break;
      case 'frenzy': if (game.state.stats.caught > 0) notify(`✦ Feeding frenzy at ${spotName(d.spot)}! Fast bites, bonus Essence.`, 3000); lastLists = ''; break;
      case 'note': sfx.note(); lastLists = ''; break;
      case 'reroll': sfx.coin(); lastLists = ''; bumpWallet(); break;
      case 'reset': newDex.clear(); lastLists = ''; shownEssence = null; walker.x = SPOT_X.dock; walker.target = null; break;
      default: break;
    }
  }
}
function bumpWallet() { const w = document.querySelector('.wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }

// ---------- walking ----------

/** First spot on the path you cannot reach yet (secret spots are off the path). */
const nextLocked = () => SPOTS.find((s) => !s.secret && !game.spotUnlocked(s.id));
function gateX() { const n = nextLocked(); return n ? SPOT_X[n.id] - SPOT_GAP * 0.5 : null; }

/** How far you can walk each way right now. */
function bounds() {
  const gate = gateX();
  const west = game.spotUnlocked('sandbar') ? SPOT_X.sandbar - 260 : CLUE_X.sandbar - 40;
  let east = game.spotUnlocked('wreck') ? SPOT_X.wreck + 260 : CLUE_X.wreck + 40;
  if (gate != null) east = Math.min(east, gate - 300);
  return { west, east, gated: gate != null && east === gate - 300 };
}

/** Next place of interest in a direction: open spots and any visible secret clue. */
function nextStop(dir) {
  const pts = SPOTS.filter((s) => game.spotUnlocked(s.id)).map((s) => SPOT_X[s.id]);
  for (const id of SECRETS) if (game.secretVisible(id)) pts.push(CLUE_X[id]);
  const b = bounds();
  pts.push(b.west, b.east);
  const ahead = pts.filter((x) => (dir > 0 ? x > walker.x + 60 : x < walker.x - 60)).sort((a, c) => (a - c) * dir);
  return ahead.length ? ahead[0] : null;
}

let edgeWarned = 0;
function warnEdge(side) {
  if (performance.now() - edgeWarned < 3200) return;
  edgeWarned = performance.now();
  if (side > 0 && bounds().gated) {
    const n = nextLocked();
    const left = n.unlockAt - game.dexCount;
    notify(`🔒 Path to ${n.name} is overgrown — catch ${left} more new Goop${left === 1 ? '' : 's'} to clear it.`, 2800);
  } else if (side < 0) {
    notify(game.spotUnlocked('sandbar') ? 'Only open water past the sandbar.' : 'The water’s too deep to wade any further west… for now.', 2800);
  } else {
    notify(game.spotUnlocked('wreck') ? 'Nothing but deep water past the wreck.' : 'Only dark, deep water past here… for now.', 2800);
  }
  sfx.bump();
}

function updateWalk(dt) {
  if (hollow.active) { updateHollow(dt); return; }
  const b = bounds();
  let dir = (keys.right || held.right ? 1 : 0) - (keys.left || held.left ? 1 : 0) + held.drag;
  dir = Math.max(-1, Math.min(1, dir));
  const free = !game.busy && !anyDialogOpen();
  if (!free) { dir = 0; if (game.busy) { walker.v = 0; walker.target = null; } }
  if (dir) {
    walker.target = null;
    walker.v += (dir * WALK_SPEED - walker.v) * Math.min(1, dt * 6);
  } else if (walker.target != null) {
    const want = Math.max(-WALK_SPEED, Math.min(WALK_SPEED, (walker.target - walker.x) * 3.2));
    walker.v += (want - walker.v) * Math.min(1, dt * 7);
    if (Math.abs(walker.target - walker.x) < 4 && Math.abs(walker.v) < 30) { walker.x = walker.target; walker.v = 0; walker.target = null; }
  } else {
    // coast to a stop wherever you let go; drift onto a spot if you stop right next to one
    walker.v *= Math.exp(-dt * 6);
    if (Math.abs(walker.v) < 140) {
      const spot = SPOTS.filter((s) => game.spotUnlocked(s.id)).find((s) => Math.abs(SPOT_X[s.id] - walker.x) < 230 && Math.abs(SPOT_X[s.id] - walker.x) > 2);
      if (spot) walker.target = SPOT_X[spot.id];
      else if (Math.abs(walker.v) < 8) walker.v = 0;
    }
  }
  walker.x += walker.v * dt;
  if (walker.x > b.east) { walker.x = b.east; if (walker.v > 120 || held.right || keys.right || held.drag > 0) warnEdge(1); walker.v = 0; if (walker.target > b.east) walker.target = null; }
  if (walker.x < b.west) { walker.x = b.west; if (walker.v < -120 || held.left || keys.left || held.drag < 0) warnEdge(-1); walker.v = 0; if (walker.target < b.west) walker.target = null; }
  // secrets reveal themselves when you walk up to a clue
  if (!game.busy) for (const id of SECRETS) if (game.secretVisible(id) && Math.abs(walker.x - CLUE_X[id]) < 220) game.revealSecret(id);
  game.setShore(toShore(walker.x));
  if (!game.here && game.phase === PHASES.CAUGHT) $('catchCard').hidden = true;
  if (Math.abs(walker.v) > 220) { walker.step -= dt; if (walker.step <= 0) { sfx.step(); walker.step = 0.34; } }
}

function walkTo(id) {
  if (game.busy || !game.spotUnlocked(id)) return;
  walker.target = SPOT_X[id];
  sfx.unlock();
}
function tapWalk(dir) {
  if (game.busy) return;
  const x = nextStop(dir);
  if (x == null) { warnEdge(dir); return; }
  walker.target = x;
}

// ---------- tackle box ----------

let tackleTab = 'rods';
let tryOn = null; // { kind, id } previewed but not equipped
let shelfFocus = null; // bait item selected directly from the physical shelf
const TABS = [['rods', 'RODS'], ['skins', 'SKINS'], ['bobbers', 'BOBBERS'], ['lines', 'LINES'], ['lures', 'LURES'], ['bait', 'BAIT'], ['extras', 'EXTRAS']];
const TABLE = { rods: RODS, skins: SKINS, bobbers: BOBBERS, lines: LINES };
const SLOT = { rods: 'rod', skins: 'skin', bobbers: 'bobber', lines: 'line', lures: 'lure' };

function rodBadges(r) {
  const st = r.stats, out = [];
  if (st.reel) out.push([st.reel > 1 ? 'up' : 'down', `Reel ×${st.reel}`]);
  if (st.zone) out.push([st.zone > 0 ? 'up' : 'down', `Zone ${st.zone > 0 ? '+' : '−'}${Math.round(Math.abs(st.zone) * 200)}%`]);
  if (st.bite) out.push(['up', `Bites ${Math.round((1 - st.bite) * 100)}% sooner`]);
  if (st.force) out.push(['up', `Pull −${Math.round((1 - st.force) * 100)}%`]);
  if (st.lunge) out.push(['up', `Lunges −${Math.round((1 - st.lunge) * 100)}%`]);
  if (st.taste) out.push(['up', `${TASTES[st.taste]} ×${st.tasteMul}`]);
  if (st.when) out.push(['up', 'Storm bonus']);
  if (st.shiny) out.push(['up', `Shiny ×${st.shiny}`]);
  if (st.epic) out.push(['up', `Epic ×${st.epic}`]);
  if (st.legend) out.push(['up', `Legendary ×${st.legend}`]);
  if (!out.length) out.push(['', 'Balanced']);
  return out.map(([c, txt]) => `<em class="stat ${c}">${txt}</em>`).join('');
}

function swatch(kind, id) {
  if (kind === 'skins') {
    const p = SKINS[id].pal;
    if (!p) return '<span class="swatch factory"></span>';
    if (SKINS[id].anim === 'rainbow') return '<span class="swatch rainbow"></span>';
    return `<span class="swatch" style="background:linear-gradient(90deg,${p.shaft[0]},${p.shaft[1]} 40%,${p.shaft[2]} 75%,${p.tip})"></span>`;
  }
  if (kind === 'lines') { const c = LINES[id].color; return `<span class="swatch line ${c === 'rainbow' ? 'rainbow' : ''}" style="${c === 'rainbow' ? '' : `background:${c};box-shadow:0 0 8px ${c}`}"></span>`; }
  return '';
}

function tackleCards() {
  const s = game.state;
  if (tackleTab === 'bait') return baitRows();
  if (tackleTab === 'extras') return extrasHTML();
  if (tackleTab === 'lures') {
    return Object.entries(LURES).map(([id, l]) => {
      const lv = id === 'none' ? 1 : s.owned.lures[id] || 0;
      const on = s.equip.lure === id;
      const cost = game.lureCost(id);
      const pips = id === 'none' ? '' : `<div class="pips">${l.cost.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div>`;
      const now = id !== 'none' && lv ? `<em class="stat up">${l.fx(l.lv[lv - 1])}</em>` : '';
      const next = id !== 'none' && lv < 3 ? `<em class="stat next">${lv ? 'Next: ' : ''}${l.fx(l.lv[lv])}</em>` : '';
      const buy = cost != null ? `<button class="buy" data-lure-buy="${id}" ${s.essence < cost ? 'disabled' : ''}>${lv ? 'UPGRADE' : 'BUY'} · ${cost}</button>` : '';
      const eq = lv ? (on ? '<button class="on" disabled>EQUIPPED</button>' : `<button class="use" data-lure-eq="${id}">EQUIP</button>`) : '';
      return `<div class="tk-card ${on ? 'equipped' : ''} ${tryOn?.kind === 'lures' && tryOn.id === id ? 'trying' : ''}" data-try="lures:${id}"><div class="tk-head"><b>${l.name}</b>${pips}</div><small>${l.desc}</small><div class="stats-row">${now}${next}</div><div class="tk-btns">${eq}${buy}</div></div>`;
    }).join('');
  }
  const table = TABLE[tackleTab];
  return Object.entries(table).map(([id, it]) => {
    const owned = s.owned[tackleTab].includes(id);
    const on = s.equip[SLOT[tackleTab]] === id;
    const locked = (it.dex || 0) > game.dexCount;
    const btn = on ? '<button class="on" disabled>EQUIPPED</button>'
      : owned ? `<button class="use" data-tk-eq="${tackleTab}:${id}">EQUIP</button>`
        : locked ? `<button disabled>🔒 GOOPDEX ${it.dex}</button>`
          : `<button class="buy" data-tk-buy="${tackleTab}:${id}" ${s.essence < it.cost ? 'disabled' : ''}>BUY · ${it.cost}</button>`;
    const badges = tackleTab === 'rods' ? `<div class="stats-row">${rodBadges(it)}</div>` : '';
    return `<div class="tk-card ${on ? 'equipped' : ''} ${locked ? 'locked' : ''} ${tryOn?.kind === tackleTab && tryOn.id === id ? 'trying' : ''}" data-try="${tackleTab}:${id}"><div class="tk-head">${swatch(tackleTab, id)}<b>${it.name}</b></div><small>${it.desc}</small>${badges}<div class="tk-btns">${btn}</div></div>`;
  }).join('');
}

function extrasHTML() {
  const s = game.state;
  const charms = Object.entries(CHARMS).map(([id, c]) => {
    const extra = id === 'totem'
      ? `<div class="wx-pick">${Object.entries(WEATHER).map(([w, wd]) => `<button data-charm="totem" data-arg="${w}" ${s.essence < c.cost || game.busy || s.weather === w ? 'disabled' : ''}>${ICON[w] || ICON.Day}${wd.label}</button>`).join('')}</div>`
      : `<button class="buy" data-charm="${id}" ${s.essence < c.cost || game.busy ? 'disabled' : ''}>USE · ${c.cost}</button>`;
    return `<div class="tk-card"><div class="tk-head"><span class="emoji">${c.icon}</span><b>${c.name}</b><i class="cost">${c.cost}</i></div><small>${c.desc}</small><div class="tk-btns">${extra}</div></div>`;
  }).join('');
  const finder = `<div class="tk-card ${s.finder ? 'equipped' : ''}"><div class="tk-head"><span class="emoji">📡</span><b>Fish Finder</b></div><small>Shows the Goops most likely to bite where you stand, with their odds. Updates as you walk.</small><div class="tk-btns">${s.finder ? '<button class="on" disabled>INSTALLED</button>' : `<button class="buy" data-finder ${s.essence < FINDER_COST ? 'disabled' : ''}>BUY · ${FINDER_COST}</button>`}</div></div>`;
  const bud = s.buddy ? GOOPS.find((g) => g.id === s.buddy) : null;
  const tc = game.trainCost();
  const buddy = `<div class="tk-card"><div class="tk-head">${bud ? `<img class="mini" src="${GOOP_ART(bud.id)}" alt="">` : '<span class="emoji">🐸</span>'}<b>Buddy Treats</b>${bud ? `<i class="cost">LV ${s.buddyLv + 1}</i>` : ''}</div><small>${bud ? `Feed ${esc(bud.name)} to make it grow: +4% Essence per level (now +${Math.round(buddyBonus(s.buddyLv) * 100)}%).` : 'Pick a buddy in the GoopDex first.'}</small><div class="pips">${BUDDY_TRAIN.map((_, i) => `<i class="${i < s.buddyLv ? 'on' : ''}"></i>`).join('')}</div><div class="tk-btns">${bud ? (tc == null ? '<button disabled>MAX</button>' : `<button class="buy" data-train ${s.essence < tc ? 'disabled' : ''}>FEED · ${tc}</button>`) : ''}</div></div>`;
  const ups = Object.entries(UPGRADES).map(([kind, u]) => {
    const cost = game.upgradeCost(kind), level = s.gear[kind];
    return `<div class="tk-card"><div class="tk-head"><span class="ico-s">${ICON[kind]}</span><b>${u.name}</b></div><small>${u.desc}</small><div class="pips">${u.cost.map((_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}</div><div class="tk-btns">${cost == null ? '<button disabled>MAX</button>' : `<button class="buy" data-buy="${kind}" ${s.essence < cost ? 'disabled' : ''}>UPGRADE · ${cost}</button>`}</div></div>`;
  }).join('');
  return `<h4 class="tk-sub">CHARMS</h4>${charms}<h4 class="tk-sub">GADGETS & BUDDY</h4>${finder}${buddy}<h4 class="tk-sub">TACKLE TUNING</h4>${ups}`;
}

function loadoutHTML() {
  const e = game.state.equip, s = game.state;
  const b = BAITS[s.bait];
  const lure = LURES[e.lure];
  return [
    ['🎣', RODS[e.rod].name], ['🎨', SKINS[e.skin].name], ['🔴', BOBBERS[e.bobber].name], ['🧵', LINES[e.line].name],
    ['🪝', `${lure.name}${e.lure !== 'none' ? ` Lv${s.owned.lures[e.lure]}` : ''}`], [b.icon, `${b.name} ×${s.bait === 'worm' ? '∞' : s.baits[s.bait] || 0}`],
  ].map(([i, t]) => `<span><i>${i}</i>${esc(t)}</span>`).join('');
}

function renderTackle() {
  setHTML('tackleTabs', TABS.map(([id, label]) => `<button data-tktab="${id}" class="${tackleTab === id ? 'on' : ''}">${label}</button>`).join(''));
  $('tackleList').innerHTML = tackleCards();
  setHTML('tkLoadout', loadoutHTML());
  setText('tkEssence', game.state.essence);
}

function previewLook() {
  const e = { ...game.state.equip };
  if (tryOn) e[SLOT[tryOn.kind]] = tryOn.id;
  return { style: RODS[e.rod]?.style || 'wood', skin: e.skin, bobber: e.bobber, line: e.line, lure: e.lure, lureLv: game.state.owned.lures[e.lure] || 0 };
}

function openTackle(tab) {
  if (tab) tackleTab = tab;
  tryOn = null;
  go('shack', { scroll: false });
  setTimeout(() => $('shopCard').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}

let previewLast = 0;
function previewLoop(ts) {
  if (view !== 'shack' || !scene) { previewLast = 0; return; }
  const dt = previewLast ? Math.min(0.05, (ts - previewLast) / 1000) : 0;
  previewLast = ts;
  const c = $('previewCanvas');
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
  if (w > 0 && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
  scene.drawPreview(c.getContext('2d'), previewLook(), dt);
  requestAnimationFrame(previewLoop);
}

$('shopCard').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tktab]')?.dataset.tktab;
  if (tab) { tackleTab = tab; tryOn = null; renderTackle(); shopTalk(tab); return; }
  const buy = e.target.closest('[data-tk-buy]')?.dataset.tkBuy;
  if (buy) {
    const [k, id] = buy.split(':');
    const item = TABLE[k]?.[id];
    const ok = game.buyTackle(k, id);
    if (ok) { tryOn = null; shopReact(`A fine choice. The ${item?.name || 'new piece of tackle'} is yours, and I've fitted it for you. Treat it well.`); }
    else shopReact(`Not just yet. That piece may be above your GoopDex level, or your Essence purse may be a little light.`);
    renderTackle(); return;
  }
  const eq = e.target.closest('[data-tk-eq]')?.dataset.tkEq;
  if (eq) {
    const [k, id] = eq.split(':'); const item = TABLE[k]?.[id];
    const ok = game.equipTackle(k, id); tryOn = null;
    shopReact(ok ? `There we are — ${item?.name || 'that tackle'} is on your rig. You’ll feel the difference out there.` : `Couldn't fit that one. Let's have another look.`);
    renderTackle(); return;
  }
  const lb = e.target.closest('[data-lure-buy]')?.dataset.lureBuy;
  if (lb) { const ok = game.buyLure(lb); tryOn = null; shopReact(ok ? `Good lure. ${LURES[lb].name} is ready to fish — see what it wakes up.` : `Save a little more Essence and we'll get that lure sorted.`); renderTackle(); return; }
  const le = e.target.closest('[data-lure-eq]')?.dataset.lureEq;
  if (le) { const ok = game.equipLure(le); tryOn = null; shopReact(ok ? `${LURES[le].name} is tied on. Give it a fair swim.` : `That lure isn't in your tackle box yet.`); renderTackle(); return; }
  const charm = e.target.closest('[data-charm]');
  if (charm) { const ok = game.useCharm(charm.dataset.charm, charm.dataset.arg); shopReact(ok ? 'There — you should notice the pond respond to that.' : 'Hold onto your Essence for now. That trick can wait.'); renderTackle(); return; }
  if (e.target.closest('[data-finder]')) { const ok = game.buyFinder(); shopReact(ok ? 'A Fish Finder! Smart investment. It reads the water before you waste a cast.' : 'The Fish Finder costs a fair bit. Come back when your purse is heavier.'); renderTackle(); return; }
  if (e.target.closest('[data-train]')) { const ok = game.trainBuddy(); shopReact(ok ? 'A treat for your little fishing partner. Keep looking after that buddy.' : 'Your buddy can wait for a treat until you have the Essence.'); renderTackle(); return; }
  const up = e.target.closest('[data-buy]')?.dataset.buy;
  if (up) { const ok = game.buyUpgrade(up); shopReact(ok ? `${UPGRADES[up].name} tuned up. Small improvements add up on a long day.` : 'That upgrade will have to wait until you have enough Essence.'); renderTackle(); return; }
  if (e.target.closest('[data-bait], [data-buybait]')) { setTimeout(renderTackle, 0); return; }
  const tr = e.target.closest('[data-try]')?.dataset.try;
  if (tr && !e.target.closest('button')) {
    const [k, id] = tr.split(':'); tryOn = { kind: k, id };
    $('tackleList').querySelectorAll('.tk-card').forEach((n) => n.classList.toggle('trying', n.dataset.try === tr));
    const item = (TABLE[k] || LURES)[id];
    if (item) shopReact(`Have a look at ${item.name}. ${item.desc || 'A useful bit of kit for the right conditions.'}`);
  }
});

// ---------- fish finder ----------

let finderSig = '';
function renderFinder() {
  const el = $('finder');
  const show = game.state.finder && !game.busy && game.phase !== PHASES.CAUGHT;
  el.hidden = !show;
  if (!show) return;
  const s = game.state;
  const zone = game.zone();
  // Forecast weights also depend on local feeding activity, tracked targets, visitors,
  // habitat research and bait inventory. Include them so the display never goes stale.
  const sig = JSON.stringify([
    Math.round(s.shore * 100), s.spot, s.bait, s.baits, s.timeIndex, s.weather,
    s.equip.lure, s.equip.rod, s.frenzy, s.visitor, s.seen.length, game.dexCount,
    s.discovered, s.seen, s.dex, s.activity, s.trackedGoop, s.research,
    zone.mix.map(([spot, share]) => [spot.id, Number(share.toFixed(4))]),
  ]);
  if (sig === finderSig) return;
  finderSig = sig;
  const ecology = game.ecosystemStatus();
  const bait = BAITS[s.bait] || BAITS.worm;
  const baitCount = s.bait === 'worm' ? '∞' : (s.baits[s.bait] || 0);
  const target = game.trackingStatus();
  const rows = game.forecast(4).map(({ id, chance }) => {
    const seen = s.seen.includes(id) || !!s.dex[id];
    const g = GOOPS.find((x) => x.id === id);
    return `<div class="f-row r-${g.rarity}"><img src="${GOOP_ART(id)}" alt="" class="${s.dex[id] ? '' : 'locked'}"><span>${seen ? esc(g.name) : '???'}</span><b>${chance < 0.01 ? '<1' : Math.round(chance * 100)}%</b></div>`;
  }).join('');
  const targetHTML = target
    ? `<div class="f-target"><b>TRACKING · ${esc(target.goop.name)}</b><small>${esc(target.status)}</small></div>`
    : '';
  el.innerHTML = `<div class="f-title">📡 FISH FINDER · ${esc(zone.spot.name)}</div>
    <div class="f-context"><span>◉ ${esc(ecology.label)}</span><span>${esc(bait.icon)} ${esc(bait.name)} · ${baitCount}</span></div>
    ${targetHTML}<div class="f-forecast-label">LIKELY TO BITE</div>${rows}`;
}

// ---------- places: the pond, the Bait Shack and the Aquarium ----------

let view = 'pond';
let tank = null;
const VIEWS = ['pond', 'shack', 'aquarium'];

function go(next, { scroll = true } = {}) {
  if (!VIEWS.includes(next)) next = 'pond';
  if (next !== 'pond' && game.busy) { notify('Reel in your line first!', 1800); return; }
  view = next;
  for (const v of VIEWS) $(`${v}View`).hidden = v !== next;
  document.querySelectorAll('#viewNav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === next));
  if (location.hash.slice(1) !== next) history.replaceState(null, '', next === 'pond' ? location.pathname + location.search : `#${next}`);
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  release(); keys.left = keys.right = false; held.left = held.right = false; held.drag = 0;
  if (next === 'shack') { renderShack(); renderTackle(); requestAnimationFrame(previewLoop); markBoardSeen(); }
  if (next === 'aquarium' && tank) { tank.sync(game.state, tankIdx); tank.start(); renderTank(); tankHint(); } else tank?.stop();
  if (next === 'pond') requestAnimationFrame(() => scene?.resize());
  sfx.unlock(); sfx.step();
}
document.getElementById('viewNav').addEventListener('click', (e) => { const v = e.target.closest('[data-view]')?.dataset.view; if (v) go(v); });
window.addEventListener('hashchange', () => { const v = location.hash.slice(1); if (VIEWS.includes(v) && v !== view) go(v); });

// ----- Old Wiggs -----

let wiggsMode = 'hello';
let typer = 0;
function say(text, buttons = []) {
  const el = $('wiggsText');
  clearInterval(typer);
  let i = 0;
  el.textContent = '';
  const reduce = matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduce) el.textContent = text;
  else typer = setInterval(() => { i += 2; el.textContent = text.slice(0, i); if (i >= text.length) clearInterval(typer); }, 16);
  $('wiggsBtns').innerHTML = buttons.map(([label, act, cls = '']) => `<button class="${cls}" data-wiggs="${act}">${label}</button>`).join('');
  const w = $('wiggs'); w.classList.remove('talk'); void w.offsetWidth; w.classList.add('talk');
}

function greet() {
  const q = game.quest, p = game.questProgress();
  const hello = { Dawn: 'Mornin’, early bird!', Day: 'Well hey there, kid!', Dusk: 'Evenin’! Good light for fishing.', Night: 'Up late, are we? The night Goops are out.' }[game.timeOfDay];
  const btns = [['💬 CHAT', 'chat'], ['📜 BOUNTIES', 'bounties'], ['🎣 SHOP', 'shop']];
  if (!q) return say(`${hello} You woke the Sleeper — this pond’s yours now. Stop by any time.`, btns);
  if (p.ready) return say(`${hello} ${q.done}`, [['🎁 CLAIM REWARD', 'claim', 'hot'], ...btns]);
  say(game.state.quest.i === 0 ? q.story : `${hello} ${q.story}`, [['📜 QUEST', 'quest'], ...btns]);
}


function shopTalk(tab = tackleTab) {
  const s = game.state;
  const bait = BAITS[s.bait];
  const lines = {
    rods: `That rack's my pride and joy. You're carrying the ${RODS[s.equip.rod].name} right now. A rod changes how a fight feels, so try one on before spending your Essence.`,
    skins: `A little color never hurt a fishing trip. Your ${SKINS[s.equip.skin].name} finish is equipped now — pick a look that feels like yours.`,
    bobbers: `Keep your eye on the bobber. The right float makes the bite easier to read, especially when the water gets lively.`,
    lines: `Never underestimate your line. It's the quiet bit of kit between a good story and the one that got away.`,
    lures: `Lures give a Goop something different to chase. You're running ${LURES[s.equip.lure].name}; match the lure to the kind of water you're working.`,
    bait: `Bait is a conversation with the pond. You're rigged with ${bait.name} right now, ${s.bait === 'worm' ? 'and the worm tin never runs dry' : `with ${s.baits[s.bait] || 0} left in your tin`}.`,
    extras: `These are the field tools. The Fish Finder reads the water, and the little charms can change the conditions when you need a different kind of day.`,
  };
  const weather = WEATHER[s.weather]?.label || s.weather;
  say(`It's ${game.timeOfDay.toLowerCase()} outside — ${weather.toLowerCase()} over North Pond. ${lines[tab] || lines.rods}`, [['📜 STORY', 'quest'], ['📋 BOUNTIES', 'bounties'], ['🧰 KEEP BROWSING', 'shop']]);
}

function shopReact(line) {
  say(line, [['🧰 KEEP BROWSING', 'shop'], ['📜 WIGGS’ STORY', 'quest']]);
}

function renderShack() {
  if (wiggsMode === 'hello') greet();
  renderQuest();
  drawRack();
}

function rewardText(r) {
  const parts = [`+${r.essence} Essence`];
  if (r.baits) parts.push(`${BAITS[r.baits[0]].icon} ${BAITS[r.baits[0]].name} ×${r.baits[1]}`);
  if (r.item) { const [kind, id] = r.item; parts.push(({ rods: RODS, skins: SKINS, bobbers: BOBBERS, decor: DECOR }[kind])[id].name); }
  return parts.join(' · ');
}

function goalText(goal) {
  switch (goal.type) {
    case 'catch': return `Catch ${goal.n} Goops`;
    case 'bait': return 'Catch a Goop using special bait';
    case 'discover': return `Reach ${spotName(goal.spot)}`;
    case 'notes': return `Collect ${goal.n} field notes`;
    case 'dodge': return `Dodge ${goal.n} lunges`;
    case 'secret': return `Find a secret place (${goal.spot === 'sandbar' ? 'west, after dark' : goal.spot === 'cave' ? 'past the falls, by day' : 'past the Deep Drop, in bad weather'})`;
    case 'dex': return `Fill your GoopDex to ${goal.n}`;
    case 'frenzy': return `Catch ${goal.n} Goops in a feeding frenzy`;
    case 'set': return 'Complete any collection';
    case 'legendary': return `Catch ${goal.n} Legendary Goops`;
    case 'goop': return 'Catch The Sleeper at the Deep Drop, at night';
    default: return '';
  }
}

function renderQuest() {
  const s = game.state, q = game.quest, p = game.questProgress();
  setText('questCount', q ? `${s.quest.i + 1} / ${QUESTS.length}` : 'COMPLETE');
  $('questBody').innerHTML = q
    ? `<div class="q-chapter">CHAPTER ${s.quest.i + 1}</div><h3 class="q-title">${esc(q.title)}</h3><p class="q-story">“${esc(q.story)}”</p>`
      + `<div class="q-goal ${p.ready ? 'ready' : ''}"><b>${p.ready ? '✓ ' : ''}${esc(goalText(q.goal))}</b><span>${p.have} / ${p.need}</span><div class="spot-bar wide"><i style="width:${(p.have / p.need) * 100}%"></i></div></div>`
      + `<div class="q-reward">Reward: ${esc(rewardText(q.reward))}</div>`
      + `<button class="slime-btn small wide ${p.ready ? 'pulse' : ''}" id="claimBtn" ${p.ready ? '' : 'disabled'}>${p.ready ? '🎁 CLAIM REWARD' : 'IN PROGRESS'}</button>`
    : '<div class="q-chapter">THE END</div><h3 class="q-title">Legend of North Pond</h3><p class="q-story">“You did what I never could. The Sleeper still stirs on full-moon nights, if you want a rematch.”</p>';
  const left = QUESTS.length - s.quest.i - 1;
  $('questLog').innerHTML = QUESTS.slice(0, s.quest.i + 1).map((x, i) => `<li class="${i < s.quest.i ? 'done' : 'now'}">${esc(x.title)}</li>`).join('')
    + (left > 0 ? `<li class="locked">…${left} more chapter${left === 1 ? '' : 's'} to go</li>` : '');
  $('claimBtn')?.addEventListener('click', claim);
}

function claim() {
  const q = game.quest;
  if (!q || !game.claimQuest()) return;
  sfx.fanfare(); bumpWallet();
  wiggsMode = 'claimed';
  const next = game.quest;
  say(next ? `There you go: ${rewardText(q.reward)}. Now then… ${next.story}` : `There you go: ${rewardText(q.reward)}. That’s the whole story, kid. Thank you.`, [['💬 CHAT', 'chat'], ['📜 BOUNTIES', 'bounties'], ['🎣 SHOP', 'shop']]);
  renderQuest(); renderTackle(); lastLists = '';
}

$('wiggsBtns').addEventListener('click', (e) => {
  const act = e.target.closest('[data-wiggs]')?.dataset.wiggs;
  if (!act) return;
  sfx.note();
  if (act === 'claim') claim();
  else if (act === 'quest') { wiggsMode = 'quest'; $('questCard').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  else if (act === 'bounties') openBounties();
  else if (act === 'shop') $('shopCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  else if (act === 'chat') {
    wiggsMode = 'chat';
    const r = game.rumor();
    const lines = [...WIGGS, ...(r ? [r.text] : [])];
    say(lines[Math.floor(Math.random() * lines.length)].replace(/^“|”$/g, ''), [['💬 MORE', 'chat'], ['📜 BOUNTIES', 'bounties'], ['🎣 SHOP', 'shop']]);
  }
});
$('wiggs').querySelector('svg').addEventListener('click', () => { wiggsMode = 'hello'; greet(); });

/** The rod rack on the shack wall shows every rod style. */
function drawRack() {
  const c = $('rackCanvas');
  if (!scene || !c) return;
  const r = c.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (r.width) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
  const k = c.height / 700;
  const ids = Object.keys(RODS);
  const step = c.width / k / (ids.length + 1);
  ids.forEach((id, i) => {
    const owned = game.state.owned.rods.includes(id);
    g.setTransform(k, 0, 0, k, 0, 0);
    g.globalAlpha = owned ? 1 : 0.4;
    const x = step * (i + 1);
    scene.drawRodIcon(g, x, 660, 600, { style: RODS[id].style, skin: game.state.equip.rod === id ? game.state.equip.skin : 'factory' });
    g.globalAlpha = 1;
  });
  // rack bar
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#4a2a12'; g.fillRect(0, c.height * 0.2, c.width, c.height * 0.035);
  g.fillStyle = '#4a2a12'; g.fillRect(0, c.height * 0.86, c.width, c.height * 0.045);
}

// ----- quest chip on the pond -----

function renderHuntChip() {
  const chip = $('huntChip');
  const hunt = game.trackingStatus();
  chip.hidden = !hunt;
  if (!hunt) return;
  const { goop, active, status } = hunt;
  setHTML('huntChip', `<img src="${GOOP_ART(goop.id)}" alt=""><span class="hunt-copy"><b>TRACKING · ${esc(goop.name).toUpperCase()}</b><small>${esc(status)}</small></span><i>${active ? 'ON TRAIL' : 'FIELD LOG'}</i>`);
  chip.classList.toggle('active', active);
  chip.classList.toggle('waiting', !active);
}

function renderQuestChip() {
  const chip = $('questChip');
  const q = game.quest;
  chip.hidden = !q || game.busy;
  $('shackDot').hidden = !(q && game.questProgress().ready);
  $('tankDot').hidden = !game.tipJar();
  if (!q || game.busy) return;
  const p = game.questProgress();
  const full = p.ready
    ? '📜 <b>Quest done!</b> Visit Wiggs'
    : `📜 ${esc(goalText(q.goal))} <b>${p.have}/${p.need}</b>`;
  const compact = p.ready ? '📜 QUEST READY' : `📜 QUEST · ${p.have}/${p.need}`;
  setHTML('questChip', `<span class="quest-full">${full}</span><span class="quest-compact">${compact}</span>`);
  chip.classList.toggle('ready', p.ready);
}
$('questChip').addEventListener('click', () => go('shack'));

// ----- aquarium -----

let tankIdx = 0;
const curTank = () => game.state.tank.tanks[tankIdx] || game.state.tank.tanks[0];

function renderTank() {
  const s = game.state;
  if (!s.tank.tanks[tankIdx]) tankIdx = 0;
  const T = curTank();
  tank?.sync(s, tankIdx);
  // tabs
  const cost = game.tankCost();
  setHTML('tankTabs', s.tank.tanks.map((t, i) => `<button data-tank="${i}" class="${i === tankIdx ? 'on' : ''}"><b>${esc(t.name)}</b><i>${t.fish.length}/${TANK_CAP}</i></button>`).join('')
    + (cost != null ? `<button class="new" data-newtank ${s.essence < cost ? 'disabled' : ''}>＋ NEW TANK <i>${cost}</i></button>` : ''));
  const shinies = T.fish.filter((id) => s.dex[id]?.shiny).length;
  setHTML('tankCount', `<b>${esc(T.name)}</b> <span>${T.fish.length}/${TANK_CAP}</span>${shinies ? ` <span class="sh">✦ ${shinies}</span>` : ''} <button class="rename" data-rename title="Rename tank" aria-label="Rename tank">✎</button>`);
  const caught = Object.keys(s.dex).length;
  $('tankEmpty').hidden = T.fish.length > 0;
  $('tankEmpty').innerHTML = caught ? 'This tank is empty.<br>Pick some residents below!' : 'Your tank is empty.<br>Catch some Goops at the pond and they’ll swim here!';
  const tip = game.tipJar();
  $('tipsBtn').disabled = !tip;
  $('tipsBtn').textContent = tip ? `💰 TIPS +${tip}` : '💰 TIPS ✓';
  $('tipsBtn').title = tip ? 'Visitors left tips to see your Goops' : 'Come back tomorrow for more tips';
  $('feedBtn').classList.toggle('on', !!tank?.feedMode);
  // residents
  const ids = GOOPS.filter((g) => s.dex[g.id]).map((g) => g.id);
  const where = (id) => game.tankOf(id);
  const order = (id) => (where(id) === tankIdx ? 0 : where(id) === -1 ? 1 : 2);
  setText('residentCount', `${T.fish.length} / ${TANK_CAP} · ${ids.filter((id) => where(id) === -1).length} in storage`);
  $('residentList').innerHTML = ids.length ? ids.sort((a, b) => order(a) - order(b)).map((id) => {
    const g = GOOPS.find((x) => x.id === id), w = where(id);
    const tag = w === tankIdx ? 'HERE' : w === -1 ? 'STORAGE' : esc(s.tank.tanks[w].name.toUpperCase());
    return `<button class="res r-${g.rarity} ${w === tankIdx ? 'here' : w === -1 ? 'stored' : 'away'}" data-res="${id}" title="${w === tankIdx ? 'Move to storage' : 'Move into this tank'}">`
      + `<img src="${GOOP_ART(id)}" alt="" class="${s.dex[id].shiny ? 'is-shiny' : ''}" loading="lazy"><b>${esc(g.name)}</b><i>${tag}</i></button>`;
  }).join('') : '<p class="muted resident-empty">Catch Goops at the pond to fill your tanks.</p>';
  // decorations for this tank
  const legends = GOOPS.filter((g) => g.rarity === 'Legendary' && s.dex[g.id]).length;
  setText('decorCount', `${T.decor.length} / ${DECOR_SLOTS} SLOTS`);
  $('decorList').innerHTML = Object.entries(DECOR).map(([id, d]) => {
    const owned = s.tank.decor.includes(id);
    const inT = s.tank.tanks.findIndex((t) => t.decor.includes(id));
    const locked = d.legends && legends < d.legends;
    const full = T.decor.length >= DECOR_SLOTS;
    const btn = inT === tankIdx ? `<button class="on" data-place="${id}">✓ IN THIS TANK · REMOVE</button>`
      : owned ? `<button class="use" data-place="${id}" ${full ? 'disabled' : ''}>${full ? 'NO FREE SLOT' : inT >= 0 ? `MOVE HERE FROM ${esc(s.tank.tanks[inT].name.toUpperCase())}` : 'PLACE HERE'}</button>`
        : d.quest ? '<button disabled>📜 QUEST REWARD</button>'
          : locked ? `<button disabled>🔒 ${d.legends} LEGENDARIES</button>`
            : `<button class="buy" data-decor="${id}" ${s.essence < d.cost || full ? 'disabled' : ''}>${full ? 'NO FREE SLOT' : `BUY · ${d.cost}`}</button>`;
    return `<div class="tk-card ${inT === tankIdx ? 'equipped' : ''}"><div class="tk-head"><b>${d.name}</b>${owned ? '<i class="cost">OWNED</i>' : ''}</div><small>${d.desc}</small><div class="tk-btns">${btn}</div></div>`;
  }).join('');
  setText('themeCount', `${s.tank.themes.length} / ${Object.keys(THEMES).length}`);
  $('themeList').innerHTML = Object.entries(THEMES).map(([id, t]) => {
    const owned = s.tank.themes.includes(id), on = T.theme === id;
    const btn = on ? '<button class="on" disabled>SHOWING</button>' : owned ? `<button class="use" data-theme="${id}">SHOW</button>` : `<button class="buy" data-theme="${id}" ${s.essence < t.cost ? 'disabled' : ''}>BUY · ${t.cost}</button>`;
    return `<div class="tk-card theme ${on ? 'equipped' : ''}"><div class="theme-sw" style="background:linear-gradient(180deg,${t.top},${t.mid} 55%,${t.bot}),${t.bot}"><i style="background:linear-gradient(180deg,${t.sand[0]},${t.sand[1]})"></i><em style="background:${t.plant[1]}"></em></div><div class="tk-head"><b>${t.name}</b></div><div class="tk-btns">${btn}</div></div>`;
  }).join('');
}

function showTankCard(id) {
  const g = GOOPS.find((x) => x.id === id), e = game.state.dex[id];
  if (!g || !e) return;
  const card = $('tankCard');
  card.style.setProperty('--rc', e.shiny ? '#fff27a' : `var(--r-${g.rarity.toLowerCase()})`);
  const buddy = game.state.buddy === id;
  card.innerHTML = `<button class="close" data-tankclose aria-label="Close">✕</button><img src="${GOOP_ART(id)}" alt="" class="${e.shiny ? 'is-shiny' : ''}"><div><div class="tc-rarity">${e.shiny ? 'SHINY · ' : ''}${g.rarity.toUpperCase()}</div><h3>${esc(g.name)}</h3>`
    + `<div class="tc-stats"><span>×${e.count} caught</span><span>Best ${e.best ?? '—'} cm</span>${e.shiny ? `<span>✦ ${e.shiny}</span>` : ''}</div>`
    + `<div class="tc-btns"><button data-tankbuddy="${id}" class="${buddy ? 'on' : ''}">${buddy ? '♥ BUDDY' : 'MAKE BUDDY'}</button><button data-tankdex="${id}">GOOPDEX</button><button data-res="${id}" class="ghosty">STORAGE</button></div></div>`;
  card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

let tankTaps = 0;
try { tankTaps = Number(localStorage.getItem('goop-tank-taps')) || 0; } catch { /* ignore */ }
function tankHint() {
  const h = $('tankHint');
  h.textContent = tank?.feedMode ? 'Tap the water to drop food' : 'Tap a Goop to say hi · FEED, then tap the water';
  h.classList.toggle('gone', !tank?.feedMode && tankTaps >= 3);
}

$('tankCanvas').addEventListener('pointerdown', (e) => {
  if (!tank) return;
  sfx.unlock();
  const r = $('tankCanvas').getBoundingClientRect();
  const dpr = $('tankCanvas').width / r.width;
  const id = tank.tap((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  tankTaps += 1; try { localStorage.setItem('goop-tank-taps', String(tankTaps)); } catch { /* ignore */ }
  tankHint();
  if (tank.feedMode) { sfx.drip(); return; }
  if (id) { sfx.note(); showTankCard(id); } else $('tankCard').hidden = true;
});
$('feedBtn').addEventListener('click', () => { if (!tank) return; tank.feedMode = !tank.feedMode; $('feedBtn').classList.toggle('on', tank.feedMode); tankHint(); sfx.note(); });
$('tipsBtn').addEventListener('click', () => { const tip = game.collectTips(); if (tip) { sfx.coin(); bumpWallet(); notify(`💰 Visitors loved your tanks: +${tip} Essence`); renderTank(); } });
$('aquariumView').addEventListener('click', (e) => {
  const tb = e.target.closest('[data-tank]')?.dataset.tank;
  if (tb != null) { tankIdx = Number(tb); $('tankCard').hidden = true; sfx.step(); renderTank(); return; }
  if (e.target.closest('[data-newtank]')) { if (game.buyTank()) { tankIdx = game.state.tank.tanks.length - 1; sfx.fanfare(); bumpWallet(); renderTank(); } return; }
  if (e.target.closest('[data-rename]')) {
    const name = prompt('Name this tank:', curTank().name);
    if (name != null && game.renameTank(tankIdx, name)) renderTank();
    return;
  }
  const res = e.target.closest('[data-res]')?.dataset.res;
  if (res) {
    const here = game.tankOf(res) === tankIdx;
    if (here) { game.setResident(res, -1); $('tankCard').hidden = true; sfx.step(); }
    else if (game.setResident(res, tankIdx)) sfx.splash();
    else { notify(`${esc(curTank().name)} is full (${TANK_CAP} Goops). Move someone to storage or buy another tank.`, 2600); sfx.bump(); }
    renderTank(); return;
  }
  const dec = e.target.closest('[data-decor]')?.dataset.decor;
  if (dec) { if (game.buyDecor(dec, tankIdx)) { sfx.coin(); bumpWallet(); } renderTank(); return; }
  const pl = e.target.closest('[data-place]')?.dataset.place;
  if (pl) { if (game.placeDecor(pl, tankIdx)) sfx.note(); renderTank(); return; }
  const th = e.target.closest('[data-theme]')?.dataset.theme;
  if (th && game.setTheme(th, tankIdx)) { sfx.note(); renderTank(); return; }
  if (e.target.closest('[data-tankclose]')) { $('tankCard').hidden = true; return; }
  const bud = e.target.closest('[data-tankbuddy]')?.dataset.tankbuddy;
  if (bud) { game.setBuddy(game.state.buddy === bud ? null : bud); showTankCard(bud); lastLists = ''; return; }
  const dx = e.target.closest('[data-tankdex]')?.dataset.tankdex;
  if (dx) openDexDetail(dx);
});

$('eventTag').addEventListener('click', (event) => {
  const button = event.target.closest('[data-observe-interaction]');
  if (!button || button.disabled) return;
  const result = game.recordHabitatObservation(button.dataset.spot, button.dataset.interactionId);
  if (!result) {
    notify('The water has changed. Wait for the habitat clue to appear again.', 2400);
    return;
  }
  if (result.discovered) { renderNotes(); renderSpots(); }
  handleEvents();
});

// ---------- loop ----------

let last = null;
let clickTimer = 0;
let ambientTimer = 2;
let sessionRefresh = 0;
function loop(ts) {
  const dt = last == null ? 0 : Math.min(0.08, (ts - last) / 1000);
  last = ts;
  updateWalk(dt);
  game.update(dt, { reel: reelHeld || tapLatch, steer: steerLatch });
  sessionTelemetry.observe(game);
  sessionRefresh -= dt;
  if (sessionRefresh <= 0) { renderSessionTelemetry(); sessionRefresh = 0.5; }
  tapLatch = false; steerLatch = 0;
  handleEvents();
  if (scene) {
    scene.reeling = reelHeld && game.phase === PHASES.FIGHT;
    if (view === 'pond') {
      if (!hollow.active) scene.render(game, dt, { ...pointer, camX: walker.x, walkSpeed: walker.v / WALK_SPEED, gate: gateX() });
      scene.trackPerf(dt);
    }
  }
  if (game.phase === PHASES.FIGHT && reelHeld) {
    clickTimer -= dt;
    if (clickTimer <= 0) { sfx.click(game.fight?.tension ?? 0.5); clickTimer = 0.07; if ((game.fight?.tension ?? 0) > 0.9) sfx.strain(); }
  }
  if (game.fight?.warn && !game.fight._warned) { game.fight._warned = true; sfx.warn(); }
  if (game.fight && !game.fight.warn) game.fight._warned = false;
  // ambience: crickets/rain, the waterfall's roar, birds by day and drips in the caves
  const night = game.timeOfDay === 'Night' || game.timeOfDay === 'Dusk';
  sfx.setAmbience({ night, rain: ['rain', 'storm'].includes(game.state.weather) ? game.state.weather : null });
  const near = (id, r = SPOT_GAP) => Math.max(0, 1 - Math.abs(walker.x - SPOT_X[id]) / r);
  sfx.setPlace({ falls: Math.max(near('falls'), near('cave') * 0.7) });
  ambientTimer -= dt;
  if (ambientTimer <= 0) {
    ambientTimer = 1.5 + Math.random() * 3;
    const caves = Math.max(near('cave'), near('grotto'));
    if (caves > 0.3 && Math.random() < caves) sfx.drip();
    else if (!night && game.state.weather === 'clear' && Math.random() < 0.6) sfx.bird();
    else if (game.spotUnlocked('sandbar') && near('sandbar') > 0.4) sfx.wave();
  }
  render(dt);
  requestAnimationFrame(loop);
}

// ---------- input ----------

function press() { sfx.unlock(); reelHeld = true; tapLatch = true; }
function release() { reelHeld = false; }
function cast() {
  sfx.unlock();
  if (Math.abs(walker.v) > 30) return;
  if (game.cast()) { reelHeld = false; lastLists = ''; $('catchCard').hidden = true; }
}

$('exportSessionBtn').addEventListener('click', () => {
  try {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadJSONFile(sessionTelemetry.exportJSON(), 'goop-fishing-session-' + stamp + '.json');
    $('sessionNotice').textContent = 'Session JSON exported. It contains anonymous playtest measurements only.';
  } catch (error) {
    $('sessionNotice').textContent = 'Export failed: ' + error.message;
  }
});
$('resetSessionBtn').addEventListener('click', () => {
  sessionTelemetry.reset(game.phase);
  renderSessionTelemetry();
  $('sessionNotice').textContent = 'Session measurements cleared. Your game save was not changed.';
});

const reelBtn = $('reelBtn');
reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
for (const [id, side, dir] of [['leftBtn', 'left', -1], ['rightBtn', 'right', 1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); if (game.phase === PHASES.FIGHT || (game.phase === PHASES.CAST && game.sight)) { steerLatch = dir; return; } held[side] = true; pressAt[side] = performance.now(); });
  const up = () => {
    if (!held[side]) return;
    held[side] = false;
    if (performance.now() - pressAt[side] < TAP_MS) tapWalk(dir); // a quick tap walks to the next stop
  };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', () => { held[side] = false; });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
window.addEventListener('pointerup', () => { release(); held.left = false; held.right = false; held.drag = 0; drag = null; fightSwipe = null; });
window.addEventListener('pointercancel', () => { release(); held.left = false; held.right = false; held.drag = 0; });
window.addEventListener('blur', () => { release(); keys.left = keys.right = false; held.left = held.right = false; held.drag = 0; });
reelBtn.addEventListener('contextmenu', (e) => e.preventDefault());
reelBtn.addEventListener('click', (e) => e.preventDefault());
$('castBtn').addEventListener('click', () => { cast(); $('castBtn').blur(); });

// Scene: tap to cast / reel / pick up a note / read the board; drag sideways to walk.
function canvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const k = canvas.width / Math.max(r.width, r.height * 16 / 9);
  const offX = (r.width - Math.max(r.width, r.height * 16 / 9)) / 2;
  const offY = (r.height - Math.max(r.height, r.width * 9 / 16)) / 2;
  return [(e.clientX - r.left - offX) * k, (e.clientY - r.top - offY) * k];
}
sceneEl.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.minimap, .side-btns')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (game.busy) { e.preventDefault(); press(); if (game.phase === PHASES.FIGHT) fightSwipe = { x: e.clientX, done: false }; return; }
  drag = { x: e.clientX, y: e.clientY, moved: false, at: performance.now() };
});
sceneEl.addEventListener('pointermove', (e) => {
  const r = sceneEl.getBoundingClientRect();
  if (e.pointerType === 'mouse') {
    pointer.px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    pointer.py = ((e.clientY - r.top) / r.height - 0.5) * 2;
  }
  if (fightSwipe && !fightSwipe.done && game.phase === PHASES.FIGHT) {
    const dx = e.clientX - fightSwipe.x;
    if (Math.abs(dx) > 36) { fightSwipe.done = true; steerLatch = dx > 0 ? 1 : -1; }
  }
  if (drag && !game.busy) {
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 18) { drag.moved = true; held.drag = dx > 0 ? -1 : 1; } // drag the world: pull left to walk right
  }
});
sceneEl.addEventListener('pointerup', (e) => {
  if (!drag) return;
  const d = drag; drag = null;
  const dir = held.drag; held.drag = 0;
  if (game.busy) return;
  if (d.moved) {
    if (performance.now() - d.at < 280 && dir) tapWalk(dir); // a flick carries you to the next stop
    return;
  }
  if (scene) {
    const [cx, cy] = canvasPoint(e);
    const id = scene.hitNote(cx, cy, game);
    if (id) {
      const note = NOTES.find((n) => n.id === id);
      if (note.spot !== game.state.spot || !game.here) { walkTo(note.spot); notify('Walk over to pick it up.', 1800); return; }
      if (game.collectNote(id)) return;
    }
    const clue = scene.hitClue(cx, cy);
    if (clue) { walker.target = CLUE_X[clue]; return; }
    if (scene.hitBoard(cx, cy)) { openBounties(); return; }
  }
  cast();
});
sceneEl.addEventListener('pointerleave', () => { pointer.px = 0; pointer.py = 0; });
sceneEl.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (hollow.active) { if ((e.code==='Enter'||e.code==='Space') && e.target.closest('#hollowOverlay button')) return; if (['ArrowUp','KeyW'].includes(e.code)) hollow.input.y=-1; else if (['ArrowDown','KeyS'].includes(e.code)) hollow.input.y=1; else if (['ArrowLeft','KeyA'].includes(e.code)) hollow.input.x=-1; else if (['ArrowRight','KeyD'].includes(e.code)) hollow.input.x=1; else if (e.code==='KeyE'||e.code==='Enter') interactHollow(); else if (e.code==='Escape') exitHollow(); else return; e.preventDefault(); return; }
  if (anyDialogOpen() || view !== 'pond') return;
  if ((game.phase === PHASES.FIGHT || (game.phase === PHASES.CAST && game.sight)) && !e.repeat && ['ArrowLeft', 'KeyA', 'ArrowRight', 'KeyD'].includes(e.code)) { steerLatch = e.code === 'ArrowLeft' || e.code === 'KeyA' ? -1 : 1; e.preventDefault(); return; }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { if (!keys.left) pressAt.keyLeft = performance.now(); keys.left = true; e.preventDefault(); sfx.unlock(); return; }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { if (!keys.right) pressAt.keyRight = performance.now(); keys.right = true; e.preventDefault(); sfx.unlock(); return; }
  if (e.repeat) return;
  if (e.code === 'Space') { e.preventDefault(); press(); }
  else if (e.code === 'KeyC' || e.code === 'Enter') { if (document.activeElement?.tagName !== 'BUTTON' || e.code === 'KeyC') { e.preventDefault(); cast(); } }
  else if (e.code === 'KeyM') { e.preventDefault(); openMap(); }
  else if (e.code === 'KeyB') { e.preventDefault(); openTackle(); }
  else if (e.code === 'KeyN') toggleMute();
});
window.addEventListener('keyup', (e) => {
  if (hollow.active) { if (['ArrowUp','KeyW','ArrowDown','KeyS'].includes(e.code)) hollow.input.y=0; if (['ArrowLeft','KeyA','ArrowRight','KeyD'].includes(e.code)) hollow.input.x=0; return; }
  if (e.code === 'Space') { e.preventDefault(); reelHeld = false; }
  if (e.code === 'ArrowLeft' || e.code === 'KeyA') { keys.left = false; if (performance.now() - pressAt.keyLeft < TAP_MS - 60) tapWalk(-1); }
  if (e.code === 'ArrowRight' || e.code === 'KeyD') { keys.right = false; if (performance.now() - pressAt.keyRight < TAP_MS - 60) tapWalk(1); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) { release(); keys.left = keys.right = false; } last = null; });

function openMap() {
  renderMap();
  openDialog('mapDlg');
  const wrap = document.querySelector('.map-wrap');
  const me = $('mapSvg').querySelector('.me');
  if (wrap && me && wrap.scrollWidth > wrap.clientWidth) {
    const x = me.transform.baseVal.consolidate()?.matrix.e ?? 500;
    wrap.scrollLeft = (x / 1000) * wrap.scrollWidth - wrap.clientWidth / 2;
  }
}
function openBounties() {
  setHTML('bountyDlgList', bountyHTML());
  const r = game.rumor();
  $('wiggsLine').textContent = r && Math.random() < 0.5 ? r.text : WIGGS[Math.floor(Math.random() * WIGGS.length)];
  openDialog('bountyDlg');
  markBoardSeen();
}

$('mapSvg').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const pin = e.target.closest('.pin[data-walk]');
  if (!pin) return;
  e.preventDefault();
  walkTo(pin.dataset.walk);
  closeDialog('mapDlg');
});

document.addEventListener('click', (e) => {
  const shelfItem = e.target.closest('[data-shop-shelf-item]')?.dataset.shopShelfItem;
  if (shelfItem) {
    const [kind, id] = shelfItem.split(':');
    if (kind === 'bait' && BAITS[id]) {
      tackleTab = 'bait'; tryOn = null; shelfFocus = { kind, id }; renderTackle();
      const count = id === 'worm' ? 'unlimited' : `${game.state.baits[id] || 0} in your tin`;
      shopReact(`Have a look at ${BAITS[id].name}. ${BAITS[id].desc} You have ${count}.`);
      $('tackleList').querySelector(`[data-shelf-bait="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (kind === 'lures' && LURES[id]) {
      tackleTab = 'lures'; shelfFocus = null; tryOn = { kind, id }; renderTackle();
      shopReact(`Take a look at ${LURES[id].name}. ${LURES[id].desc}`);
      $('tackleList').querySelector(`[data-try="lures:${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (kind === 'rods') {
      tackleTab = 'rods'; shelfFocus = null; tryOn = null; renderTackle(); shopTalk('rods');
      $('tackleList').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }
  const station = e.target.closest('[data-shop-station]')?.dataset.shopStation;
  if (station) {
    if (station === 'counter') {
      wiggsMode = 'quest';
      say(`Pull up a stool, kid. The story board's right here, and I've got a few jobs for someone who knows their way around North Pond.`, [['📜 VIEW STORY', 'quest'], ['📋 BOUNTIES', 'bounties'], ['🎣 BACK TO SHOP', 'shop']]);
      $('questCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      tackleTab = station === 'bait' ? 'bait' : 'rods';
      tryOn = null;
      renderTackle();
      shopTalk(tackleTab);
      $('shopCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return;
  }
  const walk = e.target.closest('[data-walk]')?.dataset.walk;
  if (walk) {
    walkTo(walk);
    if (e.target.closest('#mapDlg')) closeDialog('mapDlg');
    if (e.target.closest('#spotList')) sceneEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  const tab = e.target.closest('[data-tab]')?.dataset.tab;
  if (tab) { dexFilter = tab; lastLists = ''; return; }
  const goop = e.target.closest('[data-goop]')?.dataset.goop;
  if (goop) { openDexDetail(goop); return; }
  const bait = e.target.closest('[data-bait]')?.dataset.bait;
  if (bait) {
    shelfFocus = null;
    const ok = game.selectBait(bait);
    if (ok && view === 'shack') shopReact(`All set — ${BAITS[bait].name} is on the hook. Now let's see what it brings in.`);
    lastLists = ''; renderShop(); return;
  }
  const buyBait = e.target.closest('[data-buybait]')?.dataset.buybait;
  if (buyBait) {
    shelfFocus = null;
    const ok = game.buyBait(buyBait);
    if (ok) {
      game.selectBait(buyBait);
      if (view === 'shack') shopReact(`Fresh stock! ${BAITS[buyBait].pack} packs of ${BAITS[buyBait].name}, and I've put it on your hook.`);
    } else if (view === 'shack') shopReact(`That tin costs ${BAITS[buyBait].cost} Essence. Save up and it's yours.`);
    lastLists = ''; renderShop(); return;
  }
  const close = e.target.closest('[data-close]')?.dataset.close;
  if (close) { closeDialog(close); return; }
  if (e.target.tagName === 'DIALOG' && e.target.open) closeDialog(e.target.id); // backdrop
});
$('ddBuddy').addEventListener('click', () => {
  if (!detailId) return;
  game.setBuddy(game.state.buddy === detailId ? null : detailId);
  openDexDetail(detailId);
  lastLists = '';
});
$('ddTrack').addEventListener('click', () => {
  if (!detailId) return;
  const next = game.state.trackedGoop === detailId ? null : detailId;
  if (game.setTrackedGoop(next)) {
    openDexDetail(detailId);
    lastLists = '';
  }
});
$('huntChip').addEventListener('click', () => {
  const id = game.state.trackedGoop;
  if (id) openDexDetail(id);
});
$('shopList').addEventListener('click', (e) => {
  const kind = e.target.closest('[data-buy]')?.dataset.buy;
  if (kind && game.buyUpgrade(kind)) lastLists = '';
});
for (const id of ['rerollBtn', 'rerollBtn2']) $(id).addEventListener('click', () => { if (game.rerollBounties()) { setHTML('bountyDlgList', bountyHTML()); lastLists = ''; } });
$('mapBtn').addEventListener('click', openMap);
$('boardBtn').addEventListener('click', openBounties);
$('baitBtn').addEventListener('click', () => openTackle());
$('openTackle').addEventListener('click', () => openTackle());
$('resetBtn').addEventListener('click', () => { if (confirm('Reset your GoopDex, Essence and upgrades?')) { game.reset(); lastLists = ''; } });

function toggleMute() { sfx.unlock(); sfx.setMuted(!sfx.muted); paintMute(); }
function paintMute() { const b = $('muteBtn'); b.innerHTML = sfx.muted ? ICON.soundOff : ICON.soundOn; b.setAttribute('aria-pressed', String(sfx.muted)); }
$('muteBtn').addEventListener('click', toggleMute);
$('mapBtn').innerHTML = ICON.map;
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
  scene.camX = walker.x;
  scene.onSplash = () => sfx.splash();
  scene.onReveal = () => {
    if (!pendingCatch) return;
    showCatchCard(pendingCatch);
    sfx.catch(GOOPS.find((g) => g.id === pendingCatch.goop)?.rarity, pendingCatch.shiny);
    pendingCatch = null;
  };
  scene.onThunder = () => sfx.thunder();
  tank = new Tank($('tankCanvas'), assets, scene);
  tank.sync(game.state, 0);
  const exploreBtn = document.createElement('button');
  exploreBtn.id = 'exploreBtn'; exploreBtn.className = 'side-btn'; exploreBtn.type = 'button'; exploreBtn.hidden = true; exploreBtn.title = 'Explore Reedbed Hollow'; exploreBtn.setAttribute('aria-label', 'Explore Reedbed Hollow'); exploreBtn.innerHTML = '<span class="emoji">🥾</span>';
  exploreBtn.addEventListener('click', enterHollow);
  document.querySelector('.side-btns')?.appendChild(exploreBtn);
  
  window.__goop = { game, scene, walker, tank, go, hollow };
  const start0 = location.hash.slice(1);
  if (VIEWS.includes(start0) && start0 !== 'pond') go(start0, { scroll: false });
  $('loadHint').textContent = 'The Goops are biting.';
  const start = $('startBtn');
  start.hidden = false;
  const skipIntro = new URLSearchParams(location.search).has('skipintro');
  const begin = () => {
    sfx.unlock();
    $('loader').classList.add('gone');
    if (!skipIntro && !guideSeen() && game.state.stats.caught === 0) { markGuideSeen(); openGuide(); }
  };
  start.addEventListener('click', begin, { once: true });
  if (skipIntro) begin();
  requestAnimationFrame(loop);
}
boot();
