import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('a leave after the game is over clears an open undo vote when fewer than two remain', () => {
  const over = {
    ...play(lobby('A', 'B'), 1, step(7, 4)),
    isGameOver: true,
    winner: 1,
    undoVote: { requestedBy: 2, votes: { 2: true } }
  };
  const state = removePlayer(over, 1);
  assert.equal(state.undoVote, null);
  assert.equal(state.isGameOver, true);
  assert.equal(state.winner, 1);
});
