// Goop Fishing — game rules and state. No DOM access in this file so it can be unit tested in Node.

export const PHASES = Object.freeze({
  IDLE: 'idle', CAST: 'cast', BITE: 'bite', FIGHT: 'fight', CAUGHT: 'caught', ESCAPED: 'escaped',
});

export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];
const BY_RARITY = {
  Common: { weight: 40, essence: 9, stamina: 1, force: 1, size: [8, 24] },
  Uncommon: { weight: 16, essence: 15, stamina: 1.05, force: 1.03, size: [14, 34] },
  Rare: { weight: 6, essence: 26, stamina: 1, force: 1.08, size: [22, 50] },
  Epic: { weight: 2, essence: 44, stamina: 1.2, force: 1.14, size: [34, 72] },
  Legendary: { weight: 0.9, essence: 110, stamina: 1.35, force: 1.22, size: [60, 130] },
};
const PATTERN_HINT = {
  steady: 'A steady tug. Keep your rhythm.',
  pulse: 'Short pulses, then a pause.',
  dart: 'Quick surges. Ease off between them.',
  drift: 'Slow drifting tension. Stay centered.',
  sleepy: 'Gentle movement with sudden wake-ups.',
  wild: 'Unpredictable bursts. Watch the tells.',
};

/**
 * Species. `spots` are the pond spots it lives in. `likes` multiplies its odds in matching
 * conditions; `needs` are hard requirements (it never bites otherwise).
 */
// What each Goop likes to eat. Matching bait makes it bite far more often.
export const TASTES = {
  sweet: 'Sweet', muck: 'Muck', ember: 'Ember', frost: 'Frost', glow: 'Glow',
};
const TASTE_BY_SPOT = { dock: 'muck', lily: 'sweet', reeds: 'muck', boulder: 'ember', falls: 'frost', cave: 'frost', grotto: 'glow', deep: 'ember', sandbar: 'sweet', wreck: 'muck' };
const TASTE_WORDS = [
  ['ember', /magma|lava|ember|nugget|melt/], ['frost', /crystal|glacier|shard|cloud|frost|gem|echo|mist/],
  ['sweet', /jelly|koi|gum|blush|coral|plum|drip|bubble|tide|veil|puddl|prism|aurora/],
  ['glow', /void|lumen|glow|star|phantom|ecto|bone|night|abyss|luna|lantern|drowsy|hollow|ghost/],
  ['muck', /toxi|mud|mire|bog|swamp|sludge|waste|oil|venom|murk|rust|barnacle|sploot|moss|drowned/],
];
function tasteOf(id, spots) {
  for (const [taste, re] of TASTE_WORDS) if (re.test(id)) return taste;
  return TASTE_BY_SPOT[spots[0]] || 'muck';
}

function sp(id, name, rarity, spots, color, pattern, o = {}) {
  const r = BY_RARITY[rarity];
  return {
    id, name, rarity, spots, color, pattern, taste: o.taste ?? tasteOf(id, spots),
    weight: o.weight ?? r.weight,
    stamina: o.stamina ?? r.stamina,
    force: o.force ?? r.force,
    essence: o.essence ?? r.essence,
    size: o.size ?? r.size,
    hint: o.hint ?? PATTERN_HINT[pattern],
    ...(o.likes ? { likes: o.likes } : {}),
    ...(o.needs ? { needs: o.needs } : {}),
  };
}

