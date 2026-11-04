import {describe,expect,it} from 'vitest';
import {createRng} from '../rng.ts';
import {generatePuzzle} from '../sudoku/generator.ts';
import {analyzePuzzle} from '../sudoku/logic.ts';
import {parseGrid} from '../sudoku/grid.ts';
import {BOT_LEVELS,chooseBotMove,logicalMoves,tacticalScore,wouldCloseBox} from './bot.ts';
import {createDuel,playDuelMove,timeoutTurn} from './duel.ts';
const SOLUTION=parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
const PERFECT={...BOT_LEVELS.hard,mistakeRate:0};
const boardWithout=(...cells:number[])=>SOLUTION.map((d,c)=>cells.includes(c)?0:d);

describe('logical training bots',()=>{
  it('uses only publicly deducible moves and never mutates the board while thinking',()=>{
    const puzzle=generatePuzzle(7,'medium'),state=createDuel(puzzle.givens,1),rng=createRng(1);
    for(let i=0;i<20;i++){
      const before=JSON.parse(JSON.stringify(state)),move=chooseBotMove(state,PERFECT,rng)!;
      expect(state).toEqual(before);expect(move).not.toBeNull();expect(state.board[move.cell]).toBe(0);
      expect(move.digit).toBe(puzzle.solution[move.cell]);state.board[move.cell]=move.digit;
    }
  });
  it('has separate technique limits and waits instead of consulting a solution',()=>{
    const medium=generatePuzzle(42,'medium'),hidden=analyzePuzzle(medium.givens,'easy').grid;
    expect(logicalMoves(hidden,'easy')).toEqual([]);expect(logicalMoves(hidden,'medium').length).toBeGreaterThan(0);
    const hard=generatePuzzle(42,'hard'),advanced=analyzePuzzle(hard.givens,'medium').grid;
    expect(logicalMoves(advanced,'medium')).toEqual([]);expect(logicalMoves(advanced,'hard').length).toBeGreaterThan(0);
    expect(chooseBotMove(createDuel(advanced,1),BOT_LEVELS.easy,createRng(1))).toBeNull();
    expect(chooseBotMove(createDuel(new Array(81).fill(0),1),PERFECT,createRng(1))).toBeNull();
    for(const move of logicalMoves(advanced,'hard'))expect(move.digit).toBe(hard.solution[move.cell]);
  });
  it('a tactical bot prefers a doubled hit rather than a smaller opportunity',()=>{
    const state=createDuel(boardWithout(0,79,80),1);
    expect(wouldCloseBox(state.board,0)).toBe(true);
    expect(chooseBotMove(state,PERFECT,createRng(3))!.cell).toBe(0);
  });
  it('penalizes handing the rival a box on the last ordinary move',()=>{
    const state=createDuel(boardWithout(70,80,3,4,12,17,72),1);state.movesLeft=1;
    const moves=logicalMoves(state.board,'hard'),safe=moves.find(m=>m.cell===3)!,risky=moves.find(m=>m.cell===80)!;
    expect(tacticalScore(state,safe)).toBeGreaterThan(tacticalScore(state,risky));
    expect(chooseBotMove(state,PERFECT,createRng(3))!.cell).not.toBe(80);
  });
  it('a smart bot makes better visible-board decisions than a random selection',()=>{
    const state=createDuel(boardWithout(70,80,3,4,12,17,72),1);state.movesLeft=1;
    let smart=0,random=0;const a=createRng(25),b=createRng(25);
    for(let i=0;i<100;i++){
      smart+=tacticalScore(state,chooseBotMove(state,PERFECT,a)!);
      random+=tacticalScore(state,chooseBotMove(state,{...PERFECT,smart:false},b)!);
    }
    expect(smart).toBeGreaterThan(random);
  });
  it('keeps novice thinking time slower and bounded, with occasional reproducible slips',()=>{
    expect(BOT_LEVELS.easy.thinkMs[0]).toBeGreaterThan(BOT_LEVELS.hard.thinkMs[1]);
    const state=createDuel(boardWithout(0,79,80),1),rng=createRng(5);let wrong=0;
    for(let i=0;i<2000;i++){const m=chooseBotMove(state,BOT_LEVELS.easy,rng)!;if(m.digit!==SOLUTION[m.cell])wrong++;}
    expect(wrong/2000).toBeGreaterThan(.05);expect(wrong/2000).toBeLessThan(.11);
  });
  it('can finish a duel with normal turn and timeout rules',()=>{
    for(const difficulty of ['easy','medium','hard'] as const){
      const p=generatePuzzle(11,difficulty),state=createDuel(p.givens,0),rng=createRng(11);
      for(let i=0;i<500&&!state.finished;i++){
        const move=chooseBotMove(state,BOT_LEVELS.hard,rng);
        if(move)expect(playDuelMove(state,p.solution,state.turn,move.cell,move.digit).ok).toBe(true);else timeoutTurn(state);
      }
      expect(state.finished).toBe(true);
    }
  });
});
