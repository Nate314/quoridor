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
