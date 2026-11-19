import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { FISH, ZONES, ZONE_SCENE_PROFILES, weightedPick, createFight, fightTick, FishingGame, SaveStore, PHASES, levelXP, BEHAVIOR_INFO, MOVE_INFO, availableMovesFor, personalityFor, CATCH_PROFILES, sampleCatchMetrics, spawnWeightFor, gearAdjustedSpawnWeight, RODS, BAITS, QUESTS, questProgress, visualFor, rarityRank, specimenRankLabel } from '../src/game.js';

function memoryStore(){return {v:null,getItem(){return this.v},setItem(k,v){this.v=v},removeItem(){this.v=null}}}

test('specimen reveal size-rank labels are bounded, readable, and precise for record catches',()=>{assert.equal(specimenRankLabel({percentile:98.5}),'Top 1.5% size roll');assert.equal(specimenRankLabel({percentile:91}),'Top 9% size roll');assert.equal(specimenRankLabel({percentile:50}),'Top 50% size roll');assert.equal(specimenRankLabel({percentile:99.99}),'Top 0.01% size roll');assert.equal(specimenRankLabel({percentile:-5}),'Top 100% size roll');assert.equal(specimenRankLabel({percentile:105}),'Top 0% size roll');assert.equal(specimenRankLabel({percentile:NaN}),'Size rank unavailable');assert.equal(specimenRankLabel(null),'Size rank unavailable')});

test('specimen reveal announces catch quality and applies tier-specific presentation',()=>{const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8'),css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.ok(html.includes('id="specimenPanel" class="specimen-panel" hidden role="status" aria-live="polite" aria-atomic="true"'));assert.ok(html.includes('id="specimenRank" class="specimen-rank"'));assert.ok(main.includes("$('specimenRank').textContent=specimenRankLabel(s)"));assert.ok(main.includes("panel.className='specimen-panel specimen-'+grade"));assert.ok(css.includes('.specimen-panel.specimen-trophy'));assert.ok(css.includes('.specimen-panel.specimen-record'))});

test('reel control supports pointer and keyboard holds and safely releases on interruptions',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');assert.ok(main.includes("rb.addEventListener('keydown',keyDown)"));assert.ok(main.includes("if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(!e.repeat)"));assert.ok(main.includes("window.addEventListener('keyup',keyUp)"));assert.ok(main.includes("window.addEventListener('blur'"));assert.ok(main.includes("view==='fish'&&!document.hidden&&document.hasFocus()"));assert.equal(main.includes('windowFocused'),false);assert.ok(main.includes("document.addEventListener('visibilitychange'"));assert.ok(main.includes("rb.addEventListener('lostpointercapture',up)"));assert.ok(css.includes('#reelBtn{touch-action:none'));assert.ok(css.includes('prefers-reduced-motion:reduce'));assert.ok(css.includes(':focus-visible'));});



test('game event history is bounded while preserving the newest diagnostic events',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});for(let i=0;i<125;i++)game.emit('audit',{index:i});assert.equal(game.events.length,100);assert.equal(game.events[0].data.index,25);assert.equal(game.events.at(-1).data.index,124)});
test('completed sound-effect oscillators and gain nodes are disconnected',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes('osc.onended=()=>{osc.disconnect();gain.disconnect()}'))});

test('SaveStore construction survives a throwing localStorage getter',t=>{const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');if(descriptor&&!descriptor.configurable){t.skip('localStorage property cannot be safely replaced in this runtime');return}try{Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('storage access blocked')}});const store=new SaveStore();assert.equal(store.load().version,4);assert.equal(store.save(store.fresh()),false);assert.equal(store.lastSaveSucceeded,false)}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage}});

test('SaveStore reports unavailable storage and quota failures instead of false success',()=>{const absent=new SaveStore(null);assert.equal(absent.save(absent.fresh()),false);assert.equal(absent.lastSaveSucceeded,false);const blocked={getItem(){return null},setItem(){throw new Error('quota')}};const store=new SaveStore(blocked);assert.equal(store.save(store.fresh()),false);assert.equal(store.lastSaveSucceeded,false);const healthy=memoryStore(),good=new SaveStore(healthy);assert.equal(good.save(good.fresh()),true);assert.equal(good.lastSaveSucceeded,true)});

test('SaveStore recovers a corrupted primary save from the last valid backup',()=>{const storage=memoryStore();const store=new SaveStore(storage);const data={...store.fresh(),essence:777,total:12};assert.equal(store.save(data),true);storage.v='corrupt';storage.backup=JSON.stringify(data);storage.getItem=function(k){return k==='goop-fishing-save-v3-backup'?this.backup:this.v};const restored=new SaveStore(storage).load();assert.equal(restored.essence,777);assert.equal(restored.total,12)});
test('corrupted primary save is repaired immediately from the valid backup',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};const store=new SaveStore(storage);const saved={...store.fresh(),essence:321,total:8};storage.data[store.backupKey]=JSON.stringify(saved);storage.data[store.k]='broken-json';const recovered=new SaveStore(storage).load();assert.equal(recovered.essence,321);assert.equal(recovered.total,8);assert.equal(JSON.parse(storage.data[store.k]).essence,321);assert.equal(JSON.parse(storage.data[store.backupKey]).essence,321)});
test('parseable but structurally damaged primary saves recover from the valid backup',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};const store=new SaveStore(storage);const saved={...store.fresh(),essence:654,total:19};storage.data[store.backupKey]=JSON.stringify(saved);storage.data[store.k]=JSON.stringify({version:4});const recovered=new SaveStore(storage);const state=recovered.load();assert.equal(state.essence,654);assert.equal(state.total,19);assert.equal(recovered.lastLoadRecovered,true);assert.equal(JSON.parse(storage.data[store.k]).essence,654);assert.equal(JSON.parse(storage.data[store.backupKey]).essence,654)});

test('unrecognized primary and backup saves fail closed to fresh state',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};const store=new SaveStore(storage);storage.data[store.k]=JSON.stringify({version:4,essence:'999999',dex:[],ownedRods:{},zoneUnlocked:[]});storage.data[store.backupKey]=JSON.stringify({version:4});const loaded=store.load();assert.equal(loaded.essence,0);assert.equal(loaded.total,0);assert.equal(store.lastLoadRecovered,false)});

test('caught specimens and sell-or-keep decisions survive a reload',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};const game=new FishingGame({rng:()=>0,store:new SaveStore(storage)});game.fish=FISH[0];game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();const expectedReward=game.reward;assert.ok(game.state.pendingCatch);const recovered=new FishingGame({rng:()=>0,store:new SaveStore(storage)});assert.equal(recovered.phase,PHASES.CAUGHT);assert.equal(recovered.fish.id,FISH[0].id);assert.equal(recovered.reward,expectedReward);const beforeSale=recovered.state.essence;assert.equal(recovered.sell(),true);assert.equal(recovered.state.pendingCatch,null);assert.equal(recovered.state.essence,beforeSale+expectedReward);const freshReload=new FishingGame({rng:()=>0,store:new SaveStore(storage)});assert.equal(freshReload.phase,PHASES.IDLE);assert.equal(freshReload.state.pendingCatch,null)});
test('a landed catch clearly reports save failure and can be committed by a later decision retry',()=>{
  const storage={data:{},failNextWrite:true,getItem(k){return this.data[k]??null},setItem(k,v){if(this.failNextWrite){this.failNextWrite=false;throw new Error('quota')}this.data[k]=v},removeItem(k){delete this.data[k]}};
  const store=new SaveStore(storage),game=new FishingGame({rng:()=>0,store});
  game.fish=FISH[0];
  game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};
  game.finishCatch();
  const reward=game.reward,beforeSaleEssence=game.state.essence;
  assert.equal(game.phase,PHASES.CAUGHT);
  assert.ok(game.state.pendingCatch);
  assert.equal(store.lastSaveSucceeded,false);
  assert.match(game.message,/local save failed/i);
  assert.match(game.message,/Keep this page open/i);
  assert.equal(game.sell(),true);
  assert.equal(store.lastSaveSucceeded,true);
  const restored=new FishingGame({rng:()=>0,store:new SaveStore(storage)});
  assert.equal(restored.phase,PHASES.IDLE);
  assert.equal(restored.state.pendingCatch,null);
  assert.equal(restored.state.essence,beforeSaleEssence+reward);
});

