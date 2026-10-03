import WebSocket, { WebSocketServer } from 'ws';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createGameManager } from './games.ts';
import { MESSAGE_TYPES, asRecord, type ServerMessage } from '../shared/messages.ts';
import type { PublicGameState, Result, Seat } from '../shared/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

type Connection = { gameId: string; seat: Seat };

const manager = createGameManager();
const connections = new Map<WebSocket, Connection>(); // Filled once the socket has joined a game

// Configure Express routes
app.use(express.static(path.join(__dirname, '../dist')));

// Serve index.html for any routes that don't match static files
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    let data: unknown;
    try {
      data = JSON.parse(String(message));
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

  // Without a listener, a malformed frame would crash the process; ws closes the socket itself
  ws.on('error', (error) => console.error('WebSocket error:', error));
});

function handleMessage(ws: WebSocket, data: unknown): void {
  const message = asRecord(data);
  if (message?.type === MESSAGE_TYPES.JOIN_GAME) {
    handleJoinGame(ws, message);
    return;
  }

  const connection = connections.get(ws);
  if (!connection) {
    sendError(ws, 'Join a game first');
    return;
  }

  const { gameId, seat } = connection;
  const payload = asRecord(message?.payload);
  switch (message?.type) {
    case MESSAGE_TYPES.MAKE_MOVE:
      respond(ws, gameId, manager.move(gameId, seat, payload?.move));
      break;
    case MESSAGE_TYPES.REQUEST_UNDO:
      respond(ws, gameId, manager.requestUndo(gameId, seat));
      break;
    case MESSAGE_TYPES.VOTE_UNDO:
      respond(ws, gameId, manager.voteUndo(gameId, seat, payload?.approve));
      break;
  }
}

function handleJoinGame(ws: WebSocket, message: Record<string, unknown>): void {
  if (connections.has(ws)) {
    sendError(ws, 'Already in a game');
    return;
  }

  const result = manager.join(message.gameId, message.playerName);
  if ('error' in result) {
    sendError(ws, result.error);
    return;
  }

  connections.set(ws, { gameId: result.gameId, seat: result.seat });
  send(ws, { type: MESSAGE_TYPES.GAME_JOINED, payload: { playerNumber: result.seat, gameState: result.state } });
  broadcast(result.gameId, result.state);
}

function handleDisconnect(ws: WebSocket): void {
  const connection = connections.get(ws);
  if (!connection) return;

  connections.delete(ws);
  const result = manager.leave(connection.gameId, connection.seat);
  if (result) broadcast(connection.gameId, result.state);
}

function respond(ws: WebSocket, gameId: string, result: Result<PublicGameState>): void {
  if ('error' in result) {
    sendError(ws, result.error);
  } else {
    broadcast(gameId, result.state);
  }
}

function broadcast(gameId: string, state: PublicGameState): void {
  for (const [ws, connection] of connections) {
    if (connection.gameId === gameId) send(ws, { type: MESSAGE_TYPES.GAME_STATE, payload: state });
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function sendError(ws: WebSocket, message: string): void {
  send(ws, { type: MESSAGE_TYPES.GAME_ERROR, payload: { message } });
}

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`WebSocket server active on ws://localhost:${PORT}`);
  console.log('Use Ctrl+C to stop the server');
});
