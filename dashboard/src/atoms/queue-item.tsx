/**
 * QueueItemView — single work item in the Effect queue.
 * Shows kind badge, title, rationale (when processing), and action buttons.
 * W5.22: React 19 ref-as-prop — ref is a regular prop, no forwardRef wrapper.
 * Pure atom. Memo-wrapped.
 */
import { memo, type Ref } from 'react';
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
  readonly ref?: Ref<HTMLDivElement>;
}

export const QueueItemView = memo(function QueueItemView({
  id, kind, priority, title, rationale, displayStatus, screen, element, onApprove, onSkip, ref,
}: QueueItemProps) {
  const color = KIND_COLORS[kind] ?? '#484f58';
  const isDeciding = displayStatus === 'processing';
  return (
    <div ref={ref} className="queue-item" data-status={displayStatus} style={{ position: 'relative' }}>
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
            <button className="btn btn-approve" onClick={() => onApprove(id)} aria-label={`Approve ${kind} work item`}>Approve</button>
            <button className="btn" onClick={() => onSkip(id)} aria-label={`Skip ${kind} work item`}>Skip</button>
          </>
        )}
      </div>
    </div>
  );
});
