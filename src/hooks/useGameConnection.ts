import { useState, useEffect, useCallback } from 'react';
import gameService from '../services/gameService';
import type { PublicGameState, Seat } from '../../shared/types.ts';

export default function useGameConnection() {
  const [playerNumber, setPlayerNumber] = useState<Seat | null>(null);
  const [gameState, setGameState] = useState<PublicGameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    gameService.onGameJoined = (data) => {
      setPlayerNumber(data.playerNumber);
      setGameState(data.gameState);
      setError(null);
    };

    gameService.onGameState = (newGameState) => {
      setGameState(newGameState);
      setError(null);
    };

    gameService.onError = setError;

    gameService.onDisconnect = () => {
      setPlayerNumber(null);
      setGameState(null);
      setError('Disconnected from server');
    };

    return () => {
      gameService.disconnect();
    };
  }, []);

  const join = useCallback((gameId: string, playerName: string) => {
    const trimmedGameId = gameId.trim();
    const trimmedName = playerName.trim();
    if (!trimmedGameId) {
      setError('Please enter a game ID');
      return;
    }
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    setError(null);
    gameService.connect(trimmedGameId, trimmedName);
  }, []);

  return { playerNumber, gameState, error, join };
}
