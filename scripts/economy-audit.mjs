import {
  BAITS, GOOPS, LINES, LURES, RODS, SHINY_ODDS, SPOTS, TIMES, WEATHER,
  encounterPool, tackleMods, zoneStats,
} from '../src/game.js';

const RARITY_RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

export const ECONOMY_AUDIT_PROFILES = [
  {
    id: 'starter',
    label: 'Starter rig',
    equip: { rod: 'twig', line: 'classic', lure: 'none' },
    owned: { lures: {} },
    bait: 'worm',
    sharpHooksLevel: 0,
  },
  {
    id: 'field',
    label: 'Field spinner',
    equip: { rod: 'carbon', line: 'rainbow', lure: 'spinner' },
    owned: { lures: { spinner: 3 } },
    bait: 'sugar',
    sharpHooksLevel: 2,
  },
  {
    id: 'deep',
    label: 'Abyssal hunter',
    equip: { rod: 'abyss', line: 'gold', lure: 'diver' },
    owned: { lures: { diver: 3 } },
    bait: 'golden',
    sharpHooksLevel: 3,
  },
];

const WEATHER_TOTAL = Object.values(WEATHER).reduce((sum, item) => sum + item.weight, 0);
const round = value => Math.round(value * 100) / 100;

function expectedClampedUniform(min, max, floor = 0.6) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return null;
  if (max <= floor) return floor;
  if (min >= floor) return (min + max) / 2;
  const span = max - min;
  if (span === 0) return floor;
  return (floor * (floor - min) + (max * max - floor * floor) / 2) / span;
}

function scenarioMetrics({ spot, weather, time, profile }) {
  const zone = { spot, hot: true, mix: [[spot, 1]] };
  const stats = zoneStats(zone);
  const weatherInfo = WEATHER[weather];
  const baitInfo = BAITS[profile.bait];
  const mods = tackleMods(profile.equip, profile.owned, { weather, time });
  const pool = encounterPool({
    spot,
    weather,
    time,
    lure: profile.sharpHooksLevel,
    bait: profile.bait,
    event: {}, // Neutral baseline: no visitor, frenzy, activity, full moon or Sleeper quest gate.
    mods,
    trackedGoop: null,
  });
  const totalWeight = pool.reduce((sum, goop) => sum + Math.max(0, goop.weight), 0);
  if (!pool.length || totalWeight <= 0) return null;

  let rarePlus = 0;
  let epicPlus = 0;
  let legendary = 0;
  let expectedEssence = 0;
  let expectedBiteWait = 0;
  const species = [];

  for (const goop of pool) {
    const probability = Math.max(0, goop.weight) / totalWeight;
    const rank = RARITY_RANK[goop.rarity] ?? 0;
    if (rank >= 2) rarePlus += probability;
    if (rank >= 3) epicPlus += probability;
    if (rank >= 4) legendary += probability;

    const baseReward = goop.essence * stats.essenceMul * mods.essence;
    const shinyOdds = Math.min(1, SHINY_ODDS * (profile.bait === 'golden' ? 2 : 1) * mods.shiny);
    const ordinaryReward = Math.round(baseReward);
    const shinyReward = Math.round(baseReward * 3);
    expectedEssence += probability * (ordinaryReward * (1 - shinyOdds) + shinyReward * shinyOdds);

    const baitMatches = !!baitInfo.taste && baitInfo.taste === goop.taste;
    const biteScale = weatherInfo.biteMul
      * (1 - 0.1 * profile.sharpHooksLevel)
      * mods.bite
      * (baitMatches ? 0.75 : 1);
    const expectedWait = expectedClampedUniform(stats.biteMin * biteScale, stats.biteMax * biteScale);
    expectedBiteWait += probability * expectedWait;
    species.push(goop.id);
  }

  return {
    expectedEssence,
    rarePlus,
    epicPlus,
    legendary,
    expectedBiteWait,
    eligibleCount: pool.length,
    species,
  };
}

/**
 * Source-derived neutral-baseline economy model across each current spot,
 * time, weather and declared equipment profile.
 *
 * Weather cases are weighted by WEATHER.weight; the four time slots are even.
 * Each successful catch's expected reward includes the current shiny odds and
 * source-authored gear/spot reward modifiers, but excludes first-time records,
 * collections, quests, bounties, buddy bonuses and fight-skill bonuses.
 */
