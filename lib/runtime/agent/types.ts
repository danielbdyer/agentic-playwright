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
