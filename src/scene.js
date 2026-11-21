// Goop Fishing — layered canvas renderer (presentation only; reads game state, never changes it).
// World space is a fixed 1920×1080 stage; the canvas scales it to whatever size it is shown at.
import { PHASES } from './game.js';

export const W = 1920;
export const H = 1080;

// ---------- assets ----------

const ASSETS = {
  mountains: 'assets/env/mountains.webp',
  forest: 'assets/env/forest.webp',
  waterfall: 'assets/env/waterfall.webp',
  water: 'assets/env/water.webp',
  dock: 'assets/env/dock.webp',
  reeds: 'assets/env/fg_reeds.webp',
  frame: 'assets/env/fg_frame.webp',
  lilyA: 'assets/env/lily_a.webp',
  lilyB: 'assets/env/lily_b.webp',
  ripples: 'assets/fx/water_ripples.webp',
  caustics: 'assets/fx/water_caustics.webp',
  fog: 'assets/fx/fog_drift.webp',
  fireflies: 'assets/fx/fireflies.webp',
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

export async function loadAssets(goopIds, onProgress = () => {}) {
  const entries = [...Object.entries(ASSETS), ...goopIds.map((id) => [`goop:${id}`, GOOP_ART(id)])];
  let done = 0;
  const out = {};
  await Promise.all(entries.map(async ([key, src]) => {
    try { out[key] = await loadImage(src); } catch (err) { console.warn(err.message); out[key] = null; }
    onProgress(++done / entries.length);
  }));
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
// Deterministic pseudo-random so layouts and stars are stable between frames.
function mulberry(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- look tables ----------

// Sky gradients (top → horizon) and light colours for each time of day.
const SKIES = {
  Dawn: { stops: ['#1f2350', '#5b3d78', '#c46c86', '#ffb27f'], sun: '#ffd9a0', sunY: 0.78, cloud: ['#ffc6b0', '#7c5a8c'], stars: 0.25, light: '#ffb98a' },
  Day: { stops: ['#2f78c8', '#4f9ddd', '#8fcdf0', '#d6f1ff'], sun: '#fff8dc', sunY: 0.18, cloud: ['#ffffff', '#9fb8d6'], stars: 0, light: '#fff3d0' },
  Dusk: { stops: ['#14123a', '#4a2560', '#b8456a', '#ff9150'], sun: '#ffb070', sunY: 0.86, cloud: ['#ff9f7a', '#4b2a5c'], stars: 0.35, light: '#ff8a50' },
  Night: { stops: ['#03081c', '#0a1940', '#173062', '#2c5288'], sun: '#eef6ff', sunY: 0.22, cloud: ['#8fb0d8', '#1a2c50'], stars: 1, light: '#a8c8ff' },
};
const STORM_SKY = ['#151a26', '#232b3c', '#384457', '#56637a'];

// Colour grading applied to the painted (night-lit) layers so they sit under each sky.
const TIME_GRADE = {
  Dawn: [['screen', '#3a2e5c', 0.35], ['soft-light', '#ff9a78', 0.75], ['multiply', '#f0d0e0', 0.25]],
  Day: [['screen', '#4f7fa8', 0.32], ['soft-light', '#fff0c0', 0.7], ['overlay', '#7fa0b0', 0.25]],
  Dusk: [['soft-light', '#ff6a3a', 0.6], ['multiply', '#c080b8', 0.35], ['screen', '#2a1030', 0.15]],
  Night: [['multiply', '#d8e4ff', 0.12]],
};
const WEATHER_GRADE = {
  clear: [],
  rain: [['multiply', '#7d8ea6', 0.35]],
  fog: [['screen', '#8c9eaa', 0.2], ['saturation', '#808080', 0.2]],
  storm: [['multiply', '#4f5a70', 0.6]],
};
const SPOT_GRADE = {
  pond: [],
  reeds: [['soft-light', '#9cff7a', 0.28]],
  deep: [['soft-light', '#7a5cff', 0.4], ['multiply', '#9aa0ff', 0.2]],
};

// Per-spot stage layouts. depth drives parallax (0 = infinitely far, 1 = foreground).
const LAYOUTS = {
  pond: {
    hz: 470, moonX: 1330,
    mountains: [{ x: -20, y: 92, w: 1960, depth: 0.12, haze: 0.2 }],
    forest: [
      { x: -260, base: 482, s: 0.44, depth: 0.2, haze: 0.5 },
      { x: 520, base: 478, s: 0.4, depth: 0.2, haze: 0.55 },
      { x: 1280, base: 482, s: 0.44, depth: 0.2, haze: 0.5 },
      { x: -700, base: 505, s: 0.66, depth: 0.3, haze: 0.18 },
      { x: 1360, base: 505, s: 0.66, depth: 0.3, haze: 0.18 },
    ],
    waterfall: { x: -330, base: 528, s: 0.8, depth: 0.36 },
    lilies: [['lilyA', 1180, 742, 0.95], ['lilyB', 1555, 650, 0.7], ['lilyB', 930, 600, 0.42], ['lilyA', 1720, 820, 1.1]],
    dock: { x: -300, y: 585, s: 0.95, depth: 0.85 },
    fg: { key: 'reeds', clipLeft: 1040, depth: 1.1 },
    rod: { bx: 905, by: 1150 },
    lane: { x0: 1060, x1: 1460, y0: 640, y1: 780 },
    flies: [[0, 380, 700, 920], [1350, 420, 1920, 1000], [400, 330, 1500, 470]],
  },
  reeds: {
    hz: 520, moonX: 1380,
    mountains: [{ x: 120, y: 230, w: 1700, depth: 0.1, haze: 0.4 }],
    forest: [
      { x: -300, base: 532, s: 0.5, depth: 0.2, haze: 0.45 },
      { x: 560, base: 528, s: 0.46, depth: 0.2, haze: 0.5 },
      { x: 1330, base: 532, s: 0.5, depth: 0.2, haze: 0.45 },
      { x: -820, base: 560, s: 0.78, depth: 0.32, haze: 0.12 },
      { x: 1440, base: 560, s: 0.78, depth: 0.32, haze: 0.12 },
    ],
    waterfall: null,
    lilies: [['lilyA', 640, 700, 0.9], ['lilyB', 1500, 690, 0.85], ['lilyA', 1180, 600, 0.5], ['lilyB', 820, 590, 0.45],
      ['lilyA', 300, 820, 1.25], ['lilyB', 1700, 860, 1.1], ['lilyB', 1020, 660, 0.6]],
    dock: null,
    fg: { key: 'frame', depth: 1.05 },
    fg2: { key: 'reeds', depth: 1.2, alpha: 1 },
    rod: { bx: 980, by: 1170 },
    lane: { x0: 820, x1: 1280, y0: 660, y1: 800 },
    flies: [[0, 400, 600, 1000], [1400, 420, 1920, 1000], [300, 380, 1600, 520]],
  },
  deep: {
    hz: 430, moonX: 1420,
    mountains: [{ x: -260, y: -40, w: 2440, depth: 0.1, haze: 0.12 }],
    forest: [
      { x: -380, base: 440, s: 0.36, depth: 0.18, haze: 0.6 },
      { x: 300, base: 437, s: 0.33, depth: 0.18, haze: 0.65 },
      { x: 960, base: 440, s: 0.36, depth: 0.18, haze: 0.6 },
      { x: 1600, base: 437, s: 0.33, depth: 0.18, haze: 0.65 },
    ],
    waterfall: { x: 760, base: 492, s: 0.95, depth: 0.3 },
    lilies: [['lilyB', 560, 560, 0.45]],
    dock: null,
    fg: { key: 'frame', depth: 1.05 },
    rod: { bx: 980, by: 1170 },
    lane: { x0: 760, x1: 1240, y0: 600, y1: 760 },
    flies: [[0, 450, 600, 1000], [1450, 450, 1920, 1000]],
    motes: true,
  },
};

// Lantern and glowing mushroom positions inside dock.webp (fractions of its size).
const DOCK_LIGHTS = [
  { fx: 0.272, fy: 0.215, r: 300, color: '#ffb85a', flicker: 1 },
  { fx: 0.856, fy: 0.292, r: 230, color: '#ffb85a', flicker: 1.3 },
  { fx: 0.066, fy: 0.6, r: 110, color: '#5ff2ff', flicker: 0 },
  { fx: 0.44, fy: 0.76, r: 80, color: '#5ff2ff', flicker: 0 },
];
// Glowing mushrooms in fg_frame.webp.
const FRAME_LIGHTS = [
  { fx: 0.08, fy: 0.75, r: 170, color: '#5ff2ff' },
  { fx: 0.93, fy: 0.82, r: 160, color: '#5ff2ff' },
  { fx: 0.78, fy: 0.72, r: 80, color: '#b4ff7a' },
];
// The falling-water column inside waterfall.webp.
const FALLS = { fx0: 0.565, fx1: 0.745, fy0: 0.36, fy1: 0.88 };

const RARITY_COLOR = { Common: '#c9e6e2', Uncommon: '#8df28a', Rare: '#6fc4ff', Epic: '#c990ff' };

// ---------- scene ----------

export class Scene {
  constructor(canvas, assets, goops) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.a = assets;
    this.goops = goops;
    this.t = 0;
    this.cam = { x: 0, y: 0, tx: 0, ty: 0, zoom: 1, shake: 0 };
    this.particles = [];
    this.ripples = [];
    this.grades = new Map();
    this.gradeKey = '';
    this.fade = null;           // snapshot cross-fade when the look changes
    this.flash = 0;             // lightning flash
    this.bolt = null;
    this.nextBolt = 3;
    this.cast = null;           // cast flight animation
    this.jump = null;           // goop leaping during a fight
    this.reveal = null;         // caught goop presentation
    this.snap = null;           // line snap recoil
    this.bobber = { x: 1250, y: 700, vy: 0, dip: 0 };
    this.lastPhase = PHASES.IDLE;
    this.quality = { strips: 56, scale: 1 };
    this.frameTimes = [];
    this.reducedMotion = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.silhouettes = new Map();
    this.buildStatic();
    this.resize();
  }

  // ----- one-time procedural sprites -----

  buildStatic() {
    const rnd = mulberry(7);
    this.stars = Array.from({ length: 260 }, () => ({
      x: rnd() * W, y: Math.pow(rnd(), 1.6) * 520, r: 0.6 + rnd() * 1.8, tw: rnd() * 6.28, sp: 0.6 + rnd() * 2.2,
    }));
    // Milky-way dust band
    this.dust = Array.from({ length: 520 }, () => {
      const u = rnd();
      const off = (rnd() - 0.5) * (60 + rnd() * 80);
      return { x: u * W, y: 40 + u * 260 + off, r: 0.3 + rnd() * 1.1, a: 0.15 + rnd() * 0.4 };
    });
    // Soft clouds
    this.cloudSprites = Array.from({ length: 5 }, (_, i) => this.makeCloud(mulberry(30 + i)));
    this.clouds = Array.from({ length: 7 }, (_, i) => ({
      sprite: i % 5, x: rnd() * (W + 800) - 400, y: 30 + rnd() * 250, s: 0.6 + rnd() * 0.8, v: 6 + rnd() * 10,
    }));
    // Glow dot sprite for fireflies, glints, sparks
    const g = makeCanvas(64, 64), gx = g.getContext('2d');
    const rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 64, 64);
    this.dot = g;
    // Fireflies (positions re-seeded per spot)
    this.flies = Array.from({ length: 46 }, () => ({ u: rnd(), v: rnd(), ph: rnd() * 6.28, sp: 0.3 + rnd() * 0.7, region: Math.floor(rnd() * 3) }));
    this.rain = Array.from({ length: 260 }, () => ({ x: rnd() * W, y: rnd() * H, l: 18 + rnd() * 26, v: 1300 + rnd() * 700, z: 0.4 + rnd() * 0.6 }));
    this.motes = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd(), ph: rnd() * 6.28, r: 1 + rnd() * 2.5 }));
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
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // the canvas may be shown with object-fit: cover (taller crop on phones), so size by the covering width
    const cssW = Math.max(rect.width || 960, (rect.height || 0) * W / H);
    const w = Math.round(clamp(cssW * dpr * this.quality.scale, 480, W));
    const h = Math.round(w * H / W);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
      this.grades.clear(); this.gradeKey = ''; this.fade = null;
      this.vignette = null;
    }
    this.px = w / W;
    this.quality.strips = w < 900 ? 36 : 56;
  }

  /** Lower the render resolution when frames run slow (keeps phones smooth). */
  trackPerf(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 0.026 && this.quality.scale > 0.7) { this.quality.scale -= 0.15; this.resize(); }
  }

  // ----- graded layer cache -----

  layout(spotId) { return LAYOUTS[spotId] || LAYOUTS.pond; }

  gradeOps(spotId, time, weather, haze = 0) {
    const ops = [...(SPOT_GRADE[spotId] || []), ...(TIME_GRADE[time] || []), ...(WEATHER_GRADE[weather] || [])];
    if (haze > 0) {
      // distance haze takes the colour of the sky behind the treeline, not the hot horizon band
      const col = weather === 'storm' ? STORM_SKY[2] : time === 'Day' ? '#8fb8d8' : SKIES[time].stops[time === 'Night' ? 3 : 1];
      ops.push(['screen', col, haze * (time === 'Day' ? 0.6 : 0.55)]);
    }
    return ops;
  }

  /** Returns a colour-graded copy of an image at the canvas' working resolution. */
  graded(key, ops, maxW) {
    const img = this.a[key];
    if (!img) return null;
    const id = `${key}|${JSON.stringify(ops)}|${maxW || ''}`;
    let c = this.grades.get(id);
    if (c) return c;
    const s = Math.min(1, Math.max(0.5, this.px * 1.15)) * (maxW ? Math.min(1, maxW / img.width) : 1);
    c = makeCanvas(img.width * s, img.height * s);
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const [op, color, alpha] of ops) {
      g.globalCompositeOperation = op; g.globalAlpha = alpha; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
    }
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
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(2,22,30,.82)'; g.fillRect(0, 0, c.width, c.height);
    this.silhouettes.set(id, c);
    return c;
  }

  // ----- events from the game -----

  onEvent(e, game) {
    const L = this.layout(game.spot.id);
    if (e.type === 'cast') {
      const r = Math.random;
      const tx = lerp(L.lane.x0, L.lane.x1, r()), ty = lerp(L.lane.y0, L.lane.y1, r());
      this.cast = { t: 0, dur: 0.75, tx, ty };
      this.reveal = null; this.snap = null; this.jump = null;
      this.bobber.x = tx; this.bobber.y = ty;
    } else if (e.type === 'bite') {
      this.cam.shake = Math.max(this.cam.shake, 6);
      this.splash(this.bobber.x, this.bobber.y, 10, '#d8fbff', 0.6);
      this.ring(this.bobber.x, this.bobber.y, 1.2);
    } else if (e.type === 'hooked') {
      this.cam.shake = 10;
      this.splash(this.bobber.x, this.bobber.y, 22, '#e8fdff', 1);
      this.ring(this.bobber.x, this.bobber.y, 1.6);
    } else if (e.type === 'catch') {
      const g = game.goop;
      this.reveal = { t: 0, id: g.id, color: g.color, rarity: g.rarity, x0: this.bobber.x, y0: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 46, '#ffffff', 1.5);
      this.ring(this.bobber.x, this.bobber.y, 2.2);
      this.cam.shake = 14;
    } else if (e.type === 'escaped') {
      this.snap = { t: 0, x: this.bobber.x, y: this.bobber.y };
      this.splash(this.bobber.x, this.bobber.y, 18, '#ffffff', 1);
      this.cam.shake = 16;
    } else if (e.type === 'missedBite') {
      this.ring(this.bobber.x, this.bobber.y, 0.9);
    }
  }

  splash(x, y, n, color, power = 1) {
    if (this.reducedMotion) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = (180 + Math.random() * 420) * power;
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

  // ----- main render -----

  render(game, dt, input = {}) {
    this.t += dt;
    const t = this.t;
    const g = this.ctx;
    const spotId = game.spot.id;
    const L = this.layout(spotId);
    const time = game.timeOfDay;
    const weather = game.state.weather;
    const phase = game.phase;

    // Cross-fade whenever the look (spot / time / weather) changes.
    const key = `${spotId}|${time}|${weather}|${this.canvas.width}`;
    if (key !== this.gradeKey) {
      if (this.gradeKey && !this.reducedMotion) {
        const snap = this.fade?.canvas && this.fade.canvas.width === this.canvas.width ? this.fade.canvas : makeCanvas(this.canvas.width, this.canvas.height);
        const sg = snap.getContext('2d'); sg.globalAlpha = 1; sg.drawImage(this.canvas, 0, 0);
        this.fade = { canvas: snap, a: 1 };
      }
      if (this.gradeKey.split('|')[0] !== spotId) { this.particles.length = 0; this.ripples.length = 0; }
      this.gradeKey = key;
      // keep the cache from growing without bound: drop grades for other looks
      if (this.grades.size > 40) this.grades.clear();
    }

    // Camera: pointer parallax + gentle drift + push-in while fighting.
    const drift = this.reducedMotion ? 0 : 1;
    this.cam.x = lerp(this.cam.x, (input.px || 0) + Math.sin(t * 0.13) * 0.25 * drift, 1 - Math.exp(-dt * 2.5));
    this.cam.y = lerp(this.cam.y, (input.py || 0) + Math.cos(t * 0.11) * 0.2 * drift, 1 - Math.exp(-dt * 2.5));
    const fighting = phase === PHASES.FIGHT;
    const targetZoom = fighting ? 1.05 : phase === PHASES.BITE ? 1.025 : phase === PHASES.CAUGHT ? 1.03 : 1;
    this.cam.zoom = lerp(this.cam.zoom, targetZoom, 1 - Math.exp(-dt * 1.8));
    if (fighting && game.fight) this.cam.shake = Math.max(this.cam.shake, game.fight.tension > 0.85 ? (game.fight.tension - 0.85) * 40 : 0);
    this.cam.shake = Math.max(0, this.cam.shake - dt * 30);
    const shake = this.reducedMotion ? 0 : this.cam.shake;
    const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;

    const s = this.px * this.cam.zoom * 1.03; // 3% overscan hides parallax edges
    const focusX = fighting ? this.bobber.x : W / 2, focusY = fighting ? this.bobber.y : H / 2;
    const ox = W / 2 - (focusX - W / 2) * (this.cam.zoom - 1) * 0.6;
    const oy = H / 2 - (focusY - H / 2) * (this.cam.zoom - 1) * 0.6;
    const base = (depth) => {
      g.setTransform(s, 0, 0, s, this.canvas.width / 2 - ox * s + (sx - this.cam.x * depth * 46) * this.px, this.canvas.height / 2 - oy * s + (sy - this.cam.y * depth * 16) * this.px);
    };
    this.layer = base;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';

    // 1. sky
    base(0.04);
    this.drawSky(g, L, time, weather, t);
    // 2. far layers
    const opsFor = (haze) => this.gradeOps(spotId, time, weather, haze);
    for (const m of L.mountains) {
      base(m.depth);
      const img = this.graded('mountains', opsFor(m.haze));
      if (img) g.drawImage(img, m.x, m.y, m.w, m.w * img.height / img.width);
    }
    if (weather === 'fog') { base(0.15); this.drawFogBand(g, L, t, 0.5, L.hz - 120); }
    for (const f of L.forest) {
      base(f.depth);
      const img = this.graded('forest', opsFor(f.haze));
      if (!img) continue;
      const fw = this.a.forest.width * f.s, fh = this.a.forest.height * f.s;
      g.drawImage(img, f.x, f.base - fh, fw, fh);
    }
    if (L.waterfall) {
      const wf = L.waterfall;
      base(wf.depth);
      const img = this.graded('waterfall', opsFor(0));
      if (img) {
        const ww = this.a.waterfall.width * wf.s, wh = this.a.waterfall.height * wf.s;
        const wy = wf.base - wh;
        g.drawImage(img, wf.x, wy, ww, wh);
        this.drawFalls(g, wf.x, wy, ww, wh, t, time);
      }
    }
    // 3. water
    base(0.5);
    this.drawWater(g, L, spotId, time, weather, t);
    if (weather === 'fog') this.drawFogBand(g, L, t, 0.7, L.hz - 40);

    // 4. lilies (float on the water, bob gently)
    for (const [k, lx, ly, ls] of L.lilies) {
      const img = this.graded(k, opsFor(0));
      if (!img) continue;
      const depth = 0.5 + (ly - L.hz) / (H - L.hz) * 0.4;
      base(depth);
      const w = this.a[k].width * ls, h = this.a[k].height * ls;
      g.drawImage(img, lx - w / 2, ly - h / 2 + Math.sin(t * 0.9 + lx) * 2 * ls, w, h);
    }

    // 5. gameplay below the surface + ripples
    base(0.62);
    this.drawRipples(g, dt, time);
    this.drawGoopUnder(g, game, t);

    // 6. dock
    if (L.dock) {
      const d = L.dock; base(d.depth);
      const img = this.graded('dock', opsFor(0));
      if (img) {
        const dw = this.a.dock.width * d.s, dh = this.a.dock.height * d.s;
        g.drawImage(img, d.x, d.y, dw, dh);
        this.drawLights(g, DOCK_LIGHTS, d.x, d.y, dw, dh, t, time, true);
      }
    }

    // 7. bobber, line, rod, catches
    base(0.7);
    this.drawTackle(g, game, L, dt, t);
    this.drawParticles(g, dt);
    this.drawJump(g, game, dt);
    this.drawReveal(g, game, dt, t);

    // 8. foreground frame
    for (const fg of [L.fg, L.fg2]) {
      if (!fg) continue;
      base(fg.depth);
      this.drawForeground(g, fg, opsFor(0), time, t);
    }

    // 9. atmosphere
    base(0.8);
    this.drawFireflies(g, L, time, weather, t);
    if (L.motes) this.drawMotes(g, t, time);
    if (weather === 'rain' || weather === 'storm') this.drawRain(g, L, dt, t, weather === 'storm');
    if (weather === 'fog') { base(1); this.drawFogBand(g, L, t * 1.4, 0.3, 660); }
    if (weather === 'storm') this.drawStorm(g, dt);

    // 10. screen-space finishing
    g.setTransform(1, 0, 0, 1, 0, 0);
    this.drawGrade(g, time, weather, phase, game);
    if (this.fade) {
      this.fade.a -= dt / 1.4;
      if (this.fade.a <= 0) this.fade = { canvas: this.fade.canvas, a: 0, done: true };
      else { g.globalAlpha = ease(this.fade.a); g.drawImage(this.fade.canvas, 0, 0); g.globalAlpha = 1; }
    }
    this.lastPhase = phase;
  }

  // ----- sky -----

  drawSky(g, L, time, weather, t) {
    const sky = SKIES[time] || SKIES.Night;
    const stops = weather === 'storm' ? STORM_SKY : sky.stops;
    const top = -60, bottom = L.hz + 60;
    const gr = g.createLinearGradient(0, top, 0, bottom);
    gr.addColorStop(0, stops[0]); gr.addColorStop(0.35, stops[1]); gr.addColorStop(0.75, stops[2]); gr.addColorStop(1, stops[3]);
    g.fillStyle = gr; g.fillRect(-120, top, W + 240, bottom - top + 40);

    const cloudy = weather === 'storm' ? 1 : weather === 'rain' ? 0.75 : weather === 'fog' ? 0.5 : 0;
    // stars + milky way
    const starA = sky.stars * (1 - cloudy * 0.9);
    if (starA > 0.02) {
      g.globalCompositeOperation = 'lighter';
      for (const d of this.dust) { g.globalAlpha = d.a * starA * 0.5; g.fillStyle = '#b8c8ff'; g.fillRect(d.x, d.y, d.r * 2, d.r * 2); }
      for (const st of this.stars) {
        if (st.y > L.hz - 40) continue;
        g.globalAlpha = starA * (0.45 + 0.55 * Math.sin(t * st.sp + st.tw) ** 2);
        const r = st.r * 3.2;
        g.drawImage(this.dot, st.x - r, st.y - r, r * 2, r * 2);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // sun / moon
    const bodyX = L.moonX, bodyY = lerp(40, L.hz, sky.sunY);
    if (weather !== 'storm') {
      const isMoon = time === 'Night';
      const R = isMoon ? 68 : time === 'Day' ? 70 : 92;
      const haloA = (1 - cloudy * 0.7);
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
        // craters
        g.fillStyle = 'rgba(120,145,190,.28)';
        for (const [cx, cy, cr] of [[-0.3, -0.2, 0.22], [0.25, 0.15, 0.16], [0.05, -0.45, 0.1], [-0.15, 0.4, 0.13], [0.42, -0.25, 0.09]]) {
          g.beginPath(); g.arc(bodyX + cx * R, bodyY + cy * R, cr * R, 0, 6.29); g.fill();
        }
      } else {
        const sg = g.createRadialGradient(bodyX, bodyY, 0, bodyX, bodyY, R);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.55, sky.sun); sg.addColorStop(1, hexA(sky.sun, 0.9));
        g.fillStyle = sg; g.beginPath(); g.arc(bodyX, bodyY, R, 0, 6.29); g.fill();
      }
      g.globalAlpha = 1;
    }
    // clouds drift
    const [lit, shade] = weather === 'storm' ? ['#6b7890', '#1a2030'] : sky.cloud;
    const count = 4 + Math.round(cloudy * 3);
    for (let i = 0; i < count; i++) {
      const c = this.clouds[i];
      const span = W + 900;
      const x = ((c.x + t * c.v) % span + span) % span - 450;
      const spr = this.cloudSprites[c.sprite];
      const w = spr.width * c.s * (1 + cloudy * 0.6), h = spr.height * c.s * (1 + cloudy * 0.4);
      const tinted = this.tintCloud(c.sprite, lit, shade);
      g.globalAlpha = (time === 'Day' ? 0.85 : 0.6) * (0.6 + cloudy * 0.5);
      g.drawImage(tinted, x, c.y * (1 - cloudy * 0.3), w, h);
    }
    g.globalAlpha = 1;
  }

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

  // ----- water -----

  drawWater(g, L, spotId, time, weather, t) {
    const img = this.graded('water', this.gradeOps(spotId, time, weather, 0));
    if (!img) return;
    const top = L.hz - 8, h = H - top + 40;
    const strips = this.quality.strips;
    const amp = weather === 'storm' ? 9 : weather === 'rain' ? 6 : 3.5;
    const srcH = img.height / strips;
    for (let i = 0; i < strips; i++) {
      const f = i / strips;
      const yy = top + h * Math.pow(f, 1.25);
      const yn = top + h * Math.pow((i + 1) / strips, 1.25);
      const off = (Math.sin(t * 1.1 + f * 22) * 0.7 + Math.sin(t * 0.55 + f * 9) * 0.5) * amp * (0.25 + f * 1.5);
      g.drawImage(img, 0, i * srcH, img.width, srcH + 0.6, -60 + off, yy, W + 120, yn - yy + 1);
    }

    // Reflection of the far shore (mirrored, wobbling, fading with distance).
    this.drawReflection(g, L, spotId, time, weather, t);

    // Horizon haze line where the water meets the land.
    const hcol = weather === 'storm' ? STORM_SKY[3] : SKIES[time].stops[3];
    const hz = g.createLinearGradient(0, L.hz - 26, 0, L.hz + 40);
    hz.addColorStop(0, hexA(hcol, 0)); hz.addColorStop(0.45, hexA(hcol, time === 'Night' ? 0.22 : 0.3)); hz.addColorStop(1, hexA(hcol, 0));
    g.fillStyle = hz; g.fillRect(-60, L.hz - 26, W + 120, 66);

    // Glitter path under the sun / moon.
    if (weather !== 'storm') {
      g.globalCompositeOperation = 'lighter';
      const n = 70;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        const y = L.hz + 6 + Math.pow(f, 1.4) * (H - L.hz);
        const spread = 30 + f * 230;
        const x = L.moonX + Math.sin(i * 12.9898 + t * 0.7) * spread;
        const pulse = Math.max(0, Math.sin(t * 3.1 + i * 1.7));
        g.globalAlpha = pulse * (time === 'Day' ? 0.55 : 0.75) * (1 - f * 0.6) * (weather === 'clear' ? 1 : 0.5);
        const w = 14 + f * 46, hh = 2 + f * 4;
        g.drawImage(this.dot, x - w / 2, y - hh / 2, w, hh);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    // Animated caustic shimmer near the viewer.
    const caus = this.a.caustics;
    if (caus) {
      const frame = Math.floor(t * 9) % 8, fw = caus.width / 8;
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = time === 'Day' ? 0.12 : 0.2;
      const tile = 420;
      for (let y = L.hz + 140; y < H + 40; y += tile * 0.55) {
        const sc = 0.55 + (y - L.hz) / (H - L.hz) * 0.7;
        for (let x = -tile + ((t * 12) % tile); x < W + tile; x += tile * sc) {
          g.drawImage(caus, frame * fw, 0, fw, caus.height, x, y, tile * sc, tile * sc * 0.45);
        }
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
  }

  drawReflection(g, L, spotId, time, weather, t) {
    const id = `refl|${spotId}|${time}|${weather}`;
    let refl = this.grades.get(id);
    const sc = Math.min(1, this.px * 1.1);
    if (!refl) {
      refl = makeCanvas(W * sc, L.hz * sc);
      const r = refl.getContext('2d');
      r.scale(sc, sc);
      for (const f of L.forest) {
        const img = this.graded('forest', this.gradeOps(spotId, time, weather, f.haze));
        if (!img) continue;
        const fw = this.a.forest.width * f.s, fh = this.a.forest.height * f.s;
        r.drawImage(img, f.x, f.base - fh, fw, fh);
      }
      if (L.waterfall) {
        const wf = L.waterfall;
        const img = this.graded('waterfall', this.gradeOps(spotId, time, weather, 0));
        const ww = this.a.waterfall.width * wf.s, wh = this.a.waterfall.height * wf.s;
        if (img) r.drawImage(img, wf.x, wf.base - wh, ww, wh);
      }
      this.grades.set(id, refl);
    }
    const depth = 240;
    const strips = 24;
    for (let i = 0; i < strips; i++) {
      const f = i / strips;
      const srcY = (L.hz - 30 - f * depth * 1.2) * sc;
      const srcH = (depth * 1.2 / strips) * sc;
      const dy = L.hz - 6 + f * depth;
      const off = Math.sin(t * 1.6 + f * 30) * (2 + f * 10);
      g.globalAlpha = (1 - f) * (time === 'Day' ? 0.32 : 0.42) * (weather === 'storm' ? 0.5 : 1);
      g.save();
      g.translate(0, dy + depth / strips);
      g.scale(1, -1);
      g.drawImage(refl, 0, Math.max(0, srcY - srcH), refl.width, srcH, off, 0, W, depth / strips + 1);
      g.restore();
    }
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
      const p = r.t / r.dur;
      const frame = Math.min(7, Math.floor(p * 8));
      const size = 260 * r.s * (0.6 + p * 0.8);
      g.globalAlpha = (1 - p) * (time === 'Day' ? 0.7 : 0.9);
      g.drawImage(sheet, frame * fw, 0, fw, sheet.height, r.x - size / 2, r.y - size * 0.22, size, size * 0.44);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawFalls(g, x, y, w, h, t, time) {
    const x0 = x + w * FALLS.fx0, x1 = x + w * FALLS.fx1, y0 = y + h * FALLS.fy0, y1 = y + h * FALLS.fy1;
    g.save();
    g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
    g.globalCompositeOperation = 'lighter';
    const cols = 26;
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
    // mist at the base
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const mx = x0 + (x1 - x0) * (i / 5) + Math.sin(t * 0.8 + i) * 18;
      const my = y1 - 6 + Math.sin(t * 1.3 + i * 2) * 6;
      g.globalAlpha = 0.16;
      g.drawImage(this.dot, mx - 90, my - 40, 180, 80);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawLights(g, lights, x, y, w, h, t, time, reflect) {
    const glow = this.a.glow || this.dot;
    const nightness = time === 'Night' ? 1 : time === 'Day' ? 0.25 : 0.7;
    g.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      const lx = x + w * l.fx, ly = y + h * l.fy;
      const fl = l.flicker ? 0.85 + Math.sin(t * 9 * l.flicker) * 0.06 + Math.sin(t * 23 * l.flicker) * 0.05 : 0.8 + Math.sin(t * 1.5 + lx) * 0.15;
      const r = l.r * fl;
      g.globalAlpha = 0.9 * nightness;
      g.drawImage(this.tintGlow(l.color), lx - r, ly - r, r * 2, r * 2);
      if (reflect && l.flicker) {
        // elongated light pool on the water below the lantern
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

  drawForeground(g, fg, ops, time, t) {
    const src = this.a[fg.key];
    if (!src) return;
    const id = `fg|${fg.key}|${fg.clipLeft || 0}|${JSON.stringify(ops)}`;
    let c = this.grades.get(id);
    if (!c) {
      const gimg = this.graded(fg.key, ops);
      c = gimg;
      if (fg.clipLeft) {
        c = makeCanvas(gimg.width, gimg.height);
        const cg = c.getContext('2d');
        cg.drawImage(gimg, 0, 0);
        cg.globalCompositeOperation = 'destination-out';
        const k = gimg.width / W;
        const gr = cg.createLinearGradient(fg.clipLeft * k - 140 * k, 0, fg.clipLeft * k + 60 * k, 0);
        gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        cg.fillStyle = gr; cg.fillRect(0, 0, c.width, c.height);
      }
      this.grades.set(id, c);
    }
    const sway = Math.sin(t * 0.8) * 3;
    const w = W + 80, h = w * src.height / src.width;
    const y = fg.key === 'frame' ? H - h + 40 : H - h + 30;
    g.globalAlpha = fg.alpha ?? 1;
    g.drawImage(c, -40 + sway, y, w, h);
    g.globalAlpha = 1;
    if (fg.key === 'frame') this.drawLights(g, FRAME_LIGHTS, -40 + sway, y, w, h, t, time, false);
  }

  // ----- atmosphere -----

  drawFireflies(g, L, time, weather, t) {
    let n = { Night: 46, Dusk: 26, Dawn: 10, Day: 0 }[time] ?? 0;
    if (weather === 'rain') n *= 0.4; if (weather === 'storm') n = 0; if (weather === 'fog') n *= 0.7;
    if (!n) return;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const f = this.flies[i];
      const [x0, y0, x1, y1] = L.flies[f.region % L.flies.length];
      const x = lerp(x0, x1, f.u) + Math.sin(t * f.sp + f.ph) * 40 + Math.sin(t * f.sp * 2.3 + f.ph) * 14;
      const y = lerp(y0, y1, f.v) + Math.cos(t * f.sp * 1.3 + f.ph) * 26;
      const pulse = Math.max(0, Math.sin(t * (1.2 + f.sp) + f.ph * 3));
      const r = 10 + pulse * 16;
      g.globalAlpha = 0.25 + pulse * 0.75;
      g.drawImage(this.tintGlow('#d6ff6a'), x - r * 2, y - r * 2, r * 4, r * 4);
      g.globalAlpha = 0.6 + pulse * 0.4;
      g.drawImage(this.dot, x - 4, y - 4, 8, 8);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawMotes(g, t, time) {
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const y = H - ((m.y * 900 + t * 18) % 900) - 60;
      const x = m.x + Math.sin(t * 0.6 + m.ph) * 30;
      g.globalAlpha = (0.3 + 0.5 * Math.sin(t * 2 + m.ph) ** 2) * (time === 'Day' ? 0.4 : 1);
      const r = m.r * 6;
      g.drawImage(this.tintGlow('#8f7bff'), x - r, y - r, r * 2, r * 2);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  drawFogBand(g, L, t, alpha, y) {
    const fog = this.a.fog;
    const band = g.createLinearGradient(0, y - 160, 0, y + 160);
    band.addColorStop(0, 'rgba(200,215,225,0)'); band.addColorStop(0.5, `rgba(200,215,225,${alpha * 0.55})`); band.addColorStop(1, 'rgba(200,215,225,0)');
    g.fillStyle = band; g.fillRect(-80, y - 160, W + 160, 320);
    if (!fog) return;
    const fw = fog.width / 8, frame = Math.floor(t * 4) % 8;
    g.globalAlpha = alpha;
    const tile = 900;
    for (let x = -tile + ((t * 22) % tile); x < W + tile; x += tile * 0.7) {
      g.drawImage(fog, frame * fw, 0, fw, fog.height, x, y - 260, tile, tile * 0.55);
    }
    g.globalAlpha = 1;
  }

  drawRain(g, L, dt, t, storm) {
    const n = storm ? 260 : 150;
    const wind = storm ? 0.32 : 0.14;
    g.strokeStyle = 'rgba(200,225,255,.42)';
    g.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const r = this.rain[i];
      r.y += r.v * dt * r.z; r.x -= r.v * dt * wind * r.z;
      if (r.y > H + 40) { r.y = -40 - Math.random() * 200; r.x = Math.random() * (W + 300); if (Math.random() < 0.5) this.rainRing(L); }
      if (r.x < -40) r.x += W + 80;
      g.lineWidth = 1 + r.z * 1.6;
      g.globalAlpha = 0.35 + r.z * 0.5;
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

  rainRing(L) {
    if (this.ripples.length > 60) return;
    const y = L.hz + 20 + Math.random() * (H - L.hz - 20);
    this.ripples.push({ x: Math.random() * W, y, t: 0, dur: 0.7, s: 0.12 + (y - L.hz) / (H - L.hz) * 0.3 });
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
          g.strokeStyle = `rgba(210,225,255,${a * this.bolt.life / 0.35})`;
          g.lineWidth = lw; g.beginPath();
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

  // ----- gameplay visuals -----

  rodGeometry(game, L) {
    const fight = game.phase === PHASES.FIGHT ? game.fight : null;
    const tension = fight ? fight.tension : 0;
    const bx = L.rod.bx, by = L.rod.by;
    let ang = -0.98 + Math.sin(this.t * 0.9) * 0.01;
    if (this.cast && this.cast.t < 0.35) ang -= Math.sin(this.cast.t / 0.35 * Math.PI) * 0.5; // flick back
    const len = 640;
    const bend = tension * 150 + (game.phase === PHASES.BITE ? 30 + Math.sin(this.t * 18) * 10 : 0);
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const tipX = bx + dirX * len + bend * 0.55, tipY = by + dirY * len + bend * 0.9;
    const cx = bx + dirX * len * 0.55 - dirY * bend * 0.1, cy = by + dirY * len * 0.55 + bend * 0.15;
    return { bx, by, tipX, tipY, cx, cy, tension };
  }

  drawTackle(g, game, L, dt, t) {
    const phase = game.phase;
    const rod = this.rodGeometry(game, L);
    const fight = phase === PHASES.FIGHT ? game.fight : null;
    const b = this.bobber;

    // Bobber position by phase.
    const hookedUp = phase === PHASES.CAUGHT && this.reveal && this.reveal.pos;
    let showBobber = phase !== PHASES.IDLE && !this.snap && !hookedUp;
    if (this.cast) {
      this.cast.t += dt;
      const p = clamp(this.cast.t / this.cast.dur, 0, 1);
      if (p >= 1) {
        if (!this.cast.landed) { this.cast.landed = true; this.splash(this.cast.tx, this.cast.ty, 14, '#e8fdff', 0.7); this.ring(this.cast.tx, this.cast.ty, 1); this.onSplash?.(); }
        if (this.cast.t > this.cast.dur + 0.4) this.cast = null;
      }
      if (this.cast && !this.cast.landed) {
        const e = ease(p);
        b.x = lerp(rod.tipX, this.cast.tx, e);
        b.y = lerp(rod.tipY, this.cast.ty, e) - Math.sin(p * Math.PI) * 260;
      }
    }
    if (!this.cast || this.cast.landed) {
      if (this.cast?.landed) { b.x = this.cast.tx; b.y = this.cast.ty; }
      if (fight) {
        // the Goop drags the float around; reeling brings it closer to the rod
        const homeX = this.castX ?? b.x;
        if (this.castX == null) { this.castX = b.x; this.castY = b.y; }
        const pull = Math.sin(this.t * 2.1) * 60 + Math.sin(this.t * 5.3) * 18 * fight.tension;
        const tx = lerp(homeX, rod.bx + 120, fight.progress * 0.55) + pull;
        const ty = lerp(this.castY, H - 260, fight.progress * 0.5);
        b.x = lerp(b.x, tx, 1 - Math.exp(-dt * 3));
        b.y = lerp(b.y, ty, 1 - Math.exp(-dt * 3));
        if (Math.random() < dt * (0.6 + fight.tension * 2.2)) this.ring(b.x, b.y, 0.6 + fight.tension * 0.6);
        if (Math.random() < dt * 4 * fight.tension) this.splash(b.x, b.y, 3, '#e8fdff', 0.4);
        // goop occasionally breaches when strained
        if (!this.jump && fight.tension > 0.72 && Math.random() < dt * 0.5) {
          this.jump = { t: 0, dur: 0.85, x: b.x + (Math.random() - 0.5) * 120, y: b.y + 10, dir: Math.random() < 0.5 ? -1 : 1 };
          this.splash(this.jump.x, this.jump.y, 18, '#ffffff', 0.9);
        }
      } else if (phase === PHASES.CAST || phase === PHASES.BITE) {
        this.castX = null;
      }
    }
    if (phase === PHASES.IDLE) this.castX = null;

    let dip = 0;
    if (phase === PHASES.BITE) dip = 6 + Math.abs(Math.sin(t * 16)) * 14;
    else if (phase === PHASES.FIGHT) dip = 10 + (fight?.tension || 0) * 8;
    else if (phase === PHASES.CAST && game.timer > 0.4 && Math.random() < dt * 1.5) { this.ring(b.x, b.y, 0.35); b.dip = 6; }
    b.dip = Math.max(0, (b.dip || 0) - dt * 20);
    const bob = Math.sin(t * 2.6) * 3 + dip + b.dip;
    const depthScale = 0.6 + (b.y - L.hz) / (H - L.hz) * 0.8;

    // Line from the rod tip (lure dangles near the tip when idle).
    if (!this.snap) {
      g.lineCap = 'round';
      let ex, ey, sag;
      if (hookedUp) { ex = this.reveal.pos.x; ey = this.reveal.pos.y - 30; sag = 30; }
      else if (showBobber) { ex = b.x; ey = b.y + bob - 8 * depthScale; sag = (1 - (fight?.tension ?? 0.15)) * 70; }
      else { ex = rod.tipX + Math.sin(t * 1.2) * 6; ey = rod.tipY + 150; sag = 4; }
      const mx = (rod.tipX + ex) / 2, my = (rod.tipY + ey) / 2 + sag;
      const hot = fight && fight.tension > 0.85;
      g.strokeStyle = hot ? 'rgba(255,120,110,.35)' : 'rgba(220,255,240,.18)';
      g.lineWidth = hot ? 7 : 5;
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
      g.strokeStyle = hot ? '#ff8f80' : '#eafff4';
      g.lineWidth = 1.6;
      if (hot) { g.setLineDash([]); g.lineWidth = 2; }
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo(mx + (hot ? Math.sin(t * 60) * 3 : 0), my, ex, ey); g.stroke();
      if (!showBobber && !hookedUp) this.drawLure(g, ex, ey, t);
    } else {
      this.snap.t += dt;
      const p = clamp(this.snap.t / 0.5, 0, 1);
      g.strokeStyle = `rgba(255,140,120,${1 - p})`; g.lineWidth = 2;
      const ex = lerp(this.snap.x, rod.tipX, ease(p)), ey = lerp(this.snap.y, rod.tipY + 80, ease(p)) + Math.sin(p * 20) * 30 * (1 - p);
      g.beginPath(); g.moveTo(rod.tipX, rod.tipY); g.quadraticCurveTo((rod.tipX + ex) / 2 + 60 * (1 - p), (rod.tipY + ey) / 2 - 40, ex, ey); g.stroke();
      if (p >= 1 && this.snap.t > 1.2) this.snap = null;
    }

    if (showBobber) this.drawBobber(g, b.x, b.y + bob, depthScale, phase, t);
    this.drawRod(g, rod);

    if (phase === PHASES.BITE) {
      const pop = 1 + Math.sin(t * 12) * 0.08;
      const y = b.y - 120 * depthScale;
      g.save(); g.translate(b.x, y); g.scale(pop * depthScale * 1.4, pop * depthScale * 1.4);
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
    // reflection
    g.globalAlpha = 0.35;
    g.fillStyle = '#ff5a5a'; g.beginPath(); g.ellipse(x, y + r * 1.6, r * 0.9, r * 0.5, 0, 0, 6.29); g.fill();
    g.globalAlpha = 1;
    // waterline shadow ring
    g.fillStyle = 'rgba(0,20,30,.35)'; g.beginPath(); g.ellipse(x, y + r * 0.7, r * 1.6, r * 0.45, 0, 0, 6.29); g.fill();
    // body: white bottom, red top
    const body = g.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.2);
    body.addColorStop(0, '#ffffff'); body.addColorStop(1, '#c9d4d6');
    g.fillStyle = body; g.beginPath(); g.arc(x, y, r, 0, Math.PI); g.fill();
    const red = g.createRadialGradient(x - r * 0.4, y - r * 0.6, r * 0.1, x, y, r * 1.2);
    red.addColorStop(0, '#ff9a8a'); red.addColorStop(0.5, '#ff3b3b'); red.addColorStop(1, '#a3121e');
    g.fillStyle = red; g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.fill();
    g.fillStyle = '#222'; g.fillRect(x - r, y - r * 0.08, r * 2, r * 0.16);
    // antenna + glow tip
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x, y - r * 2.3); g.stroke();
    g.globalCompositeOperation = 'lighter';
    const glowA = phase === PHASES.BITE ? 1 : 0.6 + Math.sin(t * 3) * 0.2;
    g.globalAlpha = glowA;
    g.drawImage(this.tintGlow('#8df28a'), x - r * 1.6, y - r * 3.9, r * 3.2, r * 3.2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#c9ff7a'; g.beginPath(); g.arc(x, y - r * 2.35, 3.2 * s, 0, 6.29); g.fill();
    // specular
    g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.52, r * 0.28, r * 0.16, -0.6, 0, 6.29); g.fill();
  }

  drawRod(g, rod) {
    const { bx, by, tipX, tipY, cx, cy } = rod;
    // blank: tapered stroke built from several passes
    const passes = [[26, '#1e120a'], [19, '#5a3420'], [13, '#a8693a'], [5, '#f6c995']];
    g.lineCap = 'round';
    const steps = 22;
    const pt = (u) => {
      const a = (1 - u) * (1 - u), b2 = 2 * (1 - u) * u, c = u * u;
      return [a * bx + b2 * cx + c * tipX, a * by + b2 * cy + c * tipY];
    };
    for (const [w, col] of passes) {
      g.strokeStyle = col;
      for (let i = 0; i < steps; i++) {
        const u0 = i / steps, u1 = (i + 1) / steps;
        const [x0, y0] = pt(u0), [x1, y1] = pt(u1);
        g.lineWidth = Math.max(1.2, w * (1 - u0 * 0.82));
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
    }
    // cork grip and reel
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
    // guides
    g.strokeStyle = '#d8e6e2'; g.lineWidth = 2;
    for (const u of [0.42, 0.6, 0.75, 0.88]) { const [px, py] = pt(u); g.beginPath(); g.arc(px + 4, py + 4, 5 * (1.2 - u), 0, 6.29); g.stroke(); }
    g.fillStyle = '#8df28a'; g.beginPath(); g.arc(tipX, tipY, 3.5, 0, 6.29); g.fill();
  }

  drawGoopUnder(g, game, t) {
    const goop = game.goop;
    const phase = game.phase;
    if (!goop || !(phase === PHASES.CAST || phase === PHASES.BITE || phase === PHASES.FIGHT)) return;
    if (this.cast && !this.cast.landed) return;
    const sil = this.silhouette(goop.id);
    const art = this.a[`goop:${goop.id}`];
    if (!sil || !art) return;
    const b = this.bobber;
    const depthScale = 0.6 + (b.y - 470) / 610 * 0.8;
    let x, y, a, sc, colorA = 0;
    if (phase === PHASES.CAST) {
      const circle = t * 0.9;
      x = b.x + Math.cos(circle) * 140 * depthScale; y = b.y + 60 * depthScale + Math.sin(circle) * 30 * depthScale;
      a = clamp((game.timer - 0.3) * 0.5, 0, 0.35); sc = 0.36 * depthScale;
    } else if (phase === PHASES.BITE) {
      x = b.x + 30 + Math.sin(t * 7) * 8; y = b.y + 50 * depthScale; a = 0.6; sc = 0.5 * depthScale;
    } else {
      const f = game.fight;
      x = b.x + Math.sin(t * 4.2) * 40 * (0.4 + f.tension); y = b.y + 50 * depthScale + Math.sin(t * 3) * 10;
      a = 0.8; sc = 0.62 * depthScale; colorA = 0.45;
    }
    if (this.jump) return; // drawn by drawJump while airborne
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
    // bubbles while hooked
    if (phase === PHASES.FIGHT && this.a.bubbles) {
      const sheet = this.a.bubbles, fw = sheet.width / 8, fr = Math.floor(t * 10) % 8;
      g.globalAlpha = 0.6; g.globalCompositeOperation = 'lighter';
      g.drawImage(sheet, fr * fw, 0, fw, sheet.height, x - 70 * depthScale, y - 160 * depthScale, 140 * depthScale, 140 * depthScale);
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
    const sc = 0.5 * (0.6 + (j.y - 470) / 610 * 0.8);
    g.save(); g.translate(x, y); g.rotate(j.dir * (p - 0.5) * 1.4); g.scale(-j.dir, 1);
    g.drawImage(art, -art.width * sc / 2, -art.height * sc / 2, art.width * sc, art.height * sc);
    g.restore();
    if (Math.random() < 0.6) this.particles.push({ kind: 'drop', x, y: y + 20, vx: (Math.random() - 0.5) * 80, vy: 40, life: 0, max: 0.5, size: 3, color: '#e8fdff', floor: j.y });
  }

  drawReveal(g, game, dt, t) {
    const r = this.reveal;
    if (!r) return;
    if (game.phase !== PHASES.CAUGHT) { this.reveal = null; return; }
    const art = this.a[`goop:${r.id}`];
    if (!art) return;
    r.t += dt;
    const fly = clamp(r.t / 0.9, 0, 1);
    const e = ease(fly);
    const cx = W / 2, cy = 360;
    const x = lerp(r.x0, cx, e), y = lerp(r.y0, cy, e) - Math.sin(fly * Math.PI) * 220;
    const sc = lerp(0.3, 1.25, e) * (1 + Math.sin(t * 2.2) * 0.02 * fly);
    r.pos = { x, y: y + Math.sin(t * 2) * 8 * fly - art.height * sc * 0.1 };
    if (fly >= 1 && !r.burst) { r.burst = true; this.sparkle(cx, cy, 46, r.color); this.onReveal?.(r); }
    const col = RARITY_COLOR[r.rarity] || '#ffffff';
    if (fly > 0.6) {
      const a = clamp((fly - 0.6) / 0.4, 0, 1);
      // rotating god-rays in the rarity colour
      g.save(); g.translate(cx, cy); g.rotate(t * 0.25);
      g.globalCompositeOperation = 'lighter';
      const rays = 14;
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
    if (fly >= 1 && Math.random() < dt * 8) this.particles.push({ kind: 'spark', x: cx + (Math.random() - 0.5) * 300, y: cy + (Math.random() - 0.5) * 200, vx: 0, vy: -40, life: 0, max: 1.2, size: 10 + Math.random() * 14, color: col });
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
    if (!this.vignette) {
      const v = makeCanvas(cw, ch), vg = v.getContext('2d');
      const rg = vg.createRadialGradient(cw / 2, ch * 0.55, ch * 0.35, cw / 2, ch * 0.55, ch * 1.05);
      rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,8,14,.62)');
      vg.fillStyle = rg; vg.fillRect(0, 0, cw, ch);
      this.vignette = v;
    }
    g.drawImage(this.vignette, 0, 0);
    // warm/cool light wash
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
    // danger vignette when the line is about to snap
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

  /** Render a still of a spot into a small canvas (used for the travel cards). */
  thumbnail(spotId, time = 'Night', w = 320) {
    const L = this.layout(spotId);
    const c = makeCanvas(w, w * H / W), g = c.getContext('2d');
    const k = w / W;
    g.scale(k, k);
    const fake = { spot: { id: spotId }, timeOfDay: time, state: { weather: 'clear' }, phase: PHASES.IDLE, goop: null, fight: null, timer: 0 };
    const keep = { canvas: this.canvas, ctx: this.ctx, px: this.px };
    this.drawSky(g, L, time, 'clear', 10);
    const ops = (h) => this.gradeOps(spotId, time, 'clear', h);
    for (const m of L.mountains) { const img = this.graded('mountains', ops(m.haze), 900); if (img) g.drawImage(img, m.x, m.y, m.w, m.w * img.height / img.width); }
    for (const f of L.forest) { const img = this.graded('forest', ops(f.haze), 900); if (img) { const fw = this.a.forest.width * f.s, fh = this.a.forest.height * f.s; g.drawImage(img, f.x, f.base - fh, fw, fh); } }
    if (L.waterfall) { const wf = L.waterfall, img = this.graded('waterfall', ops(0), 900); if (img) { const ww = this.a.waterfall.width * wf.s, wh = this.a.waterfall.height * wf.s; g.drawImage(img, wf.x, wf.base - wh, ww, wh); } }
    const water = this.graded('water', ops(0), 900);
    if (water) g.drawImage(water, -60, L.hz - 8, W + 120, H - L.hz + 48);
    for (const [kk, lx, ly, ls] of L.lilies) { const img = this.a[kk]; if (img) g.drawImage(img, lx - img.width * ls / 2, ly - img.height * ls / 2, img.width * ls, img.height * ls); }
    if (L.dock) { const d = L.dock, img = this.graded('dock', ops(0), 900); if (img) g.drawImage(img, d.x, d.y, this.a.dock.width * d.s, this.a.dock.height * d.s); }
    for (const fg of [L.fg, L.fg2]) { if (!fg) continue; const src = this.a[fg.key]; if (!src) continue; const ww = W + 80, hh = ww * src.height / src.width; const img = this.graded(fg.key, ops(0), 900); if (fg.clipLeft) { g.save(); g.beginPath(); g.rect(fg.clipLeft - 60, 0, W, H); g.clip(); } g.drawImage(img, -40, H - hh + 30, ww, hh); if (fg.clipLeft) g.restore(); }
    void fake; void keep;
    return c;
  }
}
