import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import gsap from 'gsap';
import { Application, type Container } from 'pixi.js';
import { generatePuzzle, type Difficulty } from '../core/index.ts';
import { feedback } from './audio/feedback.ts';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './difficulty.ts';
import { readSafeArea, type Insets } from './safeArea.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { MenuScreen } from './screens/MenuScreen.ts';
import { theme } from './theme.ts';

/**
 * What every full screen offers to the app shell. A screen is placed inside the safe area,
 * so `layout` gets the size of that area, not of the whole display.
 */
interface Screen extends Container {
  layout(width: number, height: number): void;
  update?(deltaMs: number): void;
  handleKey?(event: KeyboardEvent): void;
  /** Android back button. Returns false when the screen has nothing to go back to (the app then exits). */
  handleBack?(): boolean;
  /** The app went to the background. */
  pause?(): void;
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
  let insets: Insets = readSafeArea();

  const layoutScreen = () => {
    if (!screen) return;
    screen.position.set(insets.left, insets.top);
    screen.layout(
      app.screen.width - insets.left - insets.right,
      app.screen.height - insets.top - insets.bottom,
    );
  };

  const show = (next: Screen) => {
    if (screen) {
      gsap.killTweensOf(screen);
      screen.destroy({ children: true });
    }
    screen = next;
    app.stage.addChild(next);
    layoutScreen();
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

  // resizeTo applies the new size on the next frame, so lay out when the size actually changes.
  // Safe-area insets can also arrive a moment after start (Android applies viewport-fit late),
  // so they are re-read twice a second.
  let width = app.screen.width;
  let height = app.screen.height;
  let sinceInsetCheck = 0;
  // The ticker caps a frame at 100 ms (minFPS = 10), and stops while the page is hidden,
  // so the dragon's attack timer pauses instead of firing a burst after a long break.
  app.ticker.add((ticker) => {
    screen?.update?.(ticker.deltaMS);

    sinceInsetCheck += ticker.deltaMS;
    let changed = app.screen.width !== width || app.screen.height !== height;
    if (sinceInsetCheck > 500) {
      sinceInsetCheck = 0;
      const next = readSafeArea();
      if (JSON.stringify(next) !== JSON.stringify(insets)) {
        insets = next;
        changed = true;
      }
    }
    if (!changed) return;
    width = app.screen.width;
    height = app.screen.height;
    layoutScreen();
  });

  // Browsers start audio only after a user gesture, so every tap or key press may unlock it.
  window.addEventListener('pointerdown', () => feedback.unlock());
  window.addEventListener('keydown', (event) => {
    feedback.unlock();
    screen?.handleKey?.(event);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      screen?.pause?.();
      feedback.suspend();
    }
  });
  if (Capacitor.isNativePlatform()) {
    void App.addListener('backButton', () => {
      if (!screen?.handleBack?.()) void App.exitApp();
    });
  }

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: {
        get screen() {
          return screen;
        },
        start: startBattle,
        menu: showMenu,
        feedback,
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
