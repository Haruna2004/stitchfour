# Stitch Four — Plan

Connect Four, embroidered. Web-based, mobile-first, PWA. Huge focus on aesthetics, feel and sound.
Name is working title (may change). Hosted at `stitchfour.harunafaruk.com` (also `stitchfour.hfdev.workers.dev`).

## Flow
- No mode picker. App opens straight into a game **vs Computer** (default difficulty).
- Random short-word username generated on first launch (e.g. "mossy-fern"), editable anytime.
- Menu holds: mode (vs Computer / Pass & play / Online), difficulty, sound on/off, theme (light/dark), username, stats, install app.
- Frequent actions also live on-screen for one-tap access (see Layout). Placement must be deliberate and beautiful.

## Modes (v1)
1. **vs Computer** (default) — algorithmic bot. Easy / Medium / Hard. Offline.
2. **Pass & play** — two players, one device. Offline.
3. **Online** — Find a player (matchmaking with strangers), or invite by 6-char code + share link. Needs data.

PWA: after the first visit with data, modes 1 and 2 work fully offline. Online shows an offline state gracefully.

Updates (prompt-mode service worker, `src/pwa.ts`): checks on load, on return to the app and every 30 min. No game in progress → soft fade + reload. Mid-game → small "Update ready" patch by the mode chip (tap = confirm + update); otherwise it applies at the next new game / Play again / Rematch.

## Rules
- Standard board: 7 columns × 6 rows
- First player alternates each rematch
- Undo: allowed in vs Computer and Pass & play; not online
- Online turn timer: 120s; exceeding it loses the game. Shown as the active label's wavy thread shortening (no numbers)

## Computer (the bot)
- Name: "Computer". Label shows the difficulty word (emoji only in the picker + result card)
- Thinking indicator: a loose wavy thread under the Computer's label (not a needle)
- Hard: strong but slightly beatable, so it stays fun
- Minimax + alpha-beta, center-first ordering, bitboards, transposition table for Hard
- Runs in a Web Worker; min "thinking" delay ~400–800ms
- Easy = depth 2 + random slips; Medium ≈ depth 6; Hard = depth 10+ with TT

## Online
- 6-char room code + share link; nickname only, no accounts
- Server validates every move (authoritative Durable Object)
- Disconnect: 60s reconnect window, then opponent can claim the win
- Rematch button
- Quick reactions: 5 phrases + 5 emojis (e.g. "Hurry up", "Nice trick", "Cool"), no free chat
- No spectators in v1

