import type { Action } from '../types.ts';

const ACTIONS: { action: Action; label: string }[] = [
  { action: 'move', label: 'Move' },
  { action: 'wall-h', label: 'Horizontal Wall' },
  { action: 'wall-v', label: 'Vertical Wall' }
];

type TurnActionsProps = {
  selectedAction: Action;
  onSelectAction: (action: Action) => void;
};

export default function TurnActions({ selectedAction, onSelectAction }: TurnActionsProps) {
  return (
    <div className="turn-actions">
      <div className="panel-title">Your action</div>
      {ACTIONS.map(({ action, label }) => (
        <button
          key={action}
          onClick={() => onSelectAction(action)}
          className={selectedAction === action ? 'active' : ''}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
