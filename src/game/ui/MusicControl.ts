import { Container, Graphics, Rectangle, Text, type FederatedPointerEvent } from 'pixi.js';
import { feedback } from '../audio/feedback.ts';
import { uiTheme as theme } from '../uiTheme.ts';
import { Button } from './Button.ts';
import type { ModalExtra } from './Modal.ts';

const BUTTON = 48;
const KNOB = 9;
const TRACK = 4;
/** Below the "Muzyka" line. */
const ROW_Y = 34;

/**
 * The music settings, for a dialog: "Muzyka" and its volume in per cent, a round speaker button that
 * mutes it (and brings it back at the same volume), and a slider to drag (or tap) for the volume.
 */
export class MusicControl implements ModalExtra {
  readonly view = new Container();
  readonly height = ROW_Y + BUTTON;
  private readonly title = new Text({
    text: 'Muzyka',
    style: { fontFamily: theme.fontFamily, fontWeight: '600', fontSize: 17, fill: theme.text },
  });
  private readonly value = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '700', fontSize: 17, fill: theme.textMuted },
  });
  private readonly mute: Button;
  private readonly slider = new Container();
  private readonly bar = new Graphics();
  private readonly knob = new Graphics();
  private sliderX = 0;
  private sliderWidth = 0;
  private dragging = false;

  constructor() {
    this.mute = new Button({
      text: 'Wycisz muzykę',
      icon: 'speaker',
      onTap: () => {
        feedback.setMusic(!this.playing());
        this.refresh();
      },
    });
    this.value.anchor.set(1, 0);
    this.slider.addChild(this.bar, this.knob);
    this.slider.eventMode = 'static';
    this.slider.cursor = 'pointer';
    this.slider.on('pointerdown', (event) => {
      this.dragging = true;
      this.drag(event);
    });
    this.slider.on('globalpointermove', (event) => {
      if (this.dragging) this.drag(event);
    });
    const release = () => {
      if (!this.dragging) return;
      this.dragging = false;
      feedback.setMusicVolume(feedback.settings.musicVolume);
    };
    this.slider.on('pointerup', release);
    this.slider.on('pointerupoutside', release);
    this.view.addChild(this.title, this.value, this.mute, this.slider);
  }

  layout(width: number): void {
    this.title.position.set(0, 0);
    this.value.position.set(width, 3);
    this.mute.position.set(0, ROW_Y);
    this.mute.layout(BUTTON, BUTTON);
    // The knob's centre runs from sliderX to sliderX + sliderWidth, so it never sticks out.
    this.sliderX = BUTTON + 16 + KNOB;
    this.sliderWidth = Math.max(1, width - this.sliderX - KNOB);
    this.slider.position.set(0, ROW_Y + BUTTON / 2 - 2);
    this.slider.hitArea = new Rectangle(BUTTON + 8, -BUTTON / 2, width - BUTTON - 8, BUTTON);
    this.refresh();
  }

  private playing(): boolean {
    return feedback.settings.music && feedback.settings.musicVolume > 0;
  }

  private drag(event: FederatedPointerEvent): void {
    const x = event.getLocalPosition(this.slider).x;
    feedback.setMusicVolume((x - this.sliderX) / this.sliderWidth, false);
    this.refresh();
  }

  private refresh(): void {
    const on = this.playing();
    const volume = feedback.settings.musicVolume;
    this.value.text = on ? `${Math.round(volume * 100)}%` : 'wyciszona';
    this.mute.setIcon(on ? 'speaker' : 'muted');
    const knobX = this.sliderX + volume * this.sliderWidth;
    const fill = on ? theme.buttonPrimary : theme.textMuted;
    this.bar
      .clear()
      .roundRect(this.sliderX - KNOB, -TRACK / 2, this.sliderWidth + KNOB * 2, TRACK, TRACK / 2)
      .fill(theme.panelLip)
      .roundRect(this.sliderX - KNOB, -TRACK / 2, knobX - this.sliderX + KNOB * 2, TRACK, TRACK / 2)
      .fill({ color: fill, alpha: on ? 1 : 0.5 });
    this.knob
      .clear()
      .circle(knobX, 0, KNOB)
      .fill(fill);
  }
}
