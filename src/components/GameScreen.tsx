import { useState, useEffect } from 'react';
import gameService from '../services/gameService';
import ActionButtons from './ActionButtons';
import Board from './Board';
import GameStatus from './GameStatus';
import GoalList from './GoalList';
import TurnActions from './TurnActions';
import UndoVote from './UndoVote';
import type { Move, PublicGameState, Seat } from '../../shared/types.ts';
import type { Action } from '../types.ts';

type GameScreenProps = {
  gameState: PublicGameState;
  playerNumber: Seat;
  error: string | null;
};

export default function GameScreen({ gameState, playerNumber, error }: GameScreenProps) {
  const [selectedAction, setSelectedAction] = useState<Action>('move');
  const [lastMoveHovered, setLastMoveHovered] = useState(false);
  const [lastMovePinned, setLastMovePinned] = useState(false);
  const { currentPlayer, activePlayers, playerNames, lastMove, isGameOver, undoVote } = gameState;
  const isMyTurn = currentPlayer === playerNumber && activePlayers.length >= 2 && !isGameOver && !undoVote;
  const showLastMove = Boolean(lastMove) && (lastMoveHovered || lastMovePinned);

  useEffect(() => {
    // Reset to move at the start of every turn
    setSelectedAction('move');
  }, [currentPlayer]);

  function handleMove(move: Move) {
    gameService.makeMove(move);
    if (move.type === 'wall') setSelectedAction('move');
  }

  return (
    <>
      <div className="game-id">Game ID: {gameState.gameId}</div>
      <div className="game game-layout">
        <div className="board-area">
          <Board
            gameState={gameState}
            playerNumber={playerNumber}
            isMyTurn={isMyTurn}
            selectedAction={selectedAction}
            showLastMove={showLastMove}
            onMove={handleMove}
          />
          {undoVote && (
            <UndoVote
              vote={undoVote}
              playerNumber={playerNumber}
              activePlayers={activePlayers}
              playerNames={playerNames}
              onVote={(approve) => gameService.voteUndo(approve)}
            />
          )}
        </div>
        <div className="game-info side-panel">
          <GameStatus gameState={gameState} error={error} />
          <TurnActions selectedAction={selectedAction} onSelectAction={setSelectedAction} />
          <ActionButtons
            gameState={gameState}
            playerNumber={playerNumber}
            lastMovePinned={lastMovePinned}
            onUndo={() => gameService.requestUndo()}
            onToggleLastMovePinned={() => setLastMovePinned(prev => !prev)}
            onLastMoveHover={setLastMoveHovered}
          />
          <GoalList gameState={gameState} playerNumber={playerNumber} />
        </div>
      </div>
    </>
  );
}
