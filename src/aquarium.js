// Goop Aquarium — living tanks where the Goops you've caught swim around.
// Presentation only: it reads game state and reports taps; the game decides what they do.
import { GOOPS, RANK, THEMES, SETS } from './game.js';

const H = 900; // logical height; width follows the canvas aspect
const SIZE = [92, 104, 118, 136, 168]; // drawn height by rarity (front of the tank)
const SPEED = { steady: 62, pulse: 74, dart: 110, drift: 44, sleepy: 30, wild: 96 };
// where each decoration stands, as a fraction of the tank width, and how big it is drawn
const SLOT = { shrooms: [0.08, 1], castle: [0.2, 1.05], coral: [0.33, 1.05], throne: [0.45, 0.95], ship: [0.54, 1.25], statue: [0.6, 1], anchor: [0.7, 1], chest: [0.8, 1.05], crystals: [0.92, 1] };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function rnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function shade(hex, k) { // k < 0 darker, > 0 lighter
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export class Tank {
  constructor(canvas, assets, scene) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.a = assets;
    this.scene = scene; // for glows, shiny art
    this.fish = new Map();
    this.food = [];
    this.fx = [];
    this.bubbles = [];
    this.t = 0;
    this.index = 0;
    this.feedMode = false;
    this.running = false;
    this.W = 1600;
    this.k = 1;
    const r = rnd(42);
    this.pebbles = Array.from({ length: 90 }, () => ({ x: r(), y: r(), s: 3 + r() * 9, c: r() }));
    this.blades = Array.from({ length: 18 }, (_, i) => ({ x: (i + r() * 0.8) / 18, h: 0.28 + r() * 0.42, ph: r() * 6, w: 14 + r() * 14, layer: i % 3 }));
    this.rocks = Array.from({ length: 5 }, (_, i) => ({ x: (i + 0.3 + r() * 0.4) / 5, w: 50 + r() * 70, h: 26 + r() * 30 }));
    this.hills = Array.from({ length: 7 }, (_, i) => ({ x: i / 6, w: 0.2 + r() * 0.16, h: 80 + r() * 120 }));
    this.motes = Array.from({ length: 50 }, () => ({ x: r(), y: r(), s: 1 + r() * 2.2, ph: r() * 6, v: 4 + r() * 8 }));
    this.rays = Array.from({ length: 5 }, (_, i) => ({ x: (i + r() * 0.6) / 5, w: 0.06 + r() * 0.08, ph: r() * 6 }));
    this.stone = new Map();
  }

  get tank() { return this.state?.tank.tanks[this.index] || this.state?.tank.tanks[0]; }
  get theme() { return THEMES[this.tank?.theme] || THEMES.pond; }

  // ----- state -----

  /** Show tank `index` and sync its residents (new arrivals drop in from the top). */
  sync(state, index = this.index) {
    this.state = state;
    if (index !== this.index) { this.index = index; this.fish.clear(); this.food = []; this.fx = []; this.fresh = true; }
    const ids = this.tank?.fish || [];
    const floor = H - 140;
    for (const id of ids) {
      if (this.fish.has(id)) continue;
      const g = GOOPS.find((x) => x.id === id);
      if (!g) continue;
      const e = state.dex[id];
      const span = g.size[1] - g.size[0];
      const frac = e?.best != null && span > 0 ? clamp((e.best - g.size[0]) / span, 0, 1) : 0.4;
      const z = 0.62 + Math.random() * 0.38; // depth: 1 = against the front glass
      const x = 140 + Math.random() * (this.W - 280);
      const arrive = this.running && this.started && !this.fresh;
      this.fish.set(id, {
        id, g, z, base: SIZE[RANK[g.rarity]] * (0.85 + frac * 0.3), x, y: arrive ? -80 : 140 + Math.random() * (floor - 260),
        vx: 0, vy: 0, face: Math.random() < 0.5 ? -1 : 1, tx: x, ty: 300, wait: Math.random() * 3, ph: Math.random() * 6.28,
        speed: SPEED[g.pattern] || 60, spin: 0, jump: 0, hunger: 0.5 + Math.random() * 0.5,
      });
    }
    for (const id of [...this.fish.keys()]) if (!ids.includes(id)) this.fish.delete(id);
    this.started = true; this.fresh = false;
  }

  start() { if (this.running) return; this.running = true; this.last = null; requestAnimationFrame((t) => this.loop(t)); }
  stop() { this.running = false; }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    this.k = h / H;
    this.W = w / this.k;
  }

  loop(ts) {
    if (!this.running) return;
    const dt = this.last == null ? 0 : Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.resize();
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ----- input -----

  /** A tap (canvas pixels): feeds in feed mode, otherwise pokes the Goop under the finger. Returns a Goop id or null. */
  tap(px, py) {
    const x = px / this.k, y = py / this.k;
    if (this.feedMode) { this.dropFood(x); return null; }
    let best = null;
    for (const f of [...this.fish.values()].sort((a, b) => b.z - a.z)) {
      const w = this.artW(f), h = this.h(f);
      if (Math.abs(x - f.x) < w * 0.5 && Math.abs(y - f.y) < h * 0.5) { best = f; break; }
    }
    if (!best) { this.ripple(x, y); return null; }
    best.spin = 1; best.jump = 0.8;
    this.hearts(best.x, best.y - this.h(best) * 0.45, 5);
    return best.id;
  }

  dropFood(x) {
    if (this.food.length > 18) this.food.splice(0, 3);
    for (let i = 0; i < 4; i++) this.food.push({ x: x + (i - 1.5) * 22 + (Math.random() - 0.5) * 12, y: 30 - i * 10, vy: 26 + Math.random() * 18, ph: Math.random() * 6, claims: 0 });
    this.fx.push({ kind: 'ring', x, y: 26, t: 0, dur: 0.7 });
  }

  hearts(x, y, n) { for (let i = 0; i < n; i++) this.fx.push({ kind: 'heart', x: x + (Math.random() - 0.5) * 50, y, vy: -50 - Math.random() * 50, t: 0, dur: 1.2 }); }
  ripple(x, y) { this.fx.push({ kind: 'ring', x, y, t: 0, dur: 0.7 }); }

  // ----- simulation -----

  get fit() { return clamp(this.W / 1500, 0.62, 1); } // narrow (phone) tanks draw everything smaller
  h(f) { return f.base * (0.55 + f.z * 0.45) * this.fit; }
  artW(f) { const art = this.a[`goop:${f.id}`]; return art ? (art.width / art.height) * this.h(f) : this.h(f) * 1.4; }

  update(dt) {
    this.t += dt;
    const W = this.W, floor = H - 140;
    for (const p of this.food) { p.y += p.vy * dt; p.x += Math.sin(this.t * 2 + p.ph) * 10 * dt; if (p.y > floor + 10) { p.y = floor + 10; p.vy = 0; p.rest = (p.rest || 0) + dt; } }
    this.food = this.food.filter((p) => (p.rest || 0) < 14);
    for (const p of this.food) p.claims = 0;
    const list = [...this.fish.values()];
    for (const f of list) {
      f.hunger = Math.min(1, f.hunger + dt * 0.02);
      let target = null;
      // only hungry Goops chase food, and no more than two per pellet
      if (this.food.length && f.hunger > 0.35) {
        let bd = 600;
        for (const p of this.food) { if (p.claims >= 2) continue; const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; target = p; } }
        if (target) target.claims += 1;
      }
      if (target) {
        f.tx = target.x; f.ty = target.y;
        if (Math.hypot(target.x - f.x, target.y - f.y) < 26 + this.h(f) * 0.25) {
          this.food.splice(this.food.indexOf(target), 1);
          f.hunger = Math.max(0, f.hunger - 0.4); f.jump = 0.35;
          this.hearts(f.x, f.y - this.h(f) * 0.4, 2);
          this.fx.push({ kind: 'crumb', x: target.x, y: target.y, t: 0, dur: 0.5 });
        }
      } else {
        f.wait -= dt;
        if (f.wait <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 24) {
          // drift to a new spot in its own depth band, keeping clear of the sand and surface
          f.tx = 120 + Math.random() * (W - 240);
          f.ty = 130 + Math.random() * (floor - 230) + (1 - f.z) * -40;
          f.wait = 4 + Math.random() * 7;
          f.burst = (f.g.pattern === 'dart' || f.g.pattern === 'wild') && Math.random() < 0.35 ? 1 : 0;
        }
      }
      f.burst = Math.max(0, (f.burst || 0) - dt);
      const speed = f.speed * (target ? 1.8 : 1) * (f.burst ? 2 : 1) * (0.7 + f.z * 0.3);
      let ax = f.tx - f.x, ay = f.ty - f.y;
      const d = Math.hypot(ax, ay) || 1;
      let vx = (ax / d) * speed * Math.min(1, d / 90), vy = (ay / d) * speed * 0.55 * Math.min(1, d / 90);
      // personal space: push away from neighbours at a similar depth
      for (const o of list) {
        if (o === f || Math.abs(o.z - f.z) > 0.18) continue;
        const dx = f.x - o.x, dy = f.y - o.y, dist = Math.hypot(dx, dy), min = (this.artW(f) + this.artW(o)) * 0.42;
        if (dist > 0 && dist < min) { const push = (1 - dist / min) * 90; vx += (dx / dist) * push; vy += (dy / dist) * push * 0.7; }
      }
      f.vx = lerp(f.vx, vx, 1 - Math.exp(-dt * 1.8));
      f.vy = lerp(f.vy, vy, 1 - Math.exp(-dt * 1.8));
      f.x += f.vx * dt; f.y += f.vy * dt;
      const h = this.h(f);
      f.x = clamp(f.x, 50, W - 50); f.y = clamp(f.y, 70 + h * 0.3, floor - h * 0.35);
      if (Math.abs(f.vx) > 6) f.face = lerp(f.face, Math.sign(f.vx), 1 - Math.exp(-dt * 5));
      f.spin = Math.max(0, f.spin - dt * 1.4);
      f.jump = Math.max(0, f.jump - dt);
      if (this.state?.dex[f.id]?.shiny && Math.random() < dt * 3) this.fx.push({ kind: 'spark', x: f.x + (Math.random() - 0.5) * this.artW(f) * 0.8, y: f.y + (Math.random() - 0.5) * h * 0.8, t: 0, dur: 0.8 });
    }
    // bubbles: a stream from the bubble stone and a burp from the chest
    if (Math.random() < dt * 7) this.bubbles.push({ x: W * 0.035 + (Math.random() - 0.5) * 10, y: floor + 6, r: 3 + Math.random() * 6, vy: 70 + Math.random() * 60, ph: Math.random() * 6 });
    if (this.tank?.decor.includes('chest') && this.chestOpen() > 0.9 && Math.random() < dt * 14) this.bubbles.push({ x: W * SLOT.chest[0] + (Math.random() - 0.5) * 30, y: floor - 20, r: 3 + Math.random() * 5, vy: 80, ph: Math.random() * 6 });
    for (const b of this.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(this.t * 3 + b.ph) * 18 * dt; }
    this.bubbles = this.bubbles.filter((b) => b.y > 20).slice(-140);
    for (const p of this.fx) { p.t += dt; if (p.vy) p.y += p.vy * dt; }
    this.fx = this.fx.filter((p) => p.t < p.dur);
  }

  chestOpen() { return clamp(Math.sin(this.t * 0.6) * 3 - 2.2, 0, 1); }

  // ----- drawing -----

  draw() {
    const g = this.ctx, W = this.W, t = this.t, k = this.k;
    const th = this.theme;
    const floor = H - 140;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // water
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, th.top); bg.addColorStop(0.55, th.mid); bg.addColorStop(1, th.bot);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // far hills, softened by the water
    g.fillStyle = hexA(th.bot, 0.55);
    g.beginPath(); g.moveTo(0, floor);
    for (const hl of this.hills) { const x = hl.x * W; g.quadraticCurveTo(x - hl.w * W * 0.25, floor - hl.h, x, floor - hl.h * 0.8); g.quadraticCurveTo(x + hl.w * W * 0.25, floor - hl.h * 0.6, x + hl.w * W * 0.5, floor); }
    g.lineTo(W, floor); g.closePath(); g.fill();
    // god rays
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rays) {
      const x = r.x * W + Math.sin(t * 0.25 + r.ph) * 50, w = r.w * W;
      const a = 0.09 + Math.sin(t * 0.6 + r.ph) * 0.03;
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, hexA(th.ray, 0)); gr.addColorStop(0.5, hexA(th.ray, a)); gr.addColorStop(1, hexA(th.ray, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + w, 0); g.lineTo(x + w * 1.6 + 120, floor); g.lineTo(x + w * 0.2 + 120, floor); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // back plants
    this.drawBlades(g, 0, th);
    // the model wreck sits behind everything else
    if (this.tank?.decor.includes('ship')) this.drawDecor(g, 'ship', W * SLOT.ship[0], floor + 26, SLOT.ship[1] * this.fit, th);
    // sand bed with ripples, pebbles and rocks
    const sand = g.createLinearGradient(0, floor - 20, 0, H);
    sand.addColorStop(0, th.sand[0]); sand.addColorStop(1, th.sand[1]);
    const sandY = (x) => floor + Math.sin(x * 0.005) * 12 + Math.sin(x * 0.019) * 5;
    g.fillStyle = sand;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W + 40; x += 40) g.lineTo(x, sandY(x));
    g.lineTo(W, H); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2;
    for (let row = 0; row < 5; row++) {
      g.beginPath();
      for (let x = 0; x <= W; x += 30) { const y = floor + 24 + row * 22 + Math.sin(x * 0.02 + row) * 4; x ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
    for (const p of this.pebbles) {
      const x = p.x * W, y = floor + 26 + p.y * 104;
      g.fillStyle = p.c < 0.5 ? 'rgba(0,0,0,.2)' : 'rgba(255,255,255,.16)';
      g.beginPath(); g.ellipse(x, y, p.s, p.s * 0.6, 0, 0, 6.29); g.fill();
    }
    for (const r of this.rocks) this.drawRock(g, r.x * W, floor + 30, r.w, r.h, th.rock);
    // light dancing on the sand
    const caus = this.a.caustics;
    if (caus) {
      const frame = Math.floor(t * 8) % 8, fw = caus.width / 8;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.14;
      for (let x = -200; x < W + 200; x += 420) g.drawImage(caus, frame * fw, 0, fw, caus.height, x + ((t * 10) % 420), floor - 10, 440, 150);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    // bubble stone
    this.drawRock(g, W * 0.035, floor + 18, 34, 22, '#5a6a72');
    // decorations
    const decor = (this.tank?.decor || []).filter((id) => id !== 'ship').sort((a, b) => SLOT[a][0] - SLOT[b][0]);
    for (const id of decor) this.drawDecor(g, id, W * SLOT[id][0], floor + 30, SLOT[id][1] * this.fit, th);
    this.drawTrophies(g, floor);
    // middle plants
    this.drawBlades(g, 1, th);
    // food
    for (const p of this.food) {
      g.fillStyle = '#c87a30'; g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.29); g.fill();
      g.fillStyle = '#ffc070'; g.beginPath(); g.arc(p.x - 1.5, p.y - 1.5, 2, 0, 6.29); g.fill();
    }
    // fish (far first), each with a soft shadow on the sand
    const fish = [...this.fish.values()].sort((a, b) => a.z - b.z);
    for (const f of fish) {
      const lift = clamp((floor - f.y) / (floor - 100), 0, 1);
      g.fillStyle = `rgba(0,0,0,${0.18 * (1 - lift * 0.7) * f.z})`;
      g.beginPath(); g.ellipse(f.x, floor + 20 + (1 - f.z) * -14, this.artW(f) * 0.32 * (1 - lift * 0.4), 7, 0, 0, 6.29); g.fill();
    }
    for (const f of fish) this.drawFish(g, f, th);
    // floating motes
    g.globalCompositeOperation = 'lighter';
    for (const m of this.motes) {
      const x = (m.x * W + Math.sin(t * 0.3 + m.ph) * 30) % W, y = ((m.y * floor - t * m.v) % floor + floor) % floor;
      g.globalAlpha = 0.25 + Math.sin(t * 2 + m.ph) * 0.15; g.fillStyle = th.ray;
      g.beginPath(); g.arc(x, y, m.s, 0, 6.29); g.fill();
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // bubbles
    for (const b of this.bubbles) {
      const gr = g.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, 0, b.x, b.y, b.r);
      gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.5, 'rgba(210,245,255,.18)'); gr.addColorStop(1, 'rgba(220,250,255,.5)');
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.29); g.fill();
    }
    // front plants
    this.drawBlades(g, 2, th);
    // effects
    for (const p of this.fx) this.drawFx(g, p);
    // surface, glass and vignette
    const surf = g.createLinearGradient(0, 0, 0, 60);
    surf.addColorStop(0, hexA(th.ray, 0.45)); surf.addColorStop(1, hexA(th.ray, 0));
    g.fillStyle = surf; g.fillRect(0, 0, W, 60);
    g.strokeStyle = hexA(th.ray, 0.5); g.lineWidth = 2;
    g.beginPath(); for (let x = 0; x <= W; x += 24) { const y = 10 + Math.sin(x * 0.02 + t * 2) * 3; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const glass = g.createLinearGradient(0, 0, W, H);
    glass.addColorStop(0, 'rgba(255,255,255,.07)'); glass.addColorStop(0.22, 'rgba(255,255,255,0)');
    glass.addColorStop(0.7, 'rgba(255,255,255,0)'); glass.addColorStop(0.72, 'rgba(255,255,255,.05)'); glass.addColorStop(0.76, 'rgba(255,255,255,0)');
    g.fillStyle = glass; g.fillRect(0, 0, W, H);
    const vg = g.createRadialGradient(W / 2, H * 0.45, H * 0.45, W / 2, H * 0.45, H * 1.15);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,6,12,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  drawFx(g, p) {
    const q = p.t / p.dur;
    g.globalAlpha = 1 - q;
    if (p.kind === 'heart') {
      g.fillStyle = '#ff6a9a';
      const s = 9 + q * 4;
      g.beginPath(); g.moveTo(p.x, p.y + s * 0.9);
      g.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.6, p.y - s * 1.4, p.x, p.y - s * 0.4);
      g.bezierCurveTo(p.x + s * 0.6, p.y - s * 1.4, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s * 0.9); g.fill();
    } else if (p.kind === 'ring') {
      g.strokeStyle = 'rgba(230,250,255,.8)'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(p.x, p.y, 10 + q * 60, 4 + q * 18, 0, 0, 6.29); g.stroke();
    } else if (p.kind === 'spark') {
      g.fillStyle = '#fff6a0';
      g.save(); g.translate(p.x, p.y); g.rotate(q * 3); const s = 8 * (1 - q); g.fillRect(-s, -1, s * 2, 2); g.fillRect(-1, -s, 2, s * 2); g.restore();
    } else if (p.kind === 'crumb') {
      g.fillStyle = '#ffc070';
      for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(p.x + Math.cos(i * 1.3) * q * 22, p.y + Math.sin(i * 1.3) * q * 22, 2, 0, 6.29); g.fill(); }
    }
    g.globalAlpha = 1;
  }

  /** Leafy seagrass blades. layer 0 = back (dim), 1 = middle, 2 = front corners (big, dark). */
  drawBlades(g, layer, th) {
    const W = this.W, floor = H - 140, t = this.t;
    for (const b of this.blades) {
      if (b.layer !== layer) continue;
      if (layer === 2 && b.x > 0.16 && b.x < 0.84) continue; // keep the front clear except the corners
      if (this.fit < 0.8 && layer < 2 && this.blades.indexOf(b) % 2) continue; // fewer plants in narrow tanks
      const x0 = b.x * W, hgt = b.h * (H - 220) * (this.fit < 0.8 ? 0.85 : 1) * (layer === 2 ? 1.15 : layer === 0 ? 0.85 : 1);
      const baseY = floor + (layer === 2 ? 120 : layer === 1 ? 40 : 20);
      const w = b.w * (layer === 2 ? 1.5 : layer === 0 ? 0.8 : 1);
      const pts = [];
      for (let i = 0; i <= 10; i++) { const u = i / 10; pts.push([x0 + Math.sin(t * 0.7 + b.ph + u * 2.6) * 26 * u * u + u * 18, baseY - hgt * u]); }
      const gr = g.createLinearGradient(0, baseY, 0, baseY - hgt);
      const dark = layer === 2 ? shade(th.plant[0], -0.45) : layer === 0 ? shade(th.plant[0], -0.2) : th.plant[0];
      gr.addColorStop(0, dark); gr.addColorStop(1, layer === 2 ? th.plant[0] : th.plant[1]);
      g.globalAlpha = layer === 0 ? 0.55 : 1;
      g.fillStyle = gr;
      g.beginPath();
      pts.forEach(([x, y], i) => { const half = w * (1 - i / 10) * 0.5 + 1; i ? g.lineTo(x - half, y) : g.moveTo(x - half, y); });
      for (let i = pts.length - 1; i >= 0; i--) { const [x, y] = pts[i]; const half = w * (1 - i / 10) * 0.5 + 1; g.lineTo(x + half, y); }
      g.closePath(); g.fill();
      // a few leaves along the stem
      for (let i = 2; i < 10; i += 2) {
        const [x, y] = pts[i], side = i % 4 ? 1 : -1, len = w * 1.6 * (1 - i / 14);
        g.beginPath(); g.ellipse(x + side * len * 0.6, y, len, len * 0.32, side * -0.5 + Math.sin(t + i) * 0.08, 0, 6.29); g.fill();
      }
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1.5;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
      g.globalAlpha = 1;
    }
  }

  drawRock(g, x, y, w, h, col) {
    const gr = g.createRadialGradient(x - w * 0.3, y - h * 0.6, 2, x, y - h * 0.3, w);
    gr.addColorStop(0, shade(col, 0.35)); gr.addColorStop(0.6, col); gr.addColorStop(1, shade(col, -0.45));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x - w, y);
    g.quadraticCurveTo(x - w * 0.9, y - h * 0.9, x - w * 0.2, y - h); g.quadraticCurveTo(x + w * 0.6, y - h * 1.05, x + w, y);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(80,160,80,.35)'; g.beginPath(); g.ellipse(x - w * 0.2, y - h * 0.9, w * 0.4, h * 0.15, -0.1, 0, 6.29); g.fill();
  }

  drawFish(g, f, th) {
    const art = this.a[`goop:${f.id}`];
    if (!art) return;
    const e = this.state.dex[f.id];
    const img = e?.shiny ? this.scene.shinyArt(f.id) || art : art;
    const w = this.artW(f), h = this.h(f), t = this.t;
    const bob = Math.sin(t * 2 + f.ph) * 4;
    const jumpY = f.jump > 0 ? -Math.sin((f.jump / 0.8) * Math.PI) * 26 : 0;
    const y = f.y + bob + jumpY;
    if (f.g.rarity === 'Legendary' || e?.shiny) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = (0.28 + Math.sin(t * 2 + f.ph) * 0.1) * f.z;
      g.drawImage(this.scene.tintGlow(e?.shiny ? '#fff27a' : f.g.color), f.x - w * 0.9, y - h * 0.9, w * 1.8, h * 1.8);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.translate(f.x, y);
    g.rotate(clamp(f.vy / 260, -0.3, 0.3) * Math.sign(f.face || 1) + f.spin * Math.PI * 2);
    g.scale(-(f.face || 1), 1); // portraits face left
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
    // distant Goops fade into the water colour
    if (f.z < 0.9) {
      g.globalAlpha = (0.9 - f.z) * 0.55;
      g.fillStyle = th.mid;
      g.save(); g.translate(f.x, y); g.rotate(clamp(f.vy / 260, -0.3, 0.3) * Math.sign(f.face || 1) + f.spin * Math.PI * 2); g.scale(-(f.face || 1), 1);
      g.drawImage(this.tinted(f.id, th.mid), -w / 2, -h / 2, w, h);
      g.restore(); g.globalAlpha = 1;
    }
    if (this.state.buddy === f.id) {
      g.font = '900 18px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillText('♥ BUDDY', f.x + 1, y - h * 0.6 + 1);
      g.fillStyle = '#c6ff5a'; g.fillText('♥ BUDDY', f.x, y - h * 0.6);
    }
  }

  /** A flat water-coloured copy of a Goop, laid over distant ones for depth. */
  tinted(id, col) {
    const key = `${id}|${col}`;
    this.tints ||= new Map();
    if (this.tints.has(key)) return this.tints.get(key);
    const art = this.a[`goop:${id}`];
    const c = document.createElement('canvas'); c.width = art.width; c.height = art.height;
    const x = c.getContext('2d'); x.drawImage(art, 0, 0);
    x.globalCompositeOperation = 'source-atop'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
    this.tints.set(key, c);
    return c;
  }

  drawTrophies(g, floor) {
    const sets = this.state?.sets || [];
    if (!sets.length || this.index !== 0) return; // trophies live in the first tank
    const W = this.W, n = Math.min(sets.length, 8);
    const x0 = W - 30 - n * 40;
    this.drawRock(g, x0 + n * 20, floor + 50, n * 22 + 26, 30, '#5a5e66');
    sets.slice(0, n).forEach((id, i) => {
      const set = SETS.find((s) => s.id === id);
      const x = x0 + i * 40 + 20, y = floor + 26;
      const gr = g.createLinearGradient(x - 12, 0, x + 12, 0); gr.addColorStop(0, '#b07a10'); gr.addColorStop(0.5, '#fff0a0'); gr.addColorStop(1, '#b07a10');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 12, y - 30); g.lineTo(x + 12, y - 30); g.quadraticCurveTo(x + 10, y - 10, x, y - 9); g.quadraticCurveTo(x - 10, y - 10, x - 12, y - 30); g.fill();
      g.strokeStyle = '#d8a83a'; g.lineWidth = 3;
      g.beginPath(); g.arc(x - 13, y - 22, 5, Math.PI * 0.5, Math.PI * 1.5); g.stroke(); g.beginPath(); g.arc(x + 13, y - 22, 5, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
      g.fillStyle = gr; g.fillRect(x - 3, y - 10, 6, 7); g.fillRect(x - 9, y - 4, 18, 5);
      g.font = '13px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(set?.icon || '🏆', x, y - 15);
    });
  }

  stoneArt(id) {
    if (this.stone.has(id)) return this.stone.get(id);
    const art = this.a[`goop:${id}`];
    if (!art) return null;
    const c = document.createElement('canvas'); c.width = art.width; c.height = art.height;
    const x = c.getContext('2d'); x.drawImage(art, 0, 0);
    try {
      const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
      for (let i = 0; i < p.length; i += 4) { const v = (p[i] * 0.3 + p[i + 1] * 0.59 + p[i + 2] * 0.11) * 0.7 + 40; p[i] = v; p[i + 1] = v * 0.98; p[i + 2] = v * 0.92; }
      x.putImageData(d, 0, 0);
    } catch { /* file:// */ }
    this.stone.set(id, c);
    return c;
  }

  glow(g, col, x, y, r, a) {
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
    g.drawImage(this.scene.tintGlow(col), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }

  /** Decorations, drawn standing on the sand at (x, y), scaled by s. */
  drawDecor(g, id, x, y, s, th) {
    const t = this.t;
    g.save(); g.translate(x, y); g.scale(s, s);
    // contact shadow so it sits in the sand
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, 4, id === 'ship' ? 170 : 70, 12, 0, 0, 6.29); g.fill();
    if (id === 'coral') {
      this.drawRock(g, 0, 6, 46, 22, th.rock);
      const branch = (bx, by, a, len, w, depth) => {
        const sway = Math.sin(t * 0.9 + depth + bx * 0.05) * 0.04;
        const ex = bx + Math.cos(a + sway) * len, ey = by + Math.sin(a + sway) * len;
        const gr = g.createLinearGradient(bx, by, ex, ey); gr.addColorStop(0, '#e0406a'); gr.addColorStop(1, depth ? '#ff7aa0' : '#ffb0c8');
        g.strokeStyle = gr; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo((bx + ex) / 2 + w * 0.3, (by + ey) / 2, ex, ey); g.stroke();
        if (depth > 0) { branch(ex, ey, a - 0.5, len * 0.74, w * 0.7, depth - 1); branch(ex, ey, a + 0.42, len * 0.7, w * 0.7, depth - 1); }
        else { g.fillStyle = '#ffe0ea'; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(ex + Math.cos(i * 2) * 4, ey + Math.sin(i * 2) * 4, 2.6, 0, 6.29); g.fill(); } }
      };
      branch(-14, -6, -Math.PI / 2 - 0.25, 60, 15, 3);
      branch(18, -4, -Math.PI / 2 + 0.3, 46, 12, 2);
    } else if (id === 'anchor') {
      // chain trailing off the top
      g.strokeStyle = '#8a7a6a'; g.lineWidth = 3;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(-4 + Math.sin(i * 0.8 + t * 0.6) * 3, -160 - i * 16, 5, 9, i % 2 ? 0 : 1.57, 0, 6.29); g.stroke(); }
      g.rotate(0.22);
      const metal = g.createLinearGradient(-14, 0, 14, 0); metal.addColorStop(0, '#4a3a30'); metal.addColorStop(0.5, '#9a8270'); metal.addColorStop(1, '#3a2a22');
      g.strokeStyle = metal; g.lineWidth = 14; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -132); g.lineTo(0, -10); g.stroke();
      g.beginPath(); g.arc(0, -56, 54, 0.35, Math.PI - 0.35); g.stroke();
      g.beginPath(); g.moveTo(-32, -106); g.lineTo(32, -106); g.stroke();
      g.fillStyle = '#6a5a4a';
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * 50, -36); g.lineTo(sx * 66, -52); g.lineTo(sx * 46, -22); g.closePath(); g.fill(); }
      g.lineWidth = 7; g.strokeStyle = '#7a6656'; g.beginPath(); g.arc(0, -146, 13, 0, 6.29); g.stroke();
      g.fillStyle = 'rgba(190,100,40,.55)'; for (const [rx, ry, rr] of [[6, -80, 5], [-30, -36, 4], [22, -40, 4], [-3, -118, 3]]) { g.beginPath(); g.arc(rx, ry, rr, 0, 6.29); g.fill(); }
    } else if (id === 'shrooms') {
      for (const [dx, h, r, col] of [[-34, 48, 26, '#5ff2ff'], [8, 84, 38, '#a98aff'], [46, 38, 22, '#5ff2ff'], [-6, 30, 16, '#ff8ad8']]) {
        this.glow(g, col, dx, -h, r * 2, 0.4 + Math.sin(t * 2 + dx) * 0.12);
        const stem = g.createLinearGradient(dx - 6, 0, dx + 6, 0); stem.addColorStop(0, '#c8c0b0'); stem.addColorStop(0.5, '#f4eee2'); stem.addColorStop(1, '#a8a090');
        g.fillStyle = stem; g.beginPath(); g.moveTo(dx - 6, 0); g.quadraticCurveTo(dx - 3, -h * 0.5, dx - 5, -h); g.lineTo(dx + 5, -h); g.quadraticCurveTo(dx + 3, -h * 0.5, dx + 6, 0); g.closePath(); g.fill();
        const cap = g.createRadialGradient(dx - r * 0.3, -h - r * 0.4, 2, dx, -h, r); cap.addColorStop(0, shade(col, 0.5)); cap.addColorStop(1, shade(col, -0.25));
        g.fillStyle = cap; g.beginPath(); g.ellipse(dx, -h, r, r * 0.62, 0, Math.PI, 0); g.closePath(); g.fill();
        g.fillStyle = shade(col, -0.4); g.beginPath(); g.ellipse(dx, -h, r, r * 0.14, 0, 0, Math.PI); g.fill();
        g.fillStyle = 'rgba(255,255,255,.75)';
        for (const [sx, sy, sr] of [[-0.4, -0.35, 0.12], [0.2, -0.45, 0.1], [0.45, -0.18, 0.07], [-0.05, -0.15, 0.08]]) { g.beginPath(); g.arc(dx + sx * r, -h + sy * r, sr * r, 0, 6.29); g.fill(); }
      }
    } else if (id === 'crystals') {
      this.drawRock(g, 0, 6, 54, 24, th.rock);
      for (const [dx, h, w, col, a] of [[-28, 92, 22, '#c08aff', -0.28], [2, 136, 28, '#7ad8ff', 0.02], [32, 82, 20, '#ffc04a', 0.32], [16, 58, 15, '#c08aff', 0.16], [-12, 50, 13, '#7ad8ff', -0.1]]) {
        g.save(); g.rotate(a); g.translate(dx, 0);
        this.glow(g, col, 0, -h * 0.6, w * 2.6, 0.32 + Math.sin(t * 1.6 + dx) * 0.12);
        g.fillStyle = shade(col, -0.25); g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h * 0.78); g.lineTo(0, -h); g.lineTo(0, 0); g.closePath(); g.fill();
        g.fillStyle = col; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -h); g.lineTo(w / 2, -h * 0.78); g.lineTo(w / 2, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(-w * 0.35, -h * 0.7); g.lineTo(-w * 0.1, -h * 0.86); g.lineTo(-w * 0.1, -h * 0.3); g.lineTo(-w * 0.35, -h * 0.2); g.closePath(); g.fill();
        const tw = Math.max(0, Math.sin(t * 2.2 + dx));
        if (tw > 0.6) { g.fillStyle = '#fff'; g.globalAlpha = (tw - 0.6) * 2.5; g.fillRect(-1, -h - 9, 2, 18); g.fillRect(-9, -h - 1, 18, 2); g.globalAlpha = 1; }
        g.restore();
      }
    } else if (id === 'castle') {
      const stone = (x0, y0, w, h) => {
        const gr = g.createLinearGradient(x0, 0, x0 + w, 0); gr.addColorStop(0, '#9a8a6a'); gr.addColorStop(0.4, '#d8c8a0'); gr.addColorStop(1, '#8a7a5a');
        g.fillStyle = gr; g.fillRect(x0, y0, w, h);
        g.strokeStyle = 'rgba(90,70,40,.35)'; g.lineWidth = 1.5;
        for (let yy = y0 + 14; yy < y0 + h; yy += 14) { g.beginPath(); g.moveTo(x0, yy); g.lineTo(x0 + w, yy); g.stroke(); for (let xx = x0 + ((yy / 14) % 2 ? 10 : 22); xx < x0 + w; xx += 24) { g.beginPath(); g.moveTo(xx, yy - 14); g.lineTo(xx, yy); g.stroke(); } }
      };
      stone(-66, -96, 132, 96);
      for (let i = 0; i < 5; i++) stone(-66 + i * 28, -110, 16, 14);
      for (const tx of [-92, 56]) {
        stone(tx, -160, 36, 160);
        g.fillStyle = '#c0405a'; g.beginPath(); g.moveTo(tx - 6, -160); g.lineTo(tx + 18, -206); g.lineTo(tx + 42, -160); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.moveTo(tx + 18, -206); g.lineTo(tx + 42, -160); g.lineTo(tx + 18, -160); g.closePath(); g.fill();
        g.fillStyle = '#ffd27a'; g.beginPath(); g.moveTo(tx + 12, -112); g.lineTo(tx + 12, -126); g.arc(tx + 18, -126, 6, Math.PI, 0); g.lineTo(tx + 24, -112); g.fill();
        this.glow(g, '#ffd27a', tx + 18, -120, 22, 0.35);
      }
      g.fillStyle = '#1a1208'; g.beginPath(); g.moveTo(-20, 0); g.lineTo(-20, -40); g.arc(0, -40, 20, Math.PI, 0); g.lineTo(20, 0); g.fill();
      g.strokeStyle = '#6a4a20'; g.lineWidth = 3; for (let i = -12; i <= 12; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, -52); g.stroke(); }
      g.fillStyle = 'rgba(80,160,70,.5)'; g.beginPath(); g.ellipse(-50, -8, 22, 8, 0, 0, 6.29); g.ellipse(70, -6, 18, 7, 0, 0, 6.29); g.fill();
      g.strokeStyle = '#5a4a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(74, -206); g.lineTo(74, -240); g.stroke();
      g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(74, -240); g.quadraticCurveTo(88, -236 + Math.sin(t * 3) * 3, 100, -232); g.lineTo(74, -224); g.fill();
    } else if (id === 'chest') {
      const open = this.chestOpen();
      const wood = g.createLinearGradient(0, -50, 0, 0); wood.addColorStop(0, '#9a5a22'); wood.addColorStop(1, '#5a3010');
      g.fillStyle = wood; g.fillRect(-54, -50, 108, 50);
      g.strokeStyle = 'rgba(40,20,5,.45)'; g.lineWidth = 2; for (const yy of [-34, -18]) { g.beginPath(); g.moveTo(-54, yy); g.lineTo(54, yy); g.stroke(); }
      const band = g.createLinearGradient(0, -50, 0, 0); band.addColorStop(0, '#ffe08a'); band.addColorStop(1, '#a87010');
      g.fillStyle = band; for (const bx of [-44, 36]) g.fillRect(bx, -50, 8, 50);
      g.fillRect(-8, -44, 16, 18); g.fillStyle = '#3a2008'; g.beginPath(); g.arc(0, -36, 3, 0, 6.29); g.fill();
      if (open > 0) {
        this.glow(g, '#ffd23a', 0, -70, 90, open * 0.7);
        g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(0, -50, 46, 10, 0, 0, 6.29); g.fill();
        g.fillStyle = '#fff0a0'; for (let i = 0; i < 7; i++) { g.beginPath(); g.ellipse(-30 + i * 10, -54 - (i % 2) * 4, 6, 3, 0, 0, 6.29); g.fill(); }
        g.fillStyle = '#5ff2ff'; g.beginPath(); g.arc(14, -58, 5, 0, 6.29); g.fill();
      }
      g.save(); g.translate(0, -50); g.translate(-54, 0); g.rotate(-open * 0.9); g.translate(54, 0);
      g.fillStyle = wood; g.beginPath(); g.moveTo(-54, 0); g.quadraticCurveTo(-54, -36, 0, -38); g.quadraticCurveTo(54, -36, 54, 0); g.closePath(); g.fill();
      g.fillStyle = band; for (const bx of [-44, 36]) { g.beginPath(); g.moveTo(bx, 0); g.quadraticCurveTo(bx, -30, bx + (bx < 0 ? 12 : -4), -34); g.lineTo(bx + 8 + (bx < 0 ? 4 : -4), -33); g.quadraticCurveTo(bx + 8, -28, bx + 8, 0); g.fill(); }
      g.restore();
    } else if (id === 'ship') {
      g.rotate(-0.1);
      g.globalAlpha = 0.92;
      const hull = g.createLinearGradient(0, -60, 0, 20); hull.addColorStop(0, '#6a4a2a'); hull.addColorStop(1, '#2a1a0a');
      g.fillStyle = hull;
      g.beginPath(); g.moveTo(-150, -50); g.lineTo(140, -50); g.quadraticCurveTo(130, 0, 96, 16); g.lineTo(-110, 16); g.quadraticCurveTo(-140, 0, -150, -50); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2; for (const yy of [-34, -18, -2]) { g.beginPath(); g.moveTo(-144, yy); g.lineTo(130, yy); g.stroke(); }
      g.fillStyle = '#3a2410'; g.fillRect(-152, -58, 294, 10);
      g.fillStyle = '#4a3018'; g.save(); g.translate(-10, -58); g.rotate(0.18); g.fillRect(-6, -150, 12, 150); g.fillRect(-60, -120, 120, 8); g.restore();
      g.fillStyle = 'rgba(230,225,200,.4)'; g.beginPath(); g.moveTo(-40, -170); g.quadraticCurveTo(10, -140, -30, -90); g.lineTo(-44, -98); g.quadraticCurveTo(-14, -136, -52, -162); g.closePath(); g.fill();
      for (const px of [-90, -50, -10, 30, 70]) { g.fillStyle = '#1a1006'; g.beginPath(); g.arc(px, -26, 8, 0, 6.29); g.fill(); g.strokeStyle = '#a88a4a'; g.lineWidth = 2; g.stroke(); }
      g.globalAlpha = 1;
      g.fillStyle = th.sand[0]; g.beginPath(); g.ellipse(-10, 18, 190, 22, 0, Math.PI, 0); g.fill();
    } else if (id === 'throne') {
      const gold = g.createLinearGradient(-60, 0, 60, 0); gold.addColorStop(0, '#9a6a08'); gold.addColorStop(0.5, '#ffe68a'); gold.addColorStop(1, '#9a6a08');
      g.fillStyle = gold;
      g.fillRect(-56, -64, 112, 64); g.fillRect(-46, -178, 92, 118);
      g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-46 + i * 23, -178); g.lineTo(-34.5 + i * 23, -208); g.lineTo(-23 + i * 23, -178); } g.fill();
      for (const sx of [-1, 1]) { g.fillRect(sx * 56 - (sx > 0 ? 14 : 0), -96, 14, 40); g.beginPath(); g.arc(sx * 56 + (sx > 0 ? -7 : 7), -98, 10, 0, 6.29); g.fill(); }
      const vel = g.createLinearGradient(0, -160, 0, -64); vel.addColorStop(0, '#d0407a'); vel.addColorStop(1, '#801a40');
      g.fillStyle = vel; g.beginPath(); g.roundRect ? g.roundRect(-36, -160, 72, 96, 12) : g.rect(-36, -160, 72, 96); g.fill();
      g.fillStyle = '#5ff2ff'; g.beginPath(); g.arc(0, -192, 8, 0, 6.29); g.fill(); this.glow(g, '#5ff2ff', 0, -192, 26, 0.45);
      g.fillStyle = '#ff5a8a'; for (const sx of [-28, 28]) { g.beginPath(); g.arc(sx, -40, 5, 0, 6.29); g.fill(); }
    } else if (id === 'statue') {
      const art = this.stoneArt('sleeper');
      const ped = g.createLinearGradient(-80, 0, 80, 0); ped.addColorStop(0, '#6a665e'); ped.addColorStop(0.5, '#b4ae9e'); ped.addColorStop(1, '#5a564e');
      g.fillStyle = ped; g.fillRect(-72, -44, 144, 44); g.fillRect(-84, -56, 168, 14);
      g.fillStyle = '#3a3830'; g.fillRect(-48, -32, 96, 18);
      g.fillStyle = '#ffd23a'; g.font = '900 12px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('THE SLEEPER', 0, -19);
      this.glow(g, '#ffd23a', 0, -150, 120, 0.2 + Math.sin(t) * 0.08);
      if (art) { const h = 160, w = (art.width / art.height) * h; g.drawImage(art, -w / 2, -56 - h, w, h); }
    }
    g.restore();
  }
}
