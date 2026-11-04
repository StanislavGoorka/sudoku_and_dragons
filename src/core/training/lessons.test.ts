import {describe,expect,it} from 'vitest';
import {actInLesson,createLesson,lessonText,LESSON_IDS,restoreLesson} from './lessons.ts';
import {countSolutions} from '../sudoku/solver.ts';

describe('offline lesson scripts',()=>{
  it('uses uniquely solvable boards and never fills notes automatically',()=>{
    for(const id of LESSON_IDS){const s=createLesson(id);expect(countSolutions(s.givens)).toBe(1);expect(s.notes.every(n=>n===0)).toBe(true);}
  });
  it('teaches manual addition, manual removal and clearing only the played cell',()=>{
    const s=createLesson('notes');
    expect(actInLesson(s,{kind:'note',cell:41,digit:3}).accepted).toBe(true);
    actInLesson(s,{kind:'note',cell:40,digit:2});actInLesson(s,{kind:'note',cell:40,digit:7});expect(s.step).toBe(1);
    expect(s.notes[40]).toBe((1<<2)|(1<<7));
    actInLesson(s,{kind:'note',cell:40,digit:2});expect(s.step).toBe(2);
    actInLesson(s,{kind:'digit',cell:40,digit:6});expect(s.status).toBe('complete');
    expect(s.notes[40]).toBe(0);expect(s.notes[41]).toBe(1<<3);
    expect(restoreLesson('notes',s.actions)).toEqual(s);
  });
  it('the box lesson deals twice the digit value under the actual rules',()=>{
    const s=createLesson('box'),r=actInLesson(s,{kind:'digit',cell:0,digit:4});
    expect(r.completed?.some(u=>u.kind==='box')).toBe(true);expect(s.damage).toBe(8);expect(s.status).toBe('complete');
  });
  it('ordinary moves consume a move while closing a row preserves the remainder',()=>{
    const s=createLesson('extra');
    actInLesson(s,{kind:'digit',cell:0,digit:4});expect(s.duel.movesLeft).toBe(2);expect(s.duel.turn).toBe(0);
    actInLesson(s,{kind:'digit',cell:1,digit:8});expect(s.duel.movesLeft).toBe(2);expect(s.duel.turn).toBe(0);
    expect(s.status).toBe('complete');expect(s.duel.hp[1]).toBe(118);
  });
  it('demonstrates the real counterattack after a dangerous last move and accepts the safe choice',()=>{
    const risky=createLesson('defense');actInLesson(risky,{kind:'digit',cell:80,digit:2});
    expect(risky.status).toBe('retry');expect(risky.replyDamage).toBe(12);expect(risky.duel.hp[0]).toBe(118);
    const safe=createLesson('defense');actInLesson(safe,{kind:'digit',cell:3,digit:9});
    expect(safe.status).toBe('complete');expect(safe.replyDamage).toBe(0);expect(safe.duel.hp[0]).toBe(130);
    expect(safe.duel.turn).toBe(1);expect(safe.damage).toBe(9);
  });
  it('rejects out-of-sequence moves, wrong digits and invalid saves without advancing goals',()=>{
    const s=createLesson('notes');
    for(const action of [{kind:'digit' as const,cell:40,digit:6},{kind:'note' as const,cell:0,digit:2},{kind:'note' as const,cell:90,digit:2}])expect(actInLesson(s,action).accepted).toBe(false);
    expect(s.step).toBe(0);expect(restoreLesson('notes',[{kind:'digit',cell:40,digit:6}])).toBeNull();
    expect(restoreLesson('box',new Array(513).fill({kind:'note',cell:0,digit:2}))).toBeNull();
    const box=createLesson('box');expect(actInLesson(box,{kind:'digit',cell:0,digit:5}).accepted).toBe(false);
    expect(box.grid).toEqual(box.givens);expect(box.status).toBe('active');
  });
  it('replays partial lessons exactly and supplies instructions for every state',()=>{
    for(const id of LESSON_IDS){const s=createLesson(id);expect(lessonText(s).length).toBeGreaterThan(20);expect(restoreLesson(id,[])).toEqual(s);}
  });
});
