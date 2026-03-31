import type {
  BehaviorPatternDocument,
  Manifest,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  WidgetCapabilityContract,
} from '../../types';
import {
  validateBehaviorPatternDocument,
  validateManifest,
  validatePatternDocument,
  validateScreenBehavior,
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSharedPatterns,
  validateWidgetCapabilityContract,
} from './legacy-core-validator';

export const validateWidgetCapabilityContractArtifact: (value: unknown) => WidgetCapabilityContract =
  validateWidgetCapabilityContract;
export const validateScreenElementsArtifact: (value: unknown) => ScreenElements = validateScreenElements;
export const validateScreenHintsArtifact: (value: unknown) => ScreenHints = validateScreenHints;
export const validatePatternDocumentArtifact: (value: unknown) => PatternDocument = validatePatternDocument;
export const validateSharedPatternsArtifact: (value: unknown) => SharedPatterns = validateSharedPatterns;
export const validateScreenPosturesArtifact: (value: unknown) => ScreenPostures = validateScreenPostures;
export const validateScreenBehaviorArtifact: (value: unknown) => ScreenBehavior = validateScreenBehavior;
export const validateBehaviorPatternDocumentArtifact: (value: unknown) => BehaviorPatternDocument =
  validateBehaviorPatternDocument;
export const validateManifestArtifact: (value: unknown) => Manifest = validateManifest;
