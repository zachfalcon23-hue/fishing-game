// Deterministic, presentation-only habitat behavior for ambient wildlife.
// Inspired by Chase Da Goop's needs/action scoring, but deliberately smaller:
// these schools are visual ecosystem signals, not catchable entities or save data.
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

/**
 * Give each ambient school slow, repeatable hunger/energy cycles.
 * Deriving these from its stable traits avoids adding a second simulation clock.
 */
export function wildlifeNeeds(school, timeSeconds) {
  const t = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const phase = Number.isFinite(school?.phase) ? school.phase : 0;
  const chronotype = clamp(Number.isFinite(school?.chronotype) ? school.chronotype : 0, -1, 1);
  return {
    hunger: 0.5 + 0.5 * Math.sin(t * 0.095 + phase * 1.31),
    energy: 0.5 + 0.5 * Math.sin(t * 0.043 + phase * 0.77 + chronotype * 1.4),
  };
}

/**
 * Resolve a readable ambient behavior from local conditions.
 * Disturbance has priority; otherwise feeding, resting, and roaming compete
 * using simple bounded scores. The function is pure and deterministic.
 */
export function evaluateWildlifeBehavior({
  hunger = 0.5,
  energy = 0.7,
  activity = 0,
  frenzy = false,
  disturbance = 0,
  fidelity = 0.5,
  time = 'Day',
} = {}) {
  const h = clamp(Number.isFinite(hunger) ? hunger : 0.5, 0, 1);
  const e = clamp(Number.isFinite(energy) ? energy : 0.7, 0, 1);
  const siteActivity = clamp(Number.isFinite(activity) ? activity : 0, 0, 3) / 3;
  const foodSignal = clamp(siteActivity + (frenzy ? 0.45 : 0), 0, 1);
  const siteFidelity = clamp(Number.isFinite(fidelity) ? fidelity : 0.5, 0, 1);
  const alert = clamp(Number.isFinite(disturbance) ? disturbance : 0, 0, 1);

  const feedScore = h * (0.22 + foodSignal * 0.78) * (0.78 + siteFidelity * 0.22);
  const nightBias = time === 'Night' ? 0.95 : time === 'Dusk' ? 0.65 : time === 'Dawn' ? 0.38 : 0.22;
  const restScore = (1 - e) * nightBias;
  const roamScore = 0.24 + (1 - foodSignal) * 0.07;

  let state = 'roaming';
  if (alert > 0.08) state = 'fleeing';
  else if (feedScore >= restScore && feedScore > roamScore) state = 'feeding';
  else if (restScore > roamScore) state = 'resting';

  const feeding = state === 'feeding'
    ? clamp(0.42 + foodSignal * 0.42 + h * 0.16, 0, 1)
    : state === 'fleeing' ? 0 : foodSignal * 0.08;

  return {
    state,
    feeding,
    speed: state === 'fleeing' ? 1.65 : state === 'resting' ? 0.3 : state === 'feeding' ? 0.82 : 1,
    spacing: state === 'fleeing' ? 1.22 : state === 'feeding' ? 0.72 : 1,
    sway: state === 'fleeing' ? 1.42 : state === 'resting' ? 0.28 : state === 'feeding' ? 0.68 : 1,
  };
}
