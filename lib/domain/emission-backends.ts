import type {
  EmissionBackend,
  EmissionManifest,
  EmissionSummary,
  EmissionTarget,
  EmittedArtifact,
} from './types/emission';

export const PLAYWRIGHT_BACKEND: EmissionBackend = {
  target: 'playwright',
  version: '1.x',
  fileExtension: '.spec.ts',
  importPreamble: "import { test, expect } from '@playwright/test';",
  supportsParallelSteps: true,
};

export const CYPRESS_BACKEND: EmissionBackend = {
  target: 'cypress',
  version: '13.x',
  fileExtension: '.cy.ts',
  importPreamble: '/// <reference types="cypress" />',
  supportsParallelSteps: false,
};

export const SELENIUM_BACKEND: EmissionBackend = {
  target: 'selenium',
  version: '4.x',
  fileExtension: '.test.ts',
  importPreamble: "import { Builder, By, until } from 'selenium-webdriver';",
  supportsParallelSteps: false,
};

const ALL_BACKENDS: readonly EmissionBackend[] = [
  PLAYWRIGHT_BACKEND,
  CYPRESS_BACKEND,
  SELENIUM_BACKEND,
];

export function getEmissionBackend(target: EmissionTarget): EmissionBackend | null {
  return ALL_BACKENDS.find((backend) => backend.target === target) ?? null;
}

export function listAvailableBackends(): readonly EmissionBackend[] {
  return ALL_BACKENDS;
}

function computeEmissionSummary(
  target: EmissionTarget,
  artifacts: readonly EmittedArtifact[],
): EmissionSummary {
  const specs = artifacts.filter((a) => a.kind === 'emitted-spec');
  const totalSpecs = specs.length;
  const totalSteps = specs.reduce((sum, spec) => sum + spec.content.split('\n').length, 0);
  const backend = getEmissionBackend(target);

  return {
    totalSpecs,
    totalSteps,
    targetFramework: backend?.target ?? target,
    averageStepsPerSpec: totalSpecs === 0 ? 0 : totalSteps / totalSpecs,
  };
}

export function buildEmissionManifest(
  target: EmissionTarget,
  artifacts: readonly EmittedArtifact[],
  now: string,
): EmissionManifest {
  return {
    kind: 'emission-manifest',
    version: 1,
    target,
    generatedAt: now,
    artifacts,
    summary: computeEmissionSummary(target, artifacts),
  };
}
