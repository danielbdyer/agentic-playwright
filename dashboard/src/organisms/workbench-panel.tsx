/**
 * WorkbenchPanel — static workbench inbox grouped by screen.
 * FP: immutable groupBy via reduce (no mutable Map + push).
 * W5.20: useOptimistic provides instant visual feedback on approve/skip.
 * Organism. Memo-wrapped.
 */
import { memo, useOptimistic } from 'react';
import { KIND_COLORS } from '../atoms/colors';

interface WorkItem {
  readonly id: string;
  readonly kind: string;
  readonly priority: number;
  readonly title: string;
  readonly context: { readonly screen?: string; readonly element?: string; readonly artifactRefs: readonly string[] };
}

interface Workbench {
  readonly items: readonly WorkItem[];
  readonly summary: { readonly pending: number };
}

interface WorkbenchPanelProps {
  readonly workbench: Workbench | null;
  readonly onApprove: (id: string) => void;
  readonly onSkip: (id: string) => void;
}

/** Optimistic decision applied before server confirms. */
interface OptimisticDecision {
  readonly id: string;
  readonly result: 'approved' | 'skipped';
}

/** Apply optimistic decisions to the item list. Pure reducer. */
const applyOptimisticDecision = (
  items: readonly WorkItem[],
  decision: OptimisticDecision,
): readonly WorkItem[] =>
  items.filter((item) => item.id !== decision.id);

/** Deduplicate items by id, keeping the last occurrence. O(n). */
const deduplicateById = (items: readonly WorkItem[]): readonly WorkItem[] =>
  [...new Map(items.map((item) => [item.id, item] as const)).values()];

/** Group items by screen via immutable reduce. O(n). */
const groupByScreen = (items: readonly WorkItem[]): readonly (readonly [string, readonly WorkItem[]])[] =>
  Object.entries(
    items.reduce<Record<string, WorkItem[]>>((acc, item) => {
      const screen = item.context.screen ?? 'unknown';
      return { ...acc, [screen]: [...(acc[screen] ?? []), item] };
    }, {}),
  );

export const WorkbenchPanel = memo(function WorkbenchPanel({ workbench, onApprove, onSkip }: WorkbenchPanelProps) {
  // W5.20: useOptimistic for instant proposal approval/skip feedback.
  // Items disappear immediately; reconciled when server confirms via WebSocket.
  const [optimisticItems, addOptimisticDecision] = useOptimistic(
    workbench?.items ?? [],
    applyOptimisticDecision,
  );

  const handleApprove = (id: string) => {
    addOptimisticDecision({ id, result: 'approved' });
    onApprove(id);
  };

  const handleSkip = (id: string) => {
    addOptimisticDecision({ id, result: 'skipped' });
    onSkip(id);
  };

  // React Compiler auto-memoizes this grouping derivation
  const uniqueItems = deduplicateById(optimisticItems);
  const byScreen = uniqueItems.length > 0 ? groupByScreen(uniqueItems) : [];

  if (byScreen.length === 0) return <div className="card card-full"><h2>Workbench</h2><div className="empty">No pending items. Converged.</div></div>;
  return (
    <div className="card card-full">
      <h2>Workbench — {uniqueItems.length} pending</h2>
      {byScreen.map(([screen, items]) => (
        <div key={screen} className="screen-group">
          <div className="screen-header">{screen} ({items.length})</div>
          {items.map((item) => (
            <div key={item.id} className="queue-item" data-status="pending">
              <div className="item-content">
                <div className="item-title"><span className="item-badge" style={{ background: `${KIND_COLORS[item.kind] ?? '#484f58'}33`, color: KIND_COLORS[item.kind] ?? '#484f58' }}>{item.kind}</span> {item.title}</div>
              </div>
              <div className="item-actions">
                <span className="priority-score">{item.priority.toFixed(3)}</span>
                <button className="btn btn-approve" onClick={() => handleApprove(item.id)}>Approve</button>
                <button className="btn" onClick={() => handleSkip(item.id)}>Skip</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
