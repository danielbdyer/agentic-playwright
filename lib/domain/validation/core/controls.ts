import type { DatasetControl, ResolutionControl, RunbookControl } from '../../types';
import { validateDatasetControl, validateResolutionControl, validateRunbookControl } from '../core';

export const validateDatasetControlArtifact: (value: unknown) => DatasetControl = validateDatasetControl;
export const validateResolutionControlArtifact: (value: unknown) => ResolutionControl = validateResolutionControl;
export const validateRunbookControlArtifact: (value: unknown) => RunbookControl = validateRunbookControl;