export const GOOPS = [
  // the original ten (ids and stats kept so old saves carry over)
  sp('gloop', 'Gloop', 'Common', ['dock', 'lily'], '#73f27c', 'steady', { weight: 42, stamina: 1, essence: 8, force: 1 }),
  sp('murkling', 'Murkling', 'Common', ['dock', 'reeds'], '#69b7e8', 'pulse', { weight: 28, stamina: 1.2, essence: 10 }),
  sp('sploot', 'Sploot', 'Common', ['reeds', 'boulder'], '#c8e86b', 'pulse', { weight: 26, stamina: 0.95, essence: 9, hint: 'Splashy and impatient. Ease off on each pulse.' }),
  sp('flicker', 'Flicker', 'Uncommon', ['dock', 'lily'], '#f3d96b', 'dart', { stamina: 0.85, essence: 14, likes: { time: ['Day'] } }),
  sp('puddlit', 'Puddlit', 'Uncommon', ['lily', 'reeds'], '#e9a2ff', 'drift', { stamina: 1.1, essence: 16, likes: { weather: ['rain'] } }),
  sp('drowsy', 'Drowsy', 'Rare', ['dock', 'grotto'], '#ff9f91', 'sleepy', { stamina: 0.9, essence: 22, likes: { time: ['Night', 'Dawn'] } }),
  sp('mistfin', 'Mistfin', 'Rare', ['reeds', 'falls'], '#b9d6e8', 'drift', { essence: 26, likes: { weather: ['fog'] }, hint: 'It hides in the fog and tugs in long waves.' }),
  sp('lumen', 'Lumen', 'Rare', ['grotto', 'deep'], '#7ff0ff', 'dart', { stamina: 0.9, essence: 28, likes: { time: ['Night'] }, hint: 'Glows when it surges. Watch the flashes.' }),
  sp('voidling', 'Voidling', 'Epic', ['grotto', 'deep'], '#a39aff', 'wild', { stamina: 1.65, essence: 35 }),
  sp('stormling', 'Stormling', 'Epic', ['falls', 'deep'], '#ffe46b', 'wild', { stamina: 1.5, essence: 45, likes: { weather: ['storm'] }, hint: 'Crackling with energy. It loves a good storm.' }),

  // The Old Dock
  sp('bubblegum', 'Bubblegum', 'Common', ['dock', 'lily'], '#ff9a3c', 'pulse'),
  sp('dripfin', 'Dripfin', 'Common', ['dock'], '#b050ff', 'pulse'),
  sp('mudmouth', 'Mudmouth', 'Common', ['dock', 'reeds'], '#b08a50', 'steady'),
  sp('slimeperch', 'Slimeperch', 'Uncommon', ['dock'], '#c060ff', 'steady'),
  sp('lanternfin', 'Lanternfin', 'Uncommon', ['dock', 'deep'], '#3d6cff', 'dart', { likes: { time: ['Night'] } }),
  sp('kinggloop', 'King Gloop', 'Legendary', ['dock'], '#ffd23a', 'wild', { needs: { time: ['Dawn'] }, hint: 'The king of the pond. It answers to no one.' }),

  // Lily Cove
  sp('blushkoi', 'Blushkoi', 'Common', ['lily'], '#ff9ad8', 'drift'),
  sp('gumdrop', 'Gumdrop', 'Common', ['lily'], '#ff7ac8', 'drift'),
  sp('driptail', 'Driptail', 'Common', ['lily'], '#d060ff', 'drift'),
  sp('jellygill', 'Jellygill', 'Common', ['lily', 'grotto'], '#ff60c8', 'drift'),
  sp('veilfin', 'Veilfin', 'Uncommon', ['lily'], '#c070ff', 'drift'),
  sp('jellykoi', 'Jellykoi', 'Uncommon', ['lily'], '#d070ff', 'drift', { likes: { time: ['Dawn'] } }),
  sp('jellytrout', 'Jellytrout', 'Uncommon', ['lily'], '#e0a0ff', 'drift'),
  sp('goldkoi', 'Goldgoop Koi', 'Rare', ['lily'], '#ffc83a', 'steady', { likes: { time: ['Day'] } }),
  sp('jellytail', 'Jellytail', 'Rare', ['lily'], '#ff70d0', 'drift', { likes: { time: ['Dusk'] } }),
  sp('coralgoop', 'Coralgoop', 'Rare', ['lily'], '#ff6aa8', 'pulse'),
  sp('prismgill', 'Prismgill', 'Epic', ['lily'], '#ff9aff', 'dart', { likes: { weather: ['rain'] } }),
  sp('stardrift', 'Stardrift', 'Epic', ['lily', 'deep'], '#c88aff', 'drift', { needs: { time: ['Night'], weather: ['clear'] }, hint: 'Swims only under a clear night sky.' }),

  // Cattail Reeds
  sp('bogbelly', 'Bogbelly', 'Common', ['reeds'], '#6a9a3a', 'steady'),
  sp('mireback', 'Mireback', 'Common', ['reeds'], '#8a9a3a', 'steady'),
  sp('mirecarp', 'Mirecarp', 'Uncommon', ['reeds'], '#8a7a3a', 'steady'),
  sp('swampgill', 'Swampgill', 'Uncommon', ['reeds'], '#7aa83a', 'steady', { likes: { weather: ['fog'] } }),
  sp('mosskarp', 'Mosskarp', 'Uncommon', ['reeds'], '#7ac83a', 'steady'),
  sp('toxitail', 'Toxitail', 'Uncommon', ['reeds'], '#e8e040', 'pulse'),
  sp('plumfin', 'Plumfin', 'Uncommon', ['reeds', 'grotto'], '#b060e0', 'steady', { likes: { time: ['Dusk'] } }),
  sp('venomfin', 'Venomfin', 'Rare', ['reeds'], '#8ae030', 'dart'),
  sp('toxibass', 'Toxibass', 'Rare', ['reeds', 'boulder'], '#b8f02a', 'pulse', { likes: { weather: ['rain'] } }),

  // Slime Boulders
  sp('sludgejaw', 'Sludgejaw', 'Uncommon', ['boulder'], '#e0402a', 'pulse'),
  sp('meltjaw', 'Meltjaw', 'Uncommon', ['boulder'], '#ff4a3a', 'dart'),
  sp('magmamin', 'Magmamin', 'Uncommon', ['boulder'], '#ff8a2a', 'pulse'),
  sp('magmatail', 'Magmatail', 'Uncommon', ['boulder', 'deep'], '#ff6a2a', 'pulse'),
  sp('geodeback', 'Geodeback', 'Rare', ['boulder'], '#5ac8ff', 'steady'),
  sp('nuggetfin', 'Nuggetfin', 'Rare', ['boulder'], '#ffcc33', 'steady', { likes: { time: ['Day'] } }),
  sp('oilspill', 'Oilspill', 'Rare', ['boulder', 'deep'], '#a040ff', 'dart', { likes: { weather: ['storm'] } }),
  sp('lavagill', 'Lavagill', 'Rare', ['boulder', 'deep'], '#ff6a1a', 'pulse'),
  sp('wastebloater', 'Wastebloater', 'Epic', ['boulder', 'reeds'], '#a8e030', 'pulse', { likes: { weather: ['storm'] } }),

  // Waterfall Inlet
  sp('glidegloop', 'Glidegloop', 'Uncommon', ['falls', 'lily'], '#4aa8ff', 'drift'),
  sp('crystalgill', 'Crystalgill', 'Uncommon', ['falls'], '#7aa8ff', 'steady'),
  sp('glacierfin', 'Glacierfin', 'Uncommon', ['falls'], '#5aa8ff', 'steady', { likes: { weather: ['fog'] } }),
  sp('cloudgill', 'Cloudgill', 'Uncommon', ['falls'], '#c8b0ff', 'drift', { likes: { weather: ['fog'] } }),
  sp('crystalfin', 'Crystalfin', 'Rare', ['falls'], '#7ad8ff', 'steady'),
  sp('shardfin', 'Shardfin', 'Rare', ['falls'], '#8ab8ff', 'steady'),
  sp('sparkfin', 'Sparkfin', 'Rare', ['falls'], '#3a8aff', 'dart', { likes: { weather: ['storm'] } }),
  sp('voltfin', 'Voltfin', 'Rare', ['falls'], '#3ab8ff', 'dart', { likes: { weather: ['storm', 'rain'] } }),
  sp('prismfin', 'Prismfin', 'Epic', ['falls'], '#a0f0ff', 'dart', { likes: { time: ['Day'] } }),
  sp('stormray', 'Stormray', 'Epic', ['falls'], '#4a8aff', 'drift', { needs: { weather: ['storm'] }, hint: 'Rides the lightning. Only seen in storms.' }),
  sp('prismadrake', 'Prismadrake', 'Legendary', ['falls'], '#ff9ae0', 'wild', { needs: { weather: ['rain'], time: ['Day', 'Dawn'] }, hint: 'A living rainbow. It wakes when sunlight meets rain.' }),
  sp('aurorafin', 'Aurorafin', 'Legendary', ['falls'], '#ffd84a', 'wild', { needs: { time: ['Dusk'], weather: ['clear'] }, hint: 'Shimmers like the evening sky.' }),

  // Glowshroom Grotto
  sp('jellyglow', 'Jellyglow', 'Uncommon', ['grotto'], '#e070ff', 'drift', { likes: { time: ['Night'] } }),
  sp('bonepool', 'Bonepool', 'Rare', ['grotto'], '#c08aff', 'sleepy', { likes: { time: ['Night'] } }),
  sp('ectofish', 'Ectofish', 'Rare', ['grotto'], '#6aff9a', 'sleepy', { likes: { time: ['Night', 'Dusk'] } }),
  sp('starslime', 'Starslime', 'Epic', ['grotto', 'deep'], '#8a6aff', 'drift', { needs: { time: ['Night', 'Dusk'] } }),
  sp('phantomfin', 'Phantomfin', 'Epic', ['grotto'], '#9ff0ff', 'sleepy', { needs: { time: ['Night'] }, hint: 'A ghost of the grotto. Never seen by daylight.' }),
  sp('voidripper', 'Voidripper', 'Epic', ['grotto'], '#a03aff', 'wild', { likes: { weather: ['storm'] } }),
  sp('nightmire', 'Nightmire', 'Legendary', ['grotto'], '#8a2aff', 'wild', { needs: { time: ['Night'], weather: ['fog'] }, hint: 'Born of fog and darkness.' }),

  // The Deep Drop
  sp('goopshark', 'Goopshark', 'Rare', ['deep'], '#8a50c8', 'dart'),
  sp('lavaflow', 'Lavaflow', 'Rare', ['deep'], '#ff7a1a', 'pulse'),
  sp('magmafin', 'Magmafin', 'Epic', ['deep'], '#ff5a1a', 'pulse'),
  sp('embergill', 'Embergill', 'Epic', ['deep'], '#ff3a1a', 'pulse', { likes: { time: ['Dusk'] } }),
  sp('voidfin', 'Voidfin', 'Epic', ['deep'], '#7a3aff', 'wild', { needs: { time: ['Night'] } }),
  sp('abyssmelt', 'Abyssmelt', 'Legendary', ['deep'], '#6a4aff', 'wild', { needs: { time: ['Night'] }, hint: 'Its jaws open only in the dead of night.' }),
  sp('abyssgloop', 'Abyssgloop', 'Legendary', ['deep'], '#c03aff', 'wild', { needs: { weather: ['storm'] }, hint: 'Storms stir it up from the bottom.' }),

  // Moonlit Sandbar (secret: the tide runs out after dark)
  sp('moongloop', 'Moon Gloop', 'Common', ['sandbar'], '#a8c8ff', 'steady', { hint: 'A Gloop that soaked up too much moonlight.' }),
  sp('sandsploot', 'Sand Sploot', 'Common', ['sandbar'], '#f2c879', 'pulse', { taste: 'muck' }),
  sp('tidekoi', 'Tidekoi', 'Uncommon', ['sandbar'], '#5ec8ff', 'drift', { likes: { time: ['Night'] } }),
  sp('shellmurk', 'Shellmurk', 'Rare', ['sandbar'], '#ff8a6a', 'pulse', { likes: { weather: ['fog'] } }),
  sp('lunaray', 'Lunaray', 'Legendary', ['sandbar'], '#dfe8ff', 'wild', { needs: { time: ['Night'], weather: ['clear'] }, hint: 'It only rises when the moon is out and the sky is clear.' }),

  // Hidden Falls Cave (secret: sunlight shows a gap behind the falls)
  sp('echogill', 'Echogill', 'Uncommon', ['cave'], '#b77bff', 'pulse', { hint: 'Its tugs echo. Count the beats.' }),
  sp('amberlumen', 'Amber Lumen', 'Rare', ['cave'], '#ffb43a', 'dart', { likes: { time: ['Dawn'] } }),
  sp('gemback', 'Gemback', 'Rare', ['cave'], '#3cf08a', 'steady', { size: [30, 64] }),
  sp('hollowdrake', 'Hollowdrake', 'Epic', ['cave'], '#8f7bff', 'wild', { needs: { time: ['Dawn', 'Dusk'] }, hint: 'A drake that never left the dark. It stirs at the edges of the day.' }),

  // Sunken Wreck (secret: storms and fog uncover the mast)
  sp('rustjaw', 'Rustjaw', 'Uncommon', ['wreck'], '#c9783a', 'pulse'),
  sp('barnaclebass', 'Barnacle Bass', 'Rare', ['wreck'], '#3fd4c0', 'steady', { likes: { weather: ['storm'] } }),
  sp('ghostshark', 'Ghostshark', 'Epic', ['wreck'], '#9ff0ea', 'dart', { likes: { weather: ['fog'] }, hint: 'You can see right through it. Its lunges are real, though.' }),
  sp('drownedking', 'Drowned King', 'Legendary', ['wreck'], '#5fe0c8', 'wild', { needs: { weather: ['storm', 'fog'] }, hint: 'The old king of the wreck. It surfaces when the weather turns.' }),
];
// A few residents wander into the secret spots too.
for (const [id, spot] of [['stardrift', 'sandbar'], ['crystalfin', 'cave'], ['lumen', 'cave'], ['goopshark', 'wreck'], ['oilspill', 'wreck']]) {
  GOOPS.find((g) => g.id === id).spots.push(spot);
}
export const RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };


