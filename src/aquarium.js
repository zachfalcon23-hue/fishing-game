// Goop Aquarium — a living tank where every Goop you have caught swims around.
// Presentation only: it reads game state and reports taps; the game decides what they do.
import { GOOPS, RANK, THEMES, SETS, DECOR } from './game.js';

const H = 900; // logical height; width follows the canvas aspect
const SIZE = [96, 108, 122, 142, 176]; // drawn height by rarity
const SPEED = { steady: 70, pulse: 85, dart: 130, drift: 48, sleepy: 34, wild: 115 };
const SLOT = { shrooms: 0.07, castle: 0.2, coral: 0.33, throne: 0.45, ship: 0.52, statue: 0.6, anchor: 0.68, chest: 0.8, crystals: 0.92 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
function rnd(seed) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

export class Tank {
  constructor(canvas, assets, scene) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.a = assets;
    this.scene = scene; // for glows, shiny art and silhouettes
    this.fish = new Map();
    this.food = [];
    this.fx = [];
    this.bubbles = [];
    this.t = 0;
    this.feedMode = false;
    this.running = false;
    this.W = 1600;
    const r = rnd(42);
    this.pebbles = Array.from({ length: 70 }, () => ({ x: r(), y: r(), s: 4 + r() * 10, c: r() }));
    this.kelp = Array.from({ length: 14 }, (_, i) => ({ x: (i + r() * 0.6) / 14, h: 0.35 + r() * 0.4, ph: r() * 6, w: 10 + r() * 10, back: i % 2 === 0 }));
    this.rays = Array.from({ length: 6 }, () => ({ x: r(), w: 60 + r() * 120, ph: r() * 6 }));
    this.stone = new Map();
  }

  // ----- state -----

  /** Sync the fish with the GoopDex (new catches drop in from the top). */
  sync(state) {
    this.state = state;
    const ids = Object.keys(state.dex);
    for (const id of ids) {
      if (this.fish.has(id)) continue;
      const g = GOOPS.find((x) => x.id === id);
      if (!g) continue;
      const e = state.dex[id];
      const span = g.size[1] - g.size[0];
      const frac = e.best != null && span > 0 ? clamp((e.best - g.size[0]) / span, 0, 1) : 0.4;
      const h = SIZE[RANK[g.rarity]] * (0.85 + frac * 0.3);
      const x = 120 + Math.random() * (this.W - 240);
      this.fish.set(id, {
        id, g, h, x, y: this.started ? -h : 160 + Math.random() * (H - 420), vx: 0, vy: 0, face: Math.random() < 0.5 ? -1 : 1,
        tx: x, ty: 300, wait: Math.random() * 2, ph: Math.random() * 6.28, speed: SPEED[g.pattern] || 70, spin: 0, jump: 0, full: 0,
      });
    }
    for (const id of [...this.fish.keys()]) if (!state.dex[id]) this.fish.delete(id);
    this.started = true;
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

  /** Canvas-relative pixel → logical coordinates. */
  toLogical(px, py) { return [px / this.k, py / this.k]; }

  /** A tap: feeds in feed mode, otherwise pokes the Goop under the finger. Returns a Goop id or null. */
  tap(px, py) {
    const [x, y] = this.toLogical(px, py);
    if (this.feedMode) { this.dropFood(x, y); return null; }
    let best = null, bd = Infinity;
    for (const f of this.fish.values()) {
      const w = this.artW(f);
      const d = Math.hypot((x - f.x) / (w * 0.55), (y - f.y) / (f.h * 0.5));
      if (d < 1 && d < bd) { bd = d; best = f; }
    }
    if (!best) { this.ripple(x, y); return null; }
    best.spin = 1; best.jump = 0.8;
    this.hearts(best.x, best.y - best.h * 0.4, 5);
    return best.id;
  }

  dropFood(x, y) {
    if (this.food.length > 24) this.food.splice(0, 3);
    const top = Math.min(y, 140);
    for (let i = 0; i < 3; i++) this.food.push({ x: x + (i - 1) * 18 + (Math.random() - 0.5) * 10, y: top - i * 8, vy: 30 + Math.random() * 20, ph: Math.random() * 6 });
    this.ripple(x, 70);
  }

  hearts(x, y, n) { for (let i = 0; i < n; i++) this.fx.push({ kind: 'heart', x: x + (Math.random() - 0.5) * 50, y, vy: -60 - Math.random() * 60, t: 0, dur: 1.2 }); }
  ripple(x, y) { this.fx.push({ kind: 'ring', x, y, t: 0, dur: 0.7 }); }

  // ----- simulation -----

  update(dt) {
    this.t += dt;
    const W = this.W, floor = H - 130;
    // food sinks and drifts
    for (const p of this.food) { p.y += p.vy * dt; p.x += Math.sin(this.t * 2 + p.ph) * 12 * dt; if (p.y > floor - 6) { p.y = floor - 6; p.vy = 0; } }
    for (const f of this.fish.values()) {
      // hungry fish go for the nearest pellet
      let target = null;
      if (this.food.length && f.full < 3) {
        let bd = 520;
        for (const p of this.food) { const d = Math.hypot(p.x - f.x, p.y - f.y); if (d < bd) { bd = d; target = p; } }
      }
      if (target) {
        f.tx = target.x; f.ty = target.y;
        if (Math.hypot(target.x - f.x - f.face * this.artW(f) * 0.3, target.y - f.y) < 40) {
          this.food.splice(this.food.indexOf(target), 1);
          f.full += 1; f.jump = 0.4;
          this.hearts(f.x, f.y - f.h * 0.4, 2);
          this.fx.push({ kind: 'crumb', x: target.x, y: target.y, t: 0, dur: 0.5 });
        }
      } else {
        f.wait -= dt;
        if (f.wait <= 0 || Math.hypot(f.tx - f.x, f.ty - f.y) < 20) {
          f.tx = 100 + Math.random() * (W - 200);
          f.ty = 120 + Math.random() * (floor - 260);
          f.wait = 3 + Math.random() * 6;
          if (f.g.pattern === 'dart' || f.g.pattern === 'wild') f.burst = Math.random() < 0.4 ? 1.2 : 0;
        }
      }
      f.full = Math.max(0, f.full - dt * 0.05);
      f.burst = Math.max(0, (f.burst || 0) - dt);
      const speed = f.speed * (target ? 1.7 : 1) * (f.burst ? 2.2 : 1);
      const dx = f.tx - f.x, dy = f.ty - f.y, d = Math.hypot(dx, dy) || 1;
      f.vx = lerp(f.vx, (dx / d) * speed * Math.min(1, d / 80), 1 - Math.exp(-dt * 2));
      f.vy = lerp(f.vy, (dy / d) * speed * 0.6 * Math.min(1, d / 80), 1 - Math.exp(-dt * 2));
      f.x += f.vx * dt; f.y += f.vy * dt;
      f.x = clamp(f.x, 40, W - 40); f.y = clamp(f.y, 60, floor - f.h * 0.3);
      if (Math.abs(f.vx) > 8) f.face = lerp(f.face, Math.sign(f.vx), 1 - Math.exp(-dt * 6));
      f.spin = Math.max(0, f.spin - dt * 1.4);
      f.jump = Math.max(0, f.jump - dt);
      const e = this.state?.dex[f.id];
      if (e?.shiny && Math.random() < dt * 4) this.fx.push({ kind: 'spark', x: f.x + (Math.random() - 0.5) * this.artW(f), y: f.y + (Math.random() - 0.5) * f.h, t: 0, dur: 0.8 });
    }
    // bubbles from the bubbler and the chest
    if (Math.random() < dt * 6) this.bubbles.push({ x: W * 0.04 + Math.random() * 20, y: floor - 10, r: 3 + Math.random() * 6, vy: 60 + Math.random() * 60, ph: Math.random() * 6 });
    if (this.state?.tank.decor.includes('chest') && Math.sin(this.t * 0.7) > 0.97 && Math.random() < 0.5) this.bubbles.push({ x: W * SLOT.chest + (Math.random() - 0.5) * 30, y: floor - 40, r: 4 + Math.random() * 5, vy: 80, ph: 0 });
    for (const b of this.bubbles) { b.y -= b.vy * dt; b.x += Math.sin(this.t * 3 + b.ph) * 20 * dt; }
    this.bubbles = this.bubbles.filter((b) => b.y > -20).slice(-120);
    for (const p of this.fx) { p.t += dt; if (p.vy) p.y += p.vy * dt; }
    this.fx = this.fx.filter((p) => p.t < p.dur);
  }

  artW(f) { const art = this.a[`goop:${f.id}`]; return art ? (art.width / art.height) * f.h : f.h * 1.4; }

  // ----- drawing -----

  draw() {
    const g = this.ctx, W = this.W, t = this.t, k = this.k;
    const theme = THEMES[this.state?.tank.theme] || THEMES.pond;
    const floor = H - 130;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, theme.top); bg.addColorStop(0.5, theme.mid); bg.addColorStop(1, theme.bot);
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // light rays
    g.globalCompositeOperation = 'lighter';
    for (const r of this.rays) {
      const x = r.x * W + Math.sin(t * 0.3 + r.ph) * 40;
      const gr = g.createLinearGradient(0, 0, 0, floor);
      gr.addColorStop(0, hexA(theme.ray, 0.16)); gr.addColorStop(1, hexA(theme.ray, 0));
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + r.w, 0); g.lineTo(x + r.w * 0.4 + 160, floor); g.lineTo(x - 100, floor); g.closePath(); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // back kelp
    this.drawKelp(g, true, theme);
    // the little wreck sits behind the fish
    if (this.state?.tank.decor.includes('ship')) this.drawDecor(g, 'ship', W * SLOT.ship, floor + 10, theme);
    // sand
    const sand = g.createLinearGradient(0, floor - 30, 0, H);
    sand.addColorStop(0, theme.sand[0]); sand.addColorStop(1, theme.sand[1]);
    g.fillStyle = sand;
    g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, floor + Math.sin(x * 0.006) * 14 + Math.sin(x * 0.017) * 6);
    g.lineTo(W, H); g.closePath(); g.fill();
    for (const p of this.pebbles) { g.fillStyle = p.c < 0.5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(p.x * W, floor + 30 + p.y * 90, p.s, p.s * 0.6, 0, 0, 6.29); g.fill(); }
    // decorations on the floor
    const decor = this.state?.tank.decor || [];
    for (const id of decor) if (id !== 'ship') this.drawDecor(g, id, W * SLOT[id], floor + 18, theme);
    this.drawTrophies(g, floor);
    // food
    for (const p of this.food) {
      g.fillStyle = '#d88a3a'; g.beginPath(); g.arc(p.x, p.y, 5, 0, 6.29); g.fill();
      g.fillStyle = '#ffc070'; g.beginPath(); g.arc(p.x - 1.5, p.y - 1.5, 2, 0, 6.29); g.fill();
    }
    // fish, small at the back
    const fish = [...this.fish.values()].sort((a, b) => a.h - b.h);
    for (const f of fish) this.drawFish(g, f);
    // bubbles
    for (const b of this.bubbles) {
      g.strokeStyle = 'rgba(220,250,255,.55)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(b.x, b.y, b.r, 0, 6.29); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.25, 0, 6.29); g.fill();
    }
    // front kelp
    this.drawKelp(g, false, theme);
    // effects
    for (const p of this.fx) {
      const q = p.t / p.dur;
      if (p.kind === 'heart') {
        g.globalAlpha = 1 - q; g.fillStyle = '#ff6a9a';
        const s = 9 + q * 4;
        g.beginPath(); g.moveTo(p.x, p.y + s * 0.9);
        g.bezierCurveTo(p.x - s * 1.6, p.y - s * 0.2, p.x - s * 0.6, p.y - s * 1.4, p.x, p.y - s * 0.4);
        g.bezierCurveTo(p.x + s * 0.6, p.y - s * 1.4, p.x + s * 1.6, p.y - s * 0.2, p.x, p.y + s * 0.9); g.fill();
      } else if (p.kind === 'ring') {
        g.globalAlpha = 1 - q; g.strokeStyle = 'rgba(220,250,255,.8)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(p.x, p.y, 10 + q * 60, 4 + q * 20, 0, 0, 6.29); g.stroke();
      } else if (p.kind === 'spark') {
        g.globalAlpha = 1 - q; g.fillStyle = '#fff6a0';
        g.save(); g.translate(p.x, p.y); g.rotate(q * 3); const s = 8 * (1 - q); g.fillRect(-s, -1, s * 2, 2); g.fillRect(-1, -s, 2, s * 2); g.restore();
      } else if (p.kind === 'crumb') {
        g.globalAlpha = 1 - q; g.fillStyle = '#ffc070';
        for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(p.x + Math.cos(i * 1.6) * q * 20, p.y + Math.sin(i * 1.6) * q * 20, 2, 0, 6.29); g.fill(); }
      }
      g.globalAlpha = 1;
    }
    // caustics and glass
    const caus = this.a.caustics;
    if (caus) {
      const frame = Math.floor(t * 8) % 8, fw = caus.width / 8;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.1;
      for (let x = -200; x < W; x += 500) g.drawImage(caus, frame * fw, 0, fw, caus.height, x + ((t * 15) % 500), 0, 520, 320);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    const glass = g.createLinearGradient(0, 0, W, H);
    glass.addColorStop(0, 'rgba(255,255,255,.08)'); glass.addColorStop(0.25, 'rgba(255,255,255,0)'); glass.addColorStop(0.6, 'rgba(255,255,255,0)'); glass.addColorStop(0.62, 'rgba(255,255,255,.05)'); glass.addColorStop(0.66, 'rgba(255,255,255,0)');
    g.fillStyle = glass; g.fillRect(0, 0, W, H);
    const surf = g.createLinearGradient(0, 0, 0, 40);
    surf.addColorStop(0, 'rgba(220,250,255,.35)'); surf.addColorStop(1, 'rgba(220,250,255,0)');
    g.fillStyle = surf; g.fillRect(0, 0, W, 40);
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 1.1);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,6,12,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, W, H);
  }

  drawKelp(g, back, theme) {
    const W = this.W, floor = H - 130, t = this.t;
    for (const kp of this.kelp) {
      if (kp.back !== back) continue;
      const x0 = kp.x * W, h = kp.h * (H - 200);
      g.strokeStyle = back ? 'rgba(20,70,50,.55)' : 'rgba(40,140,70,.85)';
      if (theme === THEMES.lava) g.strokeStyle = back ? 'rgba(80,20,10,.6)' : 'rgba(140,50,20,.85)';
      if (theme === THEMES.crystal || theme === THEMES.abyss) g.strokeStyle = back ? 'rgba(60,40,120,.55)' : 'rgba(110,80,200,.8)';
      g.lineWidth = kp.w * (back ? 0.8 : 1.2); g.lineCap = 'round';
      g.beginPath(); g.moveTo(x0, floor + 30);
      for (let i = 1; i <= 8; i++) { const u = i / 8; g.lineTo(x0 + Math.sin(t * 0.8 + kp.ph + u * 3) * 24 * u, floor + 30 - h * u); }
      g.stroke();
    }
  }

  drawFish(g, f) {
    const art = this.a[`goop:${f.id}`];
    if (!art) return;
    const e = this.state.dex[f.id];
    const img = e?.shiny ? this.scene.shinyArt(f.id) || art : art;
    const w = this.artW(f), h = f.h, t = this.t;
    const bob = Math.sin(t * 2 + f.ph) * 5;
    const jumpY = f.jump > 0 ? -Math.sin((f.jump / 0.8) * Math.PI) * 30 : 0;
    // legendary aura and buddy marker
    if (f.g.rarity === 'Legendary' || e?.shiny) {
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 + Math.sin(t * 2 + f.ph) * 0.12;
      g.drawImage(this.scene.tintGlow(e?.shiny ? '#fff27a' : f.g.color), f.x - w, f.y + bob - h, w * 2, h * 2);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.save();
    g.translate(f.x, f.y + bob + jumpY);
    g.rotate(clamp(f.vy / 300, -0.35, 0.35) * Math.sign(f.face || 1) + f.spin * Math.PI * 2);
    g.scale(-(f.face || 1), 1); // portraits face left
    g.drawImage(img, -w / 2, -h / 2, w, h);
    g.restore();
    if (this.state.buddy === f.id) {
      g.fillStyle = '#c6ff5a'; g.font = '900 20px "Lilita One", system-ui, sans-serif'; g.textAlign = 'center';
      g.globalAlpha = 0.85; g.fillText('♥ BUDDY', f.x, f.y + bob - h * 0.62); g.globalAlpha = 1;
    }
  }

  drawTrophies(g, floor) {
    const sets = this.state?.sets || [];
    if (!sets.length) return;
    const W = this.W;
    const x0 = W * 0.985 - sets.length * 46;
    // a flat rock ledge
    g.fillStyle = 'rgba(60,60,70,.85)';
    g.beginPath(); g.ellipse(W * 0.985 - sets.length * 23, floor + 44, sets.length * 26 + 20, 22, 0, 0, 6.29); g.fill();
    sets.forEach((id, i) => {
      const set = SETS.find((s) => s.id === id);
      const x = x0 + i * 46 + 23, y = floor + 30;
      const gr = g.createLinearGradient(x - 14, 0, x + 14, 0); gr.addColorStop(0, '#c8901a'); gr.addColorStop(0.5, '#fff0a0'); gr.addColorStop(1, '#c8901a');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(x - 14, y - 34); g.lineTo(x + 14, y - 34); g.quadraticCurveTo(x + 12, y - 12, x, y - 10); g.quadraticCurveTo(x - 12, y - 12, x - 14, y - 34); g.fill();
      g.fillRect(x - 3, y - 11, 6, 8); g.fillRect(x - 9, y - 4, 18, 5);
      g.font = '16px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(set?.icon || '🏆', x, y - 17);
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

  /** Procedural tank decorations, drawn standing on the sand at (x, y). */
  drawDecor(g, id, x, y, theme) {
    const t = this.t;
    g.save(); g.translate(x, y);
    if (id === 'coral') {
      const branch = (bx, by, a, len, w, depth) => {
        const ex = bx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
        g.strokeStyle = depth > 1 ? '#ff6a9a' : '#ff9ac0'; g.lineWidth = w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
        if (depth > 0) { branch(ex, ey, a - 0.45 + Math.sin(t + depth) * 0.03, len * 0.72, w * 0.7, depth - 1); branch(ex, ey, a + 0.4, len * 0.7, w * 0.7, depth - 1); }
        else { g.fillStyle = '#ffd0e0'; g.beginPath(); g.arc(ex, ey, w * 0.9, 0, 6.29); g.fill(); }
      };
      branch(0, 0, -Math.PI / 2, 70, 16, 3);
    } else if (id === 'anchor') {
      g.rotate(0.25);
      g.strokeStyle = '#6a5040'; g.lineWidth = 12; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -120); g.lineTo(0, -10); g.stroke();
      g.beginPath(); g.arc(0, -50, 52, 0.35, Math.PI - 0.35); g.stroke();
      g.beginPath(); g.moveTo(-30, -100); g.lineTo(30, -100); g.stroke();
      g.lineWidth = 6; g.beginPath(); g.arc(0, -132, 12, 0, 6.29); g.stroke();
      g.fillStyle = 'rgba(160,90,40,.5)'; g.beginPath(); g.arc(14, -70, 6, 0, 6.29); g.arc(-20, -30, 5, 0, 6.29); g.fill();
    } else if (id === 'shrooms') {
      for (const [dx, h, r, col] of [[-30, 50, 30, '#5ff2ff'], [10, 80, 40, '#8f7bff'], [44, 40, 24, '#5ff2ff']]) {
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45 + Math.sin(t * 2 + dx) * 0.15;
        g.drawImage(this.scene.tintGlow(col), dx - r * 2, -h - r * 2, r * 4, r * 4);
        g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
        g.fillStyle = '#e8e0d0'; g.fillRect(dx - 5, -h, 10, h);
        g.fillStyle = col; g.beginPath(); g.ellipse(dx, -h, r, r * 0.6, 0, Math.PI, 0); g.fill();
        g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(dx - r * 0.3, -h - r * 0.3, r * 0.12, 0, 6.29); g.arc(dx + r * 0.2, -h - r * 0.4, r * 0.09, 0, 6.29); g.fill();
      }
    } else if (id === 'crystals') {
      for (const [dx, h, w, col, a] of [[-26, 90, 20, '#c08aff', -0.25], [0, 130, 26, '#7ad8ff', 0], [28, 80, 18, '#ffc04a', 0.3], [12, 60, 14, '#c08aff', 0.15]]) {
        g.save(); g.rotate(a); g.translate(dx, 0);
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 + Math.sin(t * 1.6 + dx) * 0.15;
        g.drawImage(this.scene.tintGlow(col), -w * 2.5, -h - w, w * 5, w * 5);
        g.globalAlpha = 0.95; g.globalCompositeOperation = 'source-over';
        g.fillStyle = col; g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -h * 0.8); g.lineTo(0, -h); g.lineTo(w / 2, -h * 0.8); g.lineTo(w / 2, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(-w / 2, -h * 0.8); g.lineTo(0, -h); g.lineTo(0, 0); g.lineTo(-w / 2, 0); g.closePath(); g.fill();
        g.restore(); g.globalAlpha = 1;
      }
    } else if (id === 'castle') {
      const stone = '#b8a888', dark = '#7a6a50';
      g.fillStyle = stone; g.fillRect(-70, -90, 140, 90);
      for (const tx of [-80, 50]) { g.fillRect(tx, -150, 30, 150); for (let i = 0; i < 3; i++) g.fillRect(tx + i * 11, -162, 8, 12); }
      for (let i = 0; i < 5; i++) g.fillRect(-70 + i * 30, -102, 18, 12);
      g.fillStyle = '#1a1410'; g.beginPath(); g.moveTo(-20, 0); g.lineTo(-20, -40); g.arc(0, -40, 20, Math.PI, 0); g.lineTo(20, 0); g.fill();
      g.fillStyle = dark; g.fillRect(-72, -46, 6, 6); g.fillRect(-60, -128, 10, 16); g.fillRect(60, -128, 10, 16);
      g.strokeStyle = '#5a4a3a'; g.lineWidth = 2; g.beginPath(); g.moveTo(65, -162); g.lineTo(65, -200); g.stroke();
      g.fillStyle = '#ff5a5a'; g.beginPath(); g.moveTo(65, -200); g.lineTo(65 + 26 + Math.sin(t * 3) * 4, -192); g.lineTo(65, -184); g.fill();
    } else if (id === 'chest') {
      const open = clamp(Math.sin(t * 0.7) * 3 - 2.4, 0, 1);
      g.fillStyle = '#7a4a1a'; g.fillRect(-50, -46, 100, 46);
      g.fillStyle = '#c8901a'; g.fillRect(-50, -46, 100, 6); g.fillRect(-6, -40, 12, 14);
      if (open > 0) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = open * 0.8; g.drawImage(this.scene.tintGlow('#ffd23a'), -70, -110, 140, 120); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#ffd23a'; g.beginPath(); g.ellipse(0, -46, 44, 8, 0, 0, 6.29); g.fill(); }
      g.save(); g.translate(0, -46); g.rotate(-open * 0.8);
      g.fillStyle = '#8a5a22'; g.beginPath(); g.moveTo(-50, 0); g.quadraticCurveTo(-50, -34, 0, -36); g.quadraticCurveTo(50, -34, 50, 0); g.closePath(); g.fill();
      g.strokeStyle = '#c8901a'; g.lineWidth = 5; g.stroke();
      g.restore();
    } else if (id === 'ship') {
      g.scale(1.4, 1.4); g.rotate(-0.12);
      g.fillStyle = 'rgba(70,45,25,.9)';
      g.beginPath(); g.moveTo(-130, -40); g.lineTo(120, -40); g.lineTo(90, 10); g.lineTo(-100, 10); g.closePath(); g.fill();
      g.fillStyle = 'rgba(50,30,15,.9)'; g.fillRect(-130, -48, 250, 10);
      g.fillStyle = 'rgba(60,40,20,.9)'; g.fillRect(-10, -190, 10, 150); g.fillRect(-60, -160, 110, 7);
      g.fillStyle = 'rgba(220,220,200,.35)'; g.beginPath(); g.moveTo(-55, -153); g.quadraticCurveTo(-5, -120, -50, -70); g.lineTo(-58, -78); g.closePath(); g.fill();
      g.fillStyle = 'rgba(20,10,5,.8)'; for (const px of [-80, -40, 0, 40]) { g.beginPath(); g.arc(px, -22, 7, 0, 6.29); g.fill(); }
    } else if (id === 'throne') {
      const gr = g.createLinearGradient(-50, 0, 50, 0); gr.addColorStop(0, '#a87010'); gr.addColorStop(0.5, '#ffe68a'); gr.addColorStop(1, '#a87010');
      g.fillStyle = gr;
      g.fillRect(-50, -60, 100, 60); g.fillRect(-40, -170, 80, 112);
      g.beginPath(); for (let i = 0; i < 5; i++) { g.moveTo(-40 + i * 20, -170); g.lineTo(-30 + i * 20, -196); g.lineTo(-20 + i * 20, -170); } g.fill();
      g.fillStyle = '#c0306a'; g.fillRect(-32, -150, 64, 88);
      g.fillStyle = '#5ff2ff'; g.beginPath(); g.arc(0, -184, 7, 0, 6.29); g.fill();
    } else if (id === 'statue') {
      const art = this.stoneArt('sleeper');
      g.fillStyle = '#8a8478'; g.fillRect(-70, -40, 140, 40); g.fillStyle = '#a8a294'; g.fillRect(-80, -50, 160, 12);
      g.fillStyle = '#ffd23a'; g.font = '900 14px Nunito, system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('THE SLEEPER', 0, -16);
      if (art) { const h = 170, w = (art.width / art.height) * h; g.drawImage(art, -w / 2, -50 - h, w, h); }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.25 + Math.sin(t) * 0.1;
      g.drawImage(this.scene.tintGlow('#ffd23a'), -120, -260, 240, 240);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    g.restore();
    void theme;
  }
}

export { DECOR };
