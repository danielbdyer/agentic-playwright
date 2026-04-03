import type {
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionExhaustionEntry,
  ResolutionObservation,
  RuntimeDomResolver,
  SemanticDictionaryCatalog,
  StepAction,
  StepResolution,
  GroundedStep,
} from '../../domain/types';
import type { AgentInterpreterPort } from '../../domain/resolution/model';
import type { ElementId, PostureId, ScreenId } from '../../domain/kernel/identity';
import type { ResolutionTarget, TranslationDecomposition, TranslationReceipt, TranslationRequest } from '../../domain/types';
import type { AriaSnapshotCache } from './aria-snapshot-cache';
import type { SemanticDictCache } from './semantic-dict-cache';

export type RuntimeAgentInterpreter = AgentInterpreterPort;

export interface RuntimeStepAgentContext {
  resolutionContext: InterfaceResolutionContext;
  domResolver?: RuntimeDomResolver | undefined;
  page?: unknown;
  previousResolution?: ResolutionTarget | null | undefined;
  observedStateSession?: ObservedStateSession | undefined;
  provider: string;
  mode: string;
  runAt: string;
  translate?: ((request: TranslationRequest) => Promise<TranslationReceipt>) | undefined;
  agentInterpreter?: RuntimeAgentInterpreter | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  semanticDictionary?: SemanticDictionaryCatalog | undefined;
  /** Per-step ARIA snapshot cache — avoids redundant DOM traversals across rungs. */
  ariaSnapshotCache?: AriaSnapshotCache | undefined;
  /** Per-scenario semantic dictionary cache — avoids redundant lookups for similar intents. */
  semanticDictCache?: SemanticDictCache | undefined;
}

export interface RuntimeAgentStageContext {
  task: GroundedStep;
  context: RuntimeStepAgentContext;
  memory: ObservedStateSession;
  controlResolution: StepResolution | null;
  controlRefs: string[];
  evidenceRefs: string[];
  exhaustion: ResolutionExhaustionEntry[];
  observations: ResolutionObservation[];
  knowledgeRefs: string[];
  supplementRefs: string[];
  memoryLineage: readonly string[];
  interpretation?: IntentInterpretation | undefined;
}

export interface StageEffects {
  exhaustion: ResolutionExhaustionEntry[];
  observations: ResolutionObservation[];
  knowledgeRefs: readonly string[];
  supplementRefs: readonly string[];
}

export const EMPTY_EFFECTS: StageEffects = {
  exhaustion: [],
  observations: [],
  knowledgeRefs: [],
  supplementRefs: [],
};

export function mergeEffectsIntoStage(stage: RuntimeAgentStageContext, effects: StageEffects): RuntimeAgentStageContext {
  return {
    ...stage,
    exhaustion: [...stage.exhaustion, ...effects.exhaustion],
    observations: [...stage.observations, ...effects.observations],
    knowledgeRefs: [...stage.knowledgeRefs, ...effects.knowledgeRefs],
    supplementRefs: [...stage.supplementRefs, ...effects.supplementRefs],
  };
}

// ─── WP3: Intent Interpretation ───

export type InterpretationSource = 'knowledge-heuristic' | 'knowledge-translation' | 'dom-exploration';
export type InterpretationConfidence = 'high' | 'medium' | 'low';

export interface IntentInterpretation {
  readonly stepText: string;
  readonly interpretedAction: StepAction | null;
  readonly interpretedScreen: ScreenId | null;
  readonly interpretedElement: ElementId | null;
  readonly interpretedPosture: PostureId | null;
  readonly confidence: InterpretationConfidence;
  readonly source: InterpretationSource;
  readonly knowledgeRefs: readonly string[];
  /**
   * LLM-produced intent decomposition, threaded from the translation receipt.
   * When present, the proposal generator uses suggestedAliases to create
   * alias proposals that make future resolution deterministic.
   * Null for heuristic or DOM interpretations (no LLM involved).
   */
  readonly decomposition?: TranslationDecomposition | null | undefined;
}
