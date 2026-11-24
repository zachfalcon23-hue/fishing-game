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
      // Clear storage once per tab, not on every reload (save recovery needs the backup).
      const initializedKey = '__goopBrowserSmokeInitialized';
      if (sessionStorage.getItem(initializedKey) !== '1') {
        try { localStorage.clear(); } catch { /* storage may be unavailable in a restricted context */ }
        sessionStorage.setItem(initializedKey, '1');
      }
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
    assert.equal(await page.locator('#sessionPanel').isVisible(), true);
    await page.locator('#sessionPanel summary').click();
    assert.equal(await page.locator('#sessionRounds').innerText(), '0');
    assert.equal(await page.locator('#exportSessionBtn').isDisabled(), true);

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
    await page.waitForFunction(
      () => document.querySelector('#exportSessionBtn')?.disabled === false,
      undefined,
      { timeout: 2500 },
    );
    const [sessionDownload] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#exportSessionBtn').click(),
    ]);
    assert.match(sessionDownload.suggestedFilename(), /^goop-fishing-session-.*\.json$/);
    assert.equal(await sessionDownload.failure(), null);
    await page.waitForFunction(() => window.__goop?.game.phase === 'bite', undefined, { timeout: 15000 });
    await page.locator('#reelBtn').click();
    await page.waitForFunction(() => window.__goop?.game.phase === 'fight', undefined, { timeout: 3000 });

    const hooked = await page.evaluate(() => ({
      phase: window.__goop.game.phase,
      goopId: window.__goop.game.goop?.id,
      pattern: window.__goop.game.goop?.pattern,
    }));
    assert.equal(hooked.phase, 'fight');
    assert.equal(await page.locator('#fightUi').getAttribute('aria-hidden'), 'false');
    assert.ok(typeof hooked.goopId === 'string' && hooked.goopId.length > 0);
    assert.ok(['steady', 'pulse', 'dart', 'drift', 'sleepy', 'wild'].includes(hooked.pattern));

    // Verify the new fight readout follows the actual warning and signature state.
    await page.evaluate(() => {
      const fight = window.__goop.game.fight;
      fight.warn = true;
      fight.nextLunge = 0.6;
    });
    await page.waitForFunction(() => {
      const cue = document.querySelector('#fightCue');
      return cue && !cue.hidden
        && document.querySelector('#fightCueTitle')?.textContent === 'LUNGE INCOMING'
        && document.querySelector('#fightCueAction')?.textContent === 'RELEASE REEL';
    }, undefined, { timeout: 2000 });
    await page.evaluate(() => {
      const fight = window.__goop.game.fight;
      fight.warn = false;
      fight.nextLunge = null;
      fight.move = { type: 'swerve', dir: 1, t: 0, window: 2 };
    });
    await page.waitForFunction(() =>
      document.querySelector('#fightCueTitle')?.textContent === 'SWERVE'
      && document.querySelector('#fightCueAction')?.textContent === 'STEER RIGHT',
    undefined, { timeout: 2000 });
    await page.evaluate(() => { window.__goop.game.fight.move = null; });

    // The game deliberately prevents leaving the pond with a live line/fight.
    await page.locator('#viewNav [data-view="aquarium"]').click();
    assert.equal(await page.locator('#pondView').isVisible(), true);
    assert.equal(await page.locator('#aquariumView').isVisible(), false);

    // Resolve the active hooked specimen deterministically, then verify the
    // reveal, field-research attribution, GoopDex update and persisted save.
    await page.evaluate(() => {
      const game = window.__goop.game;
      const fight = game.fight;
      fight.stage = fight.stages;
      fight.stageCap = 1;
      fight.progress = 1;
      fight.move = null;
      fight.breakT = 0;
      fight.nextMove = Infinity;
      fight.nextLunge = null;
      fight.caught = true;
      game.update(0.016, { reel: false });
    });
    await page.waitForFunction(() => {
      const game = window.__goop?.game;
      return game?.phase === 'caught'
        && game.state.dex[game.goop?.id]?.count > 0
        && Object.values(game.state.research || {}).some(record => record.catches > 0);
    }, undefined, { timeout: 3000 });
    await page.waitForFunction(() => {
      const card = document.querySelector('#catchCard');
      return card && !card.hidden
        && /FIELD RESEARCH/.test(document.querySelector('#ccProgress')?.textContent || '');
    }, undefined, { timeout: 5000 });

    const landed = await page.evaluate(() => {
      const game = window.__goop.game;
      const habitatId = game.lastCatch && game.castCtx?.researchSpot || game.state.spot;
      return {
        phase: game.phase,
        goopId: game.goop.id,
        dexCount: game.state.dex[game.goop.id]?.count || 0,
        researchSpot: habitatId,
        researchText: document.querySelector('#ccProgress')?.textContent || '',
        saved: JSON.parse(localStorage.getItem('goop-fishing-save') || 'null'),
      };
    });
    assert.equal(landed.phase, 'caught');
    assert.equal(await page.locator('#fightUi').getAttribute('aria-hidden'), 'true');
    assert.ok(landed.dexCount > 0, 'a landed Goop is added to the GoopDex');
    assert.match(landed.researchText, /FIELD RESEARCH/, 'the reveal explains the habitat research earned');
    assert.ok(landed.saved?.dex?.[landed.goopId]?.count > 0, 'the GoopDex update is persisted');
    assert.ok(landed.saved?.research?.[landed.researchSpot]?.catches > 0, 'habitat research is persisted');

    // Verify the backup recovery path in a real browser reload.
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      page.evaluate(() => {
        const backup = window.__goop.game.saveStore.fresh();
        backup.essence = 321;
        localStorage.setItem('goop-fishing-save-backup', JSON.stringify(backup));
        localStorage.setItem('goop-fishing-save', '{damaged-primary');
        location.reload();
      }),
    ]);
    await page.waitForFunction(
      () => document.querySelector('#loader')?.classList.contains('gone') === true
        && window.__goop?.game?.saveStore?.lastLoadRecovered === true,
      undefined,
      { timeout: 20000 },
    );
    const recovery = await page.evaluate(() => ({
      essence: window.__goop.game.state.essence,
      recovered: window.__goop.game.saveStore.lastLoadRecovered,
      primary: JSON.parse(localStorage.getItem('goop-fishing-save')),
      backup: JSON.parse(localStorage.getItem('goop-fishing-save-backup')),
    }));
    assert.equal(recovery.essence, 321);
    assert.equal(recovery.recovered, true);
    assert.equal(recovery.primary.essence, 321);
    assert.equal(recovery.backup.essence, 321);

    assert.deepEqual(pageErrors, [], `${viewport.name}: uncaught browser errors`);
    assert.deepEqual(failedRequests, [], `${viewport.name}: missing local assets`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors`);
    console.log(`PASS ${viewport.name}: startup, navigation, controls, cast, bite, hook, fight, catch reveal, Dex, research and save (${hooked.goopId})`);
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
