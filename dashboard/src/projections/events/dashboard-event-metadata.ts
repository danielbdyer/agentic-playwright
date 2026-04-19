import type { DashboardEventKind } from '../../../../product/domain/observation/dashboard';

export type DashboardEventLane =
  | 'lifecycle'
  | 'surface'
  | 'queue'
  | 'trust'
  | 'system';

export type DashboardEventSeverity =
  | 'neutral'
  | 'info'
  | 'warning'
  | 'critical';

export interface DashboardEventMetadata {
  readonly label: string;
  readonly lane: DashboardEventLane;
  readonly severity: DashboardEventSeverity;
  readonly hotPath: boolean;
}

export const DASHBOARD_EVENT_METADATA = {
  'iteration-start': {
    label: 'Iteration started',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  'iteration-complete': {
    label: 'Iteration completed',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  progress: {
    label: 'Progress updated',
    lane: 'lifecycle',
    severity: 'neutral',
    hotPath: true,
  },
  'element-probed': {
    label: 'Element probed',
    lane: 'surface',
    severity: 'neutral',
    hotPath: true,
  },
  'screen-captured': {
    label: 'Screen captured',
    lane: 'surface',
    severity: 'info',
    hotPath: false,
  },
  'item-pending': {
    label: 'Work item queued',
    lane: 'queue',
    severity: 'warning',
    hotPath: false,
  },
  'item-processing': {
    label: 'Work item processing',
    lane: 'queue',
    severity: 'info',
    hotPath: false,
  },
  'item-completed': {
    label: 'Work item completed',
    lane: 'queue',
    severity: 'info',
    hotPath: false,
  },
  'workbench-updated': {
    label: 'Workbench updated',
    lane: 'queue',
    severity: 'neutral',
    hotPath: false,
  },
  'fitness-updated': {
    label: 'Fitness updated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'element-escalated': {
    label: 'Element escalated',
    lane: 'queue',
    severity: 'warning',
    hotPath: false,
  },
  'inbox-item-arrived': {
    label: 'Inbox item arrived',
    lane: 'queue',
    severity: 'warning',
    hotPath: false,
  },
  'fiber-paused': {
    label: 'Fiber paused',
    lane: 'queue',
    severity: 'critical',
    hotPath: false,
  },
  'fiber-resumed': {
    label: 'Fiber resumed',
    lane: 'queue',
    severity: 'info',
    hotPath: false,
  },
  'rung-shift': {
    label: 'Rung shifted',
    lane: 'trust',
    severity: 'warning',
    hotPath: false,
  },
  'calibration-update': {
    label: 'Calibration updated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'proposal-activated': {
    label: 'Proposal activated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'confidence-crossed': {
    label: 'Confidence threshold crossed',
    lane: 'trust',
    severity: 'warning',
    hotPath: false,
  },
  'artifact-written': {
    label: 'Artifact written',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  'stage-lifecycle': {
    label: 'Stage lifecycle updated',
    lane: 'lifecycle',
    severity: 'neutral',
    hotPath: false,
  },
  'screen-group-start': {
    label: 'Screen group started',
    lane: 'surface',
    severity: 'info',
    hotPath: false,
  },
  connected: {
    label: 'Dashboard connected',
    lane: 'system',
    severity: 'info',
    hotPath: false,
  },
  error: {
    label: 'Dashboard error',
    lane: 'system',
    severity: 'critical',
    hotPath: false,
  },
  'surface-discovered': {
    label: 'Surface discovered',
    lane: 'surface',
    severity: 'info',
    hotPath: false,
  },
  'route-navigated': {
    label: 'Route navigated',
    lane: 'surface',
    severity: 'neutral',
    hotPath: true,
  },
  'aria-tree-captured': {
    label: 'ARIA tree captured',
    lane: 'surface',
    severity: 'neutral',
    hotPath: true,
  },
  'suite-slice-selected': {
    label: 'Suite slice selected',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  'scenario-prioritized': {
    label: 'Scenario prioritized',
    lane: 'lifecycle',
    severity: 'neutral',
    hotPath: false,
  },
  'step-bound': {
    label: 'Step bound',
    lane: 'lifecycle',
    severity: 'neutral',
    hotPath: false,
  },
  'scenario-compiled': {
    label: 'Scenario compiled',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  'step-executing': {
    label: 'Step executing',
    lane: 'lifecycle',
    severity: 'neutral',
    hotPath: true,
  },
  'step-resolved': {
    label: 'Step resolved',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: true,
  },
  'scenario-executed': {
    label: 'Scenario executed',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  'trust-policy-evaluated': {
    label: 'Trust policy evaluated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'knowledge-activated': {
    label: 'Knowledge activated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'convergence-evaluated': {
    label: 'Convergence evaluated',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'iteration-summary': {
    label: 'Iteration summary',
    lane: 'lifecycle',
    severity: 'info',
    hotPath: false,
  },
  diagnostics: {
    label: 'Diagnostics',
    lane: 'system',
    severity: 'neutral',
    hotPath: false,
  },
  'learning-signals': {
    label: 'Learning signals',
    lane: 'trust',
    severity: 'info',
    hotPath: false,
  },
  'browser-pool-health': {
    label: 'Browser pool health',
    lane: 'system',
    severity: 'neutral',
    hotPath: false,
  },
  'proposal-quarantined': {
    label: 'Proposal quarantined',
    lane: 'trust',
    severity: 'warning',
    hotPath: false,
  },
} as const satisfies Readonly<Record<DashboardEventKind, DashboardEventMetadata>>;

export const DASHBOARD_EVENT_KINDS = Object.keys(
  DASHBOARD_EVENT_METADATA,
) as readonly DashboardEventKind[];

const dashboardEventKindSet = new Set<DashboardEventKind>(DASHBOARD_EVENT_KINDS);

export const isDashboardEventKind = (kind: string): kind is DashboardEventKind =>
  dashboardEventKindSet.has(kind as DashboardEventKind);

export const getDashboardEventMetadata = (
  kind: DashboardEventKind,
): DashboardEventMetadata => DASHBOARD_EVENT_METADATA[kind];

type DashboardEventKindsMissing = Exclude<
  DashboardEventKind,
  keyof typeof DASHBOARD_EVENT_METADATA
>;

const DASHBOARD_EVENT_KIND_EXHAUSTIVE_CHECK:
  DashboardEventKindsMissing extends never ? true : never = true;

void DASHBOARD_EVENT_KIND_EXHAUSTIVE_CHECK;
