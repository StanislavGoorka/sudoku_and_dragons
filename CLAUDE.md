# Sudoku & Dragons

Mobile game (iOS + Android): sudoku where solving drives RPG duels, in the spirit of Match Masters.
Built by vibe coding: Claude writes the code, the owner steers. The owner writes in Polish; in-game text is Polish,
code and comments are English.

## Stack

- **PixiJS v8** for rendering, **GSAP** for animation, **TypeScript 7**, **Vite 8**, **Vitest 5**
- **Capacitor 8** wraps the web build: `android/` is the native Android project (app id
  `com.metrezz.sudokudragons`, portrait only). iOS is not added yet; it needs a Mac or cloud CI.
- **Supabase** (project `SudokuAndDragons`, ref `wmsngertpctiiermiigz`, eu-central-1) runs online duels and accounts:
  anonymous sign-in (enabled in the dashboard: Authentication → Sign In / Providers) plus e-mail and password,
  tables `profiles` (nickname, dragon skin and hit effect, readable by every signed-in player),
  `duels`, `duel_secrets`, `saves` (schema in `supabase/migrations/`) and the Edge Function `duel`.
  Free plan: it allows two active projects, and this one shares the quota with the owner's other projects.
  Auth mails: until custom SMTP is set (Authentication → Emails → SMTP), Supabase's own sender allows about two
  mails an hour for the whole project (`over_email_send_rate_limit`). The "Change email address" and "Reset
  password" templates must show `{{ .Token }}`: the game asks for the code (`supabase/email-templates/` holds the
  Polish ones to paste in). A link in a mail opens a browser, not the game.

## Commands

