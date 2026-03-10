import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { createAdoId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { refreshScenario } from '../lib/application/refresh';
import { internalRerunPlan } from '../lib/application/rerun-plan';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createTestWorkspace } from './support/workspace';

test('rerun planner returns no-op selection for unchanged inputs', async () => {
  const workspace = createTestWorkspace('rerun-no-op');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    const plan = await runWithLocalServices(
      internalRerunPlan.planRerunSelection({
        catalog,
        sourceNodeIds: [],
        changedArtifactPaths: [],
        changedNodeReasons: ['no-op'],
        reason: 'No canonical or derived changes detected',
      }),
      workspace.rootDir,
    );

    expect(plan.impactedScenarioIds).toEqual([]);
    expect(plan.impactedRunbooks).toEqual([]);
    expect(plan.impactedProjections).toEqual([]);
    expect(plan.selection.scenarios).toEqual([]);
  } finally {
    workspace.cleanup();
  }
});

test('single-node change selects only the directly impacted scenario with rationale', async () => {
  const workspace = createTestWorkspace('rerun-single-node');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    const plan = await runWithLocalServices(
      internalRerunPlan.planRerunSelection({
        catalog,
        sourceNodeIds: [graphIds.screenHints('policy-search')],
        changedArtifactPaths: ['knowledge/screens/policy-search.hints.yaml'],
        changedNodeReasons: ['screen hints changed'],
        reason: 'Single-node canonical hint change',
      }),
      workspace.rootDir,
    );

    expect(plan.impactedScenarioIds).toContain('10001');
    expect(plan.selection.scenarios.find((entry) => entry.id === '10001')?.why.join(' ')).toMatch(/graph-lineage|artifact-reference/);
    expect(plan.selection.projections.find((entry) => entry.name === 'emit')).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('overlay threshold change selects confidence reruns and explains why', async () => {
  const workspace = createTestWorkspace('rerun-overlay-threshold');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    mkdirSync(path.dirname(workspace.paths.confidenceIndexPath), { recursive: true });
    writeFileSync(workspace.paths.confidenceIndexPath, JSON.stringify({
      kind: 'confidence-overlay-catalog',
      version: 1,
      generatedAt: new Date().toISOString(),
      records: [
        {
          id: 'overlay-policy-number',
          artifactType: 'hints',
          artifactPath: 'knowledge/screens/policy-search.hints.yaml',
          score: 0.86,
          threshold: 0.8,
          status: 'approved-equivalent',
          successCount: 8,
          failureCount: 1,
          evidenceCount: 9,
          screen: 'policy-search',
          element: 'policyNumberInput',
          posture: null,
          snapshotTemplate: null,
          learnedAliases: ['Policy ref'],
          lastSuccessAt: null,
          lastFailureAt: null,
          lineage: {
            runIds: ['seed-run'],
            evidenceIds: ['.tesseract/evidence/runs/10001/seed/step-2-0.json'],
            sourceArtifactPaths: ['knowledge/screens/policy-search.hints.yaml'],
          },
        },
      ],
      summary: {
        total: 1,
        approvedEquivalentCount: 1,
        needsReviewCount: 0,
      },
    }, null, 2), 'utf8');

    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    const plan = await runWithLocalServices(
      internalRerunPlan.planRerunSelection({
        catalog,
        sourceNodeIds: [graphIds.confidenceOverlay('overlay-policy-number')],
        changedArtifactPaths: [workspace.paths.confidenceIndexPath],
        changedNodeReasons: ['overlay threshold changed'],
        reason: 'Overlay threshold update',
      }),
      workspace.rootDir,
    );

    expect(plan.impactedConfidenceRecords).toContain('overlay-policy-number');
    expect(plan.selection.confidenceRecords[0]?.why.join(' ')).toContain('threshold/config changed');
    expect(plan.impactedProjections).toContain('run');
  } finally {
    workspace.cleanup();
  }
});

test('multi-hop lineage propagation keeps rerun selection deterministic', async () => {
  const workspace = createTestWorkspace('rerun-multi-hop');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    const plan = await runWithLocalServices(
      internalRerunPlan.planRerunSelection({
        catalog,
        sourceNodeIds: [graphIds.element('policy-search', 'policyNumberInput')],
        changedArtifactPaths: ['knowledge/screens/policy-search.elements.yaml'],
        changedNodeReasons: ['element change'],
        reason: 'Element change should propagate to scenario/runbook/projections',
      }),
      workspace.rootDir,
    );

    expect(plan.impactedScenarioIds).toEqual(['10001']);
    expect(plan.impactedRunbooks.length).toBeGreaterThan(0);
    expect(plan.selection.runbooks[0]?.why[0]).toContain('selected-by-scenario');
  } finally {
    workspace.cleanup();
  }
});