test('Sell is idempotent and cannot credit the same catch twice',()=>{const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});game.fish=FISH[0];game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();const reward=game.reward,beforeEssence=game.state.essence,beforeSales=game.state.sales,beforeDay=game.state.day;assert.equal(game.sell(),true);assert.equal(game.sell(),false);assert.equal(game.state.essence,beforeEssence+reward);assert.equal(game.state.sales,beforeSales+reward);assert.equal(game.state.day,beforeDay+1)});

test('Keep is idempotent and cannot advance the fishing day twice',()=>{const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});game.fish=FISH[0];game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();const total=game.state.total,beforeEssence=game.state.essence,beforeDay=game.state.day;assert.equal(game.keep(),true);assert.equal(game.keep(),false);assert.equal(game.state.essence,beforeEssence);assert.equal(game.state.day,beforeDay+1);assert.equal(game.state.total,total)});

test('failed Sell persistence rolls back rewards and keeps the pending catch available',()=>{const storage=memoryStore(),store=new SaveStore(storage),game=new FishingGame({rng:()=>0,store});game.fish=FISH[0];game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();const before={essence:game.state.essence,sales:game.state.sales,day:game.state.day,reward:game.reward};storage.setItem=()=>{throw new Error('quota')};assert.equal(game.sell(),false);assert.equal(game.phase,PHASES.CAUGHT);assert.ok(game.state.pendingCatch);assert.equal(game.state.essence,before.essence);assert.equal(game.state.sales,before.sales);assert.equal(game.state.day,before.day);assert.match(game.message,/Save failed/)});

test('failed Keep persistence rolls back the catch decision and preserves the specimen',()=>{const storage=memoryStore(),store=new SaveStore(storage),game=new FishingGame({rng:()=>0,store});game.fish=FISH[0];game.fight={style:'tension',specimen:sampleCatchMetrics(FISH[0],()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();const before={essence:game.state.essence,day:game.state.day,total:game.state.total};storage.setItem=()=>{throw new Error('quota')};assert.equal(game.keep(),false);assert.equal(game.phase,PHASES.CAUGHT);assert.ok(game.state.pendingCatch);assert.equal(game.state.essence,before.essence);assert.equal(game.state.day,before.day);assert.equal(game.state.total,before.total);assert.match(game.message,/Save failed/)});

test('time and weather controls bind once outside the render cycle',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("b.addEventListener('click',()=>{if(game.setConditions(b.dataset.time,game.state.weather)){conditionsUI();render()}})"));assert.ok(main.includes("b.addEventListener('click',()=>{if(game.setConditions(game.state.timeOfDay,b.dataset.weather)){conditionsUI();render()}})"));assert.equal(main.includes("b.onclick=()=>{game.setConditions(b.dataset.time"),false);assert.equal(main.includes("b.onclick=()=>{game.setConditions(game.state.timeOfDay"),false)});

test('condition changes roll back when persistence fails and commit only after a successful save',()=>{const blocked={getItem(){return null},setItem(){throw new Error('quota')},removeItem(){}};const game=new FishingGame({store:new SaveStore(blocked)});const before={timeOfDay:game.state.timeOfDay,weather:game.state.weather};assert.equal(game.setConditions('night','rain'),false);assert.deepEqual({timeOfDay:game.state.timeOfDay,weather:game.state.weather},before);assert.equal(game.events.some(event=>event.type==='conditionsChanged'),false);const healthy=new FishingGame({store:new SaveStore(memoryStore())});assert.deepEqual(healthy.setConditions('night','rain'),{timeOfDay:'night',weather:'rain'});assert.equal(healthy.state.timeOfDay,'night');assert.equal(healthy.state.weather,'rain');assert.equal(healthy.events.filter(event=>event.type==='conditionsChanged').length,1)});

test('browser UI references valid HTML elements and shipped assets',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,'HTML element IDs must be unique');
  const idSet=new Set(ids);
  const references=[...main.matchAll(/\$\('([^']+)'\)/g)].map(m=>m[1]);
  const missing=[...new Set(references.filter(id=>!idSet.has(id)))];
  assert.deepEqual(missing,[],'every browser DOM lookup must resolve to an HTML id');
  assert.ok(existsSync(new URL('../src/style.css',import.meta.url)));
  assert.ok(html.includes('src/main.js'));
});

test('luck gear increases Rare+ spawn odds without inflating common species',()=>{const rare=FISH.find(f=>f.id==='glimmer'),common=FISH.find(f=>f.id==='gloop'),epic=FISH.find(f=>f.id==='voidling'),baseRare=gearAdjustedSpawnWeight(rare,{},RODS[0],BAITS[0]),luckRare=gearAdjustedSpawnWeight(rare,{},RODS.find(r=>r.id==='carbon'),BAITS.find(b=>b.id==='mint')),baseCommon=gearAdjustedSpawnWeight(common,{},RODS[0],BAITS[0]),luckCommon=gearAdjustedSpawnWeight(common,{},RODS.find(r=>r.id==='carbon'),BAITS.find(b=>b.id==='mint')),baseEpic=gearAdjustedSpawnWeight(epic,{},RODS[0],BAITS[0]),luckEpic=gearAdjustedSpawnWeight(epic,{},RODS.find(r=>r.id==='carbon'),BAITS.find(b=>b.id==='mint'));assert.ok(Math.abs(luckRare-baseRare*1.2)<1e-9);assert.equal(luckCommon,baseCommon);assert.ok(Math.abs(luckEpic-baseEpic*1.2)<1e-9);});
test('fish roster and locations are populated',()=>{
  assert.ok(FISH.length>=50);
  assert.ok(ZONES.length>=4);
  assert.equal(new Set(FISH.map(f=>f.id)).size,FISH.length);
  assert.equal(FISH.length,50);
  assert.ok(FISH.every(f=>CATCH_PROFILES[f.id]));
  const ids=new Set(FISH.map(f=>f.id));
  assert.ok(ZONES.every(z=>z.fish.every(id=>ids.has(id))),'every zone fish must exist in the GoopDex roster');
});

test('all five fishing zones have distinct palettes and rendered environmental landmarks',()=>{
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  assert.deepEqual(Object.keys(ZONE_SCENE_PROFILES).sort(),ZONES.map(zone=>zone.id).sort());
  const profiles=ZONES.map(zone=>ZONE_SCENE_PROFILES[zone.id]);
  assert.ok(profiles.every(profile=>profile.skyDay&&profile.skyNight&&profile.waterDay&&profile.waterNight&&profile.deepDay&&profile.deepNight&&profile.shore&&profile.accent));
  assert.equal(new Set(profiles.map(profile=>[profile.skyDay,profile.waterDay,profile.deepDay,profile.shore,profile.accent].join('|'))).size,ZONES.length);
  assert.equal(new Set(profiles.map(profile=>profile.landmark)).size,ZONES.length);
  assert.ok(main.includes('drawZoneLandmarks(z,w,h,night,clock)'),'the active zone must be rendered into the fishing scene');
  for(const profile of profiles)assert.ok(main.includes("scene.landmark==='"+profile.landmark+"'"),profile.landmark+' must have a dedicated renderer');
  const reach=main.slice(main.indexOf("scene.landmark==='crystal-spires'"),main.indexOf('ctx.restore();',main.indexOf("scene.landmark==='crystal-spires'")));
  for(const feature of ['Great Goopglass Spires','Prismroot fans','Floating Goopglass shards','Prism beams','Gooice shelves','Luminous Prism Pools','Goopwater'])assert.ok(reach.includes(feature),'Crystal Reach landmark must include '+feature);
  const creek=main.slice(main.indexOf("scene.landmark==='ember-rocks'"),main.indexOf("scene.landmark==='moonlit-lighthouse'"));
  for(const feature of ['Cinderstone shelves','Molten Goop seams','Bubbling Goop Vents','Emberroot clumps','Heated riffles'])assert.ok(creek.includes(feature),'Ember Creek landmark must include '+feature);
  const hollow=main.slice(main.indexOf("scene.landmark==='sunken-ruins'"),main.indexOf("scene.landmark==='ember-rocks'"));
  for(const feature of ['Goopstone Arch','Glooproot Grove','Goopstone monoliths','Goo Lanterns','Murk pools','marsh lights'])assert.ok(hollow.includes(feature),'Sunken Hollow landmark must include '+feature);
  const bay=main.slice(main.indexOf("scene.landmark==='moonlit-lighthouse'"),main.indexOf("scene.landmark==='crystal-spires'"));
  for(const feature of ['Soft coastal cloud bands','distant seabirds','Multiple headland layers','cliffside settlement','Bay pier','slow beacon sweep','navigation buoys','Foam traces the tide line','Low tide rocks','moving highlights'])assert.ok(bay.includes(feature),'Moonlit Bay landmark must include '+feature);
});

