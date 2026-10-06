import type { Action } from '../types.ts';

type WallActionsProps = {
  selectedAction: Action;
  onSelectAction: (action: Action) => void;
};

export default function WallActions({ selectedAction, onSelectAction }: WallActionsProps) {
  return (
    <div className="wall-actions">
      <button
        onClick={() => onSelectAction('wall-h')}
        className={selectedAction === 'wall-h' ? 'active' : ''}
      >
        Horizontal Wall
      </button>
      <button
        onClick={() => onSelectAction('wall-v')}
        className={selectedAction === 'wall-v' ? 'active' : ''}
      >
        Vertical Wall
      </button>
    </div>
  );
}
