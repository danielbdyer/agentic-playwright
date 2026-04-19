/**
 * Narration Catalog — typed mapping from flywheel events to narration captions.
 *
 * This module provides the complete caption catalog from
 * docs/first-day-flywheel-visualization.md Part V. Each event type that
 * triggers narration has a pure factory function that extracts payload data
 * and produces a NarrationCaption.
 *
 * Design: Strategy pattern — each event kind maps to a caption factory.
 * The FlywheelChoreographer calls `generateCaption(event)` and the
 * narration queue renders the result.
 *
 * All functions are pure. No React, no DOM, no side effects.
 * The catalog respects verbosity levels: minimal shows only milestones,
 * normal shows per-act + milestones, verbose shows everything.
 *
 * @see docs/first-day-flywheel-visualization.md Part V: The Narration Layer
 */

import type { DashboardEventKind } from '../../product/domain/observation/dashboard';

// ─── Types (mirror narration queue types without React dependency) ───

export type CaptionPosition =
  | 'top-center' | 'center' | 'bottom-center'
  | 'screen-plane-top' | 'screen-plane-bottom' | 'screen-plane-center'
  | 'observatory' | 'glass-pane' | 'pipeline-timeline' | 'workbench';

export type CaptionEmphasis = 'normal' | 'highlight' | 'milestone';

export type NarrationVerbosity = 'minimal' | 'normal' | 'verbose';

/** A caption descriptor produced by the catalog. */
export interface CaptionDescriptor {
  readonly text: string;
  readonly position: CaptionPosition;
  readonly emphasis: CaptionEmphasis;
  readonly durationMs: number;
  /** Minimum verbosity level required to show this caption. */
  readonly minVerbosity: NarrationVerbosity;
}

// ─── Verbosity Ordering ───

const VERBOSITY_RANK: Readonly<Record<NarrationVerbosity, number>> = {
  minimal: 0,
  normal: 1,
  verbose: 2,
};

/** Check if a caption should be shown at the given verbosity level. */
export function shouldShowCaption(captionVerbosity: NarrationVerbosity, currentVerbosity: NarrationVerbosity): boolean {
  return VERBOSITY_RANK[currentVerbosity] >= VERBOSITY_RANK[captionVerbosity];
}

// ─── Caption Factories ───

/** Generate a caption for a given event, or null if no caption is warranted. */
export function generateCaption(
  eventType: DashboardEventKind,
  data: unknown,
  context: CaptionContext,
): CaptionDescriptor | null {
  const factory = CAPTION_FACTORIES[eventType];
  return factory ? factory(data as Record<string, unknown>, context) : null;
}

/** Contextual information needed for caption generation. */
export interface CaptionContext {
  /** Whether this is the first occurrence of this event type in the run. */
  readonly isFirst: boolean;
  /** Current flywheel act. */
  readonly currentAct: number;
  /** Current iteration number. */
  readonly iteration: number;
  /** Total scenarios in the suite. */
  readonly totalScenarios: number;
  /** Count of screens discovered so far. */
  readonly screenCount: number;
  /** Count of elements discovered so far. */
  readonly elementCount: number;
}

type CaptionFactory = (data: Record<string, unknown>, context: CaptionContext) => CaptionDescriptor | null;

// ─── Act 1: Context Intake ───

const captionItemPending: CaptionFactory = (data, context) => {
  if (!context.isFirst) return null;
  const count = context.totalScenarios || 'multiple';
  return {
    text: `Ingesting ${count} scenarios from Azure DevOps`,
    position: 'top-center',
    emphasis: 'normal',
    durationMs: 5000,
    minVerbosity: 'normal',
  };
};

// ─── Act 2: ARIA-First Capture ───

const captionRouteNavigated: CaptionFactory = (data) => {
  const url = typeof data.url === 'string' ? data.url : 'unknown';
  // Truncate URL to host + path for readability
  const short = truncateUrl(url);
  return {
    text: `Navigating to ${short}`,
    position: 'screen-plane-top',
    emphasis: 'normal',
    durationMs: 4000,
    minVerbosity: 'verbose',
  };
};

