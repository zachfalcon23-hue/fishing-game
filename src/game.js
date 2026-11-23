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
    ...(o.quest ? { quest: o.quest } : {}),
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

  // The Sleeper: only rises for Old Wiggs' last quest, then on full-moon nights
  sp('sleeper', 'The Sleeper', 'Legendary', ['deep'], '#4a6aff', 'wild', { needs: { time: ['Night'] }, weight: 3, stamina: 1.6, force: 1.28, essence: 300, size: [140, 260], taste: 'glow', quest: 'sleeper', hint: 'Ancient, enormous and very, very awake.' }),
];
// A few residents wander into the secret spots too.
for (const [id, spot] of [['stardrift', 'sandbar'], ['crystalfin', 'cave'], ['lumen', 'cave'], ['goopshark', 'wreck'], ['oilspill', 'wreck']]) {
  GOOPS.find((g) => g.id === id).spots.push(spot);
}
export const RANK = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
// ---------- Old Wiggs' story quests ----------

/** The quest chain. Goals: catch (any n), bait (n on special bait), discover (spot), notes (total),
 *  dodge (n lunges), secret (spot), dex (entries), frenzy (n catches in a frenzy), set (any collection),
 *  legendary (n Legendary catches), goop (catch a specific Goop). Rewards: essence and an optional item. */
export const QUESTS = [
  { id: 'q1', title: 'A Line in the Water', goal: { type: 'catch', n: 3 }, reward: { essence: 50, item: ['bobbers', 'slime'] },
    story: 'Well hey there, kid! Name’s Wiggs. Been fishing North Pond since before the Goops got glowy. Let’s see your form — catch me three Goops, any kind.',
    done: 'Not bad! Here, take this Slime Blob bobber. The Goops think it’s one of them.' },
  { id: 'q2', title: 'Feeling Peckish', goal: { type: 'bait', n: 1 }, reward: { essence: 40, baits: ['sugar', 4] },
    story: 'Every Goop has a favourite snack. Pick a bait from my shelves and land a Goop with it. Works wonders.',
    done: 'See? They come running. Have a few Sugar Drops on the house.' },
  { id: 'q3', title: 'Stretch Your Legs', goal: { type: 'discover', spot: 'reeds' }, reward: { essence: 80 },
    story: 'The pond’s bigger than this dock. Fill your GoopDex a little and the path to Cattail Reeds will clear. Go take a look.',
    done: 'Smells like a swamp, doesn’t it? Lovely. The muck Goops live out there.' },
  { id: 'q4', title: 'Bottle Post', goal: { type: 'notes', n: 2 }, reward: { essence: 80, item: ['rods', 'bamboo'] },
    story: 'Folks have been dropping notes in bottles round this pond for years. Find two of ’em. They’ll tell you where the rare ones hide.',
    done: 'Good eye. You’ve earned a proper rod — my old Bamboo Classic. Treat her well.' },
  { id: 'q5', title: 'Hook, Line & Lunge', goal: { type: 'dodge', n: 3 }, reward: { essence: 120 },
    story: 'The big ones fight dirty. When you see that red flash, let off the reel and let ’em tire themselves out. Dodge three lunges for me.',
    done: 'Now you’re fishing! Most folks fight the lunge and snap their line.' },
  { id: 'q6', title: 'Under the Moon', goal: { type: 'secret', spot: 'sandbar' }, reward: { essence: 150, item: ['skins', 'midnight'] },
    story: 'Here’s a secret. When the moon’s up, the tide runs way out past the dock. Walk west after dark and see what turns up.',
    done: 'The Moonlit Sandbar! Haven’t been out there in years. Take this Midnight paint for your rod.' },
  { id: 'q7', title: 'The Collector', goal: { type: 'dex', n: 20 }, reward: { essence: 200, item: ['decor', 'castle'] },
    story: 'A real angler keeps a record. Get twenty different Goops in that GoopDex of yours.',
    done: 'Twenty! Your aquarium’s looking lonely, though — here’s a little castle for the tank.' },
  { id: 'q8', title: 'Frenzy!', goal: { type: 'frenzy', n: 3 }, reward: { essence: 150 },
    story: 'Sometimes the water boils with Goops jumping everywhere — a feeding frenzy. Catch three Goops in one before it settles.',
    done: 'Ha! Wild, isn’t it? The Essence flows when they’re hungry.' },
  { id: 'q9', title: 'Behind the Curtain', goal: { type: 'secret', spot: 'cave' }, reward: { essence: 200, item: ['bobbers', 'crystal'] },
    story: 'Past the waterfall, sunlight hits the cliff just right in the daytime. There’s a gap back there, I’d bet my boots on it.',
    done: 'A crystal cave! I knew it. Here — a float made from one of those crystals.' },
  { id: 'q10', title: 'Trophy Hunter', goal: { type: 'set', n: 1 }, reward: { essence: 250, item: ['decor', 'chest'] },
    story: 'Goops come in families. Catch every one in a collection and you’ll have a trophy worth bragging about.',
    done: 'Look at that trophy shine. Put this treasure chest in your tank to keep it company.' },
  { id: 'q11', title: 'Ghost Ship', goal: { type: 'secret', spot: 'wreck' }, reward: { essence: 300 },
    story: 'My old boat, the Gloopy Gale, went down past the Deep Drop. On stormy or foggy days the mast still shows…',
    done: 'You found her. Thank you, kid. The Goops have made her a fine home.' },
  { id: 'q12', title: 'Legends Stir', goal: { type: 'legendary', n: 2 }, reward: { essence: 400, item: ['skins', 'gold'] },
    story: 'There are Goops on this pond nobody believes in. Kings, drakes, things from the dark. Catch two Legendaries and they’ll believe you.',
    done: 'Two Legendaries! Paint your rod gold — you’ve earned it.' },
  { id: 'q13', title: 'The Sleeper of the Deep', goal: { type: 'goop', id: 'sleeper' }, reward: { essence: 1000, item: ['decor', 'statue'] },
    story: 'One last thing. Something ancient sleeps at the bottom of the Deep Drop. I’ve seen its eye once, at night. It took my boat. Go to the Deep Drop after dark and bring it up.',
    done: 'The Sleeper… you actually did it. Every angler on this pond will know your name. This statue is yours — and it still wakes on full-moon nights, if you want a rematch.' },
];

