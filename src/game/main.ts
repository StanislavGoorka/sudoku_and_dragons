import { Application } from 'pixi.js';
import { generatePuzzle, type Difficulty } from '../core/index.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { theme } from './theme.ts';

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: theme.background,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 3),
  });
  document.getElementById('app')!.appendChild(app.canvas);

  // ?seed=123&difficulty=hard reproduces a specific board.
  const params = new URLSearchParams(location.search);
  const difficulty = DIFFICULTIES.find((d) => d === params.get('difficulty')) ?? 'easy';
  const firstSeed = Number(params.get('seed')) || randomSeed();

  let screen: GameScreen | null = null;
  const start = (seed: number) => {
    screen?.destroy({ children: true });
    screen = new GameScreen(generatePuzzle(seed, difficulty), () => start(randomSeed()));
    app.stage.addChild(screen);
    screen.layout(app.screen.width, app.screen.height);
    if (import.meta.env.DEV) console.info(`[game] seed=${seed} difficulty=${difficulty}`);
  };

  // resizeTo applies the new size on the next frame, so lay out when the screen size actually changes.
  let width = app.screen.width;
  let height = app.screen.height;
  // The ticker caps a frame at 100 ms (minFPS = 10), and stops while the page is hidden,
  // so the dragon's attack timer pauses instead of firing a burst after a long break.
  app.ticker.add((ticker) => {
    screen?.update(ticker.deltaMS);
    if (app.screen.width === width && app.screen.height === height) return;
    width = app.screen.width;
    height = app.screen.height;
    screen?.layout(width, height);
  });

  window.addEventListener('keydown', (event) => screen?.handleKey(event));

  if (import.meta.env.DEV) {
    Object.assign(window, { __game: { get screen() { return screen; } } });
  }

  start(firstSeed);
}

void boot();
