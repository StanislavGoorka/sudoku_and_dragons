import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {analyzePuzzle,generatePuzzle} from '../../core/index.ts';
vi.mock('./online.ts',()=>({OnlineError:class extends Error {code:string;constructor(code:string){super(code);this.code=code;}}}));
vi.mock('../puzzleGeneration.ts',async()=>{const {generatePuzzle}=await import('../../core/sudoku/generator.ts');return{generatePuzzleAsync:async(seed:number,d:'easy'|'medium'|'hard')=>generatePuzzle(seed,d)};});
beforeEach(()=>{vi.resetModules();vi.useFakeTimers();vi.setSystemTime(100000);vi.stubGlobal('window',globalThis);
 const rows=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>rows.set(k,v),removeItem:(k:string)=>rows.delete(k)});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('offline training referee',()=>{
 it('separates strength from puzzle difficulty and freezes the turn clock while paused',async()=>{
  const {BotDuel}=await import('./botDuel.ts');const bot:any=new BotDuel('hard','you',42,'easy');const {duel}=await bot.start();
  expect(bot.strength).toBe('easy');expect(duel.difficulty).toBe('hard');expect(bot.ranked).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);bot.pauseTraining();const paused=bot.now();
  await vi.advanceTimersByTimeAsync(90000);expect(bot.now()).toBe(paused);
  const ui={notes:new Array(81).fill(0),notesMode:true,selected:duel.state.board.indexOf(0)};
  bot.checkpointTraining(duel.id,ui);const {trainingData}=await import('../training/store.ts');const saved=trainingData().bot!;
  expect(saved.remainingMs).toBe(25000);
  const restored=BotDuel.restore(saved);expect(restored.duel.state).toEqual(saved.state);
  expect(restored.backend.now()-Date.parse(restored.duel.turn_started_at!)).toBe(5000);
  await vi.advanceTimersByTimeAsync(60000);restored.backend.resumeTraining();
  expect(restored.backend.now()-Date.parse(restored.duel.turn_started_at!)).toBe(5000);
 });
 it('a stumped novice does not play a solution digit and the usual timeout passes its turn',async()=>{
  const {BotDuel}=await import('./botDuel.ts');const bot:any=new BotDuel('medium','you',42,'easy');const {duel}=await bot.start();
  const game=bot.games.get(duel.id),puzzle=generatePuzzle(42,'medium');
  game.solution=puzzle.solution;game.row.state.board=analyzePuzzle(puzzle.givens,'easy').grid;game.row.state.turn=1;
  const initial=[...game.row.state.board],version=game.row.version;
  const stop=bot.watch(duel.id,()=>{});await vi.advanceTimersByTimeAsync(10000);
  expect(game.row.state.board).toEqual(initial);expect(game.row.version).toBe(version);
  await vi.advanceTimersByTimeAsync(20001);await bot.claimTimeout(duel.id);expect(game.row.state.turn).toBe(0);
  expect(game.row.state.idleTurns[1]).toBe(1);stop();
 });
 it('a delayed bot callback passes the expired turn instead of placing a stale digit',async()=>{
  const {BotDuel}=await import('./botDuel.ts');const bot:any=new BotDuel('easy','you',42,'hard');const {duel}=await bot.start();
  const game=bot.games.get(duel.id);game.row.state.turn=1;
  const initial=[...game.row.state.board];const stop=bot.watch(duel.id,()=>{});
  await vi.advanceTimersByTimeAsync(0);
  // Simulate a suspended browser: wall time jumps while scheduled callbacks cannot run.
  vi.setSystemTime(160000);await vi.advanceTimersByTimeAsync(10000);
  expect(game.row.state.board).toEqual(initial);expect(game.row.state.turn).toBe(0);
  expect(game.row.state.idleTurns[1]).toBe(1);stop();
 });
 it('a rematch from a restored result starts with a running clock',async()=>{
  const {BotDuel}=await import('./botDuel.ts');const bot:any=new BotDuel('easy','you',42,'hard');const {duel}=await bot.start();
  const game=bot.games.get(duel.id);game.row.state.finished=true;game.row.state.winner=0;
  bot.checkpointTraining(duel.id,{notes:new Array(81).fill(0),notesMode:false,selected:null});
  const {trainingData}=await import('../training/store.ts');const restored=BotDuel.restore(trainingData().bot!);
  const next=await restored.backend.rematch(restored.duel.id);expect(next.duel!.state.finished).toBe(false);
  const before=restored.backend.now();await vi.advanceTimersByTimeAsync(1000);
  expect(restored.backend.now()-before).toBe(1000);expect(restored.backend.strength).toBe('hard');
 });
});
