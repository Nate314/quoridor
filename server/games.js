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
