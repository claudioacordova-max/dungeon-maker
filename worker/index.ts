// Cloudflare Worker: serves the built game (static assets from ./dist) and routes /api/room/<CODE> WebSockets
// to that room's Durable Object. Deployed by `npx wrangler deploy` (wrangler.jsonc).
import { ROOM_CODE } from '../src/shared/protocol.ts'
export { Room } from './room.ts'

type Env = { ROOM: DurableObjectNamespace }

// A room's server is created near whoever creates the room (latency). Cloudflare treats the hint as a preference,
// and it only matters when the room is created; players joining later reach the same server wherever it is.
const HINT_BY_CONTINENT: Record<string, DurableObjectLocationHint> = {
  SA: 'sam',
  NA: 'enam',
  EU: 'weur',
  AS: 'apac',
  OC: 'oc',
  AF: 'afr',
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return new Response('ok location-hint')
    const match = url.pathname.match(/^\/api\/room\/([A-Z]{4})$/)
    if (match && ROOM_CODE.test(match[1])) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
      const hint = HINT_BY_CONTINENT[request.cf?.continent ?? '']
      const id = env.ROOM.idFromName(match[1])
      return env.ROOM.get(id, hint ? { locationHint: hint } : undefined).fetch(request)
    }
    return new Response('Not found', { status: 404 })
  },
}
