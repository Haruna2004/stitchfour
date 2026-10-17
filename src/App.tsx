// Stitch Four: one game screen + sheets. Wires vs Computer, Pass & play and Online.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  canPlay, fromMoves, isOver, lastMove, newGame, other, play, undo, validMoves,
  type GameState, type Player,
} from '../shared/game'
import { REACTIONS, TURN_MS, normalizeCode, randomCode, type EndReason } from '../shared/protocol'
import { haptic, playSound, unlockAudio } from './audio/sound'
import { askBot, type Level } from './bot/client'
import { useNetworkOnline } from './lib/hooks'
import { LEVEL_INFO } from './lib/levels'
import { recordResult, updateSettings, useSettings, type Mode } from './lib/settings'
import { useTheme } from './lib/theme'
import { readRoomFromUrl, roomLink, useOnlineRoom } from './net/online'
import { Board } from './ui/Board'
import { ConfirmSheet, DifficultySheet, ModeSheet, ReactionsSheet, RenameSheet, type ConfirmInfo } from './ui/Dialogs'
import { ChatIcon, ChevronIcon, ShareIcon, SpoolIcon, UndoIcon } from './ui/icons'
import { Menu } from './ui/Menu'
import { NameLabel, ReactionBubble } from './ui/NameLabel'
import { Offline, OnlineSheet, RoomCode } from './ui/OnlineSheet'
import { TurnStatus } from './ui/TurnStatus'
import './App.css'

// ?room=CODE joins online straight away; the URL is cleaned so it isn't shared by accident.
// The room is kept per tab so a reload rejoins the same game.
const ROOM_KEY = 'stitchfour:room'
const badRoomLink = (() => {
  const raw = readRoomFromUrl()
  return raw !== null && !normalizeCode(raw)
})()
const initialRoom = (() => {
  const raw = readRoomFromUrl()
  if (raw !== null) history.replaceState(null, '', location.pathname + location.hash)
  try {
    return normalizeCode(raw ?? sessionStorage.getItem(ROOM_KEY) ?? '')
  } catch {
    return raw === null ? null : normalizeCode(raw)
  }
})()
function rememberRoom(code: string | null) {
  try {
    if (code) sessionStorage.setItem(ROOM_KEY, code)
    else sessionStorage.removeItem(ROOM_KEY)
  } catch {
    // storage blocked: reload just won't rejoin
  }
}

// Dev-only screenshot helpers: ?moves=3,3,4&mode=local
const devParams = import.meta.env.DEV ? new URLSearchParams(location.search) : null
const devMoves = devParams?.get('moves')?.split(',').filter(Boolean).map(Number) ?? []
const devMode = devParams?.get('mode') as Mode | null
const devBotDelay = Number(devParams?.get('botDelay')) || undefined

// The app always opens vs Computer unless a room link was used.
updateSettings({ mode: initialRoom ? 'online' : devMode === 'local' ? 'local' : 'bot' })

function initialGame(): GameState {
  try {
    return fromMoves(devMoves, 1)
  } catch {
    return newGame(1)
  }
}

type SheetState =
  | { id: 'menu' | 'mode' | 'online' | 'difficulty' | 'reactions' }
  | { id: 'rename'; who: 'me' | Player }
  | { id: 'confirm'; info: ConfirmInfo }

interface Outcome {
  winner: Player | 0
  reason: EndReason
}

const playerAt = (s: GameState, i: number): Player => (i % 2 === 0 ? s.starter : other(s.starter))
const WIN_BUZZ = [24, 50, 24, 50, 70]

function playOutcome(o: Outcome, me: Player | null) {
  if (o.winner === 0) playSound('draw')
  else if (me === null || o.winner === me) {
    playSound('win')
    haptic(WIN_BUZZ)
  } else {
    playSound('lose')
    haptic(40)
  }
}

