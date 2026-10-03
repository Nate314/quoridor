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

export function createGameState(gameId) {
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

function without(record, key) {
  const { [key]: _removed, ...rest } = record;
  return rest;
}

// Before the first move, wall counts track the player count and the lowest seat moves first
function withLobbyDefaults(state) {
  const count = wallsPerPlayer(state.activePlayers.length);
  return {
    ...state,
    wallCounts: Object.fromEntries(state.activePlayers.map(seat => [seat, count])),
    currentPlayer: state.activePlayers[0] ?? null
  };
}

export function nextActivePlayer(state, fromSeat) {
  for (let offset = 1; offset <= MAX_PLAYERS; offset++) {
    const seat = ((fromSeat - 1 + offset) % MAX_PLAYERS) + 1;
    if (state.activePlayers.includes(seat)) return seat;
  }
  return null;
}

export function addPlayer(state, name) {
  if (state.started) return { error: 'Game already in progress' };
  if (state.activePlayers.length >= MAX_PLAYERS) return { error: 'Game is full' };

  const seat = Object.keys(SEATS).map(Number).find(s => !state.activePlayers.includes(s));
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

export function removePlayer(state, seat) {
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
  const next = { ...state, activePlayers, gameStatus: `${name} left the game` };
  if (state.isGameOver) return next;

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

export function applyMove(state, seat, move) {
  if (state.isGameOver) return { error: 'The game is over' };
  if (state.activePlayers.length < 2) return { error: 'Waiting for more players' };
  if (state.undoVote) return { error: 'An undo vote is in progress' };
  if (state.currentPlayer !== seat) return { error: 'Not your turn' };

  const name = state.playerNames[seat];
  let next;

  if (move?.type === 'move') {
    const to = { row: move.row, col: move.col };
    if (!getValidMoves(state, seat).some(valid => isSamePosition(valid, to))) {
      return { error: 'Invalid move' };
    }
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
  } else if (move?.type === 'wall') {
    if (state.wallCounts[seat] <= 0) return { error: 'No walls left' };
    const wall = { row: move.row, col: move.col, orientation: move.orientation };
    if (!isValidWallPlacement(state, wall)) return { error: 'Invalid wall placement' };
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
