const TERMINAL = new Set(['caught', 'escaped']);
const ROUND = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;

function bucketKey(context) {
  return [context.zone, context.timeOfDay, context.weather, context.rod, context.bait, context.style || 'unknown'].join('|');
}

/**
 * Anonymous, in-memory session telemetry. No identifiers, network calls, or save data.
 * A round begins on CAST and closes exactly once on CAUGHT or ESCAPED.
 */
export class SessionTelemetry {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now;
    this.active = null;
    this.lastPhase = 'idle';
    this.rounds = [];
    this.events = { casts: 0, bites: 0, hooks: 0, catches: 0, escapes: 0 };
  }

  observe(game) {
    const phase = game?.phase || 'idle';
    const now = this.now();
    if (phase === 'cast' && this.lastPhase !== 'cast') {
      this.active = {
        startedAt: now,
        biteAt: null,
        hookedAt: null,
        context: {
          zone: game.zone?.()?.id || game.state?.zone || 'unknown',
          timeOfDay: game.state?.timeOfDay || 'unknown',
          weather: game.state?.weather || 'unknown',
          rod: game.state?.rod || 'unknown',
          bait: game.state?.bait || 'unknown',
          style: 'unknown',
        },
      };
      this.events.casts++;
    }
    if (this.active && phase === 'bite' && this.active.biteAt === null) {
      this.active.biteAt = now;
      this.events.bites++;
    }
    if (this.active && phase === 'fight' && this.active.hookedAt === null) {
      this.active.hookedAt = now;
      this.active.context.style = game.fight?.style || 'unknown';
      this.events.hooks++;
    }
    if (this.active && TERMINAL.has(phase) && this.lastPhase !== phase) {
      const caught = phase === 'caught';
      const finishedAt = now;
      const round = {
        ...this.active.context,
        outcome: phase,
        castToBiteMs: this.active.biteAt === null ? null : Math.max(0, this.active.biteAt - this.active.startedAt),
        biteToHookMs: this.active.biteAt === null || this.active.hookedAt === null ? null : Math.max(0, this.active.hookedAt - this.active.biteAt),
        castToHookMs: this.active.hookedAt === null ? null : Math.max(0, this.active.hookedAt - this.active.startedAt),
        fightMs: this.active.hookedAt === null ? null : Math.max(0, finishedAt - this.active.hookedAt),
        totalMs: Math.max(0, finishedAt - this.active.startedAt),
        rarity: game.fish?.rarity || null,
        fishId: game.fish?.id || null,
        reward: caught && Number.isFinite(game.reward) ? game.reward : 0,
      };
      this.rounds.push(round);
      if (this.rounds.length > 500) this.rounds.shift();
      this.events[caught ? 'catches' : 'escapes']++;
      this.active = null;
    }
    this.lastPhase = phase;
  }

  summary() {
    const rounds = this.rounds;
    const average = key => {
      const values = rounds.map(r => r[key]).filter(Number.isFinite);
      return values.length ? ROUND(values.reduce((a, b) => a + b, 0) / values.length) : null;
    };
    const groups = {};
    for (const round of rounds) {
      const key = bucketKey(round);
      const group = groups[key] ||= { ...round, rounds: 0, catches: 0, escapes: 0, essence: 0, fightMs: 0, fightSamples: 0 };
      group.rounds++;
      if (round.outcome === 'caught') { group.catches++; group.essence += round.reward; }
      else group.escapes++;
      if (Number.isFinite(round.fightMs)) { group.fightMs += round.fightMs; group.fightSamples++; }
    }
    return {
      events: { ...this.events },
      completedRounds: rounds.length,
      catchRate: rounds.length ? ROUND(rounds.filter(r => r.outcome === 'caught').length / rounds.length) : null,
      averageCastToBiteMs: average('castToBiteMs'),
      averageBiteToHookMs: average('biteToHookMs'),
      averageFightMs: average('fightMs'),
      averageRoundMs: average('totalMs'),
      essencePerCompletedRound: rounds.length ? ROUND(rounds.reduce((sum, r) => sum + r.reward, 0) / rounds.length) : null,
      byContext: Object.values(groups).map(g => ({
        zone: g.zone, timeOfDay: g.timeOfDay, weather: g.weather, rod: g.rod, bait: g.bait, style: g.style,
        rounds: g.rounds, catches: g.catches, escapes: g.escapes,
        catchRate: ROUND(g.catches / g.rounds),
        essence: ROUND(g.essence),
        averageFightMs: g.fightSamples ? ROUND(g.fightMs / g.fightSamples) : null,
      })),
    };
  }

  exportJSON() {
    return JSON.stringify({ schemaVersion: 1, exportedAt: new Date(this.now()).toISOString(), summary: this.summary(), rounds: this.rounds }, null, 2);
  }

  reset() {
    this.active = null;
    this.lastPhase = 'idle';
    this.rounds = [];
    this.events = { casts: 0, bites: 0, hooks: 0, catches: 0, escapes: 0 };
  }
}
