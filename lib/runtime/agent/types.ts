import type {
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionExhaustionEntry,
  ResolutionObservation,
  RuntimeDomResolver,
  StepAction,
  StepResolution,
  GroundedStep,
} from '../../domain/types';
import type { ElementId, PostureId, ScreenId } from '../../domain/identity';

export interface RuntimeStepAgentContext {
  resolutionContext: InterfaceResolutionContext;
  domResolver?: RuntimeDomResolver | undefined;
  page?: unknown;
  previousResolution?: import('../../domain/types').ResolutionTarget | null | undefined;
  observedStateSession?: ObservedStateSession | undefined;
  provider: string;
  mode: string;
  runAt: string;
  translate?: ((request: import('../../domain/types').TranslationRequest) => Promise<import('../../domain/types').TranslationReceipt>) | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
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
  knowledgeRefs: string[];
  supplementRefs: string[];
}

export const EMPTY_EFFECTS: StageEffects = {
  exhaustion: [],
  observations: [],
  knowledgeRefs: [],
  supplementRefs: [],
};

export function mergeEffectsIntoStage(stage: RuntimeAgentStageContext, effects: StageEffects): void {
  stage.exhaustion = [...stage.exhaustion, ...effects.exhaustion];
  stage.observations = [...stage.observations, ...effects.observations];
  stage.knowledgeRefs = [...stage.knowledgeRefs, ...effects.knowledgeRefs];
  stage.supplementRefs = [...stage.supplementRefs, ...effects.supplementRefs];
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
}
