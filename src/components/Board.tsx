import { useState } from 'react';
import Pawn from './Pawn';
import WallPiece from './WallPiece';
import { BOARD_SIZE, getValidMoves, isValidWallPlacement } from '../../shared/rules.ts';
import type { Move, PlacedWall, Position, PublicGameState, Seat, Wall } from '../../shared/types.ts';
import type { Action } from '../types.ts';

const INDEXES = Array.from({ length: BOARD_SIZE }, (_, index) => index);

type BoardProps = {
  gameState: PublicGameState;
  playerNumber: Seat;
  isMyTurn: boolean;
  selectedAction: Action;
  showLastMove: boolean;
  onMove: (move: Move) => void;
};

function isSamePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

export default function Board({ gameState, playerNumber, isMyTurn, selectedAction, showLastMove, onMove }: BoardProps) {
  const [hoveredSquare, setHoveredSquare] = useState<Position | null>(null);
  const { pawns, walls, playerNames, wallCounts, lastMove, isGameOver } = gameState;
  const seats = Object.keys(playerNames).map(Number);
  const validMoves = isMyTurn ? getValidMoves(gameState, playerNumber) : [];
  const placingWall = isMyTurn && selectedAction !== 'move';
  const hoveredWall = placingWall && hoveredSquare ? wallAt(hoveredSquare) : null;
  const wallPreview = hoveredWall && canPlaceWall(hoveredWall) ? hoveredWall : null;

  function wallAt(position: Position): Wall {
    return { ...position, orientation: selectedAction === 'wall-h' ? 'horizontal' : 'vertical' };
  }

  function canPlaceWall(wall: Wall): boolean {
    return wallCounts[playerNumber] > 0 && isValidWallPlacement(gameState, wall);
  }

  function isValidMove(position: Position): boolean {
    return validMoves.some(move => isSamePosition(move, position));
  }

  function handleSquareClick(position: Position) {
    if (!isMyTurn) return;

    if (!placingWall) {
      if (isValidMove(position)) onMove({ type: 'move', ...position });
      return;
    }

    const wall = wallAt(position);
    if (canPlaceWall(wall)) onMove({ type: 'wall', ...wall });
  }

  function pawnAt(position: Position): Seat | undefined {
    return seats.find(seat => isSamePosition(pawns[seat], position));
  }

  function getSquareClassName(position: Position): string {
    const classNames = ['square'];
    if (isValidMove(position)) classNames.push('valid-move');
    if (showLastMove && lastMove?.type === 'move') {
      if (isSamePosition(lastMove.from, position)) classNames.push('last-move-from');
      if (isSamePosition(lastMove.to, position)) classNames.push('last-move-to');
    }
    return classNames.join(' ');
  }

  function isLastMoveWall(wall: PlacedWall): boolean {
    return showLastMove && lastMove?.type === 'wall' &&
      isSamePosition(lastMove, wall) && lastMove.orientation === wall.orientation;
  }

  return (
    <div className={`board ${isMyTurn ? '' : 'not-your-turn'} ${isGameOver ? 'game-over' : ''}`}>
      {INDEXES.map(row => (
        <div key={row} className="board-row">
          {INDEXES.map(col => {
            const position = { row, col };
            const seat = pawnAt(position);
            return (
              <div
                key={col}
                className={getSquareClassName(position)}
                onClick={() => handleSquareClick(position)}
                onMouseEnter={() => setHoveredSquare(position)}
                onMouseLeave={() => setHoveredSquare(null)}
              >
                {seat && <Pawn seat={seat} name={playerNames[seat]} />}
              </div>
            );
          })}
        </div>
      ))}
      <div className="wall-overlay">
        {walls.map((wall, index) => (
          <WallPiece key={index} wall={wall} className={isLastMoveWall(wall) ? 'wall last-move' : 'wall'} />
        ))}
      </div>
      {wallPreview && <WallPiece wall={wallPreview} className="wall-preview" />}
    </div>
  );
}
