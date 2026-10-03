# Four Players, Undo Vote, and Game ID

**Date:** 2026-10-02
**Status:** Draft, awaiting review

## Goal

Let 2 to 4 friends play one Quoridor game from separate browsers, one player per board edge, and let them fix a mistaken turn only when everyone agrees.

Success means a 3 or 4 player game can be played to a win, a turn can be undone by unanimous vote, and a 2 player game still works as it does today.

## Requirements

From the request:

1. Undo only takes effect when every player votes to undo the last turn.
2. Games support 2 to 4 players, one per edge.
3. With 3 or 4 players each player starts with 5 walls. With 2 players, 10.
4. Once one move has been made, nobody else can join that Game ID.
5. The Game ID is shown on screen while in a game.

Decided during design:

- A player who disconnects after the first move is skipped: their pawn and walls stay, their turns are skipped, and they stop counting in undo votes. When only one connected player remains, that player wins.
- Undo is repeatable: each approved vote undoes one turn, back to the start of the game. Undoing the winning move is allowed.
- Rules live in one shared module used by both the browser and the server, and the server validates every move (approach A).

## Current state (for context)

- `src/components/Game.jsx` holds all rules (move generation, wall overlap and path checks, win check) and the UI. The server stores whatever the client sends.
- The server supports exactly 2 players, starts sending state when the second joins, and ends the game for everyone when anyone disconnects.
- Undo is effectively dead: the client clears its local `moveHistory` on every state update, and the server treats `{ type: 'undo' }` as a turn switch.

## Design

### 1. Rules module: `shared/rules.js`

Plain functions with no React or networking, imported by `src/components/Game.jsx` and by the server.

**Seats**

| Player | Start (row, col) | Goal |
|---|---|---|
| 1 | (8, 4) bottom | row 0 (top) |
| 2 | (0, 4) top | row 8 (bottom) |
| 3 | (4, 0) left | column 8 (right) |
| 4 | (4, 8) right | column 0 (left) |

Turn order is seat order (1, 2, 3, 4), skipping seats that are empty or whose player has left.

**Wall count:** 10 per player when 2 players are seated, 5 per player when 3 or 4 are. In the lobby the counts are recomputed on every join and leave; the first move freezes them.

**Pawn moves:** one square up, down, left or right, unless blocked by the board edge or a wall. If that square holds any pawn, the move becomes a straight jump over it, allowed only when the square beyond is on the board, empty, and not walled off. There are no diagonal moves, matching the current rule.

**Wall placement:** the existing overlap and crossing checks, plus every connected player must still have a path to their goal edge. Pawns do not block paths. Walls keep their current shape (`row`, `col`, `orientation`, each spanning two squares).

**State transition:** `applyMove(state, playerNumber, move)` returns either `{ state }` or `{ error }`. It rejects the move when fewer than 2 players are seated, the game is over, an undo vote is open, it is not that player's turn, the player has no walls left (for a wall), or the move is illegal. On success it places the pawn or wall, decrements walls for a wall, records `lastMove`, sets `gameStatus`, sets `started` on the first move (fixing wall counts), checks for a win, and passes the turn to the next connected player.

**Game state fields** (sent to every browser):

- Existing, extended to 4 seats: `pawns`, `playerNames`, `wallCounts`, `walls`, `currentPlayer`, `gameStatus`, `isGameOver`, `lastMove`.
- New:
  - `gameId`
  - `started`: true after the first move; locks joining and fixes wall counts
  - `activePlayers`: seat numbers of connected players, in turn order
  - `winner`: seat number or `null`
  - `undoVote`: `null`, or `{ requestedBy, votes: { [seat]: true } }`

### 2. Server

**Split:** `server/games.js` holds game management (create, join, leave, move, undo vote) as functions over plain objects so it can be tested without sockets. `server/server.js` keeps Express, the WebSocket server, message parsing, and broadcasting.

**Joining (`JOIN_GAME`)**

- Unknown Game ID: create the game.
- Rejected with `GAME_ERROR`: "Game already in progress" once `started`, or "Game is full" at 4 players.
- The new player takes the lowest free seat. In the lobby (before the first move) a player who leaves frees their seat.
- Every join is broadcast to everyone in the game.
- Moves are accepted once at least 2 players are seated. The lowest seated player moves first (player 1 unless seat 1 was freed in the lobby).

