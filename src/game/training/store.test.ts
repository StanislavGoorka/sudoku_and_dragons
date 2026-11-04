import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {createBattle,ENEMIES,generatePuzzle,createDuel} from '../../core/index.ts';
import type {SavedBattle} from '../progress/battleSave.ts';
import {actInLesson,createLesson} from '../../core/training/lessons.ts';

let rows:Map<string,string>;
beforeEach(()=>{vi.resetModules();rows=new Map();vi.stubGlobal('localStorage',{
 getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>rows.set(key,value),removeItem:(key:string)=>rows.delete(key),
});});
afterEach(()=>vi.unstubAllGlobals());
const solo=():SavedBattle=>{const puzzle=generatePuzzle(42,'easy');return{version:1,puzzle,grid:[...puzzle.givens],battle:createBattle(ENEMIES.easy),
 notes:new Array(81).fill(0),notesMode:false,selected:null,mistakes:0,bestCombo:0,elapsed:10};};
describe('independent training storage',()=>{
 it('keeps solo and lessons across reload without touching campaign progress',async()=>{
  rows.set('sudoku-dragons.progress','campaign-marker');
  const store=await import('./store.ts');store.saveTrainingSolo(solo());
  const lesson=createLesson('extra');actInLesson(lesson,{kind:'digit',cell:0,digit:4});
  store.saveTrainingLesson({version:1,id:'extra',actions:lesson.actions,notesMode:true,selected:1});
  store.setTrainingSettings('hard','easy');vi.resetModules();
  const resumed=await import('./store.ts');expect(resumed.trainingData().solo).toEqual(solo());
  expect(resumed.trainingData().lessons.extra!.actions).toEqual(lesson.actions);
  expect(resumed.trainingData().settings).toEqual({board:'hard',strength:'easy'});
  expect(rows.get('sudoku-dragons.progress')).toBe('campaign-marker');
 });
 it('records completion separately from a replay and never awards a currency',async()=>{
  const store=await import('./store.ts');const lesson=createLesson('box');actInLesson(lesson,{kind:'digit',cell:0,digit:4});
  store.saveTrainingLesson({version:1,id:'box',actions:lesson.actions,notesMode:false,selected:0});
  store.saveTrainingLesson({version:1,id:'box',actions:[],notesMode:false,selected:0});
  expect(store.trainingData().completed).toEqual(['box']);
  expect(store.trainingData().lessons.box!.actions).toEqual([]);
  expect(rows.has('sudoku-dragons.progress')).toBe(false);
 });
 it('rejects broken checkpoints and out-of-sequence lessons on load',async()=>{
  rows.set('sudoku-dragons.training',JSON.stringify({version:1,solo:{...solo(),stage:'valley-1'},bot:{version:999},
   lessons:{notes:{version:1,id:'notes',actions:[{kind:'digit',cell:40,digit:6}],notesMode:false,selected:40}}}));
  const store=await import('./store.ts');expect(store.trainingData().solo).toBeNull();expect(store.trainingData().bot).toBeNull();
  expect(store.trainingData().lessons).toEqual({});
 });
 it('keeps training in memory when writes fail and clears both memory and disk with data deletion',async()=>{
  const store=await import('./store.ts');vi.stubGlobal('localStorage',{getItem:()=>null,setItem:()=>{throw Error('full');},removeItem:(key:string)=>rows.delete(key)});
  expect(store.saveTrainingSolo(solo())).toBe(false);expect(store.trainingPersisted()).toBe(false);
  expect(store.trainingData().solo).not.toBeNull();
  const {clearTrainingData}=await import('./storageKey.ts');clearTrainingData();expect(store.trainingData().solo).toBeNull();
 });
 it('validates a bot board, turn remainder and arbitrary manual notes',async()=>{
  const p=generatePuzzle(42,'easy');const note=p.givens.indexOf(0),notes=new Array(81).fill(0);notes[note]=(1<<2)|(1<<7);
  const {parseBotCheckpoint}=await import('./botSave.ts');
  const saved={version:1,difficulty:'easy',strength:'hard',givens:p.givens,solution:p.solution,state:createDuel(p.givens,0),remainingMs:17890,
    notes,notesMode:true,selected:note};
  expect(parseBotCheckpoint(saved)).toEqual(saved);
  for(const changes of [{remainingMs:30001},{strength:'bad'},{notes:[2]},{state:{...saved.state,movesLeft:0}},
   {solution:new Array(81).fill(1)}])expect(parseBotCheckpoint({...saved,...changes})).toBeNull();
 });
});
