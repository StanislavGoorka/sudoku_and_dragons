import { countSolutions, isSolved, type Difficulty, type DuelState, type Grid } from '../../core/index.ts';
import type { BotStrength } from '../../core/duel/bot.ts';
export interface TrainingUi {notes:number[];notesMode:boolean;selected:number|null}
export interface BotCheckpoint extends TrainingUi {
  version:1; difficulty:Difficulty; strength:BotStrength; givens:Grid; solution:Grid; state:DuelState; remainingMs:number;
  replay?: unknown;
  replayElapsed?: number;
}
const integer=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
export function parseTrainingUi(value:unknown,board:Grid):TrainingUi|null {
  const s=value as TrainingUi;
  if(!s||!Array.isArray(s.notes)||s.notes.length!==81||!s.notes.every(n=>integer(n,0,1022)&&!(n&1))||
    typeof s.notesMode!=='boolean'||(s.selected!==null&&!integer(s.selected,0,80)))return null;
  return {notes:s.notes.map((n,c)=>board[c]?0:n),notesMode:s.notesMode,selected:s.selected};
}
export function parseBotCheckpoint(value:unknown):BotCheckpoint|null {
  const s=value as BotCheckpoint;
  if(!s||s.version!==1||!['easy','medium','hard'].includes(s.difficulty)||!['easy','medium','hard'].includes(s.strength)||
    !Array.isArray(s.solution)||s.solution.length!==81||!s.solution.every(d=>integer(d,1,9))||!isSolved(s.solution)||
    !Array.isArray(s.givens)||s.givens.length!==81||!s.givens.every((d,c)=>integer(d,0,9)&&(!d||d===s.solution[c]))||countSolutions(s.givens)!==1)return null;
  const state=s.state;
  if(!state||!Array.isArray(state.board)||state.board.length!==81||!state.board.every((d,c)=>integer(d,0,9)&&
    (s.givens[c]?d===s.givens[c]:!d||d===s.solution[c]))||!Array.isArray(state.hp)||state.hp.length!==2||
    !state.hp.every(hp=>integer(hp,0,130))||!integer(state.turn,0,1)||!integer(state.movesLeft,1,3)||
    !Array.isArray(state.idleTurns)||state.idleTurns.length!==2||!state.idleTurns.every(n=>integer(n,0,3))||
    typeof state.finished!=='boolean'||(state.winner!==null&&!integer(state.winner,0,1))||
    (!state.finished&&(state.hp.includes(0)||!state.board.includes(0)||state.winner!==null))||
    typeof s.remainingMs!=='number'||!Number.isFinite(s.remainingMs)||s.remainingMs<0||s.remainingMs>30000)return null;
  const ui=parseTrainingUi(s,state.board);if(!ui)return null;
  return {...ui,version:1,difficulty:s.difficulty,strength:s.strength,givens:[...s.givens],solution:[...s.solution],
    state:structuredClone(state),remainingMs:s.remainingMs,replay:s.replay,
    replayElapsed:integer(s.replayElapsed,0,Number.MAX_SAFE_INTEGER)?s.replayElapsed:undefined};
}
