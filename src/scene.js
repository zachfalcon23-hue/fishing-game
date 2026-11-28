// Goop Fishing — North Pond renderer (presentation only; reads game state, never changes it).
// The pond is one continuous shoreline. The camera walks along it; every layer scrolls at its
// own depth so near things slide past faster than far ones.
import { PHASES, SPOTS, NOTES, SPOT_BY, GOOPS, RODS, SKINS, LINES, BAITS, encounterPool } from './game.js';
import { evaluateWildlifeBehavior, wildlifeNeeds, habitatReturnOffset, habitatInteractionMotion, habitatInteractionWaterCue, resolveWildlifeSighting, wildlifeDisplayProfile } from './wildlife.js';

export const W = 1920;
export const H = 1080;
export const HZ = 470;                       // horizon line (same all the way round the pond)
export const SPOT_GAP = 1280;                // shoreline distance between neighbouring spots
export const SPOT_X = Object.fromEntries(SPOTS.map((s) => [s.id, W / 2 + s.pos * SPOT_GAP]));
export const WORLD_MIN = Math.min(...Object.values(SPOT_X));
export const WORLD_MAX = Math.max(...Object.values(SPOT_X));
/** Shore position (in spot widths, as the game uses) of a world x, and back. */
export const toShore = (x) => (x - W / 2) / SPOT_GAP;
export const fromShore = (p) => W / 2 + p * SPOT_GAP;
/** Where each secret's clue shows up along the shore (world x). */
export const CLUE_X = { sandbar: SPOT_X.dock - 760, cave: SPOT_X.cave, wreck: SPOT_X.deep + 760 };
/** Where the bounty board stands (world x, near the dock). */
export const BOARD_X = SPOT_X.dock - 560;

// ---------- assets ----------

const ASSETS = {
  mountains: 'assets/env/mountains.webp',
  forest: 'assets/env/forest.webp',
  waterfall: 'assets/env/waterfall.webp',
  water: 'assets/env/water.webp',
  dock: 'assets/env/dock.webp',
  frameL: 'assets/env/frame_l.webp',
  frameR: 'assets/env/frame_r.webp',
  reedsL: 'assets/env/reeds_l.webp',
  reedsR: 'assets/env/reeds_r.webp',
  boulderA: 'assets/env/boulder_a.webp',
  boulderB: 'assets/env/boulder_b.webp',
  lilyA: 'assets/env/lily_a.webp',
  lilyB: 'assets/env/lily_b.webp',
  ripples: 'assets/fx/water_ripples.webp',
  caustics: 'assets/fx/water_caustics.webp',
  fog: 'assets/fx/fog_drift.webp',
  rain: 'assets/fx/rain.webp',
  bubbles: 'assets/fx/bubbles.webp',
  glow: 'assets/fx/glow.webp',
};
export const GOOP_ART = (id) => `assets/goops/${id}.webp`;

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

/** Loads the environment now; Goop portraits stream in afterwards (they are only needed on a bite). */
export async function loadAssets(goopIds, onProgress = () => {}) {
  const entries = Object.entries(ASSETS);
  let done = 0;
  const out = {};
  await Promise.all(entries.map(async ([key, src]) => {
    try { out[key] = await loadImage(src); } catch (err) { console.warn(err.message); out[key] = null; }
    onProgress(++done / entries.length);
  }));
  for (const id of goopIds) loadImage(GOOP_ART(id)).then((img) => { out[`goop:${id}`] = img; }).catch(() => {});
  return out;
}

// ---------- helpers ----------

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const motionlessOffset = (pattern, t, i) => pattern === 'dart' || pattern === 'wild' ? Math.sin(t * 8 + i * 2.1) * 18 : pattern === 'drift' ? Math.sin(t * 0.8 + i) * 26 : Math.sin(t * 1.5 + i * 2) * 10;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

/**
 * Pure visual response to a resolved signature move.
 * `at` is the game's event timestamp (milliseconds); no fight state is modified.
 * Returns null for expired/invalid reactions so old effects cannot leak into a later cast.
 */
export function fightReactionPose(reaction, now, x, y, bobberX) {
  if (!reaction || !['win', 'fail'].includes(reaction.type)
    || !Number.isFinite(reaction.at) || !Number.isFinite(reaction.duration)
    || reaction.duration <= 0 || !Number.isFinite(now)
    || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(bobberX)) return null;
  const age = Math.max(0, (now - reaction.at) / 1000);
  const progress = age / reaction.duration;
  if (progress >= 1) return null;
  const strength = Math.sin(Math.PI * clamp(progress, 0, 1));
  const success = reaction.type === 'win';
  const direction = success ? (Math.sign(x - bobberX) || 1) : (Math.sign(bobberX - x) || 1);
  return {
    type: reaction.type,
    move: reaction.move,
    progress,
    strength,
    x: x + direction * (success ? 34 : 48) * strength
      + (success ? 0 : Math.sin(age * 30) * 12 * strength),
    y: y + (success ? 18 : -24) * strength,
    scale: 1 + (success ? -0.08 : 0.1) * strength,
    alpha: 1 + (success ? -0.18 : 0.08) * strength,
  };
}
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- look tables ----------

const SKIES = {
  Dawn: { stops: ['#1f2350', '#5b3d78', '#c46c86', '#ffb27f'], sun: '#ffd9a0', sunY: 0.78, cloud: ['#ffc6b0', '#7c5a8c'], stars: 0.25, light: '#ffb98a' },
  Day: { stops: ['#2f78c8', '#4f9ddd', '#8fcdf0', '#d6f1ff'], sun: '#fff8dc', sunY: 0.18, cloud: ['#ffffff', '#9fb8d6'], stars: 0, light: '#fff3d0' },
  Dusk: { stops: ['#14123a', '#4a2560', '#b8456a', '#ff9150'], sun: '#ffb070', sunY: 0.86, cloud: ['#ff9f7a', '#4b2a5c'], stars: 0.35, light: '#ff8a50' },
  Night: { stops: ['#03081c', '#0a1940', '#173062', '#2c5288'], sun: '#eef6ff', sunY: 0.22, cloud: ['#8fb0d8', '#1a2c50'], stars: 1, light: '#a8c8ff' },
};
const STORM_SKY = ['#151a26', '#232b3c', '#384457', '#56637a'];
const TIME_GRADE = {
  Dawn: [['screen', '#3a2e5c', 0.35], ['soft-light', '#ff9a78', 0.75], ['multiply', '#f0d0e0', 0.25]],
  Day: [['screen', '#4f7fa8', 0.32], ['soft-light', '#fff0c0', 0.7], ['overlay', '#7fa0b0', 0.25]],
  Dusk: [['soft-light', '#ff6a3a', 0.6], ['multiply', '#c080b8', 0.35], ['screen', '#2a1030', 0.15]],
  Night: [['multiply', '#d8e4ff', 0.12]],
};
const WEATHER_GRADE = {
  clear: [], rain: [['multiply', '#7d8ea6', 0.35]],
  fog: [['screen', '#8c9eaa', 0.2], ['saturation', '#808080', 0.2]],
  storm: [['multiply', '#4f5a70', 0.6]],
};

// Ambient colour of each stretch of shore, blended in as you walk near it.
const SPOT_TINT = {
  dock: null, lily: ['#ff9ad8', 0.14], reeds: ['#9cff7a', 0.16], boulder: ['#ffb070', 0.1],
  falls: ['#7ad8ff', 0.18], grotto: ['#7a5cff', 0.24], deep: ['#3a2aff', 0.3],
  sandbar: ['#9ab8ff', 0.3], cave: ['#ffb85a', 0.22], wreck: ['#3fd4c0', 0.26],
};

// Far scenery along the whole pond (x is world position, so it scrolls with parallax `d`).
const FAR = {
  mountains: { d: 0.08, y: 92, w: 1960 },
  forestBack: { d: 0.2, step: 720, s: 0.44, base: HZ + 10, haze: 0.5 },
  forestFront: { d: 0.32, step: 1900, s: 0.66, base: HZ + 35, haze: 0.18 },
  cliffs: [
    { spot: 'dock', sx: -330, s: 0.8, base: HZ + 58, d: 0.36 },
    { spot: 'falls', sx: 360, s: 1.2, base: HZ + 70, d: 0.4 },
    { spot: 'grotto', sx: 1000, s: 0.9, base: HZ + 50, d: 0.36, flip: true },
    { spot: 'deep', sx: 1500, s: 0.7, base: HZ + 40, d: 0.34 },
    { spot: 'cave', sx: 700, s: 1.05, base: HZ + 66, d: 0.4, flip: true },
  ],
};

// Set dressing for each spot, authored in screen coordinates as seen when standing there.
// d = depth (parallax); props are converted to world positions with toWorld().
const DRESSING = {
  dock: {
    props: [{ k: 'dock', sx: -300, sy: 585, s: 0.95, d: 0.85, lights: 'dock' }],
    lilies: [['lilyA', 1180, 742, 0.95], ['lilyB', 1555, 650, 0.7], ['lilyB', 930, 600, 0.42], ['lilyA', 1720, 820, 1.1]],
    fgR: 'reedsR',
    lane: { x0: 1060, x1: 1460, y0: 640, y1: 780 }, rod: { bx: 905, by: 1150 },
  },
  lily: {
    props: [],
    lilies: [['lilyA', 640, 700, 0.9], ['lilyB', 1500, 690, 0.85], ['lilyA', 1180, 600, 0.5], ['lilyB', 820, 590, 0.45],
      ['lilyA', 300, 820, 1.25], ['lilyB', 1700, 860, 1.1], ['lilyB', 1020, 660, 0.6], ['lilyA', 1350, 560, 0.4], ['lilyB', 480, 620, 0.55]],
    fgL: 'reedsL', fgR: 'reedsR',
    lane: { x0: 820, x1: 1280, y0: 640, y1: 790 }, rod: { bx: 980, by: 1170 },
  },
  reeds: {
    props: [],
    lilies: [['lilyB', 1350, 640, 0.6], ['lilyA', 760, 720, 0.7]],
    fgL: 'frameL', fgR: 'reedsR', fgMid: 'reedsL',
    lane: { x0: 860, x1: 1300, y0: 650, y1: 790 }, rod: { bx: 980, by: 1170 },
  },
  boulder: {
    props: [
      { k: 'boulderA', sx: -60, s: 1.35, d: 0.82, ground: true },
      { k: 'boulderB', sx: 1400, s: 1.25, d: 0.82, ground: true },
    ],
    lilies: [['lilyB', 980, 760, 0.7]],
    fgL: 'reedsL', fgR: 'frameR',
    lane: { x0: 820, x1: 1260, y0: 650, y1: 790 }, rod: { bx: 980, by: 1170 },
  },
  falls: {
    props: [{ k: 'boulderB', sx: 1480, s: 1.0, d: 0.8, ground: true }],
    lilies: [],
    fgL: 'frameL', fgR: 'reedsR',
    lane: { x0: 860, x1: 1240, y0: 620, y1: 770 }, rod: { bx: 1000, by: 1170 }, spray: { sx: 820, sy: HZ + 60 },
  },
  grotto: {
    props: [],
    lilies: [['lilyB', 600, 640, 0.5]],
    fgL: 'frameL', fgR: 'frameR', motes: '#8f7bff',
    lane: { x0: 760, x1: 1240, y0: 620, y1: 770 }, rod: { bx: 980, by: 1170 },
  },
  deep: {
    props: [{ k: 'boulderA', sx: -80, s: 1.5, d: 0.84, ground: true }, { k: 'boulderB', sx: 1520, s: 1.15, d: 0.84, ground: true, flip: true }],
    lilies: [],
    fgL: 'reedsL', fgR: 'frameR', motes: '#6a5aff',
    lane: { x0: 780, x1: 1260, y0: 600, y1: 760 }, rod: { bx: 980, by: 1170 },
  },
  // secret spots (only drawn once found)
  sandbar: {
    props: [{ k: 'boulderB', sx: 1620, s: 0.9, d: 0.82, ground: true, flip: true }],
    lilies: [['lilyB', 420, 640, 0.5], ['lilyA', 1500, 700, 0.6]],
    fgL: 'reedsL', motes: '#cfe0ff', sand: true,
    lane: { x0: 820, x1: 1280, y0: 620, y1: 770 }, rod: { bx: 980, by: 1170 },
  },
  cave: {
    props: [{ k: 'boulderA', sx: 1480, s: 1.1, d: 0.82, ground: true, flip: true }],
    lilies: [],
    fgL: 'frameL', fgR: 'frameR', motes: '#ffcf6a', crystals: true,
    lane: { x0: 800, x1: 1240, y0: 620, y1: 770 }, rod: { bx: 980, by: 1170 },
  },
  wreck: {
    props: [{ k: 'dock', sx: 420, sy: 560, s: 0.8, d: 0.62, flip: true, rot: -0.07, sunk: true }, { k: 'boulderB', sx: -60, s: 1.2, d: 0.84, ground: true }],
    lilies: [],
    fgR: 'reedsR', motes: '#7affe0', mast: true,
    lane: { x0: 860, x1: 1300, y0: 640, y1: 780 }, rod: { bx: 980, by: 1170 },
  },
};

// Where each field note lies on the shore (screen coords at its spot).
const NOTE_POS = {
  'n-dock-1': [640, 1000], 'n-dock-2': [1640, 930],
  'n-lily-1': [250, 960], 'n-lily-2': [1720, 980],
  'n-reeds-1': [330, 930], 'n-reeds-2': [1560, 960],
  'n-boulder-1': [180, 720], 'n-boulder-2': [1700, 770],
  'n-falls-1': [420, 980], 'n-falls-2': [1650, 760],
  'n-grotto-1': [300, 960], 'n-grotto-2': [1620, 980],
  'n-deep-1': [200, 760], 'n-deep-2': [1760, 820],
  'n-sandbar-1': [300, 940], 'n-cave-1': [1620, 960], 'n-wreck-1': [1700, 950],
};

const DOCK_LIGHTS = [
  { fx: 0.272, fy: 0.215, r: 300, color: '#ffb85a', flicker: 1 },
  { fx: 0.856, fy: 0.292, r: 230, color: '#ffb85a', flicker: 1.3 },
  { fx: 0.066, fy: 0.6, r: 110, color: '#5ff2ff', flicker: 0 },
  { fx: 0.44, fy: 0.76, r: 80, color: '#5ff2ff', flicker: 0 },
];
const FG_LIGHTS = {
  frameL: [{ fx: 0.17, fy: 0.75, r: 170, color: '#5ff2ff' }],
  frameR: [{ fx: 0.8, fy: 0.78, r: 160, color: '#5ff2ff' }, { fx: 0.45, fy: 0.62, r: 80, color: '#b4ff7a' }],
};
const FALLS = { fx0: 0.565, fx1: 0.745, fy0: 0.36, fy1: 0.88 };
/** Each rod's own look. Skins replace the colours; the details (joints, weave, glow…) stay. */
const ROD_STYLE = {
  wood: { shaft: ['#1e120a', '#5a3420', '#a8693a', '#f6c995'], grip: '#c99c62', reel: ['#e9fff0', '#5ad88a', '#14502e'], tip: '#8df28a' },
  bamboo: { shaft: ['#3a2a0a', '#8a6a2a', '#d8b860', '#fff0b0'], grip: '#6a4a20', reel: ['#fff6d0', '#d8a83a', '#5a3a0a'], tip: '#ffe08a', nodes: true, width: 0.95 },
  glass: { shaft: ['#0a3040', '#3aa8c8', '#a6f6ff', '#ffffff'], grip: '#1a3a4a', reel: ['#ffffff', '#7ad8ff', '#0c4a66'], tip: '#a6f6ff', glass: true, width: 0.9 },
  carbon: { shaft: ['#050505', '#1a1a1a', '#3a3a3a', '#9a9a9a'], grip: '#2a0a0a', reel: ['#ffffff', '#ff4a4a', '#3a0505'], tip: '#ff5a4a', weave: true, width: 0.82 },
  oak: { shaft: ['#1a0c04', '#4a2a12', '#7a4a22', '#c08a50'], grip: '#3a2010', reel: ['#e0e0e0', '#8a8a8a', '#2a2a2a'], tip: '#ffd27a', grain: true, width: 1.3 },
  coral: { shaft: ['#5a1a2a', '#e0507a', '#ff9ab0', '#fff0f4'], grip: '#6a2a3a', reel: ['#ffffff', '#ff9ab0', '#7a1a3a'], tip: '#ffd0e0', nubs: true },
  ember: { shaft: ['#1a0400', '#4a1206', '#9a2a0a', '#ffb070'], grip: '#2a0a04', reel: ['#fff0c0', '#ff6a1a', '#4a0a00'], tip: '#ff9a3a', cracks: true, width: 1.05 },
  storm: { shaft: ['#0a1020', '#2a3a5a', '#6a8ab8', '#e0f0ff'], grip: '#141a2a', reel: ['#ffffff', '#6a9aff', '#0a1a3a'], tip: '#cfe8ff', sparks: true },
  crystal: { shaft: ['#1a1040', '#7a6aff', '#c8b8ff', '#ffffff'], grip: '#2a1a5a', reel: ['#ffffff', '#c8b8ff', '#3a2a7a'], tip: '#ffffff', facets: true, glass: true },
  abyss: { shaft: ['#050010', '#1a0a3a', '#4a1a8a', '#c89aff'], grip: '#0a0418', reel: ['#e8d0ff', '#8a4aff', '#12042a'], tip: '#c89aff', runes: true, width: 1.05 },
};
const RARITY_COLOR = { Common: '#c9e6e2', Uncommon: '#8df28a', Rare: '#6fc4ff', Epic: '#c990ff', Legendary: '#ffd23a' };

/** World x of something authored at screen x `sx`, seen from spot `spotId`, at depth `d`. */
const toWorld = (spotId, sx, d) => SPOT_X[spotId] + (sx - W / 2) / d;

// ---------- scene ----------

