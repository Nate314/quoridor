// Quoridor rules shared by the browser (move hints, wall previews) and the server (validation).

export const BOARD_SIZE = 9;
export const MAX_PLAYERS = 4;

export const SEATS = {
  1: { start: { row: 8, col: 4 }, goal: { row: 0 }, goalLabel: 'top row' },
  2: { start: { row: 0, col: 4 }, goal: { row: 8 }, goalLabel: 'bottom row' },
  3: { start: { row: 4, col: 0 }, goal: { col: 8 }, goalLabel: 'right column' },
  4: { start: { row: 4, col: 8 }, goal: { col: 0 }, goalLabel: 'left column' }
};

const DIRECTIONS = [
  { row: -1, col: 0 }, // up
  { row: 1, col: 0 },  // down
  { row: 0, col: -1 }, // left
  { row: 0, col: 1 }   // right
];

export function wallsPerPlayer(playerCount) {
  return playerCount <= 2 ? 10 : 5;
}

export function isAtGoal(seat, position) {
  const { goal } = SEATS[seat];
  return goal.row !== undefined ? position.row === goal.row : position.col === goal.col;
}

function isOnBoard({ row, col }) {
  return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
}

function isSamePosition(a, b) {
  return a.row === b.row && a.col === b.col;
}

function isOccupied(pawns, position) {
  return Object.values(pawns).some(pawn => isSamePosition(pawn, position));
}

// `from` and `to` must be orthogonally adjacent squares
export function isBlockedByWall(from, to, walls) {
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

export function getValidMoves(state, seat) {
  const pawn = state.pawns[seat];
  const moves = [];

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

function isWallInBounds(wall) {
  return (wall.orientation === 'horizontal' || wall.orientation === 'vertical') &&
    Number.isInteger(wall.row) && Number.isInteger(wall.col) &&
    wall.row >= 0 && wall.row < BOARD_SIZE - 1 &&
    wall.col >= 0 && wall.col < BOARD_SIZE - 1;
}

function wallsConflict(a, b) {
  if (a.orientation !== b.orientation) {
    return a.row === b.row && a.col === b.col; // Crossing at the same midpoint
  }
  if (a.orientation === 'horizontal') {
    return a.row === b.row && Math.abs(a.col - b.col) <= 1;
  }
  return a.col === b.col && Math.abs(a.row - b.row) <= 1;
}

export function hasPathToGoal(seat, start, walls) {
  const visited = new Set();
  const queue = [start];

  while (queue.length > 0) {
    const square = queue.shift();
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

export function isValidWallPlacement(state, wall) {
  if (!isWallInBounds(wall)) return false;
  if (state.walls.some(existing => wallsConflict(existing, wall))) return false;

  // Every player still in the game must keep a path to their goal edge
  const walls = [...state.walls, wall];
  return state.activePlayers.every(seat => hasPathToGoal(seat, state.pawns[seat], walls));
}