**Moves (`MAKE_MOVE`)**

- Run through `applyMove`. On error, only the sender gets `GAME_ERROR` with the reason.
- On success, push the previous state onto the game's undo history (server only, not broadcast) and broadcast the new state.

**Disconnects**

- Lobby: remove the player and free the seat. Delete the game when empty.
- Started: remove the seat from `activePlayers` and set status "<name> left the game". If it was their turn, advance the turn. If an undo vote is open, re-evaluate it without them. If one connected player remains, they win.
- A player who leaves a started game cannot rejoin it.
- Remaining players stay in the game. A browser returns to the join screen only when its own connection closes.

**Undo vote**

- `REQUEST_UNDO`: accepted from a connected player when the undo history is not empty, no vote is open, and at least 2 players are connected, including after a win. Opens a vote with the requester counted as yes.
- `VOTE_UNDO { approve }`: accepted from a connected player who has not voted.
  - `approve: false` closes the vote with status "<name> declined the undo".
  - When every connected player has voted yes, pop the undo history and restore that state, but keep the current `activePlayers` and `playerNames`, clear the vote, and set status "Last turn undone". If the restored `currentPlayer` has left, advance the turn. `started` stays true even after undoing every move.
- Removed: the `{ type: 'undo' }` move and the `PLAYER_DISCONNECTED` message. Everything arrives as `GAME_STATE`.

### 3. Browser

- **Game ID:** a small fixed badge in the top-left corner, "Game ID: abc123", mirroring the theme toggle in the top-right. It adds no page height.
- **Pawns:** player 1 blue, player 2 red, player 3 green, player 4 purple.
- **Goal line:** "Your goal: reach the top row / bottom row / right column / left column" for your seat.
- **Walls left:** one line, e.g. "Walls left: Alice 5 · Bob 5 · Carol 5 · Dan 5". Players who left are greyed out and marked "(left)".
- **Lobby status:** e.g. "3 players joined. Alice moves first. Joining closes after the first move." The board shows only seated pawns.
- **Undo button:** sends `REQUEST_UNDO`. Disabled before any move, while a vote is open, or if you have left.
- **Vote panel (`src/components/UndoVote.jsx`):** overlays the board while a vote is open: "<name> wants to undo the last turn", each connected player marked approved or waiting, and Approve / Decline buttons for players who have not voted. The board does not accept moves while it is open.
- **Show Last Move:** unchanged; after an undo it shows the restored state's last move.
- **Rules in the browser:** valid-move highlighting and wall previews call `shared/rules.js`. The local `moveHistory` and `prevState` snapshots are removed.
- **Own disconnect:** return to the join screen with "Disconnected from server".

## Testing

Automated, with Node's built-in runner (`npm test` running `node --test`), no new dependencies:

- `shared/rules.js`: seat starts and goals; wall counts for 2, 3 and 4 players; steps and straight jumps with several pawns; a wall rejected for cutting off a column goal; a win on each edge; turn order skipping departed players; rejections for wrong turn, open vote, no walls left, and game over.
- `server/games.js`: join locked after the first move; full at 4; lobby seat freed and reused; mid-game leaver skipped; last connected player wins; undo approved by all restores the prior state; one decline cancels; a leaver during a vote is handled; repeated undos step back; `started` stays true after undoing everything.

Manual, in Chrome against `npm start`:

- A 4-tab game: join, a 5th tab refused as full, a late joiner refused after the first move, 5 walls each, an approved undo and a declined one.
- Close one tab mid-game and confirm its turns are skipped.
- A 2-player game still works with 10 walls.
- Both themes, and layout at more than one window size.

## Out of scope

- Rejoining a started game after a disconnect.
- Diagonal jumps from the official Quoridor rules.
- Choosing a seat or turn order.
- Fixing the existing clipping on viewports shorter than about 886px.

## Delivery

On branch `four-players-undo-vote`: this spec, then an implementation plan, then the implementation, an update to `docs/architecture.md` (which currently says the server validates moves), and a PR.
