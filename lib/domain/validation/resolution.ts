import type {
  DatasetControl,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
  ScenarioTaskPacket,
} from '../resolution/types';
import { validateByKind } from './registry';

export const validateDatasetControl = (value: unknown): DatasetControl => validateByKind('dataset-control', value);
export const validateResolutionControl = (value: unknown): ResolutionControl => validateByKind('resolution-control', value);
export const validateRunbookControl = (value: unknown): RunbookControl => validateByKind('runbook-control', value);
export const validateScenarioInterpretationSurface = (value: unknown): ScenarioInterpretationSurface =>
  validateByKind('scenario-interpretation-surface', value);
export const validateScenarioTaskPacket = (value: unknown): ScenarioTaskPacket => validateByKind('scenario-task-packet', value);
