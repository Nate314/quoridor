import { WebSocketServer } from 'ws';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Game state storage
const games = new Map();  // Store game states
const players = new Map(); // Store player connections

// Configure Express routes
app.use(express.static(path.join(__dirname, '../dist')));

// Serve index.html for any routes that don't match static files
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// WebSocket message types
const MESSAGE_TYPES = {
  JOIN_GAME: 'JOIN_GAME',
  GAME_JOINED: 'GAME_JOINED',
  MAKE_MOVE: 'MAKE_MOVE',
  GAME_STATE: 'GAME_STATE',
  GAME_ERROR: 'GAME_ERROR',
  PLAYER_DISCONNECTED: 'PLAYER_DISCONNECTED'
};

function createGame(gameId) {
  return {
    id: gameId,
    players: [],
    gameState: {
      currentPlayer: 1,
      pawns: {
        1: { row: 8, col: 4 },
        2: { row: 0, col: 4 }
      },
      walls: [],
      wallCounts: {
        1: 10,
        2: 10
      }
    }
  };
}

wss.on('connection', (ws) => {
  const playerId = uuidv4();
  ws.playerId = playerId;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function handleMessage(ws, data) {
  switch (data.type) {
    case MESSAGE_TYPES.JOIN_GAME:
      handleJoinGame(ws, data);
      break;
    case MESSAGE_TYPES.MAKE_MOVE:
      handleMove(ws, data);
      break;
  }
}

function handleJoinGame(ws, data) {
  const { gameId } = data;
  let game = games.get(gameId);

  // Create new game if it doesn't exist
  if (!game) {
    game = createGame(gameId);
    games.set(gameId, game);
  }

  // Check if game is full
  if (game.players.length >= 2) {
    sendError(ws, 'Game is full');
    return;
  }

  // Add player to game
  const playerNumber = game.players.length + 1;
  game.players.push(ws.playerId);
  players.set(ws.playerId, { ws, gameId, playerNumber });

  // Send game joined confirmation
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.GAME_JOINED,
    payload: {
      playerNumber,
      gameState: game.gameState
    }
  }));

  // If game is ready to start, notify both players
  if (game.players.length === 2) {
    broadcastGameState(game);
  }
}

function handleMove(ws, data) {
  const player = players.get(ws.playerId);
  if (!player) return;

  const game = games.get(player.gameId);
  if (!game) return;

  // Verify it's the player's turn
  if (game.gameState.currentPlayer !== player.playerNumber) {
    sendError(ws, 'Not your turn');
    return;
  }

  // Update game state
  const { move } = data.payload;
  if (move.type === 'move') {
    game.gameState.pawns[player.playerNumber] = { row: move.row, col: move.col };
  } else if (move.type === 'wall') {
    game.gameState.walls.push({
      ...move,
      playerNumber: player.playerNumber
    });
    game.gameState.wallCounts[player.playerNumber]--;
  }

  // Switch turns
  game.gameState.currentPlayer = game.gameState.currentPlayer === 1 ? 2 : 1;

  // Broadcast updated state to all players
  broadcastGameState(game);
}

function handleDisconnect(ws) {
  const player = players.get(ws.playerId);
  if (!player) return;

  const game = games.get(player.gameId);
  if (!game) return;

  // Remove player from game
  game.players = game.players.filter(id => id !== ws.playerId);
  players.delete(ws.playerId);

  // Notify remaining player
  if (game.players.length > 0) {
    const remainingPlayer = players.get(game.players[0]);
    if (remainingPlayer) {
      remainingPlayer.ws.send(JSON.stringify({
        type: MESSAGE_TYPES.PLAYER_DISCONNECTED
      }));
    }
  }

  // Clean up empty game
  if (game.players.length === 0) {
    games.delete(player.gameId);
  }
}

function broadcastGameState(game) {
  game.players.forEach(playerId => {
    const player = players.get(playerId);
    if (player) {
      player.ws.send(JSON.stringify({
        type: MESSAGE_TYPES.GAME_STATE,
        payload: game.gameState
      }));
    }
  });
}

function sendError(ws, message) {
  ws.send(JSON.stringify({
    type: MESSAGE_TYPES.GAME_ERROR,
    payload: { message }
  }));
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
  console.log('Use Ctrl+C to stop the server');
});