/** Aquarium decorations and backdrops, bought with Essence (some are quest rewards). */
export const DECOR = {
  coral: { name: 'Pink Coral', cost: 150, desc: 'A branching coral the Goops love to weave through.' },
  anchor: { name: 'Old Anchor', cost: 150, desc: 'Rusty, heavy and full of character.' },
  shrooms: { name: 'Glowshrooms', cost: 220, desc: 'A cluster of mushrooms that glow in the dark.' },
  crystals: { name: 'Crystal Cluster', cost: 350, desc: 'Sparkling crystals from the hidden cave.' },
  castle: { name: 'Sandcastle Keep', cost: 300, desc: 'Every tank needs a castle.' },
  chest: { name: 'Treasure Chest', cost: 400, desc: 'It pops open and burps bubbles now and then.' },
  ship: { name: 'Little Wreck', cost: 600, desc: 'A tiny model of the Gloopy Gale.' },
  throne: { name: 'Goop Throne', cost: 900, legends: 3, desc: 'A golden throne. Only for keepers of three Legendaries.' },
  statue: { name: 'Sleeper Statue', cost: 0, quest: true, desc: 'Awarded for waking the Sleeper of the Deep.' },
};
export const THEMES = {
  pond: { name: 'North Pond', cost: 0, top: '#1a7a9a', mid: '#0e4a66', bot: '#06243a', ray: '#bff0ff', sand: ['#c8b07a', '#8a7448'], plant: ['#14603a', '#4ac86a'], rock: '#3a5a6a' },
  sunset: { name: 'Sunset Shallows', cost: 300, top: '#ff9a6a', mid: '#a8406a', bot: '#2a1040', ray: '#ffd0a0', sand: ['#e0a070', '#8a5040'], plant: ['#6a2a4a', '#e0708a'], rock: '#5a3a5a' },
  moon: { name: 'Moonlit', cost: 300, top: '#2a4a8a', mid: '#12224a', bot: '#050a1a', ray: '#cfe0ff', sand: ['#9aa8c8', '#4a5470'], plant: ['#1a3a5a', '#6aa8d8'], rock: '#2a3a5a' },
  lava: { name: 'Magma Vent', cost: 450, top: '#8a2a1a', mid: '#3a0a0a', bot: '#120202', ray: '#ffb070', sand: ['#4a2a1a', '#1a0a06'], plant: ['#4a1a0a', '#e0602a'], rock: '#2a1410' },
  crystal: { name: 'Crystal Cave', cost: 450, top: '#5a3aa8', mid: '#2a1a5a', bot: '#0a0420', ray: '#ffe0a0', sand: ['#8a7ab8', '#3a2a5a'], plant: ['#3a2a7a', '#a88aff'], rock: '#3a2a6a' },
  abyss: { name: 'The Abyss', cost: 700, top: '#101a4a', mid: '#05082a', bot: '#000005', ray: '#a86aff', sand: ['#2a2040', '#0a0814'], plant: ['#1a1050', '#7a5aff'], rock: '#14122a' },
};
export const TANK_CAP = 12;          // Goops per tank
export const DECOR_SLOTS = 6;        // decorations per tank
export const TANK_COSTS = [0, 500, 1200, 2500];
const newTank = (n) => ({ name: n === 1 ? 'Main Tank' : `Tank ${n}`, theme: 'pond', decor: [], fish: [] });
/** Daily tip jar: visitors pay to see your tank. */
export function tankTips(dex) {
  let tip = 0;
  for (const [id, e] of Object.entries(dex)) {
    const g = GOOPS.find((x) => x.id === id);
    if (!g) continue;
    tip += 3 + RANK[g.rarity] * 2 + (e.shiny ? 15 : 0);
  }
  return Math.round(tip);
}



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
  rod: { name: 'Reel Gears', desc: 'Reel faster inside the safe zone (works with any rod).', cost: [120, 320, 700] },
  line: { name: 'Line Strength', desc: 'Wider safe zone, gentler on snaps.', cost: [150, 360, 750] },
  lure: { name: 'Sharp Hooks', desc: 'Faster bites and better odds at rare Goops.', cost: [100, 280, 650] },
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

// ---------- tackle box ----------
// Rods have their own look and handling; skins recolour any rod; bobbers and lines are cosmetic;
// lures are kept (not used up) and have three levels each. Everything is bought with Essence.

/** Rod stats: reel (catch speed ×), zone (safe-zone widening each side), force (Goop pull ×), lunge (lunge power ×),
 *  bite (wait ×), shiny (×), essence (×), taste/tasteMul (bite odds for a food), legend/epic (odds ×), when (weather for a bonus). */
export const RODS = {
  twig: { name: 'Willow Twig', cost: 0, dex: 0, style: 'wood', desc: 'A bendy starter rod. Honest and balanced.', stats: {} },
  bamboo: { name: 'Bamboo Classic', cost: 220, dex: 0, style: 'bamboo', desc: 'Light and springy: reels a bit faster with a wider safe zone.', stats: { reel: 1.08, zone: 0.02 } },
  glass: { name: 'Glass Slinger', cost: 420, dex: 3, style: 'glass', desc: 'Long, see-through casts land softly — bites come 15% sooner.', stats: { bite: 0.85, zone: 0.02 } },
  carbon: { name: 'Carbon Striker', cost: 750, dex: 8, style: 'carbon', desc: 'Very fast reeling, but a narrower safe zone. For steady hands.', stats: { reel: 1.35, zone: -0.03 } },
  oak: { name: 'Ironwood Hauler', cost: 750, dex: 8, style: 'oak', desc: 'Heavy and stubborn: Goops pull weaker and their lunges are halved. Reels slower.', stats: { reel: 0.92, force: 0.82, lunge: 0.5, zone: 0.03 } },
  coral: { name: 'Coral Wand', cost: 900, dex: 12, style: 'coral', desc: 'Sweet-toothed Goops can’t resist it (×1.6 bites). Reels a little faster.', stats: { taste: 'sweet', tasteMul: 1.6, reel: 1.1 } },
  ember: { name: 'Magma Pole', cost: 900, dex: 12, style: 'ember', desc: 'Warm to the touch: Ember Goops bite ×1.6 and pull 10% weaker.', stats: { taste: 'ember', tasteMul: 1.6, force: 0.9 } },
  storm: { name: 'Storm Caller', cost: 1300, dex: 18, style: 'storm', desc: 'In rain or storms, Goops pull 30% weaker and pay 30% more Essence.', stats: { when: ['rain', 'storm'], reel: 1.05 } },
  crystal: { name: 'Crystal Caster', cost: 1600, dex: 24, style: 'crystal', desc: 'Shimmers in the light: shiny chance ×1.6, faster reeling, wider zone.', stats: { shiny: 1.6, reel: 1.15, zone: 0.02 } },
  abyss: { name: 'Abyssal Reach', cost: 3000, dex: 40, style: 'abyss', desc: 'Forged in the Deep Drop. Legendaries ×1.8, Epics ×1.3, strong all-round.', stats: { legend: 1.8, epic: 1.3, reel: 1.2, zone: 0.03, lunge: 0.8 } },
};

/** Rod colourways: [dark, mid, light, highlight] for the shaft, grip colour, [hi, mid, lo] for the reel, tip glow. */
export const SKINS = {
  factory: { name: 'Factory Finish', cost: 0, desc: 'The rod’s own colours.' },
  slime: { name: 'Slime Time', cost: 150, pal: { shaft: ['#0c3a12', '#1f8d2c', '#59e04a', '#d9ff7a'], grip: '#2a1a0a', reel: ['#eaffd0', '#8df28a', '#14502e'], tip: '#c6ff5a' }, desc: 'Gooey lime green, the house colour.' },
  midnight: { name: 'Midnight', cost: 150, pal: { shaft: ['#05060f', '#1a1f3a', '#38407a', '#9aa8ff'], grip: '#101018', reel: ['#cfd8ff', '#4a5aa8', '#0a0f2a'], tip: '#9aa8ff' }, desc: 'Inky blue-black with a starlight tip.' },
  sunset: { name: 'Sunset Fade', cost: 200, pal: { shaft: ['#3a0a1a', '#c0306a', '#ff8a3a', '#ffe0a0'], grip: '#3a1a10', reel: ['#fff0c0', '#ff9a4a', '#7a1a2a'], tip: '#ffb070' }, desc: 'Dusk over the pond, in paint.' },
  bubblegum: { name: 'Bubblegum', cost: 200, pal: { shaft: ['#5a1040', '#e050a8', '#ff9ad8', '#fff0fa'], grip: '#4a1a3a', reel: ['#ffffff', '#ff7ac8', '#8a1a5a'], tip: '#ff9ad8' }, desc: 'Sweet pink. Koi love it (not really).' },
  frost: { name: 'Frostbite', cost: 250, pal: { shaft: ['#0a2a40', '#3a9ad8', '#a6f6ff', '#ffffff'], grip: '#1a3040', reel: ['#ffffff', '#7ad8ff', '#0c4a66'], tip: '#a6f6ff' }, desc: 'Icy blues with a frosted tip.' },
  drip: { name: 'Goop Drip', cost: 400, drips: true, pal: { shaft: ['#2a0f4a', '#8a4bf0', '#c58bff', '#f3d2ff'], grip: '#1a0833', reel: ['#f3d2ff', '#c58bff', '#3a1a6a'], tip: '#c6ff5a' }, desc: 'Purple, dripping with green goop.' },
  gold: { name: 'Gold Rush', cost: 600, pal: { shaft: ['#5a3a00', '#c8901a', '#ffd23a', '#fff6c0'], grip: '#3a2000', reel: ['#fffbe0', '#ffd23a', '#7a5000'], tip: '#fff27a' }, desc: 'Solid(ish) gold. Shows you mean business.' },
  galaxy: { name: 'Galaxy', cost: 900, anim: 'galaxy', pal: { shaft: ['#0a0418', '#3a1a7a', '#8a5aff', '#ffffff'], grip: '#0a0418', reel: ['#ffffff', '#8a5aff', '#1a0a3a'], tip: '#ffffff' }, desc: 'A swirl of stars that drifts along the rod.' },
  rainbow: { name: 'Prismatic', cost: 1200, anim: 'rainbow', pal: { shaft: ['#202020', '#ff4a4a', '#4affc8', '#ffffff'], grip: '#202020', reel: ['#ffffff', '#ff9aff', '#3a1a3a'], tip: '#ffffff' }, desc: 'Every colour at once, always moving.' },
};