export class Scene {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.a = assets;
    this.t = 0;
    this.camX = SPOT_X.dock;
    this.anchorX = null;          // world x where the line was cast (tackle stays there)
    this.revealed = new Set();    // secret spots found so far
    this.buddy = { x: 0, hop: 0, jump: 0, face: 1, alert: 0 };
    this.cam = { x: 0, y: 0, zoom: 1, shake: 0 };
    this.particles = [];
    this.ripples = [];
    this.grades = new Map();
    this.gradeKey = '';
    this.fade = null;
    this.flash = 0;
    this.bolt = null;
    this.nextBolt = 3;
    this.cast = null;
    this.jump = null;
    this.reveal = null;
    this.goopReaction = null;
    this.snap = null;
    this.bobber = { x: 1250, y: 700, dip: 0 };
    this.walk = 0;               // walking speed 0..1 (lowers the rod, bobs the camera)
    this.walkPhase = 0;
    this.gate = null;            // world x of the overgrown path, if any
    this.quality = { strips: 56, scale: 1 };
    this.frameTimes = [];
    this.reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.silhouettes = new Map();
    this.shinies = new Map();
    this.buildStatic();
    this.resize();
  }

  buildStatic() {
    const rnd = mulberry(7);
    this.stars = Array.from({ length: 260 }, () => ({ x: rnd() * W, y: Math.pow(rnd(), 1.6) * 520, r: 0.6 + rnd() * 1.8, tw: rnd() * 6.28, sp: 0.6 + rnd() * 2.2 }));
    this.dust = Array.from({ length: 520 }, () => { const u = rnd(); return { x: u * W, y: 40 + u * 260 + (rnd() - 0.5) * (60 + rnd() * 80), r: 0.3 + rnd() * 1.1, a: 0.15 + rnd() * 0.4 }; });
    this.cloudSprites = Array.from({ length: 5 }, (_, i) => this.makeCloud(mulberry(30 + i)));
    this.clouds = Array.from({ length: 7 }, (_, i) => ({ sprite: i % 5, x: rnd() * (W + 800) - 400, y: 30 + rnd() * 250, s: 0.6 + rnd() * 0.8, v: 6 + rnd() * 10 }));
    const g = makeCanvas(64, 64), gx = g.getContext('2d');
    const rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 64, 64);
    this.dot = g;
    // Fireflies scattered along the whole shore (world x), hovering over the banks.
    this.flies = Array.from({ length: 150 }, () => ({ x: WORLD_MIN - 900 + rnd() * (WORLD_MAX - WORLD_MIN + 1800), y: rnd() < 0.3 ? 360 + rnd() * 120 : 560 + rnd() * 420, ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.7 }));
    this.rain = Array.from({ length: 260 }, () => ({ x: rnd() * W, y: rnd() * H, l: 18 + rnd() * 26, v: 1300 + rnd() * 700, z: 0.4 + rnd() * 0.6 }));
    this.motes = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd(), ph: rnd() * 6.28, r: 1 + rnd() * 2.5 }));
    this.forestFlip = Array.from({ length: 64 }, () => rnd() < 0.5);
    // Ambient schools are presentation-only; fixed seeds keep the pond coherent between frames.
    const habitatBands = {
      sandbar: [92, 168, 'dart'], dock: [145, 265, 'cruise'], lily: [92, 190, 'dart'],
      reeds: [118, 228, 'weave'], boulder: [218, 338, 'cruise'], falls: [150, 290, 'surge'],
      cave: [238, 360, 'drift'], grotto: [250, 378, 'drift'], deep: [320, 438, 'drift'],
      wreck: [292, 420, 'drift'],
    };
    this.wildlife = Array.from({ length: 18 }, (_, i) => {
      const x = WORLD_MIN - 900 + rnd() * (WORLD_MAX - WORLD_MIN + 1800);
      const nearest = SPOTS.reduce((best, spot) => Math.abs(SPOT_X[spot.id] - x) < Math.abs(SPOT_X[best.id] - x) ? spot : best, SPOTS[0]);
      const [low, high, movement] = habitatBands[nearest.id] || [150, 300, 'cruise'];
      return {
        id: i,
        x, y: HZ + low + rnd() * (high - low), movement,
        sightingKey: '', sighting: null,
        phase: rnd() * 6.28, speed: 10 + rnd() * 24,
        size: 0.55 + rnd() * 0.8, count: 2 + Math.floor(rnd() * 4),
        // Stable individual traits echo Chase's fidelity and chronotype model.
        fidelity: 0.18 + ((i * 37) % 65) / 100,
        chronotype: ((i % 5) - 2) * 0.45,
        homeSpot: nearest.id,
        alertUntil: 0,
        color: ['#b9e6e8', '#9bd5d0', '#a8c8ff', '#c5b8ef'][i % 4],
      };
    });
  }

  makeCloud(rnd) {
    const c = makeCanvas(640, 240), g = c.getContext('2d');
    const puffs = 16 + Math.floor(rnd() * 10);
    for (let i = 0; i < puffs; i++) {
      const x = 100 + rnd() * 440, y = 120 + (rnd() - 0.4) * 70 - Math.sin((x - 100) / 440 * Math.PI) * 40, r = 40 + rnd() * 70;
      const rg = g.createRadialGradient(x, y - r * 0.3, r * 0.1, x, y, r);
      rg.addColorStop(0, 'rgba(255,255,255,.95)'); rg.addColorStop(0.6, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill();
    }
    return c;
  }

  // ----- sizing & quality -----

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const cssW = Math.max(rect.width || 960, (rect.height || 0) * W / H); // object-fit: cover on phones
    const w = Math.round(clamp(cssW * dpr * this.quality.scale, 480, W));
    const h = Math.round(w * H / W);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.grades.clear(); this.gradeKey = ''; this.fade = null; this.vignette = null;
    }
    this.far = this.far && this.far.width === w ? this.far : makeCanvas(w, h);
    this.px = w / W;
    this.quality.strips = w < 900 ? 36 : 56;
  }

  trackPerf(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.026 && this.quality.scale > 0.7) { this.quality.scale -= 0.15; this.resize(); }
  }

  // ----- graded layer cache -----

  gradeOps(time, weather, haze = 0) {
    const ops = [...(TIME_GRADE[time] || []), ...(WEATHER_GRADE[weather] || [])];
    if (haze > 0) {
      const col = weather === 'storm' ? STORM_SKY[2] : time === 'Day' ? '#8fb8d8' : SKIES[time].stops[time === 'Night' ? 3 : 1];
      ops.push(['screen', col, haze * (time === 'Day' ? 0.6 : 0.55)]);
    }
    return ops;
  }

  graded(key, ops) {
    const img = this.a[key];
    if (!img) return null;
    const id = `${key}|${JSON.stringify(ops)}`;
    let c = this.grades.get(id);
    if (c) return c;
    const s = Math.min(1, Math.max(0.5, this.px * 1.15));
    c = makeCanvas(img.width * s, img.height * s);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const [op, color, alpha] of ops) { g.globalCompositeOperation = op; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height); }
    g.globalCompositeOperation = 'destination-in'; g.globalAlpha = 1;
    g.drawImage(img, 0, 0, c.width, c.height);
    this.grades.set(id, c);
    return c;
  }

  silhouette(id) {
    if (this.silhouettes.has(id)) return this.silhouettes.get(id);
    const img = this.a[`goop:${id}`];
    if (!img) return null;
    const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(2,22,30,.82)'; g.fillRect(0, 0, c.width, c.height);
    this.silhouettes.set(id, c);
    return c;
  }

  /** Hue-rotated copy of a Goop for shiny catches (done by hand so it works in every browser). */
  shinyArt(id) {
    if (this.shinies.has(id)) return this.shinies.get(id);
    const img = this.a[`goop:${id}`];
    if (!img) return null;
    const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    try {
      const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
      const a = (150 * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
      const m = [
        0.213 + cos * 0.787 - sin * 0.213, 0.715 - cos * 0.715 - sin * 0.715, 0.072 - cos * 0.072 + sin * 0.928,
        0.213 - cos * 0.213 + sin * 0.143, 0.715 + cos * 0.285 + sin * 0.14, 0.072 - cos * 0.072 - sin * 0.283,
        0.213 - cos * 0.213 - sin * 0.787, 0.715 - cos * 0.715 + sin * 0.715, 0.072 + cos * 0.928 + sin * 0.072,
      ];
      for (let i = 0; i < p.length; i += 4) {
        const r = p[i], gg = p[i + 1], b = p[i + 2];
        p[i] = clamp(r * m[0] + gg * m[1] + b * m[2], 0, 255) * 1.08;
        p[i + 1] = clamp(r * m[3] + gg * m[4] + b * m[5], 0, 255) * 1.08;
        p[i + 2] = clamp(r * m[6] + gg * m[7] + b * m[8], 0, 255) * 1.08;
      }
      g.putImageData(d, 0, 0);
    } catch { /* tainted canvas (file://); fall back to the normal art */ }
    this.shinies.set(id, c);
    return c;
  }

  // ----- events from the game -----

  onEvent(e, game) {
    const D = DRESSING[game.spot.id] || DRESSING.dock;
    if (e.type === 'cast') {
      this.anchorX = this.camX;
      const tx = lerp(D.lane.x0, D.lane.x1, Math.random()), ty = lerp(D.lane.y0, D.lane.y1, Math.random());
      this.cast = { t: 0, dur: 0.75, tx, ty };
      this.reveal = null; this.goopReaction = null; this.snap = null; this.jump = null;
      this.bobber.x = tx; this.bobber.y = ty;
      this.castX = null;
    } else if (e.type === 'bite') {
      this.cam.shake = Math.max(this.cam.shake, 6);
      this.splash(this.bobber.x, this.bobber.y, 10, '#d8fbff', 0.6);
      this.ring(this.bobber.x, this.bobber.y, 1.2);
    } else if (e.type === 'hooked') {
      this.cam.shake = 10;
      if (e.detail.perfect) this.sparkle(this.bobber.x, this.bobber.y - 20, 24, '#fff27a');
      this.splash(this.bobber.x, this.bobber.y, 22, '#e8fdff', 1);
      this.ring(this.bobber.x, this.bobber.y, 1.6);
    } else if (e.type === 'catch') {
      this.goopReaction = null;
      const g = game.goop;
      this.reveal = { t: 0, id: g.id, color: g.color, rarity: g.rarity, shiny: e.detail.shiny, x0: this.bobber.x, y0: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 46, '#ffffff', 1.5);
      this.ring(this.bobber.x, this.bobber.y, 2.2);
      this.cam.shake = 14;
    } else if (e.type === 'escaped') {
      this.goopReaction = null;
      this.snap = { t: 0, x: this.bobber.x, y: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 18, '#ffffff', 1);
      this.cam.shake = 16;
    } else if (e.type === 'moveStart') {
      this.cam.shake = Math.max(this.cam.shake, e.detail.move === 'thrash' ? 12 : 6);
      this.splash(this.bobber.x, this.bobber.y, 12, '#e8fdff', 0.8);
      this.ring(this.bobber.x, this.bobber.y, 1.3);
    } else if (e.type === 'moveWin') {
      this.goopReaction = { type: 'win', move: e.detail.move, at: e.time, duration: 0.95 };
      this.sparkle(this.bobber.x, this.bobber.y - 30, 22, '#8df28a');
      this.ring(this.bobber.x, this.bobber.y, 1.25);
    } else if (e.type === 'moveFail') {
      this.goopReaction = { type: 'fail', move: e.detail.move, at: e.time, duration: 0.72 };
      this.cam.shake = Math.max(this.cam.shake, 10);
      this.splash(this.bobber.x, this.bobber.y, 16, '#ffc0a0', 0.85);
    } else if (e.type === 'beat' || e.type === 'step') {
      this.bobber.dip = 16;
      this.ring(this.bobber.x, this.bobber.y, 0.9);
      this.splash(this.bobber.x, this.bobber.y, 5, '#e8fdff', 0.5);
    } else if (e.type === 'beatHit') {
      this.sparkle(this.bobber.x, this.bobber.y - 40, 6, '#fff27a');
    } else if (e.type === 'surge') {
      this.cam.shake = 16;
      this.splash(this.bobber.x, this.bobber.y, 30, '#ffffff', 1.3);
      this.ring(this.bobber.x, this.bobber.y, 1.8);
    } else if (e.type === 'breakaway') {
      this.cam.shake = 20; this.flash = Math.max(this.flash, 0.35);
      const b = this.bobber;
      this.jump = { t: 0, dur: 1.1, x: b.x, y: b.y + 10, dir: Math.random() < 0.5 ? -1 : 1, big: true };
      this.splash(b.x, b.y, 40, '#ffffff', 1.4);
    } else if (e.type === 'stage') {
      this.cam.shake = 12;
      this.sparkle(this.bobber.x, this.bobber.y - 20, 30, '#ffd23a');
    } else if (e.type === 'lunge') {
      this.cam.shake = 18;
      this.splash(this.bobber.x, this.bobber.y, 20, '#ffffff', 1.1);
    } else if (e.type === 'dodge') {
      // A clean read should feel like the line snaps free of danger, not just a counter tick.
      this.cam.shake = Math.max(this.cam.shake, 7);
      this.splash(this.bobber.x, this.bobber.y, 24, '#b9fff0', 0.9);
      this.ring(this.bobber.x, this.bobber.y, 1.55);
      this.sparkle(this.bobber.x, this.bobber.y - 34, 22, '#8df28a');
    } else if (e.type === 'secret') {
      this.flash = Math.max(this.flash, 0.5);
    } else if (e.type === 'missedBite') {
      this.ring(this.bobber.x, this.bobber.y, 0.9);
    } else if (e.type === 'note') {
      const pos = NOTE_POS[e.detail.note];
      if (pos) this.sparkleWorld = { spot: game.spot.id, sx: pos[0], sy: pos[1], t: 0 };
    }
  }

  splash(x, y, n, color, power = 1) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = (180 + Math.random() * 420) * power;
      this.particles.push({ kind: 'drop', x, y, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp, life: 0, max: 0.6 + Math.random() * 0.6, size: 3 + Math.random() * 5, color, floor: y + 6 });
    }
  }

  sparkle(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.283, sp = 80 + Math.random() * 380;
      this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, life: 0, max: 0.8 + Math.random() * 0.9, size: 10 + Math.random() * 22, color });
    }
  }

  ring(x, y, scale = 1) { this.ripples.push({ x, y, t: 0, dur: 1.1, s: scale }); }

  // ----- coordinate helpers -----

  /** Sets the transform for a layer at depth d (0 = sky, 1 = foreground). Draw in "layer x" = W/2 + worldX*d. */
  layerX(worldX, d) { return W / 2 + worldX * d; }

  // ----- main render -----

  render(game, dt, input = {}) {
    this.t += dt;
    const t = this.t;
    const g = this.ctx;
    const time = game.timeOfDay;
    const weather = game.state.weather;
    const phase = game.phase;
    const spotId = game.spot.id;
    this.camX = input.camX ?? this.camX;
    this.gate = input.gate ?? null;
    this.walk = lerp(this.walk, clamp(Math.abs(input.walkSpeed || 0), 0, 1), 1 - Math.exp(-dt * 8));
    this.walkPhase += dt * this.walk * 9;

    const key = `${time}|${weather}|${this.canvas.width}`;
    if (key !== this.gradeKey) {
      if (this.gradeKey && !this.reducedMotion) {
        const snap = this.fade?.canvas && this.fade.canvas.width === this.canvas.width ? this.fade.canvas : makeCanvas(this.canvas.width, this.canvas.height);
        snap.getContext('2d').drawImage(this.canvas, 0, 0);
        this.fade = { canvas: snap, a: 1 };
      }
      this.gradeKey = key;
      if (this.grades.size > 60) this.grades.clear();
    }

    // camera
    const drift = this.reducedMotion ? 0 : 1;
    this.cam.x = lerp(this.cam.x, (input.px || 0) + Math.sin(t * 0.13) * 0.25 * drift, 1 - Math.exp(-dt * 2.5));
    this.cam.y = lerp(this.cam.y, (input.py || 0) + Math.cos(t * 0.11) * 0.2 * drift, 1 - Math.exp(-dt * 2.5));
    const fighting = phase === PHASES.FIGHT;
    const targetZoom = fighting ? 1.05 : phase === PHASES.BITE ? 1.025 : phase === PHASES.CAUGHT ? 1.03 : 1;
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 1 - Math.exp(-dt * 1.8));
    if (fighting && game.fight) this.cam.shake = Math.max(this.cam.shake, game.fight.tension > 0.85 ? (game.fight.tension - 0.85) * 40 : 0);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
    const shake = this.reducedMotion ? 0 : this.cam.shake;
    this.sx = (Math.random() - 0.5) * shake;
    this.sy = (Math.random() - 0.5) * shake;
    this.bobY = this.reducedMotion ? 0 : Math.abs(Math.sin(this.walkPhase)) * -6 * this.walk;
    this.s = this.px * this.cam.zoom * 1.03;
    // while fishing, the tackle area is at the spot; the camera is parked there
    if (phase === PHASES.IDLE) this.anchorX = null;
    const anchor = phase !== PHASES.IDLE && this.anchorX != null ? this.anchorX : this.camX;
    const spotOff = anchor - this.camX;
    void spotId;
    const disc = game.state.discovered;
    if (disc.length !== this.discLen) { this.discLen = disc.length; this.revealed = new Set(disc.filter((id) => SPOT_BY[id]?.secret)); }
    this.moonPhase = game.moon ?? 3;
    const eq = game.state.equip || {};
    this.look = { style: RODS[eq.rod]?.style || 'wood', skin: eq.skin, bobber: eq.bobber, line: eq.line, lure: eq.lure };
    this.weatherNow = game.state.weather;
    this.clues = ['sandbar', 'cave', 'wreck'].filter((id) => game.secretVisible?.(id));
    const focusX = fighting ? this.bobber.x + spotOff * 0.62 : W / 2, focusY = fighting ? this.bobber.y : H / 2;
    this.ox = W / 2 - (focusX - W / 2) * (this.cam.zoom - 1) * 0.6;
    this.oy = H / 2 - (focusY - H / 2) * (this.cam.zoom - 1) * 0.6;
    const cw = this.canvas.width, ch = this.canvas.height;
    const s = this.s;
    /** Layer transform at depth d: draw things at W/2 + worldX*d (see layerX). */
    const base = (d, ctx = g) => {
      ctx.setTransform(s, 0, 0, s,
        cw / 2 - this.ox * s + (this.sx - this.cam.x * d * 46 - this.camX * d) * s,
        ch / 2 - this.oy * s + (this.sy + this.bobY * d - this.cam.y * d * 16) * s);
    };
    this.base = base;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    // ---- far layers into an offscreen canvas (reused for the reflection) ----
    const f = this.far.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, cw, ch);
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-over';
    // sky does not scroll with walking (it is infinitely far), only a touch of pointer parallax
    f.setTransform(s, 0, 0, s, cw / 2 - this.ox * s + (this.sx - this.cam.x * 2) * s, ch / 2 - this.oy * s + (this.sy - this.cam.y * 0.6) * s);
    this.drawSky(f, time, weather, t);
    this.drawFar(f, base, time, weather, t);

    g.drawImage(this.far, 0, 0);

    // ---- water ----
    base(0.55);
    this.drawWater(g, base, time, weather, t, spotOff, game);
    this.drawDeepDropShelf(g, base, t);
    base(0.62);
    this.drawWildlife(g, t, weather, game);

    this.drawSecretsMid(g, base, game, t);
    this.drawGrottoLandmarks(g, base, t);
    this.drawFrenzy(g, base, game, t, dt);

    // ---- near shore, back to front ----
    const near = this.collectNear();
    for (const item of near) this.drawItem(g, base, item, time, weather, t, 'mid');

    // gameplay at the current spot
    base(0.62);
    g.translate(spotOff * 0.62, 0);
    this.drawRipples(g, dt, time);
    this.drawGoopUnder(g, game, t);
    g.translate(-spotOff * 0.62, 0);

    for (const item of near) this.drawItem(g, base, item, time, weather, t, 'props');
    this.drawBoard(g, base, game, t);
    this.drawClues(g, base, t);
    this.drawNotes(g, base, game, t);
    this.drawGate(g, base, game, t, false);

    // tackle is held by the player: anchored to the screen, not the world
    g.setTransform(s, 0, 0, s, cw / 2 - this.ox * s + this.sx * s, ch / 2 - this.oy * s + (this.sy + this.bobY) * s);
    g.save();
    g.translate(spotOff * 0.62, 0);
    this.drawTackleWater(g, game, dt, t);
    this.drawParticles(g, dt);
    this.drawJump(g, game, dt);
    g.restore();
    this.drawRodAndLine(g, game, dt, t, spotOff * 0.62);
    g.save(); g.translate(spotOff * 0.62, 0); this.drawReveal(g, game, dt, t); g.restore();

    // foreground framing plants
    for (const item of near) this.drawItem(g, base, item, time, weather, t, 'fg');
    this.drawGate(g, base, game, t, true);
    g.setTransform(s, 0, 0, s, cw / 2 - this.ox * s + this.sx * s, ch / 2 - this.oy * s + (this.sy + this.bobY) * s);
    this.drawBuddy(g, game, dt, t, input);

    // atmosphere
    this.drawFireflies(g, base, time, weather, t);
    this.drawMotes(g, base, t, time);
    g.setTransform(s, 0, 0, s, cw / 2 - this.ox * s + this.sx * s, ch / 2 - this.oy * s + this.sy * s);
    if (weather === 'rain' || weather === 'storm') this.drawRain(g, dt, t, weather === 'storm');
    if (weather === 'fog') this.drawFogBand(g, t * 1.4, 0.3, 660, this.camX * 0.9);
    if (weather === 'storm') this.drawStorm(g, dt);

    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrade(g, time, weather, phase, game);
    if (this.fade && !this.fade.done) {
      this.fade.a -= dt / 1.4;
      if (this.fade.a <= 0) this.fade.done = true;
      else { g.globalAlpha = ease(this.fade.a); g.drawImage(this.fade.canvas, 0, 0); g.globalAlpha = 1; }
    }
  }

  // ----- sky -----

  drawSky(g, time, weather, t) {
    const sky = SKIES[time] || SKIES.Night;
    const stops = weather === 'storm' ? STORM_SKY : sky.stops;
    const top = -60, bottom = HZ + 60;
    const gr = g.createLinearGradient(0, top, 0, bottom);
    gr.addColorStop(0, stops[0]); gr.addColorStop(0.35, stops[1]); gr.addColorStop(0.75, stops[2]); gr.addColorStop(1, stops[3]);
    g.fillStyle = gr; g.fillRect(-160, top, W + 320, bottom - top + 40);
    const cloudy = weather === 'storm' ? 1 : weather === 'rain' ? 0.75 : weather === 'fog' ? 0.5 : 0;
    const starA = sky.stars * (1 - cloudy * 0.9);
    if (starA > 0.02) {
      g.globalCompositeOperation = 'lighter';
      for (const d of this.dust) { g.globalAlpha = d.a * starA * 0.5; g.fillStyle = '#b8c8ff'; g.fillRect(d.x, d.y, d.r * 2, d.r * 2); }
      for (const st of this.stars) {
        if (st.y > HZ - 40) continue;
        g.globalAlpha = starA * (0.45 + 0.55 * Math.sin(t * st.sp + st.tw) ** 2);
        const r = st.r * 3.2;
        g.drawImage(this.dot, st.x - r, st.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    const bodyX = this.moonX(), bodyY = lerp(40, HZ, sky.sunY);
    if (weather !== 'storm') {
      const isMoon = time === 'Night';
      const full = isMoon && this.moonPhase === 3;
      const R = isMoon ? (full ? 88 : 68) : time === 'Day' ? 70 : 92;
      const haloA = (1 - cloudy * 0.7) * (full ? 1.6 : isMoon && this.moonPhase === 0 ? 0.4 : 1);
      g.globalCompositeOperation = 'lighter';
      const halo = g.createRadialGradient(bodyX, bodyY, R * 0.6, bodyX, bodyY, R * 6);
      halo.addColorStop(0, hexA(sky.sun, 0.55 * haloA)); halo.addColorStop(0.3, hexA(sky.sun, 0.16 * haloA)); halo.addColorStop(1, hexA(sky.sun, 0));
      g.fillStyle = halo; g.fillRect(bodyX - R * 6, bodyY - R * 6, R * 12, R * 12);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1 - cloudy * 0.6;
      if (isMoon) {
        const mg = g.createRadialGradient(bodyX - R * 0.3, bodyY - R * 0.3, R * 0.1, bodyX, bodyY, R);
        mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.7, '#dce9ff'); mg.addColorStop(1, '#a9c0e8');
        g.fillStyle = mg; g.beginPath(); g.arc(bodyX, bodyY, R, 0, 6.29); g.fill();
        g.fillStyle = 'rgba(120,145,190,.28)';
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, -0.45, 0.1], [-0.15, 0.4, 0.13], [0.42, -0.25, 0.09]]) {
          g.beginPath(); g.arc(bodyX + cx * R, bodyY + cy * R, cr * R, 0, 6.29); g.fill();
        }
        // phase shadow (5-day cycle: new, crescent, half, full, waning)
        const dx = { 0: 0.08, 1: 0.45, 2: 1.0, 4: -1.0 }[this.moonPhase];
        if (dx != null) {
          g.save(); g.beginPath(); g.arc(bodyX, bodyY, R + 1, 0, 6.29); g.clip();
          g.fillStyle = hexA(stops[1], 0.93);
          g.beginPath(); g.arc(bodyX - dx * R, bodyY - dx * R * 0.12, R * 1.02, 0, 6.29); g.fill();
          g.restore();
        }
      } else {
        const sg = g.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, R);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.55, sky.sun); sg.addColorStop(1, hexA(sky.sun, 0.9));
        g.fillStyle = sg; g.beginPath(); g.arc(bodyX, bodyY, R, 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
    }
    const [lit, shade] = weather === 'storm' ? ['#6b7890', '#1a2030'] : sky.cloud;
    const count = 4 + Math.round(cloudy * 3);
    for (let i = 0; i < count; i++) {
      const c = this.clouds[i];
      const span = W + 900;
      const x = ((c.x + t * c.v - this.camX * 0.02) % span + span) % span - 450;
      const spr = this.cloudSprites[c.sprite];
      const w = spr.width * c.s * (1 + cloudy * 0.6), h = spr.height * c.s * (1 + cloudy * 0.4);
      g.globalAlpha = (time === 'Day' ? 0.85 : 0.6) * (0.6 + cloudy * 0.5);
      g.drawImage(this.tintCloud(c.sprite, lit, shade), x, c.y * (1 - cloudy * 0.3), w, h);
    }
    g.globalAlpha = 1;
  }

  /** The moon drifts slowly across the sky as you walk round the pond. */
  moonX() { return 1330 - (this.camX - SPOT_X.dock) * 0.06; }

  tintCloud(i, lit, shade) {
    const id = `cloud${i}|${lit}|${shade}`;
    let c = this.grades.get(id);
    if (c) return c;
    const spr = this.cloudSprites[i];
    c = makeCanvas(spr.width, spr.height);
    const g = c.getContext('2d');
    g.drawImage(spr, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 40, 0, spr.height);
    gr.addColorStop(0, lit); gr.addColorStop(1, shade);
    g.fillStyle = gr; g.fillRect(0, 0, spr.width, spr.height);
    this.grades.set(id, c);
    return c;
  }

  // ----- far scenery (mountains, forest, cliffs) -----

  /** Visible tile indices for a layer at depth d with tiles every `step` layer-pixels. */
  tiles(d, step, x0 = 0, margin = 1400) {
    const left = this.camX * d - W / 2 - margin, right = this.camX * d + W / 2 + margin;
    const out = [];
    for (let i = Math.floor((left - x0) / step); i <= Math.ceil((right - x0) / step); i++) out.push(i);
    return out;
  }

  drawFar(f, base, time, weather, t) {
    // mountains: mirrored tiles so the seams meet
    const M = FAR.mountains;
    const mimg = this.graded('mountains', this.gradeOps(time, weather, 0.2));
    if (mimg) {
      base(M.d, f);
      const mh = M.w * mimg.height / mimg.width;
      for (const i of this.tiles(M.d, M.w, 0, 200)) {
        const x = i * M.w - 20;
        if (i % 2) { f.save(); f.translate(x + M.w, M.y); f.scale(-1, 1); f.drawImage(mimg, 0, 0, M.w, mh); f.restore(); }
        else f.drawImage(mimg, x, M.y, M.w, mh);
      }
    }
    if (weather === 'fog') { base(0.15, f); this.drawFogBand(f, t, 0.5, HZ - 120, this.camX * 0.15); }
    // forest rows
    for (const row of [FAR.forestBack, FAR.forestFront]) {
      const img = this.graded('forest', this.gradeOps(time, weather, row.haze));
      if (!img) continue;
      base(row.d, f);
      const fw = this.a.forest.width * row.s, fh = this.a.forest.height * row.s;
      for (const i of this.tiles(row.d, row.step)) {
        const x = i * row.step - fw * 0.15;
        const flip = this.forestFlip[((i % 64) + 64) % 64];
        if (flip) { f.save(); f.translate(x + fw, row.base - fh); f.scale(-1, 1); f.drawImage(img, 0, 0, fw, fh); f.restore(); }
        else f.drawImage(img, x, row.base - fh, fw, fh);
      }
    }
    // cliffs and waterfalls
    const wimg = this.graded('waterfall', this.gradeOps(time, weather, 0));
    if (wimg) {
      for (const c of FAR.cliffs) {
        const wx = this.layerX(toWorld(c.spot, c.sx, c.d), c.d);
        const ww = this.a.waterfall.width * c.s, wh = this.a.waterfall.height * c.s;
        if (Math.abs(wx + ww / 2 - (W / 2 + this.camX * c.d)) > W + ww) continue;
        base(c.d, f);
        const y = c.base - wh;
        if (c.flip) {
          f.save(); f.translate(wx + ww, y); f.scale(-1, 1); f.drawImage(wimg, 0, 0, ww, wh); this.drawFalls(f, 0, 0, ww, wh, t, time);
          if (c.spot === 'cave') this.drawCaveMouth(f, ww, wh, t);
          f.restore();
        }
        else { f.drawImage(wimg, wx, y, ww, wh); this.drawFalls(f, wx, y, ww, wh, t, time); }
      }
    }
  }

  drawFalls(g, x, y, w, h, t, time) {
    const x0 = x + w * FALLS.fx0, x1 = x + w * FALLS.fx1, y0 = y + h * FALLS.fy0, y1 = y + h * FALLS.fy1;
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.globalCompositeOperation = 'lighter';
    const cols = 22;
    for (let i = 0; i < cols; i++) {
      const cx = x0 + (i + 0.5) / cols * (x1 - x0);
      const speed = 260 + (i * 37) % 120;
      for (let k = 0; k < 3; k++) {
        const yy = y0 + (((t * speed + i * 53 + k * 120) % ((y1 - y0) + 120)) - 60);
        g.globalAlpha = time === 'Day' ? 0.16 : 0.22;
        g.drawImage(this.dot, cx - 4, yy, 8, 70);
      }
    }
    g.restore();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const mx = x0 + (x1 - x0) * (i / 5) + Math.sin(t * 0.8 + i) * 18;
      const my = y1 - 6 + Math.sin(t * 1.3 + i * 2) * 6;
      g.globalAlpha = 0.16;
      g.drawImage(this.dot, mx - 90, my - 40, 180, 80);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ----- water -----

  drawWater(g, base, time, weather, t, spotOff, game = null) {
    const img = this.graded('water', this.gradeOps(time, weather, 0));
    if (!img) return;
    const d = 0.55;
    const top = HZ - 8, h = H - top + 40;
    const strips = this.quality.strips;
    const amp = weather === 'storm' ? 9 : weather === 'rain' ? 6 : 3.5;
    const srcH = img.height / strips;
    const tw = W + 2;
    const tiles = this.tiles(d, tw, 0, 300);
    for (let i = 0; i < strips; i++) {
      const fr = i / strips;
      const yy = top + h * Math.pow(fr, 1.25);
      const yn = top + h * Math.pow((i + 1) / strips, 1.25);
      const off = (Math.sin(t * 1.1 + fr * 22) * 0.7 + Math.sin(t * 0.55 + fr * 9) * 0.5) * amp * (0.25 + fr * 1.5);
      for (const k of tiles) {
        const x = k * tw + off;
        if (k % 2) {
          g.save(); g.translate(x + tw, 0); g.scale(-1, 1);
          g.drawImage(img, 0, i * srcH, img.width, srcH + 0.6, 0, yy, tw, yn - yy + 1);
          g.restore();
        } else g.drawImage(img, 0, i * srcH, img.width, srcH + 0.6, x, yy, tw, yn - yy + 1);
      }
    }
    // screen-space effects below
    const cw = this.canvas.width;
    g.setTransform(this.s, 0, 0, this.s, cw / 2 - this.ox * this.s + this.sx * this.s, this.canvas.height / 2 - this.oy * this.s + this.sy * this.s);
    this.drawReflection(g, time, weather, t);
    const hcol = weather === 'storm' ? STORM_SKY[3] : SKIES[time].stops[3];
    const hz = g.createLinearGradient(0, HZ - 26, 0, HZ + 40);
    hz.addColorStop(0, hexA(hcol, 0)); hz.addColorStop(0.45, hexA(hcol, time === 'Night' ? 0.22 : 0.3)); hz.addColorStop(1, hexA(hcol, 0));
    g.fillStyle = hz; g.fillRect(-160, HZ - 26, W + 320, 66);
    if (weather !== 'storm') {
      g.globalCompositeOperation = 'lighter';
      const n = 70, mx = this.moonX();
      for (let i = 0; i < n; i++) {
        const fr = (i + 0.5) / n;
        const y = HZ + 6 + Math.pow(fr, 1.4) * (H - HZ);
        const spread = 30 + fr * 230;
        const x = mx + Math.sin(i * 12.9898 + t * 0.7) * spread;
        const pulse = Math.max(0, Math.sin(t * 3.1 + i * 1.7));
        g.globalAlpha = pulse * (time === 'Day' ? 0.55 : 0.75) * (1 - fr * 0.6) * (weather === 'clear' ? 1 : 0.5);
        const w = 14 + fr * 46, hh = 2 + fr * 4;
        g.drawImage(this.dot, x - w / 2, y - hh / 2, w, hh);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // caustics, scrolling with the water
    const caus = this.a.caustics;
    if (caus) {
      base(d);
      const frame = Math.floor(t * 9) % 8, fw = caus.width / 8;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = time === 'Day' ? 0.12 : 0.2;
      const tile = 420;
      for (let y = HZ + 140; y < H + 40; y += tile * 0.55) {
        const sc = 0.55 + (y - HZ) / (H - HZ) * 0.7;
        const step = tile * sc;
        for (const k of this.tiles(d, step, 0, 400)) g.drawImage(caus, frame * fw, 0, fw, caus.height, k * step + ((t * 12) % tile), y, step, step * 0.45);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // Habitat events now leave a localized signature on the existing water surface.
    // This reuses the event resolver and water pass; it creates no particles or persistent state.
    const interactions = game?.event?.interactions || {};
    base(d);
    g.save();
    g.beginPath(); g.rect(-W * 2, HZ - 10, W * 4, H - HZ + 60); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (const spot of SPOTS) {
      const cue = habitatInteractionWaterCue(interactions[spot.id]);
      if (!cue || Math.abs(SPOT_X[spot.id] - this.camX) > (W + cue.spread * 2) / d) continue;
      const x = this.layerX(SPOT_X[spot.id], d);
      const y = HZ + 108;
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.7 + SPOTS.indexOf(spot) * 0.83);
      const alpha = (0.07 + cue.intensity * 0.12) * pulse;
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = cue.color;
      g.fillStyle = cue.color;
      g.lineWidth = 2;
      if (cue.style === 'cluster' || cue.style === 'upwell') {
        const rings = cue.style === 'upwell' ? 4 : 3;
        for (let i = 0; i < rings; i++) {
          const radius = 15 + i * (cue.spread / rings) + ((t * (cue.style === 'upwell' ? 20 : 9)) % 18);
          g.beginPath(); g.ellipse(x, y, radius, radius * 0.2, 0, 0, Math.PI * 2); g.stroke();
        }
      } else if (cue.style === 'orbit' || cue.style === 'vortex') {
        for (let i = 0; i < 4; i++) {
          const phase = t * (cue.style === 'vortex' ? 1.15 : 0.62) + i * Math.PI / 2;
          const radius = cue.style === 'vortex' ? cue.spread * 0.55 : cue.spread * 0.7;
          g.beginPath();
          g.ellipse(x, y, radius, radius * 0.23, phase * 0.18,
            phase, phase + Math.PI * (cue.style === 'vortex' ? 0.72 : 0.9));
          g.stroke();
        }
      } else if (cue.style === 'drift' || cue.style === 'stream') {
        for (let i = 0; i < 6; i++) {
          const yy = y - 28 + i * 11;
          const shift = cue.style === 'stream' ? ((t * 58 + i * 31) % 90) - 45 : Math.sin(t * 0.5 + i) * 30;
          g.beginPath();
          g.moveTo(x - cue.spread * 0.55 + shift, yy);
          g.quadraticCurveTo(x + shift, yy + Math.sin(t + i) * 5,
            x + cue.spread * 0.55 + shift, yy - 2);
          g.stroke();
        }
      } else if (cue.style === 'prism') {
        for (let i = 0; i < 7; i++) {
          const angle = t * 0.22 + i * Math.PI * 2 / 7;
          const reach = cue.spread * (0.32 + 0.12 * Math.sin(t * 2 + i));
          const sx = x + Math.cos(angle) * reach;
          const sy = y + Math.sin(angle) * reach * 0.2;
          g.beginPath(); g.moveTo(sx - 4, sy); g.lineTo(sx + 4, sy); g.moveTo(sx, sy - 4); g.lineTo(sx, sy + 4); g.stroke();
        }
      } else if (cue.style === 'bloom') {
        for (let i = 0; i < 8; i++) {
          const phase = (t * 0.32 + i / 8) % 1;
          const bx = x + Math.sin(i * 2.3 + t * 0.4) * cue.spread * 0.55;
          const by = y - phase * 72;
          g.globalAlpha = alpha * (1 - phase) * 1.4;
          g.beginPath(); g.arc(bx, by, 2 + phase * 3, 0, Math.PI * 2); g.fill();
        }
      } else if (cue.style === 'tide') {
        for (let i = 0; i < 4; i++) {
          const yy = y - 18 + i * 12;
          g.beginPath();
          g.moveTo(x - cue.spread, yy + Math.sin(t * 0.35 + i) * 5);
          g.bezierCurveTo(x - cue.spread * 0.35, yy - 10, x + cue.spread * 0.25, yy + 10,
            x + cue.spread, yy + Math.sin(t * 0.35 + i + 1) * 5);
          g.stroke();
        }
      } else if (cue.style === 'wake') {
        for (let i = 0; i < 3; i++) {
          const offset = i * 12 - 12;
          g.beginPath();
          g.moveTo(x - cue.spread * 0.7, y + offset);
          g.quadraticCurveTo(x - 8, y + offset + Math.sin(t * 1.4 + i) * 16,
            x + cue.spread * 0.7, y + offset - 4);
          g.stroke();
        }
      }
      g.restore();
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    // darker water out over the Deep Drop
    const deepW = clamp(1 - Math.abs(this.camX - SPOT_X.deep) / SPOT_GAP, 0, 1);
    if (deepW > 0) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      const [, hy] = this.toScreenStage(0, HZ);
      const gr = g.createLinearGradient(0, hy, 0, this.canvas.height);
      gr.addColorStop(0, `rgba(20,10,70,${0.15 * deepW})`); gr.addColorStop(1, `rgba(10,5,40,${0.45 * deepW})`);
      g.fillStyle = gr; g.fillRect(0, hy, this.canvas.width, this.canvas.height - hy);
    }
    void spotOff;
  }

  /**
   * The Deep Drop needs a readable depth change, not another generic rock prop.
   * This is a static, camera-anchored underwater shelf in the existing water pass;
   * wildlife, encounters and the event simulation remain untouched.
   */
  drawDeepDropShelf(g, base, t) {
    const d = 0.55;
    if (Math.abs(SPOT_X.deep - this.camX) > W * 1.55 / d) return;
    base(d);
    const x = this.layerX(SPOT_X.deep, d);
    g.save();
    g.beginPath(); g.rect(-W * 2, HZ + 8, W * 4, H - HZ + 80); g.clip();

    const basin = g.createLinearGradient(0, HZ + 260, 0, H + 120);
    basin.addColorStop(0, 'rgba(13,20,67,0)');
    basin.addColorStop(0.28, 'rgba(12,17,59,0.18)');
    basin.addColorStop(1, 'rgba(4,7,31,0.48)');
    g.fillStyle = basin;
    g.beginPath();
    g.moveTo(x - 900, H + 100);
    g.lineTo(x - 900, HZ + 420);
    g.bezierCurveTo(x - 640, HZ + 365, x - 500, HZ + 265, x - 260, HZ + 350);
    g.bezierCurveTo(x - 80, HZ + 420, x + 40, HZ + 255, x + 250, HZ + 300);
    g.bezierCurveTo(x + 470, HZ + 350, x + 650, HZ + 390, x + 900, HZ + 330);
    g.lineTo(x + 900, H + 100);
    g.closePath(); g.fill();

    // A restrained rim line gives the shelf a visible drop-off without obscuring fish.
    g.strokeStyle = 'rgba(117,137,226,0.16)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(x - 900, HZ + 420);
    g.bezierCurveTo(x - 640, HZ + 365, x - 500, HZ + 265, x - 260, HZ + 350);
    g.bezierCurveTo(x - 80, HZ + 420, x + 40, HZ + 255, x + 250, HZ + 300);
    g.bezierCurveTo(x + 470, HZ + 350, x + 650, HZ + 390, x + 900, HZ + 330);
    g.stroke();

    // Dim vertical pressure traces make the central basin feel deeper.
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const px = x - 300 + i * 150;
      const pulse = 0.45 + 0.25 * Math.sin(t * 0.55 + i * 1.4);
      g.globalAlpha = pulse * 0.12;
      g.strokeStyle = '#8292ff';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(px, HZ + 390);
      g.quadraticCurveTo(px + Math.sin(t * 0.35 + i) * 16, HZ + 560, px - 8, H + 30);
      g.stroke();
    }
    g.restore();
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  /**
   * Glowshroom Grotto's bank was relying almost entirely on generic framing plants
   * and ambient motes. These small, fixed clusters give the habitat a clear landmark
   * silhouette while reusing the renderer's cached glow texture.
   */
  drawGrottoLandmarks(g, base, t) {
    const d = 0.88;
    const offsets = [-470, -120, 300, 610];
    if (Math.abs(SPOT_X.grotto - this.camX) > W * 1.5 / d) return;
    base(d);

    const mushroom = (x, y, scale, color, phase) => {
      const stemW = 9 * scale, stemH = 34 * scale;
      const capW = 27 * scale, capH = 15 * scale;
      const glow = 42 * scale;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.16 + Math.max(0, Math.sin(t * 1.7 + phase)) * 0.13;
      g.drawImage(this.tintGlow(color), x - glow, y - stemH - glow * 0.75, glow * 2, glow * 1.6);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;

      g.fillStyle = 'rgba(35,24,58,0.78)';
      g.beginPath(); g.ellipse(x, y + 2, capW * 0.9, 5 * scale, 0, 0, Math.PI * 2); g.fill();
      const stem = g.createLinearGradient(x - stemW, 0, x + stemW, 0);
      stem.addColorStop(0, '#6b55a0'); stem.addColorStop(0.5, '#e4d5ff'); stem.addColorStop(1, '#59417f');
      g.fillStyle = stem;
      g.fillRect(x - stemW * 0.55, y - stemH, stemW * 1.1, stemH);
      const cap = g.createRadialGradient(x - capW * 0.25, y - stemH - capH * 0.35, 2, x, y - stemH, capW);
      cap.addColorStop(0, '#f1dcff'); cap.addColorStop(0.35, color); cap.addColorStop(1, '#39245f');
      g.fillStyle = cap;
      g.beginPath();
      g.moveTo(x - capW, y - stemH + 2 * scale);
      g.quadraticCurveTo(x - capW * 0.72, y - stemH - capH * 1.25, x, y - stemH - capH);
      g.quadraticCurveTo(x + capW * 0.82, y - stemH - capH * 1.1, x + capW, y - stemH + 2 * scale);
      g.quadraticCurveTo(x, y - stemH + capH * 0.48, x - capW, y - stemH + 2 * scale);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.arc(x + i * capW * 0.42, y - stemH - capH * 0.28, 2.1 * scale, 0, Math.PI * 2); g.fill();
      }
      g.globalAlpha = 1;
    };

    for (let i = 0; i < offsets.length; i++) {
      const worldX = SPOT_X.grotto + offsets[i];
      if (Math.abs(worldX - this.camX) > W * 1.25 / d) continue;
      const x = this.layerX(worldX, d);
      const baseY = H - 34 - (i % 2) * 16;
      mushroom(x - 22, baseY, 0.78 + (i % 3) * 0.12, i % 2 ? '#9b7bff' : '#67e9d2', i * 1.7);
      mushroom(x + 25, baseY - 4, 0.52 + (i % 2) * 0.1, '#b58cff', i * 2.1 + 0.8);
    }
  }

  /**
   * Ambient schools now reveal species that are genuinely eligible in the habitat they occupy.
   * Sightings are visual clues only: the existing encounter pool remains the sole eligibility
   * authority, and this renderer never consumes game RNG or modifies catch state.
   */
  drawWildlife(g, t, weather, game) {
    const d = 0.62;
    const span = WORLD_MAX - WORLD_MIN + 2200;
    const areaActivity = game.ecosystemStatus?.().level ?? 0;
    const gameEvent = game.event || {};
    const state = game.state || {};
    const timeOfDay = game.timeOfDay || 'Day';
    const day = Number.isFinite(state.day) ? state.day : 0;
    const sightingBait = BAITS[state.bait] && (state.bait === 'worm' || state.baits?.[state.bait] > 0)
      ? state.bait : 'worm';
    const sightingLure = Number.isFinite(state.gear?.lure) ? state.gear.lure : 0;
    const sightingMods = typeof game.mods === 'function' ? game.mods() : null;
    const sightingWeightKey = JSON.stringify({ bait: sightingBait, lure: sightingLure,
      mods: sightingMods, trackedGoop: state.trackedGoop || null });
    const frenzySpot = gameEvent.frenzy ?? state.frenzy ?? null;
    const areaFrenzy = frenzySpot === game.spot?.id;
    const surfaceFeeding = clamp(areaActivity / 3 + (areaFrenzy ? 0.45 : 0), 0, 1);
    const weatherVisibility = weather === 'storm' ? 0.48 : weather === 'fog' ? 0.62 : 1;
    this.currentSighting = null;
    let nearestSightingDistance = Infinity;

    for (const school of this.wildlife) {
      const movement = school.movement || 'cruise';
      const habitatMovement = movement === 'dart' ? 1.7 : movement === 'surge' ? 1.25
        : movement === 'drift' ? 0.58 : movement === 'weave' ? 1.05 : 0.82;
      // Keep each school's world-space trajectory independent of changing species sightings;
      // species motion changes its local swim rhythm, not its absolute position.
      const initialSpeed = school.speed * habitatMovement * (1 + surfaceFeeding * 0.3);
      let wx = WORLD_MIN - 1100 + (((school.x - (WORLD_MIN - 1100) + t * initialSpeed) % span) + span) % span;

      // Resolve the nearest habitat before selecting a species, so the sighting stays local.
      const habitat = SPOTS.reduce((best, spot) =>
        Math.abs(SPOT_X[spot.id] - wx) < Math.abs(SPOT_X[best.id] - wx) ? spot : best, SPOTS[0]);
      const interaction = gameEvent.interactions?.[habitat.id] || null;
      const interactionMotion = habitatInteractionMotion(interaction, t, school.phase, school.id);
      const localActivity = typeof game.activityAt === 'function' ? game.activityAt(habitat.id) : areaActivity;
      const localFrenzy = frenzySpot === habitat.id;
      const visitorId = gameEvent.visitor?.spot === habitat.id ? gameEvent.visitor.goop : '';
      const habitatUnlocked = typeof game.spotUnlocked !== 'function' || game.spotUnlocked(habitat.id);
      const sightingKey = [
        habitat.id, habitatUnlocked ? 1 : 0, weather, timeOfDay, localActivity, localFrenzy ? 1 : 0,
        visitorId, gameEvent.fullMoon ? 1 : 0, gameEvent.sleeper ? 1 : 0,
        interaction?.id || '', day, sightingWeightKey,
      ].join('|');

      // Locked and undiscovered habitats remain anonymous. For open habitats, use the exact
      // same candidate rules as fishing, including weather/time gates, visitors and quest state.
      if (school.sightingKey !== sightingKey) {
        const candidates = habitatUnlocked ? encounterPool({
          spot: habitat,
          weather,
          time: timeOfDay,
          bait: sightingBait,
          lure: sightingLure,
          event: { ...gameEvent, activity: state.activity || {} },
          mods: sightingMods,
          trackedGoop: state.trackedGoop || null,
        }) : [];
        school.sighting = resolveWildlifeSighting(candidates, `school:${school.id ?? 0}|${sightingKey}`, habitatUnlocked);
        school.sightingKey = sightingKey;
      }

      const species = school.sighting;
      const profile = species ? wildlifeDisplayProfile(species) : null;

      // Walking startles nearby schools. Their alert lingers briefly after the angler stops,
      // then fades so the pond naturally settles instead of snapping back immediately.
      const distanceFromPlayer = wx - this.camX;
      const proximity = clamp(1 - Math.abs(distanceFromPlayer) / 720, 0, 1);
      const immediateDisturbance = proximity * clamp(this.walk * 1.5, 0, 1);
      if (!Number.isFinite(school.alertUntil)) school.alertUntil = 0;
      if (immediateDisturbance > 0.08) school.alertUntil = Math.max(school.alertUntil, t + 2.4);
      const lingeringAlert = clamp((school.alertUntil - t) / 2.4, 0, 1);
      const disturbance = Math.max(immediateDisturbance, lingeringAlert * 0.58);

      const needs = wildlifeNeeds(school, t);
      const behavior = evaluateWildlifeBehavior({
        ...needs,
        activity: localActivity,
        frenzy: localFrenzy,
        disturbance,
        fidelity: school.fidelity,
        time: timeOfDay,
      });
      if (behavior.state === 'fleeing') {
        wx += Math.sign(distanceFromPlayer || 1) * disturbance * 115;
      } else {
        const homeX = SPOT_X[school.homeSpot] ?? wx;
        const returnedX = wx + habitatReturnOffset({
          worldX: wx,
          homeX,
          hunger: needs.hunger,
          fidelity: school.fidelity,
          disturbance,
          activity: localActivity,
          frenzy: localFrenzy,
        });
        // Keep the species attached to the habitat whose encounter pool identified it.
        // A school may leave its home patch naturally, but a home-seeking correction must
        // not push it across a neighbouring habitat boundary while retaining the old identity.
        const returnedHabitat = SPOTS.reduce((best, spot) =>
          Math.abs(SPOT_X[spot.id] - returnedX) < Math.abs(SPOT_X[best.id] - returnedX) ? spot : best, SPOTS[0]);
        if (returnedHabitat.id === habitat.id) wx = returnedX;
      }

      // The interaction may nudge a school, but never across its encounter habitat boundary.
      const driftedX = wx + interactionMotion.driftX;
      const driftHabitat = SPOTS.reduce((best, spot) =>
        Math.abs(SPOT_X[spot.id] - driftedX) < Math.abs(SPOT_X[best.id] - driftedX) ? spot : best, SPOTS[0]);
      if (driftHabitat.id === habitat.id) wx = driftedX;

      const x = this.layerX(wx, d);
      if (x < -180 || x > W + 180) continue;
      const playerDistance = Math.abs(wx - this.camX);
      if (species && behavior.state !== 'fleeing' && playerDistance <= 640
        && playerDistance < nearestSightingDistance) {
        nearestSightingDistance = playerDistance;
        this.currentSighting = {
          id: species.id, name: species.name, rarity: species.rarity,
          color: species.color, habitatName: habitat.name, behavior: behavior.state,
        };
      }
      const swaySize = (movement === 'weave' ? 15 : movement === 'drift' ? 5 : 9)
        * behavior.sway * interactionMotion.sway * (profile?.sway ?? 1);
      const sway = Math.sin(t * (habitatMovement * behavior.motionRate * interactionMotion.speed * (profile?.speed ?? 1)
        + behavior.feeding * 0.55 + disturbance * 1.4) + school.phase)
        * (swaySize - behavior.feeding * 2 + disturbance * 5);
      const verticalStyle = profile?.vertical ?? 1;
      const y = school.y + interactionMotion.vertical + sway * verticalStyle - behavior.feeding * (profile ? 5 : 2);
      const depth = clamp((y - HZ) / (H - HZ), 0, 1);
      const scale = school.size * (0.58 + depth * 0.62);
      const dir = behavior.state === 'fleeing'
        ? (distanceFromPlayer >= 0 ? 1 : -1)
        : (Math.sin(t * (0.16 + behavior.feeding * 0.12) + school.phase) > 0.72 ? -1 : 1);
      const visibility = weatherVisibility * (0.82 + behavior.feeding * 0.18);
      const fishColor = species?.color || school.color;
      const bodyLength = 28 * (profile?.bodyLength ?? 1);
      const bodyHeight = 14 * (profile?.bodyHeight ?? 1);
      const tailSpan = profile?.tailSpan ?? 1;
      g.save();
      g.translate(x, y);
      g.scale(dir * scale, scale);

      for (let i = 0; i < school.count; i++) {
        // Feeding schools tighten together; fleeing schools spread apart.
        const spacing = 22 * behavior.spacing * interactionMotion.spacing - behavior.feeding * 6;
        const orbit = interactionMotion.orbitRadius;
        const orbitPhase = t * interactionMotion.orbitRate + school.phase + i * 0.58;
        const fx = -i * spacing - Math.sin(t * (1.3 + behavior.feeding) + i + school.phase)
          * (5 + behavior.feeding * 2) + Math.cos(orbitPhase) * orbit;
        const fy = Math.sin(t * (1.7 + behavior.feeding * 0.8) + i * 1.8 + school.phase)
          * (5 - behavior.feeding * 1.5) + Math.sin(orbitPhase) * orbit * 0.46;
        g.save();
        g.translate(fx, fy);
        g.fillStyle = fishColor;
        g.globalAlpha = visibility * (0.16 + depth * 0.17 + behavior.feeding * 0.035);

        // Tail, body and fins form a repeatable silhouette unique to the selected species.
        g.beginPath();
        g.moveTo(bodyLength * 0.28, 0);
        const tailBeat = Math.sin(t * (2.1 + (profile?.speed ?? 1) * 1.3) + i + school.phase) * bodyHeight * 0.055;
        g.lineTo(bodyLength * (0.42 + tailSpan * 0.18), -bodyHeight * tailSpan * 0.58 + tailBeat);
        g.quadraticCurveTo(bodyLength * 0.48, 0,
          bodyLength * (0.42 + tailSpan * 0.18), bodyHeight * tailSpan * 0.58 + tailBeat);
        g.closePath();
        g.fill();

        g.beginPath();
        g.moveTo(-bodyLength * 0.48, 0);
        g.quadraticCurveTo(-bodyLength * 0.34, -bodyHeight * 0.78, bodyLength * 0.08, -bodyHeight * 0.52);
        g.quadraticCurveTo(bodyLength * 0.36, -bodyHeight * 0.24, bodyLength * 0.34, 0);
        g.quadraticCurveTo(bodyLength * 0.36, bodyHeight * 0.24, bodyLength * 0.08, bodyHeight * 0.52);
        g.quadraticCurveTo(-bodyLength * 0.34, bodyHeight * 0.78, -bodyLength * 0.48, 0);
        g.closePath();
        g.fill();

        const dorsal = profile?.dorsalFin ?? 0.5;
        g.beginPath();
        g.moveTo(-bodyLength * 0.08, -bodyHeight * 0.43);
        g.quadraticCurveTo(bodyLength * 0.02, -bodyHeight * (0.58 + dorsal * 0.42),
          bodyLength * 0.18, -bodyHeight * 0.35);
        g.closePath();
        g.fill();

        const lowerFin = profile?.lowerFin ?? 0.3;
        g.beginPath();
        g.moveTo(-bodyLength * 0.02, bodyHeight * 0.42);
        g.quadraticCurveTo(bodyLength * 0.08, bodyHeight * (0.52 + lowerFin * 0.32),
          bodyLength * 0.2, bodyHeight * 0.34);
        g.closePath();
        g.fill();

        g.globalAlpha = visibility * (0.2 + depth * 0.18 + behavior.feeding * 0.04);
        g.fillStyle = '#e8fbff';
        g.beginPath();
        g.arc(-bodyLength * 0.3, -bodyHeight * 0.12, Math.max(0.75, 1.05 * (profile?.bodyHeight ?? 1)), 0, 6.29);
        g.fill();

        if (profile?.glow) {
          g.globalAlpha = visibility * profile.glow;
          g.strokeStyle = fishColor;
          g.lineWidth = 1.15;
          g.beginPath();
          g.ellipse(-bodyLength * 0.04, 0, bodyLength * 0.38, bodyHeight * 0.56, 0, 0, Math.PI * 2);
          g.stroke();
        }
        g.restore();
      }
      g.restore();

      // Active habitat interactions add a restrained visual signature to the same school.
      // No new particles or simulation state are created; the cue follows its existing motion.
      if (interaction && interactionMotion.surface > 0 && depth < 0.62) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 2.2 + school.phase);
        g.save();
        g.globalAlpha = visibility * interactionMotion.surface * pulse;
        g.strokeStyle = fishColor;
        g.lineWidth = 1.35;
        g.beginPath();
        g.ellipse(x, y + 7, 18 + interactionMotion.surface * 20, 3.2, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }

      // A subtle surface ring links visible feeding schools to a useful fishing clue.
      // It appears only for a species currently eligible in this open habitat.
      if (species && behavior.state === 'feeding' && behavior.feeding > 0.62
        && depth < 0.48 && (school.id ?? 0) % 3 === 0) {
        const surfaceY = HZ + (y - HZ) * 0.18;
        g.save();
        g.globalAlpha = visibility * 0.16;
        g.strokeStyle = fishColor;
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(x, surfaceY, 9 + behavior.feeding * 5, 2.2, 0, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.ellipse(x + 7, surfaceY + 2, 4, 1.2, 0, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
    }

    // Surface signs continue to reflect the angler's current fishing area.
    const dimpleChance = (weather === 'storm' ? 0.35 : 0.7) + surfaceFeeding * 0.25;
    if (Math.sin(t * (0.7 + surfaceFeeding * 0.8) + day) > 0.15 - surfaceFeeding * 0.25
      && Math.sin(t * 0.31) > -0.3) {
      g.globalAlpha = 0.18 * dimpleChance;
      g.strokeStyle = '#d8f8ff';
      g.lineWidth = 2;
      for (let i = 0; i < 3 + Math.round(surfaceFeeding * 2); i++) {
        const x = ((i * 613 + t * (18 + i * 5 + surfaceFeeding * 12)) % (W + 100)) - 50;
        const y = HZ + 28 + ((i * 137 + t * (8 + surfaceFeeding * 3)) % 70);
        g.beginPath();
        g.ellipse(x, y, 10 + i * 3, 2.5, 0, 0, Math.PI * 2);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
  }

  /** Stage (x, y) to canvas pixels for screen-anchored drawing (depth 0). */
  toScreenStage(x, y) {
    const s = this.s, cw = this.canvas.width, ch = this.canvas.height;
    return [cw / 2 - this.ox * s + (this.sx + x) * s, ch / 2 - this.oy * s + (this.sy + y) * s];
  }

  drawReflection(g, time, weather, t) {
    // mirror the far canvas (already scrolled to the camera) below the horizon, in strips
    const far = this.far;
    const [, hzPx] = this.toScreenStage(0, HZ);
    const k = far.height / H;
    const depth = 240, strips = 24;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (let i = 0; i < strips; i++) {
      const fr = i / strips;
      const srcY = hzPx - (30 + fr * depth * 1.2) * k * this.cam.zoom;
      const srcH = (depth * 1.2 / strips) * k;
      const dy = hzPx - 6 * k + fr * depth * k * this.cam.zoom;
      const off = Math.sin(t * 1.6 + fr * 30) * (2 + fr * 10) * k;
      g.globalAlpha = (1 - fr) * (time === 'Day' ? 0.3 : 0.4) * (weather === 'storm' ? 0.5 : 1);
      const sy = Math.max(0, srcY - srcH);
      g.save();
      g.translate(0, dy + (depth / strips) * k);
      g.scale(1, -1);
      g.drawImage(far, 0, sy, far.width, srcH, off, 0, far.width, (depth / strips) * k + 1);
      g.restore();
    }
    g.restore();
    g.globalAlpha = 1;
  }

  drawRipples(g, dt, time) {
    const sheet = this.a.ripples;
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter((r) => r.t < r.dur);
    if (!sheet) return;
    const fw = sheet.width / 8;
    g.globalCompositeOperation = 'lighter';
    for (const r of this.ripples) {
      const p = r.t / r.dur, frame = Math.min(7, Math.floor(p * 8)), size = 260 * r.s * (0.6 + p * 0.8);
      g.globalAlpha = (1 - p) * (time === 'Day' ? 0.7 : 0.9);
      g.drawImage(sheet, frame * fw, 0, fw, sheet.height, r.x - size / 2, r.y - size * 0.22, size, size * 0.44);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ----- near shore -----

  /** Everything near the camera along the shore: lilies, props, foreground plants. */
  collectNear() {
    const out = [];
    for (const sp of SPOTS) {
      if (Math.abs(SPOT_X[sp.id] - this.camX) > SPOT_GAP * 1.6) continue;
      if (sp.secret && !this.revealed.has(sp.id)) continue;
      const D = DRESSING[sp.id];
      for (const [k, sx, sy, ls] of D.lilies) {
        const d = 0.55 + (sy - HZ) / (H - HZ) * 0.35;
        out.push({ layer: 'mid', kind: 'lily', k, wx: toWorld(sp.id, sx, d), sy, s: ls, d });
      }
      for (const p of D.props) out.push({ layer: 'props', kind: 'prop', ...p, wx: toWorld(sp.id, p.sx, p.d), spot: sp.id });
      const fd = 1.12;
      if (D.fgL) out.push({ layer: 'fg', kind: 'fg', k: D.fgL, side: 'L', wx: toWorld(sp.id, -60, fd), d: fd });
      if (D.fgR) out.push({ layer: 'fg', kind: 'fg', k: D.fgR, side: 'R', wx: toWorld(sp.id, W + 60, fd), d: fd });
      if (D.fgMid) out.push({ layer: 'fg', kind: 'fg', k: D.fgMid, side: 'L', wx: toWorld(sp.id, -260, 1.3), d: 1.3, s: 0.8 });
      if (D.spray) out.push({ layer: 'props', kind: 'spray', wx: toWorld(sp.id, D.spray.sx, 0.42), sy: D.spray.sy, d: 0.42 });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  drawItem(g, base, it, time, weather, t, layer) {
    if (it.layer !== layer) return;
    const ops = this.gradeOps(time, weather, 0);
    if (it.kind === 'lily') {
      const img = this.graded(it.k, ops); if (!img) return;
      base(it.d);
      const w = this.a[it.k].width * it.s, h = this.a[it.k].height * it.s;
      g.drawImage(img, this.layerX(it.wx, it.d) - w / 2, it.sy - h / 2 + Math.sin(t * 0.9 + it.wx) * 2 * it.s, w, h);
    } else if (it.kind === 'prop') {
      const img = this.graded(it.k, ops); if (!img) return;
      base(it.d);
      const w = this.a[it.k].width * it.s, h = this.a[it.k].height * it.s;
      const x = this.layerX(it.wx, it.d);
      const y = it.ground ? H + 40 - h : it.sy;
      if (it.sunk) {
        // half under water: clip at the waterline and fade into the murk
        g.save(); g.translate(x + w / 2, y + h * 0.4); g.rotate(it.rot || 0);
        g.beginPath(); g.rect(-w, -h, w * 2, h * 1.12 + Math.sin(t * 1.2) * 3); g.clip();
        g.scale(it.flip ? -1 : 1, 1); g.globalAlpha = 0.9; g.drawImage(img, -w / 2, -h * 0.4, w, h);
        g.restore(); g.globalAlpha = 1;
        g.fillStyle = 'rgba(10,40,50,.35)'; g.fillRect(x - 40, y + h * 0.42, w + 80, 6);
        return;
      }
      if (it.flip) { g.save(); g.translate(x + w, y); g.scale(-1, 1); g.drawImage(img, 0, 0, w, h); g.restore(); }
      else g.drawImage(img, x, y, w, h);
      if (it.lights === 'dock') this.drawLights(g, DOCK_LIGHTS, x, y, w, h, t, time, true);
    } else if (it.kind === 'fg') {
      const img = this.graded(it.k, ops); if (!img) return;
      base(it.d);
      const sc = 1.08 * (it.s || 1);
      const w = this.a[it.k].width * sc, h = this.a[it.k].height * sc;
      const sway = Math.sin(t * 0.8 + it.wx * 0.01) * 3;
      const lx = this.layerX(it.wx, it.d);
      const x = it.side === 'L' ? lx : lx - w;
      const y = H + 30 - h;
      g.drawImage(img, x + sway, y, w, h);
      if (FG_LIGHTS[it.k]) this.drawLights(g, FG_LIGHTS[it.k], x + sway, y, w, h, t, time, false);
    } else if (it.kind === 'spray') {
      base(it.d);
      const x = this.layerX(it.wx, it.d);
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 10; i++) {
        const k = (t * 0.6 + i / 10) % 1;
        g.globalAlpha = (1 - k) * 0.25;
        const r = 60 + k * 160;
        g.drawImage(this.dot, x + Math.sin(i * 3.1) * 120 * k - r, it.sy - k * 90 - r * 0.5, r * 2, r);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
  }

  drawLights(g, lights, x, y, w, h, t, time, reflect) {
    const nightness = time === 'Night' ? 1 : time === 'Day' ? 0.25 : 0.7;
    g.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const lx = x + w * l.fx, ly = y + h * l.fy;
      const fl = l.flicker ? 0.85 + Math.sin(t * 9 * l.flicker) * 0.06 + Math.sin(t * 23 * l.flicker) * 0.05 : 0.8 + Math.sin(t * 1.5 + lx) * 0.15;
      const r = l.r * fl;
      g.globalAlpha = 0.9 * nightness;
      g.drawImage(this.tintGlow(l.color), lx - r, ly - r, r * 2, r * 2);
      if (reflect && l.flicker) {
        g.globalAlpha = 0.35 * nightness * fl;
        g.drawImage(this.tintGlow(l.color), lx - r * 0.35, ly + h * 0.35, r * 0.7, r * 2.2);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  tintGlow(color) {
    const id = `glow|${color}`;
    let c = this.grades.get(id);
    if (c) return c;
    const src = this.a.glow || this.dot;
    c = makeCanvas(src.width, src.height);
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-atop'; g.fillStyle = color; g.globalAlpha = 0.85; g.fillRect(0, 0, c.width, c.height);
    this.grades.set(id, c);
    return c;
  }

  // ----- exploration: notes and the overgrown path -----

  notePositions(game) {
    const out = [];
    for (const n of NOTES) {
      if (game.state.notes.includes(n.id) || !game.state.discovered.includes(n.spot)) continue;
      const pos = NOTE_POS[n.id];
      if (!pos) continue;
      const d = 0.92;
      const wx = toWorld(n.spot, pos[0], d);
      if (Math.abs(wx - this.camX) > W) continue;
      out.push({ id: n.id, spot: n.spot, x: this.layerX(wx, d), y: pos[1], d });
    }
    return out;
  }

  drawNotes(g, base, game, t) {
    for (const n of this.notePositions(game)) {
      base(n.d);
      const bob = Math.sin(t * 2 + n.x) * 4;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = 0.55 + Math.sin(t * 3 + n.x) * 0.25;
      g.drawImage(this.tintGlow('#fff2a0'), n.x - 70, n.y - 70 + bob, 140, 140);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      // a corked bottle with a rolled note inside
      g.save(); g.translate(n.x, n.y + bob); g.rotate(-0.5);
      const bg = g.createLinearGradient(-14, 0, 14, 0);
      bg.addColorStop(0, 'rgba(160,255,200,.55)'); bg.addColorStop(0.5, 'rgba(220,255,235,.85)'); bg.addColorStop(1, 'rgba(120,220,170,.55)');
      g.fillStyle = bg; g.beginPath(); g.ellipse(0, 6, 16, 24, 0, 0, 6.29); g.fill();
      g.fillRect(-6, -28, 12, 16);
      g.fillStyle = '#b07a44'; g.fillRect(-7, -36, 14, 10);
      g.fillStyle = '#f6e7c1'; g.fillRect(-8, -4, 16, 20);
      g.strokeStyle = 'rgba(120,80,40,.6)'; g.lineWidth = 1.5;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-5, 1 + i * 5); g.lineTo(5, 1 + i * 5); g.stroke(); }
      g.restore();
      // sparkle
      const sp = (t * 1.5 + n.x * 0.01) % 1;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 1 - sp;
      g.fillStyle = '#fff';
      g.save(); g.translate(n.x + 20, n.y - 30 + bob); g.rotate(t);
      g.fillRect(-12 * (1 - sp), -1.5, 24 * (1 - sp), 3); g.fillRect(-1.5, -12 * (1 - sp), 3, 24 * (1 - sp));
      g.restore();
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (this.sparkleWorld) {
      const sw = this.sparkleWorld;
      sw.t += 1 / 60;
      if (!sw.burst) {
        sw.burst = true;
        const d = 0.92;
        // spawn in tackle space (spot-anchored) so it lines up with the bottle
        this.sparkle(sw.sx, sw.sy, 30, '#fff2a0');
        void d;
      }
      if (sw.t > 2) this.sparkleWorld = null;
    }
  }

  /** Canvas-pixel hit test against visible notes; returns a note id or null. */
  hitNote(cx, cy, game) {
    for (const n of this.notePositions(game)) {
      const s = this.s, cw = this.canvas.width, ch = this.canvas.height;
      const px = cw / 2 - this.ox * s + (this.sx - this.cam.x * n.d * 46 - this.camX * n.d + n.x) * s;
      const py = ch / 2 - this.oy * s + (this.sy + this.bobY * n.d - this.cam.y * n.d * 16 + n.y) * s;
      if (Math.hypot(cx - px, cy - py) < 80 * s) return n.id;
    }
    return null;
  }

  drawGate(g, base, game, t, badge) {
    if (this.gate == null) return;
    const d = 0.95;
    if (Math.abs(this.gate - this.camX) > W * 1.2) return;
    base(d);
    const x = this.layerX(this.gate, d);
    if (badge) { this.drawGateBadge(g, game, t, x); return; }
    const ops = this.gradeOps(game.timeOfDay, game.state.weather, 0);
    const ba = this.graded('boulderA', ops), bb = this.graded('boulderB', ops);
    if (ba && bb) {
      const wa = this.a.boulderA.width * 1.9, ha = this.a.boulderA.height * 1.9;
      const wb = this.a.boulderB.width * 1.7, hb = this.a.boulderB.height * 1.7;
      g.drawImage(bb, x - wb * 0.15, H - hb + 60, wb, hb);
      g.drawImage(ba, x - wa * 0.85, H - ha + 50, wa, ha);
    }
    const fg = this.graded('frameR', this.gradeOps(game.timeOfDay, game.state.weather, 0));
    if (fg) { const w = this.a.frameR.width * 1.1, h = this.a.frameR.height * 1.1; g.drawImage(fg, x - w * 0.55, H - h + 50, w, h); }
  }

  drawGateBadge(g, game, t, x) {
    const next = SPOTS.find((s) => !s.secret && !game.spotUnlocked(s.id));
    if (next) {
      const y = 420 + Math.sin(t * 2) * 8;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5;
      g.drawImage(this.tintGlow('#8df28a'), x - 110, y - 110, 220, 220);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.fillStyle = 'rgba(2,14,20,.82)'; g.strokeStyle = '#8df28a'; g.lineWidth = 3;
      const bw = 360, bh = 92;
      g.beginPath(); g.roundRect?.(x - bw / 2, y - bh / 2, bw, bh, 20); if (!g.roundRect) g.rect(x - bw / 2, y - bh / 2, bw, bh); g.fill(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#c6ff5a'; g.font = '28px "Lilita One", system-ui, sans-serif';
      g.fillText(`🔒 ${next.name}`, x, y - 16);
      g.fillStyle = '#d8eee8'; g.font = '800 19px Nunito, system-ui, sans-serif';
      g.fillText(`Path overgrown · GoopDex ${game.dexCount} / ${next.unlockAt}`, x, y + 20);
    }
  }

  // ----- secrets, events, buddy -----

  /** Light beacon that marks a clue on the shore. */
  drawBeacon(g, x, y, t, color) {
    g.globalCompositeOperation = 'lighter';
    const pulse = 0.6 + Math.sin(t * 3) * 0.25;
    const gr = g.createLinearGradient(0, y - 420, 0, y);
    gr.addColorStop(0, hexA(color, 0)); gr.addColorStop(0.7, hexA(color, 0.22 * pulse)); gr.addColorStop(1, hexA(color, 0.45 * pulse));
    g.fillStyle = gr; g.fillRect(x - 26, y - 420, 52, 420);
    g.globalAlpha = 0.8 * pulse; g.drawImage(this.tintGlow(color), x - 120, y - 120, 240, 240);
    g.globalAlpha = 1;
    g.save(); g.translate(x, y - 20); g.rotate(t * 0.8);
    g.fillStyle = '#ffffff';
    const k = 22 + Math.sin(t * 4) * 6;
    g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? k * 0.28 : k; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill();
    g.restore();
    g.globalCompositeOperation = 'source-over';
  }

  /** Sandbar ribbon, cave mouth and wreck mast: mid-ground features of the secret spots. */
  drawSecretsMid(g, base, game, t) {
    const near = (x) => Math.abs(x - this.camX) < W * 1.6;
    // the sandbar: a long pale ribbon in the water west of the dock
    const sandA = this.revealed.has('sandbar') ? 1 : this.clues.includes('sandbar') ? 0.45 + Math.sin(t * 1.5) * 0.1 : 0;
    if (sandA > 0 && near(CLUE_X.sandbar)) {
      const d = 0.6;
      base(d);
      const x0 = this.layerX(SPOT_X.sandbar - 1300, d), x1 = this.layerX(CLUE_X.sandbar + 240, d);
      for (const [y, h, a, col] of [[612, 34, 0.9, '#d9c79a'], [640, 26, 0.75, '#c2ae80'], [664, 18, 0.5, '#a89670']]) {
        g.globalAlpha = sandA * a;
        const gr = g.createLinearGradient(0, y - h, 0, y + h);
        gr.addColorStop(0, hexA(col, 0)); gr.addColorStop(0.45, col); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.moveTo(x0, y);
        for (let x = x0; x <= x1; x += 40) g.lineTo(x, y - h * (0.55 + 0.45 * Math.sin(x * 0.004 + y)) * Math.min(1, (x1 - x) / 260));
        for (let x = x1; x >= x0; x -= 40) g.lineTo(x, y + h * 0.35 * Math.min(1, (x1 - x) / 260));
        g.closePath(); g.fill();
      }
      g.globalAlpha = sandA * 0.5; g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const sx = x0 + ((i * 197) % Math.max(1, x1 - x0));
        const tw = Math.max(0, Math.sin(t * 2.4 + i * 1.7));
        g.drawImage(this.dot, sx - 6, 600 + (i % 4) * 9 - 6, 12 * tw + 2, 12 * tw + 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // the wreck's mast
    const wreckFound = this.revealed.has('wreck');
    if ((wreckFound || this.clues.includes('wreck')) && near(CLUE_X.wreck)) {
      const d = 0.6;
      base(d);
      const mx = this.layerX(CLUE_X.wreck, d), my = 640;
      const sway = Math.sin(t * 0.7) * 0.03;
      g.save(); g.translate(mx, my); g.rotate(-0.16 + sway);
      g.fillStyle = '#2a1a10';
      g.fillRect(-9, -330, 18, 340);
      g.fillRect(-90, -270, 180, 12);
      g.fillStyle = 'rgba(220,230,220,.55)';
      g.beginPath(); g.moveTo(-80, -258); g.quadraticCurveTo(-10, -200, -70, -120); g.lineTo(-84, -130); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,30,20,.7)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -320); g.lineTo(140, -10); g.moveTo(0, -320); g.lineTo(-150, -10); g.stroke();
      g.restore();
      g.fillStyle = 'rgba(200,240,240,.35)';
      g.beginPath(); g.ellipse(mx, my + 6, 46, 8, 0, 0, 6.29); g.fill();
    }
  }

  /** The hidden cave in the rock wall beside the second waterfall (local cliff coordinates). */
  drawCaveMouth(g, ww, wh, t) {
    const found = this.revealed.has('cave');
    if (!found && !this.clues.includes('cave')) return;
    const cx = ww * 0.84, wl = wh * 0.86;
    const rx = found ? 74 : 9, ry = found ? 104 : 92;
    g.save();
    g.beginPath(); g.ellipse(cx, wl, rx, ry, 0, Math.PI, 0); g.closePath();
    const ig = g.createRadialGradient(cx, wl - 20, 2, cx, wl - 30, ry * 1.1);
    if (found) { ig.addColorStop(0, '#ffe2a0'); ig.addColorStop(0.22, '#d07a2a'); ig.addColorStop(0.55, '#3a1a0c'); ig.addColorStop(1, '#0a0503'); }
    else { ig.addColorStop(0, '#ffffff'); ig.addColorStop(0.6, '#fff0b0'); ig.addColorStop(1, '#c09a5a'); }
    g.fillStyle = ig; g.fill();
    g.strokeStyle = 'rgba(10,8,6,.6)'; g.lineWidth = 6; g.stroke();
    g.restore();
    g.globalCompositeOperation = 'lighter';
    if (found) {
      g.globalAlpha = 0.5 + Math.sin(t * 1.3) * 0.08;
      g.drawImage(this.tintGlow('#ffb85a'), cx - 170, wl - 170, 340, 260);
      const crystals = [[-58, 2, 30, '#ffc04a'], [-44, -4, 20, '#c08aff'], [54, 3, 34, '#ffc04a'], [40, -2, 18, '#ffe08a'], [-12, 5, 14, '#c08aff'], [16, 6, 22, '#ffc04a']];
      for (const [dx, dy, h, col] of crystals) {
        const px = cx + dx, py = wl + dy;
        g.globalAlpha = 0.5 + Math.sin(t * 1.8 + dx) * 0.15;
        g.drawImage(this.tintGlow(col), px - h, py - h * 1.4, h * 2, h * 2);
        g.globalAlpha = 0.95; g.fillStyle = col;
        g.beginPath(); g.moveTo(px, py - h); g.lineTo(px + h * 0.3, py - h * 0.2); g.lineTo(px, py); g.lineTo(px - h * 0.3, py - h * 0.2); g.closePath(); g.fill();
      }
    } else {
      for (let i = 0; i < 4; i++) {
        g.globalAlpha = 0.12 + Math.sin(t * 0.9 + i) * 0.04;
        g.fillStyle = '#fff2c0';
        g.beginPath(); g.moveTo(cx - 6, wl - 80 + i * 14); g.lineTo(cx + 6, wl - 80 + i * 14); g.lineTo(cx - 120 - i * 30, wl + 90); g.lineTo(cx - 50 - i * 30, wl + 90); g.closePath(); g.fill();
      }
      g.globalAlpha = 0.7 + Math.sin(t * 2) * 0.15;
      g.drawImage(this.tintGlow('#fff2c0'), cx - 50, wl - 110, 100, 130);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /** Feeding frenzy: Goops leaping out of the water at a spot. */
  drawFrenzy(g, base, game, t, dt) {
    const f = game.state.frenzy;
    this.frenzyFx = (this.frenzyFx || []).filter((j) => (j.t += dt) < j.dur);
    if (!f || game.phase === PHASES.FIGHT) return;
    const wx = SPOT_X[f];
    if (Math.abs(wx - this.camX) > W * 1.1) return;
    const d = 0.62;
    const D = DRESSING[f];
    if (Math.random() < dt * 7 && this.frenzyFx.length < 18) {
      this.frenzyFx.push({ ring: true, t: 0, dur: 0.8, x: lerp(D.lane.x0 - 260, D.lane.x1 + 260, Math.random()), y: lerp(D.lane.y0 - 20, D.lane.y1 + 30, Math.random()) });
    }
    if (Math.random() < dt * 3 && this.frenzyFx.filter((j) => !j.ring).length < 6) {
      const ids = SPOT_BY[f].goops;
      this.frenzyFx.push({ t: 0, dur: 0.9, id: ids[Math.floor(Math.random() * ids.length)], x: lerp(D.lane.x0 - 200, D.lane.x1 + 200, Math.random()), y: lerp(D.lane.y0, D.lane.y1, Math.random()), dir: Math.random() < 0.5 ? -1 : 1 });
    }
    const shift = this.layerX(wx, d) - W / 2; // spot-anchored "screen" coords at depth d
    base(d);
    g.translate(shift, 0);
    const sheet = this.a.ripples;
    for (const j of this.frenzyFx) {
      const p = j.t / j.dur;
      if (j.ring) {
        if (!sheet) continue;
        const fw = sheet.width / 8, size = 90 * (0.6 + (j.y - HZ) / (H - HZ));
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = (1 - p) * 0.7;
        g.drawImage(sheet, Math.min(7, Math.floor(p * 8)) * fw, 0, fw, sheet.height, j.x - size / 2, j.y - size * 0.22, size, size * 0.44);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        continue;
      }
      const sil = this.silhouette(j.id);
      const art = this.a[`goop:${j.id}`];
      if (sil && art) {
        const sc = 0.26 * (0.6 + (j.y - HZ) / (H - HZ) * 0.8);
        const x = j.x + j.dir * 120 * p, y = j.y - Math.sin(p * Math.PI) * 120;
        g.save(); g.translate(x, y); g.rotate(j.dir * (p - 0.5) * 1.6); g.scale(-j.dir, 1);
        const seen = game.state.seen.includes(j.id);
        if (seen) { g.globalAlpha = 0.9; g.drawImage(art, -art.width * sc / 2, -art.height * sc / 2, art.width * sc, art.height * sc); }
        g.globalAlpha = seen ? 0.35 : 0.9; g.drawImage(sil, -sil.width * sc / 2, -sil.height * sc / 2, sil.width * sc, sil.height * sc);
        g.restore(); g.globalAlpha = 1;
        if (Math.random() < 0.5) {
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6;
          g.drawImage(this.dot, x - 8 + (Math.random() - 0.5) * 30, y + 10 + Math.random() * 20, 10, 10);
          g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        }
      }
      if (sheet) {
        const fw = sheet.width / 8;
        g.globalCompositeOperation = 'lighter';
        for (const [rx, k] of [[j.x, p], [j.x + j.dir * 120, Math.max(0, p - 0.85) * 6]]) {
          if (k <= 0 || k >= 1) continue;
          const size = 160 * (0.5 + k);
          g.globalAlpha = (1 - k) * 0.8;
          g.drawImage(sheet, Math.min(7, Math.floor(k * 8)) * fw, 0, fw, sheet.height, rx - size / 2, j.y - size * 0.22, size, size * 0.44);
        }
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      }
    }
  }

  /** Clue beacons for secret spots whose conditions line up right now. */
  drawClues(g, base, t) {
    for (const id of this.clues) {
      const d = 0.8, wx = CLUE_X[id];
      if (Math.abs(wx - this.camX) > W * 1.3) continue;
      base(d);
      this.drawBeacon(g, this.layerX(wx, d), 760, t, id === 'cave' ? '#ffd27a' : id === 'wreck' ? '#7affe0' : '#cfe0ff');
    }
  }

  hitClue(cx, cy) {
    for (const id of this.clues) {
      const d = 0.8;
      const [px, py] = this.layerToCanvas(this.layerX(CLUE_X[id], d), 700, d);
      if (Math.abs(cx - px) < 110 * this.s && Math.abs(cy - py) < 260 * this.s) return id;
    }
    return null;
  }

  /** Canvas pixel of a point drawn in layer coordinates at depth d. */
  layerToCanvas(x, y, d) {
    const s = this.s, cw = this.canvas.width, ch = this.canvas.height;
    return [
      cw / 2 - this.ox * s + (this.sx - this.cam.x * d * 46 - this.camX * d + x) * s,
      ch / 2 - this.oy * s + (this.sy + this.bobY * d - this.cam.y * d * 16 + y) * s,
    ];
  }

  /** Old Wiggs' bounty board, on the shore by the dock. */
  drawBoard(g, base, game, t) {
    const d = 0.9;
    if (Math.abs(BOARD_X - this.camX) > W) return;
    base(d);
    const x = this.layerX(BOARD_X, d), y = 960;
    g.translate(x, y); g.scale(0.78, 0.78); g.translate(-x, -y);
    const ops = this.gradeOps(game.timeOfDay, game.state.weather, 0);
    void ops;
    const dark = game.timeOfDay === 'Night' ? 0.55 : game.timeOfDay === 'Day' ? 1 : 0.78;
    const wood = (l) => { const v = Math.round(l * dark); return `rgb(${v},${Math.round(v * 0.66)},${Math.round(v * 0.4)})`; };
    g.fillStyle = 'rgba(0,10,10,.35)'; g.beginPath(); g.ellipse(x, y + 8, 170, 22, 0, 0, 6.29); g.fill();
    g.fillStyle = wood(90); g.fillRect(x - 128, y - 250, 22, 258); g.fillRect(x + 106, y - 250, 22, 258);
    g.save(); g.translate(x, y - 190); g.rotate(-0.03);
    g.fillStyle = wood(140); g.beginPath(); g.roundRect?.(-150, -78, 300, 156, 10); if (!g.roundRect) g.rect(-150, -78, 300, 156); g.fill();
    g.strokeStyle = wood(70); g.lineWidth = 6; g.stroke();
    g.strokeStyle = wood(105); g.lineWidth = 2;
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(-146, i * 40 + 10); g.lineTo(146, i * 40 + 8); g.stroke(); }
    // header plank
    g.fillStyle = wood(165); g.fillRect(-120, -112, 240, 40);
    g.fillStyle = `rgba(40,20,8,${0.9})`; g.font = '28px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('BOUNTIES', 0, -91);
    // pinned papers
    const list = game.state.bounties || [];
    for (let i = 0; i < 3; i++) {
      const b = list[i];
      const px = -95 + i * 95, py = 4 + (i % 2) * 6;
      g.save(); g.translate(px, py); g.rotate((i - 1) * 0.08);
      g.fillStyle = b?.done ? `rgba(190,230,170,${dark})` : `rgba(246,231,193,${dark})`;
      g.fillRect(-36, -50, 72, 96);
      g.fillStyle = 'rgba(120,80,40,.55)';
      for (let k = 0; k < 4; k++) g.fillRect(-26, -32 + k * 16, 52 - (k % 2) * 14, 4);
      g.fillStyle = '#c0392b'; g.beginPath(); g.arc(0, -44, 5, 0, 6.29); g.fill();
      if (b?.done) { g.strokeStyle = '#2e8a3a'; g.lineWidth = 6; g.beginPath(); g.moveTo(-18, 18); g.lineTo(-4, 32); g.lineTo(22, 4); g.stroke(); }
      g.restore();
    }
    g.restore();
    // a lantern so it reads at night
    if (game.timeOfDay !== 'Day') {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7 + Math.sin(t * 7) * 0.05;
      g.drawImage(this.tintGlow('#ffb85a'), x + 60, y - 380, 200, 200);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ffd890'; g.beginPath(); g.arc(x + 160, y - 280, 8, 0, 6.29); g.fill();
    }
    if (this.boardAlert) {
      const by = y - 350 + Math.sin(t * 3) * 8;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8;
      g.drawImage(this.tintGlow('#fff27a'), x - 70, by - 70, 140, 140);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.font = '900 64px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#0a2a1a'; g.strokeText('!', x, by); g.fillStyle = '#fff36b'; g.fillText('!', x, by);
    }
    this.boardPos = { x, y: y - 150, d };
  }

  hitBoard(cx, cy) {
    if (!this.boardPos || Math.abs(BOARD_X - this.camX) > W) return false;
    const [px, py] = this.layerToCanvas(this.boardPos.x, this.boardPos.y, this.boardPos.d);
    return Math.abs(cx - px) < 140 * this.s && Math.abs(cy - py) < 120 * this.s;
  }

  /** Your buddy Goop bobs along at the water's edge, cheers catches and points out secrets. */
  drawBuddy(g, game, dt, t, input) {
    const id = game.state.buddy;
    const art = id && this.a[`goop:${id}`];
    if (!art) return;
    const b = this.buddy;
    const v = input.walkSpeed || 0;
    if (Math.abs(v) > 0.05) b.face = v > 0 ? 1 : -1;
    b.hop += dt * (2 + Math.abs(v) * 9);
    b.jump = Math.max(0, b.jump - dt);
    const hasAlert = this.clues.some((c) => Math.abs(CLUE_X[c] - this.camX) < W * 1.2) || !!input.noteNear;
    b.alert = lerp(b.alert, hasAlert ? 1 : 0, 1 - Math.exp(-dt * 4));
    if (hasAlert) {
      const cx = this.clues.map((c) => CLUE_X[c]).find((x) => Math.abs(x - this.camX) < W * 1.2);
      if (cx != null) b.face = cx > this.camX ? 1 : -1;
    }
    const x = 430 + Math.sin(t * 0.6) * 12;
    const hopH = Math.abs(Math.sin(b.hop)) * (8 + Math.abs(v) * 30);
    const jumpH = b.jump > 0 ? Math.sin((1 - b.jump / 0.8) * Math.PI) * 120 : 0;
    const y = 1000 - hopH - jumpH;
    const h = 118 * (1 + 0.08 * (game.state.buddyLv || 0)), w = art.width / art.height * h;
    g.fillStyle = 'rgba(0,20,30,.35)';
    g.beginPath(); g.ellipse(x, 1012, w * 0.38 * (1 - (hopH + jumpH) / 300), 10, 0, 0, 6.29); g.fill();
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25;
    g.drawImage(this.tintGlow(GOOPS.find((x2) => x2.id === id)?.color || '#8df28a'), x - w * 0.7, y - h * 0.9, w * 1.4, h * 1.4);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const squash = 1 + Math.sin(b.hop * 2) * 0.04;
    g.save(); g.translate(x, y); g.scale(b.face * squash, 1 / squash);
    g.drawImage(game.state.dex[id]?.shiny ? this.shinyArt(id) : art, -w / 2, -h * 0.85, w, h);
    g.restore();
    if (b.alert > 0.05) {
      const by = y - h - 30 + Math.sin(t * 6) * 5;
      g.globalAlpha = b.alert;
      g.fillStyle = 'rgba(2,14,20,.85)'; g.strokeStyle = '#fff27a'; g.lineWidth = 3;
      g.beginPath(); g.arc(x + 30 * b.face, by, 26, 0, 6.29); g.fill(); g.stroke();
      g.font = '900 34px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#fff36b'; g.fillText('!', x + 30 * b.face, by + 1);
      g.globalAlpha = 1;
    }
  }

  cheer() { this.buddy.jump = 0.8; }

  // ----- atmosphere -----

  drawFireflies(g, base, time, weather, t) {
    let k = { Night: 1, Dusk: 0.6, Dawn: 0.25, Day: 0 }[time] ?? 0;
    if (weather === 'rain') k *= 0.4; if (weather === 'storm') k = 0; if (weather === 'fog') k *= 0.7;
    if (!k) return;
    const d = 0.8;
    base(d);
    g.globalCompositeOperation = 'lighter';
    const glow = this.tintGlow('#d6ff6a');
    for (let i = 0; i < this.flies.length; i++) {
      if ((i % 10) / 10 >= k) continue;
      const f = this.flies[i];
      if (Math.abs(f.x - this.camX) > W * 0.8 / d) continue;
      const x = this.layerX(f.x, d) + Math.sin(t * f.sp + f.ph) * 40 + Math.sin(t * f.sp * 2.3 + f.ph) * 14;
      const y = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * 26;
      const pulse = Math.max(0, Math.sin(t * (1.2 + f.sp) + f.ph * 3));
      const r = 10 + pulse * 16;
      g.globalAlpha = 0.25 + pulse * 0.75;
      g.drawImage(glow, x - r * 2, y - r * 2, r * 4, r * 4);
      g.globalAlpha = 0.6 + pulse * 0.4;
      g.drawImage(this.dot, x - 4, y - 4, 8, 8);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawMotes(g, base, t, time) {
    let col = null, wgt = 0;
    for (const sp of SPOTS) {
      const m = DRESSING[sp.id].motes;
      if (!m || (sp.secret && !this.revealed.has(sp.id))) continue;
      const w = clamp(1 - Math.abs(this.camX - SPOT_X[sp.id]) / SPOT_GAP, 0, 1);
      if (w > wgt) { wgt = w; col = m; }
    }
    if (!col || wgt <= 0) return;
    g.setTransform(this.s, 0, 0, this.s, this.canvas.width / 2 - this.ox * this.s, this.canvas.height / 2 - this.oy * this.s);
    g.globalCompositeOperation = 'lighter';
    const glow = this.tintGlow(col);
    for (const m of this.motes) {
      const y = H - ((m.y * 900 + t * 18) % 900) - 60;
      const x = ((m.x - this.camX * 0.7) % W + W) % W + Math.sin(t * 0.6 + m.ph) * 30;
      g.globalAlpha = (0.3 + 0.5 * Math.sin(t * 2 + m.ph) ** 2) * (time === 'Day' ? 0.4 : 1) * wgt;
      const r = m.r * 6;
      g.drawImage(glow, x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawFogBand(g, t, alpha, y, scroll = 0) {
    const fog = this.a.fog;
    const band = g.createLinearGradient(0, y - 160, 0, y + 160);
    band.addColorStop(0, 'rgba(200,215,225,0)'); band.addColorStop(0.5, `rgba(200,215,225,${alpha * 0.55})`); band.addColorStop(1, 'rgba(200,215,225,0)');
    g.fillStyle = band; g.fillRect(-200 + scroll, y - 160, W + 400, 320);
    if (!fog) return;
    const fw = fog.width / 8, frame = Math.floor(t * 4) % 8;
    g.globalAlpha = alpha;
    const tile = 900;
    for (let x = -tile + ((t * 22) % tile); x < W + tile; x += tile * 0.7) g.drawImage(fog, frame * fw, 0, fw, fog.height, x + scroll, y - 260, tile, tile * 0.55);
    g.globalAlpha = 1;
  }

  drawRain(g, dt, t, storm) {
    const n = storm ? 260 : 150, wind = storm ? 0.32 : 0.14;
    g.strokeStyle = 'rgba(200,225,255,.42)'; g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const r = this.rain[i];
      r.y += r.v * dt * r.z; r.x -= r.v * dt * wind * r.z;
      if (r.y > H + 40) { r.y = -40 - Math.random() * 200; r.x = Math.random() * (W + 300); if (Math.random() < 0.5) this.rainRing(); }
      if (r.x < -40) r.x += W + 80;
      g.lineWidth = 1 + r.z * 1.6; g.globalAlpha = 0.35 + r.z * 0.5;
      g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + r.l * wind * r.z, r.y - r.l * r.z); g.stroke();
    }
    g.globalAlpha = 1;
    const sheet = this.a.rain;
    if (sheet) {
      const fw = sheet.width / 8, frame = Math.floor(t * 14) % 8;
      g.globalAlpha = storm ? 0.4 : 0.25;
      for (let x = -200; x < W + 200; x += 480) for (let y = -100; y < H; y += 480) g.drawImage(sheet, frame * fw, 0, fw, sheet.height, x, y, 480, 480);
      g.globalAlpha = 1;
    }
  }

  rainRing() {
    if (this.ripples.length > 60) return;
    const y = HZ + 20 + Math.random() * (H - HZ - 20);
    this.ripples.push({ x: Math.random() * W, y, t: 0, dur: 0.7, s: 0.12 + (y - HZ) / (H - HZ) * 0.3 });
  }

  drawStorm(g, dt) {
    this.nextBolt -= dt;
    if (this.nextBolt <= 0) {
      this.nextBolt = 4 + Math.random() * 7;
      this.flash = 1;
      this.bolt = { life: 0.35, pts: this.makeBolt(200 + Math.random() * 1500, -20, 380 + Math.random() * 120) };
      this.cam.shake = Math.max(this.cam.shake, 8);
      this.onThunder?.();
    }
    if (this.bolt) {
      this.bolt.life -= dt;
      if (this.bolt.life <= 0) this.bolt = null;
      else {
        g.globalCompositeOperation = 'lighter';
        for (const [lw, a] of [[16, 0.15], [6, 0.4], [2.2, 1]]) {
          g.strokeStyle = `rgba(210,225,255,${a * this.bolt.life / 0.35})`; g.lineWidth = lw; g.beginPath();
          this.bolt.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.stroke();
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  makeBolt(x, y, endY) {
    const pts = [[x, y]];
    while (y < endY) { y += 20 + Math.random() * 30; x += (Math.random() - 0.5) * 70; pts.push([x, y]); }
    return pts;
  }

  // ----- gameplay visuals (tackle space = screen coords at the current spot) -----

  rodGeometry(game) {
    const D = DRESSING[game.spot.id] || DRESSING.dock;
    const fight = game.phase === PHASES.FIGHT ? game.fight : null;
    const tension = fight ? fight.tension : 0;
    const bx = D.rod.bx, by = D.rod.by;
    let ang = -0.98 + Math.sin(this.t * 0.9) * 0.01 + this.walk * 0.55 + Math.sin(this.walkPhase) * 0.04 * this.walk;
    if (this.cast && this.cast.t < 0.35) ang -= Math.sin(this.cast.t / 0.35 * Math.PI) * 0.5;
    const len = 640 - this.walk * 120;
    const bend = tension * 150 + (game.phase === PHASES.BITE ? 30 + Math.sin(this.t * 18) * 10 : 0);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const tipX = bx + dirX * len + bend * 0.55, tipY = by + dirY * len + bend * 0.9;
    const cx = bx + dirX * len * 0.55 - dirY * bend * 0.1, cy = by + dirY * len * 0.55 + bend * 0.15;
    return { bx, by, tipX, tipY, cx, cy, tension };
  }

  /** Bobber flight, drift and splashes (tackle space). */
  drawTackleWater(g, game, dt, t) {
    const phase = game.phase;
    const rod = this.rodGeometry(game);
    const fight = phase === PHASES.FIGHT ? game.fight : null;
    const b = this.bobber;
    this.hookedUp = phase === PHASES.CAUGHT && this.reveal && this.reveal.pos;
    this.showBobber = phase !== PHASES.IDLE && !this.snap && !this.hookedUp && game.here;
    this.sightView = phase === PHASES.CAST && game.sight ? game.sight : null;
    if (this.cast) {
      this.cast.t += dt;
      const p = clamp(this.cast.t / this.cast.dur, 0, 1);
      if (p >= 1 && !this.cast.landed) { this.cast.landed = true; this.sightAnchor = { x: this.cast.tx, y: this.cast.ty }; this.splash(this.cast.tx, this.cast.ty, 14, '#e8fdff', 0.7); this.ring(this.cast.tx, this.cast.ty, 1); this.onSplash?.(); }
      if (this.cast.landed && this.cast.t > this.cast.dur + 0.4) this.cast = null;
      else if (!this.cast.landed) {
        const e = ease(p);
        b.x = lerp(rod.tipX, this.cast.tx, e);
        b.y = lerp(rod.tipY, this.cast.ty, e) - Math.sin(p * Math.PI) * 260;
      }
    }
    if (!this.cast || this.cast.landed) {
      if (this.cast?.landed || (this.sightView && this.sightAnchor)) {
        const a = this.sightAnchor || { x: this.cast.tx, y: this.cast.ty };
        // Sight fishing: the lure slides along the water to where you steer it.
        if (this.sightView) b.x = lerp(b.x, a.x + (this.sightView.lure - 0.5) * W * 0.5, 1 - Math.exp(-dt * 6));
        else b.x = a.x;
        b.y = a.y;
      }
      if (fight) {
        if (this.castX == null) { this.castX = b.x; this.castY = b.y; }
        const pull = Math.sin(t * 2.1) * 60 + Math.sin(t * 5.3) * 18 * fight.tension;
        this.swingX = lerp(this.swingX || 0, (fight.swing || 0) * 260, 1 - Math.exp(-dt * 7));
        const still = fight.move?.type === 'fakeout' && fight.move.state === 'still';
        const tx = lerp(this.castX, rod.bx + 120, fight.progress * 0.55) + (still ? pull * 0.1 : pull) + this.swingX;
        if (fight.swing && Math.random() < dt * 20) this.splash(b.x, b.y, 2, '#e8fdff', 0.5);
        if (fight.tell && Math.random() < dt * 14) this.particles.push({ kind: 'drop', x: b.x + (Math.random() - 0.5) * 40, y: b.y + 30, vx: 0, vy: -160 - Math.random() * 80, life: 0, max: 0.5, size: 3 + Math.random() * 3, color: '#cfefff', floor: 3000 });
        const ty = lerp(this.castY, H - 260, fight.progress * 0.5);
        b.x = lerp(b.x, tx, 1 - Math.exp(-dt * 3));
        b.y = lerp(b.y, ty, 1 - Math.exp(-dt * 3));
        if (!still && Math.random() < dt * (0.6 + fight.tension * 2.2)) this.ring(b.x, b.y, 0.6 + fight.tension * 0.6);
        if (Math.random() < dt * 4 * fight.tension) this.splash(b.x, b.y, 3, '#e8fdff', 0.4);
        if (!this.jump && !fight.move && !fight.breakT && fight.tension > 0.72 && Math.random() < dt * 0.5) {
          this.jump = { t: 0, dur: 0.85, x: b.x + (Math.random() - 0.5) * 120, y: b.y + 10, dir: Math.random() < 0.5 ? -1 : 1 };
          this.splash(this.jump.x, this.jump.y, 18, '#ffffff', 0.9);
        }
      }
    }
    if (phase === PHASES.IDLE) { this.castX = null; this.sightAnchor = null; }
    let dip = 0;
    if (phase === PHASES.BITE) dip = 6 + Math.abs(Math.sin(t * 16)) * 14;
    else if (phase === PHASES.FIGHT) dip = 10 + (fight?.tension || 0) * 8;
    else if (phase === PHASES.CAST && game.timer > 0.4 && Math.random() < dt * 1.5) { this.ring(b.x, b.y, 0.35); b.dip = 6; }
    b.dip = Math.max(0, (b.dip || 0) - dt * 20);
    this.bob = Math.sin(t * 2.6) * 3 + dip + b.dip;
    this.depthScale = 0.6 + (b.y - HZ) / (H - HZ) * 0.8;
    this.drawSightShadow(g);
    if (this.showBobber) this.drawBobber(g, b.x, b.y + this.bob, this.depthScale, phase, t);
  }

  drawRodAndLine(g, game, dt, t, off) {
    const phase = game.phase;
    const rod = this.rodGeometry(game);
    const fight = phase === PHASES.FIGHT ? game.fight : null;
    const b = this.bobber;
    if (!this.snap) {
      g.lineCap = 'round';
      let ex, ey, sag;
      if (this.hookedUp) { ex = this.reveal.pos.x + off; ey = this.reveal.pos.y - 30; sag = 30; }
      else if (this.showBobber) { ex = b.x + off; ey = b.y + this.bob - 8 * this.depthScale; sag = (1 - (fight?.tension ?? 0.15)) * 70; }
      else { ex = rod.tipX + Math.sin(t * 1.2) * 6 + Math.sin(this.walkPhase) * 10 * this.walk; ey = rod.tipY + 150 - this.walk * 40; sag = 4; }
      const mx = (rod.tipX + ex) / 2, my = (rod.tipY + ey) / 2 + sag;
      const hot = fight && fight.tension > 0.85;
      const lc = this.lineColor(), lglow = (LINES[this.look?.line] || {}).glow;
      g.strokeStyle = hot ? 'rgba(255,120,110,.35)' : lglow ? lc : 'rgba(220,255,240,.18)';
      if (lglow && !hot) g.globalAlpha = 0.3;
      g.lineWidth = hot ? 7 : 5;
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.globalAlpha = 1;
      g.strokeStyle = hot ? '#ff8f80' : lc;
      g.lineWidth = hot ? 2 : 1.6;
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo(mx + (hot ? Math.sin(t * 60) * 3 : 0), my, ex, ey); g.stroke();
      if (!this.showBobber && !this.hookedUp) this.drawLure(g, ex, ey, t);
    } else {
      this.snap.t += dt;
      const p = clamp(this.snap.t / 0.5, 0, 1);
      g.strokeStyle = `rgba(255,140,120,${1 - p})`; g.lineWidth = 2;
      const ex = lerp(this.snap.x + off, rod.tipX, ease(p)), ey = lerp(this.snap.y, rod.tipY + 80, ease(p)) + Math.sin(p * 20) * 30 * (1 - p);
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo((rod.tipX + ex) / 2 + 60 * (1 - p), (rod.tipY + ey) / 2 - 40, ex, ey); g.stroke();
      if (p >= 1 && this.snap.t > 1.2) this.snap = null;
    }
    this.drawRod(g, rod);
    if (fight?.warn) {
      const y = b.y - 110 * this.depthScale, k = 1 + Math.sin(t * 22) * 0.12;
      g.save(); g.translate(b.x + off, y); g.scale(k * this.depthScale * 1.3, k * this.depthScale * 1.3);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.85;
      g.drawImage(this.tintGlow('#ff5a4a'), -80, -80, 160, 160);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.font = '900 58px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#2a0505'; g.strokeText('!!', 0, 0);
      g.fillStyle = '#ff6a5a'; g.fillText('!!', 0, 0);
      g.restore();
    }
    if (phase === PHASES.BITE) {
      const pop = 1 + Math.sin(t * 12) * 0.08;
      const y = b.y - 120 * this.depthScale;
      g.save(); g.translate(b.x + off, y); g.scale(pop * this.depthScale * 1.4, pop * this.depthScale * 1.4);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8;
      g.drawImage(this.tintGlow('#fff27a'), -70, -70, 140, 140);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      g.font = '900 64px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#0a2a1a'; g.strokeText('!', 0, 0);
      g.fillStyle = '#fff36b'; g.fillText('!', 0, 0);
      g.restore();
    }
  }

  // ----- tackle looks (rod styles, skins, bobbers, lines, lures) -----

  /** Current colours for the rod: the style's own, a skin's, or an animated skin. */
  rodPalette() {
    const look = this.look || {};
    const st = ROD_STYLE[look.style] || ROD_STYLE.wood;
    const skin = SKINS[look.skin];
    const pal = skin?.pal ? { ...st, ...skin.pal } : st;
    if (skin?.anim === 'rainbow') {
      const h = (this.t * 70) % 360;
      return { ...pal, shaft: [`hsl(${h},60%,14%)`, `hsl(${h},85%,42%)`, `hsl(${(h + 50) % 360},95%,66%)`, '#ffffff'], tip: `hsl(${(h + 120) % 360},100%,70%)`, reel: ['#ffffff', `hsl(${(h + 180) % 360},90%,60%)`, `hsl(${h},60%,20%)`] };
    }
    return pal;
  }

  drawRod(g, rod) {
    const { bx, by, tipX, tipY, cx, cy } = rod;
    const look = this.look || {};
    const st = ROD_STYLE[look.style] || ROD_STYLE.wood;
    const pal = this.rodPalette();
    const skin = SKINS[look.skin] || {};
    const k = st.width || 1;
    const t = this.t;
    g.lineCap = 'round';
    const steps = 22;
    const pt = (u) => { const a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c = u * u; return [a * bx + b2 * cx + c * tipX, a * by + b2 * cy + c * tipY]; };
    const nrm = (u) => { const [x0, y0] = pt(Math.max(0, u - 0.01)), [x1, y1] = pt(Math.min(1, u + 0.01)); const l = Math.hypot(x1 - x0, y1 - y0) || 1; return [-(y1 - y0) / l, (x1 - x0) / l]; };
    const widthAt = (u, w) => Math.max(1.2, w * (1 - u * 0.82));
    if (st.glass) g.globalAlpha = 0.78;
    for (const [w, col] of [[26 * k, pal.shaft[0]], [19 * k, pal.shaft[1]], [13 * k, pal.shaft[2]], [5 * k, pal.shaft[3]]]) {
      g.strokeStyle = col;
      for (let i = 0; i < steps; i++) {
        const u0 = i / steps, u1 = (i + 1) / steps;
        const [x0, y0] = pt(u0), [x1, y1] = pt(u1);
        g.lineWidth = widthAt(u0, w);
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
    g.globalAlpha = 1;
    // style details along the shaft
    const along = (from, to, n, fn) => { for (let i = 0; i < n; i++) { const u = from + (to - from) * (i / Math.max(1, n - 1)); fn(u, ...pt(u), ...nrm(u)); } };
    if (st.nodes) { // bamboo joints
      g.strokeStyle = pal.shaft[0]; g.lineCap = 'butt';
      along(0.26, 0.9, 7, (u, x, y, nx, ny) => { const w = widthAt(u, 15 * k); g.lineWidth = 3; g.beginPath(); g.moveTo(x - nx * w, y - ny * w); g.lineTo(x + nx * w, y + ny * w); g.stroke(); });
      g.lineCap = 'round';
    }
    if (st.weave) { // carbon weave + red trim
      g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.2;
      along(0.24, 0.92, 26, (u, x, y, nx, ny) => { const w = widthAt(u, 8 * k); g.beginPath(); g.moveTo(x - nx * w - ny * 3, y - ny * w + nx * 3); g.lineTo(x + nx * w + ny * 3, y + ny * w - nx * 3); g.stroke(); });
      for (const u of [0.24, 0.5]) { const [x, y] = pt(u), [nx, ny] = nrm(u); const w = widthAt(u, 14 * k); g.strokeStyle = '#ff3a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - nx * w, y - ny * w); g.lineTo(x + nx * w, y + ny * w); g.stroke(); }
    }
    if (st.grain) { // ironwood grain
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5;
      for (const off of [-0.4, 0.3]) { g.beginPath(); for (let i = 0; i <= 20; i++) { const u = 0.22 + i * 0.033; const [x, y] = pt(u), [nx, ny] = nrm(u); const w = widthAt(u, 18 * k) * off; i ? g.lineTo(x + nx * w, y + ny * w) : g.moveTo(x + nx * w, y + ny * w); } g.stroke(); }
      for (const u of [0.3, 0.55, 0.78]) { const [x, y] = pt(u), [nx, ny] = nrm(u); const w = widthAt(u, 16 * k); g.strokeStyle = '#8a8a8a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - nx * w, y - ny * w); g.lineTo(x + nx * w, y + ny * w); g.stroke(); }
    }
    if (st.nubs) { // coral branches
      g.fillStyle = pal.shaft[2];
      along(0.3, 0.85, 6, (u, x, y, nx, ny) => { const side = Math.round(u * 20) % 2 ? 1 : -1, w = widthAt(u, 12 * k); g.beginPath(); g.arc(x + nx * w * side * 1.1, y + ny * w * side * 1.1, 4.5 * (1.1 - u), 0, 6.29); g.fill(); });
    }
    g.globalCompositeOperation = 'lighter';
    if (st.cracks) { // magma glowing seams
      along(0.24, 0.9, 12, (u, x, y) => { const f = 0.55 + Math.sin(t * 5 + u * 30) * 0.35; g.globalAlpha = f * 0.8; g.drawImage(this.tintGlow('#ff7a1a'), x - 14, y - 14, 28, 28); });
    }
    if (st.sparks && (Math.sin(t * 2.3) > 0.55 || (this.weatherNow === 'storm'))) { // storm crackle
      g.strokeStyle = '#cfe8ff'; g.lineWidth = 2; g.globalAlpha = 0.9;
      g.beginPath();
      for (let i = 0; i <= 10; i++) { const u = 0.3 + i * 0.06; const [x, y] = pt(u), [nx, ny] = nrm(u); const j = (Math.random() - 0.5) * 18; i ? g.lineTo(x + nx * j, y + ny * j) : g.moveTo(x + nx * j, y + ny * j); }
      g.stroke();
      g.globalAlpha = 0.5; const [sx2, sy2] = pt(0.3 + Math.random() * 0.6); g.drawImage(this.tintGlow('#9ad0ff'), sx2 - 30, sy2 - 30, 60, 60);
    }
    if (st.facets) { // crystal glints
      along(0.3, 0.95, 6, (u, x, y) => { const tw = Math.max(0, Math.sin(t * 3 + u * 17)); if (tw < 0.2) return; g.globalAlpha = tw; g.fillStyle = '#ffffff'; g.save(); g.translate(x, y); g.rotate(t); const s2 = 9 * tw; g.fillRect(-s2, -1, s2 * 2, 2); g.fillRect(-1, -s2, 2, s2 * 2); g.restore(); });
    }
    if (st.runes) { // abyssal runes
      along(0.28, 0.88, 7, (u, x, y) => { g.globalAlpha = 0.45 + Math.sin(t * 2 + u * 12) * 0.35; g.drawImage(this.tintGlow('#a86aff'), x - 16, y - 16, 32, 32); g.fillStyle = '#e8d0ff'; g.fillRect(x - 2, y - 2, 4, 4); });
    }
    if (skin.anim === 'galaxy') { // drifting stars
      along(0.22, 0.97, 14, (u, x, y, nx, ny) => { const ph = (u * 9 + t * 0.6) % 1; g.globalAlpha = Math.sin(ph * Math.PI); g.fillStyle = '#ffffff'; const w = widthAt(u, 8) * Math.sin(u * 40 + t); g.fillRect(x + nx * w - 1, y + ny * w - 1, 2.5, 2.5); });
    }
    if (st.glass) { g.globalAlpha = 0.35; g.strokeStyle = pal.tip; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= steps; i++) { const [x, y] = pt(0.2 + i / steps * 0.8); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (skin.drips) { // goop drips hanging off the rod
      g.fillStyle = '#7fe24f';
      along(0.3, 0.8, 4, (u, x, y) => { const len = 10 + ((t * 0.7 + u * 3) % 1) * 18; g.beginPath(); g.moveTo(x - 4, y); g.quadraticCurveTo(x - 4, y + len, x, y + len + 4); g.quadraticCurveTo(x + 4, y + len, x + 4, y); g.fill(); });
    }
    // grip, reel and guides
    const [gx, gy] = pt(0.1), [rx, ry] = pt(0.2);
    g.strokeStyle = pal.grip; g.lineWidth = 26 * Math.max(1, k * 0.95);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(gx, gy); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const [px, py] = pt(i * 0.018); g.beginPath(); g.moveTo(px - 12, py + 4); g.lineTo(px + 12, py - 4); g.stroke(); }
    const reel = g.createRadialGradient(rx - 6, ry - 8, 2, rx, ry, 30);
    reel.addColorStop(0, pal.reel[0]); reel.addColorStop(0.4, pal.reel[1]); reel.addColorStop(1, pal.reel[2]);
    g.fillStyle = reel; g.beginPath(); g.arc(rx + 22, ry + 6, 28, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(0,0,0,.55)'; g.beginPath(); g.arc(rx + 22, ry + 6, 9, 0, 6.29); g.fill();
    const spin = t * (this.reeling ? 14 : 0);
    g.strokeStyle = pal.reel[0]; g.lineWidth = 3;
    g.beginPath(); g.moveTo(rx + 22, ry + 6); g.lineTo(rx + 22 + Math.cos(spin) * 24, ry + 6 + Math.sin(spin) * 24); g.stroke();
    g.strokeStyle = '#d8e6e2'; g.lineWidth = 2;
    for (const u of [0.42, 0.6, 0.75, 0.88]) { const [px, py] = pt(u); g.beginPath(); g.arc(px + 4, py + 4, 5 * (1.2 - u), 0, 6.29); g.stroke(); }
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7;
    g.drawImage(this.tintGlow(pal.tip.startsWith('hsl') ? '#ffffff' : pal.tip), tipX - 12, tipY - 12, 24, 24);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = pal.tip; g.beginPath(); g.arc(tipX, tipY, 3.5, 0, 6.29); g.fill();
  }

  /** Colour of the fishing line (rainbow cycles). */
  lineColor() {
    const l = LINES[this.look?.line] || LINES.classic;
    return l.color === 'rainbow' ? `hsl(${(this.t * 90) % 360},95%,65%)` : l.color;
  }

  drawLure(g, x, y, t) {
    const id = this.look?.lure || 'none';
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.4) * 0.15);
    const hook = (hx, hy, r = 6) => { g.strokeStyle = '#c9d6d2'; g.lineWidth = 2; g.beginPath(); g.arc(hx, hy, r, Math.PI, Math.PI * 2.6); g.stroke(); };
    const glow = (col, r, a = 0.6) => { g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.drawImage(this.tintGlow(col), -r, 10 - r, r * 2, r * 2); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
    if (id === 'none') { g.strokeStyle = '#c9d6d2'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 14); g.stroke(); hook(4, 16); }
    else if (id === 'spinner') {
      const sx = Math.cos(t * 9);
      g.fillStyle = '#e8eef0'; g.beginPath(); g.ellipse(6 * sx, 8, 7 * Math.abs(sx) + 1, 11, 0, 0, 6.29); g.fill();
      g.fillStyle = '#ff5a5a'; g.fillRect(-2, 4, 4, 16); hook(3, 26);
      if (sx > 0.8) glow('#ffffff', 22, 0.5);
    } else if (id === 'jig') {
      g.fillStyle = '#ff6ac8'; g.beginPath(); g.arc(0, 6, 7, 0, 6.29); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(2, 4, 2.2, 0, 6.29); g.fill();
      g.strokeStyle = '#ffd23a'; g.lineWidth = 1.6;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 1.5, 11); g.quadraticCurveTo(i * 3 + Math.sin(t * 6 + i) * 2, 20, i * 4, 28); g.stroke(); }
      hook(4, 26);
    } else if (id === 'crank') {
      g.fillStyle = '#5ad88a'; g.beginPath(); g.ellipse(0, 12, 7, 14, 0, 0, 6.29); g.fill();
      g.fillStyle = '#e9fff0'; g.beginPath(); g.ellipse(-2, 14, 3.5, 9, 0, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(220,240,255,.7)'; g.beginPath(); g.moveTo(-6, 0); g.lineTo(6, 0); g.lineTo(0, -6); g.closePath(); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(-2, 5, 1.8, 0, 6.29); g.fill(); hook(4, 30);
    } else if (id === 'spoon') {
      const gr = g.createLinearGradient(-8, 0, 8, 0); gr.addColorStop(0, '#9aa8b0'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#8a98a0');
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 12, 8, 15, 0.1 * Math.sin(t * 3), 0, 6.29); g.fill();
      g.fillStyle = '#ff3a3a'; g.fillRect(-1.5, 22, 3, 6); hook(3, 30);
      if (Math.sin(t * 3) > 0.7) glow('#fff6c0', 26, 0.6);
    } else if (id === 'glowjig') {
      glow('#5ff2ff', 26, 0.55 + Math.sin(t * 4) * 0.2);
      g.fillStyle = '#9ff8ff'; g.beginPath(); g.arc(0, 7, 7, 0, 6.29); g.fill();
      g.strokeStyle = '#5ff2ff'; g.lineWidth = 1.6;
      for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 2, 12); g.lineTo(i * 4, 26); g.stroke(); }
      hook(4, 26);
    } else if (id === 'trophy') {
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, 14, 9, 17, 0, 0, 6.29); g.fill();
      g.fillStyle = '#e02a2a'; g.beginPath(); g.ellipse(0, 4, 9, 8, 0, Math.PI, 0); g.fill(); g.fillRect(-9, 3, 18, 3);
      g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(-3, 7, 2.6, 0, 6.29); g.fill();
      hook(-6, 22, 5); hook(6, 32, 5);
    } else if (id === 'clover') {
      g.fillStyle = '#3fd45a';
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + t * 0.6; g.beginPath(); g.arc(Math.cos(a) * 6, 10 + Math.sin(a) * 6, 6, 0, 6.29); g.fill(); }
      g.fillStyle = '#c6ff5a'; g.beginPath(); g.arc(0, 10, 3, 0, 6.29); g.fill();
      g.strokeStyle = '#2a8a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 16); g.lineTo(2, 26); g.stroke();
      if (Math.sin(t * 2) > 0.8) glow('#c6ff5a', 22, 0.5);
      hook(5, 28);
    } else if (id === 'feather') {
      for (const [col, a] of [['#ff7a3a', -0.5], ['#ffd23a', 0], ['#6fc4ff', 0.5]]) {
        g.save(); g.rotate(a + Math.sin(t * 5 + a) * 0.08); g.fillStyle = col; g.beginPath(); g.ellipse(0, 14, 4, 13, 0, 0, 6.29); g.fill(); g.restore();
      }
      g.fillStyle = '#3a2010'; g.fillRect(-3, 0, 6, 6); hook(4, 26);
    } else if (id === 'diver') {
      g.fillStyle = '#1a3aa8'; g.beginPath(); g.ellipse(0, 14, 6, 17, 0, 0, 6.29); g.fill();
      g.fillStyle = '#6fc4ff'; g.beginPath(); g.ellipse(-1.5, 15, 2.5, 12, 0, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(220,240,255,.75)'; g.beginPath(); g.moveTo(-8, -2); g.lineTo(8, -2); g.lineTo(0, -12); g.closePath(); g.fill();
      hook(4, 34);
    }
    g.restore();
  }

  /** Sight fishing: the shadow of the fish you are after, drifting under the water. */
  drawSightShadow(g) {
    const s = this.sightView, a = this.sightAnchor;
    if (!s || !a) return;
    const x = a.x + (s.shadow - 0.5) * W * 0.5;
    const y = a.y + 36;
    const pulse = 1 + Math.sin(performance.now() / 180) * (s.near ? 0.08 : 0.03);
    g.save();
    g.globalAlpha = s.near ? 0.6 : 0.4;
    g.fillStyle = '#04202a';
    g.beginPath(); g.ellipse(x, y, 110 * pulse, 26 * pulse, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = s.near ? 'rgba(232,253,255,0.8)' : 'rgba(232,253,255,0.25)';
    g.lineWidth = 3; g.stroke();
    g.restore();
  }

  drawBobber(g, x, y, s, phase, t) {
    const style = this.look?.bobber || 'classic';
    const r = 19 * s;
    const bite = phase === PHASES.BITE;
    // shadow on the water
    g.fillStyle = 'rgba(0,20,30,.35)'; g.beginPath(); g.ellipse(x, y + r * 0.7, r * 1.6, r * 0.45, 0, 0, 6.29); g.fill();
    const shine = () => { g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.52, r * 0.28, r * 0.16, -0.6, 0, 6.29); g.fill(); };
    const glow = (col, k = 1) => { g.globalCompositeOperation = 'lighter'; g.globalAlpha = (bite ? 1 : 0.6 + Math.sin(t * 3) * 0.2) * k; g.drawImage(this.tintGlow(col), x - r * 2, y - r * 2.6, r * 4, r * 4); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; };
    const eye = (ex, ey, er, look = 0) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, er, 0, 6.29); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(ex + Math.sin(t * 2 + look) * er * 0.35, ey + er * 0.2, er * 0.5, 0, 6.29); g.fill(); };
    if (style === 'classic') {
      g.globalAlpha = 0.35; g.fillStyle = '#ff5a5a'; g.beginPath(); g.ellipse(x, y + r * 1.6, r * 0.9, r * 0.5, 0, 0, 6.29); g.fill(); g.globalAlpha = 1;
      const body = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.2);
      body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#c9d4d6');
      g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.fill();
      const red = g.createRadialGradient(x - r * 0.4, y - r * 0.6, r * 0.1, x, y, r * 1.2);
      red.addColorStop(0, '#ff9a8a'); red.addColorStop(0.5, '#ff3b3b'); red.addColorStop(1, '#a3121e');
      g.fillStyle = red; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
      g.fillStyle = '#222'; g.fillRect(x - r, y - r * 0.08, r * 2, r * 0.16);
      g.strokeStyle = '#f2f2f2'; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y - r * 2.3); g.stroke();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = bite ? 1 : 0.6 + Math.sin(t * 3) * 0.2;
      g.drawImage(this.tintGlow('#8df28a'), x - r * 1.6, y - r * 3.9, r * 3.2, r * 3.2);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#c9ff7a'; g.beginPath(); g.arc(x, y - r * 2.35, 3.2 * s, 0, 6.29); g.fill();
      shine();
    } else if (style === 'slime') {
      glow('#8df28a', 0.6);
      const wob = Math.sin(t * 5) * 0.08;
      const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.6, r * 0.1, x, y, r * 1.3);
      gr.addColorStop(0, '#e9ff9a'); gr.addColorStop(0.5, '#59e04a'); gr.addColorStop(1, '#1f8d2c');
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y - r * 0.2, r * (1.15 + wob), r * (1 - wob), 0, 0, 6.29); g.fill();
      g.beginPath(); g.ellipse(x - r * 0.7, y + r * 0.5, r * 0.25, r * 0.4, 0, 0, 6.29); g.ellipse(x + r * 0.6, y + r * 0.55, r * 0.22, r * 0.35, 0, 0, 6.29); g.fill();
      eye(x - r * 0.38, y - r * 0.45, r * 0.32, 0); eye(x + r * 0.38, y - r * 0.5, r * 0.28, 1.5); shine();
    } else if (style === 'star') {
      glow('#fff27a', 0.8);
      g.save(); g.translate(x, y - r * 0.2); g.rotate(Math.sin(t * 1.5) * 0.2);
      g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.55 : r * 1.25; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath();
      const gr = g.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.3); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.5, '#ffd23a'); gr.addColorStop(1, '#e08a12');
      g.fillStyle = gr; g.fill(); g.strokeStyle = '#a85a00'; g.lineWidth = 2 * s; g.stroke();
      g.fillStyle = '#5a2a00'; g.beginPath(); g.arc(-r * 0.22, -r * 0.1, r * 0.1, 0, 6.29); g.arc(r * 0.22, -r * 0.1, r * 0.1, 0, 6.29); g.fill();
      g.restore();
    } else if (style === 'duck') {
      g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(x, y, r * 1.25, r * 0.75, 0, 0, 6.29); g.fill();
      g.beginPath(); g.arc(x + r * 0.55, y - r * 0.75, r * 0.6, 0, 6.29); g.fill();
      g.fillStyle = '#ffb02a'; g.beginPath(); g.ellipse(x - r * 0.3, y - r * 0.1, r * 0.55, r * 0.3, -0.3, 0, 6.29); g.fill();
      g.fillStyle = '#ff7a1a'; g.beginPath(); g.ellipse(x + r * 1.15, y - r * 0.62, r * 0.38, r * 0.16, 0.1, 0, 6.29); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(x + r * 0.72, y - r * 0.92, r * 0.11, 0, 6.29); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(x + r * 0.35, y - r * 1.05, r * 0.15, r * 0.09, -0.5, 0, 6.29); g.fill();
    } else if (style === 'eyeball') {
      const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, 1, x, y, r * 1.2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#d8c8c8');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y - r * 0.1, r * 1.05, 0, 6.29); g.fill();
      g.strokeStyle = 'rgba(220,60,60,.5)'; g.lineWidth = 1;
      for (let i = 0; i < 5; i++) { const a = i * 1.3; g.beginPath(); g.moveTo(x + Math.cos(a) * r, y - r * 0.1 + Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r * 0.55, y - r * 0.1 + Math.sin(a) * r * 0.55); g.stroke(); }
      const lx = x + Math.sin(t * 0.8) * r * 0.3, ly = y - r * 0.2 + (bite ? -r * 0.2 : 0);
      g.fillStyle = '#3fc63a'; g.beginPath(); g.arc(lx, ly, r * 0.5, 0, 6.29); g.fill();
      g.fillStyle = '#071a0a'; g.beginPath(); g.arc(lx, ly, r * (bite ? 0.35 : 0.22), 0, 6.29); g.fill();
      shine();
    } else if (style === 'lantern') {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.75 + Math.sin(t * 7) * 0.08;
      g.drawImage(this.tintGlow('#ffb85a'), x - r * 4, y - r * 4.2, r * 8, r * 8);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#3a2a1a'; g.fillRect(x - r * 0.75, y - r * 1.5, r * 1.5, r * 0.3); g.fillRect(x - r * 0.85, y + r * 0.25, r * 1.7, r * 0.35);
      const gr = g.createRadialGradient(x, y - r * 0.6, 1, x, y - r * 0.6, r); gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.5, '#ffc04a'); gr.addColorStop(1, '#c86a10');
      g.fillStyle = gr; g.fillRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 1.45);
      g.strokeStyle = '#3a2a1a'; g.lineWidth = 2 * s; g.strokeRect(x - r * 0.6, y - r * 1.2, r * 1.2, r * 1.45);
      g.beginPath(); g.arc(x, y - r * 1.55, r * 0.45, Math.PI, 0); g.stroke();
    } else if (style === 'crystal') {
      glow('#7ad8ff', 0.8);
      g.save(); g.translate(x, y - r * 0.3);
      const pts = [[0, -r * 1.4], [r * 0.9, -r * 0.2], [0, r * 0.9], [-r * 0.9, -r * 0.2]];
      const faces = [['#e8fbff', [0, 1, 2]], ['#7ad8ff', [0, 2, 3]], ['#3a9ad8', [1, 2]], ['#bff0ff', [0, 1]]];
      for (const [col, idx] of faces) { g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); for (const i of idx) g.lineTo(...pts[i]); g.closePath(); g.fill(); }
      g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 1.5; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.stroke();
      const tw = Math.max(0, Math.sin(t * 3)); g.fillStyle = `rgba(255,255,255,${tw})`; g.fillRect(-r * 0.5, -r * 0.8, r * 0.7 * tw + 1, 2); g.fillRect(-r * 0.17, -r * 1.1, 2, r * 0.7 * tw + 1);
      g.restore();
    } else if (style === 'golden') {
      glow('#ffd23a', 0.9);
      const art = this.a['goop:kinggloop'];
      if (art) { const w = r * 3.2, h = w * art.height / art.width; g.drawImage(art, x - w / 2, y - h * 0.75 + Math.sin(t * 2) * 2, w, h); }
      else { g.fillStyle = '#ffd23a'; g.beginPath(); g.arc(x, y, r, 0, 6.29); g.fill(); }
    }
  }

  /** A rod standing upright (for the rack in the Bait Shack). */
  drawRodIcon(ctx, x, baseY, h, look) {
    const saveLook = this.look, saveReel = this.reeling;
    this.look = look; this.reeling = false;
    this.drawRod(ctx, { bx: x, by: baseY, tipX: x + h * 0.06, tipY: baseY - h, cx: x + h * 0.01, cy: baseY - h * 0.5, tension: 0 });
    this.look = saveLook; this.reeling = saveReel;
  }

  /** Small live preview of a loadout for the tackle box (draws into its own canvas). */
  drawPreview(ctx, look, dt) {
    const c = ctx.canvas, w = c.width, h = c.height;
    this.previewT = (this.previewT || 0) + dt;
    const saveT = this.t, saveLook = this.look, saveReel = this.reeling;
    this.t = this.previewT; this.look = look; this.reeling = true;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0b2a3a'); bg.addColorStop(0.45, '#0f4a5e'); bg.addColorStop(0.46, '#0c3a4c'); bg.addColorStop(1, '#06202c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    const k = Math.min(w / 900, h / 360);
    ctx.setTransform(k, 0, 0, k, (w - 900 * k) / 2, 0);
    const t = this.t;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { ctx.globalAlpha = 0.08 + 0.06 * Math.sin(t * 2 + i); ctx.drawImage(this.dot, (i * 97 + t * 20) % 1100 - 100, 175 + (i % 6) * 32, 160, 6); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    const rod = { bx: 150, by: 430, tipX: 560, tipY: 60, cx: 300, cy: 200, tension: 0 };
    const bx = 770, by = 190 + Math.sin(t * 2.6) * 4;
    const lc = this.lineColor(), l = LINES[look.line] || LINES.classic;
    ctx.lineCap = 'round';
    const curve = () => { ctx.beginPath(); ctx.moveTo(rod.tipX, rod.tipY); ctx.quadraticCurveTo((rod.tipX + bx) / 2 + 20, (rod.tipY + by) / 2 + 40, bx, by - 36); ctx.stroke(); };
    if (l.glow) { ctx.strokeStyle = lc; ctx.globalAlpha = 0.3; ctx.lineWidth = 7; curve(); ctx.globalAlpha = 1; }
    ctx.strokeStyle = lc; ctx.lineWidth = 2.4; curve();
    // under the water down to the lure
    ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(bx, by + 10); ctx.quadraticCurveTo(bx - 20, by + 60, bx - 80, by + 92); ctx.stroke(); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(bx - 80, by + 92); ctx.scale(2, 2); this.drawLure(ctx, 0, 0, t); ctx.restore();
    this.drawBobber(ctx, bx, by, 2.2, PHASES.CAST, t);
    this.drawRod(ctx, rod);
    this.t = saveT; this.look = saveLook; this.reeling = saveReel;
  }

  drawGoopUnder(g, game, t) {
    const goop = game.goop;
    const phase = game.phase;
    if (!goop || !(phase === PHASES.CAST || phase === PHASES.BITE || phase === PHASES.FIGHT)) return;
    if (this.cast && !this.cast.landed) return;
    if (this.jump) return;
    const sil = this.silhouette(goop.id);
    const art = this.a[`goop:${goop.id}`];
    if (!sil || !art) return;
    const b = this.bobber;
    const ds = 0.6 + (b.y - HZ) / (H - HZ) * 0.8;
    const p = goop.pattern || 'steady';
    const wave = (rate, phase = 0) => Math.sin(t * rate + phase);
    let x, y, a, sc, colorA = 0;
    if (phase === PHASES.CAST) {
      // The fish investigates the lure with a temperament-specific approach instead of
      // tracing the same orbit as every other species.
      const orbit = t * ({ steady: 0.48, pulse: 0.72, dart: 1.8, drift: 0.3, sleepy: 0.22, wild: 1.35 }[p] || 0.65);
      const lateral = ({ steady: 88, pulse: 112, dart: 150, drift: 178, sleepy: 54, wild: 164 }[p] || 100) * ds;
      const feint = p === 'dart' ? wave(9.5) * 42 : p === 'wild' ? wave(7.1) * 34 + wave(13.4, 1.2) * 18 : 0;
      const rest = p === 'sleepy' && wave(0.8) > 0.72 ? 0.12 : 1;
      x = b.x + Math.cos(orbit) * lateral + feint;
      y = b.y + 58 * ds + wave(p === 'pulse' ? 3.8 : p === 'wild' ? 5.2 : 1.4) * (p === 'drift' ? 10 : 22) * ds * rest;
      a = clamp((game.timer - 0.3) * 0.5, 0, 0.38) * (p === 'sleepy' ? 0.82 + wave(0.8) * 0.12 : 1);
      sc = 0.36 * ds;
    } else if (phase === PHASES.BITE) {
      // The final approach is a readable preview of the creature's temperament.
      const motion = {
        steady: [wave(2.1) * 5, wave(1.1) * 4],
        pulse: [wave(3.8) * 13, Math.abs(wave(3.8)) * 12],
        dart: [wave(10.5) * 19, wave(6.8) * 9],
        drift: [wave(0.9) * 17, wave(1.4) * 5],
        sleepy: [wave(0.65) * 4, wave(0.7) > 0.78 ? -15 : 3],
        wild: [wave(7.2) * 15 + wave(12.6, 1) * 8, wave(5.7) * 12],
      }[p] || [wave(2) * 6, wave(1.2) * 4];
      x = b.x + 30 + motion[0]; y = b.y + 50 * ds + motion[1] * ds;
      a = 0.64; sc = 0.5 * ds;
    } else {
      const f = game.fight;
      const move = f?.move?.type;
      const pulse = Math.sin(t * 8);
      const signatures = {
        swerve: [Math.sin(t * 13) * 76, Math.sin(t * 5) * 8],
        tug: [Math.sin(t * 2.2) * 18, Math.sin(t * 2.2 + 0.8) * 9],
        fakeout: [Math.sin(t * 0.7) * 5, move === 'fakeout' && f.move?.state === 'still' ? 0 : Math.sin(t * 2.4) * 16],
        rhythm: [Math.sin(t * 7) * 12, Math.abs(pulse) * 18],
        current: [Math.sin(t * 1.8) * 54, Math.cos(t * 1.8) * 12],
        thrash: [Math.sin(t * 17) * 34 + Math.sin(t * 23) * 18, Math.sin(t * 14) * 20],
      };
      const motion = signatures[move] || [Math.sin(t * 4.2) * 40 * (0.4 + f.tension), Math.sin(t * 3) * 10];
      x = b.x + motion[0]; y = b.y + 50 * ds + motion[1];
      a = move === 'fakeout' && f.move?.state === 'still' ? 0.48 : 0.8;
      sc = 0.62 * ds; colorA = 0.45;
    }
    let reactionPose = null;
    if (phase === PHASES.FIGHT && this.goopReaction) {
      reactionPose = fightReactionPose(this.goopReaction, Date.now(), x, y, b.x);
      if (!reactionPose) this.goopReaction = null;
      else {
        x = reactionPose.x; y = reactionPose.y;
        sc *= reactionPose.scale; a *= reactionPose.alpha;
      }
    }
    const w = art.width * sc, h = art.height * sc;
    const flip = Math.cos(t * (p === 'dart' ? 2.8 : 0.9)) < 0 && phase === PHASES.CAST ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(flip, 0.8);
    g.globalAlpha = a; g.drawImage(sil, -w / 2, -h / 2, w, h);
    if (colorA) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = colorA * (0.6 + Math.sin(t * 6) * 0.4);
      g.drawImage(this.tintGlow(goop.color), -w, -h, w * 2, h * 2);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = colorA;
      g.drawImage(art, -w / 2, -h / 2, w, h);
    }
    g.restore(); g.globalAlpha = 1;
    if (reactionPose && reactionPose.strength > 0.01) {
      // A short-lived ring follows the Goop itself: green on a clean counter, warm on a mistake.
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = reactionPose.type === 'win' ? '#8df28a' : '#ffad91';
      g.lineWidth = reactionPose.type === 'win' ? 4 : 5;
      g.globalAlpha = (1 - reactionPose.progress) * 0.48;
      const radius = 34 + reactionPose.progress * 76;
      g.beginPath(); g.ellipse(x, y + h * 0.22, radius * ds, 8 + reactionPose.progress * 13, 0, 0, Math.PI * 2); g.stroke();
      g.restore();
    }
    if (phase === PHASES.BITE) {
      // Small surface tells make the approach legible without adding another HUD meter.
      const cue = p === 'dart' || p === 'wild' ? 2 : p === 'pulse' ? 3 : 1;
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = hexA(goop.color, 0.48); g.lineWidth = 3;
      for (let i = 0; i < cue; i++) {
        const pulse = (t * (p === 'pulse' ? 1.8 : p === 'dart' ? 2.8 : 1.1) + i / cue) % 1;
        const r = (18 + pulse * 42) * ds;
        g.globalAlpha = (1 - pulse) * 0.38;
        g.beginPath(); g.ellipse(b.x + 24 + motionlessOffset(p, t, i), b.y + 22 * ds, r * (p === 'drift' ? 1.7 : 1), r * 0.34, 0, 0, Math.PI * 2); g.stroke();
      }
      g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (phase === PHASES.FIGHT && game.fight) {
      // Signature moves speak through the water: each challenge gets a distinct physical cue.
      const move = game.fight.move?.type;
      const f = game.fight;
      const cx = x, cy = y + 18 * ds;
      g.save(); g.globalCompositeOperation = 'lighter';
      if (move === 'swerve' || move === 'thrash') {
        const count = move === 'thrash' ? 5 : 3;
        g.strokeStyle = hexA(goop.color, 0.42); g.lineWidth = move === 'thrash' ? 4 : 3;
        for (let i = 0; i < count; i++) {
          const side = Math.sin(t * (move === 'thrash' ? 17 : 11) + i * 2) * (move === 'thrash' ? 62 : 92);
          g.globalAlpha = 0.42 - i * 0.055;
          g.beginPath(); g.ellipse(cx + side, cy + i * 9, 34 + i * 12, 7 + i * 2, side * 0.002, 0, Math.PI * 2); g.stroke();
        }
      } else if (move === 'tug') {
        g.strokeStyle = hexA(goop.color, 0.5); g.lineWidth = 5; g.globalAlpha = 0.65;
        const pull = Math.sin(t * 2.2) * 26;
        g.beginPath(); g.moveTo(cx - 95 + pull, cy + 22); g.quadraticCurveTo(cx, cy + 42 + pull, cx + 95 + pull, cy + 22); g.stroke();
      } else if (move === 'fakeout') {
        const still = f.move?.state === 'still';
        g.strokeStyle = hexA(goop.color, still ? 0.2 : 0.55); g.lineWidth = still ? 2 : 4;
        g.globalAlpha = still ? 0.24 : 0.65;
        g.beginPath(); g.ellipse(cx, cy + 20, still ? 38 : 78 + Math.sin(t * 8) * 12, still ? 8 : 18, 0, 0, Math.PI * 2); g.stroke();
      } else if (move === 'rhythm') {
        g.strokeStyle = hexA(goop.color, 0.55); g.lineWidth = 4;
        for (let i = 0; i < 3; i++) {
          const beat = (t * 1.6 + i / 3) % 1;
          g.globalAlpha = (1 - beat) * 0.5;
          g.beginPath(); g.ellipse(cx, cy, 42 + beat * 100, 12 + beat * 28, 0, 0, Math.PI * 2); g.stroke();
        }
      } else if (move === 'current') {
        g.strokeStyle = hexA(goop.color, 0.5); g.lineWidth = 4; g.globalAlpha = 0.55;
        for (let i = 0; i < 3; i++) {
          const a0 = t * 1.8 + i * 2.1;
          g.beginPath(); g.ellipse(cx, cy, 86 + i * 22, 18 + i * 6, a0, a0, a0 + Math.PI * 1.25); g.stroke();
        }
      }
      g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    if (phase === PHASES.FIGHT && this.a.bubbles) {
      const sheet = this.a.bubbles, fw = sheet.width / 8, fr = Math.floor(t * 10) % 8;
      g.globalAlpha = 0.6; g.globalCompositeOperation = 'lighter';
      g.drawImage(sheet, fr * fw, 0, fw, sheet.height, x - 70 * ds, y - 160 * ds, 140 * ds, 140 * ds);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
  }

  drawJump(g, game, dt) {
    if (!this.jump) return;
    const goop = game.goop;
    const art = goop && this.a[`goop:${goop.id}`];
    if (!art || game.phase !== PHASES.FIGHT) { this.jump = null; return; }
    const j = this.jump;
    j.t += dt;
    const p = j.t / j.dur;
    if (p >= 1) { this.splash(j.x + j.dir * 160, j.y, 20, '#ffffff', 0.8); this.ring(j.x + j.dir * 160, j.y, 1.3); this.jump = null; return; }
    const x = j.x + j.dir * (j.big ? 240 : 160) * p, y = j.y - Math.sin(p * Math.PI) * (j.big ? 300 : 190);
    const sc = (j.big ? 0.75 : 0.5) * (0.6 + (j.y - HZ) / (H - HZ) * 0.8);
    g.save(); g.translate(x, y); g.rotate(j.dir * (p - 0.5) * 1.4); g.scale(-j.dir, 1);
    g.drawImage(art, -art.width * sc / 2, -art.height * sc / 2, art.width * sc, art.height * sc);
    g.restore();
    if (Math.random() < 0.6) this.particles.push({ kind: 'drop', x, y: y + 20, vx: (Math.random() - 0.5) * 80, vy: 40, life: 0, max: 0.5, size: 3, color: '#e8fdff', floor: j.y });
  }

  drawReveal(g, game, dt, t) {
    const r = this.reveal;
    if (!r) return;
    if (game.phase !== PHASES.CAUGHT) { this.reveal = null; return; }
    const art = r.shiny ? this.shinyArt(r.id) : this.a[`goop:${r.id}`];
    if (!art) return;
    r.t += dt;
    const fly = clamp(r.t / 0.9, 0, 1);
    const e = ease(fly);
    const cx = W / 2, cy = 360;
    const x = lerp(r.x0, cx, e), y = lerp(r.y0, cy, e) - Math.sin(fly * Math.PI) * 220;
    const sc = lerp(0.3, 1.25, e) * (1 + Math.sin(t * 2.2) * 0.02 * fly);
    r.pos = { x, y: y + Math.sin(t * 2) * 8 * fly - art.height * sc * 0.1 };
    if (fly >= 1 && !r.burst) { r.burst = true; this.sparkle(cx, cy, r.shiny ? 90 : 46, r.shiny ? '#fff6a0' : r.color); this.onReveal?.(r); }
    const col = r.shiny ? '#fff27a' : RARITY_COLOR[r.rarity] || '#ffffff';
    if (fly > 0.6) {
      const a = clamp((fly - 0.6) / 0.4, 0, 1);
      g.save(); g.translate(cx, cy); g.rotate(t * 0.25);
      g.globalCompositeOperation = 'lighter';
      const rays = r.shiny ? 20 : 14;
      for (let i = 0; i < rays; i++) {
        g.rotate((Math.PI * 2) / rays);
        const gr = g.createLinearGradient(0, 0, 520, 0);
        gr.addColorStop(0, hexA(col, 0.26 * a)); gr.addColorStop(1, hexA(col, 0));
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(520, -42); g.lineTo(520, 42); g.closePath(); g.fill();
      }
      g.restore();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.7 * a;
      g.drawImage(this.tintGlow(r.color), cx - 300, cy - 300, 600, 600);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.save(); g.translate(x, y + Math.sin(t * 2) * 8 * fly); g.rotate((1 - e) * -0.8 + Math.sin(t * 1.6) * 0.04 * fly);
    g.drawImage(art, -art.width * sc / 2, -art.height * sc / 2, art.width * sc, art.height * sc);
    g.restore();
    if (fly < 1 && Math.random() < 0.8) this.particles.push({ kind: 'drop', x, y: y + 30, vx: (Math.random() - 0.5) * 60, vy: 60, life: 0, max: 0.6, size: 4, color: r.color, floor: 2000 });
    if (fly >= 1 && Math.random() < dt * (r.shiny ? 20 : 8)) this.particles.push({ kind: 'spark', x: cx + (Math.random() - 0.5) * 300, y: cy + (Math.random() - 0.5) * 200, vx: 0, vy: -40, life: 0, max: 1.2, size: 10 + Math.random() * 14, color: col });
  }

  drawParticles(g, dt) {
    const keep = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'drop') {
        p.vy += 1100 * dt;
        if (p.y > p.floor && p.vy > 0) { if (Math.random() < 0.3) this.ring(p.x, p.floor, 0.15); continue; }
      } else { p.vx *= 0.96; p.vy *= 0.96; }
      keep.push(p);
    }
    this.particles = keep.slice(-500);
    g.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      if (p.kind === 'drop') {
        g.globalAlpha = 0.9 * k;
        g.drawImage(this.tintGlow(p.color), p.x - p.size * 2, p.y - p.size * 2, p.size * 4, p.size * 4);
        g.globalAlpha = k; g.fillStyle = '#ffffff';
        g.fillRect(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.6, p.size * 0.6);
      } else {
        g.globalAlpha = k;
        const s = p.size * (0.5 + k * 0.5);
        g.drawImage(this.tintGlow(p.color), p.x - s, p.y - s, s * 2, s * 2);
        g.globalAlpha = k * 0.9; g.fillStyle = '#fff';
        g.save(); g.translate(p.x, p.y); g.rotate(p.life * 3);
        g.fillRect(-s * 0.5, -1, s, 2); g.fillRect(-1, -s * 0.5, 2, s);
        g.restore();
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  // ----- finishing pass -----

  drawGrade(g, time, weather, phase, game) {
    const cw = this.canvas.width, ch = this.canvas.height;
    // ambient colour of the nearby shore
    for (const sp of SPOTS) {
      const tint = SPOT_TINT[sp.id];
      if (!tint || (sp.secret && !this.revealed.has(sp.id))) continue;
      const w = clamp(1 - Math.abs(this.camX - SPOT_X[sp.id]) / SPOT_GAP, 0, 1);
      if (w <= 0) continue;
      g.globalCompositeOperation = 'soft-light'; g.globalAlpha = tint[1] * w * (time === 'Day' ? 0.6 : 1);
      g.fillStyle = tint[0]; g.fillRect(0, 0, cw, ch);
    }
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (!this.vignette) {
      const v = makeCanvas(cw, ch), vg = v.getContext('2d');
      const rg = vg.createRadialGradient(cw / 2, ch * 0.55, ch * 0.35, cw / 2, ch * 0.55, ch * 1.05);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,8,14,.62)');
      vg.fillStyle = rg; vg.fillRect(0, 0, cw, ch);
      this.vignette = v;
    }
    g.drawImage(this.vignette, 0, 0);
    const sky = SKIES[time];
    g.globalCompositeOperation = 'soft-light';
    g.globalAlpha = time === 'Night' ? 0.12 : 0.22;
    g.fillStyle = sky.light; g.fillRect(0, 0, cw, ch);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    if (this.flash > 0) {
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(200,215,255,${this.flash * 0.55})`; g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'source-over';
      this.flash = Math.max(0, this.flash - 0.06);
    }
    const f = phase === PHASES.FIGHT ? game.fight : null;
    const danger = f ? clamp((f.tension - 0.85) / 0.15, 0, 1) : 0;
    const lost = this.snap ? clamp(1 - this.snap.t / 0.8, 0, 1) : 0;
    const d = Math.max(danger * (0.6 + Math.sin(this.t * 14) * 0.4), lost);
    if (d > 0.01) {
      const rg = g.createRadialGradient(cw / 2, ch / 2, ch * 0.3, cw / 2, ch / 2, ch * 0.9);
      rg.addColorStop(0, 'rgba(255,40,40,0)'); rg.addColorStop(1, `rgba(255,40,50,${0.45 * d})`);
      g.fillStyle = rg; g.fillRect(0, 0, cw, ch);
    }
  }

  /** A small snapshot of the current view (used for the pond map cards). */
  snapshot(w = 320) {
    const c = makeCanvas(w, w * H / W);
    c.getContext('2d').drawImage(this.canvas, 0, 0, c.width, c.height);
    try { return c.toDataURL('image/webp', 0.75); } catch { return null; }
  }
}
