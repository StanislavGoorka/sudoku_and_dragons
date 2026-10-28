# Sudoku & Dragons

Mobile game (iOS + Android): sudoku where solving drives RPG duels, in the spirit of Match Masters.
Built by vibe coding: Claude writes the code, the owner steers. The owner writes in Polish; in-game text is Polish,
code and comments are English.

## Stack

- **PixiJS v8** for rendering, **GSAP** for animation, **TypeScript 7**, **Vite 8**, **Vitest 5**
- Planned: **Capacitor** wraps the web build for iOS/Android; **Supabase** backend
  (project `SudokuAndDragons`, ref `wmsngertpctiiermiigz`, eu-central-1) for accounts and server-validated duels.

## Commands

- `npm run dev`: dev server on port 5173, also exposed on the LAN so a phone on the same Wi-Fi can open it
- `npm test`: Vitest
- `npm run typecheck`: checks the whole app, then `src/core` on its own without DOM types
- `npm run build`: typecheck + production build into `dist/`

## Layout

- `src/core/`: pure game logic (sudoku generator, solver, move rules). No DOM, no PixiJS, no Node APIs.
  It must also run in Supabase Edge Functions (Deno), so imports use explicit `.ts` extensions.
  `src/core/tsconfig.json` enforces the no-DOM rule. Tests sit next to the code as `*.test.ts`.
  `core/battle` turns sudoku moves into hits: correct digit = damage to the enemy (more for completed
  rows/columns/boxes, combo bonus for several at once), wrong digit = enemy hits the player, solving the board
  is a finishing blow. Enemy HP is tuned so the dragon falls with the last few digits (~98–100% of the board).
  The enemy also charges a timed attack (`advanceTime`, fed the frame time by the game loop; core has no clocks
  of its own). Correct digits push the charge back, completed units much more, so speed is what keeps you safe.
  Balance numbers come from simulations: `npm run sim:hp` (when the dragon falls) and `npm run sim:timer`
  (HP lost to the timer at different speeds). Re-run them when changing HP, damage, interval or knockback.
- `src/game/`: PixiJS client. `main.ts` boots the app and swaps full screens (`screens/`: `MenuScreen` for
  picking a difficulty, `GameScreen` for a battle); a screen has `layout`, and optionally `update` (per frame)
  and `handleKey`. `ui/` are reusable views (`Button`, `Modal`, board, arena…), `fx/` holds short-lived effects
  (orbs, particles, floating text, shake) and `killTweens`, `theme.ts` holds colours and fonts,
  `difficulty.ts` the Polish difficulty names and the remembered last choice (localStorage).
  `GameScreen` asks `core` what a move does, then plays it out; the views never decide game rules.
  While a `Modal` is open on the battle screen the battle is paused (no timer, no input).

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
