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

    for (const [view, heading] of [['dex', 'GoopDex'], ['shop', 'Gear & Waters'], ['quests', 'Quests'], ['stats', 'Achievements'], ['fish', 'North Pond']]) {
      await page.locator(`.nav-btn[data-view="${view}"]`).click();
      if (view === 'fish') await page.locator('#locationName').getByText(heading).waitFor();
      else await page.locator(`#view-${view} .section-head h2`).getByText(heading).waitFor();
    }

    await page.locator('#dexSearch').fill('Gloop');
    await page.locator('#dexGrid').waitFor();
    assert.match(await page.locator('#dexGrid').innerText(), /Gloop/);
    await page.locator('#dexSearch').fill('');

    await page.locator('[data-time="night"]').click();
    await page.locator('[data-weather="rain"]').click();
    assert.match(await page.locator('#conditionsName').innerText(), /Night · Rain/);

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
} finally {
  if (browser) await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
