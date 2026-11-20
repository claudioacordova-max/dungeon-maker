// Cloudflare Worker: serves the built game (static assets from ./dist) and routes /api/room/<CODE> WebSockets
// to that room's Durable Object. Deployed by `npx wrangler deploy` (wrangler.jsonc).
import { ROOM_CODE } from '../src/shared/protocol.ts'
export { Room } from './room.ts'

type Env = { ROOM: DurableObjectNamespace }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') return new Response('ok')
    const match = url.pathname.match(/^\/api\/room\/([A-Z]{4})$/)
    if (match && ROOM_CODE.test(match[1])) {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 })
      return env.ROOM.get(env.ROOM.idFromName(match[1])).fetch(request)
    }
    return new Response('Not found', { status: 404 })
  },
}
