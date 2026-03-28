import { test, expect } from '@playwright/test';
import {
  PLAYWRIGHT_BACKEND,
  CYPRESS_BACKEND,
  SELENIUM_BACKEND,
  getEmissionBackend,
  listAvailableBackends,
  buildEmissionManifest,
} from '../lib/domain/emission-backends';
import type { EmittedArtifact } from '../lib/domain/types/emission';

test.describe('emission backend registry laws', () => {
  test('each backend has correct file extension', () => {
    expect(PLAYWRIGHT_BACKEND.fileExtension).toBe('.spec.ts');
    expect(CYPRESS_BACKEND.fileExtension).toBe('.cy.ts');
    expect(SELENIUM_BACKEND.fileExtension).toBe('.test.ts');
  });

  test('Playwright supports parallel steps', () => {
    expect(PLAYWRIGHT_BACKEND.supportsParallelSteps).toBe(true);
  });

  test('Cypress does not support parallel steps', () => {
    expect(CYPRESS_BACKEND.supportsParallelSteps).toBe(false);
  });

  test('Selenium does not support parallel steps', () => {
    expect(SELENIUM_BACKEND.supportsParallelSteps).toBe(false);
  });

  test('getEmissionBackend returns null for unknown target', () => {
    const result = getEmissionBackend('custom');
    expect(result).toBeNull();
  });

  test('getEmissionBackend returns correct backend for known targets', () => {
    expect(getEmissionBackend('playwright')).toBe(PLAYWRIGHT_BACKEND);
    expect(getEmissionBackend('cypress')).toBe(CYPRESS_BACKEND);
    expect(getEmissionBackend('selenium')).toBe(SELENIUM_BACKEND);
  });

  test('listAvailableBackends returns all defined backends', () => {
    const backends = listAvailableBackends();
    expect(backends).toHaveLength(3);
    expect(backends).toContain(PLAYWRIGHT_BACKEND);
    expect(backends).toContain(CYPRESS_BACKEND);
    expect(backends).toContain(SELENIUM_BACKEND);
  });

  test('all backends have non-empty import preamble', () => {
    const backends = listAvailableBackends();
    backends.forEach((backend) => {
      expect(backend.importPreamble.length).toBeGreaterThan(0);
    });
  });

  test('manifest summary computes correct averages', () => {
    const artifacts: readonly EmittedArtifact[] = [
      {
        kind: 'emitted-spec',
        target: 'playwright',
        path: '/out/a.spec.ts',
        content: 'line1\nline2\nline3',
        fingerprint: 'abc',
      },
      {
        kind: 'emitted-spec',
        target: 'playwright',
        path: '/out/b.spec.ts',
        content: 'line1\nline2\nline3\nline4\nline5',
        fingerprint: 'def',
      },
      {
        kind: 'emitted-trace',
        target: 'playwright',
        path: '/out/a.trace.json',
        content: '{}',
        fingerprint: 'ghi',
      },
    ];

    const manifest = buildEmissionManifest('playwright', artifacts, '2026-03-28T00:00:00Z');

    expect(manifest.kind).toBe('emission-manifest');
    expect(manifest.version).toBe(1);
    expect(manifest.target).toBe('playwright');
    expect(manifest.generatedAt).toBe('2026-03-28T00:00:00Z');
    expect(manifest.artifacts).toBe(artifacts);
    expect(manifest.summary.totalSpecs).toBe(2);
    // 3 lines + 5 lines = 8 total steps
    expect(manifest.summary.totalSteps).toBe(8);
    expect(manifest.summary.averageStepsPerSpec).toBe(4);
    expect(manifest.summary.targetFramework).toBe('playwright');
  });

  test('manifest summary handles zero specs gracefully', () => {
    const manifest = buildEmissionManifest('cypress', [], '2026-03-28T00:00:00Z');

    expect(manifest.summary.totalSpecs).toBe(0);
    expect(manifest.summary.totalSteps).toBe(0);
    expect(manifest.summary.averageStepsPerSpec).toBe(0);
  });
});