test('all 50 Goops have a deliberate species silhouette and marking profile',()=>{
  const profiles=FISH.map(f=>visualFor(f));
  const shapes=new Set(profiles.map(v=>v.shape));
  assert.ok(shapes.size>=6);
  assert.ok(profiles.every(v=>typeof v.mark==='string'&&v.mark.length>0));
  assert.notDeepEqual(visualFor(FISH.find(f=>f.id==='glacieroo')),visualFor(FISH.find(f=>f.id==='gloop')));
});


test('weighted picker never falls back to zero, negative or non-finite entries at the upper RNG boundary',()=>{const items=[{id:'positive',weight:2},{id:'zero',weight:0},{id:'negative',weight:-3},{id:'nan',weight:NaN}];assert.equal(weightedPick(items,()=>1).id,'positive');assert.equal(weightedPick(items,()=>Infinity).id,'positive');assert.equal(weightedPick(items,()=>-.5).id,'positive');assert.equal(weightedPick([{weight:NaN},{weight:0},{weight:-1}],()=>.5),null)});

test('weighted pick handles empty pools and deterministic outcomes',()=>{
  assert.equal(weightedPick([]),null);
  const pool=[{weight:1,id:'a'},{weight:3,id:'b'}];
  assert.equal(weightedPick(pool,()=>0).id,'a');
  assert.equal(weightedPick(pool,()=>.5).id,'b');
});


test('tension fight progress and stamina stay within valid bounds at terminal frames',()=>{const fish=FISH.find(f=>f.id==='gloop');const catchFight=createFight(fish,()=>0);catchFight.fish={...catchFight.fish,pressure:.0001};catchFight.nextMoveAt=999;for(let i=0;i<120&&!catchFight.caught&&!catchFight.escaped;i++)fightTick(catchFight,{reel:true},.06,0);assert.equal(catchFight.caught,true);assert.equal(catchFight.progress,1);const escapeFight=createFight(fish,()=>0);escapeFight.fish={...escapeFight.fish,pressure:.0001};escapeFight.nextMoveAt=999;escapeFight.tension=1;escapeFight.stamina=.001;fightTick(escapeFight,{reel:true},.06,0);assert.equal(escapeFight.escaped,true);assert.equal(escapeFight.stamina,0)});

test('fight tension stays bounded',()=>{
  const fight=createFight(FISH[0]);
  for(let i=0;i<500;i++)fightTick(fight,{reel:i%2===0},.05);
  assert.ok(fight.tension>=0&&fight.tension<=1);
});

test('valid JSON with malformed save shapes is safely normalized',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,essence:-50,level:0,total:'bad',dex:'not-an-object',zoneUnlocked:['broken'],quests:null,achievements:4,specimens:'bad-list',ownedRods:'invalid',ownedBaits:null,zone:'unknown',rod:'missing',bait:'missing',pendingCatch:{fishId:'unknown',reward:'bad'}});const state=new SaveStore(storage).load();assert.deepEqual(state.dex,{});assert.deepEqual(state.quests,{});assert.deepEqual(state.achievements,{});assert.deepEqual(state.specimens,[]);assert.deepEqual(state.ownedRods,['twig']);assert.deepEqual(state.ownedBaits,['plain']);assert.equal(state.essence,0);assert.equal(state.total,0);assert.equal(state.level,1);assert.equal(state.zone,'pond');assert.equal(state.rod,'twig');assert.equal(state.bait,'plain');assert.equal(state.pendingCatch,null);const game=new FishingGame({store:new SaveStore(storage)});assert.equal(game.cast(),true)});
test('save store safely handles corrupt data',()=>{
  const storage={v:'bad',getItem(){return this.v},setItem(k,v){this.v=v},removeItem(){this.v=null}};
  assert.equal(new SaveStore(storage).load().version,4);
});

test('casting is blocked while a landed catch awaits sell or keep',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});game.phase=PHASES.CAUGHT;game.fish=FISH[0];game.reward=50;game.state.pendingCatch={fishId:FISH[0].id,reward:50};const before=game.state.total;assert.equal(game.cast(),false);assert.equal(game.phase,PHASES.CAUGHT);assert.equal(game.state.pendingCatch.reward,50);assert.equal(game.state.total,before);assert.equal(game.sell(),true);assert.equal(game.state.pendingCatch,null);assert.equal(game.cast(),true)});
test('casting progresses to bite and hooking',()=>{
  const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});
  assert.equal(game.cast(),true);
  for(let i=0;i<20;i++)game.update(.06,{});
  assert.equal(game.phase,PHASES.BITE);
  game.update(.01,{reel:true});
  assert.equal(game.phase,PHASES.FIGHT);
});

test('daily catch counter resets when a catch decision advances to the next day',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});game.state.today=3;game.phase=PHASES.CAUGHT;game.reward=15;game.state.pendingCatch={fishId:'gloop',reward:15};assert.equal(game.sell(),true);assert.equal(game.state.day,2);assert.equal(game.state.today,0);game.state.today=2;game.phase=PHASES.CAUGHT;game.state.pendingCatch={fishId:'gloop',reward:15};assert.equal(game.keep(),true);assert.equal(game.state.day,3);assert.equal(game.state.today,0)});
test('catch logs species, XP and sale payout',()=>{
  const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});
  game.cast();
  game.phase=PHASES.FIGHT;
  game.fish=FISH[0];
  game.fight=createFight(FISH[0]);
  game.fight.caught=true;
  game.update(0);
  assert.equal(game.phase,PHASES.CAUGHT);
  assert.equal(game.state.total,1);
  assert.ok(game.state.xp>0);
  const reward=game.reward;
  const balanceBeforeSale=game.state.essence;
  assert.equal(game.sell(),true);
  assert.equal(game.state.essence,balanceBeforeSale+reward);
  assert.equal(game.state.sales,reward);
  assert.equal(game.state.lastCatch.fishId,'gloop');
  assert.ok(game.state.lastCatch.weightLb>0);
  assert.ok(game.state.lastCatch.lengthIn>0);
  assert.equal(game.state.specimens.length,1);
  assert.deepEqual(game.state.dex.gloop.styles,['tension']);
  assert.equal(game.state.lastCatch.collectionLengthRecord,true);
  assert.ok(game.state.longestSpecimen.lengthIn>0);
});

test('fish behavior moods cycle and expose species-specific advice',()=>{
  const fight=createFight(FISH.find(x=>x.pattern==='dart'));
  fightTick(fight,{reel:false},.06);
  assert.ok(fight.behaviorLabel.includes('Dart'));
  for(let i=0;i<130;i++)fightTick(fight,{reel:false},.06);
  assert.ok(['opening','pressure','feint','recovery'].includes(fight.mood));
  assert.ok(BEHAVIOR_INFO.dart.tip.length>10);
});

