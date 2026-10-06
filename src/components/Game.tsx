import { useState } from 'react';
import useGameConnection from '../hooks/useGameConnection';
import GameScreen from './GameScreen';
import JoinForm from './JoinForm';

export default function Game() {
  // Kept here so the form is still filled in after a disconnect
  const [playerName, setPlayerName] = useState('');
  const [gameId, setGameId] = useState('');
  const { playerNumber, gameState, error, join } = useGameConnection();

  if (!gameState || playerNumber === null) {
    return (
      <JoinForm
        playerName={playerName}
        gameId={gameId}
        error={error}
        onPlayerNameChange={setPlayerName}
        onGameIdChange={setGameId}
        onJoin={() => join(gameId, playerName)}
      />
    );
  }

  return <GameScreen gameState={gameState} playerNumber={playerNumber} error={error} />;
}
