import type { Manifest } from '../../governance/workflow-types';
import type {
  BehaviorPatternDocument,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
} from '../../knowledge/types';
import type { WidgetCapabilityContract } from '../../knowledge/widget-types';
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
} from '../core';

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
