# Four Players, Undo Vote, and Game ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support 2 to 4 players per game with a server that validates moves, a unanimous undo vote, a lobby that locks on the first move, and the Game ID on screen.

**Architecture:** Pure rules move out of `src/components/Game.jsx` into `shared/rules.js`, imported by both the React client and the Node server. A new `server/games.js` manages games, undo history, and votes over plain objects so it can be unit tested; `server/server.js` shrinks to Express plus WebSocket plumbing. The client renders server state and uses the shared rules only for hints and previews.

**Tech Stack:** React 19, Vite 6, Express 5, `ws` 8, Node 22 built-in test runner (`node:test`, `node:assert/strict`).

**Spec:** `docs/superpowers/specs/2026-10-02-four-players-and-undo-vote-design.md`

## Global Constraints

- No new npm dependencies. Tests use `node --test` (Node 22.22.3 is installed).
- Work on branch `four-players-undo-vote`. Never commit to `master`.
- Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No em-dashes in any prose: docs, README, commit messages, UI strings.
- Max 4 players. Walls per player: 10 with 2 players, 5 with 3 or 4.
- Seats: 1 starts (8,4) goal row 0; 2 starts (0,4) goal row 8; 3 starts (4,0) goal column 8; 4 starts (4,8) goal column 0.
- The page must not get taller: it already clips below about 886px of viewport height. New UI either overlays (vote panel, Game ID badge) or reuses existing lines.
- ESM everywhere (`"type": "module"` in `package.json`). Shared files are imported with relative paths and explicit `.js` extensions.

## Review Focus

1. Malformed client messages (missing `move`, unknown move type, wall off the board or with a bad orientation, string coordinates, `null` JSON) are rejected with an error and never crash the server or change state. Pinned in Task 2 (`rejects malformed and illegal moves`) and Task 4 (smoke script sends garbage).
2. A Game ID or name with surrounding spaces joins the same game under the trimmed value; a blank name is refused. Pinned in Task 3 (`join trims the game ID and name and rejects blanks`) and Task 5 (client trims before sending).
3. Retrying Join after a refusal ("Game is full" or "Game already in progress") with a different Game ID works, and the user is not bounced to "Disconnected from server" by the abandoned socket. Pinned in Task 5, Step 6.
4. Two approvals arriving back to back, or a double click on Approve, apply the undo exactly once. Pinned in Task 3 (`an undo approved by everyone restores the previous turn` checks the follow-up vote is refused and only one history entry was used).
5. A player leaving on their own turn, or during a vote, never leaves the game stuck. Pinned in Task 2 (`turns skip players who left`) and Task 3 (`a player leaving during a vote no longer counts`, `an undo returning the turn to a departed player skips them`).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `shared/rules.js` | Create | Board geometry, seats, legal moves and walls, game state transitions |
| `shared/rules.test.js` | Create | Unit tests for `shared/rules.js` |
| `shared/messages.js` | Create | WebSocket message type names used by client and server |
| `server/games.js` | Create | Game registry, undo history, undo voting |
| `server/games.test.js` | Create | Unit tests for `server/games.js` |
| `server/server.js` | Rewrite | Express static hosting, WebSocket connections, message routing, broadcasting |
| `src/services/gameService.js` | Rewrite | Browser WebSocket client |
| `src/components/Game.jsx` | Rewrite | Join form, board, info panel; uses `shared/rules.js` for hints |
| `src/components/UndoVote.jsx` | Create | Undo vote overlay |
| `src/App.css` | Modify | Game ID badge, pawn colours 3 and 4, departed players, vote panel |
| `package.json` | Modify | `test` script |
| `docs/architecture.md`, `README.md` | Modify | Describe 4 players, server validation, undo voting |

---

### Task 1: Board geometry rules

**Files:**
- Create: `shared/rules.js`
- Create: `shared/rules.test.js`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces (all exported from `shared/rules.js`):
  - `BOARD_SIZE = 9`, `MAX_PLAYERS = 4`
  - `SEATS: { [seat: 1|2|3|4]: { start: {row, col}, goal: {row} | {col}, goalLabel: string } }`
  - `wallsPerPlayer(playerCount: number): number`
  - `isAtGoal(seat: number, position: {row, col}): boolean`
  - `isBlockedByWall(from: {row, col}, to: {row, col}, walls: Wall[]): boolean` where `Wall = { row, col, orientation: 'horizontal' | 'vertical' }`
  - `getValidMoves(state: { pawns: {[seat]: {row, col}}, walls: Wall[] }, seat: number): {row, col}[]`
  - `hasPathToGoal(seat: number, start: {row, col}, walls: Wall[]): boolean`
  - `isValidWallPlacement(state: { pawns, walls, activePlayers: number[] }, wall: Wall): boolean`

- [ ] **Step 1: Add the test script**

In `package.json`, add `"test": "node --test"` to `scripts`, after `"start"`:

```json
    "start": "npm run build && node server/server.js",
    "test": "node --test"
```

- [ ] **Step 2: Write the failing tests**

Create `shared/rules.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wallsPerPlayer,
  isAtGoal,
  getValidMoves,
  hasPathToGoal,
  isValidWallPlacement
} from './rules.js';

// Minimal state for geometry checks: only pawns, walls and activePlayers are read
function board({ pawns, walls = [], activePlayers = Object.keys(pawns).map(Number) }) {
  return { pawns, walls, activePlayers };
}

const at = (row, col) => ({ row, col });
const hWall = (row, col) => ({ row, col, orientation: 'horizontal' });
const vWall = (row, col) => ({ row, col, orientation: 'vertical' });

test('wall count depends on player count', () => {
  assert.equal(wallsPerPlayer(2), 10);
  assert.equal(wallsPerPlayer(3), 5);
  assert.equal(wallsPerPlayer(4), 5);
});

test('each seat has its own goal edge', () => {
  assert.equal(isAtGoal(1, at(0, 3)), true);
  assert.equal(isAtGoal(1, at(1, 0)), false);
  assert.equal(isAtGoal(2, at(8, 0)), true);
  assert.equal(isAtGoal(3, at(2, 8)), true);
  assert.equal(isAtGoal(3, at(8, 0)), false);
  assert.equal(isAtGoal(4, at(6, 0)), true);
});

test('a pawn steps one square and not off the board', () => {
  const state = board({ pawns: { 1: at(8, 4) } });
  assert.deepEqual(getValidMoves(state, 1), [at(7, 4), at(8, 3), at(8, 5)]);
});

test('a pawn jumps straight over an adjacent pawn', () => {
  const state = board({ pawns: { 1: at(8, 4), 2: at(7, 4) } });
  assert.deepEqual(getValidMoves(state, 1), [at(6, 4), at(8, 3), at(8, 5)]);
});

test('no jump when the landing square holds another pawn', () => {
  const state = board({ pawns: { 1: at(8, 4), 2: at(7, 4), 3: at(6, 4) } });
  assert.deepEqual(getValidMoves(state, 1), [at(8, 3), at(8, 5)]);
});

test('no jump when a wall is behind the pawn', () => {
  const state = board({ pawns: { 1: at(8, 4), 2: at(7, 4) }, walls: [hWall(6, 4)] });
  assert.deepEqual(getValidMoves(state, 1), [at(8, 3), at(8, 5)]);
});

test('walls block steps in both orientations', () => {
  const horizontal = board({ pawns: { 1: at(8, 4) }, walls: [hWall(7, 3)] });
  assert.deepEqual(getValidMoves(horizontal, 1), [at(8, 3), at(8, 5)]);

  const vertical = board({ pawns: { 3: at(4, 0) }, walls: [vWall(3, 0)] });
  assert.deepEqual(getValidMoves(vertical, 3), [at(3, 0), at(5, 0)]);
});

test('wall placement rejects overlaps, crossings, and bad coordinates', () => {
  const state = board({ pawns: { 1: at(8, 4), 2: at(0, 4) }, walls: [hWall(3, 3)] });
  assert.equal(isValidWallPlacement(state, hWall(3, 4)), false);
  assert.equal(isValidWallPlacement(state, hWall(3, 2)), false);
  assert.equal(isValidWallPlacement(state, vWall(3, 3)), false);
  assert.equal(isValidWallPlacement(state, hWall(8, 0)), false);
  assert.equal(isValidWallPlacement(state, hWall(-1, 0)), false);
  assert.equal(isValidWallPlacement(state, { row: 0, col: 0, orientation: 'diagonal' }), false);
  assert.equal(isValidWallPlacement(state, { row: '1', col: 0, orientation: 'horizontal' }), false);
  assert.equal(isValidWallPlacement(state, hWall(3, 5)), true);
  assert.equal(isValidWallPlacement(state, vWall(2, 3)), true);
});

test('a wall may not seal in an active player, but may seal in one who left', () => {
  // Player 3 at (4,0) is boxed into rows 3-4 of column 0 once the wall below is added
  const pawns = { 1: at(8, 4), 2: at(0, 4), 3: at(4, 0) };
  const walls = [hWall(2, 0), vWall(3, 0)];
  assert.equal(isValidWallPlacement(board({ pawns, walls, activePlayers: [1, 2, 3] }), hWall(4, 0)), false);
  assert.equal(isValidWallPlacement(board({ pawns, walls, activePlayers: [1, 2] }), hWall(4, 0)), true);
});

test('paths to a column goal are found', () => {
  assert.equal(hasPathToGoal(4, at(4, 8), []), true);
  assert.equal(hasPathToGoal(3, at(4, 0), [hWall(2, 0), vWall(3, 0), hWall(4, 0)]), false);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` for `shared/rules.js`.

