import type http from 'http';
import { WebSocket as WsWebSocket, WebSocketServer } from 'ws';

export interface WsHub {
  readonly attach: (server: http.Server, path: string) => void;
  readonly broadcastJson: (msg: unknown) => void;
  readonly broadcastFrame: (base64: string, width: number, height: number) => void;
}

interface WsHubState {
  readonly clients: ReadonlySet<WsWebSocket>;
  readonly broadcastCount: number;
  readonly frameCount: number;
}

const INITIAL_STATE: WsHubState = {
  clients: new Set(),
  broadcastCount: 0,
  frameCount: 0,
};

const withClientAdded = (state: WsHubState, client: WsWebSocket): WsHubState => ({
  ...state,
  clients: new Set([...state.clients, client]),
});

const withClientRemoved = (state: WsHubState, client: WsWebSocket): WsHubState => ({
  ...state,
  clients: new Set([...state.clients].filter((entry) => entry !== client)),
});

const withBroadcastTick = (state: WsHubState): WsHubState => ({
  ...state,
  broadcastCount: state.broadcastCount + 1,
});

const withFrameTick = (state: WsHubState): WsHubState => ({
  ...state,
  frameCount: state.frameCount + 1,
});

const sendAndPrune = (
  clients: ReadonlySet<WsWebSocket>,
  payload: string | Buffer,
  removeClient: (client: WsWebSocket) => void,
): void => {
  [...clients]
    .filter((client) => client.readyState === WsWebSocket.OPEN)
    .forEach((client) => {
      client.send(payload, (err) => {
        if (err) removeClient(client);
      });
    });
};

export const createWsHub = (): WsHub => {
  let state = INITIAL_STATE;

  const removeClient = (client: WsWebSocket): void => {
    state = withClientRemoved(state, client);
  };

  const broadcastJson = (msg: unknown): void => {
    state = withBroadcastTick(state);
    if (state.broadcastCount <= 5 || state.broadcastCount % 100 === 0) {
      console.log(`  [ws-broadcast] #${state.broadcastCount} clients=${state.clients.size} type=${(msg as { type?: string })?.type ?? '?'}`);
    }

    sendAndPrune(state.clients, JSON.stringify(msg), removeClient);
  };

  const broadcastFrame = (base64: string, width: number, height: number): void => {
    state = withFrameTick(state);
    if (state.frameCount <= 3 || state.frameCount % 50 === 0) {
      console.log(`  [ws-frame] #${state.frameCount} ${width}x${height} clients=${state.clients.size}`);
    }

    const jpegBytes = Buffer.from(base64, 'base64');
    const header = Buffer.alloc(5);
    header[0] = 0x01;
    header.writeUInt16BE(width, 1);
    header.writeUInt16BE(height, 3);

    sendAndPrune(state.clients, Buffer.concat([header, jpegBytes]), removeClient);
  };

  const attach = (server: http.Server, path: string): void => {
    const wss = new WebSocketServer({ server, path });
    wss.on('connection', (ws) => {
      state = withClientAdded(state, ws);
      console.log(`  [ws-accept] client connected, total=${state.clients.size}`);

      ws.on('close', () => {
        state = withClientRemoved(state, ws);
        console.log(`  [ws-close] client disconnected, remaining=${state.clients.size}`);
      });
      ws.on('error', () => {
        state = withClientRemoved(state, ws);
      });
      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch {
          // Ignore malformed client messages.
        }
      });
    });
  };

  return {
    attach,
    broadcastJson,
    broadcastFrame,
  };
};
