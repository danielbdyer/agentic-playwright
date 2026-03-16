import type {
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionExhaustionEntry,
  ResolutionObservation,
  RuntimeDomResolver,
  StepResolution,
  GroundedStep,
} from '../../domain/types';

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
  memoryLineage: string[];
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