test('species have distinct move sets and readable personality profiles',()=>{
  const gentle=FISH.find(x=>x.id==='gloop');
  const tempest=FISH.find(x=>x.id==='stormblob');
  assert.ok(availableMovesFor(gentle).length>=2);
  assert.ok(availableMovesFor(tempest).some(move=>move.id==='bolt'));
  assert.notEqual(personalityFor(gentle).label,personalityFor(tempest).label);
  assert.ok(MOVE_INFO.surface.counterLabel.length>5);
});

test('a correct response to a telegraphed move creates a recovery opening',()=>{
  const fight=createFight(FISH.find(x=>x.id==='gloop'),()=>0);
  for(let i=0;i<54;i++)fightTick(fight,{reel:false},.06);
  assert.equal(fight.moveState,'tell');
  assert.equal(fight.currentMove.id,'dive');
  for(let i=0;i<50;i++)fightTick(fight,{reel:false},.06);
  assert.equal(fight.moveState,'recovery');
  assert.equal(fight.movesAttempted,1);
  assert.equal(fight.movesRead,1);
  assert.equal(fight.moveResultGood,true);
});



test('patience-style species do not advertise unreachable tension maneuvers',()=>{for(const fish of FISH.filter(f=>['drift','sleepy'].includes(f.pattern))){assert.equal(createFight(fish).style,'patience');assert.equal(availableMovesFor(fish).length,0)}});


test('GoopDex hydration rejects moves unavailable to each species fight style',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,dex:{puddlit:{count:1,moves:['dive','circle']},murkling:{count:1,moves:['bolt','circle','invalid']}}});const state=new SaveStore(storage).load();assert.deepEqual(state.dex.puddlit.moves,[]);assert.deepEqual(state.dex.murkling.moves,['bolt','circle'])});

test('GoopDex maneuver totals include every move adaptive fights can select',()=>{for(const fish of FISH){if(personalityFor(fish).adaptability<=.3||['drift','sleepy'].includes(fish.pattern))continue;const available=new Set(availableMovesFor(fish).map(m=>m.id));for(const [ratio,reel] of [[.9,true],[.1,false]]){const fight=createFight(fish,()=>0);fight.elapsed=8;fight.nextMoveAt=8;fight.inputTime=10;fight.reelInputTime=10*ratio;fightTick(fight,{reel},.06);assert.ok(available.has(fight.currentMove.id),fish.id+' adaptive move '+fight.currentMove.id+' missing from GoopDex total');}}});

test('fish adapt move selection when the player repeatedly over-reels',()=>{
  const fight=createFight(FISH.find(x=>x.id==='murkling'),()=>0);
  fight.elapsed=8;
  fight.nextMoveAt=8;
  fight.inputTime=10;
  fight.reelInputTime=9;
  fightTick(fight,{reel:true},.06);
  assert.equal(fight.adaptationActive,true);
  assert.equal(fight.currentMove.counter,'release');
  assert.match(fight.adaptationMessage,/constant reeling/i);
});

test('catching a fish records discovered maneuvers and successful reads',()=>{
  const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});
  game.phase=PHASES.FIGHT;
  game.fish=FISH.find(x=>x.id==='gloop');
  game.fight=createFight(game.fish);
  game.fight.moveHistory=['dive','circle'];
  game.fight.movesRead=1;
  game.fight.movesAttempted=2;
  game.fight.caught=true;
  game.update(0);
  const notes=game.state.dex.gloop;
  assert.deepEqual(notes.moves,['dive','circle']);
  assert.equal(notes.reads,1);
  assert.equal(notes.attempts,2);
});



test('drift and sleepy Goops use the patience fight mode instead of tension reeling',()=>{
  const fish=FISH.find(x=>x.pattern==='drift');
  const fight=createFight(fish,()=>0);
  assert.equal(fight.style,'patience');
  fightTick(fight,{reel:true,tap:false},.06);
  assert.equal(fight.progress,0);
  assert.match(fight.tapHint,/rhythm/i);
});

test('steady rhythm taps catch a patience-style Goop',()=>{
  const fight=createFight(FISH.find(x=>x.pattern==='drift'),()=>0);
  fightTick(fight,{tap:true},.01);
  for(let i=0;i<8&&!fight.caught;i++){
    for(let j=0;j<7;j++)fightTick(fight,{tap:false},.06);
    fightTick(fight,{tap:true},.01);
  }
  assert.equal(fight.caught,true);
  assert.ok(fight.progress>=1);
});

test('frantic rhythm taps spook a patience-style Goop into escaping',()=>{
  const fight=createFight(FISH.find(x=>x.pattern==='sleepy'),()=>0);
  fightTick(fight,{tap:true},.05);
  for(let i=0;i<6&&!fight.escaped;i++)fightTick(fight,{tap:true},.05);
  assert.equal(fight.escaped,true);
  assert.match(fight.moveResult,/spooked/i);
});

test('specimen generation stays inside species-specific size ranges and creates grades',()=>{
  const fish=FISH.find(x=>x.id==='glacieroo');
  const values=[.99,.98,.05,.06];
  let index=0;
  const rng=()=>values[index++]??.5;
  const huge=sampleCatchMetrics(fish,rng);
  assert.ok(huge.weightLb>=CATCH_PROFILES.glacieroo[0]&&huge.weightLb<=CATCH_PROFILES.glacieroo[1]);
  assert.ok(huge.lengthIn>=CATCH_PROFILES.glacieroo[2]&&huge.lengthIn<=CATCH_PROFILES.glacieroo[3]);
  assert.equal(huge.sizeClass,'Record');
  assert.equal(huge.isRecord,true);
  assert.ok(huge.valueMultiplier>1);
});

test('every species specimen roll stays inside its authored weight and length range',()=>{
  for(const fish of FISH){
    let call=0;
    const specimen=sampleCatchMetrics(fish,()=>{call++;return .5});
    const [minWeight,maxWeight,minLength,maxLength]=CATCH_PROFILES[fish.id];
    assert.ok(specimen.weightLb>=minWeight&&specimen.weightLb<=maxWeight,fish.id+' weight out of range');
    assert.ok(specimen.lengthIn>=minLength&&specimen.lengthIn<=maxLength,fish.id+' length out of range');
    assert.ok(specimen.sizeScale>=.82&&specimen.sizeScale<=1.38,fish.id+' visual scale out of range');
    assert.equal(call,2);
  }
});


test('all 50 Goops keep fight state finite and bounded throughout deterministic encounters',()=>{for(const fish of FISH){const fight=createFight(fish,()=>.42);for(let tick=0;tick<900&&!fight.caught&&!fight.escaped;tick++){fightTick(fight,{reel:tick%11<7,tap:tick%8===0},.06,.32);for(const [field,min,max] of [['progress',0,1],['stamina',0,100],['tension',0,1],['spook',0,1]]){assert.ok(Number.isFinite(fight[field]),fish.id+' '+field+' must remain finite');assert.ok(fight[field]>=min&&fight[field]<=max,fish.id+' '+field+' out of bounds: '+fight[field]);}}assert.ok(fight.caught||fight.escaped,fish.id+' encounter did not resolve within 54 seconds')}});

test('every fishing zone has catchable species in all day/night and clear/rain combinations',()=>{
  for(const zone of ZONES)for(const timeOfDay of ['day','night'])for(const weather of ['clear','rain']){
    const total=FISH.filter(f=>zone.fish.includes(f.id)).reduce((sum,fish)=>sum+spawnWeightFor(fish,{timeOfDay,weather}),0);
    assert.ok(total>0,zone.id+' empty spawn pool at '+timeOfDay+'/'+weather);
  }
});


