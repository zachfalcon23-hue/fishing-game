// Goop Fishing — North Pond renderer (presentation only; reads game state, never changes it).
// The pond is one continuous shoreline. The camera walks along it; every layer scrolls at its
// own depth so near things slide past faster than far ones.
import { PHASES, SPOTS, NOTES, SPOT_BY, GOOPS } from './game.js';

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
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
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
      this.reveal = null; this.snap = null; this.jump = null;
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
      const g = game.goop;
      this.reveal = { t: 0, id: g.id, color: g.color, rarity: g.rarity, shiny: e.detail.shiny, x0: this.bobber.x, y0: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 46, '#ffffff', 1.5);
      this.ring(this.bobber.x, this.bobber.y, 2.2);
      this.cam.shake = 14;
    } else if (e.type === 'escaped') {
      this.snap = { t: 0, x: this.bobber.x, y: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 18, '#ffffff', 1);
      this.cam.shake = 16;
    } else if (e.type === 'lunge') {
      this.cam.shake = 18;
      this.splash(this.bobber.x, this.bobber.y, 20, '#ffffff', 1.1);
    } else if (e.type === 'dodge') {
      this.sparkle(this.bobber.x, this.bobber.y - 30, 14, '#8df28a');
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
    this.drawWater(g, base, time, weather, t, spotOff);

    this.drawSecretsMid(g, base, game, t);
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

  drawWater(g, base, time, weather, t, spotOff) {
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
    const h = 118, w = art.width / art.height * h;
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
    if (this.cast) {
      this.cast.t += dt;
      const p = clamp(this.cast.t / this.cast.dur, 0, 1);
      if (p >= 1 && !this.cast.landed) { this.cast.landed = true; this.splash(this.cast.tx, this.cast.ty, 14, '#e8fdff', 0.7); this.ring(this.cast.tx, this.cast.ty, 1); this.onSplash?.(); }
      if (this.cast.landed && this.cast.t > this.cast.dur + 0.4) this.cast = null;
      else if (!this.cast.landed) {
        const e = ease(p);
        b.x = lerp(rod.tipX, this.cast.tx, e);
        b.y = lerp(rod.tipY, this.cast.ty, e) - Math.sin(p * Math.PI) * 260;
      }
    }
    if (!this.cast || this.cast.landed) {
      if (this.cast?.landed) { b.x = this.cast.tx; b.y = this.cast.ty; }
      if (fight) {
        if (this.castX == null) { this.castX = b.x; this.castY = b.y; }
        const pull = Math.sin(t * 2.1) * 60 + Math.sin(t * 5.3) * 18 * fight.tension;
        const tx = lerp(this.castX, rod.bx + 120, fight.progress * 0.55) + pull;
        const ty = lerp(this.castY, H - 260, fight.progress * 0.5);
        b.x = lerp(b.x, tx, 1 - Math.exp(-dt * 3));
        b.y = lerp(b.y, ty, 1 - Math.exp(-dt * 3));
        if (Math.random() < dt * (0.6 + fight.tension * 2.2)) this.ring(b.x, b.y, 0.6 + fight.tension * 0.6);
        if (Math.random() < dt * 4 * fight.tension) this.splash(b.x, b.y, 3, '#e8fdff', 0.4);
        if (!this.jump && fight.tension > 0.72 && Math.random() < dt * 0.5) {
          this.jump = { t: 0, dur: 0.85, x: b.x + (Math.random() - 0.5) * 120, y: b.y + 10, dir: Math.random() < 0.5 ? -1 : 1 };
          this.splash(this.jump.x, this.jump.y, 18, '#ffffff', 0.9);
        }
      }
    }
    if (phase === PHASES.IDLE) this.castX = null;
    let dip = 0;
    if (phase === PHASES.BITE) dip = 6 + Math.abs(Math.sin(t * 16)) * 14;
    else if (phase === PHASES.FIGHT) dip = 10 + (fight?.tension || 0) * 8;
    else if (phase === PHASES.CAST && game.timer > 0.4 && Math.random() < dt * 1.5) { this.ring(b.x, b.y, 0.35); b.dip = 6; }
    b.dip = Math.max(0, (b.dip || 0) - dt * 20);
    this.bob = Math.sin(t * 2.6) * 3 + dip + b.dip;
    this.depthScale = 0.6 + (b.y - HZ) / (H - HZ) * 0.8;
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
      g.strokeStyle = hot ? 'rgba(255,120,110,.35)' : 'rgba(220,255,240,.18)';
      g.lineWidth = hot ? 7 : 5;
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.strokeStyle = hot ? '#ff8f80' : '#eafff4';
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

  drawLure(g, x, y, t) {
    g.save(); g.translate(x, y); g.rotate(Math.sin(t * 1.4) * 0.15);
    g.fillStyle = '#8df28a'; g.beginPath(); g.ellipse(0, 10, 7, 14, 0, 0, 6.29); g.fill();
    g.fillStyle = '#e9fff0'; g.beginPath(); g.arc(-2, 5, 2.5, 0, 6.29); g.fill();
    g.strokeStyle = '#c9d6d2'; g.lineWidth = 2; g.beginPath(); g.arc(4, 28, 6, Math.PI, Math.PI * 2.6); g.stroke();
    g.restore();
  }

  drawBobber(g, x, y, s, phase, t) {
    const r = 19 * s;
    g.globalAlpha = 0.35; g.fillStyle = '#ff5a5a'; g.beginPath(); g.ellipse(x, y + r * 1.6, r * 0.9, r * 0.5, 0, 0, 6.29); g.fill(); g.globalAlpha = 1;
    g.fillStyle = 'rgba(0,20,30,.35)'; g.beginPath(); g.ellipse(x, y + r * 0.7, r * 1.6, r * 0.45, 0, 0, 6.29); g.fill();
    const body = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.2);
    body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#c9d4d6');
    g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.fill();
    const red = g.createRadialGradient(x - r * 0.4, y - r * 0.6, r * 0.1, x, y, r * 1.2);
    red.addColorStop(0, '#ff9a8a'); red.addColorStop(0.5, '#ff3b3b'); red.addColorStop(1, '#a3121e');
    g.fillStyle = red; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
    g.fillStyle = '#222'; g.fillRect(x - r, y - r * 0.08, r * 2, r * 0.16);
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y - r * 2.3); g.stroke();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = phase === PHASES.BITE ? 1 : 0.6 + Math.sin(t * 3) * 0.2;
    g.drawImage(this.tintGlow('#8df28a'), x - r * 1.6, y - r * 3.9, r * 3.2, r * 3.2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c9ff7a'; g.beginPath(); g.arc(x, y - r * 2.35, 3.2 * s, 0, 6.29); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.52, r * 0.28, r * 0.16, -0.6, 0, 6.29); g.fill();
  }

  drawRod(g, rod) {
    const { bx, by, tipX, tipY, cx, cy } = rod;
    const passes = [[26, '#1e120a'], [19, '#5a3420'], [13, '#a8693a'], [5, '#f6c995']];
    g.lineCap = 'round';
    const steps = 22;
    const pt = (u) => { const a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c = u * u; return [a * bx + b2 * cx + c * tipX, a * by + b2 * cy + c * tipY]; };
    for (const [w, col] of passes) {
      g.strokeStyle = col;
      for (let i = 0; i < steps; i++) {
        const u0 = i / steps, u1 = (i + 1) / steps;
        const [x0, y0] = pt(u0), [x1, y1] = pt(u1);
        g.lineWidth = Math.max(1.2, w * (1 - u0 * 0.82));
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
    const [gx, gy] = pt(0.1), [rx, ry] = pt(0.2);
    g.strokeStyle = '#c99c62'; g.lineWidth = 26;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(gx, gy); g.stroke();
    g.strokeStyle = 'rgba(80,50,20,.35)'; g.lineWidth = 2;
    for (let i = 1; i < 6; i++) { const [px, py] = pt(i * 0.018); g.beginPath(); g.moveTo(px - 12, py + 4); g.lineTo(px + 12, py - 4); g.stroke(); }
    const reel = g.createRadialGradient(rx - 6, ry - 8, 2, rx, ry, 30);
    reel.addColorStop(0, '#e9fff0'); reel.addColorStop(0.4, '#5ad88a'); reel.addColorStop(1, '#14502e');
    g.fillStyle = reel; g.beginPath(); g.arc(rx + 22, ry + 6, 28, 0, 6.29); g.fill();
    g.fillStyle = '#0f2f1d'; g.beginPath(); g.arc(rx + 22, ry + 6, 9, 0, 6.29); g.fill();
    const spin = this.t * (this.reeling ? 14 : 0);
    g.strokeStyle = '#e9fff0'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(rx + 22, ry + 6); g.lineTo(rx + 22 + Math.cos(spin) * 24, ry + 6 + Math.sin(spin) * 24); g.stroke();
    g.strokeStyle = '#d8e6e2'; g.lineWidth = 2;
    for (const u of [0.42, 0.6, 0.75, 0.88]) { const [px, py] = pt(u); g.beginPath(); g.arc(px + 4, py + 4, 5 * (1.2 - u), 0, 6.29); g.stroke(); }
    g.fillStyle = '#8df28a'; g.beginPath(); g.arc(tipX, tipY, 3.5, 0, 6.29); g.fill();
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
    let x, y, a, sc, colorA = 0;
    if (phase === PHASES.CAST) {
      const circle = t * 0.9;
      x = b.x + Math.cos(circle) * 140 * ds; y = b.y + 60 * ds + Math.sin(circle) * 30 * ds;
      a = clamp((game.timer - 0.3) * 0.5, 0, 0.35); sc = 0.36 * ds;
    } else if (phase === PHASES.BITE) {
      x = b.x + 30 + Math.sin(t * 7) * 8; y = b.y + 50 * ds; a = 0.6; sc = 0.5 * ds;
    } else {
      const f = game.fight;
      x = b.x + Math.sin(t * 4.2) * 40 * (0.4 + f.tension); y = b.y + 50 * ds + Math.sin(t * 3) * 10;
      a = 0.8; sc = 0.62 * ds; colorA = 0.45;
    }
    const w = art.width * sc, h = art.height * sc;
    const flip = Math.cos(t * 0.9) < 0 && phase === PHASES.CAST ? -1 : 1;
    g.save(); g.translate(x, y); g.scale(flip, 0.8);
    g.globalAlpha = a; g.drawImage(sil, -w / 2, -h / 2, w, h);
    if (colorA) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = colorA * (0.6 + Math.sin(t * 6) * 0.4);
      g.drawImage(this.tintGlow(goop.color), -w, -h, w * 2, h * 2);
      g.globalCompositeOperation = 'source-over'; g.globalAlpha = colorA;
      g.drawImage(art, -w / 2, -h / 2, w, h);
    }
    g.restore(); g.globalAlpha = 1;
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
    const x = j.x + j.dir * 160 * p, y = j.y - Math.sin(p * Math.PI) * 190;
    const sc = 0.5 * (0.6 + (j.y - HZ) / (H - HZ) * 0.8);
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
