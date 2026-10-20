import { routePartykitRequest } from 'partyserver'
import { LOBBY_PARTY, LOBBY_ROOM, PARTY, normalizeCode } from '../shared/protocol'
import { handleEvent } from './events'
import { inviteCode, rewriteInvite } from './invite'

export { Lobby } from './lobby'
export { StitchRoom } from './room'

const ROOM_PATH = new RegExp(`^/parties/${PARTY}/([^/]+)`)
const LOBBY_PATH = new RegExp(`^/parties/${LOBBY_PARTY}/([^/]+)`)

// Static files come from Workers assets. The Worker runs first only for
// /parties/* (rooms), /api/* (analytics events) and / (invite meta injection).
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/') {
      const code = request.method === 'GET' ? inviteCode(url) : null
      const res = await env.ASSETS.fetch(request)
      const isHtml = res.headers.get('content-type')?.includes('text/html')
      return code && isHtml ? rewriteInvite(res, url, code) : res
    }

    if (url.pathname === '/api/event') return handleEvent(request, env as { EVENTS?: AnalyticsEngineDataset }) // binding is optional
    if (url.pathname.startsWith('/api/')) return new Response('Not found', { status: 404 })

    // Only canonical room codes get a Durable Object.
    const name = ROOM_PATH.exec(url.pathname)?.[1]
    if (name !== undefined && normalizeCode(name) !== name) {
      return new Response('Not found', { status: 404 })
    }
    // One global matchmaking lobby.
    const lobby = LOBBY_PATH.exec(url.pathname)?.[1]
    if (lobby !== undefined && lobby !== LOBBY_ROOM) return new Response('Not found', { status: 404 })

    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
