// Release-readiness browser checks: keyboard-only play, save persistence across
// reloads, corrupt-save handling, screen sizes, reduced motion and mute state.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('outside root');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

const SAVE_KEY = 'goop-fishing-save';
const results = [];
const check = async (name, fn) => {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
};

let browser;
try {
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });

  const open = async (context, { skipStorageClear = false } = {}) => {
    await context.addInitScript(() => {
      const key = '__goopReleaseInitialized';
      if (sessionStorage.getItem(key) !== '1') {
        try { localStorage.clear(); } catch { /* restricted context */ }
        sessionStorage.setItem(key, '1');
      }
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${origin}/?skipintro=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.querySelector('#loader')?.classList.contains('gone') === true && window.__goop?.game, undefined, { timeout: 20000 });
    return { page, errors };
  };

  // 1. Keyboard-only: focus is visible, the view nav works from the keyboard, and C casts.
  await check('keyboard-only navigation and casting', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await open(context);
    const nav = page.locator('#viewNav [data-view=shack]');
    await nav.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '#shack', undefined, { timeout: 3000 });
    const outline = await nav.evaluate(el => getComputedStyle(el).outlineStyle);
    assert.notEqual(outline, 'none', 'focused view button should show a visible focus outline');
    await page.locator('#viewNav [data-view=pond]').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => location.hash === '' || location.hash === '#pond' || !location.hash, undefined, { timeout: 3000 });
    await page.keyboard.press('c');
    await page.waitForFunction(() => window.__goop?.game.phase === 'cast', undefined, { timeout: 3000 });
    assert.deepEqual(errors, []);
    await context.close();
  });

  // 2. Save persistence: a change survives a reload.
  await check('save persists across reload', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await open(context);
    await page.evaluate(() => { const g = window.__goop.game; g.state.essence = 777; g.saveStore.save(g.state); });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__goop?.game, undefined, { timeout: 20000 });
    assert.equal(await page.evaluate(() => window.__goop.game.state.essence), 777);
    assert.deepEqual(errors, []);
    await context.close();
  });

  // 3. Corrupt primary save with no backup: the game still loads and reports no page errors.
  await check('corrupt save loads safely', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await open(context);
    await page.evaluate(key => { localStorage.setItem(key, '{not json'); localStorage.removeItem(key + '-backup'); }, SAVE_KEY);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__goop?.game, undefined, { timeout: 20000 });
    assert.equal(await page.locator('#pondView').isVisible(), true);
    assert.equal(await page.evaluate(() => window.__goop.game.state.essence), 0);
    assert.deepEqual(errors, []);
    await context.close();
  });

  // 4. Representative screen sizes: no horizontal overflow and the play canvas shows.
  for (const size of [
    { name: 'desktop 1920', width: 1920, height: 1080 },
    { name: 'laptop 1024', width: 1024, height: 768 },
    { name: 'small phone 360', width: 360, height: 640, mobile: true },
    { name: 'Android 412', width: 412, height: 915, mobile: true },
    { name: 'iPhone 390', width: 390, height: 844, mobile: true },
  ]) {
    await check(`layout at ${size.name}`, async () => {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, isMobile: !!size.mobile, hasTouch: !!size.mobile });
      const { page, errors } = await open(context);
      assert.equal(await page.locator('#gameCanvas').isVisible(), true);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(overflow <= 0, `horizontal overflow of ${overflow}px`);
      assert.deepEqual(errors, []);
      await context.close();
    });
  }

  // 5. Reduced motion: decorative drips stop animating.
  await check('reduced motion disables logo drip animation', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const { page } = await open(context);
    const anim = await page.locator('.slime-logo .drip').first().evaluate(el => getComputedStyle(el).animationName);
    assert.equal(anim, 'none');
    await context.close();
  });

  // 6. Mute toggle updates its state and persists.
  await check('mute toggle updates aria-pressed and persists', async () => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const { page, errors } = await open(context);
    const btn = page.locator('#muteBtn');
    const before = await btn.getAttribute('aria-pressed');
    await btn.click();
    assert.notEqual(await btn.getAttribute('aria-pressed'), before);
    const stored = await page.evaluate(() => localStorage.getItem('goop-fishing-muted'));
    assert.equal(stored, before === 'true' ? '0' : '1');
    assert.deepEqual(errors, []);
    await context.close();
  });
  // 7. First-catch coach: a new player sees the cast tip; Skip tips hides it and stays off after reload.
  await check('first-catch coach shows and can be skipped', async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const { page, errors } = await open(context);
    await page.waitForSelector('#coach:not([hidden])', { timeout: 5000 });
    assert.match(await page.locator('#coachText').textContent(), /CAST LINE/);
    assert.equal(await page.locator('#castBtn').evaluate(el => el.classList.contains('coach-target')), true);
    await page.locator('#coachSkip').click();
    assert.equal(await page.locator('#coach').isHidden(), true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__goop?.game, undefined, { timeout: 20000 });
    await page.waitForTimeout(500);
    assert.equal(await page.locator('#coach').isHidden(), true);
    assert.deepEqual(errors, []);
    await context.close();
  });
} finally {
  await browser?.close();
  server.close();
  for (const line of results) console.log(line);
}
