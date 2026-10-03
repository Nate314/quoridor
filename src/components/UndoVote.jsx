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
