import type {
  DatasetControl,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
  ScenarioTaskPacket,
} from '../../types';
import {
  validateDatasetControl,
  validateResolutionControl,
  validateRunbookControl,
  validateScenarioInterpretationSurface,
  validateScenarioTaskPacket,
} from './legacy-core-validator';

export const validateDatasetControlArtifact: (value: unknown) => DatasetControl = validateDatasetControl;
export const validateResolutionControlArtifact: (value: unknown) => ResolutionControl = validateResolutionControl;
export const validateRunbookControlArtifact: (value: unknown) => RunbookControl = validateRunbookControl;
export const validateScenarioInterpretationSurfaceArtifact: (value: unknown) => ScenarioInterpretationSurface =
  validateScenarioInterpretationSurface;
export const validateScenarioTaskPacketArtifact: (value: unknown) => ScenarioTaskPacket = validateScenarioTaskPacket;