- [ ] **Step 4: Implement the geometry**

Create `shared/rules.js`:

```js
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 10 tests, 0 failures.

- [ ] **Step 6: Lint**

Run: `npx eslint shared`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add package.json shared/rules.js shared/rules.test.js
git commit -F - <<'EOF'
Add shared board geometry rules for up to four players

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Game state transitions

**Files:**
- Modify: `shared/rules.js` (append)
- Modify: `shared/rules.test.js` (append)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces (exported from `shared/rules.js`):
  - `createGameState(gameId: string): GameState` with fields `gameId, started, currentPlayer, activePlayers, playerNames, pawns, wallCounts, walls, lastMove, gameStatus, isGameOver, winner, undoVote`
  - `addPlayer(state, name: string): { state, seat } | { error }` with errors `'Game already in progress'`, `'Game is full'`
  - `removePlayer(state, seat: number): GameState`
  - `nextActivePlayer(state, fromSeat: number): number | null`
  - `applyMove(state, seat: number, move): { state } | { error }` where `move` is `{ type: 'move', row, col }` or `{ type: 'wall', row, col, orientation }`. Errors: `'The game is over'`, `'Waiting for more players'`, `'An undo vote is in progress'`, `'Not your turn'`, `'Invalid move'`, `'No walls left'`, `'Invalid wall placement'`, `'Unknown move type'`.
  - `lastMove` shapes: `{ type: 'move', playerNumber, from, to }` and `{ type: 'wall', playerNumber, row, col, orientation }` (unchanged from today).
  - `undoVote` is `null` or `{ requestedBy: seat, votes: { [seat]: true } }` (set by Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `shared/rules.test.js`. First extend the import at the top of the file to:

```js
import {
  SEATS,
  wallsPerPlayer,
  isAtGoal,
  getValidMoves,
  hasPathToGoal,
  isValidWallPlacement,
  createGameState,
  addPlayer,
  removePlayer,
  applyMove
} from './rules.js';
```

Then append:

```js
function lobby(...names) {
  let state = createGameState('g1');
  for (const name of names) state = addPlayer(state, name).state;
  return state;
}

function play(state, seat, move) {
  const result = applyMove(state, seat, move);
  assert.equal(result.error, undefined, result.error);
  return result.state;
}

const step = (row, col) => ({ type: 'move', row, col });

test('players take seats in order on their start squares', () => {
  const state = lobby('A', 'B', 'C', 'D');
  assert.deepEqual(state.activePlayers, [1, 2, 3, 4]);
  assert.deepEqual(state.playerNames, { 1: 'A', 2: 'B', 3: 'C', 4: 'D' });
  for (const seat of [1, 2, 3, 4]) assert.deepEqual(state.pawns[seat], SEATS[seat].start);
  assert.equal(state.currentPlayer, 1);
  assert.equal(state.gameStatus, 'D joined (4/4 players)');
});

test('lobby wall counts follow the player count', () => {
  let state = lobby('A', 'B');
  assert.deepEqual(state.wallCounts, { 1: 10, 2: 10 });
  state = addPlayer(state, 'C').state;
  assert.deepEqual(state.wallCounts, { 1: 5, 2: 5, 3: 5 });
  state = removePlayer(state, 3);
  assert.deepEqual(state.wallCounts, { 1: 10, 2: 10 });
});

test('a freed lobby seat is reused and the lowest seat moves first', () => {
  let state = removePlayer(lobby('A', 'B', 'C'), 1);
  assert.equal(state.currentPlayer, 2);
  assert.equal(state.pawns[1], undefined);
  assert.equal(state.gameStatus, 'A left');
  const result = addPlayer(state, 'D');
  assert.equal(result.seat, 1);
  assert.equal(result.state.currentPlayer, 1);
});

test('a fifth player is refused', () => {
  assert.deepEqual(addPlayer(lobby('A', 'B', 'C', 'D'), 'E'), { error: 'Game is full' });
});

test('joining is refused after the first move and wall counts freeze', () => {
  const state = play(lobby('A', 'B'), 1, step(7, 4));
  assert.equal(state.started, true);
  assert.deepEqual(addPlayer(state, 'C'), { error: 'Game already in progress' });
  assert.deepEqual(state.wallCounts, { 1: 10, 2: 10 });
});

test('moves need at least two players', () => {
  assert.deepEqual(applyMove(lobby('A'), 1, step(7, 4)), { error: 'Waiting for more players' });
});

test('rejects malformed and illegal moves', () => {
  const state = lobby('A', 'B');
  assert.deepEqual(applyMove(state, 2, step(1, 4)), { error: 'Not your turn' });
  assert.deepEqual(applyMove(state, 1, step(6, 4)), { error: 'Invalid move' });
  assert.deepEqual(applyMove(state, 1, { type: 'move', row: '7', col: '4' }), { error: 'Invalid move' });
  assert.deepEqual(applyMove(state, 1, undefined), { error: 'Unknown move type' });
  assert.deepEqual(applyMove(state, 1, { type: 'teleport' }), { error: 'Unknown move type' });
  assert.deepEqual(
    applyMove(state, 1, { type: 'wall', row: 8, col: 0, orientation: 'horizontal' }),
    { error: 'Invalid wall placement' }
  );
});

