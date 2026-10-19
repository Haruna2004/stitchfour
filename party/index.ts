import { routePartykitRequest } from 'partyserver'
import { PARTY, normalizeCode } from '../shared/protocol'
import { inviteCode, rewriteInvite } from './invite'

export { StitchRoom } from './room'

const ROOM_PATH = new RegExp(`^/parties/${PARTY}/([^/]+)`)

// Static files come from Workers assets. The Worker runs first only for
// /parties/* (rooms) and / (invite meta injection).
export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/') {
      const code = request.method === 'GET' ? inviteCode(url) : null
      const res = await env.ASSETS.fetch(request)
      const isHtml = res.headers.get('content-type')?.includes('text/html')
      return code && isHtml ? rewriteInvite(res, url, code) : res
    }

    // Only canonical room codes get a Durable Object.
    const name = ROOM_PATH.exec(url.pathname)?.[1]
    if (name !== undefined && normalizeCode(name) !== name) {
      return new Response('Not found', { status: 404 })
    }

    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
