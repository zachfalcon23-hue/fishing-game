import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, ZONES, weightedPick, createFight, fightTick, FishingGame, SaveStore, PHASES, levelXP, BEHAVIOR_INFO, MOVE_INFO, availableMovesFor, personalityFor, CATCH_PROFILES, sampleCatchMetrics, spawnWeightFor, QUESTS, questProgress } from '../src/game.js';

function memoryStore(){return {v:null,getItem(){return this.v},setItem(k,v){this.v=v},removeItem(){this.v=null}}}

test('fish roster and locations are populated',()=>{
  assert.ok(FISH.length>=50);
  assert.ok(ZONES.length>=4);
  assert.equal(new Set(FISH.map(f=>f.id)).size,FISH.length);
  assert.equal(FISH.length,50);
  assert.ok(FISH.every(f=>CATCH_PROFILES[f.id]));
  const ids=new Set(FISH.map(f=>f.id));
  assert.ok(ZONES.every(z=>z.fish.every(id=>ids.has(id))),'every zone fish must exist in the GoopDex roster');
});

test('weighted pick handles empty pools and deterministic outcomes',()=>{
  assert.equal(weightedPick([]),null);
  const pool=[{weight:1,id:'a'},{weight:3,id:'b'}];
  assert.equal(weightedPick(pool,()=>0).id,'a');
  assert.equal(weightedPick(pool,()=>.5).id,'b');
});

test('fight tension stays bounded',()=>{
  const fight=createFight(FISH[0]);
  for(let i=0;i<500;i++)fightTick(fight,{reel:i%2===0},.05);
  assert.ok(fight.tension>=0&&fight.tension<=1);
});

test('save store safely handles corrupt data',()=>{
  const storage={v:'bad',getItem(){return this.v},setItem(k,v){this.v=v},removeItem(){this.v=null}};
  assert.equal(new SaveStore(storage).load().version,4);
});

test('casting progresses to bite and hooking',()=>{
  const game=new FishingGame({rng:()=>0,store:new SaveStore(memoryStore())});
  assert.equal(game.cast(),true);
  for(let i=0;i<20;i++)game.update(.06,{});
  assert.equal(game.phase,PHASES.BITE);
  game.update(.01,{reel:true});
  assert.equal(game.phase,PHASES.FIGHT);
});

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
