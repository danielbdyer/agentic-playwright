import type { AdoSnapshot, BoundScenario, Scenario, ScenarioInterpretationSurface, ScenarioTaskPacket } from '../../types';
import {
  validateAdoSnapshot,
  validateBoundScenario,
  validateScenario,
  validateScenarioInterpretationSurface,
  validateScenarioTaskPacket,
} from '../core';

export const validateAdoSnapshotArtifact: (value: unknown) => AdoSnapshot = validateAdoSnapshot;
export const validateScenarioArtifact: (value: unknown) => Scenario = validateScenario;
export const validateBoundScenarioArtifact: (value: unknown) => BoundScenario = validateBoundScenario;
export const validateScenarioInterpretationSurfaceArtifact: (value: unknown) => ScenarioInterpretationSurface =
  validateScenarioInterpretationSurface;
export const validateScenarioTaskPacketArtifact: (value: unknown) => ScenarioTaskPacket = validateScenarioTaskPacket;
