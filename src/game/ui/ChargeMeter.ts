import { Container, Graphics, Text } from 'pixi.js';
import { uiTheme as theme } from '../uiTheme.ts';

const URGENT_SECONDS = 5;

/** Round countdown (the dragon's timed attack, a duel turn): the ring fills up, the number shows seconds left. */
export class ChargeMeter extends Container {
  private readonly dial = new Container();
  private readonly ring = new Graphics();
  private readonly captionBg = new Graphics();
  private readonly seconds = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '600', fontSize: 15, fill: theme.text },
  });
  private readonly caption = new Text({
    text: '',
    style: {
      fontFamily: theme.fontFamily,
      fontWeight: '500',
      fontSize: 10,
      fill: theme.textMuted,
    },
  });
  private radius = 20;
  /** Displayed fill; eases towards the real value so knockbacks visibly rewind the ring. */
  private shown = 0;
  private urgent = false;

  constructor(caption = 'do ataku') {
    super();
    this.caption.text = caption;
    this.seconds.anchor.set(0.5);
    this.caption.anchor.set(0.5, 0);
    this.dial.addChild(this.ring, this.seconds);
    this.addChild(this.dial, this.captionBg, this.caption);
    this.caption.visible = caption !== '';
    this.captionBg.visible = this.caption.visible;
  }

  layout(radius: number): void {
    this.radius = radius;
    this.seconds.style.fontSize = Math.round(radius * 0.85);
    this.seconds.y = radius * 0.06;
    this.caption.position.set(0, radius + 4);
    const w = this.caption.width + 10;
    this.captionBg.clear().roundRect(-w / 2, radius + 2, w, 16, 3).fill(theme.panel);
  }

  /** `fraction` is how full the charge is (0–1); `dt` is the frame time in seconds. */
  update(fraction: number, secondsLeft: number, dt: number): void {
    this.shown += (fraction - this.shown) * Math.min(1, dt * 12);

    const urgent = secondsLeft <= URGENT_SECONDS;
    if (urgent !== this.urgent) {
      this.urgent = urgent;
      this.seconds.style.fill = urgent ? theme.flash : theme.text;
    }
    this.seconds.text = String(Math.max(1, Math.ceil(secondsLeft)));

    const r = this.radius;
    const g = this.ring.clear();
    g.circle(0, 0, r + 2).fill(theme.panel);
    g.circle(0, 0, r).stroke({ width: 1, color: theme.panelLight });
    if (this.shown > 0.002) {
      const start = -Math.PI / 2;
      g.moveTo(0, -r)
        .arc(0, 0, r, start, start + Math.PI * 2 * Math.min(1, this.shown))
        .stroke({ width: 2, color: urgent ? theme.error : theme.buttonPrimary, cap: 'round' });
    }
    this.dial.scale.set(1);
  }
}
