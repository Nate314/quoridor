import { useState, useEffect, useCallback } from 'react';
import gameService from '../services/gameService';

const BOARD_SIZE = 9;
const INITIAL_WALL_COUNT = 10;

export default function Game() {
  const [gameId, setGameId] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [playerNumber, setPlayerNumber] = useState(null);
  const [error, setError] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [playerNames, setPlayerNames] = useState({
    1: '',
    2: ''
  });
  const board = initializeBoard();
  const [currentPlayer, setCurrentPlayer] = useState(1); // 1 or 2
  const [wallCounts, setWallCounts] = useState({
    1: INITIAL_WALL_COUNT,
    2: INITIAL_WALL_COUNT
  });
  const [selectedAction, setSelectedAction] = useState('move'); // 'move', 'wall-h', or 'wall-v'
  const [pawns, setPawns] = useState({
    1: { row: 8, col: 4 }, // Player 1 starts at bottom
    2: { row: 0, col: 4 }  // Player 2 starts at top
  });
  const [walls, setWalls] = useState([]); // Array of wall objects: { row, col, orientation }
  const [validMoves, setValidMoves] = useState([]);
  const [wallPreview, setWallPreview] = useState(null);
  const [moveHistory, setMoveHistory] = useState([]); // Track moves for undo

  // Function to handle undo
  function handleUndo() {
    if (moveHistory.length === 0 || currentPlayer !== playerNumber) return;
    
    const lastMove = moveHistory[moveHistory.length - 1];
    const { prevState } = lastMove;
    
    setPawns(prevState.pawns);
    setCurrentPlayer(prevState.currentPlayer);
    setWallCounts(prevState.wallCounts);
    if (lastMove.type === 'wall') {
      setWalls(prevState.walls);
    }
    
    setMoveHistory(prev => prev.slice(0, -1));
    gameService.makeMove({ type: 'undo' });
  }

  useEffect(() => {
    // Calculate valid moves whenever the current player or board changes
    setValidMoves(calculateValidMoves(pawns[currentPlayer], pawns[currentPlayer === 1 ? 2 : 1], walls));
  }, [currentPlayer, pawns, walls]);

  function initializeBoard() {
    return Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(null));
  }

  function calculateValidMoves(pawn, otherPawn, walls) {
    if (gameState?.isGameOver) return [];
    
    const moves = [];
    const { row, col } = pawn;
    
    // Check all four directions
    const directions = [
      { row: -1, col: 0 }, // up
      { row: 1, col: 0 },  // down
      { row: 0, col: -1 }, // left
      { row: 0, col: 1 }   // right
    ];

    directions.forEach(dir => {
      const newRow = row + dir.row;
      const newCol = col + dir.col;

      if (isValidPosition(newRow, newCol) && !isBlockedByWall(row, col, newRow, newCol, walls)) {
        // Check if other pawn is in this position
        if (newRow === otherPawn.row && newCol === otherPawn.col) {
          // Jump over pawn if possible
          const jumpRow = newRow + dir.row;
          const jumpCol = newCol + dir.col;
          if (isValidPosition(jumpRow, jumpCol) && !isBlockedByWall(newRow, newCol, jumpRow, jumpCol, walls)) {
            moves.push({ row: jumpRow, col: jumpCol });
          }
        } else {
          moves.push({ row: newRow, col: newCol });
        }
      }
    });

    return moves;
  }

  function isValidPosition(row, col) {
    return row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE;
  }

  function isBlockedByWall(fromRow, fromCol, toRow, toCol, walls) {
    // Moving vertically
    if (fromCol === toCol && Math.abs(fromRow - toRow) === 1) {
      const minRow = Math.min(fromRow, toRow);
      return walls.some(wall => 
        wall.orientation === 'horizontal' &&
        wall.row === minRow &&
        (wall.col === fromCol - 1 || wall.col === fromCol)  // Check both squares covered by wall
      );
    }
    // Moving horizontally
    if (fromRow === toRow && Math.abs(fromCol - toCol) === 1) {
      const minCol = Math.min(fromCol, toCol);
      return walls.some(wall =>
        wall.orientation === 'vertical' &&
        wall.col === minCol &&
        (wall.row === fromRow - 1 || wall.row === fromRow)  // Check both squares covered by wall
      );
    }
    return false;
  }

  useEffect(() => {
    gameService.onGameState = (newGameState) => {
      setGameState(newGameState);
      if (newGameState.currentPlayer !== currentPlayer) {
        setSelectedAction('move'); // Reset to move at start of turn
      }
      setCurrentPlayer(newGameState.currentPlayer);
      setPawns(newGameState.pawns);
      setWalls(newGameState.walls);
      setWallCounts(newGameState.wallCounts);
      setMoveHistory([]); // Clear move history on new game state
      // Update player names while preserving existing ones
      if (newGameState.playerNames) {
        setPlayerNames(prevNames => ({
          ...prevNames,
          ...newGameState.playerNames
        }));
      }
    };

    gameService.onGameJoined = (data) => {
      setPlayerNumber(data.playerNumber);
      setIsConnected(true);
      setError(null);
      setGameState(data.gameState);
      // Initialize player names when joining
      setPlayerNames(prevNames => ({
        ...prevNames,
        [data.playerNumber]: playerName,
        ...(data.gameState?.playerNames || {})
      }));
    };

    gameService.onError = (message) => {
      setError(message);
    };

    gameService.onDisconnect = () => {
      setIsConnected(false);
      setPlayerNumber(null);
      setError('Opponent disconnected');
    };

    return () => {
      gameService.disconnect();
    };
  }, []);

  const handleJoinGame = useCallback(() => {
    if (!gameId.trim()) {
      setError('Please enter a game ID');
      return;
    }
    const trimmedName = playerName.trim();
    if (!trimmedName) {
      setError('Please enter your name');
      return;
    }
    // Send player name with connection and store it locally
    gameService.connect(gameId, trimmedName);
  }, [gameId, playerName]);

  function isWithinWallPlacementBounds(row, col) {
    return row >= 0 && row < BOARD_SIZE - 1 && col >= 0 && col < BOARD_SIZE - 1;
  }

  function handleSquareClick(row, col) {
    if (!isConnected) return;
    if (currentPlayer !== playerNumber) return;
    if (gameState?.isGameOver) return;

    if (selectedAction === 'move') {
      const isValidMove = validMoves.some(move => move.row === row && move.col === col);
      if (isValidMove) {
        // Store current state for undo
        const move = {
          type: 'move',
          row,
          col,
          playerName: playerNames[currentPlayer],
          prevState: {
            pawns: { ...pawns },
            currentPlayer,
            wallCounts: { ...wallCounts }
          }
        };
        
        // Make move
        gameService.makeMove(move);
        setMoveHistory(prev => [...prev, move]);
        
        // Check win condition
        if ((currentPlayer === 1 && row === 0) || (currentPlayer === 2 && row === 8)) {
          return;
        }
        
        // Switch turns and reset action to move
        setCurrentPlayer(prev => prev === 1 ? 2 : 1);
        setSelectedAction('move');
      }
    } else if (selectedAction === 'wall-h' && isWithinWallPlacementBounds(row, col)) {
      handleWallPlacement(row, col, 'horizontal');
    } else if (selectedAction === 'wall-v' && isWithinWallPlacementBounds(row, col)) {
      handleWallPlacement(row, col, 'vertical');
    }
  }

  function handleWallPlacement(row, col, orientation) {
    if (gameState?.isGameOver) return;
    if ((selectedAction === 'wall-h' || selectedAction === 'wall-v') && wallCounts[currentPlayer] > 0) {
      // Check if wall placement is valid
      const newWall = { row, col, orientation };
      if (isValidWallPlacement(newWall)) {
        const move = {
          type: 'wall',
          ...newWall,
          playerName: playerNames[currentPlayer],
          prevState: {
            walls: [...walls],
            currentPlayer,
            wallCounts: { ...wallCounts }
          }
        };
        gameService.makeMove(move);
        setMoveHistory(prev => [...prev, move]);
        setSelectedAction('move');
      }
    }
  }

  function isValidWallPlacement(newWall) {
    // Check if wall overlaps with existing walls
    const overlaps = walls.some(wall => {
      // Check overlap with same orientation walls
      if (wall.orientation === newWall.orientation) {
        if (wall.orientation === 'horizontal') {
          return wall.row === newWall.row && 
                 Math.abs(wall.col - newWall.col) <= 1;
        } else {
          return wall.col === newWall.col && 
                 Math.abs(wall.row - newWall.row) <= 1;
        }
      }
      // Check intersection between horizontal and vertical walls
      else {
        if (newWall.orientation === 'horizontal') {
          // Horizontal wall intersecting vertical wall
          return wall.col === newWall.col && wall.row === newWall.row;
        } else {
          // Vertical wall intersecting horizontal wall
          return wall.row === newWall.row && wall.col === newWall.col;
        }
      }
    });

    if (overlaps) return false;

    // Check if both players still have a path to their goals
    const wallsCopy = [...walls, newWall];
    return hasPathToGoal(pawns[1], 0, wallsCopy) && 
           hasPathToGoal(pawns[2], 8, wallsCopy);
  }

  function hasPathToGoal(start, targetRow, walls) {
    const visited = new Set();
    const queue = [[start.row, start.col]];
    
    while (queue.length > 0) {
      const [row, col] = queue.shift();
      const key = `${row},${col}`;
      
      if (visited.has(key)) continue;
      visited.add(key);
      
      if (row === targetRow) return true;
      
      // Check all adjacent squares
      const directions = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dRow, dCol] of directions) {
        const newRow = row + dRow;
        const newCol = col + dCol;
        
        if (isValidPosition(newRow, newCol) && 
            !isBlockedByWall(row, col, newRow, newCol, walls)) {
          queue.push([newRow, newCol]);
        }
      }
    }
    
    return false;
  }

  function handleSquareHover(row, col) {
    if (gameState?.isGameOver) return;
    if (selectedAction === 'wall-h' && isWithinWallPlacementBounds(row, col)) {
      const previewWall = { row, col, orientation: 'horizontal' };
      if (isValidWallPlacement(previewWall)) {
        setWallPreview(previewWall);
      }
    } else if (selectedAction === 'wall-v' && isWithinWallPlacementBounds(row, col)) {
      const previewWall = { row, col, orientation: 'vertical' };
      if (isValidWallPlacement(previewWall)) {
        setWallPreview(previewWall);
      }
    }
  }

  if (!isConnected) {
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

  return (
    <div className="game">
      <div className="player-info">
        You are {playerNames[playerNumber]} (Player {playerNumber})
      </div>
      <div className="game-info">
        {gameState?.gameStatus && <div className="game-status">{gameState.gameStatus}</div>}
        <div>{gameState?.isGameOver ? "Game Over" : `${playerNames[currentPlayer]}'s turn`}</div>
        <div>Walls remaining: {playerNames[1]}: {wallCounts[1]}, {playerNames[2]}: {wallCounts[2]}</div>
        <div className="action-buttons">
          <button 
            onClick={() => setSelectedAction('move')}
            className={selectedAction === 'move' ? 'active' : ''}
          >
            Move
          </button>
          <button
            onClick={handleUndo}
            disabled={moveHistory.length === 0 || currentPlayer !== playerNumber || gameState?.isGameOver}
          >
            Undo
          </button>
        </div>
      </div>
      <div className={`board ${currentPlayer !== playerNumber || gameState?.isGameOver ? 'not-your-turn' : ''} ${gameState?.isGameOver ? 'game-over' : ''}`}>
        {board.map((row, rowIndex) => (
          <div key={rowIndex} className="board-row">
            {row.map((_, colIndex) => (
              <div
                key={colIndex}
                className={`square ${
                  !gameState?.isGameOver && validMoves.some(move => move.row === rowIndex && move.col === colIndex) ? 'valid-move' : ''
                }`}
                onClick={() => handleSquareClick(rowIndex, colIndex)}
                onMouseEnter={() => handleSquareHover(rowIndex, colIndex)}
                onMouseLeave={() => setWallPreview(null)}
              >
                {pawns[1].row === rowIndex && pawns[1].col === colIndex && 
                  <div className="pawn player1" title={playerNames[1]}>{playerNames[1]?.[0] || 'P1'}</div>
                }
                {pawns[2].row === rowIndex && pawns[2].col === colIndex && 
                  <div className="pawn player2" title={playerNames[2]}>{playerNames[2]?.[0] || 'P2'}</div>
                }
              </div>
            ))}
          </div>
        ))}
        {/* Wall overlay */}
        <div className="wall-overlay">
          {walls.map((wall, index) => (
            <div
              key={index}
              className={`wall ${wall.orientation}`}
              style={{
                top: `${(wall.row * 52) + 2}px`,
                left: `${(wall.col * 52) + 2}px`
              }}
            />
          ))}
        </div>
        {/* Wall preview */}
        {wallPreview && (
          <div
            className={`wall-preview ${wallPreview.orientation}`}
            style={{
              top: `${(wallPreview.row * 52) + 2}px`,
              left: `${(wallPreview.col * 52) + 2}px`
            }}
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
  );
  }
