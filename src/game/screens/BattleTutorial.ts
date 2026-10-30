import gsap from 'gsap';
import { Container, Graphics, Rectangle, Text, type DestroyOptions } from 'pixi.js';
import { killTweens } from '../fx/tweens.ts';
import { theme } from '../theme.ts';
import { Button } from '../ui/Button.ts';

/** Where the tutorial points, in the battle screen's coordinates. */
export interface TutorialTargets {
  arena(): Rectangle;
  board(): Rectangle;
  pad(): Rectangle;
  cell(cell: number): Rectangle;
  charge(): Rectangle;
}

interface Step {
  text: string;
  /** What the ring goes around, if anything. */
  target: ((targets: TutorialTargets, cell: number) => Rectangle) | null;
  /** The card covers the arena (pointing below it) or the top of the board (pointing up at the arena). */
  card: 'arena' | 'board';
  /** A button moves on; without one the step waits for the player to do what it says. */
  button?: string;
}

const STEPS: Step[] = [
  {
    text: 'Rozwiązuj sudoku, by walczyć ze smokiem: każda dobra cyfra to Twój cios.',
    target: (t) => t.arena(),
    card: 'board',
    button: 'Dalej',
  },
  { text: 'Dotknij pustego pola. To podświetlone to dobry początek.', target: (t, cell) => t.cell(cell), card: 'arena' },
  {
    text: 'Wpisz cyfrę od 1 do 9. Nie może się powtórzyć w wierszu, w kolumnie ani w kwadracie 3×3.',
    target: (t) => t.pad(),
    card: 'arena',
  },
  {
    text: 'Trafienie! Cyfra rani smoka o swoją wartość: 5 to 5 obrażeń. Cyfra, która domyka kwadrat 3×3, rani podwójnie.',
    target: (t) => t.board(),
    card: 'arena',
    button: 'Dalej',
  },
  {
    text: 'Smok ładuje atak, licznik pokazuje, ile sekund mu zostało. Dobre cyfry go odpychają, więc graj szybko.',
    target: (t) => t.charge(),
    card: 'board',
    button: 'Do walki!',
  },
];

const SELECT_STEP = 1;
const DIGIT_STEP = 2;
const MISS_TEXT = 'Pudło! Zła cyfra to cios smoka w Ciebie. Spróbuj innej.';

/**
 * The guided first battle: a card with a short tip and a pulsing ring around what it is about. Taps
 * go through to the board and the pad (only the card takes its own), and while it is on the battle
 * screen keeps the dragon's timer still. It ends with its last button or "Pomiń".
 */
export class BattleTutorial extends Container {
  private readonly targets: TutorialTargets;
  /** The cell the second step suggests: one where only one digit fits. */
  private readonly cell: number;
  private readonly onDone: () => void;
  private readonly ring = new Graphics();
  private readonly card = new Container();
  private readonly panel = new Graphics();
  private readonly text = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 17, lineHeight: 22, fill: theme.text, wordWrap: true },
  });
  private readonly skip = new Text({
    text: 'Pomiń',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 15, fill: theme.textMuted },
  });
  private button: Button | null = null;
  private step = 0;
  private area = { left: 0, width: 0, arenaY: 0, boardY: 0 };

  constructor(targets: TutorialTargets, cell: number, onDone: () => void) {
    super();
    this.targets = targets;
    this.cell = cell;
    this.onDone = onDone;
    this.ring.eventMode = 'none';
    this.skip.eventMode = 'static';
    this.skip.cursor = 'pointer';
    this.skip.on('pointertap', () => this.finish());
    this.card.addChild(this.panel, this.text, this.skip);
    this.addChild(this.ring, this.card);
    gsap.fromTo(this.ring, { alpha: 1 }, { alpha: 0.35, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.showStep();
  }

  /** The digit pad is open only on the step that asks for a digit (and before, so an eager player can just play). */
  get acceptsDigits(): boolean {
    return this.step <= DIGIT_STEP;
  }

  /** `left`/`width`: the column the battle uses; `arenaY`, `boardY`: where the arena and the board start. */
  layout(left: number, width: number, arenaY: number, boardY: number): void {
    this.area = { left, width, arenaY, boardY };
    this.place();
  }

  /** The player selected a cell. */
  selected(empty: boolean): void {
    if (this.step === SELECT_STEP && empty) this.go(DIGIT_STEP);
  }

  /** The player played a digit. */
  played(correct: boolean): void {
    if (this.step > DIGIT_STEP) return;
    if (correct) this.go(DIGIT_STEP + 1);
    else if (this.step === DIGIT_STEP) this.setText(MISS_TEXT);
    else this.go(DIGIT_STEP, MISS_TEXT);
  }

  override destroy(options?: DestroyOptions): void {
    killTweens(this.ring, this.card);
    super.destroy(options);
  }

  private go(step: number, text?: string): void {
    this.step = step;
    this.showStep(text);
  }

  private showStep(text?: string): void {
    const step = STEPS[this.step];
    this.button?.destroy({ children: true });
    this.button = step.button
      ? new Button({ text: step.button, variant: 'primary', onTap: () => (this.step === STEPS.length - 1 ? this.finish() : this.go(this.step + 1)) })
      : null;
    if (this.button) this.card.addChild(this.button);
    this.setText(text ?? step.text);
    gsap.fromTo(this.card, { alpha: 0 }, { alpha: 1, duration: 0.25 });
  }

  private setText(text: string): void {
    this.text.text = text;
    this.place();
  }

  /** Puts the card over the arena or the board and the ring around the step's target. */
  private place(): void {
    const { left, width, arenaY, boardY } = this.area;
    if (width === 0) return;
    const step = STEPS[this.step];
    const pad = 16;
    const cardWidth = width - 16;
    this.text.style.wordWrapWidth = cardWidth - pad * 2;
    this.text.position.set(pad, pad);
    let height = pad + this.text.height + 12;
    const rowHeight = 44;
    this.skip.position.set(pad, height + (rowHeight - this.skip.height) / 2);
    if (this.button) {
      this.button.position.set(cardWidth - pad - 130, height);
      this.button.layout(130, rowHeight);
    }
    height += rowHeight + pad;
    this.panel
      .clear()
      .roundRect(0, 5, cardWidth, height, 18)
      .fill(theme.panelLip)
      .roundRect(0, 0, cardWidth, height, 18)
      .fill(theme.panel)
      .stroke({ width: 3, color: theme.gold });
    this.card.hitArea = new Rectangle(0, 0, cardWidth, height + 5);
    this.card.eventMode = 'static';
    this.card.position.set(left + 8, step.card === 'arena' ? arenaY + 50 : boardY + 12);

    this.ring.clear();
    const target = step.target?.(this.targets, this.cell);
    if (target) {
      const grow = 5;
      this.ring
        .roundRect(target.x - grow, target.y - grow, target.width + grow * 2, target.height + grow * 2, 14)
        .stroke({ width: 4, color: theme.gold });
    }
  }

  private finish(): void {
    if (this.destroyed) return;
    this.onDone();
  }
}
