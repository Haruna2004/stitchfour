import { Server, type Connection } from 'partyserver'
import { canPlay, fromMoves, other, type Player } from '../shared/game'
import {
  TURN_MS,
  normalizeCode,
  type EndReason,
  type RoomState,
  type ServerMsg,
} from '../shared/protocol'
import { MAX_CONNECTIONS, MAX_MSG_BYTES, byteSize, check, createLimiter, parseClientMsg, type Limiter } from './limits'
import { helloName, renameTo, validPair, type AssignedNames } from './anon'
import { dueActions, nextAlarm, type ClockState } from './schedule'

interface SeatRecord {
  clientId: string
  name: string
  goneSince: number | null // set while disconnected
}

interface Stored {
  room: RoomState
  owners: { 1: SeatRecord | null; 2: SeatRecord | null }
  lastActive: number // epoch ms of the last connect or valid message
  names: AssignedNames // matched rooms: server-picked names for seat 1 and 2
}

type ConnState = { seat: Player | null }

// One Durable Object per room code. It is the source of truth: it validates
// every move, runs the turn clock and handles forfeits via alarms.
export class StitchRoom extends Server<Env> {
  static options = { hibernate: true }

  data!: Stored
  limiters = new Map<string, Limiter>() // best effort: lost on hibernation

  freshData(): Stored {
    return {
      room: {
        code: this.name,
        seats: { 1: null, 2: null },
        moves: [],
        starter: 1,
        status: 'waiting',
        result: null,
        turnDeadline: null,
        rematch: { 1: false, 2: false },
        round: 1,
        anonymous: false,
      },
      owners: { 1: null, 2: null },
      lastActive: Date.now(),
      names: null,
    }
  }

  async onStart() {
    this.data = (await this.ctx.storage.get<Stored>('data')) ?? this.freshData()
    this.data.lastActive ??= Date.now() // rooms stored before cleanup existed
    this.data.room.anonymous ??= false // rooms stored before matchmaking existed
    this.data.names ??= null
  }

  onConnect(conn: Connection<ConnState>) {
    if (!normalizeCode(this.name)) {
      conn.close(1008, 'Invalid room code')
      return
    }
    if (this.liveCount() > MAX_CONNECTIONS) {
      conn.close(1008, 'Room busy')
      return
    }
    this.data.lastActive = Date.now()
    conn.setState({ seat: null })
  }

