import { applyMove } from '../sudoku/moves.ts';
import { parseGrid, type Grid, type Unit } from '../sudoku/grid.ts';
import { closesBox, moveDamage } from '../battle/battle.ts';
import { createDuel, playDuelMove, type DuelState } from '../duel/duel.ts';

export const LESSON_IDS = ['notes','box','extra','defense'] as const;
export type LessonId = typeof LESSON_IDS[number];
export const LESSONS: Record<LessonId,{title:string;subtitle:string;holes:number[];targets:number[]}> = {
  notes:{title:'Ręczne notatki',subtitle:'Dodawanie i usuwanie własnych kandydatów',holes:[40,41,42],targets:[40]},
  box:{title:'Kwadrat ×2',subtitle:'Dlaczego zamknięcie kwadratu wzmacnia cios',holes:[0,3,4,12,80],targets:[0]},
  extra:{title:'Dodatkowy ruch',subtitle:'Zwykły ruch i domknięcie jednostki',holes:[0,1,9,80],targets:[0,1]},
  defense:{title:'Nie oddawaj kwadratu',subtitle:'Wybór ostatniego ruchu w turze',holes:[70,80,3,4,12,17,72],targets:[3,80]},
};
const SOLUTION = parseGrid('483921657967345821251876493548132976729564138136798245372689514814253769695417382');
export interface LessonAction { kind:'note'|'digit'; cell:number; digit:number }
export interface LessonSession {
  id:LessonId; givens:Grid; grid:Grid; notes:number[]; step:number;
  status:'active'|'complete'|'retry'; duel:DuelState; actions:LessonAction[]; damage:number; replyDamage:number;
}
export function createLesson(id:LessonId):LessonSession {
  const givens=SOLUTION.map((d,c)=>LESSONS[id].holes.includes(c)?0:d);
  const duel=createDuel(givens,0); if(id==='defense')duel.movesLeft=1;
  return {id,givens,grid:[...givens],notes:new Array(81).fill(0),step:0,status:'active',duel,actions:[],damage:0,replyDamage:0};
}
export function lessonText(s:LessonSession):string {
  if(s.status==='retry')return 'Ten ruch oddał rywalowi gotowy kwadrat: jego 6 zadało 12 obrażeń. Spróbuj drugiego wyboru.';
  if(s.status==='complete')return {
    notes:'Notatki należą do Ciebie. Gra ich nie sprawdza ani nie skreśla w sąsiednich polach.',
    box:'Cyfra 4 zamknęła kwadrat: 4 × 2 = 8 obrażeń. Sam wiersz lub kolumna nie podwaja obrażeń.',
    extra:'Zwykły cios zużył ruch. Domknięcie jednostki zachowało pozostałe 2 ruchy w tej samej turze.',
    defense:'Cios za 9 obrażeń nie zostawił rywalowi nowego gotowego kwadratu. Ważna jest też plansza po Twoim ruchu.',
  }[s.id];
  switch(s.id){
    case 'notes':return [
      'Środkowe pole (wiersz 5, kolumna 5): włącz Notatki i wpisz 2 oraz 7. To ćwiczenie obsługi, nie podpowiedź.',
      'Usuń ręcznie notatkę 2: dotknij 2 jeszcze raz. Pozostaw notatkę 7. Gra nie sprząta notatek za Ciebie.',
      'Wyłącz Notatki. Wpisz 6 w środkowe pole. Tylko notatki tego wypełnionego pola znikną.',
    ][s.step];
    case 'box':return 'Wpisz 4 w lewym górnym polu. To ostatnie puste pole tego kwadratu 3×3: obserwuj obrażenia.';
    case 'extra':return s.step===0?'Wpisz 4 w wierszu 1, kolumnie 1. Ten zwykły cios zużyje jeden z 3 ruchów.'
      :'Teraz wpisz 8 obok (wiersz 1, kolumna 2). Domkniesz wiersz: ten cios nie zużyje ruchu.';
    case 'defense':return 'Ostatni ruch tury: porównaj 9 (wiersz 1, kolumna 4) i 2 (wiersz 9, kolumna 9). Który nie odda kwadratu rywalowi?';
  }
}
export interface LessonResult { accepted:boolean; message?:string; cell?:number; digit?:number; completed?:Unit[] }
/** Only the dedicated lesson screen calls this; ordinary games never receive lesson assistance. */
export function actInLesson(s:LessonSession, action:LessonAction):LessonResult {
  const {cell,digit}=action;
  if(s.status!=='active'||s.actions.length>=512||!Number.isInteger(cell)||cell<0||cell>80||
      !Number.isInteger(digit)||digit<1||digit>9||!['note','digit'].includes(action.kind)||s.grid[cell]!==0)return {accepted:false};
  if(action.kind==='note'){
    s.notes[cell]^=1<<digit;
    if(s.id==='notes'&&cell===40){
      if(s.step===0&&(s.notes[40]&(1<<2))&&(s.notes[40]&(1<<7)))s.step=1;
      else if(s.step===1&&!(s.notes[40]&(1<<2))&&(s.notes[40]&(1<<7)))s.step=2;
    }
    s.actions.push({...action});return {accepted:true};
  }
  const expected=s.id==='notes'?[40]:s.id==='extra'?[s.step===0?0:1]:LESSONS[s.id].targets;
  if((s.id==='notes'&&s.step!==2)||!expected.includes(cell))return {accepted:false,message:'W tej lekcji użyj pola wskazanego w opisie.'};
  if(digit!==SOLUTION[cell])return {accepted:false,message:'Ta cyfra nie pasuje. Spróbuj ponownie — lekcja nie zabiera HP.'};
  const result=applyMove(s.grid,SOLUTION,cell,digit);
  if(result.kind!=='correct')return {accepted:false};
  s.notes[cell]=0;
  if(s.id==='extra'||s.id==='defense'){
    const played=playDuelMove(s.duel,SOLUTION,0,cell,digit);
    if(!played.ok||played.event.kind!=='correct')throw new Error('Invalid lesson script');
    s.damage=played.event.damage;
  }else s.damage=moveDamage(digit,closesBox(result.completed));
  s.actions.push({...action});s.step++;
  if(s.id==='defense'&&cell===80){
    const reply=playDuelMove(s.duel,SOLUTION,1,70,SOLUTION[70]);
    if(!reply.ok||reply.event.kind!=='correct')throw new Error('Invalid lesson reply');
    s.grid=[...s.duel.board];s.replyDamage=reply.event.damage;s.status='retry';
  }else if(s.id!=='extra'||s.step===2)s.status='complete';
  return {accepted:true,cell,digit,completed:result.completed};
}
/** Restore by replaying a bounded script, not by trusting saved goals or completion flags. */
export function restoreLesson(id:LessonId, actions:unknown):LessonSession|null {
  if(!Array.isArray(actions)||actions.length>512)return null;
  const s=createLesson(id);
  for(const action of actions){if(!action||typeof action!=='object'||!actInLesson(s,action).accepted)return null;}
  return s;
}
