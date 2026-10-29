# Sudoku & Dragons

Mobile game (iOS + Android): sudoku where solving drives RPG duels, in the spirit of Match Masters.
Built by vibe coding: Claude writes the code, the owner steers. The owner writes in Polish; in-game text is Polish,
code and comments are English.

## Stack

- **PixiJS v8** for rendering, **GSAP** for animation, **TypeScript 7**, **Vite 8**, **Vitest 5**
- **Capacitor 8** wraps the web build: `android/` is the native Android project (app id
  `com.metrezz.sudokudragons`, portrait only). iOS is not added yet; it needs a Mac or cloud CI.
- **Supabase** (project `SudokuAndDragons`, ref `wmsngertpctiiermiigz`, eu-central-1) runs online duels:
  anonymous sign-in (enabled in the dashboard: Authentication → Sign In / Providers), tables `profiles`,
  `duels`, `duel_secrets` (schema in `supabase/migrations/`) and the Edge Function `duel`.
  Free plan: it allows two active projects, and this one shares the quota with the owner's other projects.

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
- `npm run function:bundle`: copy `src/core` into `supabase/functions/duel/core/` (gitignored) before deploying the
  `duel` function (MCP `deploy_edge_function` with `index.ts` + every `core/**` file, verify_jwt on).
  Redeploy whenever core rules change, or the server judges by old rules.
- `npm run test:server`: end-to-end check of the deployed function with fresh anonymous players (rooms,
  matchmaking, moves, forfeits, rematches, a turn running out, and that nobody can read solutions or other
  players' duels). It waits out one full turn, so it takes about 40 s; run it in the background.
- `npm run sim:duel`: bots duel each other; reports how duels end, first-mover advantage, strategy edge.
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
- `core/duel`: online duel rules on one shared board. Players take turns of up to 3 correct digits (a digit that
  completes a unit is free: extra move); correct digits damage the rival (same damage as vs the dragon), a wrong
  digit costs its own player 10 HP and ends the turn; 30 s per turn, three timeouts in a row forfeit; 150 HP;
  a full board goes to the player with more HP. `npm run sim:duel`: duels end by KO at ~75-80% of the board
  after ~8 turns; the first mover wins ~53%; tactics matter (smart bot beats random 96%).
- `supabase/functions/duel/index.ts`: the referee. Holds each board's solution (`duel_secrets`, no RLS
  policies, so no client can read it), judges moves with core, writes the new `state` + `last_event` and bumps
  `version` (updates only the version it read: concurrent writes get 409 `conflict`). Clients only read
  `duels` (their own, via RLS) and follow them live through Supabase Realtime. Note: a bot that solves the
  sudoku itself can still play perfectly; hiding the solution stops reading answers, not solving.
  Callers are identified with `auth.getClaims` (local signature check, no round trip to Auth). A move loads
  the duel and its solution in one query. A turn that ran out (`timeout`, claimable by either player once the
  deadline passed) starts the next turn at the old deadline, not at the claim, because clients already show it
  from the deadline on; only a claim more than 3 s late starts it at claim time.
  Rematch: after the end a player calls `rematch`; the first is recorded in `rematch_by` and waits, the second
  makes the function create the next duel (same players, seats and difficulty, fresh board) and link it in
  `next_duel`, which the first player picks up live. Leaving the end screen calls `decline-rematch`; giving up
  declines too (`rematch_declined`). After a duel ends, `DuelScreen.applyRow` only reads these fields and never
  replays `last_event`.
