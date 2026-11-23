const TERMINAL_PHASES = new Set(['caught', 'escaped']);
const RETAINED_ROUNDS = 500;
const round = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const ratePerHour = (value, elapsedMs) => elapsedMs > 0 ? round(value * 3_600_000 / elapsedMs) : null;

function contextFor(game) {
  const state = game.state || {};
  const equip = state.equip || {};
  const cast = game.castCtx || {};
  return {
    spot: cast.spot || state.spot || 'unknown',
    timeOfDay: cast.time || game.timeOfDay || 'unknown',
    weather: cast.weather || state.weather || 'unknown',
    rod: equip.rod || 'unknown',
    line: equip.line || 'unknown',
    lure: equip.lure || 'none',
    bait: cast.bait || state.bait || 'unknown',
  };
}

function contextKey(item) {
  return JSON.stringify([
    item.spot, item.timeOfDay, item.weather, item.rod,
    item.line, item.lure, item.bait, item.pattern,
  ]);
}

/**
 * Anonymous, in-memory playtest measurements for the live Goop Fishing engine.
 * No player identifiers, network requests, save writes, or changes to game RNG.
 */
export class SessionTelemetry {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.startedAt = null;
    this.active = null;
    this.lastPhase = 'idle';
    this.rounds = [];
    this.events = this.freshEvents();
  }

  freshEvents() {
    return {
      casts: 0,
      bites: 0,
      hooks: 0,
      catches: 0,
      escapes: 0,
      misses: 0,
      abandoned: 0,
      catchReward: 0,
    };
  }

  observe(game) {
    if (!game || typeof game !== 'object') return;
    const phase = typeof game.phase === 'string' ? game.phase : 'idle';
    const now = this.now();

    // The real game can move straight from a resolved catch to the next cast.
    // Finalize the prior round before opening a new one in that case.
    if (phase === 'cast' && this.lastPhase !== 'cast') {
      if (this.active) {
        this.events.abandoned += 1;
        this.active = null;
      }
      if (this.startedAt === null) this.startedAt = now;
      this.active = {
        startedAt: now,
        biteAt: null,
        hookedAt: null,
        context: contextFor(game),
      };
      this.events.casts += 1;
    }

    if (this.active && phase === 'bite' && this.active.biteAt === null) {
      this.active.biteAt = now;
      this.events.bites += 1;
    }

    if (this.active && phase === 'fight' && this.active.hookedAt === null) {
      this.active.hookedAt = now;
      this.active.context.pattern = game.goop?.pattern || 'unknown';
      this.active.context.goopId = game.goop?.id || 'unknown';
      this.active.context.rarity = game.goop?.rarity || 'unknown';
      this.events.hooks += 1;
    }

    if (this.active && TERMINAL_PHASES.has(phase) && phase !== this.lastPhase) {
      const caught = phase === 'caught';
      const missed = phase === 'escaped' && this.active.hookedAt === null;
      const fish = game.goop || {};
      const lastCatch = caught && game.lastCatch && typeof game.lastCatch === 'object'
        ? game.lastCatch : {};
      const reward = caught && Number.isFinite(lastCatch.reward)
        ? Math.max(0, lastCatch.reward)
        : caught && Number.isFinite(game.lastReward)
          ? Math.max(0, game.lastReward) : 0;
      const completedAt = now;

      const record = {
        ...this.active.context,
        goopId: lastCatch.goop || this.active.context.goopId || fish.id || 'unknown',
        rarity: fish.rarity || this.active.context.rarity || 'unknown',
        pattern: fish.pattern || this.active.context.pattern || 'unknown',
        outcome: caught ? 'caught' : missed ? 'missed' : 'escaped',
        castToBiteMs: this.active.biteAt === null
          ? null : Math.max(0, this.active.biteAt - this.active.startedAt),
        biteToHookMs: this.active.biteAt === null || this.active.hookedAt === null
          ? null : Math.max(0, this.active.hookedAt - this.active.biteAt),
        castToHookMs: this.active.hookedAt === null
          ? null : Math.max(0, this.active.hookedAt - this.active.startedAt),
        fightMs: this.active.hookedAt === null
          ? null : Math.max(0, completedAt - this.active.hookedAt),
        totalMs: Math.max(0, completedAt - this.active.startedAt),
        catchReward: reward,
        catchSize: caught && Number.isFinite(lastCatch.size) ? lastCatch.size : null,
        shiny: caught && lastCatch.shiny === true,
        hookGrade: caught ? lastCatch.hookGrade || 'unknown' : null,
      };

      this.rounds.push(record);
      if (this.rounds.length > RETAINED_ROUNDS) this.rounds.shift();

      if (caught) {
        this.events.catches += 1;
        this.events.catchReward += reward;
      } else if (missed) {
        this.events.misses += 1;
      } else {
        this.events.escapes += 1;
      }
      this.active = null;
    }

    this.lastPhase = phase;
  }

  summary() {
    const elapsedMs = this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt);
    const completedRounds = this.events.catches + this.events.escapes + this.events.misses;
    const average = (key, filter = () => true) => {
      const values = this.rounds.filter(filter).map(item => item[key]).filter(Number.isFinite);
      return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };

    const groups = new Map();
    for (const item of this.rounds) {
      const key = contextKey(item);
      let group = groups.get(key);
      if (!group) {
        group = {
          spot: item.spot,
          timeOfDay: item.timeOfDay,
          weather: item.weather,
          rod: item.rod,
          line: item.line,
          lure: item.lure,
          bait: item.bait,
          pattern: item.pattern,
          rounds: 0,
          catches: 0,
          escapes: 0,
          misses: 0,
          catchReward: 0,
          fightMs: 0,
          fightSamples: 0,
        };
        groups.set(key, group);
      }
      group.rounds += 1;
      if (item.outcome === 'caught') {
        group.catches += 1;
        group.catchReward += item.catchReward;
      } else if (item.outcome === 'missed') {
        group.misses += 1;
      } else {
        group.escapes += 1;
      }
      if (Number.isFinite(item.fightMs)) {
        group.fightMs += item.fightMs;
        group.fightSamples += 1;
      }
    }

    const byContext = [...groups.values()].map(group => ({
      spot: group.spot,
      timeOfDay: group.timeOfDay,
      weather: group.weather,
      rod: group.rod,
      line: group.line,
      lure: group.lure,
      bait: group.bait,
      pattern: group.pattern,
      rounds: group.rounds,
      catches: group.catches,
      escapes: group.escapes,
      misses: group.misses,
      catchRate: round(group.catches / group.rounds),
      averageCatchReward: group.catches ? round(group.catchReward / group.catches) : null,
      averageFightMs: group.fightSamples ? round(group.fightMs / group.fightSamples) : null,
    }));

    return {
      elapsedMs,
      events: { ...this.events },
      completedRounds,
      retainedRounds: this.rounds.length,
      catchRate: completedRounds ? round(this.events.catches / completedRounds) : null,
      averageCastToBiteMs: average('castToBiteMs'),
      averageBiteToHookMs: average('biteToHookMs'),
      averageFightMs: average('fightMs'),
      averageRoundMs: average('totalMs'),
      averageCatchReward: average('catchReward', item => item.outcome === 'caught'),
      catchReward: round(this.events.catchReward),
      catchesPerHour: ratePerHour(this.events.catches, elapsedMs),
      roundsPerHour: ratePerHour(completedRounds, elapsedMs),
      catchRewardPerHour: ratePerHour(this.events.catchReward, elapsedMs),
      byContext,
    };
  }

  exportJSON() {
    return JSON.stringify({
      schemaVersion: 1,
      exportedAt: new Date(this.now()).toISOString(),
      summary: this.summary(),
      rounds: this.rounds,
    }, null, 2);
  }

  reset(currentPhase = 'idle') {
    this.startedAt = null;
    this.active = null;
    this.lastPhase = typeof currentPhase === 'string' ? currentPhase : 'idle';
    this.rounds = [];
    this.events = this.freshEvents();
  }
}

/** Download a JSON file; defer URL revocation until after the browser starts the download. */
export function downloadJSONFile(payload, filename, {
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  schedule = globalThis.setTimeout,
  BlobCtor = globalThis.Blob,
} = {}) {
  if (!documentRef?.body || !urlApi?.createObjectURL || !urlApi?.revokeObjectURL
    || typeof schedule !== 'function' || typeof BlobCtor !== 'function') {
    throw new Error('This browser does not support session export.');
  }

  const blob = new BlobCtor([payload], { type: 'application/json' });
  const url = urlApi.createObjectURL(blob);
  const anchor = documentRef.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  try {
    documentRef.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    schedule(() => urlApi.revokeObjectURL(url), 1000);
  }
}
