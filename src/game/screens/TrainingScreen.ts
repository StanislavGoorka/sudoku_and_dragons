import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent, type FederatedWheelEvent } from 'pixi.js';
import type { Difficulty } from '../../core/index.ts';
import type { BotStrength } from '../../core/duel/bot.ts';
import { LESSON_IDS, LESSONS, restoreLesson, type LessonId } from '../../core/training/lessons.ts';
import { DIFFICULTY_INFO } from '../difficulty.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from '../ui/Button.ts';
import { Modal } from '../ui/Modal.ts';
import { BOT_DESCRIPTIONS, BOT_NAMES } from '../training/labels.ts';
import { setTrainingSettings, trainingData, trainingPersisted } from '../training/store.ts';

export type TrainingTab='solo'|'bot'|'lessons';
export class TrainingScreen extends Container {
  private readonly title=new Text({text:'Trening i lekcje',style:{fontFamily:theme.headingFontFamily,fontSize:27,fontWeight:'700',fill:theme.text}});
  private readonly subtitle=new Text({text:'Offline · bez gwiazdek i rankingu',style:{fontFamily:theme.fontFamily,fontSize:13,fill:theme.textMuted}});
  private readonly back:Button;
  private readonly tabs:Button[];
  private body=new Container();
  private readonly viewport=new Container();private readonly clip=new Graphics();
  private scroll=0;private maxScroll=0;private drag:{y:number;scroll:number}|null=null;
  private rows:{height:number;place:(left:number,top:number,width:number)=>void}[]=[];
  private board:Difficulty;private strength:BotStrength;
  private modal:Modal|null=null;
  private screenWidth=0;private screenHeight=0;
  constructor(private readonly options:{onBack:()=>void;onSolo:(level:Difficulty,resume:boolean)=>void;
    onBot:(level:Difficulty,strength:BotStrength,resume:boolean)=>void;onLesson:(id:LessonId,fresh?:boolean)=>void;tab?:TrainingTab}){
    super();const saved=trainingData();this.board=saved.settings.board;this.strength=saved.settings.strength;
    this.tab=options.tab??'solo';this.title.anchor.set(.5,0);this.subtitle.anchor.set(.5,0);
    this.back=new Button({text:'Wstecz',icon:'back',onTap:options.onBack});
    this.tabs=(['solo','bot','lessons'] as TrainingTab[]).map((tab,i)=>new Button({text:['Solo','Z botem','Lekcje'][i],onTap:()=>{
      if(this.modal)return;this.tab=tab;this.render();this.layout(this.screenWidth,this.screenHeight);
    }}));
    this.viewport.addChild(this.body);this.viewport.mask=this.clip;this.viewport.eventMode='static';
    this.viewport.on('wheel',(e:FederatedWheelEvent)=>this.scrollTo(this.scroll+e.deltaY));
    this.viewport.on('pointerdown',(e:FederatedPointerEvent)=>{if(e.target===this.viewport)this.drag={y:e.global.y,scroll:this.scroll};});
    this.viewport.on('globalpointermove',(e:FederatedPointerEvent)=>{if(this.drag)this.scrollTo(this.drag.scroll+this.drag.y-e.global.y);});
    this.viewport.on('pointerup',()=>{this.drag=null;});this.viewport.on('pointerupoutside',()=>{this.drag=null;});
    this.addChild(this.title,this.subtitle,this.back,...this.tabs,this.clip,this.viewport);this.render();
  }
  private tab:TrainingTab;
  private render():void {
    this.body.destroy({children:true});this.body=new Container();this.viewport.addChild(this.body);this.rows=[];this.scroll=0;
    const saved=trainingData();
    if(this.tab==='lessons'){
      this.text('Ćwicz na krótkich, przygotowanych sytuacjach. Możesz przerwać i wrócić do każdej lekcji.',15,theme.textMuted,56);
      for(const id of LESSON_IDS){
        const done=saved.completed.includes(id),started=Boolean(saved.lessons[id]);
        const ongoing=saved.lessons[id]&&restoreLesson(id,saved.lessons[id]!.actions)?.status==='active';
        const button=new Button({text:LESSONS[id].title,leadingIcon:done?'check':undefined,
          subtitle:ongoing?'rozpoczęta · wznów':done?'ukończona · powtórz':started?'spróbuj ponownie':LESSONS[id].subtitle,
          onTap:()=>this.options.onLesson(id,!ongoing)});
        this.button(button,64);
      }
    }else{
      this.text(this.tab==='solo'?'Solo bez zegara. Błędy kosztują HP. Osobny zapis treningu.'
        :'Tury po 30 s. Poziom planszy i siła bota są niezależne.',15,theme.textMuted,42);
      this.text('Trudność planszy',15,theme.text,22);
      this.picker((['easy','medium','hard'] as Difficulty[]).map(level=>({text:DIFFICULTY_INFO[level].name,
        chosen:this.board===level,pick:()=>{this.board=level;this.changed();}})));
      if(this.tab==='bot'){
        this.text('Siła bota',15,theme.text,22);
        this.picker((['easy','medium','hard'] as BotStrength[]).map(strength=>({text:BOT_NAMES[strength],
          chosen:this.strength===strength,pick:()=>{this.strength=strength;this.changed();}})));
        this.text(BOT_DESCRIPTIONS[this.strength]+' Gdy utknie, czeka do końca tury.',13,theme.textMuted,40);
      }
      const solo=this.tab==='solo';
      this.button(new Button({text:solo?'Rozpocznij solo':'Rozpocznij pojedynek',variant:'primary',onTap:()=>{
        const start=()=>solo?this.options.onSolo(this.board,false):this.options.onBot(this.board,this.strength,false);
        if(solo?saved.solo: saved.bot&&!saved.bot.state.finished)this.confirmReplace(start);else start();
      }}),54);
      if(solo?saved.solo:saved.bot){
        this.button(new Button({text:solo?'Wznów solo':saved.bot!.state.finished?'Ostatni wynik':'Wznów pojedynek',
          subtitle:solo?DIFFICULTY_INFO[saved.solo!.puzzle.difficulty].name:
            `${DIFFICULTY_INFO[saved.bot!.difficulty].name} · ${BOT_NAMES[saved.bot!.strength]}`,
          onTap:()=>solo?this.options.onSolo(this.board,true):this.options.onBot(this.board,this.strength,true)}),60);
      }
    }
    if(!trainingPersisted())this.text('Zapis lokalny jest niedostępny. Trening przetrwa tylko do zamknięcia gry.',13,theme.gold,48);
  }
  private changed():void {setTrainingSettings(this.board,this.strength);this.render();this.layout(this.screenWidth,this.screenHeight);}
  private text(value:string,size:number,fill:number,height:number):void {
    const text=new Text({text:value,style:{fontFamily:theme.fontFamily,fontSize:size,lineHeight:Math.round(size*1.3),fill,wordWrap:true}});
    this.body.addChild(text);this.rows.push({height,place:(left,top,width)=>{text.position.set(left,top);text.style.wordWrapWidth=width;}});
  }
  private button(button:Button,height:number):void {
    this.body.addChild(button);this.rows.push({height,place:(left,top,width)=>{button.position.set(left,top);button.layout(width,height);}});
  }
  private picker(items:{text:string;chosen:boolean;pick:()=>void}[]):void {
    const buttons=items.map(item=>new Button({text:item.text,variant:item.chosen?'primary':'secondary',onTap:item.pick}));
    this.body.addChild(...buttons);this.rows.push({height:48,place:(left,top,width)=>buttons.forEach((b,i)=>{
      const w=(width-16)/3;b.position.set(left+i*(w+8),top);b.layout(w,48);
    })});
  }
  layout(width:number,height:number):void {
    this.screenWidth=width;this.screenHeight=height;const column=Math.min(width-32,420),left=(width-column)/2;
    this.back.position.set(12,10);this.back.layout(44,44);
    this.title.position.set(width/2,12);this.title.scale.set(1);this.title.scale.set(Math.min(1,(width-132)/this.title.width));
    this.subtitle.position.set(width/2,57);
    this.tabs.forEach((b,i)=>{const w=(column-16)/3;b.position.set(left+i*(w+8),86);b.layout(w,48);b.setVariant(this.tab===['solo','bot','lessons'][i]?'primary':'secondary');});
    let top=152;for(const row of this.rows){row.place(left,top,column);top+=row.height+6;}
    this.clip.clear().rect(0,144,width,Math.max(1,height-156)).fill(0xffffff);
    this.viewport.hitArea=new Rectangle(0,144,width,Math.max(1,height-156));
    this.maxScroll=Math.max(0,top-6-(height-12));this.scrollTo(this.scroll);
    this.modal?.layout(width,height);
  }
  private scrollTo(value:number):void {this.scroll=Math.max(0,Math.min(this.maxScroll,value));this.body.y=-this.scroll;}
  private confirmReplace(start:()=>void):void {
    if(this.modal)return;
    this.modal=new Modal('Rozpocząć nowy trening?','Nowy trening zastąpi zapis tego trybu. Lekcje i zapis kampanii są osobne.',[
      {text:'Rozpocznij nowy',variant:'primary',onTap:start},{text:'Anuluj',onTap:()=>this.closeModal()},
    ]);this.addChild(this.modal);this.modal.layout(this.screenWidth,this.screenHeight);this.modal.show();
  }
  private closeModal():void {this.modal?.destroy({children:true});this.modal=null;}
  handleBack():boolean {if(this.modal)this.closeModal();else this.options.onBack();return true;}
  handleKey(event:KeyboardEvent):void {if(event.key==='Escape')this.handleBack();}
}