const captionAriaTreeCaptured: CaptionFactory = (data) => {
  const nodeCount = typeof data.nodeCount === 'number' ? data.nodeCount : 0;
  const landmarkCount = typeof data.landmarkCount === 'number' ? data.landmarkCount : 0;
  return {
    text: `ARIA tree: ${nodeCount} nodes, ${landmarkCount} landmarks`,
    position: 'screen-plane-bottom',
    emphasis: 'normal',
    durationMs: 4000,
    minVerbosity: 'verbose',
  };
};

const captionSurfaceDiscovered: CaptionFactory = (data, context) => {
  const screen = typeof data.screen === 'string' ? data.screen : 'screen';
  if (!context.isFirst) return null;
  return {
    text: `Discovering elements on ${screen}`,
    position: 'screen-plane-center',
    emphasis: 'normal',
    durationMs: 3000,
    minVerbosity: 'verbose',
  };
};

// ─── Act 3: Suite Slicing ───

const captionSuiteSliceSelected: CaptionFactory = (data) => {
  const selectedCount = typeof data.selectedCount === 'number' ? data.selectedCount : 0;
  const totalCount = typeof data.totalCount === 'number' ? data.totalCount : 0;
  return {
    text: `Suite Slice: ${selectedCount} of ${totalCount} scenarios selected`,
    position: 'center',
    emphasis: 'highlight',
    durationMs: 5000,
    minVerbosity: 'normal',
  };
};

const captionScenarioPrioritized: CaptionFactory = (_data, context) => {
  if (!context.isFirst) return null;
  return {
    text: `Prioritizing ${context.totalScenarios} scenarios by learning value`,
    position: 'top-center',
    emphasis: 'normal',
    durationMs: 4000,
    minVerbosity: 'normal',
  };
};

// ─── Act 4: Deterministic Generation ───

const captionScenarioCompiled: CaptionFactory = (data, context) => {
  const boundSteps = typeof data.boundSteps === 'number' ? data.boundSteps : 0;
  const totalSteps = typeof data.totalSteps === 'number' ? data.totalSteps : 0;
  const deferredSteps = typeof data.deferredSteps === 'number' ? data.deferredSteps : 0;

  if (context.isFirst) {
    return {
      text: `Compiling first scenario: ${boundSteps}/${totalSteps} steps bound`,
      position: 'pipeline-timeline',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'normal',
    };
  }

  if (deferredSteps > boundSteps) {
    return {
      text: `${deferredSteps} steps deferred to runtime interpretation`,
      position: 'screen-plane-center',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'verbose',
    };
  }

  return null;
};

// ─── Act 5: Execution & Failure ───

const captionScenarioExecuted: CaptionFactory = (data, context) => {
  const passed = typeof data.passed === 'boolean' ? data.passed : false;
  const adoId = typeof data.adoId === 'string' ? data.adoId : 'scenario';

  // First green test is a milestone
  if (passed && context.isFirst) {
    return {
      text: `✓ First green test: ${adoId}`,
      position: 'center',
      emphasis: 'milestone',
      durationMs: 6000,
      minVerbosity: 'minimal',
    };
  }

  if (!passed && context.isFirst) {
    return {
      text: `✗ ${adoId} — test failed`,
      position: 'screen-plane-center',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'normal',
    };
  }

  return null;
};

const captionStepExecuting: CaptionFactory = (data, context) => {
  if (!context.isFirst) return null;
  const screen = typeof data.screen === 'string' ? data.screen : 'screen';
  return {
    text: `Executing on ${screen}`,
    position: 'screen-plane-top',
    emphasis: 'normal',
    durationMs: 4000,
    minVerbosity: 'verbose',
  };
};

// ─── Act 6: Hardening & Gating ───

const captionTrustPolicyEvaluated: CaptionFactory = (data, context) => {
  const decision = typeof data.decision === 'string' ? data.decision : 'unknown';
  const proposalId = typeof data.proposalId === 'string' ? data.proposalId : 'proposal';

  if (decision === 'approved' && context.isFirst) {
    return {
      text: `Knowledge activated: ${proposalId}`,
      position: 'glass-pane',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'normal',
    };
  }

  if (decision === 'review-required') {
    return {
      text: `Review required: ${proposalId}`,
      position: 'workbench',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'verbose',
    };
  }

  if (decision === 'blocked') {
    return {
      text: `Blocked by trust policy`,
      position: 'glass-pane',
      emphasis: 'normal',
      durationMs: 4000,
      minVerbosity: 'normal',
    };
  }

  return null;
};

