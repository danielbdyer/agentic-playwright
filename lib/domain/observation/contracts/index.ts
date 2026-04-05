/**
 * Dashboard contracts export surface.
 *
 * Canonical, stable import root for dashboard-consumed domain symbols.
 * Keep additive while migrating call sites away from deep domain imports.
 */

export * from '../dashboard';

export type {
  Governance,
  ResolutionMode,
} from '../../governance/workflow-types';

export * from '../../handshake/workbench';

export * from '../../projection/act-indicator';
export * from '../../projection/binding-distribution';
export * from '../../projection/convergence-finale';
export * from '../../projection/iteration-timeline';
export * from '../../projection/scene-state-accumulator';
export * from '../../projection/speed-tier-batcher';
export * from '../../projection/summary-view';
export * from '../../projection/surface-overlay';
