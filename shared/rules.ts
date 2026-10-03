// Quoridor rules shared by the browser (move hints, wall previews) and the server (validation).
import { asRecord } from './messages.ts';
import type { BoardState, GameState, Position, Result, Seat, Wall, WallInput } from './types.ts';

export const BOARD_SIZE = 9;
export const MAX_PLAYERS = 4;

type SeatInfo = { start: Position; goal: { row: number } | { col: number }; goalLabel: string };

export const SEATS: Record<Seat, SeatInfo> = {
  1: { start: { row: 8, col: 4 }, goal: { row: 0 }, goalLabel: 'top row' },
  2: { start: { row: 0, col: 4 }, goal: { row: 8 }, goalLabel: 'bottom row' },
  3: { start: { row: 4, col: 0 }, goal: { col: 8 }, goalLabel: 'right column' },
  4: { start: { row: 4, col: 8 }, goal: { col: 0 }, goalLabel: 'left column' }
};

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 }, // up
  { row: 1, col: 0 },  // down
  { row: 0, col: -1 }, // left
  { row: 0, col: 1 }   // right
];

export function wallsPerPlayer(playerCount: number): number {
  return playerCount <= 2 ? 10 : 5;
}

export function isAtGoal(seat: Seat, position: Position): boolean {
  const { goal } = SEATS[seat];
  return 'row' in goal ? position.row === goal.row : position.col === goal.col;
}