export default function App() {
  const settings = useSettings()
  const theme = useTheme(settings.theme)
  const reduce = useReducedMotion() ?? false
  const netOnline = useNetworkOnline()
  const level = settings.level

  const [code, setCode] = useState<string | null>(initialRoom)
  const mode: Mode = settings.mode === 'online' && !code ? 'bot' : settings.mode
  const isOnline = mode === 'online'
  useEffect(() => rememberRoom(isOnline ? code : null), [isOnline, code])

  // --- local game (vs Computer / Pass & play)
  const [game, setGame] = useState<GameState>(initialGame)
  const [round, setRound] = useState(0)
  const [names, setNames] = useState<Record<Player, string>>({ 1: 'Red', 2: 'Gold' })

  // --- online game
  const online = useOnlineRoom(isOnline ? code : null, settings.name, settings.clientId)
  const room = online.room
  const you: Player = online.you ?? 1
  const opp = other(you)
  const oppSeat = room?.seats[opp] ?? null
  const oppName = oppSeat?.name ?? 'Friend'
  // optimistic move so your piece drops instantly; cleared by the next server state
  const [pending, setPending] = useState<{ ply: number; col: number } | null>(null)
  useEffect(() => setPending(null), [room])
  const onlineState = useMemo(() => {
    if (!room) return newGame(1)
    const moves = pending && pending.ply === room.moves.length ? [...room.moves, pending.col] : room.moves
    try {
      return fromMoves(moves, room.starter)
    } catch {
      return fromMoves(room.moves, room.starter)
    }
  }, [room, pending])

  const state = isOnline ? onlineState : game
  const over = isOnline ? room?.status === 'over' : isOver(game)
  const outcome: Outcome | null = !over
    ? null
    : isOnline && room?.result
      ? room.result
      : { winner: state.winner, reason: state.draw ? 'draw' : 'four' }
  const me: Player | null = mode === 'bot' ? 1 : isOnline ? you : null
  const thinking = mode === 'bot' && !over && game.turn === 2

  // --- the Computer moves
  useEffect(() => {
    if (mode !== 'bot' || isOver(game) || game.turn !== 2) return
    const ac = new AbortController()
    askBot(game.moves, level, { signal: ac.signal, minDelayMs: devBotDelay }).then(
      (col) => setGame((g) => (g === game && canPlay(g, col) ? play(g, col) : g)),
      (err: Error) => {
        if (err.name === 'AbortError') return
        // worker failed: fall back to any legal move so the game never stalls
        setGame((g) => {
          const opts = validMoves(g)
          return g === game && opts.length ? play(g, opts[Math.floor(Math.random() * opts.length)]) : g
        })
      },
    )
    return () => ac.abort()
  }, [mode, game, level])

  // --- sounds: unlock on first gesture, quiet tap on every button
  useEffect(() => {
    const unlock = () => unlockAudio()
    const tap = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest('button')
      if (b && !b.disabled && !b.dataset.silent) playSound('tap', { volume: 0.35 })
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('click', tap, true)
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('click', tap, true)
    }
  }, [])

  const latest = useRef({ state, over, outcome, me })
  latest.current = { state, over, outcome, me }
  const onLand = useCallback((col: number, row: number) => {
    playSound('drop', { rate: 1 + row * 0.04 })
    haptic(10)
    const L = latest.current
    const lm = lastMove(L.state)
    if (L.over && L.outcome && lm && lm.col === col && lm.row === row) playOutcome(L.outcome, L.me)
  }, [])

  // --- game over: record once, show the card after the win thread has had a moment
  const overKey = !over ? null : isOnline ? `o:${code}:${room?.round}` : `l:${round}`
  const sawPlaying = useRef<string | null>(null)
  useEffect(() => {
    if (isOnline && room?.status === 'playing') sawPlaying.current = `o:${code}:${room.round}`
  }, [isOnline, room, code])
  const recorded = useRef<string | null>(null)
  useEffect(() => {
    if (!overKey || !outcome || recorded.current === overKey) return
    if (isOnline && sawPlaying.current !== overKey) return // joined an already-finished game
    recorded.current = overKey
    const quick = outcome.reason === 'timeout' || outcome.reason === 'forfeit'
    if (quick) playOutcome(outcome, me)
    if (mode === 'local') return
    const res = outcome.winner === 0 ? 'draw' : outcome.winner === me ? 'win' : 'loss'
    recordResult(mode === 'bot' ? 'bot' : 'online', res, level)
    // only depends on the game ending
  }, [overKey])

  const [cardKey, setCardKey] = useState<string | null>(null)
  useEffect(() => {
    if (!overKey) return setCardKey(null)
    const quick = outcome?.reason === 'timeout' || outcome?.reason === 'forfeit'
    const t = setTimeout(() => setCardKey(overKey), quick ? 250 : reduce ? 500 : 1150)
    return () => clearTimeout(t)
  }, [overKey])
  const showCard = cardKey !== null && cardKey === overKey

  // --- actions
  const [sheet, setSheet] = useState<SheetState | null>(null)
  const close = () => setSheet(null)

  const [toast, setToast] = useState<{ msg: string; id: number } | null>(null)
  const showToast = (msg: string) => {
    const id = Date.now()
    setToast({ msg, id })
    setTimeout(() => setToast((t) => (t?.id === id ? null : t)), 1900)
  }

  useEffect(() => {
    if (badRoomLink) showToast("That room link doesn't look right")
  }, [])

  const newRound = useCallback(() => {
    setGame((g) => newGame(other(g.starter)))
    setRound((r) => r + 1)
    playSound('snip')
  }, [])

  const inProgress = isOnline ? room?.status === 'playing' : game.moves.length >= 2 && !isOver(game)
  const guard = (action: () => void) => {
    if (!inProgress) return action()
    setSheet({
      id: 'confirm',
      info: isOnline
        ? { title: 'Leave and forfeit?', body: `${oppName} wins this game if you leave now.`, ok: 'Leave game', danger: true, onOk: action }
        : { title: 'Start a new game?', body: 'The game in progress will be unpicked.', ok: 'New game', onOk: action },
    })
  }

  const exitOnline = () => {
    if (!isOnline) return
    online.leave()
    setCode(null)
  }
  const switchMode = (m: Mode) => {
    exitOnline()
    updateSettings({ mode: m })
    newRound()
    close()
  }
  const pickMode = (m: Mode) => {
    if (m === 'online') return setSheet({ id: 'online' })
    if (m === mode) return close()
    guard(() => switchMode(m))
  }
  const pickLevel = (l: Level) => {
    if (l === level && mode === 'bot') return close()
    guard(() => {
      exitOnline()
      updateSettings({ level: l, mode: 'bot' })
      newRound()
      close()
    })
  }
  const goOnline = (c: string, keepSheet: boolean) =>
    guard(() => {
      if (isOnline) online.leave()
      setCode(c)
      updateSettings({ mode: 'online' })
      setSheet(keepSheet ? { id: 'online' } : null)
    })

  const share = async () => {
    if (!code) return
    const url = roomLink(code)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Stitch Four', text: `Play Connect Four with me on Stitch Four. Room ${code}`, url })
        return
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      showToast('Link copied')
    } catch {
      showToast(url)
    }
  }

  const undoPlies = useMemo(() => {
    if (isOnline || isOver(game)) return 0
    if (mode === 'local') return game.moves.length ? 1 : 0
    // back to just before your last move (drops the Computer's reply, or aborts its thinking)
    for (let i = game.moves.length - 1; i >= 0; i--) if (playerAt(game, i) === 1) return game.moves.length - i
    return 0
  }, [isOnline, mode, game])
  const doUndo = () => {
    if (!undoPlies) return
    setGame((g) => undo(g, undoPlies))
    playSound('undo')
  }

  const onColumn = (col: number) => {
    if (isOnline) {
      if (!room || pending) return
      setPending({ ply: room.moves.length, col })
      online.move(col)
      return
    }
    setGame((g) => (canPlay(g, col) ? play(g, col) : g))
  }

  const saveName = (who: 'me' | Player, v: string) => {
    if (who === 'me') {
      updateSettings({ name: v })
      if (isOnline) online.rename(v)
    } else setNames((n) => ({ ...n, [who]: v }))
    close()
  }

  // close the online sheet once a friend arrives
  useEffect(() => {
    if (room?.status === 'playing') setSheet((s) => (s?.id === 'online' ? null : s))
  }, [room?.status])

  // --- reactions
  const lastSent = useRef(0)
  const [cooling, setCooling] = useState(false)
  const sendReaction = (id: number) => {
    const now = Date.now()
    if (now - lastSent.current < 1500) return
    lastSent.current = now
    online.react(id)
    close()
    setCooling(true)
    setTimeout(() => setCooling(false), 1500)
  }
  const [bubble, setBubble] = useState<typeof online.lastReaction>(null)
  useEffect(() => {
    const r = online.lastReaction
    if (!r) return
    setBubble(r)
    playSound('react')
    const t = setTimeout(() => setBubble((b) => (b === r ? null : b)), 2500)
    return () => clearTimeout(t)
  }, [online.lastReaction])

  // --- status line
  let statusText: string
  let statusPlayer: Player | null = state.turn
  const offline = !netOnline || online.link === 'offline'
  const roomFull = isOnline && !!online.error && !room
  if (isOnline && offline && !over) {
    statusText = "You're offline"
    statusPlayer = null
  } else if (roomFull) {
    statusText = 'Room is full'
    statusPlayer = null
  } else if (isOnline && !room) {
    statusText = 'Connecting…'
    statusPlayer = null
  } else if (isOnline && room?.status === 'waiting') {
    statusText = 'Waiting for friend…'
    statusPlayer = you
  } else if (outcome) {
    const w = outcome.winner
    statusPlayer = w || null
    statusText =
      w === 0 ? 'Draw' : w === me ? 'You win!' : mode === 'bot' ? 'Computer wins' : mode === 'local' ? `${names[w]} wins!` : `${oppName} wins`
  } else if (isOnline && online.link !== 'open') {
    statusText = 'Reconnecting…'
  } else {
    const t = state.turn
    statusText = mode === 'bot' ? (t === 1 ? 'Your turn' : "Computer's turn") : mode === 'local' ? `${names[t]}'s turn` : t === you ? 'Your turn' : `${oppName}'s turn`
  }
  const deadline = isOnline && room?.status === 'playing' && room.turnDeadline ? room.turnDeadline - online.clockSkew : null

  const interactive =
    !over &&
    (mode === 'bot'
      ? game.turn === 1
      : mode === 'local'
        ? true
        : room?.status === 'playing' && online.link === 'open' && onlineState.turn === you && !pending)

  // --- labels
  const activeFor = (p: Player) =>
    outcome ? outcome.winner === p : isOnline ? room?.status === 'playing' && state.turn === p : state.turn === p
  const bubbleFor = (p: Player) =>
    isOnline && bubble && bubble.from === p ? <ReactionBubble key={bubble.at} text={REACTIONS[bubble.id] ?? ''} /> : null

  const left =
    mode === 'local'
      ? { tag: 'Player 1', name: names[1], player: 1 as Player, onClick: () => setSheet({ id: 'rename', who: 1 }), aria: `Rename ${names[1]}` }
      : { tag: 'You', name: settings.name, player: isOnline ? you : (1 as Player), onClick: () => setSheet({ id: 'rename', who: 'me' }), aria: `You, ${settings.name}. Change your name` }
  const right =
    mode === 'local'
      ? { tag: 'Player 2', name: names[2], player: 2 as Player, onClick: () => setSheet({ id: 'rename', who: 2 }), aria: `Rename ${names[2]}` }
      : mode === 'bot'
        ? {
            tag: 'Computer',
            name: LEVEL_INFO[level].label,
            emoji: LEVEL_INFO[level].emoji,
            tone: level,
            player: 2 as Player,
            onClick: () => setSheet({ id: 'difficulty' }),
            aria: `Computer, ${LEVEL_INFO[level].label}. Change difficulty`,
          }
        : {
            tag: 'Friend',
            name: oppSeat?.name ?? 'Waiting…',
            player: opp,
            offline: !!oppSeat && !oppSeat.connected,
            onClick: undefined,
            aria: oppSeat ? `${oppSeat.name}${oppSeat.connected ? '' : ', disconnected'}` : 'Waiting for friend',
          }

  const chip = mode === 'bot' ? `vs Computer · ${LEVEL_INFO[level].label}` : mode === 'local' ? 'Pass & play' : `Online · ${code}`

  // --- result card
  let card: { title: string; sub: string; primary: string; primaryOff?: boolean; onPrimary: () => void; secondary: string; onSecondary: () => void } | null = null
  if (outcome) {
    const w = outcome.winner
    if (mode === 'bot') {
      const rec = settings.stats.bot[level]
      card = {
        title: w === 1 ? 'You win!' : w === 2 ? 'Computer wins' : "It's a draw",
        sub: `${LEVEL_INFO[level].emoji} ${LEVEL_INFO[level].label} · ${rec.wins}W ${rec.losses}L ${rec.draws}D`,
        primary: 'Play again',
        onPrimary: newRound,
        secondary: 'Difficulty',
        onSecondary: () => setSheet({ id: 'difficulty' }),
      }
    } else if (mode === 'local') {
      card = {
        title: w ? `${names[w]} wins!` : "It's a draw",
        sub: `${names[other(game.starter)]} starts next`,
        primary: 'Play again',
        onPrimary: newRound,
        secondary: 'Change mode',
        onSecondary: () => setSheet({ id: 'mode' }),
      }
    } else if (room) {
      const why = outcome.reason === 'timeout' ? ' — time out' : outcome.reason === 'forfeit' ? ' — forfeit' : ''
      const mine = room.rematch[you]
      const theirs = room.rematch[opp]
      card = {
        title:
          w === 0
            ? "It's a draw"
            : w === you
              ? `You win${why || '!'}`
              : outcome.reason === 'timeout'
                ? 'Out of time'
                : outcome.reason === 'forfeit'
                  ? 'Game forfeited'
                  : `${oppName} wins`,
        sub: !oppSeat
          ? `${oppName} left the room`
          : mine
            ? 'Waiting for friend…'
            : theirs
              ? `${oppName} wants a rematch`
              : oppSeat.connected
                ? 'Fancy another?'
                : `${oppName} is reconnecting…`,
        primary: mine ? 'Waiting…' : 'Rematch',
        primaryOff: mine || !oppSeat,
        onPrimary: online.rematch,
        secondary: 'Leave',
        onSecondary: () => switchMode('bot'),
      }
    }
  }

  // --- overlay over the board for online setup states
  let overlay: ReactNode = null
  if (isOnline && !over && sheet?.id !== 'online') {
    if (offline && !room) {
      overlay = (
        <>
          <Offline />
          <button type="button" className="btn is-primary" onClick={() => switchMode('bot')}>
            Play vs Computer
          </button>
        </>
      )
    } else if (roomFull) {
      overlay = (
        <>
          <h3 className="overlay-title">That room is full</h3>
          <p className="sheet-text is-center">Two players are already stitching away in {code}.</p>
          <button type="button" className="btn is-primary" onClick={() => switchMode('bot')}>
            Play vs Computer
          </button>
        </>
      )
    } else if (!room) {
      overlay = <p className="overlay-title is-soft">Connecting…</p>
    } else if (room.status === 'waiting' && code) {
      overlay = (
        <>
          <p className="overlay-kicker">Waiting for a friend</p>
          <RoomCode code={code} />
          <button type="button" className="btn is-primary" onClick={share}>
            <ShareIcon /> Share link
          </button>
          <p className="overlay-hint">Or they can tap Online, then Join, and type the code.</p>
        </>
      )
    }
  }

  return (
    <div className="app">
      <main className="stage">
        <div className="controls">
          {isOnline ? (
            <button
              type="button"
              className="icon-btn"
              onClick={() => setSheet({ id: 'reactions' })}
              disabled={!room || room.status === 'waiting' || !oppSeat}
              aria-label="Send a reaction"
            >
              <ChatIcon />
            </button>
          ) : (
            <button type="button" className="icon-btn" onClick={doUndo} disabled={!undoPlies} aria-label="Undo" data-silent>
              <UndoIcon />
            </button>
          )}
          <TurnStatus player={statusPlayer} text={statusText} theme={theme} thinking={thinking} deadline={deadline} total={TURN_MS} />
          <button type="button" className="icon-btn is-spool" onClick={() => setSheet({ id: 'menu' })} aria-label="Menu">
            <SpoolIcon />
          </button>
        </div>

        <div className="board-wrap">
          <Board state={state} theme={theme} interactive={interactive} onColumn={onColumn} onLand={onLand} />
          <AnimatePresence>
            {overlay && (
              <motion.div
                key="overlay"
                className="board-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <motion.div
                  className="overlay-card linen-panel"
                  initial={reduce ? false : { y: 12, scale: 0.97 }}
                  animate={{ y: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                >
                  {overlay}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="bottom">
          <AnimatePresence mode="wait" initial={false}>
            {showCard && card ? (
              <motion.div
                key="card"
                className="result linen-panel"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, rotate: -0.6 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
                role="status"
              >
                <div className="result-text">
                  <h2 className="result-title">{card.title}</h2>
                  <p className="result-sub">{card.sub}</p>
                </div>
                <div className="result-btns">
                  <button type="button" className="btn" onClick={card.onSecondary}>
                    {card.secondary}
                  </button>
                  <button type="button" className="btn is-primary" onClick={card.onPrimary} disabled={card.primaryOff} data-silent>
                    {card.primary}
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="labels"
                className="bottom-inner"
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
                transition={{ duration: 0.2 }}
              >
                <div className="labels">
                  <NameLabel
                    side="left"
                    tag={left.tag}
                    name={left.name}
                    player={left.player}
                    theme={theme}
                    active={activeFor(left.player)}
                    onClick={left.onClick}
                    ariaLabel={left.aria}
                    bubble={bubbleFor(left.player)}
                  />
                  <span className="labels-vs" aria-hidden>
                    vs
                  </span>
                  <NameLabel
                    side="right"
                    tag={right.tag}
                    name={right.name}
                    player={right.player}
                    theme={theme}
                    active={activeFor(right.player)}
                    tone={'tone' in right ? right.tone : null}
                    emoji={'emoji' in right ? right.emoji : undefined}
                    offline={'offline' in right ? right.offline : false}
                    onClick={right.onClick}
                    ariaLabel={right.aria}
                    bubble={bubbleFor(right.player)}
                  />
                </div>
                <button type="button" className="mode-chip" onClick={() => setSheet({ id: 'mode' })}>
                  {chip}
                  <ChevronIcon />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      <AnimatePresence>
        {sheet?.id === 'menu' && (
          <Menu
            key="menu"
            settings={settings}
            mode={mode}
            canNewGame={!isOnline}
            onNewGame={() =>
              guard(() => {
                newRound()
                close()
              })
            }
            onMode={pickMode}
            onLevel={pickLevel}
            onRename={(n) => {
              updateSettings({ name: n })
              if (isOnline) online.rename(n)
            }}
            onClose={close}
          />
        )}
        {sheet?.id === 'mode' && <ModeSheet key="mode" mode={mode} onPick={pickMode} onClose={close} />}
        {sheet?.id === 'difficulty' && <DifficultySheet key="difficulty" level={level} onPick={pickLevel} onClose={close} />}
        {sheet?.id === 'rename' && (
          <RenameSheet
            key="rename"
            title={sheet.who === 'me' ? 'Your name' : `Rename ${names[sheet.who]}`}
            value={sheet.who === 'me' ? settings.name : names[sheet.who]}
            onSave={(v) => saveName(sheet.who, v)}
            onClose={close}
          />
        )}
        {sheet?.id === 'confirm' && <ConfirmSheet key="confirm" info={sheet.info} onClose={close} />}
        {sheet?.id === 'online' && (
          <OnlineSheet
            key="online"
            offline={!netOnline}
            code={isOnline ? code : null}
            waiting={room?.status !== 'playing'}
            onCreate={() => goOnline(randomCode(), true)}
            onJoin={(c) => goOnline(c, false)}
            onShare={share}
            onLeave={() => switchMode('bot')}
            onClose={close}
          />
        )}
        {sheet?.id === 'reactions' && <ReactionsSheet key="reactions" onSend={sendReaction} cooling={cooling} onClose={close} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="toast linen-panel"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            role="status"
          >
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
