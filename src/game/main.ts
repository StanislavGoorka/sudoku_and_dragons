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
import 'pixi.js/events';
import { generatePuzzle, stageById, type Difficulty, type Seat, type Stage } from '../core/index.ts';
import { feedback } from './audio/feedback.ts';
import type { TrackId } from './audio/tracks.ts';
import { DIFFICULTIES, loadDifficulty, saveStageId } from './difficulty.ts';
import { readSafeArea, type Insets } from './safeArea.ts';
import type { DuelBackend } from './net/duelBackend.ts';
import type { DuelRow, Me } from './net/online.ts';
import { MenuScreen } from './screens/MenuScreen.ts';
import { dailyChallenge } from './progress/daily.ts';
import { emptyProgress, isUnlocked, LEVELS, type CosmeticKind } from './progress/progress.ts';
import { activeBattle, onProgressReplaced, progress, saveProgress } from './progress/store.ts';
import { theme } from './theme.ts';
import { Backdrop } from './ui/Backdrop.ts';
import { Modal } from './ui/Modal.ts';
import { isAppActive, setAppActive } from './activity.ts';
import { APP_RELEASE, flushDiagnostics, reportBootDuration, reportDiagnostic, setDiagnosticScreen } from './diagnostics/index.ts';
import type { DiagnosticScreen } from './diagnostics/reporter.ts';
import type { RankedRun } from './net/daily.ts';

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
  resume?(): void;
  /** Its background music (the menu's, if not given). */
  readonly music?: TrackId;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

