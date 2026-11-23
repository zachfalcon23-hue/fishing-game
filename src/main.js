import {
  GOOPS, SPOTS, SPOT_BY, UPGRADES, NOTES, PHASES, BAITS, SETS, TASTES, MOON, REROLL_COST, WEATHER,
  RODS, SKINS, BOBBERS, LINES, LURES, CHARMS, FINDER_COST, BUDDY_TRAIN, buddyBonus, QUESTS, DECOR, THEMES,
  FishingGame, conditionText, tasteBait,
} from './game.js';
import { Scene, loadAssets, GOOP_ART, SPOT_X, SPOT_GAP, WORLD_MIN, WORLD_MAX, CLUE_X, toShore, fromShore } from './scene.js';
import { Sfx } from './audio.js';
import { Tank } from './aquarium.js';

const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const sceneEl = $('scene');
const game = new FishingGame();
const sfx = new Sfx();
let scene = null;

let reelHeld = false;
let drag = null;
let tapLatch = false;
const pointer = { px: 0, py: 0 };
const newDex = new Set();
const keys = { left: false, right: false };
const held = { left: false, right: false, drag: 0 };
const pressAt = { left: 0, right: 0, keyLeft: 0, keyRight: 0 };
const walker = { x: fromShore(game.state.shore ?? 0), v: 0, target: null, step: 0 };
const WALK_SPEED = 950;
const TAP_MS = 230;
let dexFilter = 'all';
const snaps = {};
const SECRETS = ['sandbar', 'cave', 'wreck'];
const SPOT_ICON = { sandbar: '🌙', dock: '⚓', lily: '🪷', reeds: '🌾', boulder: '🪨', falls: '💧', cave: '💎', grotto: '🍄', deep: '🌀', wreck: '🛶' };
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
    const status = e ? `×${e.count}${e.best ? ` · ${e.best} cm` : ''}` : seen ? 'Seen — not caught' : 'Undiscovered';
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
    ? `<div><span>CAUGHT</span><b>${e.count}</b></div><div><span>BIGGEST</span><b>${e.best ?? '—'} cm</b></div><div><span>FASTEST</span><b>${e.fastest != null ? `${e.fastest.toFixed(1)}s` : '—'}</b></div><div><span>SHINY</span><b>${e.shiny ? `✦ ${e.shiny}` : '—'}</b></div>`
    : `<div><span>SIZE RANGE</span><b>${knows ? `${g.size[0]}–${g.size[1]} cm` : '???'}</b></div><div><span>FIGHT</span><b>${seen ? g.pattern[0].toUpperCase() + g.pattern.slice(1) : '???'}</b></div>`;
  $('ddBait').innerHTML = e || knows ? `Favourite food: <b>${TASTES[g.taste]}</b> — try ${bait.icon} <b>${bait.name}</b>` : '';
  $('ddHint').textContent = e || seen ? g.hint : '';
  const btn = $('ddBuddy');
  btn.hidden = !e;
  btn.textContent = game.state.buddy === id ? '✓ YOUR BUDDY' : 'MAKE BUDDY';
  btn.classList.toggle('on', game.state.buddy === id);
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
    return `<div class="spot ${here ? 'current' : ''} ${open ? '' : 'locked'} ${done ? 'done' : ''}" ${bg}><div><b>${open || found ? sp.name : '???'} ${tags}</b><small>${sub}</small>`
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

