# Sudoku & Dragons

Mobile game (iOS + Android): sudoku where solving drives RPG duels, in the spirit of Match Masters.
Built by vibe coding: Claude writes the code, the owner steers. The owner writes in Polish; in-game text is Polish,
code and comments are English.

## Stack

- **PixiJS v8** for rendering, **GSAP** for animation, **TypeScript 7**, **Vite 8**, **Vitest 5**
- **Capacitor 8** wraps the web build: `android/` is the native Android project (app id
  `com.metrezz.sudokudragons`, portrait only). iOS is not added yet; it needs a Mac or cloud CI.
- Planned: **Supabase** backend (project `SudokuAndDragons`, ref `wmsngertpctiiermiigz`, eu-central-1)
  for accounts and server-validated duels.

## Commands

- `npm run dev`: dev server on port 5173, also exposed on the LAN so a phone on the same Wi-Fi can open it
- `npm test`: Vitest
- `npm run typecheck`: checks the whole app, then `src/core` on its own without DOM types
- `npm run build`: typecheck + production build into `dist/`
- `npm run android:sync`: build and copy the game into `android/` (run after every web change you want on the device)
- `npm run android:run`: sync, then build and install on a connected phone or running emulator
- `npm run android:open`: open `android/` in Android Studio
- `npm run icons`: render the app icon from `assets/src/icon-{background,foreground}.svg` (drawn on the full
  108 dp adaptive canvas, 1024 px; keep the artwork within ~320 px of the centre) into every Android
  mipmap density plus `assets/icon-1024.png` / `icon-512.png` for the stores. `--preview out.png` draws
  it under launcher masks. Don't use @capacitor/assets: it insets the layers and renders them blurry.
- Building Android from a shell needs the JDK bundled with Android Studio:
  `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`, then `android\gradlew.bat assembleDebug`
  (APK lands in `android/app/build/outputs/apk/debug/`). `android/local.properties` (not in git) points at the SDK.
- The Vite dev server must not watch `android/` (see vite.config.ts): its file handles stop Capacitor and
  Gradle from deleting folders there on Windows. Stop the dev server if `cap add`/Gradle reports a busy folder.

## Layout

- `src/core/`: pure game logic (sudoku generator, solver, move rules). No DOM, no PixiJS, no Node APIs.
  It must also run in Supabase Edge Functions (Deno), so imports use explicit `.ts` extensions.
  `src/core/tsconfig.json` enforces the no-DOM rule. Tests sit next to the code as `*.test.ts`.
  `core/battle` turns sudoku moves into hits: correct digit = damage to the enemy (more for completed
  rows/columns/boxes, combo bonus for several at once), wrong digit = enemy hits the player, solving the board
  is a finishing blow. Each difficulty has its own dragon (`core/battle/enemies.ts`: Młody smok, Smok,
  Pradawny smok) with HP tuned so it falls with the last few digits of its board, and harder hits and a faster
  timed attack the higher the level; `enemies.test.ts` guards the HP. Enemy names are masculine Polish
  because the UI says "{name} pokonany!".
  The enemy also charges a timed attack (`advanceTime`, fed the frame time by the game loop; core has no clocks
  of its own). Correct digits push the charge back, completed units much more, so speed is what keeps you safe.
  Balance numbers come from simulations: `npm run sim:hp` (when each dragon falls, and how much damage a
  board deals) and `npm run sim:timer` (HP lost to the timer at different speeds; `node scripts/sim-timer.ts
  hard 30 4` tries other values for one difficulty). Re-run them when changing HP, damage, interval or knockback.
- `src/game/`: PixiJS client. `main.ts` boots the app and swaps full screens (`screens/`: `MenuScreen` for
  picking a difficulty, `GameScreen` for a battle); a screen has `layout`, and optionally `update` (per frame)
  and `handleKey`. `ui/` are reusable views (`Button`, `Modal`, board, arena…), `fx/` holds short-lived effects
  (orbs, particles, floating text, shake) and `killTweens`, `theme.ts` holds colours and fonts,
  `difficulty.ts` the Polish difficulty names and the remembered last choice (localStorage),
  `enemies.ts` each dragon's placeholder look (emoji, tint, size) keyed by enemy id.
  `GameScreen` asks `core` what a move does, then plays it out; the views never decide game rules.
  While a `Modal` is open on the battle screen the battle is paused (no timer, no input); the battle also
  pauses itself when the app goes to the background. Screens are laid out inside the safe area
  (`safeArea.ts` reads CSS env(safe-area-inset-*)); full-screen layers they draw extend by `OVERSCAN`.
  The Android back button goes to the screen's `handleBack()`; returning false exits the app.

## Conventions

- Boards are seeded (`generatePuzzle(seed, difficulty)`) and fully deterministic, so a seed is enough to share
  a board between players or reproduce a bug.
- In duels the client must never be trusted with the solution; the server holds it and validates moves with `core`.
- Single npm package, no workspaces: the repo lives on an exFAT drive (D:), which cannot hold the symlinks
  npm workspaces need.
- Pixi `Container` already has a `label` property; don't name fields `label` on Container subclasses.
- Kill GSAP tweens in `destroy()` of views that animate their children, with `killTweens(a, b, …)` from
  `fx/tweens.ts`, never `gsap.killTweensOf([a, b])`: the array form leaves delayed or not-yet-started tweens
  alive, they later throw on the destroyed object every frame and freeze every animation in the game.

## Checking changes in the browser

- Without URL parameters the game opens on the menu. `?seed=123&difficulty=easy|medium|hard` skips it and
  reproduces a board.
- Menu: keys 1–3 pick a difficulty. Battle: arrow keys move the selection, keys 1–9 place digits, Escape asks
  to leave.
- In dev, `window.__game.start(difficulty, seed?)` and `__game.menu()` switch screens, and `__game.screen` is the
  current screen. On a `GameScreen`: `debugFill(n)` fills all but `n` cells,
  `debugMistake()` plays a wrong digit, `battle.charge = 36` jumps the dragon's timer to 4 s before its attack.
- When the Browser pane is hidden the page gets only a couple of frames per second, so animations crawl and
  screenshots catch them half-way. Check state through `__game` instead of trusting such a screenshot.
