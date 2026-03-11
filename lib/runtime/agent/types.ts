import type {
  ResolutionExhaustionEntry,
  ResolutionObservation,
  RuntimeDomResolver,
  StepResolution,
  StepTask,
} from '../../domain/types';

export interface RuntimeStepAgentContext {
  domResolver?: RuntimeDomResolver | undefined;
  page?: unknown;
  previousResolution?: import('../../domain/types').ResolutionTarget | null | undefined;
  runtimeWorkingMemory?: RuntimeWorkingMemory | undefined;
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

export interface RuntimeWorkingMemoryScreenState {
  screen: import('../../domain/identity').ScreenId;
  confidence: number;
  observedAtStep: number;
}

export interface RuntimeWorkingMemoryAssertion {
  summary: string;
  observedAtStep: number;
}

export interface RuntimeWorkingMemory {
  currentScreen: RuntimeWorkingMemoryScreenState | null;
  activeEntityKeys: string[];
  openedPanels: string[];
  openedModals: string[];
  lastSuccessfulLocatorRung: number | null;
  recentAssertions: RuntimeWorkingMemoryAssertion[];
  lineage: string[];
}

export interface RuntimeAgentStageContext {
  task: StepTask;
  context: RuntimeStepAgentContext;
  memory: RuntimeWorkingMemory;
  controlResolution: StepResolution | null;
  controlRefs: string[];
  evidenceRefs: string[];
  exhaustion: ResolutionExhaustionEntry[];
  observations: ResolutionObservation[];
  knowledgeRefs: string[];
  supplementRefs: string[];
  memoryLineage: string[];
}