test('a pawn move updates position, last move, status and turn', () => {
  const state = play(lobby('A', 'B'), 1, step(7, 4));
  assert.deepEqual(state.pawns[1], { row: 7, col: 4 });
  assert.deepEqual(state.lastMove, { type: 'move', playerNumber: 1, from: { row: 8, col: 4 }, to: { row: 7, col: 4 } });
  assert.equal(state.gameStatus, 'A moved');
  assert.equal(state.currentPlayer, 2);
});

test('a wall uses one wall and records the last move', () => {
  const state = play(lobby('A', 'B'), 1, { type: 'wall', row: 3, col: 3, orientation: 'horizontal' });
  assert.equal(state.wallCounts[1], 9);
  assert.deepEqual(state.walls, [{ row: 3, col: 3, orientation: 'horizontal', playerNumber: 1 }]);
  assert.deepEqual(state.lastMove, { type: 'wall', playerNumber: 1, row: 3, col: 3, orientation: 'horizontal' });
  assert.equal(state.gameStatus, 'A placed a wall');
});

test('a player with no walls left cannot place one', () => {
  const state = { ...lobby('A', 'B'), wallCounts: { 1: 0, 2: 10 } };
  assert.deepEqual(
    applyMove(state, 1, { type: 'wall', row: 3, col: 3, orientation: 'horizontal' }),
    { error: 'No walls left' }
  );
});

test('reaching the goal edge wins, for every seat', () => {
  const cases = { 1: [at(1, 2), at(0, 2)], 2: [at(7, 2), at(8, 2)], 3: [at(2, 7), at(2, 8)], 4: [at(2, 1), at(2, 0)] };
  for (const [seat, [from, to]] of Object.entries(cases).map(([s, c]) => [Number(s), c])) {
    const base = lobby('A', 'B', 'C', 'D');
    const state = play({ ...base, currentPlayer: seat, pawns: { ...base.pawns, [seat]: from } }, seat, { type: 'move', ...to });
    assert.equal(state.isGameOver, true);
    assert.equal(state.winner, seat);
    assert.equal(state.gameStatus, `${state.playerNames[seat]} wins!`);
    assert.deepEqual(applyMove(state, seat, step(from.row, from.col)), { error: 'The game is over' });
  }
});

test('turns skip players who left', () => {
  let state = play(lobby('A', 'B', 'C'), 1, step(7, 4));
  assert.equal(state.currentPlayer, 2);
  state = removePlayer(state, 2);
  assert.equal(state.currentPlayer, 3);
  assert.equal(state.gameStatus, 'B left the game');
  assert.deepEqual(state.pawns[2], { row: 0, col: 4 });
  assert.equal(state.playerNames[2], 'B');
  state = play(state, 3, step(4, 1));
  assert.equal(state.currentPlayer, 1);
});

test('the last connected player wins', () => {
  const state = removePlayer(play(lobby('A', 'B'), 1, step(7, 4)), 1);
  assert.equal(state.isGameOver, true);
  assert.equal(state.winner, 2);
  assert.equal(state.gameStatus, 'B wins! Everyone else left.');
});

