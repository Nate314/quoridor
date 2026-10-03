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
