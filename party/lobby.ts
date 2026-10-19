import { Server, getServerByName, type Connection } from 'partyserver'
import { namePair } from '../shared/names'
import { LOBBY_ROOM, randomCode, type LobbyServerMsg } from '../shared/protocol'
import { MAX_LOBBY_CONNECTIONS, MAX_LOBBY_MSG_BYTES, byteSize, check, createLimiter, parseLobbyMsg, type Limiter } from './limits'
import { pairKey, planMatches, pruneRecent, seekingCount, type RecentPairs, type Seeker } from './matching'

// The queue lives in each connection's state (kept through hibernation), so it is
// rebuilt from the open sockets on every event. Only recent pairs and limiters are memory-only.
type ConnState = { seeking: boolean; clientId: string; since: number }

const TICK_MS = 5000 // while anyone waits: re-check timeouts and re-pair rules
const COUNT_EVERY_MS = 1000

// One global Durable Object ("main") that pairs strangers into anonymous rooms.
export class Lobby extends Server<Env> {
  static options = { hibernate: true }

  recent: RecentPairs = new Map()
  limiters = new Map<string, Limiter>()
  lastCount = { at: 0, value: -1 }
  countTimer: ReturnType<typeof setTimeout> | null = null
  matching = false

  onConnect(conn: Connection<ConnState>) {
    if (this.name !== LOBBY_ROOM) return conn.close(1008, 'Unknown lobby')
    if (this.liveCount() > MAX_LOBBY_CONNECTIONS) {
      this.send(conn, { t: 'error', code: 'busy', message: 'Too many players right now' })
      return conn.close(1013, 'Busy')
    }
    conn.setState({ seeking: false, clientId: '', since: 0 })
    this.send(conn, { t: 'count', seeking: seekingCount(this.seekers()) })
  }

  async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer | ArrayBufferView) {
    const now = Date.now()
    let limiter = this.limiters.get(conn.id)
    if (!limiter) this.limiters.set(conn.id, (limiter = createLimiter(now)))
    const msg = byteSize(raw) > MAX_LOBBY_MSG_BYTES ? null : parseLobbyMsg(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    const verdict = check(limiter, msg?.t ?? '', now)
    if (verdict === 'abuse') return conn.close(1008, 'Too many messages')
    if (verdict === 'drop') return
    if (!msg) return this.send(conn, { t: 'error', code: 'bad-msg', message: 'Bad message' })

    if (msg.t === 'seek') {
      const s = conn.state
      // a repeat seek keeps your place in line
      conn.setState({ seeking: true, clientId: msg.clientId, since: s?.seeking && s.clientId === msg.clientId ? s.since : now })
      await this.match()
    } else {
      conn.setState({ seeking: false, clientId: conn.state?.clientId ?? '', since: 0 })
      this.queueCount()
    }
  }

  onClose(conn: Connection) {
    this.limiters.delete(conn.id)
    this.queueCount(conn.id)
  }

  async onAlarm() {
    await this.match()
  }

  // --- matching ---

  seekers(exceptId?: string): Seeker[] {
    const out: Seeker[] = []
    for (const c of this.getConnections<ConnState>()) {
      const s = c.state
      if (c.id !== exceptId && s?.seeking) out.push({ id: c.id, clientId: s.clientId, since: s.since })
    }
    return out
  }

  async match() {
    if (this.matching) return // the running pass loops until nothing changes
    this.matching = true
    try {
      for (;;) {
        const now = Date.now()
        pruneRecent(this.recent, now)
        const { pairs, timedOut } = planMatches(this.seekers(), this.recent, now)
        for (const s of timedOut) {
          const c = this.getConnection<ConnState>(s.id)
          if (!c) continue
          c.setState({ ...s, seeking: false })
          this.send(c, { t: 'error', code: 'timeout', message: 'No one turned up' })
          c.close(1000, 'Timed out')
        }
        if (!pairs.length) break
        // take everyone out of the queue before awaiting, so no one is paired twice
        for (const [a, b] of pairs) for (const s of [a, b]) this.getConnection<ConnState>(s.id)?.setState({ ...s, seeking: false })
        const made = await Promise.all(pairs.map((p) => this.pair(p[0], p[1])))
        if (!made.some(Boolean)) break // rooms failing: retry on the next tick
      }
    } finally {
      this.matching = false
    }
    this.queueCount()
    await this.schedule()
  }

  async pair(a: Seeker, b: Seeker): Promise<boolean> {
    const code = await this.createRoom()
    const ca = this.getConnection<ConnState>(a.id)
    const cb = this.getConnection<ConnState>(b.id)
    const open = (c: Connection | undefined) => c && c.readyState === WebSocket.OPEN
    if (!code || !open(ca) || !open(cb)) {
      // someone left meanwhile (or no room): the rest keep their place in line
      for (const [c, s] of [[ca, a], [cb, b]] as const) if (c && open(c)) c.setState({ ...s, seeking: true })
      return false
    }
    this.recent.set(pairKey(a.clientId, b.clientId), Date.now())
    for (const c of [ca!, cb!]) {
      this.send(c, { t: 'matched', code })
      c.close(1000, 'Matched')
    }
    return true
  }

  /** A fresh code whose room is set up as anonymous before anyone hears it. */
  async createRoom(): Promise<string | null> {
    for (let i = 0; i < 3; i++) {
      const code = randomCode()
      try {
        const room = await getServerByName(this.env.StitchRoom, code)
        if (await room.initMatch(namePair())) return code
      } catch (e) {
        console.error('lobby: room init failed', e)
      }
    }
    return null
  }

  async schedule() {
    if (this.seekers().length) await this.ctx.storage.setAlarm(Date.now() + TICK_MS)
    else await this.ctx.storage.deleteAlarm()
  }

  // --- count broadcast, at most once a second ---

  queueCount(exceptId?: string) {
    if (this.countTimer) return
    const wait = Math.max(0, this.lastCount.at + COUNT_EVERY_MS - Date.now())
    if (wait === 0) return this.sendCount(exceptId)
    this.countTimer = setTimeout(() => {
      this.countTimer = null
      this.sendCount()
    }, wait)
  }

  sendCount(exceptId?: string) {
    const value = seekingCount(this.seekers(exceptId))
    if (value === this.lastCount.value) return
    this.lastCount = { at: Date.now(), value }
    const msg = JSON.stringify({ t: 'count', seeking: value } satisfies LobbyServerMsg)
    for (const c of this.getConnections()) if (c.id !== exceptId) c.send(msg)
  }

  liveCount() {
    return [...this.getConnections()].length
  }

  send(conn: Connection, msg: LobbyServerMsg) {
    conn.send(JSON.stringify(msg))
  }
}
