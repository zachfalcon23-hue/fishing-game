import test from 'node:test';
import assert from 'node:assert/strict';
import { BAITS, GOOPS, LINES, LURES, RODS, SPOTS, TIMES, WEATHER } from '../src/game.js';
import { ECONOMY_AUDIT_PROFILES, buildEconomyAudit, renderEconomyAudit } from '../scripts/economy-audit.mjs';

test('economy audit profiles refer to actual current-mainline equipment and bait', () => {
  assert.equal(ECONOMY_AUDIT_PROFILES.length, 3);
  for (const profile of ECONOMY_AUDIT_PROFILES) {
    assert.ok(RODS[profile.equip.rod], profile.id + ': rod must exist');
    assert.ok(LINES[profile.equip.line], profile.id + ': line must exist');
    assert.ok(LURES[profile.equip.lure], profile.id + ': lure must exist');
    assert.ok(BAITS[profile.bait], profile.id + ': bait must exist');
    if (profile.equip.lure !== 'none') {
      assert.equal(profile.owned.lures[profile.equip.lure], 3, profile.id + ': owned lure level must be valid');
    }
  }
});

test('economy audit covers every current spot and equipment profile', () => {
  const audit = buildEconomyAudit();
  assert.equal(audit.generatedFrom.goops, GOOPS.length);
  assert.equal(audit.generatedFrom.spots, SPOTS.length);
  assert.equal(audit.generatedFrom.weatherStates, Object.keys(WEATHER).length);
  assert.equal(audit.generatedFrom.timesOfDay, TIMES.length);
  assert.equal(audit.rows.length, SPOTS.length * ECONOMY_AUDIT_PROFILES.length);

  for (const row of audit.rows) {
    assert.ok(row.scenarios > 0 && row.scenarios <= Object.keys(WEATHER).length * TIMES.length);
    assert.ok(row.speciesCount > 0, row.spotId + '/' + row.profileId + ': must encounter at least one species');
    assert.ok(row.averageEligibleSpecies > 0);
    assert.ok(Number.isFinite(row.expectedEssencePerSuccessfulCatch));
    assert.ok(row.expectedEssencePerSuccessfulCatch > 0);
    assert.ok(Number.isFinite(row.averageBiteWaitSeconds));
    assert.ok(row.averageBiteWaitSeconds >= 0.6);
    assert.ok(row.rarePlus >= row.epicPlus);
    assert.ok(row.epicPlus >= row.legendary);
    assert.ok(row.rarePlus <= 100 && row.legendary >= 0);
  }
});

test('economy audit output explains weighting and avoids unmeasured Essence-per-hour claims', () => {
  const report = renderEconomyAudit(buildEconomyAudit());
  assert.match(report, /Mainline Economy Audit/);
  assert.match(report, /weather\/time combination/);
  assert.match(report, /expected values per successful catch/);
  assert.match(report, /not Essence\/hour, catch\/hour/);
  assert.match(report, /The Sleeper quest unlock/);
});