test('spawn pools remain finite and selectable across every zone, condition and owned gear profile',()=>{for(const zone of ZONES)for(const timeOfDay of ['day','night'])for(const weather of ['clear','rain'])for(const rod of RODS)for(const bait of BAITS){const pool=FISH.filter(f=>zone.fish.includes(f.id)).map(f=>({...f,weight:gearAdjustedSpawnWeight(f,{timeOfDay,weather},rod,bait)})),eligible=pool.filter(f=>f.weight>0),sum=eligible.reduce((n,f)=>n+f.weight,0);assert.ok(eligible.length>0,zone.id+' has no eligible fish for '+timeOfDay+'/'+weather+'/'+rod.id+'/'+bait.id);assert.ok(Number.isFinite(sum)&&sum>0,zone.id+' has invalid weight total');for(const roll of [0,.1,.5,.9,.999999]){const selected=weightedPick(pool,()=>roll);assert.ok(selected&&eligible.some(f=>f.id===selected.id),zone.id+' selected a zero-weight or unknown fish')}}});
test('luck gear never changes Common or Uncommon weights and increases all Rare+ weights',()=>{for(const fish of FISH){const base=gearAdjustedSpawnWeight(fish,{},RODS[0],BAITS[0]),best=gearAdjustedSpawnWeight(fish,{},RODS.at(-1),BAITS.at(-1));if(rarityRank(fish.rarity)<2)assert.equal(best,base,fish.id+' common/uncommon baseline changed');else assert.ok(best>=base,fish.id+' Rare+ weight unexpectedly fell with luck gear')}});

test('time of day and weather change which Goops are likely to spawn',()=>{
  const voidling=FISH.find(x=>x.id==='voidling');
  const murkling=FISH.find(x=>x.id==='murkling');
  const clearDay=spawnWeightFor(voidling,{timeOfDay:'day',weather:'clear'});
  const darkNight=spawnWeightFor(voidling,{timeOfDay:'night',weather:'clear'});
  const dryMurk=spawnWeightFor(murkling,{timeOfDay:'day',weather:'clear'});
  const rainyMurk=spawnWeightFor(murkling,{timeOfDay:'day',weather:'rain'});
  assert.ok(darkNight>clearDay);
  assert.ok(rainyMurk>dryMurk);
});


test('legacy saves without a specimen log recover a validated last or pending specimen',()=>{const storage=memoryStore();const specimen={id:'catch-1',fishId:'gloop',weightLb:.83,lengthIn:6.5,percentile:50};storage.v=JSON.stringify({version:3,total:1,lastCatch:specimen,pendingCatch:{fishId:'gloop',reward:5,specimen}});const state=new SaveStore(storage).load();assert.equal(state.specimens.length,1);assert.equal(state.lastCatch.id,'catch-1');assert.equal(state.pendingCatch.specimen.id,'catch-1');assert.equal(state.pendingCatch.reward,5)});

test('v3 saves migrate forward without losing existing player progress',()=>{
  const storage=memoryStore();
  storage.v=JSON.stringify({version:3,essence:415,level:4,dex:{gloop:{count:3}},ownedRods:['twig','bamboo'],zoneUnlocked:{pond:true,hollow:true}});
  const loaded=new SaveStore(storage).load();
  assert.equal(loaded.version,4);
  assert.equal(loaded.essence,415);
  assert.equal(loaded.level,4);
  assert.equal(loaded.dex.gloop.count,3);
  assert.deepEqual(loaded.specimens,[]);
  assert.equal(loaded.timeOfDay,'day');
});


test('player conditions persist and emit a change event',()=>{
  const storage=memoryStore();
  const game=new FishingGame({store:new SaveStore(storage)});
  let event=null;
  game.events=[];
  game.setConditions('night','rain');
  assert.equal(game.state.timeOfDay,'night');
  assert.equal(game.state.weather,'rain');
  assert.equal(new SaveStore(storage).load().weather,'rain');
  assert.equal(game.events.at(-1).type,'conditionsChanged');
});

test('trophy and total-weight quests read specimen progression',()=>{
  const state={total:10,dex:{gloop:{count:1}},sales:55,rareCaught:2,trophyCount:3,totalWeightLb:125};
  assert.equal(questProgress(QUESTS.find(q=>q.id==='trophies'),state),3);
  assert.equal(questProgress(QUESTS.find(q=>q.id==='heavy'),state),125);
});

test('specimen collection achievements unlock from trophy and heavyweight milestones',()=>{
  const game=new FishingGame({store:new SaveStore(memoryStore())});
  game.state.trophyCount=5;
  game.state.heaviestSpecimen={weightLb:55};
  game.state.dex=Object.fromEntries(FISH.slice(0,10).map(f=>[f.id,{count:1,bestWeightLb:1}]));
  game.checkAchievements();
  assert.equal(game.state.achievements.trophy,true);
  assert.equal(game.state.achievements.heavyweight,true);
  assert.equal(game.state.achievements.recordkeeper,true);
});

test('quest XP triggers level progression immediately when quest is completed',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});game.state.xp=79;game.state.total=1;game.checkQuests();assert.equal(game.state.quests.first,true);assert.equal(game.state.level,2);assert.equal(game.state.xp,24);assert.ok(game.state.essence>=30)});
test('level XP curve scales upward',()=>{
  assert.equal(levelXP(1),80);
  assert.equal(levelXP(2),115);
  assert.ok(levelXP(5)>levelXP(2));
});

test('shop purchases and location unlock are currency gated',()=>{
  const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});
  assert.equal(game.buyRod('bamboo'),false);
  game.state.essence=400;
  assert.equal(game.buyRod('bamboo'),true);
  assert.equal(game.state.rod,'bamboo');
  assert.equal(game.unlockZone('hollow'),true);
  assert.equal(game.state.zone,'hollow');
});

test('save hydration only accepts valid true zone unlock flags and deduplicates owned gear',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,zoneUnlocked:{pond:true,hollow:'true',creek:1,bay:true,reach:false,invalid:true},ownedRods:['twig','carbon','carbon','missing'],ownedBaits:['plain','mint','mint','unknown'],zone:'hollow',rod:'carbon',bait:'mint'});const state=new SaveStore(storage).load();assert.deepEqual(state.zoneUnlocked,{pond:true,bay:true});assert.deepEqual(state.ownedRods,['twig','carbon']);assert.deepEqual(state.ownedBaits,['plain','mint']);assert.equal(state.zone,'pond');assert.equal(state.rod,'carbon');assert.equal(state.bait,'mint');});


test('save hydration whitelists quest and achievement flags as literal true values',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,quests:{first:true,sales:'true',unknown:true,rare:1},achievements:{species:true,unknown:true,catches:'true',rare:1}});const state=new SaveStore(storage).load();assert.deepEqual(state.quests,{first:true});assert.deepEqual(state.achievements,{species:true});});


test('hydration rejects negative pending catch rewards',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,pendingCatch:{fishId:'gloop',reward:-999}});const state=new SaveStore(storage).load();assert.equal(state.pendingCatch,null);});


test('dex hydration sanitizes malformed records but preserves valid collection progress',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,dex:{gloop:{count:4,best:90,rarity:'Rare',moves:12,styles:['tension','bad'],reads:-2,attempts:3,bestWeightLb:2.5,bestLengthIn:8,trophies:1},unknown:{count:99},murkling:'invalid'}});const state=new SaveStore(storage).load();assert.deepEqual(state.dex.gloop,{count:4,best:90,rarity:'Common',moves:[],styles:['tension'],reads:0,attempts:3,bestWeightLb:1.4,bestLengthIn:8,trophies:1});assert.equal(state.dex.unknown,undefined);assert.equal(state.dex.murkling,undefined);});


test('hydration rejects pending catch payouts above species maximum reward bounds',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,pendingCatch:{fishId:'gloop',reward:999999}});const state=new SaveStore(storage).load();assert.equal(state.pendingCatch,null);});


