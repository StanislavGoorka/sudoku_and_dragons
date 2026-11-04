import {expect,test} from '@playwright/test';
import {ready,skipTutorial,tapButton,tapCell} from './game.ts';

test.beforeEach(async({page})=>{
  await skipTutorial(page);await page.route('http://127.0.0.1:54321/**',r=>r.abort());
});
async function hub(page:import('@playwright/test').Page,tab?:string){
  await tapButton(page,'Trening i lekcje');await ready(page,'TrainingScreen');
  if(tab)await tapButton(page,tab);
}

test('solo has no timed attacks, preserves campaign save, resumes notes and pays no rewards',async({page})=>{
  await page.goto('/?seed=123&difficulty=easy');await ready(page,'GameScreen');
  await tapButton(page,'Pauza');await tapButton(page,'Wyjdź do menu');await ready(page);
  await tapButton(page,'Zostań w menu');await hub(page);
  const campaign=await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle);
  const progress=await page.evaluate(()=>structuredClone(window.__game.state));
  await tapButton(page,'Rozpocznij solo');await ready(page,'GameScreen');
  expect(await page.evaluate(()=>window.__game.screen.options.practice)).toBe(true);
  const cell=await page.evaluate(()=>window.__game.screen.grid.indexOf(0));await tapCell(page,cell);
  await tapButton(page,'Notatki');await page.keyboard.press('2');await page.keyboard.press('7');
  const before=await page.evaluate(()=>{const s=window.__game.screen;s.update(120000);s.checkpoint();
    return {grid:s.grid,notes:s.board.saveNotes(),hp:s.battle.playerHp,charge:s.battle.charge,elapsed:s.elapsed,seed:s.puzzle.seed};});
  expect(before.hp).toBe(50);expect(before.charge).toBe(0);expect(before.notes[cell]).toBe((1<<2)|(1<<7));
  await tapButton(page,'Pauza');await tapButton(page,'Wyjdź do menu');await ready(page,'TrainingScreen');
  await page.goto('/');await ready(page);await tapButton(page,'Zostań w menu');await hub(page);
  await tapButton(page,'Wznów solo');await ready(page,'GameScreen');await tapButton(page,'Wróć do walki');
  const after=await page.evaluate(()=>{const s=window.__game.screen;return{grid:s.grid,notes:s.board.saveNotes(),hp:s.battle.playerHp,charge:s.battle.charge,seed:s.puzzle.seed};});
  expect(after).toEqual({grid:before.grid,notes:before.notes,hp:before.hp,charge:before.charge,seed:before.seed});
  await tapButton(page,'Notatki');await page.evaluate(()=>window.__game.screen.debugFill(0));
  await expect.poll(()=>page.evaluate(()=>window.__game.screen.modal?.title.text)).toBe('Trening ukończony');
  expect(await page.evaluate(()=>window.__game.state)).toEqual(progress);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle)).toEqual(campaign);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.training')!).solo)).toBeNull();
  await tapButton(page,'Nowy trening');await ready(page,'GameScreen');
  await expect.poll(()=>page.evaluate(()=>window.__game.screen.battle.outcome)).toBe('ongoing');
  await page.evaluate(()=>{const s=window.__game.screen;for(let i=0;i<50&&s.battle.outcome==='ongoing';i++)s.debugMistake();});
  await expect.poll(()=>page.evaluate(()=>window.__game.screen.modal?.title.text)).toBe('Koniec treningu');
  expect(await page.evaluate(()=>window.__game.state)).toEqual(progress);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.progress')!)._soloBattle)).toEqual(campaign);
});

