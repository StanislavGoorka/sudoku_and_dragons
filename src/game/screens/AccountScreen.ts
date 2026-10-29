import { Container, Graphics, Text } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import * as account from '../net/account.ts';
import { cloudState, onCloudState, syncProgress, type CloudState } from '../net/cloudSave.ts';
import { cleanNickname, NICKNAME_MAX } from '../net/nickname.ts';
import { localNickname, setNickname } from '../net/online.ts';
import { OVERSCAN } from '../safeArea.ts';
import { theme } from '../theme.ts';
import { Button, type ButtonVariant } from '../ui/Button.ts';
import { Modal } from '../ui/Modal.ts';
import { TextField } from '../ui/TextField.ts';

export interface AccountOptions {
  onBack: () => void;
}

/** What the lower half shows: a guest's or an account's page, or one of the forms. */
type Mode = 'guest' | 'account' | 'register' | 'confirm' | 'login' | 'forgot' | 'reset';

interface FormButton {
  text: string;
  variant: ButtonVariant;
  /** Async actions dim the form and show "Chwila…" until they end; a thrown error is shown under the fields. */
  onTap: () => void | Promise<void>;
}

const ERROR_COLOR = 0xff8f9b;
const BUTTON_HEIGHT = 54;
const LINK_HEIGHT = 46;
const GAP = 10;
/** Where the header ends: the page slides up under it, cut off here. */
const HEADER_BOTTOM = 62;

const CLOUD_TEXT: Record<CloudState, string> = {
  idle: '',
  syncing: 'Zapisuję postęp na koncie…',
  synced: 'Postęp jest zapisany na koncie.',
  failed: 'Nie udało się zapisać postępu. Spróbuję znowu po następnej grze.',
};

function text(value: string, fontSize: number, fill: number, fontWeight: '500' | '700' | '800' = '500'): Text {
  return new Text({
    text: value,
    style: { fontFamily: theme.fontFamily, fontSize, fontWeight, fill, wordWrap: true, lineHeight: Math.round(fontSize * 1.3) },
  });
}

/**
 * The player's nickname and account: a guest can register (e-mail, password, the code from the mail)
 * or log in to an account made elsewhere; an account shows its e-mail and the cloud save, and can
 * log out. Text goes into real HTML inputs over the Pixi boxes (TextField). When the keyboard covers
 * the field being typed in, the page slides up to keep it in sight.
 */
export class AccountScreen extends Container {
  private readonly options: AccountOptions;
  private readonly backButton: Button;
  private readonly title = text('Konto', 34, theme.text, '800');
  /** Everything under the header; slides up over the keyboard. */
  private readonly content = new Container();
  private readonly contentMask = new Graphics();
  private readonly nickField: TextField;
  private readonly nickButton: Button;
  private readonly nickNote = text('', 14, theme.textMuted);
  private readonly divider = new Graphics();
  private readonly form = new Container();
  private mode: Mode;
  private intro = text('', 16, theme.textMuted);
  private message = text('', 15, ERROR_COLOR, '700');
  private fields: TextField[] = [];
  private buttons: { readonly button: Button; readonly spec: FormButton; readonly height: number }[] = [];
  /** Typed on one form, offered on the next (log in → forgot password). */
  private email = '';
  private busy = false;
  private modal: Modal | null = null;
  private screenWidth = 0;
  private screenHeight = 0;
  private readonly stopListening: (() => void)[] = [];
  private readonly onVisible = () => {
    if (!document.hidden && this.mode === 'confirm' && !this.busy) {
      void account.checkRegistration().then((done) => done && this.registered(), () => {});
    }
  };

  constructor(options: AccountOptions) {
    super();
    this.options = options;
    this.backButton = new Button({ text: 'Wstecz', icon: 'back', onTap: () => this.handleBack() });
    this.title.anchor.set(0.5, 0);
    this.title.style.stroke = { color: theme.panelLip, width: 6, join: 'round' };
    this.title.style.wordWrap = false;

    this.nickField = new TextField({
      caption: 'Twój nick',
      autocomplete: 'nickname',
      maxLength: NICKNAME_MAX,
      value: localNickname(),
      onEnter: () => this.saveNickname(),
    });
    this.nickButton = new Button({ text: 'Zmień', variant: 'secondary', onTap: () => this.saveNickname() });
    this.content.addChild(this.nickField, this.nickButton, this.nickNote, this.divider, this.form);
    this.content.mask = this.contentMask;
    this.addChild(this.contentMask, this.content, this.backButton, this.title);

    this.mode = this.home;
    this.openMode(this.mode);
    this.stopListening.push(
      account.onAccountChange(() => {
        // Someone logged in or out by other means (the session came back at start): show the right page.
        if (!this.busy && (this.mode === 'guest' || this.mode === 'account') && this.mode !== this.home) this.openMode(this.home);
      }),
      onCloudState((state) => {
        // A note like "Konto gotowe!" stays until the next one; only an earlier cloud line is replaced.
        const cloudLine = !this.message.text || Object.values(CLOUD_TEXT).includes(this.message.text);
        if (this.mode === 'account' && !this.busy && cloudLine) this.setMessage(CLOUD_TEXT[state], theme.textMuted);
      }),
    );
    document.addEventListener('visibilitychange', this.onVisible);
    if (account.accountEmail()) void syncProgress().catch(() => {});
  }