test('hydration normalizes specimens and record pointers against valid species and range data',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};const valid={id:'catch-1',fishId:'gloop',name:'fake name',rarity:'Legendary',weightLb:1.4,lengthIn:9,percentile:200,sizeScale:99,valueMultiplier:99,xpMultiplier:99,sizeClass:'bogus',isTrophy:'yes',day:0};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,specimens:[valid,{...valid,id:'catch-bad',fishId:'gloop',weightLb:999}],lastCatch:valid,heaviestSpecimen:{...valid,id:'orphan'},longestSpecimen:valid,pendingCatch:{fishId:'gloop',reward:5,specimen:{...valid,id:'pending',fishId:'unknown'}}});const state=new SaveStore(storage).load();assert.equal(state.specimens.length,1);const s=state.specimens[0];assert.equal(s.name,'Gloop');assert.equal(s.rarity,'Common');assert.equal(s.percentile,100);assert.equal(s.sizeScale,1.38);assert.equal(s.valueMultiplier,1.44);assert.equal(s.xpMultiplier,1.15);assert.equal(s.sizeClass,'Record');assert.equal(s.isTrophy,true);assert.equal(s.isRecord,true);assert.equal(s.day,1);assert.equal(state.lastCatch.id,'catch-1');assert.equal(state.longestSpecimen.id,'catch-1');assert.equal(state.heaviestSpecimen.id,'catch-1');assert.equal(state.pendingCatch,null);});
test('hydration caps progression counters and lifetime totals against extreme saves',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,trophyCount:999999999,totalWeightLb:999999999999,essence:999999999999,total:999999999999,today:999999999,sales:999999999999,xp:999999999999,level:999999999,day:999999999,rareCaught:999999999,upgrades:999999999});const state=new SaveStore(storage).load();assert.equal(state.trophyCount,100000);assert.equal(state.totalWeightLb,100000000);assert.equal(state.essence,1000000000);assert.equal(state.total,100000000);assert.equal(state.today,100000);assert.equal(state.sales,1000000000);assert.equal(state.xp,1000000000);assert.equal(state.level,1000000);assert.equal(state.day,1000000);assert.equal(state.rareCaught,100000);assert.equal(state.upgrades,100000);});




test('lifetime catch total reconciles upward to the sum of registered GoopDex catch counts',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,total:2,dex:{gloop:{count:3},murkling:{count:4},unknown:{count:99}}});const state=new SaveStore(storage).load();assert.equal(state.total,7);assert.equal(state.dex.gloop.count,3);assert.equal(state.dex.murkling.count,4);assert.equal(state.dex.unknown,undefined)});

test('hydration keeps daily, rare and trophy catch totals within lifetime catches',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,total:2,today:50,rareCaught:40,trophyCount:30});const state=new SaveStore(storage).load();assert.equal(state.total,2);assert.equal(state.today,2);assert.equal(state.rareCaught,2);assert.equal(state.trophyCount,2)});

test('hydration converts progression counters and dex statistics to valid integer ranges',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,trophyCount:4.8,totalWeightLb:1.239,essence:10.9,day:2.9,today:3.9,total:10.9,sales:9.8,xp:7.9,level:1.9,rareCaught:3.7,upgrades:1.9,dex:{gloop:{count:1.9,best:120.9,rarity:'Legendary',moves:['dive','dive','invalid'],styles:['tension','tension','invalid'],reads:5.8,attempts:2.9,bestWeightLb:999,bestLengthIn:999,trophies:9.7}}});const state=new SaveStore(storage).load();assert.equal(state.trophyCount,4);assert.equal(state.totalWeightLb,1.24);assert.equal(state.essence,10);assert.equal(state.day,2);assert.equal(state.today,3);assert.equal(state.total,10);assert.equal(state.sales,9);assert.equal(state.xp,7);assert.equal(state.level,1);assert.equal(state.rareCaught,3);assert.equal(state.upgrades,1);assert.deepEqual(state.dex.gloop,{count:1,best:100,rarity:'Common',moves:['dive'],styles:['tension'],reads:2,attempts:2,bestWeightLb:1.4,bestLengthIn:9,trophies:1})});
test('new specimen IDs do not collide with retained records when the total counter is stale',()=>{const storage=memoryStore();const prior={id:'catch-2',fishId:'gloop',weightLb:.5,lengthIn:5.1};storage.v=JSON.stringify({version:4,total:1,specimens:[prior],lastCatch:prior,heaviestSpecimen:prior,longestSpecimen:prior});const game=new FishingGame({store:new SaveStore(storage)});assert.equal(game.state.total,2);game.fish=FISH.find(f=>f.id==='gloop');game.fight={style:'tension',specimen:sampleCatchMetrics(game.fish,()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();assert.equal(game.state.specimens.at(-1).id,'catch-3');assert.equal(new Set(game.state.specimens.map(s=>s.id)).size,game.state.specimens.length);assert.equal(game.state.lastCatch.id,'catch-3');assert.equal(game.state.total,3);assert.equal(game.state.heaviestSpecimen.id,'catch-2')});



test('equal-size recent catches do not overwrite older all-time record holders',()=>{const storage=memoryStore();const older={id:'catch-1',fishId:'gloop',weightLb:1.4,lengthIn:9},recent={id:'catch-2',fishId:'gloop',weightLb:1.4,lengthIn:9};storage.v=JSON.stringify({version:4,total:2,specimens:[recent],heaviestSpecimen:older,longestSpecimen:older});const state=new SaveStore(storage).load();assert.equal(state.heaviestSpecimen.id,'catch-1');assert.equal(state.longestSpecimen.id,'catch-1')});

test('pending catch recovery must match the latest logged specimen',()=>{const storage=memoryStore();const first={id:'catch-1',fishId:'gloop',weightLb:.5,lengthIn:5.1},latest={id:'catch-2',fishId:'murkling',weightLb:.8,lengthIn:7};storage.v=JSON.stringify({version:4,total:2,specimens:[first,latest],lastCatch:first,pendingCatch:{fishId:'gloop',reward:5,specimen:first}});const state=new SaveStore(storage).load();assert.equal(state.lastCatch.id,'catch-2');assert.equal(state.pendingCatch,null)});
test('hydration sorts specimens and reconciles lifetime records against the recent log',()=>{const storage=memoryStore();const low={id:'catch-9',fishId:'gloop',weightLb:.5,lengthIn:5.1},high={id:'catch-10',fishId:'gloop',weightLb:1.4,lengthIn:9};const oldRecord={id:'catch-1',fishId:'murkling',weightLb:.6,lengthIn:7};storage.v=JSON.stringify({version:4,total:10,specimens:[high,low],lastCatch:low,heaviestSpecimen:oldRecord,longestSpecimen:oldRecord});const state=new SaveStore(storage).load();assert.deepEqual(state.specimens.map(s=>s.id),['catch-9','catch-10']);assert.equal(state.lastCatch.id,'catch-10');assert.equal(state.heaviestSpecimen.id,'catch-10');assert.equal(state.longestSpecimen.id,'catch-10')});

test('hydration preserves all-time weight and length records after specimens roll out of the recent log',()=>{const storage=memoryStore();const recent=Array.from({length:120},(_,i)=>({id:'catch-'+(i+2),fishId:'gloop',weightLb:.3,lengthIn:4.2}));const historic={id:'catch-1',fishId:'gloop',name:'Gloop',rarity:'Common',weightLb:1.4,lengthIn:9,percentile:100,sizeScale:1.38,sizeClass:'Record',isTrophy:true,isRecord:true,valueMultiplier:1.44,xpMultiplier:1.15,day:1};storage.v=JSON.stringify({version:4,total:121,specimens:recent,lastCatch:recent.at(-1),heaviestSpecimen:historic,longestSpecimen:historic});const game=new FishingGame({store:new SaveStore(storage)});assert.equal(game.state.specimens.length,120);assert.equal(game.state.lastCatch.id,'catch-121');assert.equal(game.state.heaviestSpecimen.id,'catch-1');assert.equal(game.state.longestSpecimen.id,'catch-1');game.fish=FISH.find(f=>f.id==='gloop');game.fight={style:'tension',specimen:sampleCatchMetrics(game.fish,()=>0),progress:1,movesRead:0,movesAttempted:0,moveHistory:[],caught:true};game.finishCatch();assert.equal(game.state.lastCatch.id,'catch-122');assert.equal(game.state.lastCatch.collectionRecord,false);assert.equal(game.state.lastCatch.collectionLengthRecord,false);assert.equal(game.state.heaviestSpecimen.id,'catch-1');assert.equal(game.state.longestSpecimen.id,'catch-1')});



test('hydration derives specimen record badges from verified Dex bests and lifetime holders',()=>{const storage=memoryStore();const current={id:'catch-2',fishId:'gloop',weightLb:.83,lengthIn:6.5,percentile:50,speciesRecord:true,speciesLengthRecord:true,collectionRecord:true,collectionLengthRecord:true};const historic={id:'catch-1',fishId:'gloop',weightLb:1.4,lengthIn:9,percentile:100};storage.v=JSON.stringify({version:4,total:2,dex:{gloop:{count:2,bestWeightLb:1.4,bestLengthIn:9}},specimens:[current],heaviestSpecimen:historic,longestSpecimen:historic});const state=new SaveStore(storage).load();assert.equal(state.lastCatch.id,'catch-2');assert.equal(state.lastCatch.speciesRecord,false);assert.equal(state.lastCatch.speciesLengthRecord,false);assert.equal(state.lastCatch.collectionRecord,false);assert.equal(state.lastCatch.collectionLengthRecord,false);assert.equal(state.heaviestSpecimen.id,'catch-1');assert.equal(state.longestSpecimen.id,'catch-1')});

test('hydration rejects specimen size percentiles inconsistent with physical measurements but accepts legacy rounding',()=>{const storage=memoryStore();const legacy={id:'catch-1',fishId:'gloop',weightLb:.88,lengthIn:6.8,percentile:55.1};const forged={id:'catch-2',fishId:'gloop',weightLb:1.4,lengthIn:9,percentile:50};storage.v=JSON.stringify({version:4,total:2,specimens:[legacy,forged]});const state=new SaveStore(storage).load();assert.deepEqual(state.specimens.map(s=>s.id),['catch-1']);assert.equal(state.specimens[0].percentile,55.1)});

test('hydration derives specimen size class and rewards from its percentile',()=>{const storage=memoryStore();const sample={id:'catch-1',fishId:'gloop',weightLb:.83,lengthIn:6.5,percentile:50,sizeScale:1.38,sizeClass:'Record',isTrophy:true,isRecord:true,valueMultiplier:1.44,xpMultiplier:1.15};storage.v=JSON.stringify({version:4,total:1,specimens:[sample],lastCatch:sample});const state=new SaveStore(storage).load(),s=state.lastCatch;assert.equal(s.percentile,50);assert.equal(s.sizeClass,'Standard');assert.equal(s.isTrophy,false);assert.equal(s.isRecord,false);assert.equal(s.sizeScale,1.1);assert.equal(s.valueMultiplier,1.11);assert.equal(s.xpMultiplier,1.025)});

test('GoopDex hydration drops empty, zero-count and fractional-below-one discovery entries',()=>{const storage=memoryStore();storage.v=JSON.stringify({version:4,dex:{gloop:{},murkling:{count:0},flicker:{count:.5},puddlit:{count:2}}});const state=new SaveStore(storage).load();assert.deepEqual(Object.keys(state.dex),['puddlit']);assert.equal(state.dex.puddlit.count,2);});

test('hydration rejects malformed specimen IDs and deduplicates repeated catch IDs',()=>{const storage=memoryStore();const sample={id:'catch-2',fishId:'gloop',weightLb:.5,lengthIn:5.1};storage.v=JSON.stringify({version:4,specimens:[sample,{...sample,id:'not-a-catch'},{...sample,name:'duplicate'}],lastCatch:sample});const state=new SaveStore(storage).load();assert.equal(state.specimens.length,1);assert.equal(state.specimens[0].id,'catch-2');assert.equal(state.specimens[0].name,'Gloop');assert.equal(state.lastCatch.id,'catch-2');});
test('GoopDex numeric fields are capped during hydration to resist absurd save values',()=>{const storage={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};storage.data['goop-fishing-save-v3']=JSON.stringify({version:4,dex:{gloop:{count:999999999,best:999999999,reads:999999999,attempts:999999999,bestWeightLb:999999999,bestLengthIn:999999999,trophies:999999999}}});const state=new SaveStore(storage).load();assert.deepEqual({count:state.dex.gloop.count,best:state.dex.gloop.best,reads:state.dex.gloop.reads,attempts:state.dex.gloop.attempts,bestWeightLb:state.dex.gloop.bestWeightLb,bestLengthIn:state.dex.gloop.bestLengthIn,trophies:state.dex.gloop.trophies},{count:100000,best:100,reads:100000,attempts:100000,bestWeightLb:1.4,bestLengthIn:9,trophies:100000});});






test('explicit Release clears both keyboard and pointer hold state',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("$('releaseBtn').onclick=()=>{reel=false;pointerReel=false;activePointerId=null;keyboardReel=false;syncReel();render()}"));assert.ok(main.includes("const down=e=>{if(pointerReel||e.button!==undefined&&e.button!==0)return;e.preventDefault();"))});

