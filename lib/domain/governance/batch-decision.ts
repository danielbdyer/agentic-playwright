/**
 * BatchDecision — pure domain module for multi-select decision interaction.
 *
 * During Act 6 (Trust-Policy Gating), the operator may need to make
 * decisions on multiple proposals simultaneously. The batch decision panel
 * provides multi-select interaction:
 *
 *   - Individual approve/skip toggles per proposal
 *   - "Approve All" and "Skip All" batch actions
 *   - Governance summary (counts by decision type)
 *   - Confidence distribution visualization
 *   - Auto-timeout with configurable duration
 *
 * Decision model:
 *   - Pending: awaiting operator decision
 *   - Approved: operator approved the proposal
 *   - Skipped: operator skipped (deferred) the proposal
 *   - Auto-approved: confidence above threshold, no human needed
 *   - Blocked: trust policy blocked, operator cannot override
 *
 * Pure domain logic. No React.
 *
 * @see docs/first-day-flywheel-visualization.md Part I (Act 6), Part VI
 */

// ─── Types ───

/** Decision status for a proposal. */
export type DecisionStatus =
  | 'pending'
  | 'approved'
  | 'skipped'
  | 'auto-approved'
  | 'blocked';

/** A proposal awaiting decision. */
export interface DecisionItem {
  readonly id: string;
  readonly proposalId: string;
  readonly artifactType: string;
  readonly description: string;
  readonly confidence: number;         // [0, 1]
  readonly trustPolicyRule: string;
  readonly status: DecisionStatus;
  readonly selected: boolean;          // Multi-select toggle
  readonly arrivedAt: number;          // Timestamp
  readonly decidedAt: number | null;   // When decided
}

/** Summary of decisions. */
export interface DecisionSummary {
  readonly total: number;
  readonly pending: number;
  readonly approved: number;
  readonly skipped: number;
  readonly autoApproved: number;
  readonly blocked: number;
  readonly avgConfidence: number;
}

/** Full batch decision state. */
export interface BatchDecisionState {
  readonly items: readonly DecisionItem[];
  readonly selectAll: boolean;
  readonly timeoutMs: number;         // 0 = infinite
  readonly elapsedMs: number;         // Time since first pending item
}

// ─── Constants ───

/** Default decision timeout (seconds). */
export const DEFAULT_TIMEOUT_SECONDS = 120;

/** Auto-approval confidence threshold. */
export const AUTO_APPROVAL_THRESHOLD = 0.95;

export const INITIAL_BATCH_STATE: BatchDecisionState = {
  items: [],
  selectAll: false,
  timeoutMs: DEFAULT_TIMEOUT_SECONDS * 1000,
  elapsedMs: 0,
};

/** Status colors. */
export const STATUS_COLORS: Readonly<Record<DecisionStatus, string>> = {
  pending:       '#f59e0b', // Amber
  approved:      '#22c55e', // Green
  skipped:       '#94a3b8', // Gray
  'auto-approved': '#06b6d4', // Cyan
  blocked:       '#ef4444', // Red
} as const;

// ─── State Transitions ───

/**
 * Add a new proposal item to the batch.
 * Items with confidence above threshold are auto-approved.
 */
export function addItem(
  state: BatchDecisionState,
  proposalId: string,
  artifactType: string,
  description: string,
  confidence: number,
  trustPolicyRule: string,
  timestamp: number,
): BatchDecisionState {
  const isAutoApproved = confidence >= AUTO_APPROVAL_THRESHOLD;
  const isBlocked = trustPolicyRule === 'blocked';

  const status: DecisionStatus = isBlocked
    ? 'blocked'
    : isAutoApproved
      ? 'auto-approved'
      : 'pending';

  const newItem: DecisionItem = {
    id: `decision-${proposalId}`,
    proposalId,
    artifactType,
    description,
    confidence: Math.max(0, Math.min(1, confidence)),
    trustPolicyRule,
    status,
    selected: false,
    arrivedAt: timestamp,
    decidedAt: isAutoApproved || isBlocked ? timestamp : null,
  };

  return {
    ...state,
    items: [...state.items, newItem],
  };
}

/**
 * Toggle selection on a specific item.
 */
export function toggleSelection(
  state: BatchDecisionState,
  proposalId: string,
): BatchDecisionState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.proposalId === proposalId && item.status === 'pending'
        ? { ...item, selected: !item.selected }
        : item,
    ),
    selectAll: false,
  };
}

/**
 * Toggle select-all on pending items.
 */