export const BOBBERS = {
  classic: { name: 'Red & White', cost: 0, desc: 'The one your grandpa used.' },
  slime: { name: 'Slime Blob', cost: 120, desc: 'A wobbly green blob with googly eyes.' },
  star: { name: 'Starfloat', cost: 180, desc: 'A little golden star that twinkles.' },
  duck: { name: 'Rubber Duck', cost: 250, desc: 'Squeak. The Goops find it hilarious.' },
  eyeball: { name: 'Goop Eye', cost: 300, desc: 'It watches the water so you don’t have to.' },
  lantern: { name: 'Pond Lantern', cost: 400, desc: 'Glows warmly — easy to spot at night.' },
  crystal: { name: 'Crystal Float', cost: 600, desc: 'A faceted gem that sparkles.' },
  golden: { name: 'Golden Goop', cost: 900, desc: 'A tiny golden King Gloop. Pure flex.' },
};

export const LINES = {
  classic: { name: 'Clear Mono', cost: 0, color: '#eafff4', desc: 'Plain and nearly invisible.' },
  slime: { name: 'Neon Slime', cost: 80, color: '#8df28a', glow: true, desc: 'Glows lime green.' },
  pink: { name: 'Hot Pink', cost: 80, color: '#ff7ac8', glow: true, desc: 'Loud and proud.' },
  ember: { name: 'Ember Braid', cost: 120, color: '#ffb44a', glow: true, desc: 'Smoulders orange.' },
  gold: { name: 'Gold Thread', cost: 300, color: '#ffd23a', glow: true, desc: 'Fancy.' },
  rainbow: { name: 'Rainbow Line', cost: 500, color: 'rainbow', glow: true, desc: 'Cycles through every colour.' },
};

/** Lures are kept once bought and upgrade through three levels; `lv` values are per level. */
export const LURES = {
  none: { name: 'Plain Hook', cost: [], desc: 'No lure. Just a hook and hope.' },
  spinner: { name: 'Silver Spinner', cost: [120, 280, 550], desc: 'A flashing blade: bites come sooner.', lv: [0.85, 0.75, 0.65], fx: (v) => `Bites ${Math.round((1 - v) * 100)}% sooner` },
  jig: { name: 'Bounce Jig', cost: [150, 320, 600], desc: 'Jumpy Goops (pulse and dart fighters) chase it.', lv: [1.6, 2, 2.6], fx: (v) => `Pulse & dart Goops ×${v}` },
  crank: { name: 'Drift Crank', cost: [150, 320, 600], desc: 'Slow, wobbling swim for lazy Goops (steady, drift and sleepy).', lv: [1.5, 1.8, 2.2], fx: (v) => `Steady, drift & sleepy ×${v}` },
  spoon: { name: 'Shimmer Spoon', cost: [200, 420, 800], desc: 'Catches the sunlight: rare Goops by day and dawn.', lv: [1.3, 1.6, 2], fx: (v) => `Rare+ ×${v} at dawn & day` },
  glowjig: { name: 'Glow Jig', cost: [200, 420, 800], desc: 'Glows in the dark: rare Goops at dusk and night.', lv: [1.3, 1.6, 2], fx: (v) => `Rare+ ×${v} at dusk & night` },
  trophy: { name: 'Trophy Plug', cost: [250, 500, 900], desc: 'Only the big ones bother. Bigger catches, bonus Essence on records.', lv: [1.6, 1.3, 1.05], fx: (v) => `Bigger catches (size curve ${v}) · records +50% Essence` },
  clover: { name: 'Lucky Clover', cost: [300, 650, 1200], desc: 'Four leaves, four times the luck (almost).', lv: [1.4, 1.8, 2.3], fx: (v) => `Shiny chance ×${v}` },
  feather: { name: 'Feather Fly', cost: [180, 380, 700], desc: 'So gentle that hooked Goops barely fight.', lv: [0.9, 0.84, 0.78], fx: (v) => `Goops pull ${Math.round((1 - v) * 100)}% weaker` },
  diver: { name: 'Deep Diver', cost: [350, 700, 1300], desc: 'Dives deep for Epics and Legendaries, but bites take longer.', lv: [1.4, 1.8, 2.4], fx: (v) => `Epic+ ×${v}, bites 20% slower` },
};

/** One-off things to spend Essence on. */
export const CHARMS = {
  hourglass: { name: 'Hourglass', icon: '⏳', cost: 40, desc: 'Skip ahead to the next time of day.' },
  totem: { name: 'Weather Totem', icon: '🌦️', cost: 70, desc: 'Call the weather you want, right now.' },
  flare: { name: 'Frenzy Flare', icon: '🎆', cost: 120, desc: 'Start a feeding frenzy where you stand.' },
  tip: { name: 'Wiggs’ Tip', icon: '💬', cost: 50, desc: 'Old Wiggs tells you where and when an unknown Goop bites.' },
};
export const FINDER_COST = 600;
/** Cost to train your buddy to the next level; each level adds +4% Essence and makes it bigger. */
export const BUDDY_TRAIN = [120, 300, 600, 1000];
export const buddyBonus = (lv = 0) => BUDDY_BONUS + 0.04 * lv;

