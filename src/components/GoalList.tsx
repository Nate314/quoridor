import { SEATS } from '../../shared/rules.ts';
import type { PublicGameState, Seat } from '../../shared/types.ts';

type GoalListProps = {
  gameState: PublicGameState;
  playerNumber: Seat;
};

export default function GoalList({ gameState, playerNumber }: GoalListProps) {
  const { playerNames, activePlayers } = gameState;
  const seats = Object.keys(playerNames).map(Number).sort((a, b) => a - b);

  return (
    <div className="goal-list">
      <div className="panel-title">Goals</div>
      {seats.map(seat => {
        const classNames = ['goal-list-row'];
        if (seat === playerNumber) classNames.push('goal-list-you');
        if (!activePlayers.includes(seat)) classNames.push('player-left');
        return (
          <div key={seat} className={classNames.join(' ')}>
            <span className={`goal-dot player${seat}`} />
            {playerNames[seat]}
            {seat === playerNumber && ' (you)'} → {SEATS[seat].goalLabel}
          </div>
        );
      })}
    </div>
  );
}
