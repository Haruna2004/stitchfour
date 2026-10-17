import { Server, type Connection } from 'partyserver'
import { canPlay, fromMoves, other, type Player } from '../shared/game'
import {
  REACTIONS,
  RECONNECT_MS,
  TURN_MS,
  cleanName,
  normalizeCode,
  type ClientMsg,
  type EndReason,
  type RoomState,
  type ServerMsg,
} from '../shared/protocol'

interface SeatRecord {
  clientId: string
  name: string
  goneSince: number | null // set while disconnected
}

interface Stored {
  room: RoomState
  owners: { 1: SeatRecord | null; 2: SeatRecord | null }
}

type ConnState = { seat: Player | null }

// One Durable Object per room code. It is the source of truth: it validates
// every move, runs the turn clock and handles forfeits via alarms.
export class StitchRoom extends Server<Env> {
  static options = { hibernate: true }

  data!: Stored

  async onStart() {
    this.data = (await this.ctx.storage.get<Stored>('data')) ?? {
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
      },
      owners: { 1: null, 2: null },
    }
  }

  onConnect(conn: Connection<ConnState>) {
    if (!normalizeCode(this.name)) {
      conn.close(1008, 'Invalid room code')
      return
    }
    conn.setState({ seat: null })
  }

  async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer | ArrayBufferView) {
    let msg: ClientMsg
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw as ArrayBuffer))
    } catch {
      return this.send(conn, { t: 'error', code: 'bad-msg', message: 'Bad message' })
    }
    const seat = conn.state?.seat ?? null

    switch (msg.t) {
      case 'hello':
        return this.hello(conn, String(msg.clientId).slice(0, 64), cleanName(String(msg.name)) || 'Player')
      case 'move':
        if (seat) await this.move(conn, seat, msg.col, msg.ply)
        return
      case 'react':
        if (seat && Number.isInteger(msg.id) && msg.id >= 0 && msg.id < REACTIONS.length) {
          this.broadcastMsg({ t: 'react', from: seat, id: msg.id })
        }
        return
      case 'rename':
        if (seat) {
          const name = cleanName(String(msg.name))
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
    const seat = conn.state?.seat
    if (!seat || this.hasLiveConnection(seat, conn.id)) return
    const owner = this.data.owners[seat]
    if (!owner) return
    owner.goneSince = Date.now()
    this.data.room.seats[seat] = { name: owner.name, connected: false }
    await this.commit()
  }

  async onAlarm() {
    const now = Date.now()
    const { room, owners } = this.data
    if (room.status === 'playing') {
      // Forfeit beats timeout if both are due.
      for (const p of [1, 2] as Player[]) {
        const gone = owners[p]?.goneSince
        if (gone && now - gone >= RECONNECT_MS) {
          this.finish(other(p), 'forfeit')
          return this.commit()
        }
      }
      if (room.turnDeadline && now >= room.turnDeadline) {
        const turn = fromMoves(room.moves, room.starter).turn
        this.finish(other(turn), 'timeout')
        return this.commit()
      }
    }
    await this.commit() // reschedules any remaining alarm
  }

  // --- actions ---

  async hello(conn: Connection<ConnState>, clientId: string, name: string) {
    const { owners, room } = this.data
    let seat: Player | null = owners[1]?.clientId === clientId ? 1 : owners[2]?.clientId === clientId ? 2 : null
    if (!seat) {
      seat = !owners[1] ? 1 : !owners[2] ? 2 : null
      if (!seat) {
        this.send(conn, { t: 'error', code: 'full', message: 'This room already has two players' })
        conn.close(1000, 'Room full')
        return
      }
      owners[seat] = { clientId, name, goneSince: null }
    }
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

  async commit() {
    await this.ctx.storage.put('data', this.data)
    const due: number[] = []
    const { room, owners } = this.data
    if (room.status === 'playing') {
      if (room.turnDeadline) due.push(room.turnDeadline)
      for (const p of [1, 2] as Player[]) if (owners[p]?.goneSince) due.push(owners[p]!.goneSince! + RECONNECT_MS)
    }
    if (due.length) await this.ctx.storage.setAlarm(Math.min(...due))
    else await this.ctx.storage.deleteAlarm()
    for (const c of this.getConnections<ConnState>()) this.sendState(c)
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
