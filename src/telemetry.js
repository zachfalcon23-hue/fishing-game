const TERMINAL = new Set(['caught', 'escaped']);
const ROUND = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
const ratePerHour = (value, elapsedMs) => elapsedMs > 0 ? ROUND(value * 3600000 / elapsedMs) : null;
function bucketKey(context) { return [context.zone, context.timeOfDay, context.weather, context.rod, context.bait, context.style || 'unknown'].join('|'); }

/** Anonymous in-memory playtest telemetry. No identifiers, network calls, or save data. */
export class SessionTelemetry {
  constructor({ now = () => Date.now() } = {}) {
    this.now = now; this.startedAt = null; this.active = null; this.lastPhase = 'idle';
    this.rounds = []; this.events = { casts: 0, bites: 0, hooks: 0, catches: 0, escapes: 0, sold: 0, kept: 0, essenceEarned: 0 };
  }
  observe(game) {
    const phase = game?.phase || 'idle', now = this.now();
    if (phase === 'cast' && this.lastPhase !== 'cast') {
      if (this.startedAt === null) this.startedAt = now;
      this.active = { startedAt: now, biteAt: null, hookedAt: null, context: {
        zone: game.zone?.()?.id || game.state?.zone || 'unknown', timeOfDay: game.state?.timeOfDay || 'unknown',
        weather: game.state?.weather || 'unknown', rod: game.state?.rod || 'unknown', bait: game.state?.bait || 'unknown', style: 'unknown'
      }};
      this.events.casts++;
    }
    if (this.active && phase === 'bite' && this.active.biteAt === null) { this.active.biteAt = now; this.events.bites++; }
    if (this.active && phase === 'fight' && this.active.hookedAt === null) {
      this.active.hookedAt = now; this.active.context.style = game.fight?.style || 'unknown'; this.events.hooks++;
    }
    if (this.active && TERMINAL.has(phase) && this.lastPhase !== phase) {
      const caught = phase === 'caught';
      this.rounds.push({ ...this.active.context, outcome: phase, decision: null,
        castToBiteMs: this.active.biteAt === null ? null : Math.max(0, this.active.biteAt - this.active.startedAt),
        biteToHookMs: this.active.biteAt === null || this.active.hookedAt === null ? null : Math.max(0, this.active.hookedAt - this.active.biteAt),
        castToHookMs: this.active.hookedAt === null ? null : Math.max(0, this.active.hookedAt - this.active.startedAt),
        fightMs: this.active.hookedAt === null ? null : Math.max(0, now - this.active.hookedAt),
        totalMs: Math.max(0, now - this.active.startedAt), rarity: game.fish?.rarity || null, fishId: game.fish?.id || null,
        catchValue: caught && Number.isFinite(game.reward) ? game.reward : 0, saleEssence: 0
      });
      if (this.rounds.length > 500) this.rounds.shift();
      this.events[caught ? 'catches' : 'escapes']++; this.active = null;
    }
    this.lastPhase = phase;
  }
  resolveCatch(decision, amount = 0) {
    if (!['sold', 'kept'].includes(decision)) return false;
    const round = [...this.rounds].reverse().find(item => item.outcome === 'caught' && item.decision === null);
    if (!round) return false;
    round.decision = decision;
    if (decision === 'sold') {
      const earned = Number.isFinite(amount) ? Math.max(0, amount) : 0;
      round.saleEssence = earned; this.events.sold++; this.events.essenceEarned += earned;
    } else this.events.kept++;
    return true;
  }
  summary() {
    const rounds = this.rounds, elapsedMs = this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt);
    const average = key => { const values = rounds.map(r => r[key]).filter(Number.isFinite); return values.length ? ROUND(values.reduce((a,b)=>a+b,0)/values.length) : null; };
    const groups = {};
    for (const round of rounds) {
      const key = bucketKey(round), group = groups[key] ||= { zone:round.zone,timeOfDay:round.timeOfDay,weather:round.weather,rod:round.rod,bait:round.bait,style:round.style,rounds:0,catches:0,escapes:0,sold:0,essenceEarned:0,fightMs:0,fightSamples:0 };
      group.rounds++; if (round.outcome === 'caught') group.catches++; else group.escapes++;
      if (round.decision === 'sold') { group.sold++; group.essenceEarned += round.saleEssence; }
      if (Number.isFinite(round.fightMs)) { group.fightMs += round.fightMs; group.fightSamples++; }
    }
    const completedRounds = this.events.catches + this.events.escapes;
    return { elapsedMs, events:{...this.events}, completedRounds, retainedRounds:rounds.length,
      catchRate:completedRounds?ROUND(this.events.catches/completedRounds):null,
      averageCastToBiteMs:average('castToBiteMs'),averageBiteToHookMs:average('biteToHookMs'),averageFightMs:average('fightMs'),averageRoundMs:average('totalMs'),
      averageCatchValue:rounds.length?ROUND(rounds.reduce((sum,r)=>sum+r.catchValue,0)/rounds.length):null,
      essenceEarned:this.events.essenceEarned,essencePerHour:ratePerHour(this.events.essenceEarned,elapsedMs),
      catchesPerHour:ratePerHour(this.events.catches,elapsedMs),roundsPerHour:ratePerHour(completedRounds,elapsedMs),
      byContext:Object.values(groups).map(g=>({zone:g.zone,timeOfDay:g.timeOfDay,weather:g.weather,rod:g.rod,bait:g.bait,style:g.style,rounds:g.rounds,catches:g.catches,escapes:g.escapes,sold:g.sold,catchRate:ROUND(g.catches/g.rounds),essenceEarned:ROUND(g.essenceEarned),averageFightMs:g.fightSamples?ROUND(g.fightMs/g.fightSamples):null}))
    };
  }
  exportJSON() { return JSON.stringify({schemaVersion:1,exportedAt:new Date(this.now()).toISOString(),summary:this.summary(),rounds:this.rounds},null,2); }
  reset() { this.startedAt=null;this.active=null;this.lastPhase='idle';this.rounds=[];this.events={casts:0,bites:0,hooks:0,catches:0,escapes:0,sold:0,kept:0,essenceEarned:0}; }
}


/** Download JSON without revoking its object URL before the browser consumes it. */
export function downloadJSONFile(payload, filename, { documentRef = globalThis.document, urlApi = globalThis.URL, schedule = globalThis.setTimeout, BlobCtor = globalThis.Blob } = {}) {
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