### Find a player (matchmaking)
- Top choice in the Online sheet, above Create a room / Join with code. Not a separate mode.
- Global `Lobby` Durable Object (`/parties/lobby/main`, other names 404). Client sends `seek {clientId}` / `cancel`; lobby sends `count` (players looking, throttled ~1/s), `matched {code}`, `error` (`timeout` after 5 min).
- Queue = open lobby sockets whose connection state says `seeking` (survives hibernation). FIFO by wait time. Never pairs a clientId with itself (two tabs). The same two players aren't re-paired within 2 min unless both waited 15s+ (memory only). Pure logic in `party/matching.ts`; a 5s alarm re-checks while anyone waits.
- On a match the lobby picks a fresh code and calls `StitchRoom.initMatch(names)` over DO RPC (not reachable over HTTP), then tells both players and closes their lobby sockets. Everything else is the normal room (turn timer, forfeit, reactions, rematch, limits, cleanup).
- **Anonymous**: matched rooms (`room.anonymous`) give each seat a fresh server-picked name ("mossy-fern") in hello order. The server ignores the name in `hello` and every `rename`, so custom names never leave the device. Client hides rename on your label, labels say You / Opponent, chip "Online · Matched".
- Searching UI: little hoop with red + gold running stitches sewing round, "You're first in line" / "N others looking", elapsed time, Cancel (closing the sheet cancels). After 30s (`?matchWait=3` in dev): "No one's around right now. Play the computer instead?" (Play Computer / Keep looking). The bot is never disguised as a person.
- Matched result card: primary "Find another player" (re-queue), secondary "Rematch" (both must agree). Opponent never arrives: overlay offers "Find someone else" (prominent after 20s).
- Known gap: no per-IP limits on the lobby, so a scripted client could fill the queue with ghosts (they'd land in rooms no one joins).

## Look: embroidery hoop
Inspired by StitchCraft (https://stitchcraft.wasmer.app). Whole game = embroidery piece in a wooden hoop.
- Board: woven linen; 42 holes as stitched rings
- Pieces: all circles; the two players differ by colour **and** stitch pattern (e.g. satin disc vs cross-stitched disc)
- Win: thread pulls through the four winning pieces (running stitch)
- Light + dark mode in v1. Dark = walnut linen (ported from fabricman): warm brown weave (page `#4a392c`, panel `#2f241c`, ink `#f2e9dc`), walnut hoop with brass screw, oatmeal-cord rings, win belt = same cord a touch brighter/thicker, deeper warm shadows, red `#dc4c40` + brighter gold pieces
- Chrome: Lora (display) + Inter (body); light page `#f3f1eb`, panel `#fdfcfa`, ink `#2a2723`, sage `#5b8a6a`, thread red `#c9413b`; warm shadows, 14px radius
- App icon (temp): 2×2 mini board with mixed-colour pieces

How StitchCraft does it (reference):
- Fabric: procedural 192px tile, per-pixel warp/weft over-under, `sin^0.6` thread profile, fake top-left lighting, seeded noise; `createPattern("repeat")`
- Thread: stacked strokes — offset shadow, base, dashed darker twist, dark edge lines, 3-level highlights, needle-hole dots
- Colours: shades mixed toward brown/cream, never pure black/white; seeded randomness

### Rendering approach (hybrid, perf-first)
| Part | How |
|---|---|
| Fabric | Pre-rendered at build time → small tiling WebP (light + dark), CSS background, precached |
| Board + hoop | Canvas, drawn once (StitchCraft thread technique); redraw only on resize/theme |
| Pieces | Each style drawn once to a sprite; shown in DOM elements |
| Motion | Motion / CSS transforms (GPU composited) |
| Win thread | SVG path + `stroke-dashoffset`, no SVG filters |

Avoid: per-frame full canvas redraw, runtime fabric generation, SVG filters, WebGL/Pixi.

## Sound
- Recorded samples (CC0 / self-recorded): button clack on land, needle/fabric tick on hover, thread zip on win, scissors snip on reset
- Web Audio API playback; precached for offline
- On by default; note iOS silent switch mutes web audio
- Haptics via `navigator.vibrate` (Android only)

## Mobile-first
- Tap column or drag-and-release to drop
- Safe areas, `100dvh`, no double-tap zoom, no pull-to-refresh bounce
- Install prompt + iOS "Add to Home Screen" hint
- Respect reduced motion; 60fps on mid-range phones
- Desktop: same layout, centred

## Accessibility
Light touch for v1 (pattern-differentiated pieces). Revisit later.

## Stats
Local only: wins, streaks, record vs each bot level. Later: embroidered patch achievements.

## Analytics
Anonymous and coarse. No user ids, clientId, names, room codes, IPs or cookies. Opt-out: Menu > Settings > "Share anonymous usage stats" (stops events and the page beacon on next load).
- **Page views**: Cloudflare Web Analytics beacon (`src/lib/beacon.ts`), production only, loaded at runtime when `VITE_CF_BEACON_TOKEN` is set at build time (see `.env.example`). Skipped offline until the `online` event.
- **Game events**: Workers Analytics Engine dataset `stitchfour_events` (binding `EVENTS`). Client `src/lib/analytics.ts` `track()` queues (memory + localStorage, cap 200, 7-day max age) and batches to `POST /api/event` (`party/events.ts`: whitelist, clamp, 204). Flushes after ~5s, on tab hidden (sendBeacon) and on `online`. Dev only logs (`?analytics=1` sends).
- **Events**: `app_open`, `game_start`, `game_end`, `game_abandon` (2+ moves), `undo`, `room_create`, `room_join`, `room_full`, `rematch`, `install`, `ios_hint_shown`, `update_applied`, `reaction` (count only), `setting` (sound/haptics/theme/level), `match_seek`, `match_found` / `match_cancel` / `match_fallback_bot` (durationSec = seconds spent looking), `match_timeout`. Online games are reported by seat 1 only, so each counts once.
- **Columns**: index1 = event. blob1 event, blob2 mode, blob3 level, blob4 outcome (game_end win/loss/draw, p1/p2 in pass & play; install accepted/dismissed; update_applied idle/patch/fresh), blob5 reason (four/draw/timeout/forfeit), blob6 country, blob7 platform (ios/android/desktop/other), blob8 display (standalone/browser), blob9 theme, blob10 setting key, blob11 setting value. double1 moves, double2 durationSec, double3 reserved.
- **Query**: `bun scripts/stats.ts [--days 7]` (needs `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN` with Account Analytics: Read).

## Stack
- Vite + React + TypeScript
- Motion (Framer Motion)
- vite-plugin-pwa (Workbox) — precache shell, fonts, sounds, textures; skip `/parties/*`
- PartyServer (`partyserver` + `partysocket`) on Cloudflare Durable Objects, own account
- `@cloudflare/vite-plugin` — one project; `npm run dev` runs both, `wrangler deploy` ships both
- localStorage for settings + stats
- Vitest for game logic + bot; Git from day one

## Structure
```
shared/
  game.ts          rules: board, moves, win/draw, undo (column-major, row 0 = bottom)
  protocol.ts      client <-> server messages (room + lobby), reactions, room codes
  names.ts         random names ("mossy-fern"), client + server
  events.ts        analytics event whitelist types
src/
  bot/             search.ts (negamax + bitboards), bot.worker.ts, client.ts (askBot)
  render/          canvas drawing: palette, thread strokes, hoop, piece sprites, win path
  ui/              Board (+ WinThread), shell, modals, MatchSearch (search view)
  lib/             settings (localStorage), theme, names
  audio/           sound.ts (Web Audio samples + haptics)
  net/             online.ts (room hook), lobby.ts (useMatchmaking)
  lib/analytics.ts, beacon.ts   anonymous events + CF Web Analytics
  styles/          theme.css (light/dark tokens)
party/
  index.ts         Worker entry, routes /parties/*
  room.ts          StitchRoom Durable Object (authoritative, turn timer, forfeit, anonymous rooms)
  lobby.ts         Lobby Durable Object (matchmaking queue)
  matching.ts      pure pairing rules; anon.ts pure anonymous-name rules
  limits.ts, schedule.ts   message validation + rate limits; alarm maths
  events.ts        POST /api/event -> Analytics Engine
scripts/           gen-fabric.ts, preview-board.ts, screenshot.ts, gen-icons.ts
public/            icons, textures, sounds, manifest
```

## Open topics (keep discussing)
- After the walnut dark theme ships: regenerate WhatsApp Status marketing assets only (9:16 stills + clips) with the new domain stitchfour.harunafaruk.com and new dark look
- Game-event analytics (Analytics Engine) is built but OFF: enable Analytics Engine in the Cloudflare dashboard, add back `"analytics_engine_datasets": [{ "binding": "EVENTS", "dataset": "stitchfour_events" }]` to wrangler.jsonc, set `VITE_GAME_EVENTS=1`, deploy
- Sound: CC0 samples chosen (v1); fine-tune picks after testing
- Reaction phrase/emoji list: keep current for now, revisit later

Settled: layout, thinking animation, dark fabric, name "Stitch Four" + icon, difficulty emojis (🌱 🌿 🌳).

---

## Later (after v1): AI mode
Separate from the bot. "AI" = LLM opponents that play using their reasoning, not a search algorithm.
- Models: jev (TypesCafe AI's "system one"/decision model, trained with RLCD — reinforcement learning on calibrated decisions), Claude, GPT, others
- Ideas: pick your opponent model; show its reasoning/trash talk per move; model vs model spectator mode
- Needs network + API keys → server-side proxy, not offline
- Keep `src/bot/` and a future `src/ai/` clearly separate

## Decided against
- Voice chat between online players (dropped 2026-10-20)
