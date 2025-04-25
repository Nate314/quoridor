class GameService {
  constructor() {
    this.ws = null;
    this.gameId = null;
    this.playerNumber = null;
    this.onGameState = null;
    this.onGameJoined = null;
    this.onError = null;
    this.onDisconnect = null;
  }

  connect(gameId, serverUrl = window.location.host) {
    this.gameId = gameId;
    // Use wss:// for https, ws:// for http
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.ws = new WebSocket(`${protocol}//${serverUrl}`);

    this.ws.onopen = () => {
      this.ws.send(JSON.stringify({
        type: 'JOIN_GAME',
        gameId
      }));
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.handleMessage(data);
    };

    this.ws.onclose = () => {
      if (this.onDisconnect) {
        this.onDisconnect();
      }
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case 'GAME_JOINED':
        this.playerNumber = data.payload.playerNumber;
        if (this.onGameJoined) {
          this.onGameJoined(data.payload);
        }
        break;

      case 'GAME_STATE':
        if (this.onGameState) {
          this.onGameState(data.payload);
        }
        break;

      case 'GAME_ERROR':
        if (this.onError) {
          this.onError(data.payload.message);
        }
        break;

      case 'PLAYER_DISCONNECTED':
        if (this.onDisconnect) {
          this.onDisconnect();
        }
        break;
    }
  }

  makeMove(move) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'MAKE_MOVE',
        payload: { move }
      }));
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

export default new GameService();
