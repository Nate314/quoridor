import type { Seat } from '../../shared/types.ts';

type PawnProps = {
  seat: Seat;
  name: string;
};

export default function Pawn({ seat, name }: PawnProps) {
  return (
    <div className={`pawn player${seat}`} title={name}>
      {name?.[0] || `P${seat}`}
    </div>
  );
}
