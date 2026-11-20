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

interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}