// ─── Act 7: Meta-Measurement ───

const captionConvergenceEvaluated: CaptionFactory = (data, context) => {
  const converged = typeof data.converged === 'boolean' ? data.converged : false;
  const hitRate = typeof data.knowledgeHitRate === 'number' ? Math.round(data.knowledgeHitRate * 100) : 0;
  const delta = typeof data.delta === 'number' ? Math.round(data.delta * 100) : 0;

  if (converged) {
    return {
      text: `Converged at iteration ${context.iteration}. ${hitRate}% knowledge hit rate`,
      position: 'center',
      emphasis: 'milestone',
      durationMs: 8000,
      minVerbosity: 'minimal',
    };
  }

  const remaining = typeof data.budgetRemaining === 'object' && data.budgetRemaining !== null
    ? (data.budgetRemaining as Record<string, unknown>).iterations
    : null;
  const remainingText = typeof remaining === 'number' ? `. ${remaining} iterations remaining` : '';

  return {
    text: `Knowledge hit rate: ${hitRate}% (Δ${delta >= 0 ? '+' : ''}${delta}%)${remainingText}`,
    position: 'center',
    emphasis: 'normal',
    durationMs: 5000,
    minVerbosity: 'normal',
  };
};

const captionIterationSummary: CaptionFactory = (data, context) => {
  return {
    text: `Iteration ${context.iteration} complete`,
    position: 'top-center',
    emphasis: 'normal',
    durationMs: 4000,
    minVerbosity: 'normal',
  };
};

// ─── Fiber pause/resume ───

const captionFiberPaused: CaptionFactory = (data) => {
  const reason = typeof data.reason === 'string' ? data.reason : 'decision required';
  return {
    text: `Awaiting human decision: ${reason}`,
    position: 'center',
    emphasis: 'highlight',
    durationMs: 0, // persistent until resolved
    minVerbosity: 'minimal',
  };
};

// ─── Caption Factory Registry ───

/** Map from event type to caption factory. Only events with narration have entries. */
export const CAPTION_FACTORIES: Readonly<Partial<Record<DashboardEventKind, CaptionFactory>>> = {
  'item-pending': captionItemPending,
  'route-navigated': captionRouteNavigated,
  'aria-tree-captured': captionAriaTreeCaptured,
  'surface-discovered': captionSurfaceDiscovered,
  'suite-slice-selected': captionSuiteSliceSelected,
  'scenario-prioritized': captionScenarioPrioritized,
  'scenario-compiled': captionScenarioCompiled,
  'scenario-executed': captionScenarioExecuted,
  'step-executing': captionStepExecuting,
  'trust-policy-evaluated': captionTrustPolicyEvaluated,
  'convergence-evaluated': captionConvergenceEvaluated,
  'iteration-summary': captionIterationSummary,
  'fiber-paused': captionFiberPaused,
};

/**
 * All event kinds that have caption factories.
 * Useful for testing coverage.
 */
export const NARRATED_EVENT_KINDS: readonly DashboardEventKind[] = Object.keys(CAPTION_FACTORIES) as DashboardEventKind[];

// ─── Helpers ───

const MAX_URL_DISPLAY_LENGTH = 40;
const TRUNCATED_URL_SUFFIX_LENGTH = 3; // "..."

/** Truncate a URL to host + first path segment for display. Pure. */
function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const pathSegments = parsed.pathname.split('/').filter(Boolean);
    const shortPath = pathSegments.length > 1
      ? `/${pathSegments[0]}/...`
      : parsed.pathname;
    return `${parsed.hostname}${shortPath}`;
  } catch {
    // If URL parsing fails, truncate to max display length
    return url.length > MAX_URL_DISPLAY_LENGTH
      ? `${url.slice(0, MAX_URL_DISPLAY_LENGTH - TRUNCATED_URL_SUFFIX_LENGTH)}...`
      : url;
  }
}
