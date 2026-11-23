import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const failedRequests = [];
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Path outside app root');
    const body = await readFile(file);
    response.writeHead(200, {
      'content-type': mime[extname(file)] || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    failedRequests.push(request.url);
    response.writeHead(404);
    response.end('Not found');
  }
});

let browser;
try {
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });

  for (const viewport of [
    { name: 'desktop', width: 1440, height: 1000 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    await context.addInitScript(() => {
      try { localStorage.clear(); } catch { /* storage may be unavailable in a restricted context */ }
    });

    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    const response = await page.goto(`${origin}/?skipintro=1`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200, `${viewport.name}: app document should load`);
    await page.waitForFunction(
      () => document.querySelector('#loader')?.classList.contains('gone') === true
        && window.__goop?.game && window.__goop?.scene && window.__goop?.tank,
      undefined,
      { timeout: 20000 },
    );

    assert.match(await page.title(), /Goop Fishing/);
    assert.equal(await page.locator('#pondView').isVisible(), true);
    assert.equal(await page.locator('#gameCanvas').isVisible(), true);
    assert.equal(await page.locator('#phaseTag').innerText(), 'READY');
    assert.match(await page.locator('.dexpill strong').innerText(), /0\/86/);

    const canvasSize = await page.locator('#gameCanvas').evaluate(canvas => ({
      width: canvas.width,
      height: canvas.height,
      rectWidth: canvas.getBoundingClientRect().width,
      rectHeight: canvas.getBoundingClientRect().height,
    }));
    assert.ok(canvasSize.width > 0 && canvasSize.height > 0);
    assert.ok(canvasSize.rectWidth > 0 && canvasSize.rectHeight > 0);

    // Exercise each major view and return to the pond before fishing.
    await page.locator('#viewNav [data-view="shack"]').click();
    assert.equal(await page.locator('#shackView').isVisible(), true);
    assert.equal(await page.locator('#questBody').count(), 1);
    await page.locator('#viewNav [data-view="aquarium"]').click();
    assert.equal(await page.locator('#aquariumView').isVisible(), true);
    assert.equal(await page.locator('#tankCanvas').isVisible(), true);
    await page.locator('#viewNav [data-view="pond"]').click();
    assert.equal(await page.locator('#pondView').isVisible(), true);

    if (viewport.name === 'mobile') {
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      }));
      assert.ok(
        Math.max(dimensions.document, dimensions.body) <= dimensions.viewport + 2,
        `mobile: unexpected horizontal overflow: ${JSON.stringify(dimensions)}`,
      );
      for (const id of ['castBtn', 'reelBtn', 'leftBtn', 'rightBtn']) {
        const rect = await page.locator(`#${id}`).evaluate(el => {
          const box = el.getBoundingClientRect();
          return { width: box.width, height: box.height };
        });
        assert.ok(rect.width >= 40 && rect.height >= 40, `mobile: #${id} is too small`);
      }
    }

    // Verify the actual cast -> bite -> hook -> fight transition using player controls.
    await page.locator('#castBtn').click();
    await page.waitForFunction(() => window.__goop?.game.phase === 'cast', undefined, { timeout: 3000 });
    await page.waitForFunction(() => window.__goop?.game.phase === 'bite', undefined, { timeout: 15000 });
    await page.locator('#reelBtn').click();
    await page.waitForFunction(() => window.__goop?.game.phase === 'fight', undefined, { timeout: 3000 });

    const hooked = await page.evaluate(() => ({
      phase: window.__goop.game.phase,
      goopId: window.__goop.game.goop?.id,
      pattern: window.__goop.game.goop?.pattern,
    }));
    assert.equal(hooked.phase, 'fight');
    assert.ok(typeof hooked.goopId === 'string' && hooked.goopId.length > 0);
    assert.ok(['steady', 'pulse', 'dart', 'drift', 'sleepy', 'wild'].includes(hooked.pattern));

    // The game deliberately prevents leaving the pond with a live line/fight.
    await page.locator('#viewNav [data-view="aquarium"]').click();
    assert.equal(await page.locator('#pondView').isVisible(), true);
    assert.equal(await page.locator('#aquariumView').isVisible(), false);

    assert.deepEqual(pageErrors, [], `${viewport.name}: uncaught browser errors`);
    assert.deepEqual(failedRequests, [], `${viewport.name}: missing local assets`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors`);
    console.log(`PASS ${viewport.name}: startup, navigation, responsive controls, cast, bite, hook, fight (${hooked.goopId})`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