test('reel pointer release ignores other pointers and avoids cancelling unrelated pointer-ups',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("let rb=$('reelBtn'),pointerReel=false,keyboardReel=false,activePointerId=null;"));assert.ok(main.includes("if(activePointerId!==null&&e?.pointerId!==undefined&&e.pointerId!==activePointerId)return;if(pointerReel&&e)e.preventDefault();pointerReel=false;activePointerId=null;syncReel()"));});

test('held reel inputs clear when a fight ends so the next bite needs fresh input',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("if(game.phase===PHASES.CAUGHT||game.phase===PHASES.ESCAPED){reel=false;if(typeof pointerReel!=='undefined')pointerReel=false;if(typeof keyboardReel!=='undefined')keyboardReel=false}"));});

test('fishing loop checks the live browser focus state rather than a stale startup snapshot',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("view==='fish'&&!document.hidden&&document.hasFocus()"));assert.equal(main.includes('windowFocused'),false)});
test('fishing simulation pauses when the page is hidden or unfocused and clears held controls on blur',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes("if(view==='fish'&&!document.hidden&&document.hasFocus()){game.update(dt,{reel,tap:tapQueued>0});"));assert.ok(main.includes("if(window.__pondSmoke)window.__pondSmoke.game={dt,timer:game.timer,phase:game.phase,view};tapQueued=0;"));assert.ok(main.includes("if(game.phase===PHASES.CAUGHT||game.phase===PHASES.ESCAPED){"));assert.ok(main.includes("}else{reel=false;tapQueued=0;"));assert.ok(main.includes("window.addEventListener('blur',()=>{pointerReel=false;activePointerId=null;keyboardReel=false;syncReel()})"));assert.ok(main.includes("function changeView(v){if(v!=='fish'){reel=false;tapQueued=0;"));});

test('cast snapshots its rod and bait until the encounter ends',()=>{const rodGame=new FishingGame({store:new SaveStore(memoryStore())});rodGame.state.rod='twig';rodGame.state.bait='plain';assert.equal(rodGame.cast(),true);rodGame.phase=PHASES.BITE;rodGame.state.rod='starline';rodGame.update(.01,{reel:true});assert.equal(rodGame.phase,PHASES.FIGHT);assert.equal(rodGame.fight.rodControl,RODS.find(r=>r.id==='twig').control);const baitGame=new FishingGame({store:new SaveStore(memoryStore())});baitGame.state.bait='plain';assert.equal(baitGame.cast(),true);baitGame.phase=PHASES.BITE;baitGame.timer=2.3;baitGame.state.bait='spark';baitGame.update(.01,{reel:false});assert.equal(baitGame.phase,PHASES.ESCAPED)});
test('location, conditions and equipment setup are locked during an active encounter',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});game.state.essence=2000;assert.equal(game.cast(),true);const conditions={timeOfDay:game.state.timeOfDay,weather:game.state.weather};assert.equal(game.setConditions('night','rain'),false);assert.deepEqual({timeOfDay:game.state.timeOfDay,weather:game.state.weather},conditions);assert.equal(game.unlockZone('hollow'),false);game.state.zoneUnlocked.hollow=true;assert.equal(game.selectZone('hollow'),false);assert.equal(game.selectZone('__proto__'),false);assert.equal(game.selectZone('toString'),false);assert.equal(game.buyRod('bamboo'),false);assert.equal(game.buyBait('glow'),false);assert.equal(game.equipRod('twig'),false);assert.equal(game.equipBait('plain'),false);assert.equal(game.state.zone,'pond');assert.equal(game.state.essence,2000);});

