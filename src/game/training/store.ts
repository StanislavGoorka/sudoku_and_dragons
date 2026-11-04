import type { Difficulty } from '../../core/index.ts';
import { LESSON_IDS, restoreLesson, type LessonAction, type LessonId } from '../../core/training/lessons.ts';
import type { BotStrength } from '../../core/duel/bot.ts';
import { parseSavedBattle, type SavedBattle } from '../progress/battleSave.ts';
import { parseBotCheckpoint, parseTrainingUi, type BotCheckpoint } from './botSave.ts';
import { TRAINING_KEY, onTrainingCleared } from './storageKey.ts';

export interface LessonCheckpoint {version:1;id:LessonId;actions:LessonAction[];notesMode:boolean;selected:number|null}
interface TrainingData {
  version:1; settings:{board:Difficulty;strength:BotStrength};solo:SavedBattle|null;bot:BotCheckpoint|null;
  lessons:Partial<Record<LessonId,LessonCheckpoint>>;completed:LessonId[];
}
const empty=():TrainingData=>({version:1,settings:{board:'easy',strength:'easy'},solo:null,bot:null,lessons:{},completed:[]});
let persisted=true;
function load():TrainingData {
  const data=empty();
  try{
    const s=JSON.parse(localStorage.getItem(TRAINING_KEY)??'null');if(!s||s.version!==1)return data;
    if(['easy','medium','hard'].includes(s.settings?.board))data.settings.board=s.settings.board;
    if(['easy','medium','hard'].includes(s.settings?.strength))data.settings.strength=s.settings.strength;
    const solo=parseSavedBattle(s.solo);
    if(solo&&!solo.stage&&!solo.daily&&!solo.ranked)data.solo=solo;
    data.bot=parseBotCheckpoint(s.bot);
    for(const id of LESSON_IDS){
      const saved=s.lessons?.[id];if(!saved||saved.version!==1||saved.id!==id)continue;
      const session=restoreLesson(id,saved.actions);if(!session)continue;
      const ui=parseTrainingUi({...saved,notes:session.notes},session.grid);if(!ui)continue;
      data.lessons[id]={version:1,id,actions:session.actions,notesMode:ui.notesMode,selected:ui.selected};
    }
    data.completed=LESSON_IDS.filter(id=>Array.isArray(s.completed)&&s.completed.includes(id));
  }catch{persisted=false;}
  return data;
}
let data=load();
onTrainingCleared(success=>{data=empty();persisted=success;});
function save():boolean {
  try{localStorage.setItem(TRAINING_KEY,JSON.stringify(data));persisted=true;}catch{persisted=false;}
  return persisted;
}
export const trainingData=():TrainingData=>structuredClone(data);
export const trainingPersisted=():boolean=>persisted;
export function setTrainingSettings(board:Difficulty,strength:BotStrength):void {data.settings={board,strength};save();}
export function saveTrainingSolo(next:SavedBattle|null):boolean {data.solo=structuredClone(next);return save();}
export function saveTrainingBot(next:BotCheckpoint|null):boolean {data.bot=structuredClone(next);return save();}
export function saveTrainingLesson(next:LessonCheckpoint):boolean {
  const session=restoreLesson(next.id,next.actions);if(!session)return false;
  data.lessons[next.id]=structuredClone(next);
  if(session.status==='complete'&&!data.completed.includes(next.id))data.completed.push(next.id);
  return save();
}
