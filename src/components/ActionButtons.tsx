import type { PublicGameState, Seat } from '../../shared/types.ts';

type ActionButtonsProps = {
  gameState: PublicGameState;
  playerNumber: Seat;
  lastMovePinned: boolean;
  onUndo: () => void;
  onToggleLastMovePinned: () => void;
  onLastMoveHover: (hovered: boolean) => void;
};

export default function ActionButtons({
  gameState,
  playerNumber,
  lastMovePinned,
  onUndo,
  onToggleLastMovePinned,
  onLastMoveHover,
}: ActionButtonsProps) {
  const { activePlayers, undoAvailable, undoVote, lastMove } = gameState;
  const canUndo = undoAvailable && !undoVote && activePlayers.includes(playerNumber) && activePlayers.length >= 2;

  return (
    <div className="action-buttons">
      <button onClick={onUndo} disabled={!canUndo}>
        Undo
      </button>
      <button
        onClick={onToggleLastMovePinned}
        onMouseEnter={() => onLastMoveHover(true)}
        onMouseLeave={() => onLastMoveHover(false)}
        className={lastMovePinned ? 'active' : ''}
        disabled={!lastMove}
      >
        Show Last Move
      </button>
    </div>
  );
}
