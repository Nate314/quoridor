import { MESSAGE_TYPES, type ClientMessage, type ServerMessage } from '../../shared/messages.ts';
import type { Move, PublicGameState, Seat } from '../../shared/types.ts';

type GameJoined = { playerNumber: Seat; gameState: PublicGameState };

class GameService {
  ws: WebSocket | null;
  onGameState: ((state: PublicGameState) => void) | null;
  onGameJoined: ((data: GameJoined) => void) | null;
  onError: ((message: string) => void) | null;
  onDisconnect: (() => void) | null;

  constructor() {
    this.ws = null;
    this.onGameState = null;
    this.onGameJoined = null;
    this.onError = null;
    this.onDisconnect = null;
  }

  connect(gameId: string, playerName: string, serverUrl = window.location.host): void {
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
      // Our own server only sends ServerMessage shapes
      this.handleMessage(JSON.parse(event.data) as ServerMessage);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onDisconnect?.();
    };
  }

  handleMessage(message: ServerMessage): void {
    switch (message.type) {
      case MESSAGE_TYPES.GAME_JOINED:
        this.onGameJoined?.(message.payload);
        break;
      case MESSAGE_TYPES.GAME_STATE:
        this.onGameState?.(message.payload);
        break;
      case MESSAGE_TYPES.GAME_ERROR:
        this.onError?.(message.payload.message);
        break;
    }
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  makeMove(move: Move): void {
    this.send({ type: MESSAGE_TYPES.MAKE_MOVE, payload: { move } });
  }

  requestUndo(): void {
    this.send({ type: MESSAGE_TYPES.REQUEST_UNDO });
  }

  voteUndo(approve: boolean): void {
    this.send({ type: MESSAGE_TYPES.VOTE_UNDO, payload: { approve } });
  }

  disconnect(): void {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

export default new GameService();
