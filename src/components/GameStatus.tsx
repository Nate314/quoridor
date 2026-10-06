import type { PublicGameState } from '../../shared/types.ts';

type GameStatusProps = {
  gameState: PublicGameState;
  error: string | null;
};

function turnMessage({ currentPlayer, playerNames, activePlayers, started, isGameOver }: PublicGameState): string {
  const currentName = currentPlayer == null ? '' : playerNames[currentPlayer];
  if (isGameOver) return 'Game Over';
  if (activePlayers.length < 2) return 'Waiting for at least one more player';
  if (!started) return `${currentName} moves first. Joining closes after the first move.`;
  return `${currentName}'s turn`;
}

export default function GameStatus({ gameState, error }: GameStatusProps) {
  const { playerNames, wallCounts, activePlayers, gameStatus } = gameState;
  const seats = Object.keys(playerNames).map(Number).sort((a, b) => a - b);

  return (
    <>
      {(error || gameStatus) && (
        <div className={error ? 'game-status game-status-error' : 'game-status'}>
          {error || gameStatus}
        </div>
      )}
      <div>{turnMessage(gameState)}</div>
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
    </>
  );
}
