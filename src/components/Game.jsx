import { useState, useEffect, useCallback } from 'react';
import gameService from '../services/gameService';
import UndoVote from './UndoVote';
import { BOARD_SIZE, SEATS, getValidMoves, isValidWallPlacement } from '../../shared/rules.js';

const SQUARE_SIZE = 52; // 50px square plus its 1px borders
const BOARD = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(null));

export default function Game() {
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [playerNumber, setPlayerNumber] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [error, setError] = useState(null);
  const [selectedAction, setSelectedAction] = useState('move'); // 'move', 'wall-h', or 'wall-v'
  const [wallPreview, setWallPreview] = useState(null);
  const [lastMoveHovered, setLastMoveHovered] = useState(false);
  const [lastMovePinned, setLastMovePinned] = useState(false);
  const currentPlayer = gameState?.currentPlayer;

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

  useEffect(() => {
    // Reset to move at the start of every turn
    setSelectedAction('move');
    setWallPreview(null);
  }, [currentPlayer]);

  const handleJoinGame = useCallback(() => {
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
  }, [gameId, playerName]);

  if (!gameState) {
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
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Enter your name"
              />
              <input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Enter Game ID to create or join a game"
              />
            </div>
            <button onClick={handleJoinGame}>Join Game</button>
          </div>
        </div>
      </div>
    );
  }

  const { pawns, walls, playerNames, wallCounts, activePlayers, lastMove, isGameOver } = gameState;
  const seats = Object.keys(playerNames).map(Number).sort((a, b) => a - b);
  const isMyTurn = currentPlayer === playerNumber && activePlayers.length >= 2 && !isGameOver && !gameState.undoVote;
  const validMoves = isMyTurn ? getValidMoves(gameState, playerNumber) : [];
  const showLastMove = Boolean(lastMove) && (lastMoveHovered || lastMovePinned);

  function turnMessage() {
    if (isGameOver) return 'Game Over';
    if (activePlayers.length < 2) return 'Waiting for at least one more player';
    if (!gameState.started) return `${playerNames[currentPlayer]} moves first. Joining closes after the first move.`;
    return `${playerNames[currentPlayer]}'s turn`;
  }

  function wallAt(row, col) {
    return { row, col, orientation: selectedAction === 'wall-h' ? 'horizontal' : 'vertical' };
  }

  function handleSquareClick(row, col) {
    if (!isMyTurn) return;

    if (selectedAction === 'move') {
      if (validMoves.some(move => move.row === row && move.col === col)) {
        gameService.makeMove({ type: 'move', row, col });
      }
      return;
    }

    const wall = wallAt(row, col);
    if (wallCounts[playerNumber] > 0 && isValidWallPlacement(gameState, wall)) {
      gameService.makeMove({ type: 'wall', ...wall });
      setSelectedAction('move');
      setWallPreview(null);
    }
  }

  function handleSquareHover(row, col) {
    if (!isMyTurn || selectedAction === 'move') return;
    const wall = wallAt(row, col);
    setWallPreview(isValidWallPlacement(gameState, wall) ? wall : null);
  }

  function isSamePosition(a, b) {
    return a.row === b.row && a.col === b.col;
  }

  function pawnAt(row, col) {
    return seats.find(seat => isSamePosition(pawns[seat], { row, col }));
  }

  function getSquareClassName(row, col) {
    const classNames = ['square'];
    if (validMoves.some(move => move.row === row && move.col === col)) {
      classNames.push('valid-move');
    }
    if (showLastMove && lastMove.type === 'move') {
      if (isSamePosition(lastMove.from, { row, col })) classNames.push('last-move-from');
      if (isSamePosition(lastMove.to, { row, col })) classNames.push('last-move-to');
    }
    return classNames.join(' ');
  }

  function isLastMoveWall(wall) {
    return showLastMove && lastMove.type === 'wall' &&
      isSamePosition(lastMove, wall) && lastMove.orientation === wall.orientation;
  }

  return (
    <>
      <div className="game-id">Game ID: {gameState.gameId}</div>
      <div className="game">
        <div className="player-info">
          You are {playerNames[playerNumber]} (Player {playerNumber}). Your goal: reach the {SEATS[playerNumber].goalLabel}.
        </div>
        <div className="game-info">
          {error && <div className="error">{error}</div>}
          {gameState.gameStatus && <div className="game-status">{gameState.gameStatus}</div>}
          <div>{turnMessage()}</div>
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
          <div className="action-buttons">
            <button
              onClick={() => setSelectedAction('move')}
              className={selectedAction === 'move' ? 'active' : ''}
            >
              Move
            </button>
            <button
              onClick={() => gameService.requestUndo()}
              disabled={!gameState.undoAvailable || Boolean(gameState.undoVote) || !activePlayers.includes(playerNumber) || activePlayers.length < 2}
            >
              Undo
            </button>
            <button
              onClick={() => setLastMovePinned(prev => !prev)}
              onMouseEnter={() => setLastMoveHovered(true)}
              onMouseLeave={() => setLastMoveHovered(false)}
              className={lastMovePinned ? 'active' : ''}
              disabled={!lastMove}
            >
              Show Last Move
            </button>
          </div>
        </div>
        <div className="board-area">
          <div className={`board ${isMyTurn ? '' : 'not-your-turn'} ${isGameOver ? 'game-over' : ''}`}>
            {BOARD.map((row, rowIndex) => (
              <div key={rowIndex} className="board-row">
                {row.map((_, colIndex) => {
                  const seat = pawnAt(rowIndex, colIndex);
                  return (
                    <div
                      key={colIndex}
                      className={getSquareClassName(rowIndex, colIndex)}
                      onClick={() => handleSquareClick(rowIndex, colIndex)}
                      onMouseEnter={() => handleSquareHover(rowIndex, colIndex)}
                      onMouseLeave={() => setWallPreview(null)}
                    >
                      {seat && (
                        <div className={`pawn player${seat}`} title={playerNames[seat]}>
                          {playerNames[seat]?.[0] || `P${seat}`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Wall overlay */}
            <div className="wall-overlay">
              {walls.map((wall, index) => (
                <div
                  key={index}
                  className={`wall ${wall.orientation} ${isLastMoveWall(wall) ? 'last-move' : ''}`}
                  style={{
                    top: `${(wall.row * SQUARE_SIZE) + 2}px`,
                    left: `${(wall.col * SQUARE_SIZE) + 2}px`
                  }}
                />
              ))}
            </div>
            {/* Wall preview */}
            {wallPreview && (
              <div
                className={`wall-preview ${wallPreview.orientation}`}
                style={{
                  top: `${(wallPreview.row * SQUARE_SIZE) + 2}px`,
                  left: `${(wallPreview.col * SQUARE_SIZE) + 2}px`
                }}
              />
            )}
          </div>
          {gameState.undoVote && (
            <UndoVote
              vote={gameState.undoVote}
              playerNumber={playerNumber}
              activePlayers={activePlayers}
              playerNames={playerNames}
              onVote={(approve) => gameService.voteUndo(approve)}
            />
          )}
        </div>
        <div className="wall-actions">
          <button
            onClick={() => setSelectedAction('wall-h')}
            className={selectedAction === 'wall-h' ? 'active' : ''}
          >
            Horizontal Wall
          </button>
          <button
            onClick={() => setSelectedAction('wall-v')}
            className={selectedAction === 'wall-v' ? 'active' : ''}
          >
            Vertical Wall
          </button>
        </div>
      </div>
    </>
  );
}
