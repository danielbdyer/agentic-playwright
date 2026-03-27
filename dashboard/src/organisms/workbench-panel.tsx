/**
 * WorkbenchPanel — static workbench inbox grouped by screen.
 * FP: immutable groupBy via reduce (no mutable Map + push).
 * Organism. Memo-wrapped.
 */
import { memo, useMemo } from 'react';
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

/** Group items by screen via immutable reduce. O(n). */
const groupByScreen = (items: readonly WorkItem[]): readonly (readonly [string, readonly WorkItem[]])[] =>
  Object.entries(
    items.reduce<Record<string, WorkItem[]>>((acc, item) => {
      const screen = item.context.screen ?? 'unknown';
      return { ...acc, [screen]: [...(acc[screen] ?? []), item] };
    }, {}),
  );

export const WorkbenchPanel = memo(function WorkbenchPanel({ workbench, onApprove, onSkip }: WorkbenchPanelProps) {
  const byScreen = useMemo(
    () => workbench?.items.length ? groupByScreen(workbench.items) : [],
    [workbench?.items],
  );

  if (byScreen.length === 0) return <div className="card card-full"><h2>Workbench</h2><div className="empty">No pending items. Converged.</div></div>;
  return (
    <div className="card card-full">
      <h2>Workbench — {workbench!.summary.pending} pending</h2>
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
                <button className="btn btn-approve" onClick={() => onApprove(item.id)}>Approve</button>
                <button className="btn" onClick={() => onSkip(item.id)}>Skip</button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
});