export async function boot(): Promise<void> {
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
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    preference: 'webgl',
    // Graphics, Text and BitmapText register their own pipes. Events are imported above;
    // this game needs no DOM renderer, spritesheets, accessibility overlays or filter bundle.
    skipExtensionImports: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  let screen: Screen | null = null;
  let navigation = 0;
  let screenKind: DiagnosticScreen = 'boot';
  let loading = false;
  let loadingModal: Modal | null = null;
  let loadingTimer: ReturnType<typeof setTimeout> | undefined;
  let needsRecovery = true;
  let menuNeedsRefresh = false;
  const activePointers = new Set<number>();
  let firstScreen = true;
  let insets: Insets = readSafeArea();
  // Covers the whole display, safe-area margins included; screens draw on top of it.
  const backdrop = new Backdrop();
  app.stage.addChild(backdrop);

  const layoutScreen = () => {
    backdrop.layout(app.screen.width, app.screen.height);
    loadingModal?.position.set(insets.left, insets.top);
    loadingModal?.layout(app.screen.width - insets.left - insets.right, app.screen.height - insets.top - insets.bottom);
    if (!screen) return;
    screen.position.set(insets.left, insets.top);
    screen.layout(
      app.screen.width - insets.left - insets.right,
      app.screen.height - insets.top - insets.bottom,
    );
  };

  const clearLoading = () => {
    clearTimeout(loadingTimer);
    loadingModal?.destroy({ children: true });
    loadingModal = null;
    loading = false;
  };

  const show = (next: Screen, kind: DiagnosticScreen) => {
    navigation++;
    clearLoading();
    if (screen) {
      gsap.killTweensOf(screen);
      screen.destroy({ children: true });
    }
    screen = next;
    screenKind = kind;
    setDiagnosticScreen(kind);
    app.ticker.maxFPS = kind === 'battle' || kind === 'duel' ? 60 : 30;
    feedback.playMusic(next.music ?? 'menu');
    app.stage.addChild(next);
    layoutScreen();
    if (isAppActive()) gsap.fromTo(next, { alpha: 0 }, { alpha: 1, duration: 0.25 });
    else { next.pause?.(); gsap.ticker.sleep(); }
    if (firstScreen) {
      firstScreen = false;
      // Leave a paint opportunity before loading accounts/cloud recovery. Online screens can
      // request their modules immediately; no idle timeout delays an already running duel.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        performance.mark('game-ready');
        document.getElementById('startup')?.remove();
        reportBootDuration(performance.now());
        // Mounting the canvas and marking readiness can share a frame. Give the browser
        // two further paint opportunities before parsing account SDKs on a slow renderer.
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
          void import('./net/cloudSave.ts').then(({ startCloudSave }) => startCloudSave())
            .catch((error) => reportDiagnostic('cloud_sync', 'cloud_sync', error));
          void import('./net/daily.ts').then(({ flushDailyResults }) => flushDailyResults()).catch(() => {});
          if (screenKind === 'menu' && !loading) void recoverOnline();
        }, 0)));
      }));
    }
  };

  /** Construct only the latest requested screen: stale imports must not create subscriptions or battles. */
  const openScreen = (kind: DiagnosticScreen, load: () => Promise<() => Screen>, after?: () => void): void => {
    const expected = ++navigation;
    clearLoading();
    loading = true;
    screen?.pause?.();
    if (screen) screen.eventMode = 'none';
    const overlay = (failed: boolean) => {
      loadingModal?.destroy({ children: true });
      loadingModal = new Modal(failed ? 'Nie udało się otworzyć ekranu' : 'Wczytywanie…',
        failed ? 'Sprawdź połączenie i spróbuj ponownie.' : 'Za chwilę będziemy gotowi.',
        [...(failed ? [{ text: 'Spróbuj ponownie', variant: 'primary' as const, onTap: () => openScreen(kind, load, after) }] : []),
          { text: 'Wróć do menu', onTap: () => showMenu() }]);
      app.stage.addChild(loadingModal);
      layoutScreen();
    };
    loadingTimer = setTimeout(() => overlay(false), 200);
    void load().then((create) => {
      if (navigation !== expected) return;
      show(create(), kind);
      after?.();
    }).catch((error) => {
      if (navigation !== expected) return;
      clearTimeout(loadingTimer);
      reportDiagnostic('runtime', 'render', error);
      overlay(true);
    });
  };

  /** A campaign battle: the stage's dragon on a fresh board of its region's difficulty. */
  const startStage = (stage: Stage, seed = randomSeed()) => {
    const saved = activeBattle();
    if (saved) {
      if (saved.stage === stage.id) return resumeBattle();
      return showMenu(() => startStage(stage, seed));
    }
    saveStageId(stage.id);
    openScreen('battle', async () => {
      const { GameScreen } = await import('./screens/GameScreen.ts');
      return () => new GameScreen(generatePuzzle(seed, stage.region.difficulty), {
        onRestart: () => startStage(stage),
        onPlay: (next) => startStage(next),
        onMenu: showMenu,
        stage,
      });
    });
    if (import.meta.env.DEV) console.info(`[game] stage=${stage.id} seed=${seed}`);
  };

  /** A battle outside the campaign (a board to reproduce from the URL): the difficulty's dragon, nothing opened. */
  const startBattle = (difficulty: Difficulty, seed = randomSeed()) => {
    const saved = activeBattle();
    if (saved) {
      if (!saved.stage && !saved.daily && saved.puzzle.difficulty === difficulty) return resumeBattle();
      return showMenu(() => startBattle(difficulty, seed));
    }
    openScreen('battle', async () => {
      const { GameScreen } = await import('./screens/GameScreen.ts');
      return () => new GameScreen(generatePuzzle(seed, difficulty), {
        onRestart: () => startBattle(difficulty),
        onPlay: (next) => startStage(next),
        onMenu: showMenu,
      });
    });
    if (import.meta.env.DEV) console.info(`[game] seed=${seed} difficulty=${difficulty}`);
  };

  /** Today's daily challenge: the day's board, on a level the player has opened. */
  const startDaily = () => {
    const daily = dailyChallenge(
      new Date(),
      LEVELS.filter((d) => isUnlocked(progress, d)),
    );
    const saved = activeBattle();
    if (saved) {
      if (saved.daily === daily.key) return resumeBattle();
      return showMenu(startDaily);
    }
    openScreen('battle', async () => {
      const { GameScreen } = await import('./screens/GameScreen.ts');
      return () => new GameScreen(generatePuzzle(daily.seed, daily.difficulty), {
        onRestart: startDaily,
        onPlay: (next) => startStage(next),
        onMenu: showMenu,
        daily: daily.key,
      });
    });
  };

  const resumeBattle = (): void => {
    const saved = activeBattle();
    if (!saved) return showMenu();
    const stage = saved.stage ? stageById(saved.stage) : undefined;
    openScreen('battle', async () => {
      const { GameScreen } = await import('./screens/GameScreen.ts');
      return () => new GameScreen(saved.puzzle, {
        resume: saved, stage, daily: saved.daily, onMenu: showMenu,
        onRanking: showDaily,
        onRestart: saved.daily ? startDaily : stage ? () => startStage(stage) : () => startBattle(saved.puzzle.difficulty),
        onPlay: (next) => startStage(next),
      });
    }, () => screen?.pause?.());
  };

  const showMenu = (onNewBattle?: () => void): void => {
    menuNeedsRefresh = false;
    show(
      new MenuScreen({
        onPick: (stage) => startStage(stage),
        onMap: () => showMap(),
        onOnline: () => showLobby(),
        onDaily: showDaily,
        onProgress: () => showProgress(),
        onShop: () => showShop(),
        onAccount: () => showAccount(),
        onResume: resumeBattle,
        onNewBattle,
      }), 'menu',
    );
    if (!onNewBattle && needsRecovery && performance.getEntriesByName('game-ready').length) void recoverOnline();
  };

  const showMap = () => {
    openScreen('map', async () => {
      const { MapScreen } = await import('./screens/MapScreen.ts');
      return () => new MapScreen({ onBack: showMenu, onPick: (stage) => startStage(stage) });
    });
  };

  const showDaily = () => {
    openScreen('progress', async () => {
      const { DailyScreen } = await import('./screens/DailyScreen.ts');
      return () => new DailyScreen({ onBack: showMenu, onOffline: startDaily, onStart: startRankedDaily,
        level: dailyChallenge(new Date(), LEVELS.filter((d) => isUnlocked(progress, d))).difficulty });
    });
  };
  const startRankedDaily = (run: RankedRun): void => {
    if (activeBattle()) return showMenu(() => startRankedDaily(run));
    openScreen('battle', async () => {
      const { GameScreen } = await import('./screens/GameScreen.ts');
      return () => new GameScreen(generatePuzzle(Number(run.seed), run.difficulty), {
        onMenu: showMenu, onRestart: showDaily, onPlay: startStage, daily: run.day, ranked: run, onRanking: showDaily,
      });
    });
  };

  const showAccount = () => {
    openScreen('account', async () => {
      const { AccountScreen } = await import('./screens/AccountScreen.ts');
      return () => new AccountScreen({ onBack: showMenu });
    });
  };

  const showShop = (kind?: CosmeticKind) => {
    openScreen('shop', async () => {
      const { ShopScreen } = await import('./screens/ShopScreen.ts');
      return () => new ShopScreen({ onBack: showMenu, kind });
    });
  };

  const showProgress = () => {
    openScreen('progress', async () => {
      const { ProgressScreen } = await import('./screens/ProgressScreen.ts');
      return () => new ProgressScreen({ onBack: showMenu });
    });
  };

  const showLobby = () => {
    openScreen('lobby', async () => {
      const { LobbyScreen } = await import('./screens/LobbyScreen.ts');
      return () => new LobbyScreen({ onStart: startDuel, onMenu: showMenu });
    });
  };

  const startDuel = (duel: DuelRow, seat: Seat, me: Me, backend?: DuelBackend) => {
    openScreen('duel', async () => {
      const { DuelScreen } = await import('./screens/DuelScreen.ts');
      return () => new DuelScreen(duel, me, seat, {
        onLobby: showLobby,
        onMenu: showMenu,
        onRematch: (next, nextSeat) => startDuel(next, nextSeat, me, backend),
        backend,
      });
    });
  };

  const recoverOnline = async (): Promise<void> => {
    const expected = navigation;
    try {
      const [{ connect, supabase }, { recoverDuel }] = await Promise.all([import('./net/online.ts'), import('./net/duelRecovery.ts')]);
      if (navigation !== expected || !isAppActive()) return;
      const me = await connect();
      const joined = await recoverDuel(me);
      const session = (await supabase.auth.getSession()).data.session;
      // A late read must never interrupt another screen or restore the previous account's match.
      if (navigation !== expected || session?.user.id !== me.id) return;
      needsRecovery = false;
      if (!joined) return;
      if (joined.duel.status === 'waiting') {
        openScreen('lobby', async () => {
          const { LobbyScreen } = await import('./screens/LobbyScreen.ts');
          return () => new LobbyScreen({ onStart: startDuel, onMenu: showMenu, resume: { ...joined, me } });
        });
      } else {
        startDuel(joined.duel, joined.seat, me);
      }
    } catch {
      // Offline solo play stays available; the lobby and returning to the app retry recovery.
    }
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
    if (menuNeedsRefresh && !activePointers.size && !loading && screen instanceof MenuScreen && !screen.modalOpen) showMenu();
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
  window.addEventListener('pointerdown', (event) => { activePointers.add(event.pointerId); feedback.unlock(); }, { capture: true });
  window.addEventListener('pointerup', (event) => activePointers.delete(event.pointerId), { capture: true });
  window.addEventListener('pointercancel', (event) => activePointers.delete(event.pointerId), { capture: true });
  window.addEventListener('blur', () => activePointers.clear());
  window.addEventListener('keydown', (event) => {
    feedback.unlock();
    if (loading) { if (event.key === 'Escape') showMenu(); return; }
    screen?.handleKey?.(event);
  });
  let nativeActive = true;
  let pageActive = true;
  const updateActivity = () => {
    const active = nativeActive && pageActive && !document.hidden;
    if (active === isAppActive()) return;
    setAppActive(active);
    if (!active) {
      activePointers.clear();
      screen?.pause?.();
      feedback.suspend();
      app.stop();
      gsap.ticker.sleep();
    } else {
      app.start();
      gsap.ticker.wake();
      feedback.resume();
      screen?.resume?.();
      if (screenKind === 'menu' && !loading) void recoverOnline();
    }
  };
  document.addEventListener('visibilitychange', updateActivity);
  window.addEventListener('pagehide', () => { pageActive = false; updateActivity(); });
  window.addEventListener('pageshow', () => { pageActive = true; updateActivity(); });
  if (Capacitor.isNativePlatform()) {
    void App.addListener('appStateChange', ({ isActive }) => {
      nativeActive = isActive;
      updateActivity();
    });
    void App.addListener('backButton', () => {
      if (loading) { showMenu(); return; }
      if (!screen?.handleBack?.()) void App.exitApp();
    });
  }
  updateActivity();
  window.addEventListener('online', () => { if (screenKind === 'menu' && !loading) void recoverOnline(); });

  // The cloud save can bring in progress from another device; the menu shows stars and unlocked levels.
  onProgressReplaced(() => {
    menuNeedsRefresh = true;
  });

  if (import.meta.env.DEV) {
    Object.assign(window, {
      __game: {
        get screen() {
          return screen;
        },
        start: startBattle,
        stage: (id: string) => {
          const stage = stageById(id);
          if (stage) startStage(stage);
        },
        map: () => showMap(),
        daily: startDaily,
        ranking: showDaily,
        menu: showMenu,
        lobby: () => showLobby(),
        progress: () => showProgress(),
        shop: (kind?: CosmeticKind) => showShop(kind),
        account: () => showAccount(),
        feedback,
        diagnostics: { report: reportDiagnostic, flush: flushDiagnostics, release: APP_RELEASE },
        get rendering() { return { active: isAppActive(), started: app.ticker.started, maxFPS: app.ticker.maxFPS,
          resolution: app.renderer.resolution, loading }; },
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
  const linkedStage = stageById(params.get('stage') ?? '');
  if (linkedStage) {
    startStage(linkedStage, Number(params.get('seed')) || randomSeed());
  } else if (params.has('seed') || params.has('difficulty')) {
    const difficulty = DIFFICULTIES.find((d) => d === params.get('difficulty')) ?? loadDifficulty();
    startBattle(difficulty, Number(params.get('seed')) || randomSeed());
  } else {
    showMenu();
  }
}