test('bot strength is independent, and pause/restart preserve the turn, board and handwritten notes',async({page})=>{
  await page.clock.install();await page.goto('/');await ready(page);await hub(page,'Z botem');
  await tapButton(page,'Trudny');await tapButton(page,'Spokojny');await tapButton(page,'Rozpocznij pojedynek');await ready(page,'DuelScreen');
  expect(await page.evaluate(()=>({level:window.__game.screen.backend.difficulty,strength:window.__game.screen.backend.strength})))
    .toEqual({level:'hard',strength:'easy'});
  const cell=await page.evaluate(()=>window.__game.screen.state.board.indexOf(0));await tapCell(page,cell);
  await tapButton(page,'Notatki');await page.keyboard.press('2');await page.keyboard.press('7');
  await tapButton(page,'Wyjdź');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.training')!).bot);
  await page.clock.fastForward(60000);
  expect(await page.evaluate(()=>window.__game.screen.state)).toEqual(saved.state);
  await tapButton(page,'Trening i lekcje');await ready(page,'TrainingScreen');
  await page.reload();await ready(page);await hub(page,'Z botem');
  // A short phone may need to scroll the training content to the resume action.
  await page.mouse.move(180,500);await page.mouse.wheel(0,350);
  await tapButton(page,'Wznów pojedynek');await ready(page,'DuelScreen');
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.training')!).bot);
  expect(restored.state).toEqual(saved.state);expect(restored.notes).toEqual(saved.notes);expect(restored.notesMode).toBe(true);
  expect(restored.remainingMs).toBe(saved.remainingMs);
  await tapButton(page,'Wróć do treningu');
  expect(await page.evaluate(()=>window.__game.screen.modal)).toBeNull();
});

for(const [width,height] of [[360,640],[375,812]])test(`four practical lessons fit ${width}×${height}, resume offline and never pay stars`,async({page})=>{
  test.setTimeout(120000);await page.setViewportSize({width,height});await page.goto('/');await ready(page);await hub(page,'Lekcje');
  const before=await page.evaluate(()=>structuredClone(window.__game.state));
  await tapButton(page,'Ręczne notatki');await ready(page,'LessonScreen');await tapCell(page,40);
  await tapButton(page,'Notatki');await page.keyboard.press('2');await page.keyboard.press('7');
  expect(await page.evaluate(()=>window.__game.screen.session.step)).toBe(1);
  const geometry=await page.evaluate(()=>{const s=window.__game.screen;return{
    infoBottom:s.info.y+s.info.height,boardTop:s.board.y-6,padBottom:s.pad.y+s.pad.height,
    keys:s.pad.keys.map((k:any)=>({w:k.root.hitArea.width,h:k.root.hitArea.height}))};});
  expect(geometry.infoBottom).toBeLessThan(geometry.boardTop);expect(geometry.padBottom).toBeLessThanOrEqual(height+1);
  for(const key of geometry.keys){expect(key.w).toBeGreaterThanOrEqual(48);expect(key.h).toBeGreaterThanOrEqual(48);}
  await page.reload();await ready(page);await hub(page,'Lekcje');await tapButton(page,'Ręczne notatki');await ready(page,'LessonScreen');
  expect(await page.evaluate(()=>window.__game.screen.board.notesAt(40))).toEqual([2,7]);
  await page.keyboard.press('2');await tapButton(page,'Notatki');await page.keyboard.press('6');
  await expect.poll(()=>page.evaluate(()=>window.__game.screen.session.status)).toBe('complete');
  await tapButton(page,'Trening i lekcje');await ready(page,'TrainingScreen');
  await tapButton(page,'Kwadrat ×2');await ready(page,'LessonScreen');await tapCell(page,0);await page.keyboard.press('4');
  expect(await page.evaluate(()=>window.__game.screen.session.damage)).toBe(8);
  await tapButton(page,'Trening i lekcje');await ready(page,'TrainingScreen');
  await tapButton(page,'Dodatkowy ruch');await ready(page,'LessonScreen');await tapCell(page,0);await page.keyboard.press('4');
  expect(await page.evaluate(()=>window.__game.screen.session.duel.movesLeft)).toBe(2);
  await tapCell(page,1);await page.keyboard.press('8');expect(await page.evaluate(()=>window.__game.screen.session.duel.movesLeft)).toBe(2);
  await tapButton(page,'Trening i lekcje');await ready(page,'TrainingScreen');
  await tapButton(page,'Nie oddawaj kwadratu');await ready(page,'LessonScreen');await tapCell(page,80);await page.keyboard.press('2');
  expect(await page.evaluate(()=>window.__game.screen.session.replyDamage)).toBe(12);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.training')!).completed)).not.toContain('defense');
  await tapButton(page,'Spróbuj ponownie');await ready(page,'LessonScreen');
  await expect.poll(()=>page.evaluate(()=>window.__game.screen.session.status)).toBe('active');
  await tapCell(page,3);await page.keyboard.press('9');
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('sudoku-dragons.training')!).completed.sort()))
    .toEqual(['box','defense','extra','notes']);
  expect(await page.evaluate(()=>window.__game.state)).toEqual(before);
});
