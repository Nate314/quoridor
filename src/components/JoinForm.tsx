type JoinFormProps = {
  playerName: string;
  gameId: string;
  error: string | null;
  onPlayerNameChange: (playerName: string) => void;
  onGameIdChange: (gameId: string) => void;
  onJoin: () => void;
};

export default function JoinForm({ playerName, gameId, error, onPlayerNameChange, onGameIdChange, onJoin }: JoinFormProps) {
  return (
    <div className="game">
      <div className="game-info">
        <h2>Join a Game</h2>
        {error && <div className="error">{error}</div>}
        <div className="join-form">
          <div className="input-group">
            <input
              type="text"
              value={playerName}
              onChange={(e) => onPlayerNameChange(e.target.value)}
              maxLength={20}
              placeholder="Enter your name"
            />
            <input
              type="text"
              value={gameId}
              onChange={(e) => onGameIdChange(e.target.value)}
              maxLength={20}
              placeholder="Enter Game ID to create or join a game"
            />
          </div>
          <button onClick={onJoin}>Join Game</button>
        </div>
      </div>
    </div>
  );
}
