import { MESSAGE_TYPES } from '../../shared/messages.js';

class GameService {
  constructor() {
    this.ws = null;
    this.onGameState = null;
    this.onGameJoined = null;
    this.onError = null;
    this.onDisconnect = null;
  }

  connect(gameId, playerName, serverUrl = window.location.host) {
    // Drop any earlier socket, e.g. after a refused join, without reporting a disconnect
    this.disconnect();

    // Use wss:// for https, ws:// for http
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${serverUrl}`);
    this.ws = ws;

    ws.onopen = () => {
      this.send({ type: MESSAGE_TYPES.JOIN_GAME, gameId, playerName });
    };

    ws.onmessage = (event) => {
      this.handleMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onDisconnect?.();
    };
  }

  handleMessage({ type, payload }) {
    switch (type) {
      case MESSAGE_TYPES.GAME_JOINED:
        this.onGameJoined?.(payload);
        break;
      case MESSAGE_TYPES.GAME_STATE:
        this.onGameState?.(payload);
        break;
      case MESSAGE_TYPES.GAME_ERROR:
        this.onError?.(payload.message);
        break;
    }
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  makeMove(move) {
    this.send({ type: MESSAGE_TYPES.MAKE_MOVE, payload: { move } });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

export default new GameService();