// ---------- the shore ----------

// Fishing spots along the shore. `pos` is the distance along the shore (in spot widths) and
// `unlockAt` the number of GoopDex entries needed before the path to the spot is clear.
// Secret spots are not on the path; they appear when their conditions line up and you find them.
const SPOT_DEFS = [
  {
    id: 'sandbar', name: 'Moonlit Sandbar', pos: -1, essenceMul: 1.5, rareMul: 1.3, biteMin: 1.0, biteMax: 2.8,
    desc: 'A ribbon of sand that only shows when the tide runs out after dark.',
    secret: { when: { time: ['Night', 'Dusk'] }, rumor: '“When the moon is up, the tide pulls way back past the old dock. Walk west and see.”', clue: 'The tide is out. Something glints to the west…' },
  },
  { id: 'dock', name: 'The Old Dock', pos: 0, unlockAt: 0, essenceMul: 1, rareMul: 1, biteMin: 1.0, biteMax: 3.0, desc: 'Lantern-lit planks over open water. Every journey starts here.' },
  { id: 'lily', name: 'Lily Cove', pos: 1, unlockAt: 0, essenceMul: 1.1, rareMul: 1.05, biteMin: 1.0, biteMax: 2.8, desc: 'A sheltered cove of lily pads and pink blooms.' },
  { id: 'reeds', name: 'Cattail Reeds', pos: 2, unlockAt: 3, essenceMul: 1.2, rareMul: 1.1, biteMin: 0.9, biteMax: 2.6, desc: 'Cattails, moss and murky shallows.' },
  { id: 'boulder', name: 'Slime Boulders', pos: 3, unlockAt: 7, essenceMul: 1.3, rareMul: 1.15, biteMin: 1.1, biteMax: 3.0, desc: 'Slime-streaked boulders where tough Goops lurk.' },
  { id: 'falls', name: 'Waterfall Inlet', pos: 4, unlockAt: 12, essenceMul: 1.4, rareMul: 1.25, biteMin: 1.0, biteMax: 2.8, desc: 'Cold, churning water under the falls.' },
  {
    id: 'cave', name: 'Hidden Falls Cave', pos: 5, essenceMul: 1.6, rareMul: 1.4, biteMin: 1.1, biteMax: 3.0,
    desc: 'A crystal cave tucked behind the waterfall.',
    secret: { when: { time: ['Day', 'Dawn'] }, requires: 'falls', rumor: '“Sunlight hits the far side of the falls just right in the daytime. There’s a gap back there, I swear it.”', clue: 'Light is shining through a gap in the rocks…' },
  },
  { id: 'grotto', name: 'Glowshroom Grotto', pos: 6, unlockAt: 18, essenceMul: 1.5, rareMul: 1.35, biteMin: 1.2, biteMax: 3.2, desc: 'Glowing mushrooms over still, dark water.' },
  { id: 'deep', name: 'The Deep Drop', pos: 7, unlockAt: 26, essenceMul: 1.8, rareMul: 1.6, biteMin: 1.3, biteMax: 3.6, desc: 'The pond floor drops away. Legends sleep here.' },
  {
    id: 'wreck', name: 'Sunken Wreck', pos: 8, essenceMul: 2, rareMul: 1.7, biteMin: 1.3, biteMax: 3.4,
    desc: 'An old boat on the pond floor, past the Deep Drop.',
    secret: { when: { weather: ['storm', 'fog'] }, requires: 'deep', rumor: '“Storms and fog churn the water past the Deep Drop. That’s when the old mast shows.”', clue: 'A broken mast pokes out of the churning water…' },
  },
];
export const SPOTS = SPOT_DEFS.map((s) => ({ unlockAt: 0, ...s, goops: GOOPS.filter((g) => g.spots.includes(s.id)).map((g) => g.id) }));
export const SPOT_BY = Object.fromEntries(SPOTS.map((s) => [s.id, s]));
/** Within this distance (in spot widths) of a spot you are standing at it and get its bonuses. */
export const HOT_RADIUS = 0.16;

// Field notes hidden along the shore. Each one reveals where and when a rare Goop bites.
export const NOTES = [
  { id: 'n-dock-1', spot: 'dock', reveals: 'kinggloop' }, { id: 'n-dock-2', spot: 'dock', reveals: 'drowsy' },
  { id: 'n-lily-1', spot: 'lily', reveals: 'stardrift' }, { id: 'n-lily-2', spot: 'lily', reveals: 'jellytail' },
  { id: 'n-reeds-1', spot: 'reeds', reveals: 'mistfin' }, { id: 'n-reeds-2', spot: 'reeds', reveals: 'toxibass' },
  { id: 'n-boulder-1', spot: 'boulder', reveals: 'oilspill' }, { id: 'n-boulder-2', spot: 'boulder', reveals: 'wastebloater' },
  { id: 'n-falls-1', spot: 'falls', reveals: 'prismadrake' }, { id: 'n-falls-2', spot: 'falls', reveals: 'stormray' },
  { id: 'n-grotto-1', spot: 'grotto', reveals: 'nightmire' }, { id: 'n-grotto-2', spot: 'grotto', reveals: 'phantomfin' },
  { id: 'n-deep-1', spot: 'deep', reveals: 'abyssmelt' }, { id: 'n-deep-2', spot: 'deep', reveals: 'abyssgloop' },
  { id: 'n-sandbar-1', spot: 'sandbar', reveals: 'lunaray' }, { id: 'n-cave-1', spot: 'cave', reveals: 'hollowdrake' },
  { id: 'n-wreck-1', spot: 'wreck', reveals: 'drownedking' },
];
export const NOTE_REWARD = 25;
export const SECRET_REWARD = 60;

export const WEATHER = {
  clear: { label: 'Clear', weight: 50, biteMul: 1, forceMul: 1 },
  rain: { label: 'Rain', weight: 22, biteMul: 0.75, forceMul: 1 },
  fog: { label: 'Fog', weight: 16, biteMul: 1.1, forceMul: 1 },
  storm: { label: 'Storm', weight: 12, biteMul: 0.7, forceMul: 1.2 },
};

export const TIMES = ['Dawn', 'Day', 'Dusk', 'Night'];
export const CASTS_PER_TIME = 3;
export const SHINY_ODDS = 1 / 48;
export const PERFECT_HOOK = 0.4; // seconds after the bite for a perfect hook
export const MOON = ['New moon', 'Crescent moon', 'Half moon', 'Full moon', 'Waning moon'];
export const moonPhase = (day) => ((day % 5) + 5) % 5;
export const isFullMoon = (day) => moonPhase(day) === 3;

// Permanent tackle upgrades, bought with Essence. cost[i] buys level i + 1.
export const UPGRADES = {
  rod: { name: 'Rod', desc: 'Reel faster inside the safe zone.', cost: [120, 320, 700] },
  line: { name: 'Line', desc: 'Wider safe zone, gentler on snaps.', cost: [150, 360, 750] },
  lure: { name: 'Lure', desc: 'Faster bites and better odds at rare Goops.', cost: [100, 280, 650] },
};

// Bait. One is used up per cast (except the worm). Matching a Goop's taste makes it bite ×3 more often.
export const BAITS = {
  worm: { name: 'Wriggly Worm', icon: '🪱', cost: 0, pack: 0, desc: 'Plain and dependable. Free and endless.' },
  sugar: { name: 'Sugar Drop', icon: '🍬', taste: 'sweet', cost: 45, pack: 5, desc: 'Sweet-toothed Goops — koi and jellies — bite ×3.' },
  mud: { name: 'Mud Pie', icon: '🟤', taste: 'muck', cost: 45, pack: 5, desc: 'Muck-loving Goops of the dock and reeds bite ×3.' },
  ember: { name: 'Ember Pellet', icon: '🔥', taste: 'ember', cost: 65, pack: 5, desc: 'Hot-blooded magma and lava Goops bite ×3.' },
  frost: { name: 'Frost Fly', icon: '❄️', taste: 'frost', cost: 65, pack: 5, desc: 'Crystal and ice Goops of the falls bite ×3.' },
  glow: { name: 'Glow Grub', icon: '✨', taste: 'glow', cost: 75, pack: 5, desc: 'Glowing, ghostly and void Goops bite ×3.' },
  golden: { name: 'Golden Goo', icon: '🌟', cost: 200, pack: 3, desc: 'Rare-or-better Goops ×2 and double shiny chance.' },
};
export const tasteBait = (taste) => Object.keys(BAITS).find((k) => BAITS[k].taste === taste) || 'worm';