  layout(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    const margin = 16;
    const column = Math.min(width - margin * 2, 420);
    const left = (width - column) / 2;
    this.backButton.position.set(margin, 12);
    this.backButton.layout(44, 44);
    this.title.position.set(width / 2, 14);
    this.contentMask
      .clear()
      .rect(-OVERSCAN, HEADER_BOTTOM, width + OVERSCAN * 2, height - HEADER_BOTTOM + OVERSCAN)
      .fill(0xffffff);

    const nickY = 70;
    const nickButtonWidth = 96;
    this.nickField.position.set(left, nickY);
    this.nickField.layout(column - nickButtonWidth - GAP);
    this.nickButton.position.set(left + column - nickButtonWidth, nickY + 24);
    this.nickButton.layout(nickButtonWidth, BUTTON_HEIGHT);
    this.nickNote.style.wordWrapWidth = column - 8;
    this.nickNote.position.set(left + 4, nickY + TextField.HEIGHT + 6);
    const dividerY = this.nickNote.y + Math.max(20, this.nickNote.text ? this.nickNote.height : 0) + 12;
    this.divider.clear().roundRect(left, dividerY, column, 3, 1.5).fill({ color: theme.panelLight, alpha: 0.6 });

    this.form.position.set(left, dividerY + 18);
    this.layoutForm(column);
    this.modal?.layout(width, height);
  }

  update(): void {
    for (const field of [this.nickField, ...this.fields]) {
      // A box that slid up under the header hides its input too (the one being typed in stays).
      const top = this.toLocal(field.toGlobal({ x: 0, y: TextField.HEIGHT - 54 })).y;
      field.setShown(!this.modal && (field.focused || top >= HEADER_BOTTOM - 4));
      field.syncInput();
    }
    this.keepFocusedInSight();
  }

  handleKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') this.handleBack();
  }

  /** Back closes a dialog, then a form, then the screen. */
  handleBack(): boolean {
    if (this.modal) this.closeModal();
    else if (this.mode !== this.home && !this.busy) {
      if (this.mode === 'confirm') account.cancelRegistration();
      this.openMode(this.home);
    } else if (!this.busy) this.options.onBack();
    return true;
  }

  override destroy(options?: Parameters<Container['destroy']>[0]): void {
    for (const stop of this.stopListening) stop();
    document.removeEventListener('visibilitychange', this.onVisible);
    super.destroy(options);
  }

  private get home(): Mode {
    return account.accountEmail() ? 'account' : 'guest';
  }

  private saveNickname(): void {
    const name = cleanNickname(this.nickField.value);
    if (!name) {
      this.setNickNote(`Nick musi mieć od 2 do ${NICKNAME_MAX} znaków.`, ERROR_COLOR);
      return;
    }
    this.nickField.value = name;
    this.nickField.input.blur();
    if (name === localNickname()) {
      this.setNickNote('To już jest Twój nick.', theme.textMuted);
      return;
    }
    setNickname(name);
    feedback.select();
    this.setNickNote('Zapisano. Rywale zobaczą go w następnym pojedynku.', theme.gold);
  }

  private setNickNote(note: string, color: number): void {
    this.nickNote.text = note;
    this.nickNote.style.fill = color;
    this.relayout();
  }

  /** Builds the lower half for `mode`, with an optional line under the fields. */
  private openMode(mode: Mode, note = '', noteColor: number = theme.gold): void {
    this.mode = mode;
    for (const field of this.fields) field.destroy();
    this.form.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.fields = [];
    this.buttons = [];
    this.intro = text('', 16, theme.textMuted);
    this.message = text('', 15, ERROR_COLOR, '700');
    this.form.addChild(this.intro, this.message);

    const email = () =>
      new TextField({ caption: 'E-mail', type: 'email', inputMode: 'email', autocomplete: 'email', value: this.email, onEnter: () => this.next(0) });
    const password = (caption: string, autocomplete: string) =>
      new TextField({ caption, type: 'password', autocomplete, onEnter: () => this.submit() });
    const code = () =>
      new TextField({ caption: 'Kod z maila', inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 10, onEnter: () => this.next(0) });
    const back = (): FormButton => ({ text: 'Wróć', variant: 'secondary', onTap: () => void this.handleBack() });

    let buttons: FormButton[] = [];
    switch (mode) {
      case 'guest':
        this.intro.text =
          'Grasz jako gość, więc postęp jest tylko na tym telefonie. Załóż konto, a gwiazdki, zakupy i rekordy zostaną z Tobą także na nowym telefonie.';
        buttons = [
          { text: 'Załóż konto', variant: 'primary', onTap: () => this.openMode('register') },
          { text: 'Mam już konto', variant: 'secondary', onTap: () => this.openMode('login') },
        ];
        break;
      case 'account':
        this.intro.text = `Zalogowano jako ${account.accountEmail() ?? ''}`;
        this.intro.style.fill = theme.text;
        if (!note) [note, noteColor] = [CLOUD_TEXT[cloudState()], theme.textMuted];
        buttons = [{ text: 'Wyloguj się', variant: 'secondary', onTap: () => this.confirmLogOut() }];
        break;
      case 'register': {
        this.intro.text = 'Podaj e-mail i wymyśl hasło. Wyślemy kod, który potwierdzi adres.';
        const [mail, pass] = [email(), password(`Hasło (co najmniej ${account.PASSWORD_MIN} znaków)`, 'new-password')];
        this.fields = [mail, pass];
        buttons = [
          {
            text: 'Wyślij kod',
            variant: 'primary',
            onTap: async () => {
              this.email = mail.value.trim();
              await account.register(this.email, pass.value);
              this.openMode('confirm');
            },
          },
          back(),
        ];
        break;
      }
      case 'confirm': {
        this.intro.text = `Kod poszedł na ${account.pendingEmail() ?? this.email}. Wpisz go tutaj albo kliknij link w mailu i wróć do gry.`;
        const field = code();
        this.fields = [field];
        buttons = [
          {
            text: 'Potwierdź',
            variant: 'primary',
            onTap: async () => {
              await account.confirmRegistration(field.value.trim());
              this.registered();
            },
          },
          {
            text: 'Wyślij kod jeszcze raz',
            variant: 'secondary',
            onTap: async () => {
              await account.resendCode();
              this.setMessage('Wysłaliśmy nowy kod.', theme.gold);
            },
          },
          back(),
        ];
        break;
      }
      case 'login': {
        this.intro.text = 'Zaloguj się na swoje konto. Postęp z tego telefonu doliczymy do konta.';
        const [mail, pass] = [email(), password('Hasło', 'current-password')];
        this.fields = [mail, pass];
        buttons = [
          {
            text: 'Zaloguj się',
            variant: 'primary',
            onTap: async () => {
              this.email = mail.value.trim();
              await account.logIn(this.email, pass.value);
              this.nickField.value = localNickname();
              feedback.purchase();
              this.openMode('account', 'Zalogowano. Postęp z tego telefonu jest teraz na koncie.');
            },
          },
          {
            text: 'Nie pamiętam hasła',
            variant: 'secondary',
            onTap: () => {
              this.email = mail.value.trim();
              this.openMode('forgot');
            },
          },
          back(),
        ];
        break;
      }
      case 'forgot': {
        this.intro.text = 'Podaj e-mail konta. Wyślemy kod do ustawienia nowego hasła.';
        const mail = email();
        this.fields = [mail];
        buttons = [
          {
            text: 'Wyślij kod',
            variant: 'primary',
            onTap: async () => {
              this.email = mail.value.trim();
              await account.sendResetCode(this.email);
              this.openMode('reset');
            },
          },
          { text: 'Wróć', variant: 'secondary', onTap: () => this.openMode('login') },
        ];
        break;
      }
      case 'reset': {
        this.intro.text = `Jeśli ${this.email} ma konto, poszedł na niego kod. Wpisz go i nowe hasło.`;
        const [field, pass] = [code(), password('Nowe hasło', 'new-password')];
        this.fields = [field, pass];
        buttons = [
          {
            text: 'Ustaw hasło',
            variant: 'primary',
            onTap: async () => {
              await account.resetPassword(this.email, field.value.trim(), pass.value);
              this.nickField.value = localNickname();
              feedback.purchase();
              this.openMode('account', 'Nowe hasło ustawione. Zalogowano.');
            },
          },
          { text: 'Wróć', variant: 'secondary', onTap: () => this.openMode('forgot') },
        ];
        break;
      }
    }

    for (const field of this.fields) this.form.addChild(field);
    buttons.forEach((spec, index) => {
      const button = new Button({ text: spec.text, variant: spec.variant, onTap: () => this.press(index) });
      this.buttons.push({ button, spec, height: index === 0 && spec.variant === 'primary' ? BUTTON_HEIGHT + 2 : LINK_HEIGHT });
      this.form.addChild(button);
    });
    this.message.text = note;
    this.message.style.fill = noteColor;
    this.relayout();
    // On a computer the first box takes the typing at once; phones wait for a tap (no keyboard popping up by itself).
    if (this.fields.length && !matchMedia('(pointer: coarse)').matches) this.fields[0].focus();
  }

  private relayout(): void {
    if (this.screenWidth > 0) this.layout(this.screenWidth, this.screenHeight);
  }

  private layoutForm(column: number): void {
    let y = 0;
    this.intro.style.wordWrapWidth = column - 8;
    this.intro.position.set(4, y);
    y += this.intro.height + 14;
    for (const field of this.fields) {
      field.position.set(0, y);
      field.layout(column);
      y += TextField.HEIGHT + GAP;
    }
    this.message.style.wordWrapWidth = column - 8;
    this.message.position.set(4, y);
    if (this.message.text) y += this.message.height + GAP;
    else y += 4;
    for (const { button, height } of this.buttons) {
      button.position.set(0, y);
      button.layout(column, height);
      y += height + GAP;
    }
  }

  private setMessage(note: string, color: number): void {
    this.message.text = note;
    this.message.style.fill = color;
    this.relayout();
  }

  /** Enter in the last box submits; in an earlier one it moves on to the next. */
  private next(index: number): void {
    if (index + 1 < this.fields.length) this.fields[index + 1].focus();
    else this.submit();
  }

  private submit(): void {
    if (this.buttons.length) this.press(0);
  }

  /** Runs a button's action (or `action` in its place, e.g. after a dialog said yes). */
  private press(index: number, action?: () => Promise<void>): void {
    if (this.busy) return;
    const { button, spec } = this.buttons[index];
    const result = (action ?? spec.onTap)();
    if (!(result instanceof Promise)) return;
    this.busy = true;
    for (const { button: other } of this.buttons) other.setEnabled(false);
    button.setText('Chwila…');
    this.setMessage('', ERROR_COLOR);
    const mode = this.mode;
    result
      .catch((error: unknown) => {
        feedback.mistake();
        if (this.destroyed) return;
        if (this.mode !== mode) this.openMode(mode);
        this.setMessage(account.accountErrorMessage(error), ERROR_COLOR);
      })
      .finally(() => {
        this.busy = false;
        if (this.destroyed || this.mode !== mode) return;
        for (const { button: other } of this.buttons) other.setEnabled(true);
        button.setText(spec.text);
      });
  }

  private registered(): void {
    feedback.purchase();
    this.openMode('account', 'Konto gotowe! Postęp jest teraz zapisany na nim.');
  }

  private confirmLogOut(): void {
    if (this.modal) return;
    const modal = new Modal('Wylogować się?', 'Postęp zostaje na koncie. Na tym telefonie zaczniesz od nowa jako gość.', [
      {
        text: 'Wyloguj się',
        variant: 'primary',
        onTap: () => {
          this.closeModal();
          this.logOut();
        },
      },
      { text: 'Anuluj', onTap: () => this.closeModal() },
    ]);
    this.modal = modal;
    this.addChild(modal);
    modal.layout(this.screenWidth, this.screenHeight);
    modal.show();
  }

  private logOut(): void {
    this.press(0, async () => {
      await account.logOut();
      this.nickField.value = localNickname();
      this.openMode('guest', 'Wylogowano. Grasz teraz jako gość.');
    });
  }

  private closeModal(): void {
    this.modal?.destroy({ children: true });
    this.modal = null;
  }

  /** Slides the page up when the on-screen keyboard would cover the box being typed in. */
  private keepFocusedInSight(): void {
    const focused = [this.nickField, ...this.fields].find((field) => field.focused);
    let shift = 0;
    if (focused) {
      const view = window.visualViewport;
      const visibleBottom = this.toLocal({ x: 0, y: view ? view.offsetTop + view.height : window.innerHeight }).y;
      const fieldBottom = this.toLocal(focused.toGlobal({ x: 0, y: TextField.HEIGHT })).y - this.content.y;
      shift = Math.max(0, fieldBottom + 16 - visibleBottom);
    }
    const target = -shift;
    if (Math.abs(this.content.y - target) < 0.5) this.content.y = target;
    else this.content.y += (target - this.content.y) * 0.35;
  }
}
