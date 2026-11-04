import { Container, Graphics, Text } from 'pixi.js';
import { actInLesson, createLesson, lessonText, LESSON_IDS, LESSONS, restoreLesson, type LessonId, type LessonSession } from '../../core/training/lessons.ts';
import { feedback } from '../audio/feedback.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { BoardView } from '../ui/BoardView.ts';
import { NumberPad } from '../ui/NumberPad.ts';
import { padHeight } from '../ui/padLayout.ts';
import { Modal } from '../ui/Modal.ts';
import { drawPanel } from '../ui/panel.ts';
import { chosenTheme } from '../progress/progress.ts';
import { progress } from '../progress/store.ts';
import { saveTrainingLesson, type LessonCheckpoint } from '../training/store.ts';

export class LessonScreen extends Container {
  private session:LessonSession;
  private readonly board:BoardView;
  private readonly pad:NumberPad;
  private readonly back:Button;
  private readonly notesButton:Button;
  private readonly panel=new Graphics();
  private readonly title=new Text({text:'',style:{fontFamily:theme.headingFontFamily,fontSize:23,fontWeight:'700',fill:theme.text}});
  private readonly info=new Text({text:'',style:{fontFamily:theme.fontFamily,fontSize:16,lineHeight:21,fill:theme.text,wordWrap:true}});
  private readonly stats=new Text({text:'',style:{fontFamily:theme.fontFamily,fontSize:13,fill:theme.gold}});
  private notesMode=false;
  private modal:Modal|null=null;
  private screenWidth=0;private screenHeight=0;private lastSelected:number|null=null;
  constructor(private readonly id:LessonId,private readonly options:{onBack:()=>void;onLesson:(id:LessonId,fresh?:boolean)=>void;resume?:LessonCheckpoint}){
    super();
    this.session=(options.resume&&restoreLesson(id,options.resume.actions))||createLesson(id);
    this.notesMode=options.resume?.notesMode??false;
    this.title.text=LESSONS[id].title;this.title.anchor.set(.5,0);this.stats.anchor.set(.5,0);
    this.board=new BoardView(this.session.givens,chosenTheme(progress).colors);
    this.board.sync(this.session.grid);this.board.restoreNotes(this.session.notes);
    this.board.select(options.resume?.selected??LESSONS[id].targets[0]);
    this.pad=new NumberPad(d=>this.handleDigit(d),chosenTheme(progress).colors);
    this.back=new Button({text:'Wstecz',icon:'back',onTap:()=>this.handleBack()});
    this.notesButton=new Button({text:'Notatki',icon:'pencil',onTap:()=>this.toggleNotes()});
    this.addChild(this.panel,this.title,this.stats,this.info,this.back,this.notesButton,this.board,this.pad);
    this.refresh();this.checkpoint();
  }
  layout(width:number,height:number):void {
    this.screenWidth=width;this.screenHeight=height;
    const column=Math.min(width-24,480),left=(width-column)/2;
    this.back.position.set(12,8);this.back.layout(44,44);
    this.notesButton.position.set(width-56,8);this.notesButton.layout(44,44);
    this.title.position.set(width/2,11);this.title.scale.set(1);
    this.title.scale.set(Math.min(1,(width-132)/this.title.width));
    this.stats.position.set(width/2,43);
    this.info.style.fontSize=height<700?14:16;this.info.style.lineHeight=height<700?18:21;
    this.info.style.wordWrapWidth=column-24;this.info.position.set(left+12,78);
    const cardHeight=Math.max(84,this.info.height+24);
    drawPanel(this.panel.clear(),left,66,column,cardHeight);
    const keypadHeight=padHeight(column),padY=height-12-keypadHeight;
    const top=66+cardHeight+20;
    const size=Math.min(column-12,padY-21-top);
    this.board.position.set((width-size)/2,top);this.board.layout(size);
    this.pad.position.set(left,padY);this.pad.layout(column,keypadHeight);
    this.modal?.layout(width,height);
    if(!this.modal&&this.session.status!=='active')this.showResult();
  }
  update():void {if(this.board.selected!==this.lastSelected)this.checkpoint();}
  private refresh(message?:string):void {
    const s=this.session;
    this.info.text=message??lessonText(s);
    this.stats.text=s.id==='notes'?`Krok ${Math.min(3,s.step+1)}/3 · własne notatki`
      :s.id==='extra'?`Pozostałe ruchy: ${s.duel.movesLeft} · ostatni cios: ${s.damage}`
      :s.id==='defense'?`Twój cios: ${s.damage} · kontra: ${s.replyDamage}`:`Obrażenia: ${s.damage} · kwadrat ×2`;
    this.notesButton.setVariant(this.notesMode?'primary':'secondary');this.pad.setNotesMode(this.notesMode);
    if(this.screenWidth)this.layout(this.screenWidth,this.screenHeight);
  }
  private toggleNotes():void {
    if(this.modal||this.session.status!=='active')return;
    this.notesMode=!this.notesMode;feedback.select();this.refresh();this.checkpoint();
  }
  private handleDigit(digit:number):void {
    if(this.modal||this.session.status!=='active'||this.board.selected===null)return;
    const cell=this.board.selected;
    const result=actInLesson(this.session,{kind:this.notesMode?'note':'digit',cell,digit});
    if(!result.accepted){
      if(!this.notesMode)this.board.reject(cell,digit);
      this.refresh(result.message??'Wybierz puste pole z opisu lekcji.');feedback.mistake();return;
    }
    if(this.notesMode){this.board.restoreNotes(this.session.notes);feedback.select();}
    else{
      this.board.reveal(cell,digit,result.completed??[]);this.board.sync(this.session.grid);
      this.board.restoreNotes(this.session.notes);feedback.digit(digit);
      if(result.completed?.length)feedback.unitsCompleted(result.completed.length);
      if(this.id==='extra'&&this.session.status==='active')this.board.select(1);
    }
    this.checkpoint();this.refresh();
  }
  private checkpoint():void {
    this.lastSelected=this.board.selected;
    saveTrainingLesson({version:1,id:this.id,actions:this.session.actions,notesMode:this.notesMode,selected:this.board.selected});
  }
  private showResult():void {
    const won=this.session.status==='complete',next=LESSON_IDS[LESSON_IDS.indexOf(this.id)+1];
    this.modal=new Modal(won?'Lekcja ukończona':'Sprawdź drugi wybór',lessonText(this.session),[
      ...(won&&next?[{text:'Następna lekcja',variant:'primary' as const,onTap:()=>this.options.onLesson(next)}]:[]),
      {text:won?'Powtórz lekcję':'Spróbuj ponownie',variant:!next||!won?'primary' as const:undefined,onTap:()=>this.options.onLesson(this.id,true)},
      {text:'Trening i lekcje',onTap:this.options.onBack},
    ],won?theme.gold:theme.text);
    this.addChild(this.modal);this.modal.layout(this.screenWidth,this.screenHeight);this.modal.show();
  }
  pause():void {
    this.checkpoint();if(this.modal||this.session.status!=='active')return;
    this.modal=new Modal('Pauza lekcji','Twoje ruchy i ręczne notatki są zapisane osobno od kampanii.',[
      {text:'Wznów lekcję',variant:'primary',onTap:()=>this.closeModal()},
      {text:'Od początku',onTap:()=>this.options.onLesson(this.id,true)},
      {text:'Trening i lekcje',onTap:this.options.onBack},
    ]);this.addChild(this.modal);this.modal.layout(this.screenWidth,this.screenHeight);this.modal.show();
  }
  private closeModal():void {this.modal?.destroy({children:true});this.modal=null;}
  handleBack():boolean {
    if(this.modal&&this.session.status==='active')this.closeModal();
    else if(this.session.status==='active')this.pause();else this.options.onBack();return true;
  }
  handleKey(event:KeyboardEvent):void {
    if(event.key==='Escape'){this.handleBack();return;}if(this.modal)return;
    if(event.key==='n')this.toggleNotes();else if(/^[1-9]$/.test(event.key))this.handleDigit(Number(event.key));
    else{const dir:Record<string,[number,number]>={ArrowUp:[-1,0],ArrowDown:[1,0],ArrowLeft:[0,-1],ArrowRight:[0,1]};
      if(dir[event.key]){event.preventDefault();this.board.moveSelection(...dir[event.key]);}}
  }
}
