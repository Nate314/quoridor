import { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGameManager } from './games.js';
import { MESSAGE_TYPES } from '../shared/messages.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const manager = createGameManager();
const connections = new Map(); // ws -> { gameId, seat } once the socket has joined a game

// Configure Express routes
app.use(express.static(path.join(__dirname, '../dist')));

// Serve index.html for any routes that don't match static files
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (error) {
      console.error('Error parsing message:', error);
      return;
    }
    try {
      handleMessage(ws, data);
    } catch (error) {
      console.error('Error handling message:', error);
      sendError(ws, 'Something went wrong');
    }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function handleMessage(ws, data) {
  if (data?.type === MESSAGE_TYPES.JOIN_GAME) {
    handleJoinGame(ws, data);
    return;
  }

  const connection = connections.get(ws);
  if (!connection) {
    sendError(ws, 'Join a game first');
    return;
  }

  const { gameId, seat } = connection;
  switch (data?.type) {
    case MESSAGE_TYPES.MAKE_MOVE:
      respond(ws, gameId, manager.move(gameId, seat, data.payload?.move));
      break;
    case MESSAGE_TYPES.REQUEST_UNDO:
      respond(ws, gameId, manager.requestUndo(gameId, seat));
      break;
    case MESSAGE_TYPES.VOTE_UNDO:
      respond(ws, gameId, manager.voteUndo(gameId, seat, data.payload?.approve));
      break;
  }
}

function handleJoinGame(ws, data) {
  if (connections.has(ws)) {
    sendError(ws, 'Already in a game');
    return;
  }

  const result = manager.join(data.gameId, data.playerName);
  if (result.error) {
    sendError(ws, result.error);
    return;
  }

  connections.set(ws, { gameId: result.gameId, seat: result.seat });
  send(ws, MESSAGE_TYPES.GAME_JOINED, { playerNumber: result.seat, gameState: result.state });
  broadcast(result.gameId, result.state);
}

function handleDisconnect(ws) {
  const connection = connections.get(ws);
  if (!connection) return;

  connections.delete(ws);
  const result = manager.leave(connection.gameId, connection.seat);
  if (result) broadcast(connection.gameId, result.state);
}

function respond(ws, gameId, result) {
  if (result.error) {
    sendError(ws, result.error);
  } else {
    broadcast(gameId, result.state);
  }
}

function broadcast(gameId, state) {
  for (const [ws, connection] of connections) {
    if (connection.gameId === gameId) send(ws, MESSAGE_TYPES.GAME_STATE, state);
  }
}

function send(ws, type, payload) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, payload }));
  }
}

function sendError(ws, message) {
  send(ws, MESSAGE_TYPES.GAME_ERROR, { message });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
  console.log('Use Ctrl+C to stop the server');
});
