// Agent interpreter port types — pure domain interfaces with no Effect or Playwright dependencies.
// Extracted from lib/application/agent-interpreter-provider.ts for cross-layer type sharing.

import type { Effect } from 'effect';
import type { ResolutionTarget, ResolutionProposalDraft, ResolutionObservation, StepAction } from '../types';

export interface AgentInterpretationRequest {
  /** Original step text from the QA test case. */
  readonly actionText: string;
  readonly expectedText: string;
  readonly normalizedIntent: string;
  /** Inferred action type from prior rungs (may be null if unknown). */
  readonly inferredAction: StepAction | null;
  /** Available screens with their elements, aliases, and widget contracts. */
  readonly screens: ReadonlyArray<{
    readonly screen: string;
    readonly screenAliases: readonly string[];
    readonly elements: ReadonlyArray<{
      readonly element: string;
      readonly name: string | null;
      readonly aliases: readonly string[];
      readonly widget: string;
      readonly role: string;
    }>;
  }>;
  /** What prior resolution rungs attempted and why they failed. */
  readonly exhaustionTrail: ReadonlyArray<{
    readonly stage: string;
    readonly outcome: string;
    readonly reason: string;
  }>;
  /** DOM context: ARIA snapshot of the current page state (if available). */
  readonly domSnapshot: string | null;
  /** Prior resolution for context (e.g., what screen we're already on). */
  readonly priorTarget: ResolutionTarget | null;
  /** Task fingerprint for caching. */
  readonly taskFingerprint: string;
  /** Knowledge fingerprint for cache invalidation. */
  readonly knowledgeFingerprint: string;

  // ─── Enriched context (Gap 1: agent sees what prior rungs learned) ───

  /** Top-3 ranked candidates from prior rungs. Enables confidence calibration —
   *  if all screens scored < 0.2, agent should decline. If screen #1 scored 0.95
   *  and #2 scored 0.94, agent knows it's a near-tie. */
  readonly topCandidates?: {
    readonly screens: ReadonlyArray<{ readonly screen: string; readonly score: number }>;
    readonly elements: ReadonlyArray<{ readonly element: string; readonly screen: string; readonly score: number }>;
  } | undefined;

  /** Structural grounding from the compiled step. Constrains search space:
   *  targetRefs narrow candidates, requiredStateRefs validate preconditions,
   *  forbiddenStateRefs reject unsafe targets, allowedActions filter inference. */
  readonly grounding?: {
    readonly targetRefs: readonly string[];
    readonly requiredStateRefs: readonly string[];
    readonly forbiddenStateRefs: readonly string[];
    readonly allowedActions: readonly StepAction[];
  } | undefined;

  /** Current observed state from working memory. Enables filtering candidates
   *  to visible/enabled elements on the current screen. */
  readonly observedState?: {
    readonly currentScreen: string | null;
    readonly activeStateRefs: readonly string[];
    readonly lastSuccessfulLocatorRung: number | null;
  } | undefined;

  /** Per-artifact confidence status for top overlays. Agent knows whether
   *  targets are trusted (approved-equivalent) or exploratory (learning). */
  readonly confidenceHints?: ReadonlyArray<{
    readonly screen: string;
    readonly element?: string | undefined;
    readonly status: 'approved-equivalent' | 'learning' | 'needs-review';
    readonly score: number;
  }> | undefined;
}

export interface AgentInterpretationResult {
  readonly interpreted: boolean;
  readonly target: ResolutionTarget | null;
  readonly confidence: number;
  readonly rationale: string;
  readonly proposalDrafts: readonly ResolutionProposalDraft[];
  readonly observation?: ResolutionObservation | undefined;
  readonly provider: string;
}

export type AgentInterpreterKind = 'disabled' | 'heuristic' | 'llm-api' | 'session';

export interface AgentInterpreterProvider {
  readonly id: string;
  readonly kind: AgentInterpreterKind;
  readonly interpret: (
    request: AgentInterpretationRequest,
  ) => Effect.Effect<AgentInterpretationResult, never, never>;
}