// Collections: catch every Goop in a set for a one-time reward and a trophy.
export const SETS = [
  { id: 'regulars', name: 'Pond Regulars', icon: '🐸', goops: ['gloop', 'murkling', 'sploot', 'flicker', 'puddlit', 'bubblegum'], reward: 80 },
  { id: 'jelly', name: 'Jelly Jamboree', icon: '🪼', goops: ['jellygill', 'jellykoi', 'jellytrout', 'jellytail', 'jellyglow'], reward: 160 },
  { id: 'koi', name: 'Koi Collector', icon: '🎏', goops: ['blushkoi', 'jellykoi', 'goldkoi', 'tidekoi'], reward: 180 },
  { id: 'swamp', name: 'Swamp Things', icon: '🌿', goops: ['bogbelly', 'mireback', 'mirecarp', 'swampgill', 'mosskarp', 'mudmouth'], reward: 150 },
  { id: 'toxic', name: 'Toxic Waste', icon: '☣️', goops: ['toxitail', 'toxibass', 'venomfin', 'wastebloater', 'sludgejaw', 'oilspill'], reward: 220 },
  { id: 'magma', name: 'Hot Rocks', icon: '🌋', goops: ['magmamin', 'magmatail', 'magmafin', 'lavagill', 'lavaflow', 'embergill', 'meltjaw'], reward: 260 },
  { id: 'crystal', name: 'Crystal Clear', icon: '💎', goops: ['crystalgill', 'crystalfin', 'shardfin', 'glacierfin', 'geodeback', 'gemback', 'echogill'], reward: 280 },
  { id: 'storm', name: 'Storm Chasers', icon: '⚡', goops: ['stormling', 'sparkfin', 'voltfin', 'stormray', 'barnaclebass'], reward: 260 },
  { id: 'glow', name: 'Things That Glow', icon: '👻', goops: ['lumen', 'lanternfin', 'ectofish', 'phantomfin', 'bonepool', 'starslime', 'amberlumen'], reward: 300 },
  { id: 'void', name: 'Into the Void', icon: '🌀', goops: ['voidling', 'voidripper', 'voidfin', 'abyssmelt', 'abyssgloop'], reward: 400 },
  { id: 'prism', name: 'Rainbow Road', icon: '🌈', goops: ['prismgill', 'prismfin', 'prismadrake', 'aurorafin', 'coralgoop'], reward: 400 },
  { id: 'secrets', name: 'Off the Map', icon: '🗺️', goops: GOOPS.filter((g) => g.spots.some((s) => ['sandbar', 'cave', 'wreck'].includes(s)) && !['stardrift', 'crystalfin', 'lumen', 'goopshark', 'oilspill'].includes(g.id)).map((g) => g.id), reward: 500 },
  { id: 'legends', name: 'Legends of North Pond', icon: '👑', goops: GOOPS.filter((g) => g.rarity === 'Legendary').map((g) => g.id), reward: 1000 },
];

export const BUDDY_BONUS = 0.1;
export const REROLL_COST = 25;