- `npm run dev`: dev server on port 5173, also exposed on the LAN so a phone on the same Wi-Fi can open it
- `npm test`: Vitest
- `npm run typecheck`: checks the whole app, then `src/core` on its own without DOM types
- `npm run build`: typecheck + production build into `dist/`
- `npm run android:sync`: build and copy the game into `android/` (run after every web change you want on the device)
- `npm run android:run`: sync, then build and install on a connected phone or running emulator
- `npm run android:open`: open `android/` in Android Studio
- `npm run dragons out.png`: draw every dragon design at rest and in the attack pose into one image (sharp),
  to look at art changes without starting the game.
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
- `npm run test:integration`: end-to-end check of the local function with fresh anonymous players (rooms,
  matchmaking, moves, forfeits, rematches, a turn running out, and that nobody can read solutions, other
  players' duels or saves). Requires a running local Supabase stack; starts the function worker and
  cleans all users it creates. `test:server` is the lower-level runner: explicit loopback test credentials
  required, no production fallback. It waits out one full turn; see `TESTING.md`.
- `npm run test:e2e`: Playwright mobile-browser regressions of restart, resume and network recovery.
  Network faults are deterministic; actual Auth/RLS/function integration runs in the separate local stack.
  `.github/workflows/ci.yml` runs both suites, types and the build on push/PR without production secrets.
- `npm run test:matchmaking`: PostgreSQL regression tests of the actual migrations, including
  simultaneous requests to an empty queue and rollback of an incomplete duel. Standard
  `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD` select a local test server. Creates and drops its own temporary
  database and any missing Supabase roles; the app database is never touched.
- `npm run sim:duel`: bots duel each other; reports how duels end, first-mover advantage, strategy edge.
- `npm run deploy:web`: build and publish the web version to Cloudflare Pages, project `sudoku-dragons`, at
  https://sudoku-dragons.pages.dev (wrangler, signed in with the owner's Cloudflare account through `wrangler
  login`). The project was created once with `wrangler pages project create --force` on classic Pages (newer
  wranglers otherwise hand Pages commands to Workers, which fails without a wrangler config); never pass
  `--force` again. Online duels work from there as from the app: the `duel` function allows any origin.
- The Vite dev server must not watch `android/` (see vite.config.ts): its file handles stop Capacitor and
  Gradle from deleting folders there on Windows. Stop the dev server if `cap add`/Gradle reports a busy folder.

## Layout

- `src/core/`: pure game logic (sudoku generator, solver, move rules). No DOM, no PixiJS, no Node APIs.
  It must also run in Supabase Edge Functions (Deno), so imports use explicit `.ts` extensions.
  `src/core/tsconfig.json` enforces the no-DOM rule. Tests sit next to the code as `*.test.ts`.
  `core/battle` turns sudoku moves into hits: a correct digit deals its own value (a 5 deals 5; `moveDamage`),
  doubled (`BOX_MULTIPLIER`) when it closes a 3×3 box (fills its last cell; completed rows and columns add no
  damage), wrong digit = enemy hits the player, solving the board is a finishing blow (the owner's rules). Each difficulty has its own dragon (`core/battle/enemies.ts`: Młody smok, Smok,
  Pradawny smok: 228, 270, 300 HP) with HP tuned so it falls with the last few digits of its board (a whole
  board deals ~200-320; the dragon falls at ~90-96% of the empty cells, the finisher takes the rest), and harder hits and a faster
  timed attack the higher the level; `enemies.test.ts` guards the HP. Enemy names are masculine Polish
  because the UI says "{name} pokonany!".
  The enemy also charges a timed attack (`advanceTime`, fed the frame time by the game loop; core has no clocks
  of its own). Correct digits push the charge back, completed units much more, so speed is what keeps you safe.
  Balance numbers come from simulations: `npm run sim:hp` (when each dragon falls, and how much damage a
  board deals) and `npm run sim:timer` (HP lost to the timer at different speeds; `node scripts/sim-timer.ts
  hard 30 4` tries other values for one difficulty). Re-run them when changing HP, damage, interval or knockback.
  The campaign (`core/battle/campaign.ts`, tested): `REGIONS` Zielona Dolina (easy boards), Ogniste Szczyty (medium),
  Księżycowe Ruiny (hard), each with three dragons and a boss (`STAGES` in order; ids are saved, never change one).
  A region's first stage is the plain dragon of its difficulty (`ENEMIES`, also the daily challenge's enemy), except
  the ruins, where Pradawny smok is the final boss. Along a region the timer gets a little faster and mistakes
  hit harder; a boss has the most HP, hits for 5 and is drawn a bit bigger. `npm run sim:campaign` reports, for
  every stage, the HP the timer leaves at 8-14 s per digit: each stage a little harder than the one before
  (e.g. valley 22→10 HP at 12 s/digit, ruins 18→10 at 8 s/digit). `design` and a region's `scene` name the
  looks in the game (`enemies.ts` `lookOf`).
- `core/duel`: online duel rules on one shared board. Players take turns of up to 3 correct digits (a digit that
  completes a row, column or box is free: extra move); correct digits damage the rival as they would the dragon
  (their value, doubled for closing a box), a wrong digit costs its own player 10 HP and ends the turn; 30 s per
  turn, three timeouts in a row forfeit; 130 HP; a full board goes to the player with more HP. `npm run sim:duel
  [mistakeRate] [difficulty]`: duels end by KO at ~72-81% of the board after ~8-13 turns (harder boards end
  earlier); the first mover wins ~52-58%; tactics still matter (smart bot beats random ~86-91%).
- `supabase/functions/duel/index.ts`: the referee. Holds each board's solution (`duel_secrets`, no RLS
  policies, so no client can read it). Random matchmaking uses the service-only `queue_random_duel` RPC:
  one transaction-scoped advisory lock covers cancelling the old search, claiming an opponent or
  creating a waiting duel and its solution. Apply `20261030231258_atomic_matchmaking.sql` before
  deploying the updated Edge Function; existing clients need no update. The referee judges moves
  with core, writes the new `state` + `last_event` and bumps
  `version` (updates only the version it read: concurrent writes get 409 `conflict`).
  Cancelling a waiting duel checks that same version; if a rival joined first, `leave` reloads and
  forfeits the playing duel instead. `scripts/duel-leave.test.ts` forces this race and database errors.
  Clients only read `duels` (their own, via RLS) and follow them live through Supabase Realtime.
  Note: a bot that solves the sudoku itself can still play perfectly; hiding the solution stops reading
  answers, not solving.
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
  the next campaign stage, `MapScreen` for the campaign map, `GameScreen` for a battle, `LobbyScreen` and `DuelScreen` for online duels, `AccountScreen` for
  the nickname and the account); a screen has `layout`, and optionally `update` (per frame)
  and `handleKey`. `ui/` are reusable views (`Button`, `Modal`, board, arena…), `fx/` holds short-lived effects
  (orbs, particles, floating text, shake), the hit effects (`fx/hitEffects.ts`) and `killTweens`, `theme.ts` holds colours and fonts (see Look below),
  `difficulty.ts` the Polish difficulty names and the remembered last choice (localStorage),
  `enemies.ts` which design each enemy uses (by enemy id),
  `net/online.ts` the Supabase client (sign-in, the profile, calls to the `duel` function, `watchDuel` for live
  updates, `serverNow()` for the turn clock), `net/config.ts` the project URL and publishable key (public),
  `net/account.ts` and `net/cloudSave.ts` accounts and the cloud save (see Accounts below), `net/nickname.ts`
  made-up nicknames and the rules for typed ones.
  `BoardView` only shows results (`reveal`, `reject`, `sync`, which can also take digits back); `GameScreen`
  judges solo moves with core.
  Notes (pencil marks): the round pencil button in the arena's top-right corner (or "n") turns notes mode on
  (gold button, the pad's digits shrink to the corner); then a digit toggles that note in the selected empty cell
  (`BoardView.toggleNote`, `notesAt`): small digits in a 3×3 grid in the player's digit colour (one BitmapText
  glyph atlas). The owner's rule: notes are the player's own skill, never a hint, so nothing checks them,
  nothing writes them, and placing a digit clears only its own cell's notes (no cleaning of peers). They live
  for the battle on this device; in a duel they can be written on the rival's turn too, and a digit the rival
  places clears that cell's notes.
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
  Training with a bot ("Z botem" in the lobby, and offered while a search finds nobody or the connection is
  down): `DuelScreen` talks to whoever judges the duel through `net/duelBackend.ts` (`DuelBackend`: moves,
  timeout claims, leave, rematch, watch, profiles, clock); `onlineDuels` is the server, `net/botDuel.ts` a
  `BotDuel` that judges on the device with the same core rules (no sign-in, no connection), the player in
  seat 0 and "Bot treningowy" in seat 1, playing a digit at a time after thinking (`core/duel/bot.ts`, pure and
  tested: `BOT_LEVELS` by difficulty set the mistake rate, think time and whether it plays for damage and
  keeps the player from closing boxes; `moveScore`, `botMove`). Bot duels are not `ranked`: no stars, no
  records, and the end dialog says so; a rematch starts a new board at once.
  `net/duelRecovery.ts` remembers only a duel ID plus its owner. Startup, foreground/online and entering
  the lobby recover the match under RLS; a lost local pointer falls back to the account's latest playing
  duel. Waiting rooms and results reached while away resume too. Navigation and account checks discard
  late recovery responses. Realtime status, browser network events, foreground refresh and a 4 s poll
  drive the connection label. Digits wait for reconnection; manual notes remain usable. A successful
  re-read discards uncertain predictions rather than resending them. REST/function calls time out after
  10 s. `recordDuelOnce` stores a local result receipt with progress before end animations, so a resumed
  finished duel cannot pay twice. Leaving the end screen clears the pointer; forfeiting clears it and
  records the actual result only after server confirmation. An unreachable forfeit remains resumable.
  `GameScreen` asks `core` what a move does, then plays it out; the views never decide game rules.
  Solo battles checkpoint locally in `_soloBattle` inside the progress JSON: puzzle, grid, manual notes,
  selection, HP, enemy charge, elapsed time, mistakes and campaign/daily identity. `progress/battleSave.ts`
  validates and reconstructs checkpoints with current core rules. Save after moves/notes, once a second,
  and on pause/background/pagehide; checkpoint writes do not trigger cloud uploads. The menu offers resume
  and asks before a new battle discards the old one. Returning to the menu preserves it; logout clears it.
  A final hit records progress and removes the checkpoint in one write before any end animation, preventing
  a restart from replaying a won battle. Checkpoints are device-local, not part of cloud progress.
  Tutorials (`tutorial.ts`: which were seen, per device in localStorage, and `easyCell`): a player's first battle
  (no battle recorded yet) is guided by `screens/BattleTutorial`, a card with a tip and a pulsing gold ring around
  what it is about (the arena, an easy cell where only one digit fits, the pad, the board, the countdown). Taps go
  through to the board and pad; steps wait for a selection or a correct digit (a wrong one gets its own line), or
  for "Dalej"; "Pomiń" ends it. While it is up the dragon's timer stands still. The lobby shows the duel rules
  (from `DUEL_RULES`) on the first visit, before any turn clock runs, and from its "Zasady pojedynku" button.
  While a `Modal` is open on the battle screen the battle is paused (no timer, no input); the battle also
  pauses itself when the app goes to the background. Screens are laid out inside the safe area
  (`safeArea.ts` reads CSS env(safe-area-inset-*)); full-screen layers they draw extend by `OVERSCAN`.
  The Android back button goes to the screen's `handleBack()`; returning false exits the app.
- `src/game/art/dragonArt.ts`: the dragons as data, no Pixi: flat cartoon shapes (SVG path strings, cubic curves
  only) on one 400×400 canvas, dragon hovering and facing left, grouped into parts that each turn about a
  pivot (wings, tail, two arms, body, head with jaw, eye and lid, ground shadow). The head is a rounded skull over a
  tapering snout (nostril, mouth corner, two fangs over a solid lower jaw), the eye sits inside it under an upper
  lid in the skin's colour (drawn down at the front for a frowning `brow` design, a sliver over big `cute` eyes),
  and the front legs are arms held up as a flying dragon does: upper arm from the shoulder, forearm forward,
  three clawed fingers (the far arm a darker copy, `FAR_ARM` up and ahead, mostly behind the chest; the owner
  asked for arms, the armless look read as AI-made). `DESIGNS` holds the three enemies
  (green cute young dragon, red dragon, purple-and-gold ancient one with a crown of horns and a beard) and the
  two duel sides (`duel-mine` blue, the free skin, and `duel-rival` orange) and the paid skins (`skin-*`, all
  shaped like the duel dragons, `FIGHTER`, so neither side looks weaker). Outlined shapes
  get one thick outline around their union; shading and lines sit on top. `ui/DragonView` builds one shared
  GraphicsContext per part and design, and animates: hover with wing beats, arms paddling, tail and head sway, blinking;
  `setHeat` reddens it and opens its jaw on a glowing mouth before a timed attack; `attack()` rears back and
  lunges with jaws wide and claws forward (the fireball starts at `mouthGlobal()`); `hurt` (the arms flinch);
  `die` folds the wings, drops the arms and the dragon.
  Idle motion and action poses never share a property (`rig` vs parts; the head and arms sway in idle wrappers,
  `IDLE_WRAPPED`, and take the poses on the parts inside); `idle: false`
  keeps one still (shop tiles). In battles and duels the dragon of whoever played a correct digit lunges. Check art
  with `npm run dragons` before the browser.
- Look (the owner wants it colourful and attractive, yet clear and with few objects on screen):
  - `main.ts` puts `ui/Backdrop` (violet gradient with a glow) under every screen, safe-area margins included,
    and waits for the bundled font **Baloo 2** (`@fontsource/baloo-2`, latin + latin-ext, 500/700/800) before
    the first screen, because Pixi measures text when it is created. Fredoka was tried and lacks ą, ę, ż.
  - `ui/Button`: chunky casual-game buttons, a coloured face on a darker lip that it sinks into when pressed;
    variants `primary` (gold, the main action), `secondary` (violet), `accent` (blue, online); a square button
    is round; `icon` (`pause`, `back`, `gear`, `palette`, `user`, `map`, `pencil`, `speaker`, `muted`) draws a vector
    icon instead of the text (no emoji).
  - `ui/Scene`: a rounded window onto a sky gradient, a soft light and two rows of hills, one look per dragon
    (morning for the young one, sunset for the red, moonlit night for the ancient) plus a twilight for duels.
    `groundY()` is where dragons stand; `DragonView.footOffset()` puts a dragon's shadow on it.
  - Fight screens (battle and duel) share `screens/fightLayout.ts`: the arena (scene, two dragons facing each
    other, HP bars inside it, a round pause or leave button in its corner) on top, the board as big as fits, the number pad below.
    The board sits in a tray (`BoardView.BORDER`) and takes its colours from the player's board theme.
    `ui/BattleArena`: your dragon (your skin, `PLAYER_SCALE` of the enemy's size: the enemy is the boss) on the
    left, the enemy on the right in its scene, the countdown to its attack low between them. The enemy's
    fireball hits your dragon; when you lose, your dragon falls.
  - `HpBar`: a thick pill with the name and HP inside it. `Modal`: a violet panel with a lip; pass
    `theme.gold` as the title colour for a win.
  - The menu shows one campaign stage at a time (the one played last, or the next to win): its dragon over its
    region's scene, its name, region and place ("walka 2 z 4" or "boss"), flipped with the arrows or a swipe
    through the open stages and the next locked one (no further), then
    one "Walcz!" button, then the daily challenge and the online button side by side; a map button (`map` icon)
    sits by the star counter; music (volume and mute), sound effects and vibration live in the settings dialog (gear), board
    themes, dragon skins and hit effects in the shop (palette, with a gold dot when the stars buy something not owned yet).
- Board themes (`src/game/boardThemes.ts`): cosmetics bought with stars, never gameplay help (the owner's call).
  `BOARD_THEMES` (Fiołek free, then Łąka 15, Ocean 25, Cukierek 35, Wulkan 50, Noc 65, Skarbiec 90) each give
  `BoardColors`: tray, lines, cells (`cellAlt` paints every other box for a checker), highlights, digit colours
  (given / yours / the rival's, which are also the orb colours) and the number pad. `BoardView` and `NumberPad`
  take the colours in their constructor (`setColors` repaints them) and `BoardView` remembers who placed each
  digit (`DigitOwner`), so screens pass an owner, not a colour. Battles, duels and the lobby's code pad use
  `chosenTheme(progress)`; in a duel each player sees their own theme. `boardThemes.test.ts` checks every theme
  stays readable (digit contrast on every cell state, yours and the rival's apart in hue, no red digits since
  red means a mistake); keep it passing when adding one.
- Dragon skins (`src/game/dragonSkins.ts`): the look of your dragon in battles and duels, also cosmetics. `DRAGON_SKINS`
  (Lazur free, then Szmaragd 20, Pianka 30, Szron 40, Cień 55, Magma 70, Król 100) point at designs in
  dragonArt. Rivals see your skin: it is the `dragon` column of your profile (the server keeps any well-formed id,
  so a new skin needs no redeploy; an app that does not know an id shows the default). `net/online.ts` sends the
  profile when it changed (`syncProfile()` after a purchase, and at sign-in; the last confirmed one is in
  localStorage), and `fetchProfile` reads the rival's (remembered for the session, so a rematch shows them at
  once). `DuelArena` shows the rival's dragon once the profile arrives (it pops in) or after 1.5 s in the
  default look. `rivalDesign()`: a rival on the free skin is shown orange, so two players who bought nothing
  still tell their dragons apart; two players with the same paid skin do look alike (mirrored). The lobby's
  picture shows your skin too.
- Hit effects (`src/game/hitEffects.ts`, drawn by `fx/hitEffects.ts`): what flies from the board to the dragon you
  hit, and what happens where it lands; cosmetics too, plainest cheapest: Iskry (free: the old orb in your digit
  colour), Gwiazdki 15 (a spinning star), Szron 30 (an ice shard, frost ring), Ogień 45 (a fireball, explosion and
  smoke), Piorun 60 (a lightning bolt that strikes at once), Meteor 80 (a burning rock thrown high, shockwave and
  debris), Tęcza 110 (a comet changing colour, rainbow ribbon, firework). `fireShot(layer, id, shot)` plays one and
  resolves at impact, so screens time the damage from it; `big` (a completed unit) makes it bigger. Battles use
  yours, duels yours for your hits and the rival's (the `effect` column of their profile, sent and read like the
  skin) for theirs; an unknown id plays the default. `drawEffectIcon` draws the shop swatch.
- `screens/ShopScreen` has three shelves (tabs "Plansze" / "Smoki" / "Efekty" on a row under the "Sklep" header, the
  one opened last remembered for the run): the looked-at item big (a fixed half-solved board and the pad in the
  theme's colours, the dragon over the duel scene, which attacks when tapped, or a board cell shooting the effect
  at the red dragon every 1.4 s, a big shot every third and on a tap), a row of swatches (tap, swipe the preview,
  arrow keys; Tab switches shelf), and one button that buys (stars run down, sparks, `feedback.purchase()`) or puts
  on an owned item.
- Accounts (`net/account.ts`, `screens/AccountScreen`, the person button in the menu): everyone starts as a guest,
  an anonymous account made at the first online duel. Registering gives that same account an e-mail
  (`updateUser({ email })`, confirmed with the mailed code: `verifyOtp` type `email_change`, or the link, noticed
  when the app comes back to the front) and only then the password (Supabase allows a password only on a confirmed
  e-mail; until then it waits in memory). Logging in elsewhere switches to that account and adds the guest's
  progress to it; "Nie pamiętam hasła" mails a code (`verifyOtp` type `recovery`), then sets the new password.
  Logging out first syncs the cloud save (refused offline, so nothing is lost), then starts a fresh guest with
  empty progress and a new made-up nickname. The nickname (any player, `cleanNickname`: 2–20 characters) is
  changed on the same screen and sent with the profile. Text is typed into real HTML inputs (`ui/TextField`: Pixi
  draws the box, an `<input>` sits on it, placed every frame by `syncInput()`), so phones show their own keyboard;
  the page slides up when the keyboard (`visualViewport`) would cover the box being typed in.
- Cloud save (`net/cloudSave.ts`, table `saves`: the progress as JSON and a `version`, each player only their own
  row via RLS): the device plays from its own copy and sends it up 2 s after a save, at start and when the app
  comes back. A write goes only over the version it read; when another device wrote in between,
  `mergeProgress(base, local, remote)` (progress.ts, tested) joins the two from the last version both agreed on
  (the base, stored with the account it belongs to): gains are added up, records and purchases kept, stars paid
  twice for the same thing counted once. The acknowledged base stays in memory when storage fails;
  a failed write removes an obsolete persisted base. An upload with an uncertain response discards
  its base too, so retrying does not replay a delta the server may already have accepted.
  Save ownership (`_cloudOwner`, written together
  with local progress) identifies a known guest changing accounts: only that case uses an empty base
  to add the guest's independent progress. Before uploading, the guest is folded into a durably saved
  account-owned local snapshot; full storage postpones that transfer. A missing/corrupt base on an account or a legacy save uses
  `recoverProgress`: larger counters, best records and the union of purchases, with the wallet adjusted
  for retained spending. Unknown overlapping gains cannot safely be added. `replaceProgress` (store.ts)
  swaps the new progress in; the menu redraws. `net/cloudSave.test.ts` covers checkpoint loss, full
  storage, restarts, guest transfers, concurrent play and account changes during requests.
- Player progress (`src/game/progress/`), saved on the device (localStorage, per dev `?profile`) and in the cloud:
  - `progress.ts` is pure and tested: `Progress` (star balance, stars ever earned, per-level wins / losses / best
    stars / best time, duels played and won, flawless wins, best combo, unlocked achievements), `parseProgress`
    (saved data of any age made whole), `recordBattle` / `recordDuel` (update it and return the `Reward`).
  - Stars are the currency, spent on cosmetics: `COSMETICS` by kind ('board', 'dragon', 'effect'), and `buy`, `choose`,
    `owns`, `isChosen`, `canBuyNew` for any kind (`boardThemes` / `dragonSkins` / `hitEffects` list the bought ones,
    `boardTheme` / `dragonSkin` / `hitEffect` the ones in use; `chosenTheme`, `chosenSkin`, `chosenEffect` look them up). A won battle gives one star per goal met: the win, no
    mistakes, at least 80% HP left (`HP_GOAL`; slow play lets the dragon's timed attacks through). An online
    duel win gives `DUEL_WIN_STARS` (2). Each level remembers its best stars.
  - The campaign opens one stage at a time (`isStageUnlocked`: the stage before it won), a region with the boss
    before it; `currentStage` is the first open stage not won. `Progress.stages` keeps a record per stage
    (`stageRecord`) next to `levels`, the records by board difficulty (any battle, campaign or daily; used by
    achievements and the progress screen). `isUnlocked(difficulty)` (the daily challenge's cap) means its region
    is open. A save from before the campaign counts each won level as its whole region won. A battle passes its
    `stage`; `Reward.unlocked` is the stage it opened ("Dalej: {dragon}" or "Dalej: {region}" in the end dialog).
    Online duels are never locked.
  - `screens/MapScreen`: the regions top to bottom, each a panel over its scene with its four stages along a
    dotted path (gold where won): a round frame with the dragon (`idle: false`, mirrored to face along the
    path), best stars under it, a padlock and a dark shape until it opens, "Boss" over the boss, a pulsing gold
    ring on the stage to play next; a region not reached yet is dimmed and names the boss that opens it. It
    scrolls (drag, wheel), opens at the region being played, and a tap on an open stage starts its battle.
  - Daily challenge (`daily.ts`, pure and tested): one board a day, seeded from the local date and level, so
    every player on the same level gets the same one; the level follows the weekday (`ROTATION`), capped at the
    hardest the player has opened. The day's first win pays `DAILY_STARS` (5) plus a star per day of the
    streak, up to `DAILY_STREAK_BONUS` more (`recordBattle` with `daily`, `Reward.daily`); a missed day ends the
    streak. `Progress.daily` keeps the last day won, streak, best streak and wins; merging takes the streak of the
    later day. The menu's button shows the reward, or "zrobione · seria N", with a gold dot until today is won;
    the battle announces "Wyzwanie dnia", and "Walcz ponownie" replays the same board (no second reward).
  - `ACHIEVEMENTS`: twelve simple ones (first win, flawless, combos, three stars, under 5 minutes, all dragons,
    10 wins, first daily win, a 7-day daily streak, first duel win, 10 duel wins), each paying stars once; `progress()` gives [current, target].
  - `store.ts` holds the loaded progress and `saveProgress()`; `rewardText.ts` the end-dialog lines (with Polish
    plurals of "gwiazdka").
  - UI: `ui/stars.ts` (`drawStar`, `StarCounter` pill, `StarRow` that lights a battle's stars one by one in
    the end dialog via `ModalExtra`), the menu's star counter (opens `ProgressScreen`: balance, numbers,
    scrolling achievement list), best stars under each stage, locked dragons as dark shapes behind a padlock,
    and "Dalej: {dragon}" as the main button after a win that unlocked it.
- `src/game/audio/`: `feedback.ts` is the one place for sound and vibration. Screens report events
  (`feedback.digit(d)`, `unitsCompleted(n)`, `playerHit()`, `victory()`…) and it plays a sound from `Synth.ts`
  and a haptic (Capacitor Haptics, native app only), honouring the settings dialog's toggles (`settings.ts`, localStorage).
  `Synth.ts` synthesises every effect with Web Audio (no sample files); each digit plays a note of the
  C major pentatonic. Audio starts on the first tap (`feedback.unlock()` in main.ts) and is suspended in the
  background. To check sounds without ears, render them in an `OfflineAudioContext` (`new Synth(offlineCtx)`)
  and measure the peak: quiet effects ~0.05–0.15, digits ~0.3, big hits ~0.6, never above 1. Don't add a
  DynamicsCompressor: Chrome's turns short quiet sounds down ~10 dB even below its threshold.
  Background music is synthesised too: `tracks.ts` (pure, tested) writes three looping tracks like a tracker, a bar
  of eight steps at a time (chords, a tune, bass, arpeggio and drum patterns, and which layers play in each pass
  through the loop; every third pass the tune rests): `menu` (calm, 80 bpm, music box and a soft flute-like tune,
  no drums), `battle` (128 bpm, A minor, driving bass, drums, a bright square-wave tune) and `duel` (116 bpm, D
  minor with the dorian B, a 3-3-2 groove, a plucked tune). Every note is in C major so the digits' pentatonic notes
  fit over any of them; each bar of a tune starts on a note of its chord (the tests check both). `Music.ts` plays
  them on the audio clock, scheduling a bar at a time ahead (`update`, fed every 100 ms by `feedback`), and fades
  one track into the next. A screen names its music (`music` on the screen, read by `show()` in main.ts; the menu's
  by default), the same track goes on across screens, and `victory()`/`defeat()` fade it out so the fanfare plays
  alone. The music joins the effects before their soft clipper (`Synth.mix`). Settings: `music` (mute) and
  `musicVolume` (0–1, gain = its square), set in `ui/MusicControl` (a speaker button and a slider, in the menu's
  settings and the battle's pause dialog); muted music schedules nothing, so it costs no battery. Levels at the
  default 60%: peaks ~0.10 (menu) to ~0.17 (duel), under a digit's 0.3. Synthesis is the costly part: the battle
  track takes ~4% of a desktop core (an OfflineAudioContext renders 10 s in ~420 ms); keep new layers cheap (few
  nodes per note, one filter per chord).

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

- Android test release: `release/android-version.properties` owns Android versions. Release tasks
  require private SUDOKU_UPLOAD_* environment variables; Windows helpers use an ignored upload key
  and a DPAPI-protected password. Never commit signing material. Store assets are generated from
  real game screens with synthetic local progress. `release:check -- --artifacts` checks files;
  the default check also blocks publication while owner/SMTP/Play/device gates are incomplete.

- Account deletion: `delete-account` uses a live Auth user lookup, revokes sessions and hard-deletes
  only the caller. Existing FKs cascade game data. Local progress is cleared only after success.
  `delete-account.html` has an isolated in-memory session; never import cloud save or the game into it.
  `privacy.html` is a draft until the owner supplies public identity/contact. Hosted SMTP is not yet
  configured; local email templates do not update hosted Auth. See `ACCOUNT_RELEASE.md`.

- Phone controls: full keypads use `padHeight`/`padGeometry` (two rows below 480 px); only the shop
  passes the compact preview flag. Fight controls have 48 px targets; short-screen layout preserves
  board size by reducing the arena. `Modal` scrolls tall content (drag its panel or wheel), retaining
  button/slider gestures. Notes use a bold, high-contrast atlas with no candidate assistance. Board
  text contrast is tested at 4.5:1 even when highlighted. See `PHONE_UX.md` for measurements and limits.

- Campaign bosses have `EnemyDef.pattern`: rage (15% faster below half HP), heavy (+2 damage every
  third timed hit), relentless (one second less plain-digit knockback below half HP). Use `attackInterval`,
  `battleKnockback` and `bossHint` rather than static enemy fields for their UI. Save `timedAttacks` in
  battle checkpoints; legacy saves default it to zero. Boss achievements pay 5/8/10 once, using normal
  achievement merge deduplication. Balance measurements and limits are in `BALANCE.md`.

- Daily ranking: `DailyScreen`, `net/daily.ts`, `core/daily.ts` and a separate `daily` referee function.
  Categories use the server's UTC day and wall time (including pauses), with verified move replays.
  Offline daily keeps its local calendar and never enters the ranking. `npm run function:bundle` copies
  core to both functions. Preserve the owner-bound pending queue and server-only write RPCs. See `DAILY_RANKING.md`.

- `bootstrap.ts` installs diagnostics and starts `main.boot()`, with a visible startup retry on failure.
  Only the menu loads at startup. Other screens use guarded dynamic imports: construct only after checking
  the navigation generation, so a cancelled download cannot create a battle or subscriptions. Cloud/account
  modules load after a menu paint; active duel recovery still runs immediately afterwards. Preserve that order.
  Cloud progress refresh waits for menu dialogs to close. Pixi explicitly imports events and skips automatic
  environment extensions; Graphics/Text/BitmapText register their own pipes. Rendering: resolution at most 2,
  menu 30 FPS, fights 60 FPS. Browser visibility and native app state jointly stop the main ticker and music
  scheduling in the background. See `PERFORMANCE.md`; `npm run perf:startup -- --check` guards startup JS in CI.

- `diagnostics/` captures only technical codes and sanitized source locations. Reports use the authenticated
  `report_client_diagnostics` RPC, a private definer, a daily quota and 14-day cleanup on ingestion. No raw messages,
  account details, payloads or board data. Queue is bounded and opt-out clears it. See `MONITORING.md`.
  Source maps are generated by build, moved outside `dist` into ignored local `artifacts/sourcemaps`, and never
  uploaded. `npm run diagnostics:resolve -- file-HASH.js:line:column` maps a location to the original source.

- Without URL parameters the game opens on the menu. `?stage=peaks-2` (optionally with `&seed=123`) opens a
  campaign battle; `?seed=123&difficulty=easy|medium|hard` reproduces a board outside the campaign.
- Menu: arrow keys flip the stage, Enter fights, keys 1–3 start a region's first stage at once. Battle: arrow keys move the
  selection, keys 1–9 place digits (or notes, after "n"), Escape pauses.
- Check new UI at phone size (`resize_window` mobile, 375×812) and on a small phone (360×640).
- Two players in one browser: open `?profile=1` and `?profile=2` in two tabs; each gets its own anonymous
  account (dev only). Drive them with `__game.lobby()`, then `__game.screen.createRoom()` /
  `quickMatch()` / `join(code)`; in a duel, `board.select(cell)` + `handleDigit(d)` (correct digits are in
  `screen.sync.solution`; changing one there makes the next prediction wrong, to test a rollback).
  `screen.sync.predictions` lists what the server has not confirmed yet.
- A fresh `?profile=N` sees the tutorials; to see them again remove the `sudoku-dragons.tutorial-*` keys.
- In dev, `__game.state` is the saved progress (change it, then `__game.save()`), `__game.unlockAll()` opens every
  level, `__game.resetProgress()` starts over, `__game.progress()`, `__game.account()` and `__game.shop()` (or
  `__game.shop('dragon')`, `__game.shop('effect')`) open those screens. To see an effect frozen mid-flight, fire it
  in the shop (`screen.effectPreview.fire(true)`), wait, then `gsap.globalTimeline.timeScale(0)`, screenshot, set 1.
- Accounts without mail (the hourly mail limit is tiny): make a confirmed test user in SQL (`auth.users` with
  `extensions.crypt(password, extensions.gen_salt('bf'))`, `email_confirmed_at`, empty strings in the token
  columns, plus its `auth.identities` row) and log in with it. To try a code, fake the mail-sending request in the
  page (patch `fetch` for `PUT /auth/v1/user` or `/auth/v1/recover`), then set the token in SQL:
  `email_change`/`email_change_token_new` (or `recovery_token`) = hex sha224 of e-mail + code, the `*_sent_at`
  to now(), and a matching `auth.one_time_tokens` row. Delete test users afterwards.
- In dev, `window.__game.start(difficulty, seed?)`, `__game.stage(id)`, `__game.map()`, `__game.daily()`, `__game.menu()` and `__game.lobby()` switch screens, and `__game.screen` is the
  current screen. On a `GameScreen`: `debugFill(n)` fills all but `n` cells,
  `debugMistake()` plays a wrong digit, `battle.charge = 36` jumps the dragon's timer to 4 s before its attack.
- When the Browser pane is hidden (or the game's tab is not the front one) the page gets few or no animation
  frames, so animations crawl or stop and screenshots catch them half-way. Check state through `__game`
  instead, and drive time yourself: import gsap from the prebundled `/node_modules/.vite/deps/gsap.js?v=…` URL
  (find it in `performance.getEntriesByType('resource')`), call `gsap.ticker.lagSmoothing(0)`, then every
  50 ms `gsap.ticker.tick()` and `__game.screen.update(50)`. `__game.feedback` is the live sound/haptics module.
  Keep each javascript_tool call under ~40 s.
