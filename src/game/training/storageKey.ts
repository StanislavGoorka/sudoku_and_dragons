import { profileSuffix } from '../profile.ts';
export const TRAINING_KEY=`sudoku-dragons.training${profileSuffix}`;
const clearListeners:((persisted:boolean)=>void)[]=[];
export function onTrainingCleared(listener:(persisted:boolean)=>void):void {clearListeners.push(listener);}
/** Kept tiny so account/data cleanup does not eagerly load the training screens. */
export function clearTrainingData():void {
  let persisted=true;
  try{localStorage.removeItem(TRAINING_KEY);}catch{persisted=false;}
  for(const listener of clearListeners)listener(persisted);
}