/** Plain-language description of when a Goop bites (used by the GoopDex). */
export function conditionText(goop) {
  const spots = goop.spots.map((id) => SPOT_BY[id]?.name).filter(Boolean).join(' & ');
  const words = (list) => list.map((w) => (WEATHER[w]?.label || w).toLowerCase()).join(' or ');
  const parts = [];
  if (goop.needs?.time) parts.push(`only at ${words(goop.needs.time)}`);
  if (goop.needs?.weather) parts.push(`only in ${words(goop.needs.weather)} weather`);
  if (goop.likes?.time) parts.push(`more active at ${words(goop.likes.time)}`);
  if (goop.likes?.weather) parts.push(`drawn out by ${words(goop.likes.weather)}`);
  return `${spots}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
}

// ---------- encounter selection ----------

export function weightedPick(items, rng = Math.random) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
  if (!items.length || total <= 0) return null;
  let roll = rng() * total;
  for (const item of items) {
    roll -= Math.max(0, item.weight);
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}

/** Does a Goop's hard requirement (if any) allow it to bite right now? */
export function conditionsMet(goop, weather, time) {
  if (goop.needs?.weather && !goop.needs.weather.includes(weather)) return false;
  if (goop.needs?.time && !goop.needs.time.includes(time)) return false;
  return true;
}

/**
 * Weighted pool of Goops at one spot for the given conditions.
 * `event` may hold { frenzy: spotId, visitor: { goop, spot }, fullMoon }.
 */
export function encounterPool({ spot = SPOT_BY.dock, weather = 'clear', time = 'Day', lure = 0, bait = 'worm', event = {} } = {}) {
  const b = BAITS[bait] || BAITS.worm;
  const ids = new Set(spot.goops);
  if (event.visitor && event.visitor.spot === spot.id) ids.add(event.visitor.goop);
  return GOOPS.filter((g) => ids.has(g.id) && conditionsMet(g, weather, time)).map((g) => {
    let weight = g.weight;
    if (g.likes?.weather?.includes(weather)) weight *= 4;
    if (g.likes?.time?.includes(time)) weight *= 3;
    if (g.needs) weight *= 1.5; // conditions are hard to line up; reward the player who does
    if (g.rarity !== 'Common') weight *= spot.rareMul * (1 + 0.15 * lure);
    if (b.taste && g.taste === b.taste) weight *= 3;
    if (bait === 'golden' && RANK[g.rarity] >= 2) weight *= 2;
    if (event.visitor?.goop === g.id && event.visitor.spot === spot.id) weight = Math.max(weight * 4, 6);
    if (event.frenzy === spot.id && g.rarity !== 'Common') weight *= 1.3;
    if (event.fullMoon && time === 'Night' && g.rarity === 'Legendary') weight *= 2;
    return { ...g, weight };
  });
}

/**
 * Where you are on the shore. Standing within HOT_RADIUS of an open spot puts you at it;
 * otherwise you are on the open shore between the two nearest open spots and fish a blend of both.
 */
export function shoreZone(pos, openSpots) {
  const open = [...openSpots].sort((a, b) => a.pos - b.pos);
  if (!open.length) return { spot: SPOT_BY.dock, hot: true, mix: [[SPOT_BY.dock, 1]] };
  let near = open[0];
  for (const s of open) if (Math.abs(s.pos - pos) < Math.abs(near.pos - pos)) near = s;
  if (Math.abs(near.pos - pos) <= HOT_RADIUS) return { spot: near, hot: true, mix: [[near, 1]] };
  const left = [...open].reverse().find((s) => s.pos <= pos);
  const right = open.find((s) => s.pos >= pos);
  if (!left || !right || left === right) return { spot: near, hot: false, mix: [[near, 1]] };
  const t = (pos - left.pos) / (right.pos - left.pos);
  return { spot: near, hot: false, mix: [[left, 1 - t], [right, t]], between: [left, right] };
}

/** Pool for a shore zone: each spot's pool scaled by how close you are to it. */
export function zonePool(zone, opts = {}) {
  const merged = new Map();
  for (const [spot, k] of zone.mix) {
    if (k <= 0) continue;
    for (const g of encounterPool({ ...opts, spot })) {
      const m = merged.get(g.id);
      if (m) m.weight += g.weight * k; else merged.set(g.id, { ...g, weight: g.weight * k });
    }
  }
  return [...merged.values()];
}

/** Essence multiplier, rare multiplier and bite window for a zone (open shore pays a little less). */
export function zoneStats(zone) {
  let essenceMul = 0, biteMin = 0, biteMax = 0;
  for (const [s, k] of zone.mix) { essenceMul += s.essenceMul * k; biteMin += s.biteMin * k; biteMax += s.biteMax * k; }
  if (!zone.hot) essenceMul *= 0.9;
  return { essenceMul, biteMin, biteMax };
}

// ---------- fight ----------

/** Pull force a Goop applies to the line (positive = tension up). Roughly -0.2 .. +1.2 per second. */
export function pullForce(pattern, t) {
  switch (pattern) {
    case 'steady': return 0.1 + Math.sin(t * 1.4) * 0.15;
    case 'pulse': return Math.sin(t * 3.2) > 0.1 ? 0.45 : -0.05;
    case 'dart': return (Math.sin(t * 2.6) > 0.6 ? 0.7 : 0) + Math.sin(t * 4.8) * 0.1;
    case 'drift': return 0.1 + Math.sin(t * 0.7) * 0.4;
    case 'sleepy': return Math.sin(t * 1.1) * 0.08 + (Math.sin(t * 1.9 + 1) > 0.9 ? 0.85 : -0.05);
    case 'wild': return Math.sin(t * 3.7) * 0.5 + Math.sin(t * 1.3 + 2) * 0.4 + (Math.sin(t * 2.3) > 0.7 ? 0.6 : 0);
    default: return 0;
  }
}

export function gearStats(gear = {}) {
  const rod = gear.rod || 0, line = gear.line || 0;
  return {
    reelRate: 1 + 0.15 * rod, // multiplier on catch progress
    safeLo: 0.38 - 0.03 * line,
    safeHi: 0.78 + 0.03 * line,
    snapGuard: 1 - 0.15 * line, // multiplier on stamina lost while over-tensioned
  };
}

export const LUNGE_WARN = 0.8; // seconds of warning before a lunge
/** Rare-or-better Goops (and darting/wild ones) lunge: a telegraphed surge you dodge by easing off. */
export const lunges = (goop) => RANK[goop.rarity] >= 2 || goop.pattern === 'wild';

export function makeFight(goop, gear = {}, env = {}) {
  const g = gearStats(gear);
  const rng = env.rng || Math.random;
  return {
    goop, progress: 0, stamina: goop.stamina, tension: 0.5, phase: 0, elapsed: 0, caught: false, escaped: false,
    safeLo: g.safeLo, safeHi: g.safeHi, reelRate: g.reelRate, snapGuard: g.snapGuard,
    forceMul: (env.forceMul ?? 1) * (goop.force ?? 1),
    streak: 0, combo: 1, best: 1,
    rng, nextLunge: lunges(goop) ? 2.4 + rng() * 2.2 : null, warn: false,
    lungePower: 0.3 + 0.05 * RANK[goop.rarity], log: [],
  };
}

export const comboFor = (streak) => 1 + Math.min(4, Math.floor(streak / 1.2)) * 0.15;

export function tickFight(fight, input, dt) {
  if (!fight || fight.caught || fight.escaped) return fight;
  const d = Math.max(0, Math.min(dt, 0.08));
  fight.elapsed += d;
  fight.phase += d;
  const reeling = !!input.reel;

  // Reeling winds tension up, releasing lets it fall; the Goop pulls against you.
  const pull = pullForce(fight.goop.pattern, fight.phase) * (fight.forceMul ?? 1);
  fight.tension += (reeling ? 0.62 : -0.55) * d + pull * d;

  // Lunges: a warning, then a surge. Easing off when it hits dodges most of it.
  if (fight.nextLunge != null) {
    fight.nextLunge -= d;
    fight.warn = fight.nextLunge > 0 && fight.nextLunge <= LUNGE_WARN;
    if (fight.nextLunge <= 0) {
      const dodged = !reeling;
      fight.tension += fight.lungePower * (dodged ? 0.25 : 1) * (fight.forceMul ?? 1);
      if (dodged) fight.progress = Math.min(1, fight.progress + 0.04);
      else { fight.progress = Math.max(0, fight.progress - 0.05); fight.streak = 0; }
      fight.log.push(dodged ? 'dodge' : 'lunge');
      fight.nextLunge = 2.6 + (fight.rng || Math.random)() * 2.6;
      fight.warn = false;
    }
  }
  fight.tension = Math.max(0, Math.min(1, fight.tension));

  const lo = fight.safeLo ?? 0.38, hi = fight.safeHi ?? 0.78;
  const safe = fight.tension >= lo && fight.tension <= hi;
  const rate = fight.reelRate ?? 1, guard = fight.snapGuard ?? 1;

  // Staying in the zone while reeling builds a streak that speeds up the catch.
  if (safe && reeling) fight.streak = (fight.streak || 0) + d;
  else if (!safe) fight.streak = 0;
  const combo = comboFor(fight.streak || 0);
  if (combo > (fight.combo || 1)) fight.log.push('combo');
  fight.combo = combo;
  fight.best = Math.max(fight.best || 1, combo);

  if (safe && reeling) fight.progress += d * 0.3 * rate * combo;
  else if (fight.tension > 0.88 || fight.tension < 0.15) fight.progress = Math.max(0, fight.progress - d * 0.1);
  else if (!reeling) fight.progress = Math.max(0, fight.progress - d * 0.02);

  // The Goop tires when you work it in the zone; snapping tension or slack lets it recover/flee.
  if (fight.tension > 0.95) fight.stamina -= d * 0.6 * guard;
  else if (safe) fight.stamina -= d * (reeling ? 0.07 : 0.04);
  else fight.stamina -= d * 0.08;

  fight.progress = Math.min(1, fight.progress);
  if (fight.progress >= 1) fight.caught = true;
  else if (fight.stamina <= 0) fight.escaped = true;
  return fight;
}

// ---------- daily bounties ----------

const BOUNTY_KINDS = ['spot', 'rarity', 'weather', 'time', 'size', 'bait', 'new', 'count'];

/** Three fresh bounties for the day, chosen to suit what the player has unlocked. */
export function makeBounties(rng, { open = [SPOT_BY.dock, SPOT_BY.lily], dexCount = 0, day = 1 } = {}) {
  const pick = (list) => list[Math.floor(rng() * list.length) % list.length];
  const kinds = [...BOUNTY_KINDS];
  const out = [];
  while (out.length < 3 && kinds.length) {
    const kind = kinds.splice(Math.floor(rng() * kinds.length) % kinds.length, 1)[0];
    const id = `d${day}-${kind}`;
    let b = null;
    if (kind === 'spot') {
      const s = pick(open);
      const need = 3 + Math.floor(rng() * 3);
      b = { kind, spot: s.id, need, text: `Catch ${need} Goops at ${s.name}`, essence: Math.round((40 + need * 10) * s.essenceMul), bait: tasteBait(TASTE_BY_SPOT[s.id]), baitN: 3 };
    } else if (kind === 'rarity') {
      const rarity = dexCount >= 30 ? 'Epic' : dexCount >= 8 ? 'Rare' : 'Uncommon';
      b = { kind, rarity, need: 1, text: `Catch ${rarity === 'Uncommon' || rarity === 'Epic' ? 'an' : 'a'} ${rarity} Goop or rarer`, essence: { Uncommon: 50, Rare: 110, Epic: 220 }[rarity], bait: rarity === 'Uncommon' ? null : 'golden', baitN: 1 };
    } else if (kind === 'weather') {
      const weather = pick(['rain', 'fog', 'storm']);
      const need = 2;
      b = { kind, weather, need, text: `Catch ${need} Goops in ${WEATHER[weather].label.toLowerCase()}`, essence: 90 };
    } else if (kind === 'time') {
      const time = pick(['Dawn', 'Dusk', 'Night']);
      const need = 2 + Math.floor(rng() * 2);
      b = { kind, time, need, text: `Catch ${need} Goops at ${time.toLowerCase()}`, essence: 50 + need * 15 };
    } else if (kind === 'size') {
      const cm = 24 + Math.floor(rng() * 4) * 6 + Math.min(18, Math.floor(dexCount / 3) * 2);
      b = { kind, cm, need: 1, text: `Land a Goop at least ${cm} cm long`, essence: 40 + cm * 2 };
    } else if (kind === 'bait') {
      b = { kind, need: 2, text: 'Catch 2 Goops on special bait', essence: 70, bait: 'golden', baitN: 1 };
    } else if (kind === 'new') {
      if (dexCount >= GOOPS.length) continue;
      b = { kind, need: 1, text: 'Add a new Goop to your GoopDex', essence: 60 + dexCount * 2 };
    } else if (kind === 'count') {
      const need = 6 + Math.floor(rng() * 4);
      b = { kind, need, text: `Catch ${need} Goops today`, essence: 30 + need * 10, bait: pick(['sugar', 'mud']), baitN: 4 };
    }
    out.push({ id, have: 0, done: false, bait: null, baitN: 0, ...b });
  }
  return out;
}

/** Does a catch (with its context) count toward a bounty? */
export function bountyMatches(b, c) {
  switch (b.kind) {
    case 'spot': return c.spot === b.spot;
    case 'rarity': return RANK[c.rarity] >= RANK[b.rarity];
    case 'weather': return c.weather === b.weather;
    case 'time': return c.time === b.time;
    case 'size': return c.size >= b.cm;
    case 'bait': return c.bait && c.bait !== 'worm';
    case 'new': return c.firstTime;
    case 'count': return true;
    default: return false;
  }
}

// ---------- persistence ----------

const SAVE_VERSION = 3;
const OLD_SPOT = { pond: 'dock', reeds: 'reeds', deep: 'deep' };
const OLD_SPOT_COST = { reeds: 200, deep: 600 };

export class SaveStore {
  constructor(storage = globalThis.localStorage, key = 'goop-fishing-save') {
    this.storage = storage;
    this.key = key;
  }

  fresh() {
    return {
      version: SAVE_VERSION, essence: 0, dex: {}, seen: [], notes: [], day: 1, weather: 'clear', caughtToday: 0,
      timeIndex: 1, casts: 0, spot: 'dock', shore: 0, discovered: ['dock'], completed: [],
      gear: { rod: 0, line: 0, lure: 0 }, stats: { caught: 0, escaped: 0, missed: 0, shiny: 0, perfect: 0, dodges: 0, bounties: 0 },
      bait: 'worm', baits: { sugar: 3, mud: 3 }, buddy: null, sets: [],
      bounties: [], bountyDay: 0, frenzy: null, visitor: null, rumors: [],
    };
  }

  load() {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return this.fresh();
      const p = JSON.parse(raw);
      if (!p || typeof p !== 'object') return this.fresh();
      if (p.version === 1) return this.sanitize(this.migrateV1(p));
      if (p.version !== SAVE_VERSION && p.version !== 2) return this.fresh();
      return this.sanitize(p);
    } catch {
      return this.fresh();
    }
  }

  /** Version 1 had three separate lakes bought with Essence; they became spots on one pond. */
  migrateV1(p) {
    const unlocked = Array.isArray(p.unlocked) ? p.unlocked : [];
    let refund = 0;
    for (const id of unlocked) refund += OLD_SPOT_COST[id] || 0;
    const essence = (Number.isFinite(p.essence) ? p.essence : 0) + refund;
    return {
      ...p, essence,
      spot: OLD_SPOT[p.spot] || 'dock',
      discovered: ['dock'],
      seen: p.dex && typeof p.dex === 'object' ? Object.keys(p.dex) : [],
    };
  }

  /** Merge a parsed save over fresh defaults, discarding values of the wrong type. */
  sanitize(p) {
    const f = this.fresh();
    const num = (v, d, min = 0) => (Number.isFinite(v) ? Math.max(min, v) : d);
    const ids = new Set(GOOPS.map((g) => g.id));
    const list = (v, ok) => (Array.isArray(v) ? [...new Set(v.filter(ok))] : []);
    const s = { ...f, version: SAVE_VERSION };
    s.essence = Math.floor(num(p.essence, 0));
    s.day = Math.floor(num(p.day, 1, 1));
    s.caughtToday = Math.floor(num(p.caughtToday, 0));
    s.casts = Math.floor(num(p.casts, 0));
    s.timeIndex = Math.min(TIMES.length - 1, Math.floor(num(p.timeIndex, 1)));
    s.weather = WEATHER[p.weather] ? p.weather : 'clear';
    s.dex = {};
    if (p.dex && typeof p.dex === 'object' && !Array.isArray(p.dex)) {
      for (const [id, e] of Object.entries(p.dex)) {
        if (!ids.has(id) || !e || typeof e !== 'object') continue;
        s.dex[id] = {
          count: Math.floor(num(e.count, 1, 1)),
          fastest: Number.isFinite(e.fastest) ? e.fastest : null,
          best: Number.isFinite(e.best) ? e.best : null,
          shiny: Math.floor(num(e.shiny, 0)),
        };
      }
    }
    s.seen = list(p.seen, (id) => ids.has(id));
    for (const id of Object.keys(s.dex)) if (!s.seen.includes(id)) s.seen.push(id);
    s.notes = list(p.notes, (id) => NOTES.some((n) => n.id === id));
    s.completed = list(p.completed, (id) => !!SPOT_BY[id]);
    const found = Object.keys(s.dex).length;
    const prior = Array.isArray(p.discovered) ? p.discovered : [];
    const open = (id) => {
      const sp = SPOT_BY[id];
      if (!sp) return false;
      if (sp.secret) return prior.includes(id) && (!sp.secret.requires || SPOT_BY[sp.secret.requires].unlockAt <= found);
      return sp.unlockAt <= found;
    };
    s.discovered = list(p.discovered, open);
    if (!s.discovered.includes('dock')) s.discovered.unshift('dock');
    s.spot = open(p.spot) ? p.spot : 'dock';
    if (!s.discovered.includes(s.spot)) s.discovered.push(s.spot);
    s.shore = Number.isFinite(p.shore) && s.spot === p.spot ? Math.max(-1.5, Math.min(8.5, p.shore)) : SPOT_BY[s.spot].pos;
    for (const k of Object.keys(UPGRADES)) {
      s.gear[k] = Math.min(UPGRADES[k].cost.length, Math.floor(num(p.gear?.[k], 0)));
    }
    for (const k of Object.keys(f.stats)) s.stats[k] = Math.floor(num(p.stats?.[k], 0));
    // bait
    s.baits = {};
    const srcBaits = p.baits && typeof p.baits === 'object' && !Array.isArray(p.baits) ? p.baits : (p.version === SAVE_VERSION ? {} : f.baits);
    for (const k of Object.keys(BAITS)) if (k !== 'worm') { const n = Math.floor(num(srcBaits[k], 0)); if (n) s.baits[k] = Math.min(999, n); }
    s.bait = BAITS[p.bait] && (p.bait === 'worm' || s.baits[p.bait] > 0) ? p.bait : 'worm';
    s.buddy = ids.has(p.buddy) && s.dex[p.buddy] ? p.buddy : null;
    s.sets = list(p.sets, (id) => SETS.some((x) => x.id === id));
    s.rumors = list(p.rumors, (id) => !!SPOT_BY[id]?.secret);
    // bounties
    s.bountyDay = Math.floor(num(p.bountyDay, 0));
    s.bounties = Array.isArray(p.bounties) ? p.bounties.filter((b) => b && typeof b === 'object' && BOUNTY_KINDS.includes(b.kind) && typeof b.text === 'string')
      .slice(0, 3).map((b) => ({
        ...b, need: Math.max(1, Math.floor(num(b.need, 1, 1))), have: Math.floor(num(b.have, 0)), done: !!b.done,
        essence: Math.floor(num(b.essence, 0)), bait: BAITS[b.bait] ? b.bait : null, baitN: Math.floor(num(b.baitN, 0)),
      })) : [];
    if (!s.bounties.length) s.bountyDay = 0;
    s.frenzy = open(p.frenzy) ? p.frenzy : null;
    s.visitor = p.visitor && ids.has(p.visitor.goop) && open(p.visitor.spot) ? { goop: p.visitor.goop, spot: p.visitor.spot } : null;
    return s;
  }

  save(s) {
    try { this.storage?.setItem(this.key, JSON.stringify(s)); return true; } catch { return false; }
  }

  reset() {
    try { this.storage?.removeItem(this.key); } catch { /* storage unavailable */ }
    return this.fresh();
  }
}

// ---------- game ----------

const MAX_EVENTS = 60;

export class FishingGame {
  constructor({ rng = Math.random, saveStore = new SaveStore(), biteDuration = 2.4 } = {}) {
    this.rng = rng;
    this.saveStore = saveStore;
    this.state = saveStore.load();
    this.biteDuration = biteDuration;
    this.events = [];
    this.prevReel = false;
    this.here = true; // standing at state.spot (false on the open shore)
    this.castCtx = null;
    this.resetRound('Cast your line to begin.');
    this.ensureDaily();
  }

  resetRound(message) {
    this.phase = PHASES.IDLE;
    this.timer = 0;
    this.biteAt = 1.2;
    this.goop = null;
    this.fight = null;
    this.lastReward = 0;
    this.lastCatch = null;
    this.message = message;
  }

  emit(type, detail = {}) {
    this.events.push({ type, detail, time: Date.now() });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  }

  get spot() { return SPOT_BY[this.state.spot] || SPOT_BY.dock; }
  get weather() { return WEATHER[this.state.weather] || WEATHER.clear; }
  get timeOfDay() { return TIMES[this.state.timeIndex] || 'Day'; }
  get busy() { return [PHASES.CAST, PHASES.BITE, PHASES.FIGHT].includes(this.phase); }
  get dexCount() { return Object.keys(this.state.dex).length; }
  get fullMoon() { return isFullMoon(this.state.day); }
  get moon() { return moonPhase(this.state.day); }
  get event() { return { frenzy: this.state.frenzy, visitor: this.state.visitor, fullMoon: this.fullMoon }; }

  spotUnlocked(id) {
    const s = SPOT_BY[id];
    if (!s) return false;
    if (s.secret) return this.state.discovered.includes(id);
    return this.dexCount >= s.unlockAt;
  }

  /** Spots you can walk to and fish right now. */
  openSpots() { return SPOTS.filter((s) => this.spotUnlocked(s.id)); }

  /** Species at a spot, and how many of them are in the GoopDex. */
  spotProgress(id) {
    const s = SPOT_BY[id];
    if (!s) return { found: 0, total: 0 };
    return { found: s.goops.filter((g) => this.state.dex[g]).length, total: s.goops.length };
  }

  // ----- the shore -----

  zone(pos = this.state.shore) { return shoreZone(pos, this.openSpots()); }

  /**
   * Called as the player walks: `pos` is the distance along the shore in spot widths.
   * Arriving at a spot counts as visiting it (first visits pay a discovery reward).
   */
  setShore(pos) {
    if (this.busy || !Number.isFinite(pos)) return;
    this.state.shore = pos;
    const z = this.zone(pos);
    if (z.hot) {
      if (!this.here || this.state.spot !== z.spot.id) this.travel(z.spot.id);
    } else {
      if (this.here && this.phase !== PHASES.IDLE) this.resetRound('');
      this.here = false;
      this.state.spot = z.spot.id;
    }
  }

  /** Arrive at a spot on the shore. Spots open as the GoopDex fills; not allowed mid-cast. */
  travel(spotId) {
    const spot = SPOT_BY[spotId];
    if (!spot || this.busy || !this.spotUnlocked(spotId)) return false;
    this.state.spot = spotId;
    if (this.state.shore == null || Math.abs(this.state.shore - spot.pos) > HOT_RADIUS) this.state.shore = spot.pos;
    this.here = true;
    if (!this.state.discovered.includes(spotId)) {
      this.state.discovered.push(spotId);
      const reward = 15 + spot.unlockAt * 2;
      this.state.essence += reward;
      this.emit('discover', { spot: spotId, reward });
      this.message = `Discovered ${spot.name}! +${reward} Essence`;
    } else if (this.freshSecret === spotId) {
      this.freshSecret = null; // keep the "secret found" message up
    } else {
      this.message = `${spot.name}. Cast your line!`;
    }
    this.emit('travel', { spot: spotId });
    this.saveStore.save(this.state);
    return true;
  }

  /** Step away from the current spot (walking). */
  leave() {
    if (this.busy) return false;
    if (this.phase !== PHASES.IDLE) this.resetRound('');
    this.here = false;
    return true;
  }

  // ----- secrets -----

  /** Is a secret spot's clue showing right now (conditions met, path reachable, not yet found)? */
  secretVisible(id) {
    const s = SPOT_BY[id];
    if (!s?.secret || this.state.discovered.includes(id)) return false;
    if (s.secret.requires && !this.spotUnlocked(s.secret.requires)) return false;
    const w = s.secret.when;
    if (w.time && !w.time.includes(this.timeOfDay)) return false;
    if (w.weather && !w.weather.includes(this.state.weather)) return false;
    return true;
  }

  revealSecret(id) {
    if (this.busy || !this.secretVisible(id)) return false;
    const s = SPOT_BY[id];
    this.state.discovered.push(id);
    this.state.essence += SECRET_REWARD;
    this.message = `Secret found: ${s.name}! +${SECRET_REWARD} Essence`;
    this.freshSecret = id;
    this.emit('secret', { spot: id, reward: SECRET_REWARD });
    this.saveStore.save(this.state);
    return true;
  }

  /** Old Wiggs' latest rumour about a secret you could reach but have not found. */
  rumor() {
    const s = SPOTS.find((x) => x.secret && !this.state.discovered.includes(x.id) && (!x.secret.requires || this.spotUnlocked(x.secret.requires)));
    return s ? { spot: s.id, text: s.secret.rumor } : null;
  }

  // ----- fishing -----

  cast() {
    if (this.busy) return false;
    const z = this.zone();
    const s = this.state;
    const bait = BAITS[s.bait] && (s.bait === 'worm' || s.baits[s.bait] > 0) ? s.bait : 'worm';
    const ev = this.event;
    const pool = zonePool(z, { weather: s.weather, time: this.timeOfDay, lure: s.gear.lure, bait, event: ev });
    const picked = weightedPick(pool, this.rng);
    this.goop = picked ? GOOPS.find((g) => g.id === picked.id) : GOOPS[0];
    this.fight = null;
    this.lastCatch = null;
    this.timer = 0;
    const st = zoneStats(z);
    const frenzy = !!ev.frenzy && z.mix.some(([sp, k]) => sp.id === ev.frenzy && k >= 0.5);
    let wait = (st.biteMin + this.rng() * (st.biteMax - st.biteMin)) * this.weather.biteMul * (1 - 0.1 * s.gear.lure);
    if (BAITS[bait].taste && BAITS[bait].taste === this.goop.taste) wait *= 0.75;
    if (frenzy) wait *= 0.5;
    this.biteAt = Math.max(0.6, wait);
    this.castCtx = { spot: z.spot.id, hot: z.hot, bait, frenzy, essenceMul: st.essenceMul, weather: s.weather, time: this.timeOfDay };
    if (bait !== 'worm') {
      s.baits[bait] -= 1;
      if (s.baits[bait] <= 0) { delete s.baits[bait]; s.bait = 'worm'; this.emit('baitOut', { bait }); }
    }
    this.phase = PHASES.CAST;
    this.prevReel = true; // a button already held at cast time must be released and pressed again to hook
    this.message = frenzy ? 'Frenzy! They’re biting fast…' : 'Line out… watch for a bite.';
    this.emit('cast', { bait });
    this.advanceClock();
    this.saveStore.save(this.state);
    return true;
  }

  /** Every few casts the time of day moves on; the weather is re-rolled at each change. */
  advanceClock() {
    const s = this.state;
    s.casts += 1;
    if (s.casts % CASTS_PER_TIME !== 0) return;
    s.timeIndex = (s.timeIndex + 1) % TIMES.length;
    const newDay = s.timeIndex === 0;
    if (newDay) { s.day += 1; s.caughtToday = 0; }
    const entries = Object.entries(WEATHER).map(([id, w]) => ({ id, weight: w.weight }));
    s.weather = weightedPick(entries, this.rng)?.id || 'clear';
    // a feeding frenzy breaks out somewhere for this part of the day (or not)
    const open = this.openSpots();
    s.frenzy = this.rng() < 0.4 && open.length ? open[Math.floor(this.rng() * open.length) % open.length].id : null;
    this.emit('clock', { time: this.timeOfDay, weather: s.weather, day: s.day, frenzy: s.frenzy });
    if (s.frenzy) this.emit('frenzy', { spot: s.frenzy });
    if (newDay) this.ensureDaily();
  }

  /** New day: fresh bounties and a rare visitor somewhere on the shore. */
  ensureDaily() {
    const s = this.state;
    if (s.bountyDay === s.day && s.bounties.length) return;
    const open = this.openSpots().filter((x) => !x.secret);
    s.bounties = makeBounties(this.rng, { open, dexCount: this.dexCount, day: s.day });
    s.bountyDay = s.day;
    const spots = this.openSpots();
    const candidates = GOOPS.filter((g) => (g.rarity === 'Rare' || g.rarity === 'Epic') && !g.needs);
    const goop = candidates[Math.floor(this.rng() * candidates.length) % candidates.length];
    const homes = spots.filter((x) => !goop.spots.includes(x.id));
    s.visitor = homes.length ? { goop: goop.id, spot: homes[Math.floor(this.rng() * homes.length) % homes.length].id } : null;
    this.emit('newDay', { day: s.day, visitor: s.visitor, fullMoon: this.fullMoon });
  }

  rerollBounties() {
    const s = this.state;
    if (s.essence < REROLL_COST || s.bounties.every((b) => b.done)) return false;
    s.essence -= REROLL_COST;
    const fresh = makeBounties(this.rng, { open: this.openSpots().filter((x) => !x.secret), dexCount: this.dexCount, day: s.day });
    let i = 0;
    s.bounties = s.bounties.map((b) => {
      if (b.done) return b;
      const n = fresh[i % fresh.length]; i += 1;
      return { ...n, id: `${n.id}-r${s.essence}-${i}` };
    });
    this.emit('reroll');
    this.saveStore.save(s);
    return true;
  }

  update(dt, input = {}) {
    const step = Math.max(0, Math.min(dt, 0.08));
    const reel = !!input.reel;
    const pressed = reel && !this.prevReel;
    this.prevReel = reel;
    this.timer += step;

    if (this.phase === PHASES.CAST) {
      if (this.timer >= this.biteAt) {
        this.phase = PHASES.BITE;
        this.timer = 0;
        this.message = 'BITE! Tap REEL to hook it!';
        this.emit('bite');
      }
    } else if (this.phase === PHASES.BITE) {
      if (pressed) {
        this.phase = PHASES.FIGHT;
        this.fight = makeFight(this.goop, this.state.gear, { forceMul: this.weather.forceMul, rng: this.rng });
        const perfect = this.timer <= PERFECT_HOOK;
        this.fight.perfect = perfect;
        if (perfect) { this.fight.progress = 0.12; this.state.stats.perfect += 1; }
        this.timer = 0;
        this.message = perfect ? `Perfect hook! ${this.goop.hint}` : this.goop.hint;
        if (!this.state.seen.includes(this.goop.id)) this.state.seen.push(this.goop.id);
        this.emit('hooked', { goop: this.goop.id, perfect });
      } else if (this.timer >= this.biteDuration) {
        this.phase = PHASES.ESCAPED;
        this.state.stats.missed += 1;
        this.message = 'It slipped away. Cast again!';
        this.emit('missedBite');
        this.saveStore.save(this.state);
      }
    } else if (this.phase === PHASES.FIGHT) {
      tickFight(this.fight, { reel }, step);
      for (const e of this.fight.log.splice(0)) {
        if (e === 'dodge') { this.state.stats.dodges += 1; this.message = 'Dodged the lunge! Nice.'; }
        else if (e === 'lunge') this.message = 'It lunged! Ease off when you see the warning.';
        this.emit(e, { combo: this.fight.combo });
      }
      if (this.fight.caught) this.finishCatch();
      else if (this.fight.escaped) {
        this.phase = PHASES.ESCAPED;
        this.state.stats.escaped += 1;
        this.message = `${this.goop.name} broke free!`;
        this.emit('escaped', { goop: this.goop.id });
        this.saveStore.save(this.state);
      }
    }
  }

  finishCatch() {
    this.phase = PHASES.CAUGHT;
    const g = this.goop;
    const id = g.id;
    const s = this.state;
    const ctx = this.castCtx || { spot: s.spot, hot: true, bait: 'worm', frenzy: false, essenceMul: this.spot.essenceMul, weather: s.weather, time: this.timeOfDay };
    const before = this.dexCount;
    const prev = s.dex[id] || { count: 0, fastest: null, best: null, shiny: 0 };
    const time = this.fight.elapsed;
    const [lo, hi] = g.size;
    const size = Math.round((lo + (hi - lo) * this.rng() ** 2) * 10) / 10; // big ones are rare
    let odds = SHINY_ODDS;
    if (ctx.bait === 'golden') odds *= 2;
    if (this.fullMoon && ctx.time === 'Night') odds *= 2;
    const shiny = this.rng() > 1 - odds;
    const record = prev.best == null || size > prev.best;
    s.dex[id] = {
      count: prev.count + 1,
      fastest: prev.fastest == null ? time : Math.min(prev.fastest, time),
      best: record ? size : prev.best,
      shiny: prev.shiny + (shiny ? 1 : 0),
    };
    let mul = ctx.essenceMul * (shiny ? 3 : 1);
    if (ctx.frenzy) mul *= 1.5;
    if (s.buddy) mul *= 1 + BUDDY_BONUS;
    const reward = Math.round(g.essence * mul);
    this.lastReward = reward;
    s.essence += reward;
    s.caughtToday += 1;
    s.stats.caught += 1;
    if (shiny) s.stats.shiny += 1;
    const firstTime = prev.count === 0;
    this.lastCatch = { goop: id, reward, firstTime, size, record: record && !firstTime, shiny, time, combo: this.fight.best || 1, perfect: !!this.fight.perfect };
    this.message = `${shiny ? '✦ Shiny ' : ''}${g.name} caught! +${reward} Essence`;
    this.emit('catch', this.lastCatch);

    // A full set at a spot pays a bonus once.
    for (const sp of SPOTS) {
      if (!sp.goops.includes(id) || s.completed.includes(sp.id)) continue;
      const prog = this.spotProgress(sp.id);
      if (prog.found === prog.total) {
        s.completed.push(sp.id);
        const bonus = Math.round(100 * sp.essenceMul);
        s.essence += bonus;
        this.emit('spotComplete', { spot: sp.id, bonus });
      }
    }
    // Collections
    for (const set of SETS) {
      if (s.sets.includes(set.id) || !set.goops.includes(id) || !set.goops.every((x) => s.dex[x])) continue;
      s.sets.push(set.id);
      s.essence += set.reward;
      this.emit('set', { set: set.id, reward: set.reward });
    }
    // Bounties
    const info = { ...ctx, rarity: g.rarity, size, firstTime };
    for (const b of s.bounties) {
      if (b.done || !bountyMatches(b, info)) continue;
      b.have = Math.min(b.need, b.have + 1);
      if (b.have >= b.need) {
        b.done = true;
        s.essence += b.essence;
        if (b.bait) s.baits[b.bait] = (s.baits[b.bait] || 0) + b.baitN;
        s.stats.bounties += 1;
        this.emit('bounty', { id: b.id, text: b.text, essence: b.essence, bait: b.bait, baitN: b.baitN });
      }
    }
    // New stretches of shore open as the GoopDex grows.
    const after = this.dexCount;
    for (const sp of SPOTS) if (!sp.secret && sp.unlockAt > before && sp.unlockAt <= after) this.emit('unlock', { spot: sp.id });
    this.saveStore.save(s);
  }

  /** Pick up a field note found on the shore at the current spot. */
  collectNote(noteId) {
    const note = NOTES.find((n) => n.id === noteId);
    if (!note || this.state.notes.includes(noteId) || note.spot !== this.state.spot) return false;
    this.state.notes.push(noteId);
    this.state.essence += NOTE_REWARD;
    const g = GOOPS.find((x) => x.id === note.reveals);
    this.message = `Field note found: ${g.name} — ${conditionText(g)}`;
    this.emit('note', { note: noteId, goop: g.id, reward: NOTE_REWARD });
    this.saveStore.save(this.state);
    return true;
  }

  /** Has the player learned where/when a Goop bites (caught it or read its note)? */
  knows(goopId) {
    return !!this.state.dex[goopId] || this.state.notes.some((id) => NOTES.find((n) => n.id === id)?.reveals === goopId);
  }

  // ----- bait, buddy and shop -----

  selectBait(kind) {
    if (!BAITS[kind] || (kind !== 'worm' && !(this.state.baits[kind] > 0))) return false;
    this.state.bait = kind;
    this.emit('bait', { bait: kind });
    this.saveStore.save(this.state);
    return true;
  }

  buyBait(kind) {
    const b = BAITS[kind];
    if (!b || !b.cost || this.state.essence < b.cost) return false;
    this.state.essence -= b.cost;
    this.state.baits[kind] = (this.state.baits[kind] || 0) + b.pack;
    this.message = `Bought ${b.pack} × ${b.name}.`;
    this.emit('buyBait', { bait: kind });
    this.saveStore.save(this.state);
    return true;
  }

  setBuddy(id) {
    if (id !== null && !this.state.dex[id]) return false;
    this.state.buddy = id;
    const g = GOOPS.find((x) => x.id === id);
    this.message = g ? `${g.name} is your buddy now! +${Math.round(BUDDY_BONUS * 100)}% Essence` : 'Your buddy heads home for a nap.';
    this.emit('buddy', { goop: id });
    this.saveStore.save(this.state);
    return true;
  }

  upgradeCost(kind) {
    const u = UPGRADES[kind];
    const level = this.state.gear[kind];
    return u && level < u.cost.length ? u.cost[level] : null;
  }

  buyUpgrade(kind) {
    const cost = this.upgradeCost(kind);
    if (cost == null || this.state.essence < cost) return false;
    this.state.essence -= cost;
    this.state.gear[kind] += 1;
    this.message = `${UPGRADES[kind].name} upgraded to level ${this.state.gear[kind]}!`;
    this.emit('upgrade', { kind, level: this.state.gear[kind] });
    this.saveStore.save(this.state);
    return true;
  }

  reset() {
    this.state = this.saveStore.reset();
    this.prevReel = false;
    this.here = true;
    this.resetRound('Save reset. Cast your line!');
    this.ensureDaily();
    this.emit('reset');
  }
}
