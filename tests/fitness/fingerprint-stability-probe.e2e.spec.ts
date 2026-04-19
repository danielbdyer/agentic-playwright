/**
 * End-to-end: K0 fingerprint-stability probe against a real workspace.
 *
 * Phase 1.4 declared the K0 slot and the pure comparison module.
 * Phase T8 ships the Effect-orchestrated probe that actually walks
 * generated artifacts, hashes them, and emits a `direct` obligation.
 *
 * Scenario:
 *   1. Refresh a scenario so `.tesseract/tasks/` is populated.
 *   2. Run the probe — no prior snapshot, so the obligation is the
 *      "baseline" direct measurement (score 1).
 *   3. Run the probe again without touching anything — the snapshot
 *      matches exactly, so the obligation is `identical` and direct.
 *   4. Modify a deterministic output and run the probe a third time —
 *      the delta is detected and the obligation status becomes
 *      non-healthy.
 *
 * This closes the K doctrinal claim: the kernel theorem group can
 * graduate to `direct` once the probe has a real measurement to report.
 */

import { readFileSync, writeFileSync } from 'fs';
import { Effect } from 'effect';
import { expect, test } from '@playwright/test';
import { runFingerprintStabilityProbe } from '../../workshop/orchestration/fingerprint-stability-probe';
import { refreshScenario } from '../../product/application/resolution/refresh';
import { runWithLocalServices } from '../../product/composition/local-services';
import { createAdoId } from '../../product/domain/kernel/identity';
import { createTestWorkspace } from '../support/workspace';

test('probe first run establishes baseline with score 1 and measurementClass=direct', async () => {
  const ws = createTestWorkspace('fingerprint-baseline');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: ws.paths }), ws.rootDir);

    const result = await runWithLocalServices(
      runFingerprintStabilityProbe({ paths: ws.paths }),
      ws.rootDir,
    );
    expect(result.obligation.obligation).toBe('fingerprint-stability');
    expect(result.obligation.propertyRefs).toEqual(['K']);
    expect(result.obligation.measurementClass).toBe('direct');
    expect(result.obligation.status).toBe('healthy');
    expect(result.obligation.score).toBe(1);
    expect(result.artifactCount).toBeGreaterThan(0);
    expect(result.obligation.evidence).toContain('baseline');
  } finally {
    ws.cleanup();
  }
});

test('probe second run against unchanged workspace reports identical', async () => {
  const ws = createTestWorkspace('fingerprint-identical');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: ws.paths }), ws.rootDir);

    // First probe — baseline
    await runWithLocalServices(runFingerprintStabilityProbe({ paths: ws.paths }), ws.rootDir);

    // Second probe — nothing changed
    const result = await runWithLocalServices(
      runFingerprintStabilityProbe({ paths: ws.paths }),
      ws.rootDir,
    );
    expect(result.obligation.measurementClass).toBe('direct');
    expect(result.obligation.status).toBe('healthy');
    expect(result.obligation.score).toBe(1);
    expect(result.obligation.evidence).toContain('identical=true');
  } finally {
    ws.cleanup();
  }
});

test('probe detects churn when a tracked artifact changes', async () => {
  const ws = createTestWorkspace('fingerprint-churn');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: ws.paths }), ws.rootDir);

    // First probe — baseline
    await runWithLocalServices(runFingerprintStabilityProbe({ paths: ws.paths }), ws.rootDir);

    // Mutate a task resolution artifact
    const resolutionPath = `${ws.rootDir}/.tesseract/tasks/10001.resolution.json`;
    const original = readFileSync(resolutionPath, 'utf8').replace(/^\uFEFF/, '');
    const mutated = JSON.stringify({ ...JSON.parse(original), __e2eMutation: 'drift' }, null, 2);
    writeFileSync(resolutionPath, mutated, 'utf8');

    // Second probe — detects the change
    const result = await runWithLocalServices(
      runFingerprintStabilityProbe({ paths: ws.paths }),
      ws.rootDir,
    );
    expect(result.obligation.measurementClass).toBe('direct');
    expect(result.obligation.status).not.toBe('healthy');
    expect(result.obligation.score).toBeLessThan(1);
    expect(result.obligation.evidence).toContain('changed=');
  } finally {
    ws.cleanup();
  }
});