/** Combined effect of the equipped rod and lure in the given conditions. */
export function tackleMods(equip = {}, owned = {}, ctx = {}) {
  const m = { reel: 1, zone: 0, force: 1, lunge: 1, bite: 1, shiny: 1, essence: 1, sizeExp: 2, recordMul: 1, taste: {}, pattern: {}, rare: 1, epic: 1, legend: 1 };
  const r = RODS[equip.rod]?.stats || {};
  if (r.reel) m.reel *= r.reel;
  if (r.zone) m.zone += r.zone;
  if (r.force) m.force *= r.force;
  if (r.lunge) m.lunge *= r.lunge;
  if (r.bite) m.bite *= r.bite;
  if (r.shiny) m.shiny *= r.shiny;
  if (r.taste) m.taste[r.taste] = r.tasteMul;
  if (r.legend) m.legend *= r.legend;
  if (r.epic) m.epic *= r.epic;
  if (r.when && r.when.includes(ctx.weather)) { m.force *= 0.7; m.essence *= 1.3; }
  const id = equip.lure, lvl = owned.lures?.[id] || 0;
  if (id && id !== 'none' && lvl > 0) {
    const v = LURES[id].lv[lvl - 1];
    const day = ['Dawn', 'Day'].includes(ctx.time);
    if (id === 'spinner') m.bite *= v;
    else if (id === 'jig') { m.pattern.pulse = v; m.pattern.dart = v; }
    else if (id === 'crank') { m.pattern.steady = v; m.pattern.drift = v; m.pattern.sleepy = v; }
    else if (id === 'spoon' && day) m.rare *= v;
    else if (id === 'glowjig' && !day) m.rare *= v;
    else if (id === 'trophy') { m.sizeExp = v; m.recordMul = 1.5; }
    else if (id === 'clover') m.shiny *= v;
    else if (id === 'feather') m.force *= v;
    else if (id === 'diver') { m.epic *= v; m.legend *= v; m.bite *= 1.2; }
  }
  return m;
}

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
export function encounterPool({ spot = SPOT_BY.dock, weather = 'clear', time = 'Day', lure = 0, bait = 'worm', event = {}, mods = null } = {}) {
  const b = BAITS[bait] || BAITS.worm;
  const ids = new Set(spot.goops);
  if (event.visitor && event.visitor.spot === spot.id) ids.add(event.visitor.goop);
  return GOOPS.filter((g) => ids.has(g.id) && conditionsMet(g, weather, time) && (!g.quest || event.sleeper)).map((g) => {
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
    if (mods) {
      weight *= (mods.taste[g.taste] || 1) * (mods.pattern[g.pattern] || 1);
      if (RANK[g.rarity] >= 2) weight *= mods.rare;
      if (RANK[g.rarity] === 3) weight *= mods.epic;
      if (RANK[g.rarity] === 4) weight *= mods.legend;
    }
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
/** Rare-or-better Goops (and wild ones) lunge: a telegraphed surge you dodge by easing off. */
export const lunges = (goop) => RANK[goop.rarity] >= 2 || goop.pattern === 'wild';

/**
 * Signature moves: every fighting style has its own mid-fight challenge.
 *  swerve  (dart)   — it bolts left or right: steer the same way before the timer runs out.
 *  tug     (steady) — tug of war: tap REEL fast to drag the rope to your side.
 *  fakeout (sleepy) — it goes still: hands off the reel, then reel the instant it wakes.
 *  rhythm  (pulse)  — it tugs in beats: tap REEL on each beat.
 *  current (drift)  — the safe zone drifts: keep the needle inside it.
 *  thrash  (wild)   — a quick string of steers and taps: follow every one.
 */
export const SIGNATURE = { dart: 'swerve', steady: 'tug', sleepy: 'fakeout', pulse: 'rhythm', drift: 'current', wild: 'thrash' };
export const MOVE_INFO = {
  swerve: { name: 'Swerve', how: 'Steer the way it darts' },
  tug: { name: 'Tug of War', how: 'Tap REEL as fast as you can' },
  fakeout: { name: 'Fake-out', how: 'Let go… reel the moment it wakes' },
  rhythm: { name: 'Rhythm', how: 'Tap REEL on every beat' },
  current: { name: 'Current', how: 'Keep the needle in the moving zone' },
  thrash: { name: 'Thrash', how: 'Follow every arrow and tap' },
};
/** Epics fight in two stages and Legendaries in three, with a breather between. */
export const stagesFor = (goop) => (goop.rarity === 'Legendary' ? 3 : goop.rarity === 'Epic' ? 2 : 1);
const MOVE_GAP = [7, 6, 5, 4.4, 3.8]; // seconds between moves by rarity
export const BREAK_TIME = 1.8;
const PACE = [1, 0.95, 0.85, 0.7, 0.58]; // big Goops take longer to reel in

export function makeFight(goop, gear = {}, env = {}) {
  const g = gearStats(gear);
  const rng = env.rng || Math.random;
  const rank = RANK[goop.rarity];
  return {
    goop, progress: 0, stamina: goop.stamina, tension: 0.5, phase: 0, elapsed: 0, caught: false, escaped: false,
    safeLo: g.safeLo - (env.zone ?? 0), safeHi: g.safeHi + (env.zone ?? 0), reelRate: g.reelRate * (env.reel ?? 1) * PACE[rank], snapGuard: g.snapGuard,
    forceMul: (env.forceMul ?? 1) * (goop.force ?? 1),
    streak: 0, combo: 1, best: 1,
    rng, nextLunge: lunges(goop) ? 3.2 + rng() * 2.4 : null, warn: false,
    lungePower: (0.3 + 0.05 * rank) * (env.lunge ?? 1), log: [],
    rank, move: null, nextMove: (env.moves === false ? Infinity : 2.2 + rng() * 1.4), moveCount: 0, movesWon: 0,
    stages: stagesFor(goop), stage: 1, breakT: 0, zoneShift: 0,
  };
}

const MOVE_WIN = {
  swerve: 'Nice steer! You cut it off.', tug: 'You won the tug of war!', fakeout: 'Caught it waking up!',
  rhythm: 'Right on the beat!', current: 'You rode the current!', thrash: 'You matched every thrash!',
};
const MOVE_FAIL = {
  wrong: 'Wrong way! It got some line back.', slow: 'Too slow — it pulled away.', pulled: 'It out-pulled you!', time: 'It held on through the tug.',
  eager: 'Too eager! You yanked it awake.', beats: 'Off the beat — it slipped some line.', drift: 'You lost the current.',
};
export const comboFor = (streak) => 1 + Math.min(4, Math.floor(streak / 1.2)) * 0.15;

const clamp01 = (v) => Math.max(0, Math.min(1, v));

/** Begin a signature move. `type` defaults to the Goop's own; final stages mix in a second one. */
export function startMove(fight, type) {
  const rng = fight.rng || Math.random, rank = fight.rank;
  let t = type || SIGNATURE[fight.goop.pattern] || 'swerve';
  if (!type && fight.stages > 1 && fight.stage === fight.stages && fight.moveCount % 2 === 1) {
    const others = Object.values(SIGNATURE).filter((m) => m !== t);
    t = others[Math.floor(rng() * others.length) % others.length];
  }
  const m = { type: t, t: 0 };
  if (t === 'swerve') { m.dir = rng() < 0.5 ? -1 : 1; m.window = Math.max(0.75, 1.25 - 0.1 * rank); }
  else if (t === 'tug') { m.pos = 0; m.dur = 3.6; m.pull = (0.28 + 0.06 * rank) * Math.min(1.3, fight.forceMul ?? 1); m.push = 0.14; }
  else if (t === 'fakeout') { m.still = 1 + rng() * 1.3; m.tell = 0.4; m.window = Math.max(0.42, 0.62 - 0.04 * rank); m.state = 'still'; }
  else if (t === 'rhythm') { m.n = 4 + Math.min(2, Math.floor(rank / 2)); m.gap = Math.max(0.5, 0.66 - 0.03 * rank); m.lead = 0.9; m.judged = []; m.hits = 0; m.win = 0.17; }
  else if (t === 'current') { m.dur = 3.6; m.inZone = 0; m.speed = 1.5 + 0.2 * rank; m.amp = 0.16 + 0.02 * rank; }
  else if (t === 'thrash') {
    const n = 3 + Math.min(2, Math.floor(rank / 2));
    m.steps = Array.from({ length: n }, () => ['L', 'R', 'T'][Math.floor(rng() * 3) % 3]);
    m.idx = 0; m.stepT = 0; m.window = Math.max(0.7, 1.05 - 0.07 * rank);
  }
  fight.move = m;
  fight.warn = false;
  fight.log.push({ type: 'moveStart', move: t, dir: m.dir });
  return m;
}

function endMove(fight, won, extra = {}) {
  const m = fight.move;
  const scale = 1 + fight.rank * 0.1;
  const gain = { swerve: 0.06, tug: 0.12, fakeout: 0.1, rhythm: 0.04, current: 0.08, thrash: 0.12 }[m.type] * (extra.mul ?? 1);
  if (won) {
    fight.progress = Math.min(fight.stageCap ?? 1, fight.progress + gain);
    fight.tension = 0.55;
    fight.stamina = Math.max(0.05, fight.stamina - 0.04 * scale);
    fight.movesWon += 1;
  } else {
    fight.progress = Math.max(0, fight.progress - 0.06);
    fight.tension = clamp01(fight.tension + 0.25);
    fight.streak = 0;
    fight.stamina += 0.04 * scale;
  }
  fight.log.push({ type: won ? 'moveWin' : 'moveFail', move: m.type, why: extra.why });
  fight.move = null;
  fight.moveCount += 1;
  fight.zoneShift = 0;
  const rng = fight.rng || Math.random;
  fight.nextMove = MOVE_GAP[fight.rank] * (fight.stage === fight.stages && fight.stages > 1 ? 0.75 : 1) + rng() * 2;
}

/** Run the active move for one step. Returns true when the core tension game is paused. */
function tickMove(fight, input, d) {
  const m = fight.move;
  m.t += d;
  const tap = !!input.tap, steer = input.steer || 0, reeling = !!input.reel;
  switch (m.type) {
    case 'swerve':
      if (steer === m.dir) endMove(fight, true);
      else if (steer === -m.dir) endMove(fight, false, { why: 'wrong' });
      else if (m.t > m.window) endMove(fight, false, { why: 'slow' });
      return false;
    case 'tug':
      if (tap) m.pos += m.push;
      m.pos -= m.pull * d;
      fight.tension = 0.62 + Math.sin(m.t * 18) * 0.04;
      if (m.pos >= 1) endMove(fight, true);
      else if (m.pos <= -1) endMove(fight, false, { why: 'pulled' });
      else if (m.t > m.dur) endMove(fight, m.pos > 0, { why: 'time' });
      return true;
    case 'fakeout':
      if (m.state === 'still') {
        fight.tell = m.t >= m.still - m.tell;
        // reeling into a sleeping Goop yanks the hook: hands off until it wakes
        if (m.t > 0.35 && (tap || reeling)) { fight.tell = false; endMove(fight, false, { why: 'eager' }); return false; }
        if (m.t >= m.still) { m.state = 'surge'; m.surgeT = 0; fight.tell = false; fight.tension = clamp01(fight.tension + 0.18 * (fight.forceMul ?? 1)); fight.log.push({ type: 'surge' }); }
        return false;
      }
      m.surgeT += d;
      if (tap || reeling) endMove(fight, true);
      else if (m.surgeT > m.window) endMove(fight, false, { why: 'slow' });
      return false;
    case 'rhythm': {
      const beatAt = (i) => m.lead + i * m.gap;
      fight.tension = 0.55 + Math.sin(m.t * 6) * 0.03;
      for (let i = 0; i < m.n; i++) {
        if (m.judged[i] == null && m.t >= beatAt(i) && !m['cue' + i]) { m['cue' + i] = true; fight.log.push({ type: 'beat', i }); }
      }
      if (tap) {
        let best = -1, bd = Infinity;
        for (let i = 0; i < m.n; i++) if (m.judged[i] == null) { const dd = Math.abs(m.t - beatAt(i)); if (dd < bd) { bd = dd; best = i; } }
        if (best >= 0 && bd <= m.win) { m.judged[best] = true; m.hits += 1; fight.log.push({ type: 'beatHit', i: best }); }
        else { m.extra = (m.extra || 0) + 1; fight.log.push({ type: 'beatMiss', i: -1 }); } // mashing doesn't work
      }
      for (let i = 0; i < m.n; i++) if (m.judged[i] == null && m.t > beatAt(i) + m.win) { m.judged[i] = false; fight.log.push({ type: 'beatMiss', i }); }
      if (m.t > beatAt(m.n - 1) + m.win + 0.05) endMove(fight, m.hits - (m.extra || 0) >= Math.ceil(m.n * 0.75), { why: 'beats', mul: m.hits / m.n + 0.25 });
      return true;
    }
    case 'current': {
      fight.zoneShift = Math.sin(m.t * m.speed) * m.amp;
      const lo = (fight.safeLo ?? 0.38) + fight.zoneShift, hi = (fight.safeHi ?? 0.78) + fight.zoneShift;
      if (fight.tension >= lo && fight.tension <= hi) m.inZone += d;
      if (m.t >= m.dur) endMove(fight, m.inZone / m.dur >= 0.6, { why: 'drift' });
      return false;
    }
    case 'thrash': {
      m.stepT += d;
      fight.tension = 0.6 + Math.sin(m.t * 14) * 0.05;
      const want = m.steps[m.idx];
      const ok = (want === 'T' && tap) || (want === 'L' && steer === -1) || (want === 'R' && steer === 1);
      const wrong = (want === 'L' && steer === 1) || (want === 'R' && steer === -1);
      if (ok) { m.idx += 1; m.stepT = 0; fight.log.push({ type: 'step', i: m.idx - 1 }); if (m.idx >= m.steps.length) endMove(fight, true); }
      else if (wrong) endMove(fight, false, { why: 'wrong' });
      else if (m.stepT > m.window) endMove(fight, false, { why: 'slow' });
      return true;
    }
    default: fight.move = null; return false;
  }
}

/**
 * One step of a fight. input: { reel: held, tap: fresh press this step, steer: -1 | 0 | 1 (fresh steer this step) }.
 */
export function tickFight(fight, input, dt) {
  if (!fight || fight.caught || fight.escaped) return fight;
  const d = Math.max(0, Math.min(dt, 0.08));
  fight.elapsed += d;
  fight.phase += d;
  const reeling = !!input.reel;

  // between stages the Goop breaks away and catches its breath — so do you
  if (fight.breakT > 0) {
    fight.breakT -= d;
    fight.tension += (0.5 - fight.tension) * Math.min(1, d * 3);
    if (fight.breakT <= 0) {
      fight.stage += 1;
      fight.forceMul = (fight.forceMul ?? 1) * 1.06;
      fight.stamina = Math.min(fight.goop.stamina, fight.stamina + fight.goop.stamina * 0.2);
      fight.stageCap = fight.stage < fight.stages ? fight.stage / fight.stages : 1;
      fight.nextMove = 1.2;
      fight.log.push({ type: 'stage', stage: fight.stage, of: fight.stages });
    }
    return fight;
  }
  if (fight.stageCap == null) fight.stageCap = fight.stages > 1 ? 1 / fight.stages : 1;

  // signature moves
  let paused = false;
  if (fight.move) paused = tickMove(fight, input, d);
  else {
    fight.nextMove -= d;
    if (fight.nextMove <= 0 && !(fight.nextLunge != null && fight.nextLunge < LUNGE_WARN + 0.4)) { startMove(fight); paused = tickMove(fight, input, 0); }
  }
  if (fight.move && fight.move.type === 'swerve') fight.swing = fight.move.dir;
  else fight.swing = 0;

  if (!paused) {
    // Reeling winds tension up, releasing lets it fall; the Goop pulls against you (but not while it plays dead).
    const still = fight.move?.type === 'fakeout' && fight.move.state === 'still';
    const pull = still ? -0.1 : pullForce(fight.goop.pattern, fight.phase) * (fight.forceMul ?? 1);
    fight.tension += (reeling ? 0.62 : -0.55) * d + pull * d;

    // Lunges: a warning, then a surge. Easing off when it hits dodges most of it.
    if (fight.nextLunge != null && !fight.move) {
      fight.nextLunge -= d;
      fight.warn = fight.nextLunge > 0 && fight.nextLunge <= LUNGE_WARN;
      if (fight.nextLunge <= 0) {
        const dodged = !reeling;
        fight.tension += fight.lungePower * (dodged ? 0.25 : 1) * (fight.forceMul ?? 1);
        if (dodged) fight.progress = Math.min(fight.stageCap, fight.progress + 0.04);
        else { fight.progress = Math.max(0, fight.progress - 0.05); fight.streak = 0; }
        fight.log.push(dodged ? 'dodge' : 'lunge');
        fight.nextLunge = 3.4 + (fight.rng || Math.random)() * 2.8;
        fight.warn = false;
      }
    } else if (fight.move) fight.warn = false;
    fight.tension = clamp01(fight.tension);

    const lo = (fight.safeLo ?? 0.38) + (fight.zoneShift || 0), hi = (fight.safeHi ?? 0.78) + (fight.zoneShift || 0);
    const safe = fight.tension >= lo && fight.tension <= hi;
    const rate = fight.reelRate ?? 1, guard = fight.snapGuard ?? 1;

    // Staying in the zone while reeling builds a streak that speeds up the catch.
    if (safe && reeling) fight.streak = (fight.streak || 0) + d;
    else if (!safe && !still) fight.streak = 0;
    const combo = comboFor(fight.streak || 0);
    if (combo > (fight.combo || 1)) fight.log.push('combo');
    fight.combo = combo;
    fight.best = Math.max(fight.best || 1, combo);

    if (!still) {
      if (safe && reeling) fight.progress += d * 0.3 * rate * combo;
      else if (fight.tension > 0.88 || fight.tension < 0.15) fight.progress = Math.max(0, fight.progress - d * 0.1);
      else if (!reeling) fight.progress = Math.max(0, fight.progress - d * 0.02);

      // The Goop tires when you work it in the zone; snapping tension or slack lets it recover/flee.
      const tire = PACE[fight.rank ?? 0]; // long fights tire the Goop out more slowly too
      if (fight.tension > 0.95) fight.stamina -= d * 0.6 * guard * (0.5 + 0.5 * tire);
      else if (safe) fight.stamina -= d * (reeling ? 0.07 : 0.04) * tire;
      else fight.stamina -= d * 0.08 * tire;
    }
  }

  fight.progress = Math.min(fight.stageCap, fight.progress);
  // reaching the end of a stage starts the break (the last stage lands the Goop)
  if (fight.progress >= fight.stageCap && fight.stage < fight.stages) {
    fight.move = null; fight.zoneShift = 0; fight.warn = false;
    fight.breakT = BREAK_TIME;
    fight.log.push({ type: 'breakaway', stage: fight.stage + 1, of: fight.stages });
    return fight;
  }
  if (fight.progress >= 1) fight.caught = true;
  else if (fight.stamina <= 0) fight.escaped = true;
  if (fight.caught || fight.escaped) { fight.move = null; fight.zoneShift = 0; fight.warn = false; }
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
      gear: { rod: 0, line: 0, lure: 0 }, stats: { caught: 0, escaped: 0, missed: 0, shiny: 0, perfect: 0, dodges: 0, bounties: 0, moves: 0 },
      bait: 'worm', baits: { sugar: 3, mud: 3 }, buddy: null, buddyLv: 0, sets: [], tips: [], finder: false,
      owned: { rods: ['twig'], skins: ['factory'], bobbers: ['classic'], lines: ['classic'], lures: {} },
      equip: { rod: 'twig', skin: 'factory', bobber: 'classic', line: 'classic', lure: 'none' },
      quest: { i: 0, have: 0 }, tank: { tanks: [newTank(1)], decor: [], themes: ['pond'], tipDay: 0 },
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
    // tackle box
    const o = p.owned && typeof p.owned === 'object' ? p.owned : {};
    const keep = (v, table, base) => [...new Set([base, ...(Array.isArray(v) ? v.filter((k) => table[k]) : [])])];
    s.owned = { rods: keep(o.rods, RODS, 'twig'), skins: keep(o.skins, SKINS, 'factory'), bobbers: keep(o.bobbers, BOBBERS, 'classic'), lines: keep(o.lines, LINES, 'classic'), lures: {} };
    if (o.lures && typeof o.lures === 'object') for (const [k, v] of Object.entries(o.lures)) if (LURES[k] && k !== 'none') { const n = Math.min(3, Math.floor(num(v, 0))); if (n) s.owned.lures[k] = n; }
    const e = p.equip && typeof p.equip === 'object' ? p.equip : {};
    s.equip = {
      rod: s.owned.rods.includes(e.rod) ? e.rod : 'twig', skin: s.owned.skins.includes(e.skin) ? e.skin : 'factory',
      bobber: s.owned.bobbers.includes(e.bobber) ? e.bobber : 'classic', line: s.owned.lines.includes(e.line) ? e.line : 'classic',
      lure: s.owned.lures[e.lure] ? e.lure : 'none',
    };
    s.finder = p.finder === true;
    s.buddyLv = Math.min(BUDDY_TRAIN.length, Math.floor(num(p.buddyLv, 0)));
    s.tips = list(p.tips, (id) => ids.has(id));
    const q = p.quest && typeof p.quest === 'object' ? p.quest : {};
    s.quest = { i: Math.min(QUESTS.length, Math.floor(num(q.i, 0))), have: Math.floor(num(q.have, 0)) };
    const tk = p.tank && typeof p.tank === 'object' ? p.tank : {};
    const themes = [...new Set(['pond', ...(Array.isArray(tk.themes) ? tk.themes.filter((k) => THEMES[k]) : [])])];
    const owned = list(tk.decor, (k) => !!DECOR[k]);
    let tanks = Array.isArray(tk.tanks) ? tk.tanks.filter((t) => t && typeof t === 'object').slice(0, TANK_COSTS.length) : null;
    if (!tanks || !tanks.length) {
      // older saves had one tank: everything in it, residents up to the cap
      tanks = [{ name: 'Main Tank', theme: tk.theme, decor: owned.slice(0, DECOR_SLOTS), fish: Object.keys(s.dex).slice(0, TANK_CAP) }];
    }
    const used = new Set(), placed = new Set();
    s.tank = {
      decor: owned, themes, tipDay: Math.floor(num(tk.tipDay, 0)),
      tanks: tanks.map((t, i) => ({
        name: typeof t.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 18) : (i ? `Tank ${i + 1}` : 'Main Tank'),
        theme: themes.includes(t.theme) ? t.theme : 'pond',
        decor: list(t.decor, (k) => owned.includes(k) && !placed.has(k)).slice(0, DECOR_SLOTS).map((k) => (placed.add(k), k)),
        fish: list(t.fish, (id) => !!s.dex[id] && !used.has(id)).slice(0, TANK_CAP).map((id) => (used.add(id), id)),
      })),
    };
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
    this.questCheck();
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
  get event() {
    const questing = this.quest?.goal.type === 'goop' && this.quest.goal.id === 'sleeper';
    const woken = this.state.quest.i > QUESTS.findIndex((q) => q.goal.id === 'sleeper');
    return { frenzy: this.state.frenzy, visitor: this.state.visitor, fullMoon: this.fullMoon, sleeper: questing || (woken && this.fullMoon) };
  }

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
      this.questCheck();
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
    this.questCheck();
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
    const mods = this.mods();
    const pool = zonePool(z, { weather: s.weather, time: this.timeOfDay, lure: s.gear.lure, bait, event: ev, mods });
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
    wait *= mods.bite;
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
        const m = this.mods();
        this.fight = makeFight(this.goop, this.state.gear, { forceMul: this.weather.forceMul * m.force, rng: this.rng, reel: m.reel, zone: m.zone, lunge: m.lunge });
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
      tickFight(this.fight, { reel, tap: pressed, steer: input.steer || 0 }, step);
      for (const e of this.fight.log.splice(0)) {
        if (typeof e === 'object') {
          if (e.type === 'moveStart') this.message = ''; // the move prompt says it all
          else if (e.type === 'moveWin') { this.message = MOVE_WIN[e.move]; this.state.stats.moves = (this.state.stats.moves || 0) + 1; }
          else if (e.type === 'moveFail') this.message = MOVE_FAIL[e.why] || 'It got the better of you that time.';
          else if (e.type === 'breakaway') this.message = `It breaks away! Stage ${e.stage} of ${e.of} coming…`;
          else if (e.type === 'stage') this.message = `Stage ${e.stage}: ${this.goop.name} fights harder!`;
          this.emit(e.type, { ...e, combo: this.fight.combo });
          continue;
        }
        if (e === 'dodge') { this.state.stats.dodges += 1; this.message = 'Dodged the lunge! Nice.'; this.questTick('dodge'); }
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
    const mods = this.mods(ctx);
    const size = Math.round((lo + (hi - lo) * this.rng() ** mods.sizeExp) * 10) / 10; // big ones are rare
    let odds = SHINY_ODDS;
    if (ctx.bait === 'golden') odds *= 2;
    if (this.fullMoon && ctx.time === 'Night') odds *= 2;
    odds *= mods.shiny;
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
    if (s.buddy) mul *= 1 + buddyBonus(s.buddyLv);
    mul *= mods.essence;
    if (record && !(prev.count === 0)) mul *= mods.recordMul;
    const reward = Math.round(g.essence * mul);
    this.lastReward = reward;
    s.essence += reward;
    s.caughtToday += 1;
    s.stats.caught += 1;
    if (shiny) s.stats.shiny += 1;
    const firstTime = prev.count === 0;
    this.lastCatch = { goop: id, reward, firstTime, size, record: record && !firstTime, shiny, time, combo: this.fight.best || 1, perfect: !!this.fight.perfect };
    this.message = `${shiny ? '✦ Shiny ' : ''}${g.name} caught! +${reward} Essence`;
    if (firstTime) this.lastCatch.tank = this.houseGoop(id);
    this.emit('catch', this.lastCatch);
    this.questTick('catch');
    if (ctx.bait && ctx.bait !== 'worm') this.questTick('bait');
    if (ctx.frenzy) this.questTick('frenzy');
    if (g.rarity === 'Legendary') this.questTick('legendary');
    this.questTick('goop', id);

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
      this.questTick('set');
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
    this.questCheck();
    this.saveStore.save(this.state);
    return true;
  }

  /** Has the player learned where/when a Goop bites (caught it or read its note)? */
  knows(goopId) {
    return !!this.state.dex[goopId] || this.state.tips.includes(goopId) || this.state.notes.some((id) => NOTES.find((n) => n.id === id)?.reveals === goopId);
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
    this.message = g ? `${g.name} is your buddy now! +${Math.round(buddyBonus(this.state.buddyLv) * 100)}% Essence` : 'Your buddy heads home for a nap.';
    this.emit('buddy', { goop: id });
    this.saveStore.save(this.state);
    return true;
  }

  // ----- tackle box -----

  /** Rod + lure effects for the current (or given) conditions. */
  mods(ctx = { weather: this.state.weather, time: this.timeOfDay }) { return tackleMods(this.state.equip, this.state.owned, ctx); }

  /** Buy (if needed) and equip a rod, skin, bobber or line. kind: 'rods' | 'skins' | 'bobbers' | 'lines'. */
  buyTackle(kind, id) {
    const table = { rods: RODS, skins: SKINS, bobbers: BOBBERS, lines: LINES }[kind];
    const item = table?.[id];
    const s = this.state;
    if (!item || s.owned[kind].includes(id)) return false;
    if ((item.dex || 0) > this.dexCount || s.essence < item.cost) return false;
    s.essence -= item.cost;
    s.owned[kind].push(id);
    this.message = `Bought ${item.name}!`;
    this.emit('tackle', { kind, id, bought: true });
    this.equipTackle(kind, id, true);
    return true;
  }

  equipTackle(kind, id, quiet = false) {
    const slot = { rods: 'rod', skins: 'skin', bobbers: 'bobber', lines: 'line' }[kind];
    if (!slot || !this.state.owned[kind]?.includes(id)) return false;
    this.state.equip[slot] = id;
    if (!quiet) this.emit('tackle', { kind, id });
    this.saveStore.save(this.state);
    return true;
  }

  lureCost(id) {
    const l = LURES[id];
    const lv = this.state.owned.lures[id] || 0;
    return l && id !== 'none' && lv < l.cost.length ? l.cost[lv] : null;
  }

  /** Buy a lure, or upgrade one you have to its next level. Equips it. */
  buyLure(id) {
    const cost = this.lureCost(id);
    if (cost == null || this.state.essence < cost) return false;
    this.state.essence -= cost;
    const lv = (this.state.owned.lures[id] || 0) + 1;
    this.state.owned.lures[id] = lv;
    this.state.equip.lure = id;
    this.message = lv === 1 ? `Bought the ${LURES[id].name}!` : `${LURES[id].name} upgraded to level ${lv}!`;
    this.emit('lure', { id, lv });
    this.saveStore.save(this.state);
    return true;
  }

  equipLure(id) {
    if (id !== 'none' && !this.state.owned.lures[id]) return false;
    this.state.equip.lure = id;
    this.emit('lure', { id, lv: this.state.owned.lures[id] || 0, equip: true });
    this.saveStore.save(this.state);
    return true;
  }

  /** Spend Essence on a one-off charm. `arg` is the weather for the totem. */
  useCharm(id, arg) {
    const c = CHARMS[id];
    const s = this.state;
    if (!c || this.busy || s.essence < c.cost) return false;
    if (id === 'hourglass') {
      s.timeIndex = (s.timeIndex + 1) % TIMES.length;
      if (s.timeIndex === 0) { s.day += 1; s.caughtToday = 0; }
      this.message = `⏳ Time flies… it’s ${this.timeOfDay.toLowerCase()} now.`;
      this.emit('clock', { time: this.timeOfDay, weather: s.weather, day: s.day, frenzy: s.frenzy });
      if (s.timeIndex === 0) this.ensureDaily();
    } else if (id === 'totem') {
      if (!WEATHER[arg] || arg === s.weather) return false;
      s.weather = arg;
      this.message = `🌦️ The totem hums… ${WEATHER[arg].label.toLowerCase()} rolls in.`;
      this.emit('clock', { time: this.timeOfDay, weather: s.weather, day: s.day, frenzy: s.frenzy });
    } else if (id === 'flare') {
      const spot = this.zone().spot.id;
      if (s.frenzy === spot) return false;
      s.frenzy = spot;
      this.message = `🎆 A frenzy breaks out at ${SPOT_BY[spot].name}!`;
      this.emit('frenzy', { spot, flare: true });
    } else if (id === 'tip') {
      const unknown = GOOPS.filter((g) => !this.knows(g.id));
      if (!unknown.length) return false;
      const reachable = unknown.filter((g) => g.spots.some((sp) => this.spotUnlocked(sp)));
      const pool = reachable.length ? reachable : unknown;
      const g = pool[Math.floor(this.rng() * pool.length) % pool.length];
      s.tips.push(g.id);
      if (!s.seen.includes(g.id)) s.seen.push(g.id);
      this.message = `💬 Wiggs: “${g.name}? ${conditionText(g)}.”`;
      this.emit('tip', { goop: g.id });
    }
    s.essence -= c.cost;
    this.emit('charm', { id });
    this.saveStore.save(s);
    return true;
  }

  buyFinder() {
    if (this.state.finder || this.state.essence < FINDER_COST) return false;
    this.state.essence -= FINDER_COST;
    this.state.finder = true;
    this.message = 'Fish Finder installed! It shows what’s biting wherever you stand.';
    this.emit('finder');
    this.saveStore.save(this.state);
    return true;
  }

  /** What is likely to bite where you stand right now: [{ id, chance }], best first. */
  forecast(limit = 5) {
    const s = this.state;
    const bait = s.bait === 'worm' || s.baits[s.bait] > 0 ? s.bait : 'worm';
    const pool = zonePool(this.zone(), { weather: s.weather, time: this.timeOfDay, lure: s.gear.lure, bait, event: this.event, mods: this.mods() });
    const total = pool.reduce((a, g) => a + g.weight, 0) || 1;
    return pool.map((g) => ({ id: g.id, chance: g.weight / total })).sort((a, b) => b.chance - a.chance).slice(0, limit);
  }

  trainCost() { const lv = this.state.buddyLv; return this.state.buddy && lv < BUDDY_TRAIN.length ? BUDDY_TRAIN[lv] : null; }

  trainBuddy() {
    const cost = this.trainCost();
    if (cost == null || this.state.essence < cost) return false;
    this.state.essence -= cost;
    this.state.buddyLv += 1;
    this.message = `Your buddy grew! Buddy level ${this.state.buddyLv + 1} · +${Math.round(buddyBonus(this.state.buddyLv) * 100)}% Essence`;
    this.emit('buddyTrain', { lv: this.state.buddyLv });
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

  // ----- quests -----

  get quest() { return QUESTS[this.state.quest.i] || null; }

  /** Progress toward the current quest: { have, need, ready }. */
  questProgress() {
    const q = this.quest;
    if (!q) return { have: 0, need: 0, ready: false };
    const s = this.state, goal = q.goal;
    let have = s.quest.have, need = goal.n || 1;
    if (goal.type === 'discover' || goal.type === 'secret') have = s.discovered.includes(goal.spot) ? 1 : 0;
    else if (goal.type === 'notes') have = s.notes.length;
    else if (goal.type === 'dex') have = this.dexCount;
    else if (goal.type === 'set') have = s.sets.length ? 1 : have;
    return { have: Math.min(have, need), need, ready: have >= need };
  }

  /** Count an event toward the current quest. */
  questTick(type, id) {
    const q = this.quest;
    if (!q || q.goal.type !== type) return;
    if (type === 'goop' && q.goal.id !== id) return;
    this.state.quest.have += 1;
    this.questCheck();
  }

  questCheck() {
    const q = this.quest;
    if (!q || this.questReadyFor === q.id) return;
    if (this.questProgress().ready) { this.questReadyFor = q.id; this.emit('questReady', { id: q.id, title: q.title }); }
  }

  /** Turn in a finished quest at Old Wiggs' shack and collect the reward. */
  claimQuest() {
    const q = this.quest;
    if (!q || !this.questProgress().ready) return false;
    const s = this.state, r = q.reward;
    s.essence += r.essence || 0;
    if (r.baits) s.baits[r.baits[0]] = (s.baits[r.baits[0]] || 0) + r.baits[1];
    if (r.item) {
      const [kind, id] = r.item;
      if (kind === 'decor') { if (!s.tank.decor.includes(id)) s.tank.decor.push(id); const t = s.tank.tanks.find((x) => x.decor.length < DECOR_SLOTS); if (t && !s.tank.tanks.some((x) => x.decor.includes(id))) t.decor.push(id); }
      else if (!s.owned[kind].includes(id)) s.owned[kind].push(id);
    }
    s.quest = { i: s.quest.i + 1, have: 0 };
    this.questReadyFor = null;
    this.emit('questClaim', { id: q.id, reward: r });
    this.questCheck();
    this.saveStore.save(s);
    return true;
  }

  // ----- aquarium -----

  /** Essence waiting in the tip jar today (0 once collected). */
  tipJar() { return this.state.tank.tipDay === this.state.day ? 0 : tankTips(this.state.dex); }

  collectTips() {
    const tip = this.tipJar();
    if (!tip) return 0;
    this.state.essence += tip;
    this.state.tank.tipDay = this.state.day;
    this.emit('tips', { tip });
    this.saveStore.save(this.state);
    return tip;
  }

  /** Which tank (index) a Goop lives in, or -1 if it is in storage. */
  tankOf(id) { return this.state.tank.tanks.findIndex((t) => t.fish.includes(id)); }

  /** Move a Goop into a tank (or storage with ti = -1). Fails if that tank is full. */
  setResident(id, ti) {
    const s = this.state;
    if (!s.dex[id]) return false;
    const to = s.tank.tanks[ti];
    if (ti !== -1 && (!to || (!to.fish.includes(id) && to.fish.length >= TANK_CAP))) return false;
    for (const t of s.tank.tanks) t.fish = t.fish.filter((x) => x !== id);
    if (to) to.fish.push(id);
    this.emit('decor', { resident: id, tank: ti });
    this.saveStore.save(s);
    return true;
  }

  /** New catches move into the first tank with room. Returns the tank index or -1. */
  houseGoop(id) {
    const tanks = this.state.tank.tanks;
    if (tanks.some((t) => t.fish.includes(id))) return this.tankOf(id);
    const ti = tanks.findIndex((t) => t.fish.length < TANK_CAP);
    if (ti >= 0) tanks[ti].fish.push(id);
    return ti;
  }

  tankCost() { const n = this.state.tank.tanks.length; return n < TANK_COSTS.length ? TANK_COSTS[n] : null; }

  buyTank() {
    const cost = this.tankCost(), s = this.state;
    if (cost == null || s.essence < cost) return false;
    s.essence -= cost;
    s.tank.tanks.push(newTank(s.tank.tanks.length + 1));
    this.emit('decor', { tank: s.tank.tanks.length - 1, bought: true });
    this.saveStore.save(s);
    return true;
  }

  renameTank(ti, name) {
    const t = this.state.tank.tanks[ti];
    const clean = String(name ?? '').replace(/[<>]/g, '').trim().slice(0, 18);
    if (!t || !clean) return false;
    t.name = clean;
    this.saveStore.save(this.state);
    return true;
  }

  /** Buy a decoration (once) and put it in tank ti. */
  buyDecor(id, ti = 0) {
    const d = DECOR[id], s = this.state;
    const t = s.tank.tanks[ti];
    if (!d || !t || d.quest || s.tank.decor.includes(id) || s.essence < d.cost || t.decor.length >= DECOR_SLOTS) return false;
    if (d.legends && GOOPS.filter((g) => g.rarity === 'Legendary' && s.dex[g.id]).length < d.legends) return false;
    s.essence -= d.cost;
    s.tank.decor.push(id);
    t.decor.push(id);
    this.emit('decor', { id });
    this.saveStore.save(s);
    return true;
  }

  /** Put an owned decoration in tank ti (taking it out of any other tank), or take it out again. */
  placeDecor(id, ti) {
    const s = this.state, t = s.tank.tanks[ti];
    if (!t || !s.tank.decor.includes(id)) return false;
    if (t.decor.includes(id)) { t.decor = t.decor.filter((x) => x !== id); }
    else {
      if (t.decor.length >= DECOR_SLOTS) return false;
      for (const x of s.tank.tanks) x.decor = x.decor.filter((k) => k !== id);
      t.decor.push(id);
    }
    this.emit('decor', { id, tank: ti });
    this.saveStore.save(s);
    return true;
  }

  /** Buy (if needed) and show a backdrop in tank ti. */
  setTheme(id, ti = 0) {
    const th = THEMES[id], s = this.state, t = s.tank.tanks[ti];
    if (!th || !t) return false;
    if (!s.tank.themes.includes(id)) {
      if (s.essence < th.cost) return false;
      s.essence -= th.cost;
      s.tank.themes.push(id);
    }
    t.theme = id;
    this.emit('decor', { theme: id });
    this.saveStore.save(s);
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
