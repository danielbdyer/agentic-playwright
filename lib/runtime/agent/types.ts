import type { Page } from '@playwright/test';
import type {
  ResolutionExhaustionEntry,
  ResolutionObservation,
  StepResolution,
  StepTask,
} from '../../domain/types';

export interface RuntimeStepAgentContext {
  page?: Page | undefined;
  previousResolution?: import('../../domain/types').ResolutionTarget | null | undefined;
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
  task: StepTask;
  context: RuntimeStepAgentContext;
  controlResolution: StepResolution | null;
  controlRefs: string[];
  evidenceRefs: string[];
  exhaustion: ResolutionExhaustionEntry[];
  observations: ResolutionObservation[];
  knowledgeRefs: string[];
  supplementRefs: string[];
}
