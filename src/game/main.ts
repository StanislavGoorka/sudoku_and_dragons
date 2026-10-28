import gsap from 'gsap';
import { Application, type Container } from 'pixi.js';
import { generatePuzzle, type Difficulty } from '../core/index.ts';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './difficulty.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { MenuScreen } from './screens/MenuScreen.ts';
import { theme } from './theme.ts';

/** What every full screen offers to the app shell. */
interface Screen extends Container {
  layout(width: number, height: number): void;
  update?(deltaMs: number): void;
  handleKey?(event: KeyboardEvent): void;
}

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

  let screen: Screen | null = null;
  const show = (next: Screen) => {
    if (screen) {
      gsap.killTweensOf(screen);
      screen.destroy({ children: true });
    }
    screen = next;
    app.stage.addChild(next);
    next.layout(app.screen.width, app.screen.height);
    gsap.fromTo(next, { alpha: 0 }, { alpha: 1, duration: 0.25 });
  };

  const startBattle = (difficulty: Difficulty, seed = randomSeed()) => {
    saveDifficulty(difficulty);
    show(
      new GameScreen(generatePuzzle(seed, difficulty), {
        onRestart: () => startBattle(difficulty),
        onMenu: showMenu,
      }),
    );
    if (import.meta.env.DEV) console.info(`[game] seed=${seed} difficulty=${difficulty}`);
  };

  const showMenu = () => {
    show(new MenuScreen({ selected: loadDifficulty(), onPick: (difficulty) => startBattle(difficulty) }));
  };

  // resizeTo applies the new size on the next frame, so lay out when the screen size actually changes.
  let width = app.screen.width;
  let height = app.screen.height;
  // The ticker caps a frame at 100 ms (minFPS = 10), and stops while the page is hidden,
  // so the dragon's attack timer pauses instead of firing a burst after a long break.
  app.ticker.add((ticker) => {
    screen?.update?.(ticker.deltaMS);
    if (app.screen.width === width && app.screen.height === height) return;
    width = app.screen.width;
    height = app.screen.height;
    screen?.layout(width, height);
  });

  window.addEventListener('keydown', (event) => screen?.handleKey?.(event));

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: {
        get screen() {
          return screen;
        },
        start: startBattle,
        menu: showMenu,
      },
    });
  }

  // ?seed=123&difficulty=hard skips the menu and reproduces a specific board.
  const params = new URLSearchParams(location.search);
  if (params.has('seed') || params.has('difficulty')) {
    const difficulty = DIFFICULTIES.find((d) => d === params.get('difficulty')) ?? loadDifficulty();
    startBattle(difficulty, Number(params.get('seed')) || randomSeed());
  } else {
    showMenu();
  }
}

void boot();