  async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer | ArrayBufferView) {
    const now = Date.now()
    let limiter = this.limiters.get(conn.id)
    if (!limiter) this.limiters.set(conn.id, (limiter = createLimiter(now)))
    const oversize = byteSize(raw) > MAX_MSG_BYTES
    // Parsing is cheap (<= 1 KB) and gives the type for per-type cooldowns.
    const msg = oversize ? null : parseClientMsg(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
    const verdict = check(limiter, msg?.t ?? '', now)
    if (verdict === 'abuse') return conn.close(1008, 'Too many messages')
    if (verdict === 'drop') return
    if (!msg) return this.badMsg(conn)
    this.data.lastActive = now
    const seat = conn.state?.seat ?? null

    switch (msg.t) {
      case 'hello':
        if (seat) return
        return this.hello(conn, msg.clientId, msg.name)
      case 'move':
        if (seat) await this.move(conn, seat, msg.col, msg.ply)
        return
      case 'react':
        if (seat) this.broadcastMsg({ t: 'react', from: seat, id: msg.id })
        return
      case 'rename':
        if (seat) {
          const name = renameTo(this.data.names, msg.name) // matched rooms ignore renames
          if (!name) return
          this.data.owners[seat]!.name = name
          this.data.room.seats[seat] = { ...this.data.room.seats[seat]!, name }
          await this.commit()
        }
        return
      case 'rematch':
        if (seat) await this.rematch(seat)
        return
      case 'leave':
        if (seat) await this.leave(seat)
        return
    }
  }

  async onClose(conn: Connection<ConnState>) {
    this.limiters.delete(conn.id)
    if (!normalizeCode(this.name)) return
    const now = Date.now()
    this.data.lastActive = now
    const seat = conn.state?.seat
    const owner = seat ? this.data.owners[seat] : null
    if (seat && owner && !this.hasLiveConnection(seat, conn.id)) {
      owner.goneSince = now
      this.data.room.seats[seat] = { name: owner.name, connected: false }
      await this.commit(conn.id)
    } else if (this.liveCount(conn.id) === 0) {
      await this.commit(conn.id) // last socket gone: arm the cleanup alarm
    }
  }

  async onAlarm() {
    const now = Date.now()
    const { room } = this.data
    const due = dueActions(this.clock(), now)
    if (due.cleanup) return this.cleanup()
    // Forfeit beats timeout if both are due.
    if (due.forfeit) {
      this.finish(other(due.forfeit), 'forfeit')
    } else if (due.timeout) {
      const turn = fromMoves(room.moves, room.starter).turn
      this.finish(other(turn), 'timeout')
    }
    await this.commit() // reschedules any remaining alarm
  }

  // --- RPC (Worker only: Durable Object methods are not reachable over HTTP) ---

  /** Called by the Lobby before telling a matched pair the code. False if the code is taken. */
  async initMatch(names: [string, string]): Promise<boolean> {
    if (!normalizeCode(this.name) || !validPair(names)) return false
    const { owners, room } = this.data
    if (owners[1] || owners[2] || room.moves.length || this.data.names || this.liveCount() > 0) return false
    this.data.names = names
    room.anonymous = true
    this.data.lastActive = Date.now()
    await this.commit()
    return true
  }

  // --- actions ---

  async hello(conn: Connection<ConnState>, clientId: string, requested: string) {
    const { owners, room } = this.data
    let seat: Player | null = owners[1]?.clientId === clientId ? 1 : owners[2]?.clientId === clientId ? 2 : null
    if (!seat) {
      seat = !owners[1] ? 1 : !owners[2] ? 2 : null
      if (!seat) {
        this.send(conn, { t: 'error', code: 'full', message: 'This room already has two players' })
        conn.close(1000, 'Room full')
        return
      }
      owners[seat] = { clientId, name: '', goneSince: null }
    }
    const name = helloName(this.data.names, seat, requested)
    owners[seat]!.goneSince = null
    owners[seat]!.name = name
    room.seats[seat] = { name, connected: true }
    conn.setState({ seat })

    if (room.status === 'waiting' && owners[1] && owners[2]) {
      room.status = 'playing'
      room.turnDeadline = Date.now() + TURN_MS
    }
    await this.commit()
  }

  async move(conn: Connection<ConnState>, seat: Player, col: number, ply: number) {
    const { room } = this.data
    const state = fromMoves(room.moves, room.starter)
    if (room.status !== 'playing' || state.turn !== seat || ply !== room.moves.length || !canPlay(state, col)) {
      // Resync the client instead of trusting it.
      return this.sendState(conn)
    }
    room.moves = [...room.moves, col]
    const next = fromMoves(room.moves, room.starter)
    if (next.winner) this.finish(next.winner, 'four')
    else if (next.draw) this.finish(0, 'draw')
    else room.turnDeadline = Date.now() + TURN_MS
    await this.commit()
  }

  async rematch(seat: Player) {
    const { room } = this.data
    if (room.status !== 'over') return
    room.rematch[seat] = true
    if (room.rematch[1] && room.rematch[2]) {
      room.round += 1
      room.starter = other(room.starter)
      room.moves = []
      room.result = null
      room.rematch = { 1: false, 2: false }
      const both = room.seats[1]?.connected && room.seats[2]?.connected
      room.status = both ? 'playing' : 'waiting'
      room.turnDeadline = both ? Date.now() + TURN_MS : null
    }
    await this.commit()
  }

  async leave(seat: Player) {
    const { room } = this.data
    if (room.status === 'playing') this.finish(other(seat), 'forfeit')
    this.data.owners[seat] = null
    room.seats[seat] = null
    await this.commit()
  }

  // --- helpers ---

  finish(winner: Player | 0, reason: EndReason) {
    const { room } = this.data
    room.status = 'over'
    room.result = { winner, reason }
    room.turnDeadline = null
    room.rematch = { 1: false, 2: false }
  }

  hasLiveConnection(seat: Player, exceptId: string) {
    for (const c of this.getConnections<ConnState>()) if (c.id !== exceptId && c.state?.seat === seat) return true
    return false
  }

  // Sockets currently open, ignoring one that is closing.
  liveCount(exceptId?: string) {
    let n = 0
    for (const c of this.getConnections()) if (c.id !== exceptId) n++
    return n
  }

  clock(exceptId?: string): ClockState {
    const { room, owners, lastActive } = this.data
    return {
      status: room.status,
      turnDeadline: room.turnDeadline,
      goneSince: { 1: owners[1]?.goneSince ?? null, 2: owners[2]?.goneSince ?? null },
      lastActive,
      live: this.liveCount(exceptId),
    }
  }

  // Idle rooms vanish: wipe storage and start over so the code can be reused.
  async cleanup() {
    await this.ctx.storage.deleteAlarm()
    await this.ctx.storage.deleteAll()
    this.data = this.freshData()
    this.limiters.clear()
  }

  async commit(closingId?: string) {
    await this.ctx.storage.put('data', this.data)
    const at = nextAlarm(this.clock(closingId))
    if (at !== null) await this.ctx.storage.setAlarm(at)
    else await this.ctx.storage.deleteAlarm()
    for (const c of this.getConnections<ConnState>()) if (c.id !== closingId) this.sendState(c)
  }

  badMsg(conn: Connection) {
    this.send(conn, { t: 'error', code: 'bad-msg', message: 'Bad message' })
  }

  sendState(conn: Connection<ConnState>) {
    this.send(conn, { t: 'state', room: this.data.room, you: conn.state?.seat ?? null, now: Date.now() })
  }

  send(conn: Connection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg))
  }

  broadcastMsg(msg: ServerMsg) {
    this.broadcast(JSON.stringify(msg))
  }
}
