import { PartySocket } from 'partysocket'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Player } from '../../shared/game'
import { PARTY, type ClientMsg, type ReactionId, type RoomState, type ServerMsg } from '../../shared/protocol'

export type Link = 'connecting' | 'open' | 'closed' | 'offline'

export interface OnlineRoom {
  link: Link
  room: RoomState | null
  you: Player | null
  error: string | null
  clockSkew: number // server now - local now, for the turn timer
  lastReaction: { from: Player; id: ReactionId; at: number } | null
  move: (col: number) => void
  react: (id: ReactionId) => void
  rematch: () => void
  rename: (name: string) => void
  leave: () => void
}

/** Connects to an online room while `code` is set. */
export function useOnlineRoom(code: string | null, name: string, clientId: string): OnlineRoom {
  const [link, setLink] = useState<Link>('closed')
  const [room, setRoom] = useState<RoomState | null>(null)
  const [you, setYou] = useState<Player | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clockSkew, setSkew] = useState(0)
  const [lastReaction, setReaction] = useState<OnlineRoom['lastReaction']>(null)
  const sock = useRef<PartySocket | null>(null)
  const nameRef = useRef(name)
  nameRef.current = name

  useEffect(() => {
    if (!code) return
    setRoom(null)
    setYou(null)
    setError(null)
    setLink(navigator.onLine ? 'connecting' : 'offline')
    const s = new PartySocket({ host: location.host, party: PARTY, room: code })
    sock.current = s
    const send = (m: ClientMsg) => s.send(JSON.stringify(m))

    s.addEventListener('open', () => {
      setLink('open')
      send({ t: 'hello', clientId, name: nameRef.current })
    })
    s.addEventListener('close', () => setLink(navigator.onLine ? 'connecting' : 'offline'))
    s.addEventListener('message', (e: MessageEvent) => {
      let m: ServerMsg
      try {
        m = JSON.parse(e.data)
      } catch {
        return
      }
      if (m.t === 'state') {
        setRoom(m.room)
        setYou(m.you)
        setSkew(m.now - Date.now())
      } else if (m.t === 'react') {
        setReaction({ from: m.from, id: m.id, at: Date.now() })
      } else if (m.t === 'error') {
        setError(m.message)
        if (m.code === 'full') s.close()
      }
    })
    const offline = () => setLink('offline')
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('offline', offline)
      s.close()
      sock.current = null
      setLink('closed')
    }
  }, [code, clientId])

  const send = useCallback((m: ClientMsg) => sock.current?.send(JSON.stringify(m)), [])

  return {
    link,
    room,
    you,
    error,
    clockSkew,
    lastReaction,
    move: (col) => room && send({ t: 'move', col, ply: room.moves.length }),
    react: (id) => send({ t: 'react', id }),
    rematch: () => send({ t: 'rematch' }),
    rename: (n) => send({ t: 'rename', name: n }),
    leave: () => send({ t: 'leave' }),
  }
}

export const roomLink = (code: string) => `${location.origin}/?room=${code}`

export function readRoomFromUrl(): string | null {
  return new URLSearchParams(location.search).get('room')
}
