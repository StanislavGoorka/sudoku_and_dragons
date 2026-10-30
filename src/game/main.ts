import '@fontsource/baloo-2/latin-500.css';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/baloo-2/latin-ext-500.css';
import '@fontsource/baloo-2/latin-ext-700.css';
import '@fontsource/baloo-2/latin-ext-800.css';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import gsap from 'gsap';
import { Application, type Container } from 'pixi.js';
import { generatePuzzle, type Difficulty, type Seat } from '../core/index.ts';
import { feedback } from './audio/feedback.ts';
import { DIFFICULTIES, loadDifficulty, saveDifficulty } from './difficulty.ts';
import { readSafeArea, type Insets } from './safeArea.ts';
import type { DuelRow, Me } from './net/online.ts';
import { startCloudSave } from './net/cloudSave.ts';
import { AccountScreen } from './screens/AccountScreen.ts';
import { DuelScreen } from './screens/DuelScreen.ts';
import { GameScreen } from './screens/GameScreen.ts';
import { LobbyScreen } from './screens/LobbyScreen.ts';
import { MenuScreen } from './screens/MenuScreen.ts';
import { ProgressScreen } from './screens/ProgressScreen.ts';
import { ShopScreen } from './screens/ShopScreen.ts';
import { dailyChallenge } from './progress/daily.ts';
import { emptyProgress, isUnlocked, LEVELS, type CosmeticKind } from './progress/progress.ts';
import { onProgressReplaced, progress, saveProgress } from './progress/store.ts';
import { theme } from './theme.ts';
import { Backdrop } from './ui/Backdrop.ts';

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
  // No deferred (lazy) first renders: a tween killed before the next tick would otherwise still
  // render once from GSAP's lazy queue, on an object that may already be destroyed.
  gsap.defaults({ lazy: false });
  // Pixi measures text when it is created, so the bundled font must be ready before any screen.
  // The sample has Polish letters to pull in the latin-ext files too.
  await Promise.all(['500', '700', '800'].map((weight) => document.fonts.load(`${weight} 20px "Baloo 2"`, 'Aąż'))).catch(
    () => {},
  );

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
  // Covers the whole display, safe-area margins included; screens draw on top of it.
  const backdrop = new Backdrop();
  app.stage.addChild(backdrop);

  const layoutScreen = () => {
    backdrop.layout(app.screen.width, app.screen.height);
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
        onPlay: (next) => startBattle(next),
        onMenu: showMenu,
      }),
    );
    if (import.meta.env.DEV) console.info(`[game] seed=${seed} difficulty=${difficulty}`);
  };

  /** Today's daily challenge: the day's board, on a level the player has opened. */
  const startDaily = () => {
    const daily = dailyChallenge(
      new Date(),
      LEVELS.filter((d) => isUnlocked(progress, d)),
    );
    show(
      new GameScreen(generatePuzzle(daily.seed, daily.difficulty), {
        onRestart: startDaily,
        onPlay: (next) => startBattle(next),
        onMenu: showMenu,
        daily: daily.key,
      }),
    );
  };

  const showMenu = () => {
    show(
      new MenuScreen({
        selected: loadDifficulty(),
        onPick: (difficulty) => startBattle(difficulty),
        onOnline: () => showLobby(),
        onDaily: startDaily,
        onProgress: () => showProgress(),
        onShop: () => showShop(),
        onAccount: () => showAccount(),
      }),
    );
  };

  const showAccount = () => {
    show(new AccountScreen({ onBack: showMenu }));
  };

  const showShop = (kind?: CosmeticKind) => {
    show(new ShopScreen({ onBack: showMenu, kind }));
  };

  const showProgress = () => {
    show(new ProgressScreen({ onBack: showMenu }));
  };

  const showLobby = () => {
    show(new LobbyScreen({ onStart: startDuel, onMenu: showMenu }));
  };

  const startDuel = (duel: DuelRow, seat: Seat, me: Me) => {
    show(
      new DuelScreen(duel, me, seat, {
        onLobby: showLobby,
        onMenu: showMenu,
        onRematch: (next, nextSeat) => startDuel(next, nextSeat, me),
      }),
    );
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

  // The cloud save can bring in progress from another device; the menu shows stars and unlocked levels.
  onProgressReplaced(() => {
    if (screen instanceof MenuScreen) showMenu();
  });
  startCloudSave();

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: {
        get screen() {
          return screen;
        },
        start: startBattle,
        daily: startDaily,
        menu: showMenu,
        lobby: () => showLobby(),
        progress: () => showProgress(),
        shop: (kind?: CosmeticKind) => showShop(kind),
        account: () => showAccount(),
        feedback,
        /** The saved progress object; after changing it, call save(). */
        state: progress,
        save: saveProgress,
        /** Opens every level (as if each had been won once). */
        unlockAll: () => {
          for (const level of Object.values(progress.levels)) level.wins = Math.max(1, level.wins);
          saveProgress();
        },
        resetProgress: () => {
          Object.assign(progress, emptyProgress());
          saveProgress();
        },
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