function baitRows() {
  const s = game.state;
  return Object.entries(BAITS).map(([k, b]) => {
    const n = k === 'worm' ? '∞' : s.baits[k] || 0;
    const on = s.bait === k;
    const use = on ? '<button class="on" disabled>IN USE</button>' : `<button class="use" data-bait="${k}" ${k !== 'worm' && !s.baits[k] ? 'disabled' : ''}>USE</button>`;
    const buy = b.cost ? `<button data-buybait="${k}" ${s.essence < b.cost ? 'disabled' : ''} title="Buy ${b.pack}">+${b.pack} · ${b.cost}</button>` : '';
    return `<div class="option bait-row ${on ? 'equipped' : ''}"><span class="ico emoji">${b.icon}</span><div class="txt"><b>${b.name} <i class="own">×${n}</i></b><small>${b.desc}</small></div><div class="btns">${use}${buy}</div></div>`;
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
    return `<g class="${cls}" ${open ? `data-walk="${sp.id}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)})" role="button" aria-label="${esc(label)}">`
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
  const sig = JSON.stringify([s.essence, s.spot, game.here, s.discovered, s.gear, game.dexCount, s.stats.caught, s.notes.length, s.completed, game.busy, dexFilter,
    Object.keys(snaps).length, s.seen.length, s.bait, s.baits, s.buddy, s.buddyLv, s.equip, s.owned, s.finder, s.tips.length, s.sets, s.bounties.map((b) => b.have + b.id), s.frenzy, s.visitor, s.timeIndex, s.weather, SECRETS.map((id) => game.secretVisible(id))]);
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
  if (!active) return;
  const pct = (v) => Math.round(Math.max(0, Math.min(1, v)) * 100);
  hud.classList.toggle('in-zone', fight.tension >= fight.safeLo && fight.tension <= fight.safeHi);
  hud.classList.toggle('danger', fight.tension > 0.88 || fight.tension < 0.15);
  hud.classList.toggle('warn', !!fight.warn);
  $('tensionBar').style.width = `${fight.tension * 100}%`;
  $('needle').style.left = `${fight.tension * 100}%`;
  $('safeZone').style.left = `${fight.safeLo * 100}%`;
  $('safeZone').style.width = `${(fight.safeHi - fight.safeLo) * 100}%`;
  $('progressBar').style.width = `${fight.progress * 100}%`;
  $('staminaBar').style.width = `${pct(fight.stamina / game.goop.stamina)}%`;
  setText('tensionText', `${pct(fight.tension)}%`);
  setText('progressText', `${pct(fight.progress)}%`);
  setText('staminaText', `${pct(fight.stamina / game.goop.stamina)}%`);
  setText('tensionLbl', fight.warn ? 'EASE OFF!' : 'TENSION');
  const c = fight.combo || 1;
  const combo = $('combo');
  combo.classList.toggle('show', c > 1);
  setText('combo', c > 1 ? `STREAK ×${c.toFixed(2).replace(/0$/, '')}` : '');
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
  if (s.frenzy && z.mix.some(([sp, k]) => sp.id === s.frenzy && k >= 0.5)) evs.push('<span class="ev frenzy">✦ FRENZY HERE</span>');
  else if (s.frenzy) evs.push(`<span class="ev">✦ FRENZY · ${spotName(s.frenzy).replace(/^The /, '').toUpperCase()}</span>`);
  if (game.fullMoon && game.timeOfDay === 'Night') evs.push('<span class="ev moon">🌕 FULL MOON</span>');
  setHTML('eventTag', evs.join(''));
  $('castBtn').disabled = game.busy || walking;
  setHTML('castBtn', game.here ? 'CAST LINE <kbd>C</kbd>' : 'CAST HERE <kbd>C</kbd>');
  const free = !game.busy;
  $('leftBtn').disabled = !free; $('rightBtn').disabled = !free;
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
  renderQuestChip();
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
  const extras = [];
  if (c.perfect) extras.push('PERFECT HOOK');
  if (c.combo > 1) extras.push(`BEST STREAK ×${c.combo.toFixed(2).replace(/0$/, '')}`);
  $('ccExtra').textContent = extras.join(' · ');
  const badge = $('ccNew');
  badge.hidden = !(c.firstTime || c.record || c.shiny);
  badge.textContent = c.firstTime ? 'NEW!' : c.shiny ? 'SHINY!' : 'RECORD!';
  const p = game.spotProgress(game.spot.id);
  $('ccHint').textContent = `${game.spot.name}: ${p.found}/${p.total} found · cast again or walk on`;
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
function handleEvents() {
  for (const e of game.events.splice(0)) {
    scene?.onEvent(e, game);
    const d = e.detail;
    switch (e.type) {
      case 'cast': sfx.cast(); break;
      case 'bite': sfx.bite(); navigator.vibrate?.(60); break;
      case 'hooked': sfx.hook(); if (d.perfect) sfx.perfect(); navigator.vibrate?.(30); lastLists = ''; break;
      case 'lunge': sfx.snap(); navigator.vibrate?.([60, 30, 60]); break;
      case 'dodge': sfx.dodge(); break;
      case 'combo': sfx.combo(d.combo); break;
      case 'catch':
        if (d.firstTime) newDex.add(d.goop);
        lastLists = ''; pendingCatch = d; sfx.splash(true); scene?.cheer(); tank?.sync(game.state);
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
      case 'spotComplete': setTimeout(() => { notify(`${spotName(d.spot)} complete! +${d.bonus} Essence bonus`); sfx.coin(); }, 3000); break;
      case 'set': setTimeout(() => { notify(`🏆 Collection complete: ${SETS.find((x) => x.id === d.set).name}! +${d.reward} Essence`, 3400); sfx.fanfare(); }, 3200); lastLists = ''; break;
      case 'bounty': setTimeout(() => { notify(`📜 Bounty done: ${d.text}! +${d.essence}${d.bait ? ` and ${BAITS[d.bait].icon}×${d.baitN}` : ''}`, 3400); sfx.fanfare(); }, 2600); lastLists = ''; break;
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
  if (tab) { tackleTab = tab; tryOn = null; renderTackle(); return; }
  const buy = e.target.closest('[data-tk-buy]')?.dataset.tkBuy;
  if (buy) { const [k, id] = buy.split(':'); if (game.buyTackle(k, id)) { tryOn = null; } renderTackle(); return; }
  const eq = e.target.closest('[data-tk-eq]')?.dataset.tkEq;
  if (eq) { const [k, id] = eq.split(':'); game.equipTackle(k, id); tryOn = null; renderTackle(); return; }
  const lb = e.target.closest('[data-lure-buy]')?.dataset.lureBuy;
  if (lb) { game.buyLure(lb); tryOn = null; renderTackle(); return; }
  const le = e.target.closest('[data-lure-eq]')?.dataset.lureEq;
  if (le) { game.equipLure(le); tryOn = null; renderTackle(); return; }
  const charm = e.target.closest('[data-charm]');
  if (charm) { game.useCharm(charm.dataset.charm, charm.dataset.arg); renderTackle(); return; }
  if (e.target.closest('[data-finder]')) { game.buyFinder(); renderTackle(); return; }
  if (e.target.closest('[data-train]')) { game.trainBuddy(); renderTackle(); return; }
  const up = e.target.closest('[data-buy]')?.dataset.buy;
  if (up) { game.buyUpgrade(up); renderTackle(); return; }
  if (e.target.closest('[data-bait], [data-buybait]')) { setTimeout(renderTackle, 0); return; }
  const tr = e.target.closest('[data-try]')?.dataset.try;
  if (tr && !e.target.closest('button')) { const [k, id] = tr.split(':'); tryOn = { kind: k, id }; $('tackleList').querySelectorAll('.tk-card').forEach((n) => n.classList.toggle('trying', n.dataset.try === tr)); }
});

// ---------- fish finder ----------

let finderSig = '';
function renderFinder() {
  const el = $('finder');
  const show = game.state.finder && !game.busy && game.phase !== PHASES.CAUGHT;
  el.hidden = !show;
  if (!show) return;
  const s = game.state;
  const sig = [Math.round(s.shore * 10), s.bait, s.timeIndex, s.weather, s.equip.lure, s.equip.rod, s.frenzy, s.seen.length, game.dexCount, s.discovered.length].join('|');
  if (sig === finderSig) return;
  finderSig = sig;
  const rows = game.forecast(4).map(({ id, chance }) => {
    const seen = s.seen.includes(id) || !!s.dex[id];
    const g = GOOPS.find((x) => x.id === id);
    return `<div class="f-row r-${g.rarity}"><img src="${GOOP_ART(id)}" alt="" class="${s.dex[id] ? '' : 'locked'}"><span>${seen ? esc(g.name) : '???'}</span><b>${chance < 0.01 ? '<1' : Math.round(chance * 100)}%</b></div>`;
  }).join('');
  el.innerHTML = `<div class="f-title">📡 FISH FINDER</div>${rows}`;
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
  if (next === 'aquarium' && tank) { tank.sync(game.state); tank.start(); renderTank(); } else tank?.stop();
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

function renderQuestChip() {
  const chip = $('questChip');
  const q = game.quest;
  chip.hidden = !q || game.busy;
  $('shackDot').hidden = !(q && game.questProgress().ready);
  $('tankDot').hidden = !game.tipJar();
  if (!q || game.busy) return;
  const p = game.questProgress();
  setHTML('questChip', p.ready ? '📜 <b>Quest done!</b> Visit Wiggs' : `📜 ${esc(goalText(q.goal))} <b>${p.have}/${p.need}</b>`);
  chip.classList.toggle('ready', p.ready);
}
$('questChip').addEventListener('click', () => go('shack'));

// ----- aquarium -----

function renderTank() {
  const s = game.state;
  const n = Object.keys(s.dex).length;
  const shinies = Object.values(s.dex).filter((e) => e.shiny).length;
  setHTML('tankCount', `${n} / ${GOOPS.length} GOOPS${shinies ? ` · <span class="sh">✦ ${shinies}</span>` : ''}`);
  $('tankEmpty').hidden = n > 0;
  const tip = game.tipJar();
  $('tipsBtn').disabled = !tip;
  $('tipsBtn').textContent = tip ? `💰 TIPS +${tip}` : '💰 TIPS ✓';
  $('tipsBtn').title = tip ? 'Visitors left tips to see your Goops' : 'Come back tomorrow for more tips';
  $('feedBtn').classList.toggle('on', !!tank?.feedMode);
  const legends = GOOPS.filter((g) => g.rarity === 'Legendary' && s.dex[g.id]).length;
  setText('decorCount', `${s.tank.decor.length} / ${Object.keys(DECOR).length}`);
  $('decorList').innerHTML = Object.entries(DECOR).map(([id, d]) => {
    const owned = s.tank.decor.includes(id);
    const locked = d.legends && legends < d.legends;
    const btn = owned ? '<button class="on" disabled>IN YOUR TANK</button>'
      : d.quest ? '<button disabled>📜 QUEST REWARD</button>'
        : locked ? `<button disabled>🔒 ${d.legends} LEGENDARIES</button>`
          : `<button class="buy" data-decor="${id}" ${s.essence < d.cost ? 'disabled' : ''}>BUY · ${d.cost}</button>`;
    return `<div class="tk-card ${owned ? 'equipped' : ''}"><div class="tk-head"><b>${d.name}</b></div><small>${d.desc}</small><div class="tk-btns">${btn}</div></div>`;
  }).join('');
  setText('themeCount', `${s.tank.themes.length} / ${Object.keys(THEMES).length}`);
  $('themeList').innerHTML = Object.entries(THEMES).map(([id, t]) => {
    const owned = s.tank.themes.includes(id), on = s.tank.theme === id;
    const btn = on ? '<button class="on" disabled>SHOWING</button>' : owned ? `<button class="use" data-theme="${id}">SHOW</button>` : `<button class="buy" data-theme="${id}" ${s.essence < t.cost ? 'disabled' : ''}>BUY · ${t.cost}</button>`;
    return `<div class="tk-card ${on ? 'equipped' : ''}"><div class="tk-head"><span class="swatch" style="background:linear-gradient(180deg,${t.top},${t.mid} 55%,${t.bot})"></span><b>${t.name}</b></div><div class="tk-btns">${btn}</div></div>`;
  }).join('');
}

function showTankCard(id) {
  const g = GOOPS.find((x) => x.id === id), e = game.state.dex[id];
  if (!g || !e) return;
  const card = $('tankCard');
  card.style.setProperty('--rc', e.shiny ? '#fff27a' : `var(--r-${g.rarity.toLowerCase()})`);
  const buddy = game.state.buddy === id;
  card.innerHTML = `<button class="close" data-tankclose aria-label="Close">✕</button><div class="tc-rarity">${e.shiny ? 'SHINY · ' : ''}${g.rarity.toUpperCase()}</div><h3>${esc(g.name)}</h3>`
    + `<div class="tc-stats"><span>×${e.count} caught</span><span>Best ${e.best ?? '—'} cm</span>${e.shiny ? `<span>✦ ${e.shiny} shiny</span>` : ''}</div>`
    + `<div class="tc-btns"><button data-tankbuddy="${id}" class="${buddy ? 'on' : ''}">${buddy ? '♥ YOUR BUDDY' : 'MAKE BUDDY'}</button><button data-tankdex="${id}">GOOPDEX</button></div>`;
  card.hidden = false;
  card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
}

$('tankCanvas').addEventListener('pointerdown', (e) => {
  if (!tank) return;
  sfx.unlock();
  const r = $('tankCanvas').getBoundingClientRect();
  const dpr = $('tankCanvas').width / r.width;
  const id = tank.tap((e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr);
  if (tank.feedMode) { sfx.splash(); return; }
  if (id) { sfx.note(); showTankCard(id); }
});
$('feedBtn').addEventListener('click', () => { if (!tank) return; tank.feedMode = !tank.feedMode; $('feedBtn').classList.toggle('on', tank.feedMode); $('tankHint').textContent = tank.feedMode ? 'Tap the water to drop food' : 'Tap a Goop to say hi · turn on FEED and tap the water to drop food'; sfx.note(); });
$('tipsBtn').addEventListener('click', () => { const tip = game.collectTips(); if (tip) { sfx.coin(); bumpWallet(); notify(`💰 Visitors loved your tank: +${tip} Essence`); renderTank(); } });
$('aquariumView').addEventListener('click', (e) => {
  const dec = e.target.closest('[data-decor]')?.dataset.decor;
  if (dec && game.buyDecor(dec)) { sfx.coin(); bumpWallet(); renderTank(); return; }
  const th = e.target.closest('[data-theme]')?.dataset.theme;
  if (th && game.setTheme(th)) { sfx.note(); renderTank(); return; }
  if (e.target.closest('[data-tankclose]')) { $('tankCard').hidden = true; return; }
  const bud = e.target.closest('[data-tankbuddy]')?.dataset.tankbuddy;
  if (bud) { game.setBuddy(game.state.buddy === bud ? null : bud); showTankCard(bud); lastLists = ''; return; }
  const dx = e.target.closest('[data-tankdex]')?.dataset.tankdex;
  if (dx) openDexDetail(dx);
});

// ---------- loop ----------

let last = null;
let clickTimer = 0;
let ambientTimer = 2;
function loop(ts) {
  const dt = last == null ? 0 : Math.min(0.08, (ts - last) / 1000);
  last = ts;
  updateWalk(dt);
  game.update(dt, { reel: reelHeld || tapLatch });
  tapLatch = false;
  handleEvents();
  if (scene) {
    scene.reeling = reelHeld && game.phase === PHASES.FIGHT;
    if (view === 'pond') {
      scene.render(game, dt, { ...pointer, camX: walker.x, walkSpeed: walker.v / WALK_SPEED, gate: gateX() });
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

const reelBtn = $('reelBtn');
reelBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
for (const [id, side, dir] of [['leftBtn', 'left', -1], ['rightBtn', 'right', 1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); sfx.unlock(); held[side] = true; pressAt[side] = performance.now(); });
  const up = () => {
    if (!held[side]) return;
    held[side] = false;
    if (performance.now() - pressAt[side] < TAP_MS) tapWalk(dir); // a quick tap walks to the next stop
  };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointerleave', () => { held[side] = false; });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
window.addEventListener('pointerup', () => { release(); held.left = false; held.right = false; held.drag = 0; drag = null; });
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
  if (game.busy) { e.preventDefault(); press(); return; }
  drag = { x: e.clientX, y: e.clientY, moved: false, at: performance.now() };
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
  if (anyDialogOpen() || view !== 'pond') return;
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

document.addEventListener('click', (e) => {
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
  if (bait) { game.selectBait(bait); lastLists = ''; renderShop(); return; }
  const buyBait = e.target.closest('[data-buybait]')?.dataset.buybait;
  if (buyBait) { if (game.buyBait(buyBait)) { game.selectBait(buyBait); } lastLists = ''; renderShop(); return; }
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
  tank.sync(game.state);
  window.__goop = { game, scene, walker, tank, go };
  const start0 = location.hash.slice(1);
  if (VIEWS.includes(start0) && start0 !== 'pond') go(start0, { scroll: false });
  $('loadHint').textContent = 'The Goops are biting.';
  const start = $('startBtn');
  start.hidden = false;
  const begin = () => { sfx.unlock(); $('loader').classList.add('gone'); };
  start.addEventListener('click', begin, { once: true });
  if (new URLSearchParams(location.search).has('skipintro')) begin();
  requestAnimationFrame(loop);
}
boot();
