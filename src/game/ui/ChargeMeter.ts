import { Container, Graphics, Text } from 'pixi.js';
import { theme } from '../theme.ts';

const URGENT_SECONDS = 5;

/** Round countdown (the dragon's timed attack, a duel turn): the ring fills up, the number shows seconds left. */
export class ChargeMeter extends Container {
  private readonly dial = new Container();
  private readonly ring = new Graphics();
  private readonly seconds = new Text({
    text: '',
    style: { fontFamily: theme.fontFamily, fontWeight: '800', fontSize: 15, fill: theme.text },
  });
  private readonly caption = new Text({
    text: 's do ataku',
    style: { fontFamily: theme.fontFamily, fontSize: 11, fill: theme.textMuted },
  });
  private radius = 20;
  /** Displayed fill; eases towards the real value so knockbacks visibly rewind the ring. */
  private shown = 0;
  private urgent = false;
  private clock = 0;

  constructor(caption = 's do ataku') {
    super();
    this.caption.text = caption;
    this.seconds.anchor.set(0.5);
    this.caption.anchor.set(0.5, 0);
    this.dial.addChild(this.ring, this.seconds);
    this.addChild(this.dial, this.caption);
  }

  layout(radius: number): void {
    this.radius = radius;
    this.seconds.style.fontSize = Math.round(radius * 0.75);
    this.caption.position.set(0, radius + 5);
  }

  /** `fraction` is how full the charge is (0–1); `dt` is the frame time in seconds. */
  update(fraction: number, secondsLeft: number, dt: number): void {
    this.clock += dt;
    this.shown += (fraction - this.shown) * Math.min(1, dt * 12);

    const urgent = secondsLeft <= URGENT_SECONDS;
    if (urgent !== this.urgent) {
      this.urgent = urgent;
      this.seconds.style.fill = urgent ? theme.error : theme.text;
    }
    this.seconds.text = String(Math.max(1, Math.ceil(secondsLeft)));

    const r = this.radius;
    const g = this.ring.clear();
    g.circle(0, 0, r).fill(theme.hpTrack).stroke({ width: 4, color: theme.lineThin });
    if (this.shown > 0.002) {
      const start = -Math.PI / 2;
      g.moveTo(0, -r)
        .arc(0, 0, r, start, start + Math.PI * 2 * Math.min(1, this.shown))
        .stroke({ width: 4, color: urgent ? theme.error : theme.fire, cap: 'round' });
    }
    this.dial.scale.set(urgent ? 1 + 0.08 * Math.sin(this.clock * 12) : 1);
  }
}