- `src/game/`: PixiJS client. `main.ts` boots the app and swaps full screens (`screens/`: `MenuScreen` for
  picking a difficulty, `GameScreen` for a battle, `LobbyScreen` and `DuelScreen` for online duels); a screen has `layout`, and optionally `update` (per frame)
  and `handleKey`. `ui/` are reusable views (`Button`, `Modal`, board, arena…), `fx/` holds short-lived effects
  (orbs, particles, floating text, shake) and `killTweens`, `theme.ts` holds colours and fonts,
  `difficulty.ts` the Polish difficulty names and the remembered last choice (localStorage),
  `enemies.ts` each dragon's placeholder look (emoji, tint, size) keyed by enemy id,
  `net/online.ts` the Supabase client (sign-in, nickname, calls to the `duel` function, `watchDuel` for live
  updates, `serverNow()` for the turn clock), `net/config.ts` the project URL and publishable key (public).
  `BoardView` only shows results (`reveal`, `reject`, `sync`, which can also take digits back); `GameScreen`
  judges solo moves with core.
  `DuelScreen` is optimistic: `net/duelSync.ts` (pure, tested) solves the shared board locally (it has one
  solution) and predicts each own move and each turn running out, so they play out the moment they happen.
  Predictions go to the server one at a time, in order (a timeout claim 0.5 s after the deadline, so the
  rival's last-moment move lands first). A server version that matches the prediction changes nothing on
  screen; anything else (the rival's moves, a refusal) replaces all predictions: own digits are taken back
  without animation, a toast says why, and the server's event is animated. Failed requests re-read the duel,
  then retry (network, conflict, `not-yet`) or roll back. The end sequence starts only once the server
  confirms the duel is over, timed from the last hit shown.
  `LobbyScreen` shows every result at once too: the lobby before sign-in finishes (`connect()` is shared and
  runs in the background; the nickname is made up locally), the search or the room (code filled in when it
  comes), "Dołączam…". A request whose answer comes back after the player moved on lets its duel go
  (`leaveDuel`). Giving up a duel and leaving the end screen also go to the menu at once.
  `GameScreen` asks `core` what a move does, then plays it out; the views never decide game rules.
  While a `Modal` is open on the battle screen the battle is paused (no timer, no input); the battle also
  pauses itself when the app goes to the background. Screens are laid out inside the safe area
  (`safeArea.ts` reads CSS env(safe-area-inset-*)); full-screen layers they draw extend by `OVERSCAN`.
  The Android back button goes to the screen's `handleBack()`; returning false exits the app.
- `src/game/audio/`: `feedback.ts` is the one place for sound and vibration. Screens report events
  (`feedback.digit(d)`, `unitsCompleted(n)`, `playerHit()`, `victory()`…) and it plays a sound from `Synth.ts`
  and a haptic (Capacitor Haptics, native app only), honouring the menu toggles (`settings.ts`, localStorage).
  `Synth.ts` synthesises every effect with Web Audio (no sample files); each digit plays a note of the
  C major pentatonic. Audio starts on the first tap (`feedback.unlock()` in main.ts) and is suspended in the
  background. To check sounds without ears, render them in an `OfflineAudioContext` (`new Synth(offlineCtx)`)
  and measure the peak: quiet effects ~0.05–0.15, digits ~0.3, big hits ~0.6, never above 1. Don't add a
  DynamicsCompressor: Chrome's turns short quiet sounds down ~10 dB even below its threshold.

## Conventions

- Boards are seeded (`generatePuzzle(seed, difficulty)`) and fully deterministic, so a seed is enough to share
  a board between players or reproduce a bug.
- In duels the client is never trusted: the server holds the solution and validates every move with `core`. The
  client may solve the board itself, but only to predict; the server's version always wins.
- Online actions are optimistic: show the outcome at once, send the request, reconcile when the answer comes.
  Never make the player wait on a spinner for something the client can predict.
- Single npm package, no workspaces: the repo lives on an exFAT drive (D:), which cannot hold the symlinks
  npm workspaces need.
- Pixi `Container` already has a `label` property; don't name fields `label` on Container subclasses.
- GSAP runs with `lazy: false` (main.ts): otherwise a tween killed before its first tick still renders once
  from GSAP's lazy queue, on an object that may already be destroyed.
- Kill GSAP tweens in `destroy()` of views that animate their children, with `killTweens(a, b, …)` from
  `fx/tweens.ts`, never `gsap.killTweensOf([a, b])`: the array form leaves delayed or not-yet-started tweens
  alive, they later throw on the destroyed object every frame and freeze every animation in the game.

## Checking changes in the browser

- Without URL parameters the game opens on the menu. `?seed=123&difficulty=easy|medium|hard` skips it and
  reproduces a board.
- Menu: keys 1–3 pick a difficulty. Battle: arrow keys move the selection, keys 1–9 place digits, Escape asks
  to leave.
- Two players in one browser: open `?profile=1` and `?profile=2` in two tabs; each gets its own anonymous
  account (dev only). Drive them with `__game.lobby()`, then `__game.screen.createRoom()` /
  `quickMatch()` / `join(code)`; in a duel, `board.select(cell)` + `handleDigit(d)` (correct digits are in
  `screen.sync.solution`; changing one there makes the next prediction wrong, to test a rollback).
  `screen.sync.predictions` lists what the server has not confirmed yet.
- In dev, `window.__game.start(difficulty, seed?)`, `__game.menu()` and `__game.lobby()` switch screens, and `__game.screen` is the
  current screen. On a `GameScreen`: `debugFill(n)` fills all but `n` cells,
  `debugMistake()` plays a wrong digit, `battle.charge = 36` jumps the dragon's timer to 4 s before its attack.
- When the Browser pane is hidden (or the game's tab is not the front one) the page gets few or no animation
  frames, so animations crawl or stop and screenshots catch them half-way. Check state through `__game`
  instead, and drive time yourself: import gsap from the prebundled `/node_modules/.vite/deps/gsap.js?v=…` URL
  (find it in `performance.getEntriesByType('resource')`), call `gsap.ticker.lagSmoothing(0)`, then every
  50 ms `gsap.ticker.tick()` and `__game.screen.update(50)`. `__game.feedback` is the live sound/haptics module.
  Keep each javascript_tool call under ~40 s.
