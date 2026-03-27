/**
 * QueueItemView — single work item in the Effect queue.
 * Shows kind badge, title, rationale (when processing), and action buttons.
 * Pure atom. Memo-wrapped.
 */
import { memo } from 'react';
import { KIND_COLORS } from './colors';

export type DisplayStatus = 'entering' | 'pending' | 'processing' | 'completed' | 'skipped';

interface QueueItemProps {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly displayStatus: DisplayStatus;
  readonly screen?: string | undefined;
  readonly element?: string | undefined;
  readonly onApprove: (id: string) => void;
  readonly onSkip: (id: string) => void;
}

export const QueueItemView = memo(function QueueItemView({
  id, kind, priority, title, rationale, displayStatus, screen, element, onApprove, onSkip,
}: QueueItemProps) {
  const color = KIND_COLORS[kind] ?? '#484f58';
  const isDeciding = displayStatus === 'processing';
  return (
    <div className="queue-item" data-status={displayStatus} style={{ position: 'relative' }}>
      <div className="item-content">
        <div className="item-title">
          <span className="item-badge" style={{ background: `${color}33`, color }}>{kind}</span>
          {title}
        </div>
        {isDeciding && <div className="item-detail">{rationale}</div>}
        {isDeciding && screen && <div className="item-detail">Screen: {screen}{element ? ` / ${element}` : ''}</div>}
      </div>
      <div className="item-actions">
        <span className="priority-score">{priority.toFixed(3)}</span>
        {isDeciding && (
          <>
            <button className="btn btn-approve" onClick={() => onApprove(id)}>Approve</button>
            <button className="btn" onClick={() => onSkip(id)}>Skip</button>
          </>
        )}
      </div>
    </div>
  );
});