export function buildEconomyAudit() {
  const rows = [];
  for (const spot of SPOTS) {
    for (const profile of ECONOMY_AUDIT_PROFILES) {
      let validWeight = 0;
      let expectedEssence = 0;
      let rarePlus = 0;
      let epicPlus = 0;
      let legendary = 0;
      let expectedBiteWait = 0;
      let averageEligible = 0;
      let minScenarioReward = Infinity;
      let maxScenarioReward = -Infinity;
      let scenarios = 0;
      const species = new Set();

      for (const [weather, weatherInfo] of Object.entries(WEATHER)) {
        for (const time of TIMES) {
          const scenarioWeight = (weatherInfo.weight / WEATHER_TOTAL) / TIMES.length;
          const metrics = scenarioMetrics({ spot, weather, time, profile });
          if (!metrics) continue;
          validWeight += scenarioWeight;
          scenarios += 1;
          expectedEssence += metrics.expectedEssence * scenarioWeight;
          rarePlus += metrics.rarePlus * scenarioWeight;
          epicPlus += metrics.epicPlus * scenarioWeight;
          legendary += metrics.legendary * scenarioWeight;
          expectedBiteWait += metrics.expectedBiteWait * scenarioWeight;
          averageEligible += metrics.eligibleCount * scenarioWeight;
          minScenarioReward = Math.min(minScenarioReward, metrics.expectedEssence);
          maxScenarioReward = Math.max(maxScenarioReward, metrics.expectedEssence);
          for (const id of metrics.species) species.add(id);
        }
      }

      if (validWeight > 0) {
        expectedEssence /= validWeight;
        rarePlus /= validWeight;
        epicPlus /= validWeight;
        legendary /= validWeight;
        expectedBiteWait /= validWeight;
        averageEligible /= validWeight;
      }

      rows.push({
        spotId: spot.id,
        spotName: spot.name,
        secret: !!spot.secret,
        profileId: profile.id,
        profileLabel: profile.label,
        speciesCount: species.size,
        averageEligibleSpecies: round(averageEligible),
        scenarios,
        rarePlus: round(rarePlus * 100),
        epicPlus: round(epicPlus * 100),
        legendary: round(legendary * 100),
        expectedEssencePerSuccessfulCatch: round(expectedEssence),
        averageBiteWaitSeconds: round(expectedBiteWait),
        minConditionReward: Number.isFinite(minScenarioReward) ? round(minScenarioReward) : null,
        maxConditionReward: Number.isFinite(maxScenarioReward) ? round(maxScenarioReward) : null,
      });
    }
  }

  return {
    generatedFrom: {
      goops: GOOPS.length,
      spots: SPOTS.length,
      weatherStates: Object.keys(WEATHER).length,
      timesOfDay: TIMES.length,
      profiles: ECONOMY_AUDIT_PROFILES.length,
      scenariosPerSpotProfile: Object.keys(WEATHER).length * TIMES.length,
      weighting: 'WEATHER.weight × equal time-of-day frequency',
    },
    rows,
  };
}

export function renderEconomyAudit(audit = buildEconomyAudit()) {
  const lines = [
    '# Goop Fishing — Mainline Economy Audit',
    '',
    `Generated from current source definitions: **${audit.generatedFrom.goops} Goops**, **${audit.generatedFrom.spots} spots**, ${audit.generatedFrom.weatherStates} weather states, ${audit.generatedFrom.timesOfDay} times of day, and ${audit.generatedFrom.profiles} equipment profiles.`,
    '',
    '## Method',
    '',
    '- The model uses the live `GOOPS`, `SPOTS`, `WEATHER`, `TIMES`, `BAITS`, `tackleMods`, `encounterPool`, and `zoneStats` definitions from `src/game.js`.',
    '- Each spot is evaluated across every weather/time combination. Weather is weighted by its authored `WEATHER.weight`; Dawn, Day, Dusk and Night receive equal time weights.',
    '- Encounter probabilities are calculated from the actual weighted selection pool after bait taste, gear, rarity, and hard condition requirements are applied.',
    '- The reward estimate assumes a successful catch and includes the current spot multiplier, line/rod/lure Essence modifiers, and expected shiny payout. It excludes first-time record bonuses, sets, quests, bounties, buddy bonuses, catch streaks, hook-grade skill bonuses and fish escape probability.',
    '- Mean bite delay uses the authored bite window, weather bite multiplier, Sharp Hooks upgrade, equipped tackle bite modifier and the matching-bait reduction. The 0.6-second minimum is applied to the bite-wait distribution.',
    '- Neutral event conditions are used: no visitor, frenzy, feeding activity, full moon, tracked Goop or Sleeper quest unlock. Secret spots are modelled as already discovered/unlocked; their reveal and access conditions are not priced here.',
    '- These are expected values per successful catch and bite-wait estimates, **not Essence/hour, catch/hour or a progression guarantee**. Fight success, fight duration, player movement and first-time collection rewards require gameplay telemetry.',
    '',
    '## Equipment profiles',
    '',
    '| Profile | Rod | Line | Lure | Lure level | Bait | Sharp Hooks |',
    '|---|---|---|---|---:|---|---:|',
    '| Starter rig | Twig | Classic | None | 0 | Worm | 0 |',
    '| Field spinner | Carbon | Rainbow | Spinner III | 3 | Sugar Drop | 2 |',
    '| Abyssal hunter | Abyssal Reach | Gold Thread | Diver III | 3 | Golden Goo | 3 |',
    '',
    '## Spot-level neutral baseline',
    '',
    '| Spot | Profile | Species seen | Avg. eligible | Rare+ | Epic+ | Legendary | Expected Essence / successful catch | Mean bite wait |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];

  for (const row of audit.rows) {
    lines.push(
      `| ${row.spotName}${row.secret ? ' (secret)' : ''} | ${row.profileLabel} | ${row.speciesCount} | ${row.averageEligibleSpecies} | ${row.rarePlus}% | ${row.epicPlus}% | ${row.legendary}% | ${row.expectedEssencePerSuccessfulCatch} | ${row.averageBiteWaitSeconds}s |`,
    );
  }

  lines.push(
    '',
    '## Interpretation limits',
    '',
    '- A high Rare+ share is not automatically a balance defect; the player must still meet habitat/time/weather gates and win the fight.',
    '- Golden Goo changes both rare encounter weighting and shiny odds; taste bait changes both pool weights and the expected wait for matching species.',
    '- The Field Spinner and Abyssal Hunter are analytical loadouts, not purchase recommendations. Their prices, unlock requirements and real-world catch payback should be evaluated alongside player telemetry.',
    '- Re-run `npm run economy:audit` after changing species weights, spot composition, tackle modifiers, bite windows, weather weights or reward formulas.',
    '',
  );
  return lines.join('\n');
}

if (process.argv[1] && new URL(import.meta.url).pathname === new URL(`file://${process.argv[1]}`).pathname) {
  process.stdout.write(renderEconomyAudit(buildEconomyAudit()));
}
