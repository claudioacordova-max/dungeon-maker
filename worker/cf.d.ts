// Minimal Cloudflare Workers declarations used by worker/ (avoids a types dependency).
declare class WebSocketPair {
  0: WebSocket
  1: WebSocket
}

interface WebSocket {
  accept(): void
}

interface ResponseInit {
  webSocket?: WebSocket
}

interface DurableObjectId {}

interface DurableObjectStub {
  fetch(request: Request): Promise<Response>
}

type DurableObjectLocationHint = 'wnam' | 'enam' | 'sam' | 'weur' | 'eeur' | 'apac' | 'oc' | 'afr' | 'me'

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId, options?: { locationHint?: DurableObjectLocationHint }): DurableObjectStub
}

interface Request {
  readonly cf?: { continent?: string; colo?: string }
}