test('moves are blocked while an undo vote is open', () => {
  const state = { ...lobby('A', 'B'), undoVote: { requestedBy: 2, votes: { 2: true } } };
  assert.deepEqual(applyMove(state, 1, step(7, 4)), { error: 'An undo vote is in progress' });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `SyntaxError: The requested module './rules.js' does not provide an export named 'createGameState'`.

- [ ] **Step 3: Implement the state transitions**

Append to `shared/rules.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 24 tests, 0 failures.

- [ ] **Step 5: Lint**

Run: `npx eslint shared`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add shared/rules.js shared/rules.test.js
git commit -F - <<'EOF'
Add shared game state transitions for joining, leaving and moves

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Game manager with undo history and voting

**Files:**
- Create: `server/games.js`
- Create: `server/games.test.js`

**Interfaces:**
- Consumes: `createGameState`, `addPlayer`, `removePlayer`, `applyMove`, `nextActivePlayer` from `shared/rules.js`.
- Produces: `createGameManager()` returning an object with:
  - `join(gameId, playerName): { gameId: string, seat: number, state } | { error }` (trims both; errors `'Please enter a game ID'`, `'Please enter your name'`, plus `addPlayer` errors)
  - `leave(gameId, seat): { state } | null` (`null` when the game was deleted or the player was unknown)
  - `move(gameId, seat, move): { state } | { error }`
  - `requestUndo(gameId, seat): { state } | { error }`
  - `voteUndo(gameId, seat, approve): { state } | { error }`
  - `getState(gameId): state | undefined`
  - Every returned `state` is the game state plus `undoAvailable: boolean` (true when the undo history is not empty).
  - Shared errors: `'Game not found'`, `'You are not in this game'`. Undo errors: `'Nothing to undo'`, `'An undo vote is already in progress'`, `'Not enough players to vote'`, `'No undo vote in progress'`, `'You already voted'`.

- [ ] **Step 1: Write the failing tests**

Create `server/games.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGameManager } from './games.js';

const step = (row, col) => ({ type: 'move', row, col });

function gameWith(...names) {
  const manager = createGameManager();
  for (const name of names) manager.join('g1', name);
  return manager;
}

function ok(result) {
  assert.equal(result.error, undefined, result.error);
  return result.state;
}

test('join trims the game ID and name and rejects blanks', () => {
  const manager = createGameManager();
  const first = manager.join('  g1 ', ' Alice ');
  assert.equal(first.gameId, 'g1');
  assert.equal(first.seat, 1);
  assert.equal(first.state.playerNames[1], 'Alice');
  assert.equal(manager.join('g1', 'Bob').seat, 2);
  assert.deepEqual(manager.join('   ', 'X'), { error: 'Please enter a game ID' });
  assert.deepEqual(manager.join('g1', '   '), { error: 'Please enter your name' });
});

test('join is refused at four players and after the first move', () => {
  assert.deepEqual(gameWith('A', 'B', 'C', 'D').join('g1', 'E'), { error: 'Game is full' });

  const manager = gameWith('A', 'B');
  ok(manager.move('g1', 1, step(7, 4)));
  assert.deepEqual(manager.join('g1', 'C'), { error: 'Game already in progress' });
});

test('leaving the lobby frees the seat and the last one out deletes the game', () => {
  const manager = gameWith('A', 'B');
  assert.deepEqual(manager.leave('g1', 1).state.activePlayers, [2]);
  assert.equal(manager.join('g1', 'C').seat, 1);
  manager.leave('g1', 1);
  assert.equal(manager.leave('g1', 2), null);
  assert.equal(manager.getState('g1'), undefined);
});

test('moves are validated and recorded for undo', () => {
  const manager = gameWith('A', 'B');
  assert.equal(manager.getState('g1').undoAvailable, false);
  assert.deepEqual(manager.move('g1', 2, step(1, 4)), { error: 'Not your turn' });
  assert.deepEqual(manager.move('g1', 3, step(1, 4)), { error: 'You are not in this game' });
  assert.deepEqual(manager.move('nope', 1, step(7, 4)), { error: 'Game not found' });
  assert.equal(ok(manager.move('g1', 1, step(7, 4))).undoAvailable, true);
});

test('an undo approved by everyone restores the previous turn', () => {
  const manager = gameWith('A', 'B', 'C');
  ok(manager.move('g1', 1, step(7, 4)));
  ok(manager.move('g1', 2, step(1, 4)));

  const requested = ok(manager.requestUndo('g1', 3));
  assert.deepEqual(requested.undoVote, { requestedBy: 3, votes: { 3: true } });
  assert.equal(requested.gameStatus, 'C wants to undo the last turn');

  const partial = ok(manager.voteUndo('g1', 1, true));
  assert.deepEqual(partial.pawns[2], { row: 1, col: 4 });

  const restored = ok(manager.voteUndo('g1', 2, true));
  assert.equal(restored.undoVote, null);
  assert.deepEqual(restored.pawns[2], { row: 0, col: 4 });
  assert.equal(restored.currentPlayer, 2);
  assert.deepEqual(restored.lastMove.to, { row: 7, col: 4 });
  assert.equal(restored.gameStatus, 'Last turn undone');

  // A late or duplicate approval must not undo a second turn
  assert.deepEqual(manager.voteUndo('g1', 3, true), { error: 'No undo vote in progress' });
  assert.deepEqual(manager.getState('g1').pawns[1], { row: 7, col: 4 });
  assert.equal(manager.getState('g1').undoAvailable, true);
});

test('one decline cancels the vote', () => {
  const manager = gameWith('A', 'B');
  ok(manager.move('g1', 1, step(7, 4)));
  ok(manager.requestUndo('g1', 1));
  const declined = ok(manager.voteUndo('g1', 2, false));
  assert.equal(declined.undoVote, null);
  assert.deepEqual(declined.pawns[1], { row: 7, col: 4 });
  assert.equal(declined.gameStatus, 'B declined the undo');
  assert.equal(declined.undoAvailable, true);
});

test('undo requests and votes are validated', () => {
  const manager = gameWith('A', 'B');
  assert.deepEqual(manager.requestUndo('g1', 1), { error: 'Nothing to undo' });
  ok(manager.move('g1', 1, step(7, 4)));
  assert.deepEqual(manager.voteUndo('g1', 1, true), { error: 'No undo vote in progress' });
  ok(manager.requestUndo('g1', 1));
  assert.deepEqual(manager.requestUndo('g1', 2), { error: 'An undo vote is already in progress' });
  assert.deepEqual(manager.voteUndo('g1', 1, true), { error: 'You already voted' });
  assert.deepEqual(manager.move('g1', 2, step(1, 4)), { error: 'An undo vote is in progress' });
});

test('a player leaving during a vote no longer counts', () => {
  const manager = gameWith('A', 'B', 'C');
  ok(manager.move('g1', 1, step(7, 4)));
  ok(manager.requestUndo('g1', 1));
  ok(manager.voteUndo('g1', 2, true));
  const after = manager.leave('g1', 3).state;
  assert.equal(after.undoVote, null);
  assert.deepEqual(after.pawns[1], { row: 8, col: 4 });
  assert.deepEqual(after.activePlayers, [1, 2]);
  assert.equal(after.gameStatus, 'Last turn undone');
});

test('repeated undos step back to the start and the game stays locked', () => {
  const manager = gameWith('A', 'B');
  ok(manager.move('g1', 1, step(7, 4)));
  ok(manager.move('g1', 2, step(1, 4)));
  ok(manager.requestUndo('g1', 1));
  ok(manager.voteUndo('g1', 2, true));
  ok(manager.requestUndo('g1', 2));
  const start = ok(manager.voteUndo('g1', 1, true));
  assert.deepEqual(start.pawns, { 1: { row: 8, col: 4 }, 2: { row: 0, col: 4 } });
  assert.equal(start.currentPlayer, 1);
  assert.equal(start.started, true);
  assert.equal(start.undoAvailable, false);
  assert.deepEqual(manager.requestUndo('g1', 1), { error: 'Nothing to undo' });
  assert.deepEqual(manager.join('g1', 'C'), { error: 'Game already in progress' });
});

test('an undo returning the turn to a departed player skips them', () => {
  const manager = gameWith('A', 'B', 'C');
  ok(manager.move('g1', 1, step(7, 4)));
  ok(manager.move('g1', 2, step(1, 4)));
  manager.leave('g1', 2);
  ok(manager.requestUndo('g1', 1));
  const restored = ok(manager.voteUndo('g1', 3, true));
  assert.equal(restored.currentPlayer, 3);
  assert.deepEqual(restored.activePlayers, [1, 3]);
  assert.equal(restored.playerNames[2], 'B');
  assert.deepEqual(restored.pawns[2], { row: 0, col: 4 });
});

test('the winning move can be undone', () => {
  const manager = gameWith('A', 'B');
  let p2Col = 4;
  for (let row = 7; row >= 1; row--) {
    ok(manager.move('g1', 1, step(row, 4)));
    p2Col = p2Col === 4 ? 3 : 4;
    ok(manager.move('g1', 2, step(0, p2Col)));
  }
  const won = ok(manager.move('g1', 1, step(0, 4)));
  assert.equal(won.winner, 1);

  ok(manager.requestUndo('g1', 2));
  const restored = ok(manager.voteUndo('g1', 1, true));
  assert.equal(restored.isGameOver, false);
  assert.equal(restored.winner, null);
  assert.deepEqual(restored.pawns[1], { row: 1, col: 4 });
  assert.equal(restored.currentPlayer, 1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Cannot find module` for `server/games.js`; the 24 rules tests still pass.

- [ ] **Step 3: Implement the game manager**

Create `server/games.js`:

```js
import { createGameState, addPlayer, removePlayer, applyMove, nextActivePlayer } from '../shared/rules.js';

// Holds every game in memory, plus each game's undo history, which is never sent to browsers
export function createGameManager() {
  const games = new Map(); // gameId -> { state, history }

  function view(game) {
    return { ...game.state, undoAvailable: game.history.length > 0 };
  }

  function findPlayer(gameId, seat) {
    const game = games.get(gameId);
    if (!game) return { error: 'Game not found' };
    if (!game.state.activePlayers.includes(seat)) return { error: 'You are not in this game' };
    return { game };
  }

  // Applies the undo once every connected player has approved
  function resolveUndoVote(game) {
    const { state } = game;
    const vote = state.undoVote;
    if (!vote || !state.activePlayers.every(seat => vote.votes[seat])) return;

    const restored = {
      ...game.history.pop(),
      started: true,
      activePlayers: state.activePlayers,
      playerNames: state.playerNames,
      undoVote: null,
      gameStatus: 'Last turn undone'
    };
    if (!restored.activePlayers.includes(restored.currentPlayer)) {
      restored.currentPlayer = nextActivePlayer(restored, restored.currentPlayer);
    }
    game.state = restored;
  }

  return {
    join(gameId, playerName) {
      const id = String(gameId ?? '').trim();
      const name = String(playerName ?? '').trim();
      if (!id) return { error: 'Please enter a game ID' };
      if (!name) return { error: 'Please enter your name' };

      const game = games.get(id) ?? { state: createGameState(id), history: [] };
      const result = addPlayer(game.state, name);
      if (result.error) return result;

      game.state = result.state;
      games.set(id, game);
      return { gameId: id, seat: result.seat, state: view(game) };
    },

    leave(gameId, seat) {
      const found = findPlayer(gameId, seat);
      if (found.error) return null;
      const { game } = found;

      game.state = removePlayer(game.state, seat);
      if (game.state.activePlayers.length === 0) {
        games.delete(gameId);
        return null;
      }
      resolveUndoVote(game);
      return { state: view(game) };
    },

    move(gameId, seat, move) {
      const found = findPlayer(gameId, seat);
      if (found.error) return found;
      const { game } = found;

      const result = applyMove(game.state, seat, move);
      if (result.error) return result;

      game.history.push(game.state);
      game.state = result.state;
      return { state: view(game) };
    },

    requestUndo(gameId, seat) {
      const found = findPlayer(gameId, seat);
      if (found.error) return found;
      const { game } = found;
      const { state } = game;

      if (game.history.length === 0) return { error: 'Nothing to undo' };
      if (state.undoVote) return { error: 'An undo vote is already in progress' };
      if (state.activePlayers.length < 2) return { error: 'Not enough players to vote' };

      game.state = {
        ...state,
        undoVote: { requestedBy: seat, votes: { [seat]: true } },
        gameStatus: `${state.playerNames[seat]} wants to undo the last turn`
      };
      return { state: view(game) };
    },

    voteUndo(gameId, seat, approve) {
      const found = findPlayer(gameId, seat);
      if (found.error) return found;
      const { game } = found;
      const { state } = game;
      const vote = state.undoVote;

      if (!vote) return { error: 'No undo vote in progress' };
      if (vote.votes[seat]) return { error: 'You already voted' };

      if (approve !== true) {
        game.state = { ...state, undoVote: null, gameStatus: `${state.playerNames[seat]} declined the undo` };
        return { state: view(game) };
      }

      game.state = { ...state, undoVote: { ...vote, votes: { ...vote.votes, [seat]: true } } };
      resolveUndoVote(game);
      return { state: view(game) };
    },

    getState(gameId) {
      const game = games.get(gameId);
      return game && view(game);
    }
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 35 tests, 0 failures.

- [ ] **Step 5: Lint**

Run: `npx eslint server shared`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add server/games.js server/games.test.js
git commit -F - <<'EOF'
Add game manager with undo history and unanimous undo voting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Route WebSocket messages through the game manager

**Files:**
- Create: `shared/messages.js`
- Rewrite: `server/server.js`

**Interfaces:**
- Consumes: `createGameManager` from `server/games.js`.
- Produces: `MESSAGE_TYPES` from `shared/messages.js`:
  `JOIN_GAME, GAME_JOINED, MAKE_MOVE, REQUEST_UNDO, VOTE_UNDO, GAME_STATE, GAME_ERROR`.
  Wire format (unchanged where it already existed):
  - Client to server: `{ type: 'JOIN_GAME', gameId, playerName }`, `{ type: 'MAKE_MOVE', payload: { move } }`, `{ type: 'REQUEST_UNDO' }`, `{ type: 'VOTE_UNDO', payload: { approve: boolean } }`
  - Server to client: `{ type: 'GAME_JOINED', payload: { playerNumber, gameState } }`, `{ type: 'GAME_STATE', payload: gameState }`, `{ type: 'GAME_ERROR', payload: { message } }`
  - `PLAYER_DISCONNECTED` is removed.

- [ ] **Step 1: Create the message types**

Create `shared/messages.js`:

```js
// WebSocket message types shared by the browser and the server
export const MESSAGE_TYPES = {
  JOIN_GAME: 'JOIN_GAME',
  GAME_JOINED: 'GAME_JOINED',
  MAKE_MOVE: 'MAKE_MOVE',
  REQUEST_UNDO: 'REQUEST_UNDO',
  VOTE_UNDO: 'VOTE_UNDO',
  GAME_STATE: 'GAME_STATE',
  GAME_ERROR: 'GAME_ERROR'
};
```

- [ ] **Step 2: Rewrite the server**

Replace the whole of `server/server.js` with:

```js
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
    handleMessage(ws, data);
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
```

- [ ] **Step 3: Write the smoke script**

Create `smoke.mjs` in the session scratchpad directory (not in the repo). It uses Node 22's built-in `WebSocket` client, so it needs no packages:

```js
// Smoke test for server/server.js. Run with the server listening on port 3000.
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function connect() {
  return new Promise((resolve) => {
    const ws = new WebSocket('ws://localhost:3000');
    const client = {
      last: {},
      send: (message) => ws.send(JSON.stringify(message)),
      raw: (text) => ws.send(text),
      close: () => ws.close()
    };
    ws.onmessage = (event) => {
      const { type, payload } = JSON.parse(event.data);
      client.last[type] = payload;
    };
    ws.onopen = () => resolve(client);
  });
}

const [a, b, c] = await Promise.all([connect(), connect(), connect()]);

a.send({ type: 'JOIN_GAME', gameId: 'smoke', playerName: 'A' });
await sleep(200);
b.send({ type: 'JOIN_GAME', gameId: ' smoke ', playerName: 'B' });
await sleep(200);
console.log('seats:', a.last.GAME_JOINED.playerNumber, b.last.GAME_JOINED.playerNumber);

c.send({ type: 'MAKE_MOVE', payload: {} });
await sleep(200);
console.log('unjoined move:', c.last.GAME_ERROR?.message);

a.raw('not json');
a.raw('null');
a.send({ type: 'MAKE_MOVE' });
await sleep(200);
console.log('garbage from A:', a.last.GAME_ERROR?.message);

a.send({ type: 'MAKE_MOVE', payload: { move: { type: 'move', row: 7, col: 4 } } });
await sleep(200);
console.log('after move:', JSON.stringify(b.last.GAME_STATE.pawns[1]), b.last.GAME_STATE.gameStatus);

c.send({ type: 'JOIN_GAME', gameId: 'smoke', playerName: 'C' });
await sleep(200);
console.log('late join:', c.last.GAME_ERROR?.message);

b.send({ type: 'REQUEST_UNDO' });
await sleep(200);
a.send({ type: 'VOTE_UNDO', payload: { approve: true } });
await sleep(200);
console.log('after undo:', JSON.stringify(b.last.GAME_STATE.pawns[1]), b.last.GAME_STATE.gameStatus);

a.close();
await sleep(200);
console.log('after A leaves:', b.last.GAME_STATE.gameStatus, 'winner', b.last.GAME_STATE.winner);

b.close();
c.close();
```

- [ ] **Step 4: Run the smoke test**

Run the server in the background: `node server/server.js` (from the repo root; it serves `dist` from the last build, which is fine for this check).
Then run: `node <scratchpad>/smoke.mjs`
Expected output:

```
seats: 1 2
unjoined move: Join a game first
garbage from A: Unknown move type
after move: {"row":7,"col":4} A moved
late join: Game already in progress
after undo: {"row":8,"col":4} Last turn undone
after A leaves: B wins! Everyone else left. winner 2
```

The server log shows one `Error parsing message` for `not json` and keeps running. Stop the server afterwards.

- [ ] **Step 5: Run the unit tests and lint**

Run: `npm test` (expected: 35 pass) and `npx eslint server shared` (expected: no output).

- [ ] **Step 6: Commit**

```bash
git add shared/messages.js server/server.js
git commit -F - <<'EOF'
Route server messages through the game manager

The server now validates every move with the shared rules, supports up
to four players, locks joining after the first move, handles undo
requests and votes, and keeps the game going when a player leaves.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Browser client for four players and the Game ID

**Files:**
- Rewrite: `src/services/gameService.js`
- Rewrite: `src/components/Game.jsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes: `MESSAGE_TYPES` (`shared/messages.js`); `BOARD_SIZE`, `SEATS`, `getValidMoves`, `isValidWallPlacement` (`shared/rules.js`); server state including `undoAvailable`.
- Produces: `gameService` default export with `connect(gameId, playerName)`, `disconnect()`, `makeMove(move)`, `send(message)`, callbacks `onGameJoined`, `onGameState`, `onError`, `onDisconnect`. Task 6 adds `requestUndo()` and `voteUndo(approve)`. `Game.jsx` renders the board inside `<div className="board-area">`, which Task 6 uses to host the vote overlay.

- [ ] **Step 1: Rewrite the game service**

Replace the whole of `src/services/gameService.js` with:

```js
import { MESSAGE_TYPES } from '../../shared/messages.js';

class GameService {
  constructor() {
    this.ws = null;
    this.onGameState = null;
    this.onGameJoined = null;
    this.onError = null;
    this.onDisconnect = null;
  }

  connect(gameId, playerName, serverUrl = window.location.host) {
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
      this.handleMessage(JSON.parse(event.data));
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onDisconnect?.();
    };
  }

  handleMessage({ type, payload }) {
    switch (type) {
      case MESSAGE_TYPES.GAME_JOINED:
        this.onGameJoined?.(payload);
        break;
      case MESSAGE_TYPES.GAME_STATE:
        this.onGameState?.(payload);
        break;
      case MESSAGE_TYPES.GAME_ERROR:
        this.onError?.(payload.message);
        break;
    }
  }

  send(message) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  makeMove(move) {
    this.send({ type: MESSAGE_TYPES.MAKE_MOVE, payload: { move } });
  }

  disconnect() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }
}

export default new GameService();
```

- [ ] **Step 2: Rewrite the game component**

Replace the whole of `src/components/Game.jsx` with:

```jsx
import { useState, useEffect, useCallback } from 'react';
import gameService from '../services/gameService';
import { BOARD_SIZE, SEATS, getValidMoves, isValidWallPlacement } from '../../shared/rules.js';

const SQUARE_SIZE = 52; // 50px square plus its 1px borders
const BOARD = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

export default function Game() {
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerNumber, setPlayerNumber] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [selectedAction, setSelectedAction] = useState('move'); // 'move', 'wall-h', or 'wall-v'
  const [wallPreview, setWallPreview] = useState(null);
  const [lastMoveHovered, setLastMoveHovered] = useState(false);
  const [lastMovePinned, setLastMovePinned] = useState(false);
  const currentPlayer = gameState?.currentPlayer;

  useEffect(() => {
    gameService.onGameJoined = (data) => {
      setPlayerNumber(data.playerNumber);
      setGameState(data.gameState);
      setError(null);
    };

    gameService.onGameState = (newGameState) => {
      setGameState(newGameState);
      setError(null);
    };

    gameService.onError = setError;

    gameService.onDisconnect = () => {
      setPlayerNumber(null);
      setGameState(null);
      setError('Disconnected from server');
    };

    return () => {
      gameService.disconnect();
    };
  }, []);

  useEffect(() => {
    // Reset to move at the start of every turn
    setSelectedAction('move');
    setWallPreview(null);
  }, [currentPlayer]);

  const handleJoinGame = useCallback(() => {
    const trimmedGameId = gameId.trim();
    const trimmedName = playerName.trim();
    if (!trimmedGameId) {
      setError('Please enter a game ID');
      return;
    }
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    setError(null);
    gameService.connect(trimmedGameId, trimmedName);
  }, [gameId, playerName]);

  if (!gameState) {
    return (
      <div className="game">
        <div className="game-info">
          <h2>Join a Game</h2>
          {error && <div className="error">{error}</div>}
          <div className="join-form">
            <div className="input-group">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
              />
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Enter Game ID to create or join a game"
              />
            </div>
            <button onClick={handleJoinGame}>Join Game</button>
          </div>
        </div>
      </div>
    );
  }

  const { pawns, walls, playerNames, wallCounts, activePlayers, lastMove, isGameOver } = gameState;
  const seats = Object.keys(playerNames).map(Number).sort((a, b) => a - b);
  const isMyTurn = currentPlayer === playerNumber && activePlayers.length >= 2 && !isGameOver && !gameState.undoVote;
  const validMoves = isMyTurn ? getValidMoves(gameState, playerNumber) : [];
  const showLastMove = Boolean(lastMove) && (lastMoveHovered || lastMovePinned);

  function turnMessage() {
    if (isGameOver) return 'Game Over';
    if (activePlayers.length < 2) return 'Waiting for at least one more player';
    if (!gameState.started) return `${playerNames[currentPlayer]} moves first. Joining closes after the first move.`;
    return `${playerNames[currentPlayer]}'s turn`;
  }

  function wallAt(row, col) {
    return { row, col, orientation: selectedAction === 'wall-h' ? 'horizontal' : 'vertical' };
  }

  function handleSquareClick(row, col) {
    if (!isMyTurn) return;

    if (selectedAction === 'move') {
      if (validMoves.some(move => move.row === row && move.col === col)) {
        gameService.makeMove({ type: 'move', row, col });
      }
      return;
    }

    const wall = wallAt(row, col);
    if (wallCounts[playerNumber] > 0 && isValidWallPlacement(gameState, wall)) {
      gameService.makeMove({ type: 'wall', ...wall });
      setSelectedAction('move');
      setWallPreview(null);
    }
  }

  function handleSquareHover(row, col) {
    if (!isMyTurn || selectedAction === 'move') return;
    const wall = wallAt(row, col);
    setWallPreview(isValidWallPlacement(gameState, wall) ? wall : null);
  }

  function isSamePosition(a, b) {
    return a.row === b.row && a.col === b.col;
  }

  function pawnAt(row, col) {
    return seats.find(seat => isSamePosition(pawns[seat], { row, col }));
  }

  function getSquareClassName(row, col) {
    const classNames = ['square'];
    if (validMoves.some(move => move.row === row && move.col === col)) {
      classNames.push('valid-move');
    }
    if (showLastMove && lastMove.type === 'move') {
      if (isSamePosition(lastMove.from, { row, col })) classNames.push('last-move-from');
      if (isSamePosition(lastMove.to, { row, col })) classNames.push('last-move-to');
    }
    return classNames.join(' ');
  }

  function isLastMoveWall(wall) {
    return showLastMove && lastMove.type === 'wall' &&
      isSamePosition(lastMove, wall) && lastMove.orientation === wall.orientation;
  }

  return (
    <>
      <div className="game-id">Game ID: {gameState.gameId}</div>
      <div className="game">
        <div className="player-info">
          You are {playerNames[playerNumber]} (Player {playerNumber}). Your goal: reach the {SEATS[playerNumber].goalLabel}.
        </div>
        <div className="game-info">
          {error && <div className="error">{error}</div>}
          {gameState.gameStatus && <div className="game-status">{gameState.gameStatus}</div>}
          <div>{turnMessage()}</div>
          <div>
            Walls left:{' '}
            {seats.map((seat, index) => (
              <span key={seat} className={activePlayers.includes(seat) ? '' : 'player-left'}>
                {index > 0 && ' · '}
                {playerNames[seat]} {wallCounts[seat]}
                {!activePlayers.includes(seat) && ' (left)'}
              </span>
            ))}
          </div>
          <div className="action-buttons">
            <button
              onClick={() => setSelectedAction('move')}
              className={selectedAction === 'move' ? 'active' : ''}
            >
              Move
            </button>
            <button
              onClick={() => setLastMovePinned(prev => !prev)}
              onMouseEnter={() => setLastMoveHovered(true)}
              onMouseLeave={() => setLastMoveHovered(false)}
              className={lastMovePinned ? 'active' : ''}
              disabled={!lastMove}
            >
              Show Last Move
            </button>
          </div>
        </div>
        <div className="board-area">
          <div className={`board ${isMyTurn ? '' : 'not-your-turn'} ${isGameOver ? 'game-over' : ''}`}>
            {BOARD.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row">
                {row.map((_, colIndex) => {
                  const seat = pawnAt(rowIndex, colIndex);
                  return (
                    <div
                      key={colIndex}
                      className={getSquareClassName(rowIndex, colIndex)}
                      onClick={() => handleSquareClick(rowIndex, colIndex)}
                      onMouseEnter={() => handleSquareHover(rowIndex, colIndex)}
                      onMouseLeave={() => setWallPreview(null)}
                    >
                      {seat && (
                        <div className={`pawn player${seat}`} title={playerNames[seat]}>
                          {playerNames[seat]?.[0] || `P${seat}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Wall overlay */}
            <div className="wall-overlay">
              {walls.map((wall, index) => (
                <div
                  key={index}
                  className={`wall ${wall.orientation} ${isLastMoveWall(wall) ? 'last-move' : ''}`}
                  style={{
                    top: `${(wall.row * SQUARE_SIZE) + 2}px`,
                    left: `${(wall.col * SQUARE_SIZE) + 2}px`
                  }}
                />
              ))}
            </div>
            {/* Wall preview */}
            {wallPreview && (
              <div
                className={`wall-preview ${wallPreview.orientation}`}
                style={{
                  top: `${(wallPreview.row * SQUARE_SIZE) + 2}px`,
                  left: `${(wallPreview.col * SQUARE_SIZE) + 2}px`
                }}
              />
            )}
          </div>
        </div>
        <div className="wall-actions">
          <button
            onClick={() => setSelectedAction('wall-h')}
            className={selectedAction === 'wall-h' ? 'active' : ''}
          >
            Horizontal Wall
          </button>
          <button
            onClick={() => setSelectedAction('wall-v')}
            className={selectedAction === 'wall-v' ? 'active' : ''}
          >
            Vertical Wall
          </button>
        </div>
      </div>
    </>
  );
}
```

Note: the Game ID badge sits outside `.game` because `.game` uses `transform`, which would make a `position: fixed` child position itself relative to `.game` instead of the viewport.

- [ ] **Step 3: Add the styles**

Append to `src/App.css`:

```css
.game-id {
  position: fixed;
  top: 1rem;
  left: 1rem;
  z-index: 10;
  padding: 8px 14px;
  border-radius: 4px;
  background: var(--banner-bg);
  color: #FFF;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-size: 14px;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
}

.player-left {
  opacity: 0.5;
}

.pawn.player3 {
  background: radial-gradient(circle at 35% 35%, #81C784 0%, #43A047 100%);
  border: 2px solid #2E7D32;
}

.pawn.player4 {
  background: radial-gradient(circle at 35% 35%, #BA68C8 0%, #8E24AA 100%);
  border: 2px solid #6A1B9A;
}

.board-area {
  position: relative;
}
```

- [ ] **Step 4: Lint, test and build**

Run: `npm run lint`
Expected: exit 0 with no warnings. The rewrite removes the two `react-hooks/exhaustive-deps` warnings that `master` has.

Run: `npm test` (expected: 35 pass) and `npm run build` (expected: `built in`).

- [ ] **Step 5: Check a four-player game in Chrome**

Start `node server/server.js` in the background. Open four tabs at `http://localhost:3000` and join Game ID `four` as A, B, C, D (filling inputs and clicking through the page or via `javascript_tool`). Confirm:
- Each banner names the right goal: A top row, B bottom row, C right column, D left column.
- The Game ID badge reads "Game ID: four" in the top-left and does not overlap the "Quoridor" title or the banner.
- Pawns are blue, red, green, purple at bottom, top, left, right. Walls left reads "A 5 · B 5 · C 5 · D 5".
- Before the first move the turn line reads "A moves first. Joining closes after the first move."
- A fifth tab joining `four` gets "Game is full". After A moves, closing D's tab shows "D left the game", D greyed out with "(left)", and D's turn is skipped.
- A tab that joined `four` after the first move gets "Game already in progress".
- Valid-move hints and wall previews appear only on your own turn, and a wall that would seal someone in is not previewed.

- [ ] **Step 6: Check rejoin after a refusal**

In the tab that got "Game already in progress", change the Game ID to `other` and click Join Game. Expected: it joins `other` as Player 1, and never shows "Disconnected from server".

- [ ] **Step 7: Commit**

```bash
git add src/services/gameService.js src/components/Game.jsx src/App.css
git commit -F - <<'EOF'
Render up to four players and show the Game ID

The browser now renders server state, uses the shared rules for move
hints and wall previews, shows each seat's goal and walls left, greys
out players who left, and shows the Game ID in the top-left corner.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Undo button and vote panel

**Files:**
- Modify: `src/services/gameService.js`
- Create: `src/components/UndoVote.jsx`
- Modify: `src/components/Game.jsx`
- Modify: `src/App.css` (append)

**Interfaces:**
- Consumes: `gameService.send`, `MESSAGE_TYPES.REQUEST_UNDO`, `MESSAGE_TYPES.VOTE_UNDO`; server state fields `undoVote`, `undoAvailable`, `activePlayers`, `playerNames`.
- Produces: `gameService.requestUndo()`, `gameService.voteUndo(approve: boolean)`; `<UndoVote vote playerNumber activePlayers playerNames onVote />`.

- [ ] **Step 1: Add the undo calls to the game service**

In `src/services/gameService.js`, add after `makeMove`:

```js
  requestUndo() {
    this.send({ type: MESSAGE_TYPES.REQUEST_UNDO });
  }

  voteUndo(approve) {
    this.send({ type: MESSAGE_TYPES.VOTE_UNDO, payload: { approve } });
  }
```

- [ ] **Step 2: Create the vote panel**

Create `src/components/UndoVote.jsx`:

```jsx
export default function UndoVote({ vote, playerNumber, activePlayers, playerNames, onVote }) {
  const canVote = activePlayers.includes(playerNumber) && !vote.votes[playerNumber];

  return (
    <div className="undo-vote">
      <div className="undo-vote-panel">
        <div className="undo-vote-title">{playerNames[vote.requestedBy]} wants to undo the last turn</div>
        <ul className="undo-vote-list">
          {activePlayers.map(seat => (
            <li key={seat}>
              {playerNames[seat]}: {vote.votes[seat] ? 'approved' : 'waiting'}
            </li>
          ))}
        </ul>
        {canVote ? (
          <div className="undo-vote-actions">
            <button onClick={() => onVote(true)}>Approve</button>
            <button onClick={() => onVote(false)}>Decline</button>
          </div>
        ) : (
          <div>Waiting for the other players</div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire it into the game**

In `src/components/Game.jsx`:

Add the import after the `gameService` import:

```jsx
import UndoVote from './UndoVote';
```

Add the Undo button between the Move and Show Last Move buttons, replacing:

```jsx
              Move
            </button>
            <button
              onClick={() => setLastMovePinned(prev => !prev)}
```

with:

```jsx
              Move
            </button>
            <button
              onClick={() => gameService.requestUndo()}
              disabled={!gameState.undoAvailable || Boolean(gameState.undoVote) || !activePlayers.includes(playerNumber) || activePlayers.length < 2}
            >
              Undo
            </button>
            <button
              onClick={() => setLastMovePinned(prev => !prev)}
```

Render the panel over the board, replacing:

```jsx
            )}
          </div>
        </div>
        <div className="wall-actions">
```

with:

```jsx
            )}
          </div>
          {gameState.undoVote && (
            <UndoVote
              vote={gameState.undoVote}
              playerNumber={playerNumber}
              activePlayers={activePlayers}
              playerNames={playerNames}
              onVote={(approve) => gameService.voteUndo(approve)}
            />
          )}
        </div>
        <div className="wall-actions">
```

The panel is a sibling of `.board`, not a child, because `.board.not-your-turn` sets `pointer-events: none`, which would make the vote buttons unclickable.

- [ ] **Step 4: Add the styles**

Append to `src/App.css`:

```css
.undo-vote {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
}

.undo-vote-panel {
  min-width: 260px;
  padding: 20px;
  border-radius: 8px;
  background: var(--panel-bg);
  color: #FFF;
  text-align: center;
  text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.3);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.2);
}

.undo-vote-title {
  font-weight: bold;
}

.undo-vote-list {
  list-style: none;
  margin: 12px 0;
  padding: 0;
}

.undo-vote-actions {
  display: flex;
  gap: 10px;
  justify-content: center;
}

.undo-vote-actions button {
  padding: 10px 20px;
  font-size: 14px;
  border: none;
  border-radius: 4px;
  background: var(--button-bg);
  color: #fff;
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.undo-vote-actions button:hover {
  background: var(--button-hover-bg);
}
```

- [ ] **Step 5: Lint, test and build**

Run: `npm run lint` (expected: exit 0, no warnings), `npm test` (expected: 35 pass), `npm run build` (expected: `built in`).

- [ ] **Step 6: Check undo voting in Chrome**

With the server running, three tabs in Game ID `undo` as A, B, C:
- Undo is disabled before the first move.
- A moves. B clicks Undo: all three see the panel "B wants to undo the last turn" with B approved and A, C waiting; B sees "Waiting for the other players"; A and C see Approve and Decline; the board takes no clicks.
- A approves, C approves: A's pawn is back on its start square, status "Last turn undone", panel gone, it is A's turn again, Undo disabled (history empty).
- A moves, then C requests an undo and B declines: status "B declined the undo", A's move stays.
- A and B each move, then two undos approved by everyone step back to the start.
- Close C's tab while a vote that A and B already approved is open: the undo applies.
- Repeat a quick check in dark mode, and confirm the panel stays inside the board at a 1000x700 viewport (resize the window, or load the page in a 1000x700 iframe if the window cannot be resized).

- [ ] **Step 7: Commit**

```bash
git add src/services/gameService.js src/components/UndoVote.jsx src/components/Game.jsx src/App.css
git commit -F - <<'EOF'
Add unanimous undo voting to the browser

Undo now asks every connected player to approve. A panel over the board
shows who has voted, and one decline cancels the request.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Documentation and pull request

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: everything above.
- Produces: an open PR from `four-players-undo-vote` to `master`.

- [ ] **Step 1: Update the README**

In `README.md`, replace the "How to Play Multiplayer" and "Game Rules" sections (from `## How to Play Multiplayer` up to, not including, `## Technical Details`) with:

```markdown
## How to Play Multiplayer

1. Open the game in two to four browser windows
2. In each window, enter your name and the same game ID (any string) to join the same game
3. Players are seated in join order: Player 1 (blue) starts at the bottom, Player 2 (red) at the top, Player 3 (green) on the left, Player 4 (purple) on the right
4. The lowest-numbered player makes the first move once at least two players have joined. Nobody can join after the first move
5. Take turns moving your pawn or placing walls
6. Win by reaching the opposite edge of the board

## Game Rules

- Players take turns either moving their pawn or placing a wall
- Pawns can move one square orthogonally (up, down, left, right)
- Pawns can jump straight over an adjacent pawn if the square beyond is free and not walled off
- Walls block pawn movement but cannot completely block a player's path to their goal
- Each player has 10 walls in a two-player game, or 5 walls with three or four players
- First player to reach their opposite edge wins
- If a player leaves mid-game, their pawn and walls stay on the board and their turns are skipped
- Any player can ask to undo the last turn. It is undone only if every player still in the game approves
```

In the same file, in "Network Setup", change "Open `http://localhost:3000` in two browser windows" to "Open `http://localhost:3000` in two to four browser windows", and replace the remaining line reading "First player to join will be Player 1 (blue), second will be Player 2 (red)" (the one under "To play across different computers") with "Players are seated in join order, up to four per game". Replace "Make sure both players can reach the server computer" with "Make sure every player can reach the server computer".

- [ ] **Step 2: Update the architecture doc**

In `docs/architecture.md`:

Under "Client-Side Components", replace the Game Service bullets and add the rules module:

```markdown
2. **Game Service (`/src/services/gameService.js`)**

   - Manages the WebSocket connection
   - Sends joins, moves, undo requests and undo votes
   - Passes server state updates and errors to the UI

3. **Shared Rules (`/shared/rules.js`)**
   - Seats, goals, legal pawn moves and wall placements for up to four players
   - Used by the browser for move hints and wall previews, and by the server to validate every move
```

and delete the old item 3 ("WebSocket Client", including its "Auto-reconnects on disconnection" bullet, which was never true).

Replace the "Game Manager" item with:

```markdown
3. **Game Manager (`/server/games.js`)**

   - Creates games, seats up to four players, and locks joining after the first move
   - Validates and applies moves with the shared rules
   - Keeps each game's undo history and runs unanimous undo votes
   - Skips players who leave mid-game
```

Replace the "Communication Flow" steps 2 to 4 with:

```markdown
2. **Game Creation/Joining**

   ```
   Client -> Server: JOIN_GAME (gameId, playerName)
   Server -> Client: GAME_JOINED (playerNumber, gameState) or GAME_ERROR
   Server -> All Clients in game: GAME_STATE
   ```

3. **Game Play**

   ```
   Client -> Server: MAKE_MOVE (move)
   Server -> All Clients in game: GAME_STATE, or GAME_ERROR to the sender
   ```

4. **Undo**

   ```
   Client -> Server: REQUEST_UNDO
   Each client -> Server: VOTE_UNDO (approve)
   Server -> All Clients in game: GAME_STATE (vote progress, then the restored state or the decline)
   ```

5. **Disconnection**
   ```
   Client Disconnects
   Server -> Remaining Clients: GAME_STATE (player marked as left)
   ```
```

- [ ] **Step 3: Final checks**

Run: `npm run lint`, `npm test`, `npm run build`. Expected: lint clean, 35 tests pass, build succeeds. Then play a 2-player game in Chrome to a win (10 walls each, undo after the win works), and confirm both themes still look right.

- [ ] **Step 4: Commit, push and open the PR**

```bash
git add README.md docs/architecture.md
git commit -F - <<'EOF'
Document four-player games, server validation and undo voting

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
git push -u origin four-players-undo-vote
```

Then `gh pr create --base master` with a title of "Four players, undo voting, and Game ID" and a body that summarises the features, the server now validating moves, the test commands and their results, the manual Chrome checks, and the known out-of-scope items from the spec. End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```