export function toggleSelectAll(state: BatchDecisionState): BatchDecisionState {
  const newSelectAll = !state.selectAll;
  return {
    ...state,
    selectAll: newSelectAll,
    items: state.items.map((item) =>
      item.status === 'pending'
        ? { ...item, selected: newSelectAll }
        : item,
    ),
  };
}

/**
 * Approve all selected (or all pending if none selected) items.
 */
export function approveSelected(
  state: BatchDecisionState,
  timestamp: number,
): BatchDecisionState {
  const hasSelection = state.items.some((i) => i.selected);

  return {
    ...state,
    selectAll: false,
    items: state.items.map((item) => {
      if (item.status !== 'pending') return item;
      if (hasSelection && !item.selected) return item;
      return {
        ...item,
        status: 'approved' as DecisionStatus,
        selected: false,
        decidedAt: timestamp,
      };
    }),
  };
}

/**
 * Skip all selected (or all pending if none selected) items.
 */
export function skipSelected(
  state: BatchDecisionState,
  timestamp: number,
): BatchDecisionState {
  const hasSelection = state.items.some((i) => i.selected);

  return {
    ...state,
    selectAll: false,
    items: state.items.map((item) => {
      if (item.status !== 'pending') return item;
      if (hasSelection && !item.selected) return item;
      return {
        ...item,
        status: 'skipped' as DecisionStatus,
        selected: false,
        decidedAt: timestamp,
      };
    }),
  };
}

/**
 * Approve a specific item by proposal ID.
 */
export function approveItem(
  state: BatchDecisionState,
  proposalId: string,
  timestamp: number,
): BatchDecisionState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.proposalId === proposalId && item.status === 'pending'
        ? { ...item, status: 'approved' as DecisionStatus, decidedAt: timestamp }
        : item,
    ),
  };
}

/**
 * Skip a specific item by proposal ID.
 */
export function skipItem(
  state: BatchDecisionState,
  proposalId: string,
  timestamp: number,
): BatchDecisionState {
  return {
    ...state,
    items: state.items.map((item) =>
      item.proposalId === proposalId && item.status === 'pending'
        ? { ...item, status: 'skipped' as DecisionStatus, decidedAt: timestamp }
        : item,
    ),
  };
}

/**
 * Advance the elapsed timer. Returns auto-skipped state if timeout reached.
 */
export function advanceTimer(
  state: BatchDecisionState,
  deltaMs: number,
  timestamp: number,
): BatchDecisionState {
  const newElapsed = state.elapsedMs + deltaMs;

  // Check timeout
  if (state.timeoutMs > 0 && newElapsed >= state.timeoutMs) {
    // Auto-skip all remaining pending items
    return {
      ...state,
      elapsedMs: newElapsed,
      items: state.items.map((item) =>
        item.status === 'pending'
          ? { ...item, status: 'skipped' as DecisionStatus, decidedAt: timestamp }
          : item,
      ),
    };
  }

  return { ...state, elapsedMs: newElapsed };
}

// ─── Computed Properties ───

/**
 * Compute decision summary.
 */
export function computeSummary(state: BatchDecisionState): DecisionSummary {
  const items = state.items;
  const total = items.length;
  const pending = items.filter((i) => i.status === 'pending').length;
  const approved = items.filter((i) => i.status === 'approved').length;
  const skipped = items.filter((i) => i.status === 'skipped').length;
  const autoApproved = items.filter((i) => i.status === 'auto-approved').length;
  const blocked = items.filter((i) => i.status === 'blocked').length;
  const totalConfidence = items.reduce((sum, i) => sum + i.confidence, 0);

  return {
    total,
    pending,
    approved,
    skipped,
    autoApproved,
    blocked,
    avgConfidence: total > 0 ? totalConfidence / total : 0,
  };
}

/**
 * Are there any pending decisions?
 */
export function hasPendingDecisions(state: BatchDecisionState): boolean {
  return state.items.some((i) => i.status === 'pending');
}

/**
 * Get the timeout progress [0, 1].
 */
export function timeoutProgress(state: BatchDecisionState): number {
  if (state.timeoutMs <= 0) return 0;
  return Math.min(1, state.elapsedMs / state.timeoutMs);
}

/**
 * Count selected pending items.
 */
export function selectedCount(state: BatchDecisionState): number {
  return state.items.filter((i) => i.selected && i.status === 'pending').length;
}

/**
 * Format timeout remaining as human-readable string.
 */
export function formatTimeRemaining(state: BatchDecisionState): string {
  if (state.timeoutMs <= 0) return '∞';
  const remainingMs = Math.max(0, state.timeoutMs - state.elapsedMs);
  const seconds = Math.ceil(remainingMs / 1000);
  if (seconds >= 60) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }
  return `${seconds}s`;
}