test('rod control is snapshotted when an encounter hooks so mid-fight equipment changes cannot alter it',()=>{const game=new FishingGame({store:new SaveStore(memoryStore())});game.state.rod='twig';game.fish=FISH[0];game.phase=PHASES.BITE;game.timer=0;game.update(.01,{reel:true});assert.equal(game.phase,PHASES.FIGHT);assert.equal(game.fight.rodControl,RODS.find(r=>r.id==='twig').control);game.state.rod='carbon';assert.equal(game.fight.rodControl,RODS.find(r=>r.id==='twig').control);});

test('active-move feedback does not announce a successful read before the maneuver resolves',()=>{const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');assert.ok(main.includes('Counter looks good so far—finish the move.'));assert.ok(!main.includes('Good read. Keep countering.'))});


test('save hydration accepts legitimately generated specimen extremes for every Goop',()=>{
  for(const fish of FISH){
    for(const [percentile,lengthRoll] of [[0,0],[0,1],[.1,0],[.5,1],[.91,0],[.985,1],[.9999,0],[.9999,1]]){
      const rolls=[percentile,lengthRoll],specimen={...sampleCatchMetrics(fish,()=>rolls.shift()),id:'catch-1',fishId:fish.id,day:1};
      const storage=memoryStore();storage.v=JSON.stringify({version:4,total:1,specimens:[specimen]});
      const restored=new SaveStore(storage).load();
      assert.equal(restored.specimens.length,1,fish.id+' percentile '+percentile+' length roll '+lengthRoll);
      assert.equal(restored.lastCatch.fishId,fish.id);
    }
  }
});


test('GoopDex search and filter controls expose accessible names',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<input id="dexSearch"[^>]*aria-label="Search GoopDex species"/);
  assert.match(html,/<select id="dexFilter"[^>]*aria-label="Filter GoopDex species"/);
});


test('fight meters expose named progress values for assistive technology',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  for(const id of ['tensionMeter','staminaMeter','patienceMeter','spookMeter','intentMeter']){
    assert.match(html,new RegExp('id="'+id+'" role="progressbar"'));
  }
  for(const label of ['Fishing line tension','Goop energy','Goop approach progress','Goop spook level','Fish maneuver timing']) assert.ok(html.includes('aria-label="'+label+'"'));
  for(const id of ['tensionMeter','staminaMeter','patienceMeter','spookMeter','intentMeter']) assert.ok(main.includes("$('"+id+"').setAttribute('aria-valuenow'"));
});


function catchWithSpecimen(game,fish,overrides={}){
  game.fish=fish;
  game.fight={specimen:{...sampleCatchMetrics(fish,()=>0.5),...overrides},progress:1,moveHistory:[],movesRead:0,movesAttempted:0,style:'tension'};
  game.finishCatch();
}

test('cast rejects an empty spawn pool without entering an encounter',()=>{
  const game=new FishingGame({store:new SaveStore(memoryStore()),rng:()=>0.5});
  const originalZone=game.zone;
  game.zone=()=>({...originalZone.call(game),fish:[]});
  assert.equal(game.cast(),false);
  assert.equal(game.phase,PHASES.IDLE);
  assert.equal(game.fish,null);
  assert.equal(game.events.some(event=>event.type==='cast'),false);
});

test('new collection records clear the previous specimen badge',()=>{
  const game=new FishingGame({store:new SaveStore(memoryStore())});
  const fish=FISH.find(f=>f.id==='glacieroo');
  catchWithSpecimen(game,fish,{weightLb:100,lengthIn:60});
  const firstId=game.state.lastCatch.id;
  assert.equal(game.state.lastCatch.collectionRecord,true);
  catchWithSpecimen(game,fish,{weightLb:200,lengthIn:70});
  assert.equal(game.state.specimens.find(s=>s.id===firstId).collectionRecord,false);
  assert.equal(game.state.lastCatch.collectionRecord,true);
});

test('species record tie badges remain unique across save and reload',()=>{
  const storage=memoryStore(),store=new SaveStore(storage),game=new FishingGame({store});
  const fish=FISH.find(f=>f.id==='gloop');
  const specimen=sampleCatchMetrics(fish,()=>0.5);
  catchWithSpecimen(game,fish,specimen);
  const winnerId=game.state.lastCatch.id;
  catchWithSpecimen(game,fish,specimen);
  let flagged=game.state.specimens.filter(s=>s.fishId==='gloop'&&s.speciesRecord);
  assert.equal(flagged.length,1);
  assert.equal(flagged[0].id,winnerId);
  const reloaded=new FishingGame({store:new SaveStore(storage)});
  flagged=reloaded.state.specimens.filter(s=>s.fishId==='gloop'&&s.speciesRecord);
  assert.equal(flagged.length,1);
  assert.equal(flagged[0].id,winnerId);
});

test('hydration discards a pending catch with a null specimen',()=>{
  const base=new SaveStore(null).fresh();
  base.pendingCatch={fishId:'gloop',reward:10,specimen:null};
  const storage=memoryStore();
  new SaveStore(storage).save(base);
  const game=new FishingGame({store:new SaveStore(storage)});
  assert.equal(game.state.pendingCatch,null);
});

test('rare achievement is derived from persistent dex data, not current fish',()=>{
  const game=new FishingGame({store:new SaveStore(memoryStore())});
  game.state.dex.starry={count:1,rarity:'Legendary',bestWeightLb:3,bestLengthIn:40};
  game.fish=null;
  game.checkAchievements();
  assert.equal(game.state.achievements.rare,true);
});

test('shop purchases and unlocks roll back all state when save fails',()=>{
  const makeFailingGame=()=>new FishingGame({store:{load:()=>({...new SaveStore(null).fresh(),essence:2000}),save:()=>false}});
  for(const [method,id] of [['buyRod','bamboo'],['buyBait','glow'],['unlockZone','hollow']]){
    const game=makeFailingGame(),before=JSON.parse(JSON.stringify(game.state));
    assert.equal(game[method](id),false,method);
    assert.deepEqual(game.state,before,method);
  }
});

test('equipment and zone selection roll back when save fails',()=>{
  const game=new FishingGame({store:{load:()=>({...new SaveStore(null).fresh(),ownedRods:['twig','bamboo'],ownedBaits:['plain','glow'],zoneUnlocked:{pond:true,hollow:true}}),save:()=>false}});
  for(const [method,id] of [['equipRod','bamboo'],['equipBait','glow'],['selectZone','hollow']]){
    const before=JSON.parse(JSON.stringify(game.state));
    assert.equal(game[method](id),false,method);
    assert.deepEqual(game.state,before,method);
  }
});
 
test('fishing view includes an accessible quick-start guide for both fight styles',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../src/style.css',import.meta.url),'utf8');
  const guide=html.match(/<details id="quickStart" class="quick-start" open>([\s\S]*?)<\/details>/)?.[1]||'';
  assert.ok(guide.includes('<summary>'));
  for(const instruction of ['CAST LINE','HOLD TO REEL','TAP IN RHYTHM','SELL CATCH','KEEP CATCH']) assert.ok(guide.includes(instruction),instruction);
  assert.ok(css.includes('.quick-start-grid{display:grid'));
  assert.ok(css.includes('@media(max-width:420px)'));
});
