// Data shapes shared by the browser and the server

export type Seat = number; // A player number, 1 to 4

export type Position = { row: number; col: number };

export type Orientation = 'horizontal' | 'vertical';

export type Wall = Position & { orientation: Orientation };

export type PlacedWall = Wall & { playerNumber: Seat };

// A wall as it arrives over the network, before validation
export type WallInput = { row: unknown; col: unknown; orientation: unknown };

export type Move =
  | { type: 'move'; row: number; col: number }
  | { type: 'wall'; row: number; col: number; orientation: Orientation };

export type LastMove =
  | { type: 'move'; playerNumber: Seat; from: Position; to: Position }
  | { type: 'wall'; playerNumber: Seat; row: number; col: number; orientation: Orientation };

export type UndoVote = { requestedBy: Seat; votes: Record<Seat, boolean> };

export type GameState = {
  gameId: string;
  started: boolean;
  currentPlayer: Seat | null;
  activePlayers: Seat[];
  playerNames: Record<Seat, string>;
  pawns: Record<Seat, Position>;
  wallCounts: Record<Seat, number>;
  walls: PlacedWall[];
  lastMove: LastMove | null;
  gameStatus: string;
  isGameOver: boolean;
  winner: Seat | null;
  undoVote: UndoVote | null;
};

// The game state as the server sends it to browsers
export type PublicGameState = GameState & { undoAvailable: boolean };

// The parts of the state that board geometry reads
export type BoardState = { pawns: Record<Seat, Position>; walls: Wall[]; activePlayers: Seat[] };

export type Result<T> = { state: T } | { error: string };
