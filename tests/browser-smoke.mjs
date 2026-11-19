import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, relative);
    if (file !== root && !file.startsWith(root + sep)) throw new Error('Path outside app root');
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    response.end(body);
  } catch {
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
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const pageErrors = [];
    const failedLocalRequests = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('requestfailed', request => {
      if (request.url().startsWith(origin)) failedLocalRequests.push(request.url() + ' — ' + request.failure()?.errorText);
    });

    const response = await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200, `${viewport.name}: app document should load`);
    await page.locator('#phaseTag').waitFor({ state: 'visible' });
    await page.locator('#gameCanvas').waitFor({ state: 'visible' });
    assert.match(await page.title(), /Pondbound 0\.4/);
    assert.equal(await page.locator('#castBtn').isVisible(), true);
    assert.equal(await page.locator('#dexSearch').count(), 1);
    assert.equal(await page.getByRole('navigation', { name: 'Game sections' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'CAST LINE' }).count(), 1);
    await page.locator('#castBtn').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'reelBtn', `${viewport.name}: keyboard tab order reaches reel control`);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'castBtn', `${viewport.name}: keyboard reverse tab order returns to cast control`);
    for (const [id, label] of [['tensionMeter', 'Fishing line tension'], ['staminaMeter', 'Goop energy'], ['patienceMeter', 'Goop approach progress'], ['spookMeter', 'Goop spook level'], ['intentMeter', 'Fish maneuver timing']]) {
      const meter = page.locator(`#${id}`);
      assert.equal(await meter.getAttribute('role'), 'progressbar');
      assert.equal(await meter.getAttribute('aria-label'), label);
      assert.ok(Number.isFinite(Number(await meter.getAttribute('aria-valuenow'))));
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${viewport.name}: page must not overflow horizontally`);
    for (const selector of ['#castBtn', '#reelBtn', '#releaseBtn']) {
      const height = await page.locator(selector).evaluate(element => element.getBoundingClientRect().height);
      assert.ok(height >= 44, `${viewport.name}: ${selector} must retain a 44px minimum touch target`);
    }

    for (const [view, heading] of [['dex', 'GoopDex'], ['shop', 'Gear & Waters'], ['quests', 'Quests'], ['stats', 'Achievements'], ['fish', 'North Pond']]) {
      await page.locator(`.nav-btn[data-view="${view}"]`).click();
      if (view === 'fish') await page.locator('#locationName').getByText(heading).waitFor();
      else await page.locator(`#view-${view} .section-head h2`).getByText(heading).waitFor();
    }

    await page.locator('.nav-btn[data-view="dex"]').click();
    await page.locator('#dexSearch').fill('Gloop');
    await page.locator('#dexGrid').waitFor();
    const filteredCards = page.locator('#dexGrid .fish-card');
    assert.equal(await filteredCards.count(), 2, 'search should narrow the roster to the two Gloop name matches');
    assert.match(await filteredCards.first().innerText(), /Undiscovered/);
    await page.locator('#dexSearch').fill('');
    await page.locator('.nav-btn[data-view="fish"]').click();

    await page.locator('[data-time="night"]').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#conditionsName')?.textContent.includes('Night'));
    await page.locator('[data-weather="rain"]').evaluate(button => button.click());
    await page.waitForFunction(() => document.querySelector('#conditionsName')?.textContent === 'Night · Rain');

    await page.locator('#castBtn').click();
    await page.waitForFunction(() => document.querySelector('#phaseTag')?.textContent === 'CASTING');
    await page.waitForFunction(() => document.querySelector('#phaseTag')?.textContent === 'BITE!', { timeout: 5000 });
    await page.locator('#reelBtn').focus();
    await page.keyboard.down('Space');
    await page.waitForFunction(() => document.querySelector('#phaseTag')?.textContent === 'FIGHT', undefined, { timeout: 3000 });
    await page.keyboard.up('Space');
    assert.equal(await page.locator('#fightUi').isVisible(), true);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('goop-fishing-save-v3')));
    assert.equal(saved.version, 4);
    assert.equal(saved.timeOfDay, 'night');
    assert.equal(saved.weather, 'rain');

    await page.reload({ waitUntil: 'networkidle' });
    assert.match(await page.locator('#conditionsName').innerText(), /Night · Rain/);
    assert.equal(await page.locator('#castBtn').isEnabled(), true, 'an in-progress fight is intentionally reset to a fresh cast state on reload');
    assert.deepEqual(pageErrors, [], `${viewport.name}: uncaught browser exceptions`);
    assert.deepEqual(failedLocalRequests, [], `${viewport.name}: local app requests must succeed`);
    console.log(`PASS ${viewport.name}: startup, navigation, GoopDex search, conditions, cast → bite → fight, save/reload`);
    await context.close();
  }

  const specimen = { id: 'catch-1', fishId: 'gloop', name: 'Gloop', rarity: 'Common', weightLb: 0.83, lengthIn: 6.5, percentile: 50, sizeClass: 'Standard', day: 1 };
  const recoveredSave = { version: 4, essence: 777, day: 1, total: 1, zone: 'pond', rod: 'twig', bait: 'plain', ownedRods: ['twig'], ownedBaits: ['plain'], zoneUnlocked: { pond: true }, timeOfDay: 'night', weather: 'rain', specimens: [specimen], lastCatch: specimen, pendingCatch: { fishId: 'gloop', reward: 5, specimen } };

  const recoveryContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await recoveryContext.addInitScript(save => {
    localStorage.setItem('goop-fishing-save-v3', '{broken-primary');
    localStorage.setItem('goop-fishing-save-v3-backup', JSON.stringify(save));
  }, recoveredSave);
  const recoveryPage = await recoveryContext.newPage();
  const recoveryErrors = [];
  recoveryPage.on('pageerror', error => recoveryErrors.push(error.message));
  await recoveryPage.goto(origin, { waitUntil: 'networkidle' });
  await recoveryPage.locator('#catchActions').waitFor({ state: 'visible' });
  assert.equal(await recoveryPage.locator('#essence').innerText(), '777');
  const repaired = await recoveryPage.evaluate(() => JSON.parse(localStorage.getItem('goop-fishing-save-v3')));
  assert.equal(repaired.version, 4);
  assert.equal(repaired.essence, 777);
  assert.equal(repaired.pendingCatch.fishId, 'gloop');
  await recoveryPage.locator('#sellBtn').click();
  assert.equal(await recoveryPage.locator('#essence').innerText(), '782', 'selling a recovered catch must credit its reward exactly once');
  const sold = await recoveryPage.evaluate(() => JSON.parse(localStorage.getItem('goop-fishing-save-v3')));
  assert.equal(sold.pendingCatch, null);
  assert.equal(sold.day, 2);
  assert.deepEqual(recoveryErrors, [], 'backup recovery and selling must not throw browser exceptions');
  console.log('PASS save recovery: corrupt primary restored from backup; pending catch sold exactly once');
  await recoveryContext.close();

  const keepContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await keepContext.addInitScript(save => {
    localStorage.setItem('goop-fishing-save-v3', JSON.stringify(save));
    localStorage.setItem('goop-fishing-save-v3-backup', JSON.stringify(save));
  }, recoveredSave);
  const keepPage = await keepContext.newPage();
  await keepPage.goto(origin, { waitUntil: 'networkidle' });
  await keepPage.locator('#catchActions').waitFor({ state: 'visible' });
  await keepPage.locator('#keepBtn').click();
  assert.equal(await keepPage.locator('#essence').innerText(), '777', 'keeping a catch must not credit its estimated sale value');
  const kept = await keepPage.evaluate(() => JSON.parse(localStorage.getItem('goop-fishing-save-v3')));
  assert.equal(kept.pendingCatch, null);
  assert.equal(kept.day, 2);
  assert.equal(kept.specimens.length, 1);
  console.log('PASS catch resolution: Keep preserves specimen without awarding sale Essence');
  await keepContext.close();

  const quotaContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await quotaContext.addInitScript(() => {
    Storage.prototype.setItem = function () { throw new DOMException('storage quota exceeded', 'QuotaExceededError'); };
  });
  const quotaPage = await quotaContext.newPage();
  const quotaErrors = [];
  quotaPage.on('pageerror', error => quotaErrors.push(error.message));
  await quotaPage.goto(origin, { waitUntil: 'networkidle' });
  await quotaPage.locator('[data-time="night"]').evaluate(button => button.click());
  await quotaPage.waitForFunction(() => document.querySelector('#saveStatus')?.textContent === 'SAVE FAILED');
  assert.match(await quotaPage.locator('#conditionsName').innerText(), /Night/, 'game controls remain usable when persistence fails');
  assert.deepEqual(quotaErrors, [], 'storage quota failures must not crash the browser app');
  console.log('PASS storage failure: quota exception is reported without crashing gameplay');
  await quotaContext.close();
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
