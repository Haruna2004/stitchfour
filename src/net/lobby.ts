import { PartySocket } from 'partysocket'
import { useCallback, useEffect, useRef, useState } from 'react'
import { LOBBY_PARTY, LOBBY_ROOM, normalizeCode, type LobbyClientMsg, type LobbyServerMsg } from '../../shared/protocol'

export type MatchStatus = 'idle' | 'connecting' | 'seeking' | 'matched' | 'error' | 'offline'

export interface Matchmaking {
  status: MatchStatus
  seeking: number // players looking, you included (from the lobby)
  waitedSec: number
  error: 'timeout' | 'busy' | 'failed' | null
  start: () => void
  cancel: () => void
  reset: () => void
}

/** "Find a player": waits in the global lobby until the server pairs you into a room. */
export function useMatchmaking(clientId: string, onMatched: (code: string, waitedSec: number) => void, onTimeout?: () => void): Matchmaking {
  const [status, setStatus] = useState<MatchStatus>('idle')
  const [seeking, setSeeking] = useState(0)
  const [since, setSince] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [error, setError] = useState<Matchmaking['error']>(null)
  const sock = useRef<PartySocket | null>(null)
  const cbs = useRef({ onMatched, onTimeout })
  cbs.current = { onMatched, onTimeout }

  const stop = useCallback(() => {
    const s = sock.current
    sock.current = null
    s?.close()
  }, [])

  const start = useCallback(() => {
    stop()
    setError(null)
    setSeeking(0)
    const t0 = Date.now()
    setSince(t0)
    setNow(t0)
    if (!navigator.onLine) return setStatus('offline')
    setStatus('connecting')
    const s = new PartySocket({ host: location.host, party: LOBBY_PARTY, room: LOBBY_ROOM, maxRetries: 8 })
    sock.current = s
    const send = (m: LobbyClientMsg) => s.send(JSON.stringify(m))
    // reconnects re-seek; the server keeps your place only while the socket stays open
    s.addEventListener('open', () => {
      if (sock.current !== s) return
      send({ t: 'seek', clientId })
      setStatus('seeking')
    })
    s.addEventListener('close', () => {
      if (sock.current !== s) return
      if (!navigator.onLine) {
        stop()
        setStatus('offline')
      } else setStatus('connecting')
    })
    s.addEventListener('message', (e: MessageEvent) => {
      if (sock.current !== s) return
      let m: LobbyServerMsg
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      if (m.t === 'count') setSeeking(m.seeking)
      else if (m.t === 'matched') {
        const code = normalizeCode(m.code)
        stop()
        if (!code) {
          setError('failed')
          return setStatus('error')
        }
        setStatus('matched')
        cbs.current.onMatched(code, (Date.now() - t0) / 1000)
      } else if (m.t === 'error' && m.code !== 'bad-msg') {
        stop()
        setError(m.code)
        setStatus('error')
        if (m.code === 'timeout') cbs.current.onTimeout?.()
      }
    })
  }, [clientId, stop])

  const cancel = useCallback(() => {
    const s = sock.current
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ t: 'cancel' } satisfies LobbyClientMsg))
    stop()
    setStatus('idle')
    setSince(null)
  }, [stop])

  const reset = useCallback(() => {
    stop()
    setStatus('idle')
    setSince(null)
    setError(null)
  }, [stop])

  // tick the wait clock
  const active = status === 'connecting' || status === 'seeking'
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])

  // going offline mid-search
  useEffect(() => {
    if (!active) return
    const off = () => {
      stop()
      setStatus('offline')
    }
    window.addEventListener('offline', off)
    return () => window.removeEventListener('offline', off)
  }, [active, stop])

  useEffect(() => stop, [stop])

  return {
    status,
    seeking,
    waitedSec: since === null ? 0 : Math.max(0, Math.floor((now - since) / 1000)),
    error,
    start,
    cancel,
    reset,
  }
}