function isOnBoard({ row, col }: Position): boolean {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isSamePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isOccupied(pawns: Record<Seat, Position>, position: Position): boolean {
  return Object.values(pawns).some(pawn => isSamePosition(pawn, position));
}

// `from` and `to` must be orthogonally adjacent squares
export function isBlockedByWall(from: Position, to: Position, walls: Wall[]): boolean {
  if (from.col === to.col) {
    const row = Math.min(from.row, to.row);
    return walls.some(wall =>
      wall.orientation === 'horizontal' &&
      wall.row === row &&
      (wall.col === from.col - 1 || wall.col === from.col)  // Check both squares covered by wall
    );
  }
  const col = Math.min(from.col, to.col);
  return walls.some(wall =>
    wall.orientation === 'vertical' &&
    wall.col === col &&
    (wall.row === from.row - 1 || wall.row === from.row)  // Check both squares covered by wall
  );
}

export function getValidMoves(state: BoardState, seat: Seat): Position[] {
  const pawn = state.pawns[seat];
  const moves: Position[] = [];

  for (const dir of DIRECTIONS) {
    const step = { row: pawn.row + dir.row, col: pawn.col + dir.col };
    if (!isOnBoard(step) || isBlockedByWall(pawn, step, state.walls)) continue;

    if (!isOccupied(state.pawns, step)) {
      moves.push(step);
      continue;
    }

    // Jump straight over the adjacent pawn if the square beyond is free and reachable
    const jump = { row: step.row + dir.row, col: step.col + dir.col };
    if (isOnBoard(jump) && !isBlockedByWall(step, jump, state.walls) && !isOccupied(state.pawns, jump)) {
      moves.push(jump);
    }
  }

  return moves;
}

export function isWallInBounds(wall: WallInput): wall is Wall {
  const { row, col, orientation } = wall;
  return (orientation === 'horizontal' || orientation === 'vertical') &&
    typeof row === 'number' && typeof col === 'number' &&
    Number.isInteger(row) && Number.isInteger(col) &&
    row >= 0 && row < BOARD_SIZE - 1 &&
    col >= 0 && col < BOARD_SIZE - 1;
}

function wallsConflict(a: Wall, b: Wall): boolean {
  if (a.orientation !== b.orientation) {
    return a.row === b.row && a.col === b.col; // Crossing at the same midpoint
  }
  if (a.orientation === 'horizontal') {
    return a.row === b.row && Math.abs(a.col - b.col) <= 1;
  }
  return a.col === b.col && Math.abs(a.row - b.row) <= 1;
}

export function hasPathToGoal(seat: Seat, start: Position, walls: Wall[]): boolean {
  const visited = new Set<string>();
  const queue: Position[] = [start];

  while (queue.length > 0) {
    const square = queue.shift() as Position; // The loop condition guarantees an element
    const key = `${square.row},${square.col}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (isAtGoal(seat, square)) return true;

    for (const dir of DIRECTIONS) {
      const next = { row: square.row + dir.row, col: square.col + dir.col };
      if (isOnBoard(next) && !isBlockedByWall(square, next, walls)) {
        queue.push(next);
      }
    }
  }

  return false;
}

export function isValidWallPlacement(state: BoardState, wall: WallInput): boolean {
  if (!isWallInBounds(wall)) return false;
  const placed: Wall = wall;
  if (state.walls.some(existing => wallsConflict(existing, placed))) return false;

  // Every player still in the game must keep a path to their goal edge
  const walls = [...state.walls, placed];
  return state.activePlayers.every(seat => hasPathToGoal(seat, state.pawns[seat], walls));
}

export function createGameState(gameId: string): GameState {
  return {
    gameId,
    started: false,
    currentPlayer: null,
    activePlayers: [],
    playerNames: {},
    pawns: {},
    wallCounts: {},
    walls: [],
    lastMove: null,
    gameStatus: '',
    isGameOver: false,
    winner: null,
    undoVote: null
  };
}

function without<T>(record: Record<Seat, T>, key: Seat): Record<Seat, T> {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

// Before the first move, wall counts track the player count and the lowest seat moves first
function withLobbyDefaults(state: GameState): GameState {
  const count = wallsPerPlayer(state.activePlayers.length);
  return {
    ...state,
    wallCounts: Object.fromEntries(state.activePlayers.map(seat => [seat, count])),
    currentPlayer: state.activePlayers[0] ?? null
  };
}

export function nextActivePlayer(state: Pick<GameState, 'activePlayers'>, fromSeat: Seat): Seat | null {
  for (let offset = 1; offset <= MAX_PLAYERS; offset++) {
    const seat = ((fromSeat - 1 + offset) % MAX_PLAYERS) + 1;
    if (state.activePlayers.includes(seat)) return seat;
  }
  return null;
}

export function addPlayer(state: GameState, name: string): { state: GameState; seat: Seat } | { error: string } {
  if (state.started) return { error: 'Game already in progress' };
  if (state.activePlayers.length >= MAX_PLAYERS) return { error: 'Game is full' };

  const seat = Object.keys(SEATS).map(Number).find(s => !state.activePlayers.includes(s));
  if (seat === undefined) return { error: 'Game is full' }; // Unreachable: fewer than MAX_PLAYERS seats are taken
  const activePlayers = [...state.activePlayers, seat].sort((a, b) => a - b);
  const next = withLobbyDefaults({
    ...state,
    activePlayers,
    playerNames: { ...state.playerNames, [seat]: name },
    pawns: { ...state.pawns, [seat]: SEATS[seat].start },
    gameStatus: `${name} joined (${activePlayers.length}/${MAX_PLAYERS} players)`
  });
  return { state: next, seat };
}

export function removePlayer(state: GameState, seat: Seat): GameState {
  const name = state.playerNames[seat];
  const activePlayers = state.activePlayers.filter(s => s !== seat);

  if (!state.started) {
    return withLobbyDefaults({
      ...state,
      activePlayers,
      playerNames: without(state.playerNames, seat),
      pawns: without(state.pawns, seat),
      gameStatus: `${name} left`
    });
  }

  // Mid-game: the pawn and walls stay, the seat is skipped from now on
  const next: GameState = { ...state, activePlayers, gameStatus: `${name} left the game` };
  if (state.isGameOver) return activePlayers.length < 2 ? { ...next, undoVote: null } : next;

  if (activePlayers.length === 1) {
    const winner = activePlayers[0];
    return {
      ...next,
      isGameOver: true,
      winner,
      undoVote: null,
      gameStatus: `${state.playerNames[winner]} wins! Everyone else left.`
    };
  }

  if (state.currentPlayer === seat) {
    next.currentPlayer = nextActivePlayer(next, seat);
  }
  return next;
}

export function applyMove(state: GameState, seat: Seat, move: unknown): Result<GameState> {
  if (state.isGameOver) return { error: 'The game is over' };
  if (state.activePlayers.length < 2) return { error: 'Waiting for more players' };
  if (state.undoVote) return { error: 'An undo vote is in progress' };
  if (state.currentPlayer !== seat) return { error: 'Not your turn' };

  const input = asRecord(move);
  const name = state.playerNames[seat];
  let next: GameState;

  if (input?.type === 'move') {
    const to = getValidMoves(state, seat).find(valid => valid.row === input.row && valid.col === input.col);
    if (!to) return { error: 'Invalid move' };
    next = {
      ...state,
      pawns: { ...state.pawns, [seat]: to },
      lastMove: { type: 'move', playerNumber: seat, from: state.pawns[seat], to },
      gameStatus: `${name} moved`
    };
    if (isAtGoal(seat, to)) {
      next.isGameOver = true;
      next.winner = seat;
      next.gameStatus = `${name} wins!`;
    }
  } else if (input?.type === 'wall') {
    if (state.wallCounts[seat] <= 0) return { error: 'No walls left' };
    const wall = { row: input.row, col: input.col, orientation: input.orientation };
    if (!isWallInBounds(wall) || !isValidWallPlacement(state, wall)) return { error: 'Invalid wall placement' };
    next = {
      ...state,
      walls: [...state.walls, { ...wall, playerNumber: seat }],
      wallCounts: { ...state.wallCounts, [seat]: state.wallCounts[seat] - 1 },
      lastMove: { type: 'wall', playerNumber: seat, ...wall },
      gameStatus: `${name} placed a wall`
    };
  } else {
    return { error: 'Unknown move type' };
  }

  next.started = true; // Locks joining and freezes wall counts
  if (!next.isGameOver) {
    next.currentPlayer = nextActivePlayer(next, seat);
  }
  return { state: next };
}
