import test from 'node:test';
import assert from 'node:assert/strict';
import { FISH, ZONES, weightedPick, createFight, fightTick, FishingGame, SaveStore, PHASES, levelXP, BEHAVIOR_INFO, MOVE_INFO, availableMovesFor, personalityFor } from '../src/game.js';

function memoryStore(){return {v:null,getItem(){return this.v},setItem(k,v){this.v=v},removeItem(){this.v=null}}}

test('fish roster and locations are populated',()=>{
  assert.ok(FISH.length>=25);
  assert.ok(ZONES.length>=4);
  assert.equal(new Set(FISH.map(f=>f.id)).size,FISH.length);
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
  assert.equal(new SaveStore(storage).load().version,3);
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
  assert.equal(game.sell(),true);
  assert.equal(game.state.essence,reward);
  assert.equal(game.state.sales,reward);
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
