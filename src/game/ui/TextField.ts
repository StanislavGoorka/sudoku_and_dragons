import { Container, Graphics, Text, type DestroyOptions } from 'pixi.js';
import { uiTheme as theme } from '../uiTheme.ts';

export interface TextFieldOptions {
  /** Shown above the box. */
  caption: string;
  type?: 'text' | 'email' | 'password';
  inputMode?: 'text' | 'email' | 'numeric';
  /** The browser's autocomplete hint, so password managers and the keyboard help ('email', 'new-password'…). */
  autocomplete: string;
  maxLength?: number;
  placeholder?: string;
  value?: string;
  /** The keyboard's enter (or "go") key. */
  onEnter?: () => void;
}

const CAPTION_HEIGHT = 24;
const BOX_HEIGHT = 50;
const LIP = 4;

/**
 * A text box: Pixi draws the caption and the box, and a real HTML input sits on top of the box, so
 * phones bring up their own keyboard (with its e-mail and number layouts, autofill and paste).
 * The input lives on document.body; the screen calls `syncInput()` every frame to keep it over the box.
 */
export class TextField extends Container {
  static readonly HEIGHT = CAPTION_HEIGHT + BOX_HEIGHT + LIP;
  readonly input = document.createElement('input');
  private readonly caption: Text;
  private readonly box = new Graphics();
  private fieldWidth = 0;
  private shown = true;
  private placed = '';

  constructor(options: TextFieldOptions) {
    super();
    this.caption = new Text({
      text: options.caption,
      style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 15, fill: theme.textMuted },
    });
    this.caption.position.set(4, 0);
    this.addChild(this.caption, this.box);

    const input = this.input;
    input.type = options.type ?? 'text';
    if (options.inputMode) input.inputMode = options.inputMode;
    input.autocomplete = options.autocomplete as AutoFill;
    input.spellcheck = false;
    input.setAttribute('autocapitalize', options.type === 'text' && options.inputMode !== 'numeric' ? 'sentences' : 'off');
    if (options.maxLength) input.maxLength = options.maxLength;
    if (options.placeholder) input.placeholder = options.placeholder;
    input.value = options.value ?? '';
    const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
    Object.assign(input.style, {
      position: 'fixed',
      boxSizing: 'border-box',
      margin: '0',
      padding: '0 16px',
      border: 'none',
      outline: 'none',
      background: 'transparent',
      color: hex(theme.text),
      caretColor: hex(theme.buttonPrimary),
      colorScheme: 'dark',
      font: `400 17px ${theme.fontFamily}`,
      userSelect: 'text',
      webkitUserSelect: 'text',
      touchAction: 'manipulation',
      zIndex: '10',
    } satisfies Partial<CSSStyleDeclaration>);
    input.addEventListener('focus', () => this.draw());
    input.addEventListener('blur', () => this.draw());
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        options.onEnter?.();
      }
    });
    document.body.appendChild(input);
  }

  get value(): string {
    return this.input.value;
  }

  set value(value: string) {
    this.input.value = value;
  }

  get focused(): boolean {
    return document.activeElement === this.input;
  }

  focus(): void {
    this.input.focus();
  }

  /** Shows or hides the box and its input (under a dialog, for example). */
  setShown(shown: boolean): void {
    this.shown = shown;
    this.visible = shown;
    if (!shown && this.focused) this.input.blur();
    this.syncInput();
  }

  layout(width: number): void {
    this.fieldWidth = width;
    this.draw();
  }

  /** Puts the HTML input over the box, wherever the screen has moved it. */
  syncInput(): void {
    const corner = this.toGlobal({ x: 0, y: CAPTION_HEIGHT });
    const shown = this.shown && this.onScreen();
    const placed = shown ? `${corner.x},${corner.y},${this.fieldWidth}` : 'hidden';
    if (placed === this.placed) return;
    this.placed = placed;
    const style = this.input.style;
    style.display = shown ? 'block' : 'none';
    style.left = `${corner.x}px`;
    style.top = `${corner.y}px`;
    style.width = `${this.fieldWidth}px`;
    style.height = `${BOX_HEIGHT}px`;
  }

  override destroy(options?: DestroyOptions): void {
    this.input.remove();
    super.destroy(options);
  }

  /** Visible all the way up, and not faded out (screens fade in and out). */
  private onScreen(): boolean {
    let alpha = 1;
    for (let node: Container | null = this; node; node = node.parent) {
      if (!node.visible) return false;
      alpha *= node.alpha;
    }
    return alpha > 0.5 && !this.destroyed;
  }

  private draw(): void {
    const w = this.fieldWidth;
    const y = CAPTION_HEIGHT;
    this.box
      .clear()
      .roundRect(0, y, w, BOX_HEIGHT, 8)
      .fill(theme.buttonSecondary)
      .stroke({ width: 1, color: this.focused ? theme.buttonPrimary : theme.panelLight });
  }
}
