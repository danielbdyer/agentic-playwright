/** QueueVisualization — animated queue of Effect work items. Organism. */
import { memo } from 'react';
import { QueueItemView, type DisplayStatus } from '../atoms/queue-item';

interface QueuedItem {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly rationale: string;
  readonly displayStatus: DisplayStatus;
  readonly context: { readonly screen?: string; readonly element?: string };
}

interface QueueVisualizationProps {
  readonly queue: readonly QueuedItem[];
  readonly onApprove: (id: string) => void;
  readonly onSkip: (id: string) => void;
}

export const QueueVisualization = memo(function QueueVisualization({ queue, onApprove, onSkip }: QueueVisualizationProps) {
  if (queue.length === 0) return null;
  return (
    <div className="card card-full">
      <h2>Effect Queue — {queue.length} items</h2>
      <div className="queue-container">
        {queue.map((item) => (
          <QueueItemView
            key={item.id}
            id={item.id}
            kind={item.kind}
            priority={item.priority}
            title={item.title}
            rationale={item.rationale}
            displayStatus={item.displayStatus}
            screen={item.context.screen}
            element={item.context.element}
            onApprove={onApprove}
            onSkip={onSkip}
          />
        ))}
      </div>
    </div>
  );
});
