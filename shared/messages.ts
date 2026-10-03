import type { Move, PublicGameState, Seat } from './types.ts';

// WebSocket message types shared by the browser and the server
export const MESSAGE_TYPES = {
  JOIN_GAME: 'JOIN_GAME',
  GAME_JOINED: 'GAME_JOINED',
  MAKE_MOVE: 'MAKE_MOVE',
  REQUEST_UNDO: 'REQUEST_UNDO',
  VOTE_UNDO: 'VOTE_UNDO',
  GAME_STATE: 'GAME_STATE',
  GAME_ERROR: 'GAME_ERROR'
} as const;

export type ClientMessage =
  | { type: typeof MESSAGE_TYPES.JOIN_GAME; gameId: string; playerName: string }
  | { type: typeof MESSAGE_TYPES.MAKE_MOVE; payload: { move: Move } }
  | { type: typeof MESSAGE_TYPES.REQUEST_UNDO }
  | { type: typeof MESSAGE_TYPES.VOTE_UNDO; payload: { approve: boolean } };

export type ServerMessage =
  | { type: typeof MESSAGE_TYPES.GAME_JOINED; payload: { playerNumber: Seat; gameState: PublicGameState } }
  | { type: typeof MESSAGE_TYPES.GAME_STATE; payload: PublicGameState }
  | { type: typeof MESSAGE_TYPES.GAME_ERROR; payload: { message: string } };

// Reads untrusted data as an object whose fields are all still unchecked, or null if it is not an object
export function asRecord(value: unknown): Record<string, unknown> | null {
  // Any non-null object can be read field by field; each field stays `unknown`
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}
