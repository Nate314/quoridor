import type { Wall } from '../../shared/types.ts';

const SQUARE_SIZE = 52; // 50px square plus its 1px borders

type WallPieceProps = {
  wall: Wall;
  className: string;
};

export default function WallPiece({ wall, className }: WallPieceProps) {
  return (
    <div
      className={`${className} ${wall.orientation}`}
      style={{
        top: `${(wall.row * SQUARE_SIZE) + 2}px`,
        left: `${(wall.col * SQUARE_SIZE) + 2}px`
      }}
    />
  );
}
