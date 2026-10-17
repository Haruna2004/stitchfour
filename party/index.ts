import { routePartykitRequest } from 'partyserver'

export { StitchRoom } from './room'

// Static files are served by Workers assets; only /parties/* reaches this.
export default {
  async fetch(request, env) {
    return (await routePartykitRequest(request, env)) ?? new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
