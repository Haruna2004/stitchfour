# Stitch Four — Plan

Connect Four, embroidered. Web-based, mobile-first, PWA. Huge focus on aesthetics, feel and sound.
Name is working title (may change). Hosted at `stitchfour.workers.dev` for now; custom domain later.

## Flow
- No mode picker. App opens straight into a game **vs Computer** (default difficulty).
- Random short-word username generated on first launch (e.g. "mossy-fern"), editable anytime.
- Menu holds: mode (vs Computer / Pass & play / Online), difficulty, sound on/off, theme (light/dark), username, stats, install app.
- Frequent actions also live on-screen for one-tap access (see Layout). Placement must be deliberate and beautiful.

## Modes (v1)
1. **vs Computer** (default) — algorithmic bot. Easy / Medium / Hard. Offline.
2. **Pass & play** — two players, one device. Offline.
3. **Online** — invite by 6-char code + share link. Needs data.

PWA: after the first visit with data, modes 1 and 2 work fully offline. Online shows an offline state gracefully.

## Rules
- Standard board: 7 columns × 6 rows
- First player alternates each rematch
- Undo: allowed in vs Computer and Pass & play; not online
- Online turn timer: 60s default; exceeding it loses the game

## Computer (the bot)
- Name: "Computer". Difficulty shown by profile emoji/colour (easy/medium/hard)
- Thinking indicator: a swirling thread (not a needle)
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

## Look: embroidery hoop
Inspired by StitchCraft (https://stitchcraft.wasmer.app). Whole game = embroidery piece in a wooden hoop.
- Board: woven linen; 42 holes as stitched rings
- Pieces: all circles; the two players differ by colour **and** stitch pattern (e.g. satin disc vs cross-stitched disc)
- Win: thread pulls through the four winning pieces (running stitch)
- Light + dark mode in v1 (dark = e.g. denim / navy linen)
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
  protocol.ts      client <-> server messages, reactions, room codes
src/
  bot/             search.ts (negamax + bitboards), bot.worker.ts, client.ts (askBot)
  render/          canvas drawing: palette, thread strokes, hoop, piece sprites, win path
  ui/              Board (+ WinThread), shell, modals
  lib/             settings (localStorage), theme, names
  audio/           sound.ts (Web Audio samples + haptics)
  net/             online.ts (partysocket hook)
  styles/          theme.css (light/dark tokens)
party/
  index.ts         Worker entry, routes /parties/*
  room.ts          StitchRoom Durable Object (authoritative, turn timer, forfeit)
scripts/           gen-fabric.ts, preview-board.ts, screenshot.ts, gen-icons.ts
public/            icons, textures, sounds, manifest
```

## Open topics (keep discussing)
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

## Later (after v1): Voice chat
Live voice call between the two players in an online room (talk while playing).
- Likely WebRTC peer-to-peer audio, signalled through the existing StitchRoom socket; TURN server for strict NATs (e.g. Cloudflare Realtime/Calls)
- Mic permission prompt only when a player taps "Talk"; mute toggle; clear indicator when the other side is speaking
