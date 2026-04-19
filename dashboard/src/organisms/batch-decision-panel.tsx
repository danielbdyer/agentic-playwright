/**
 * BatchDecisionPanel organism — multi-select work item approval (Act 6).
 *
 * During intervention mode in Act 6 (Trust-Policy Gating), the operator
 * reviews and approves/skips proposals. This panel provides:
 *   - Individual approve/skip toggles per proposal
 *   - "Approve All" and "Skip All" batch actions
 *   - Governance summary (counts by status)
 *   - Timeout progress bar
 *
 * Consumes pure domain logic from product/domain/batch-decision.ts.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 6), Part VIII
 */

import { memo } from 'react';
import {
  computeSummary,
  hasPendingDecisions,
  timeoutProgress,
  formatTimeRemaining,
  selectedCount,
  STATUS_COLORS,
  type BatchDecisionState,
  type DecisionItem,
} from '../../../product/domain/proposal/batch-decision';

// ─── Component Props ───

export interface BatchDecisionPanelProps {
  readonly state: BatchDecisionState;
  readonly onApproveItem: (proposalId: string) => void;
  readonly onSkipItem: (proposalId: string) => void;
  readonly onToggleSelection: (proposalId: string) => void;
  readonly onApproveSelected: () => void;
  readonly onSkipSelected: () => void;
  readonly onToggleSelectAll: () => void;
}

// ─── Component ───

export const BatchDecisionPanel = memo(function BatchDecisionPanel({
  state,
  onApproveItem,
  onSkipItem,
  onToggleSelection,
  onApproveSelected,
  onSkipSelected,
  onToggleSelectAll,
}: BatchDecisionPanelProps) {
  const summary = computeSummary(state);
  const hasPending = hasPendingDecisions(state);
  const progress = timeoutProgress(state);
  const remaining = formatTimeRemaining(state);
  const selected = selectedCount(state);

  return (
    <div
      className="flex flex-col gap-2 p-3"
      style={{
        background: 'rgba(0,0,0,0.85)',
        borderRadius: 8,
        border: '1px solid rgba(139, 92, 246, 0.3)',
        maxHeight: 400,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/80 font-medium">Trust-Policy Decisions</span>
        <span className="text-white/50 font-mono">{remaining}</span>
      </div>

      {/* Timeout progress bar */}
      {state.timeoutMs > 0 && hasPending && (
        <div className="h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${progress * 100}%`,
              background: progress > 0.8 ? '#ef4444' : '#f59e0b',
            }}
          />
        </div>
      )}

      {/* Summary stats */}
      <div className="flex gap-3 text-xs text-white/60">
        <span>Total: {summary.total}</span>
        <span style={{ color: STATUS_COLORS['approved'] }}>✓ {summary.approved}</span>
        <span style={{ color: STATUS_COLORS['auto-approved'] }}>⚡ {summary.autoApproved}</span>
        <span style={{ color: STATUS_COLORS['skipped'] }}>⏭ {summary.skipped}</span>
        <span style={{ color: STATUS_COLORS['blocked'] }}>✗ {summary.blocked}</span>
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-1 overflow-y-auto" style={{ maxHeight: 240 }}>
        {state.items.map((item) => (
          <DecisionRow
            key={item.id}
            item={item}
            onApprove={onApproveItem}
            onSkip={onSkipItem}
            onToggle={onToggleSelection}
          />
        ))}
      </div>

      {/* Batch actions */}
      {hasPending && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/10">
          <label className="flex items-center gap-1 text-xs text-white/60 cursor-pointer">
            <input
              type="checkbox"
              checked={state.selectAll}
              onChange={onToggleSelectAll}
              className="rounded"
            />
            Select all
          </label>
          <div className="ml-auto flex gap-1">
            <button
              className="px-2 py-0.5 rounded text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors"
              style={{ border: 'none', cursor: 'pointer' }}
              onClick={onApproveSelected}
            >
              Approve{selected > 0 ? ` (${selected})` : ' All'}
            </button>
            <button
              className="px-2 py-0.5 rounded text-xs font-medium text-white/70 hover:text-white transition-colors"
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer' }}
              onClick={onSkipSelected}
            >
              Skip{selected > 0 ? ` (${selected})` : ' All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

// ─── Sub-components ───

interface DecisionRowProps {
  readonly item: DecisionItem;
  readonly onApprove: (proposalId: string) => void;
  readonly onSkip: (proposalId: string) => void;
  readonly onToggle: (proposalId: string) => void;
}

const DecisionRow = memo(function DecisionRow({
  item,
  onApprove,
  onSkip,
  onToggle,
}: DecisionRowProps) {
  const handleApprove = () => onApprove(item.proposalId);
  const handleSkip = () => onSkip(item.proposalId);
  const handleToggle = () => onToggle(item.proposalId);

  const isPending = item.status === 'pending';
  const statusColor = STATUS_COLORS[item.status];

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded text-xs"
      style={{
        background: 'rgba(255,255,255,0.03)',
        opacity: isPending ? 1 : 0.5,
      }}
    >
      {isPending && (
        <input
          type="checkbox"
          checked={item.selected}
          onChange={handleToggle}
          className="rounded"
        />
      )}
      <div
        className="w-1.5 h-1.5 rounded-full"
        style={{ background: statusColor }}
      />
      <span className="text-white/80 flex-1 truncate">{item.description}</span>
      <span className="text-white/40 font-mono">{Math.round(item.confidence * 100)}%</span>
      {isPending && (
        <div className="flex gap-1">
          <button
            className="px-1.5 py-0.5 rounded text-emerald-400 hover:bg-emerald-900/30 transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}
            onClick={handleApprove}
          >
            ✓
          </button>
          <button
            className="px-1.5 py-0.5 rounded text-white/40 hover:bg-white/10 transition-colors"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}
            onClick={handleSkip}
          >
            ⏭
          </button>
        </div>
      )}
      {!isPending && (
        <span className="text-xs" style={{ color: statusColor }}>
          {item.status}
        </span>
      )}
    </div>
  );
});
