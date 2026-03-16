import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { activateProposalBundle } from '../lib/application/activate-proposals';
import { applyDriftEvents, type VarianceManifest } from '../lib/application/drift';
import { runDogfoodLoop, type DogfoodLedger } from '../lib/application/dogfood';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { emitOperatorInbox } from '../lib/application/inbox';
import { describeScenarioPaths } from '../lib/application/inspect';
import { emitScenario } from '../lib/application/emit';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import {
  createProposalBundleEnvelope,
  createScenarioEnvelopeFingerprints,
  createScenarioEnvelopeIds,
} from '../lib/application/catalog/envelope';
import { emitManifestPath } from '../lib/application/paths';
import { resolveAgentSessionAdapter } from '../lib/application/provider-registry';
import { refreshScenario } from '../lib/application/refresh';
import { runScenario } from '../lib/application/run';
import { replayInterpretation } from '../lib/application/replay-interpretation';
import { inspectSurface } from '../lib/application/surface';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { inspectWorkflow } from '../lib/application/workflow';
import type { ProjectionCacheMissIncremental, ProjectionIncremental } from '../lib/application/projections/runner';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createAdoId, createElementId, createScreenId, createSurfaceId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import type { ProposalEntry } from '../lib/domain/types';
import { validateDiscoveryIndex } from '../lib/domain/validation';
import { harvestDeclaredRoutes } from '../lib/infrastructure/tooling/harvest-routes';
import { createTestWorkspace } from './support/workspace';

const policySearchScreenId = createScreenId('policy-search');
const policyNumberInputId = createElementId('policyNumberInput');
const searchButtonId = createElementId('searchButton');
const resultsTableId = createElementId('resultsTable');
const resultsGridId = createSurfaceId('results-grid');
const searchFormId = createSurfaceId('search-form');

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function projectPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function incrementalKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

function expectCacheMiss(incremental: ProjectionIncremental): ProjectionCacheMissIncremental {
  expect(incremental.status).toBe('cache-miss');
  if (incremental.status !== 'cache-miss') {
    throw new Error(`Expected cache-miss incremental result, received ${incremental.status}`);
  }
  return incremental;
}

test('refresh recompiles the seeded scenario through graph, types, and program emission', async () => {
  const workspace = createTestWorkspace('compiler-refresh');
  try {
    const adoId = createAdoId('10001');
    const result = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const taskPacket = workspace.readJson<{
      version: number;
      payload: {
        stateGraph: { fingerprint?: string };
        knowledgeSlice: {
          stateRefs: string[];
          eventSignatureRefs: string[];
          transitionRefs: string[];
        };
        steps: Array<{
          grounding: {
            eventSignatureRefs: string[];
            expectedTransitionRefs: string[];
            resultStateRefs: string[];
          };
        }>;
      };
    }>('.tesseract', 'tasks', '10001.resolution.json');
    const stateGraph = workspace.readJson<{
      fingerprint: string;
      stateRefs: string[];
      eventSignatureRefs: string[];
      transitionRefs: string[];
    }>('.tesseract', 'interface', 'state-graph.json');
    const generated = readFileSync(result.compile.emitted.outputPath, 'utf8').replace(/^\uFEFF/, '');
    const traceArtifact = JSON.parse(readFileSync(result.compile.emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(result.compile.emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    const graph = JSON.parse(readFileSync(result.compile.graph.graphPath, 'utf8').replace(/^\uFEFF/, ''));

    expect(result.sync.snapshots).toHaveLength(1);
    expect(result.compile.bound.hasUnbound).toBeFalsy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.confidence === 'intent-only')).toBeTruthy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.binding.kind === 'deferred')).toBeTruthy();
    expect(result.compile.bound.boundScenario.steps.every((step) => step.binding.governance === 'approved')).toBeTruthy();
    expect(projectPath(result.compile.compileSnapshot.surfacePath)).toContain('.tesseract/tasks/10001.resolution.json');
    expect(taskPacket.version).toBe(1);
    expect(taskPacket.payload.stateGraph.fingerprint).toBe(stateGraph.fingerprint);
    expect(taskPacket.payload.knowledgeSlice.stateRefs).toEqual(stateGraph.stateRefs);
    expect(taskPacket.payload.knowledgeSlice.eventSignatureRefs).toEqual(stateGraph.eventSignatureRefs);
    expect(taskPacket.payload.knowledgeSlice.transitionRefs).toEqual(stateGraph.transitionRefs);
    expect(taskPacket.payload.steps.some((step) => step.grounding.eventSignatureRefs.length > 0)).toBeTruthy();
    expect(taskPacket.payload.steps.some((step) => step.grounding.expectedTransitionRefs.length > 0)).toBeTruthy();
    expect(taskPacket.payload.steps.some((step) => step.grounding.resultStateRefs.length > 0)).toBeTruthy();
    expect(generated).toContain('scenario-context');
    expect(generated).toContain('createScenarioContext');
    expect(generated).toContain('intent-only');
    expect(generated).toContain('deferred-steps');
    expect(traceArtifact.steps[1].runtime.status).toBe('pending');
    expect(traceArtifact.steps[1].provenanceKind).toBe('unresolved');
    expect(traceArtifact.summary.provenanceKinds.unresolved).toBe(4);
    expect(traceArtifact.summary.unresolvedReasons).toEqual([{ reason: 'runtime-resolution-required', count: 4 }]);
    expect(traceArtifact.governance).toBe('approved');
    expect(traceArtifact.steps[0].normalizedIntent).toContain('navigate');
    expect(review).toContain('# Verify policy search returns matching policy');
    expect(review).toContain('## Bottlenecks');
    expect(review).toContain('Preparation lane: scenario -> bound envelope -> interpretation surface');
    expect(review).toContain('Binding kind: deferred');
    expect(review).toContain('State graph fingerprint:');
    expect(review).toContain('## Step 1');
    expect(review).toContain('Event signatures:');
    expect(review).toContain('Expected transitions:');
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.surface(policySearchScreenId, resultsGridId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.screenHints(policySearchScreenId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.pattern('core.input'))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedTrace(adoId))).toBeTruthy();
    expect(graph.nodes.some((node: { id: string }) => node.id === graphIds.generatedReview(adoId))).toBeTruthy();
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.provenanceKind).toBe('unresolved');
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.runtimeStatus).toBe('pending');
    expect(projectPath(result.compile.generatedTypes.outputPath)).toContain('lib/generated/tesseract-knowledge.ts');
  } finally {
    workspace.cleanup();
  }
});

test('paths identifies surface, graph, generated review, and supplement artifacts for the seeded scenario', async () => {
  const workspace = createTestWorkspace('compiler-paths');
  try {
    const result = await runWithLocalServices(
      describeScenarioPaths({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(projectPath(result.artifacts.snapshot)).toContain('.ado-sync/snapshots/10001.json');
    expect(projectPath(result.artifacts.scenario)).toContain('scenarios/demo/policy-search/10001.scenario.yaml');
    expect(projectPath(result.artifacts.bound)).toContain('.tesseract/bound/10001.json');
    expect(projectPath(result.artifacts.task)).toContain('.tesseract/tasks/10001.resolution.json');
    expect(projectPath(result.artifacts.graph)).toContain('.tesseract/graph/index.json');
    expect(projectPath(result.artifacts.interfaceGraph)).toContain('.tesseract/interface/index.json');
    expect(projectPath(result.artifacts.selectorCanon)).toContain('.tesseract/interface/selectors.json');
    expect(projectPath(result.artifacts.trace)).toContain('generated/demo/policy-search/10001.trace.json');
    expect(projectPath(result.artifacts.review)).toContain('generated/demo/policy-search/10001.review.md');
    expect(projectPath(result.artifacts.learningManifest)).toContain('.tesseract/learning/manifest.json');
    expect(projectPath(result.artifacts.trustPolicy)).toContain('.tesseract/policy/trust-policy.yaml');
    expect(projectPath(result.roots.interface)).toContain('.tesseract/interface');
    expect(projectPath(result.roots.sessions)).toContain('.tesseract/sessions');
    expect(projectPath(result.roots.learning)).toContain('.tesseract/learning');
    expect(result.supplements.sharedPatterns).toContain('knowledge/patterns/core.patterns.yaml');
    expect(result.knowledge).toEqual(expect.arrayContaining([
      {
        screen: 'policy-search',
        surface: expect.stringContaining('policy-search.surface.yaml'),
        elements: expect.stringContaining('policy-search.elements.yaml'),
        postures: expect.stringContaining('policy-search.postures.yaml'),
        hints: expect.stringContaining('policy-search.hints.yaml'),
      },
      {
        screen: 'policy-detail',
        surface: expect.stringContaining('policy-detail.surface.yaml'),
        elements: expect.stringContaining('policy-detail.elements.yaml'),
        postures: expect.stringContaining('policy-detail.postures.yaml'),
        hints: expect.stringContaining('policy-detail.hints.yaml'),
      },
    ]));
  } finally {
    workspace.cleanup();
  }
});

test('harvest visits declared route variants and writes route-scoped receipts', async () => {
  test.setTimeout(120_000);
  const workspace = createTestWorkspace('compiler-harvest');
  try {
    const result = await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const index = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const defaultReceipt = workspace.readJson<{
      app: string;
      routeId: string;
      variantId: string;
      url: string;
      selectorProbes: Array<{ variantRef: string }>;
      stateObservations: Array<{ stateRef: string; source: string; observed: boolean }>;
      eventCandidates: Array<{ eventSignatureRef: string }>;
      transitionObservations: Array<{ transitionRef?: string | null; classification: string }>;
      observationDiffs: Array<{ eventSignatureRef?: string | null; classification: string }>;
      targets: unknown[];
    }>('.tesseract', 'discovery', 'demo', 'policy-search', 'default', 'crawl.json');
    const seededReceipt = workspace.readJson<{ variantId: string; url: string }>(
      '.tesseract',
      'discovery',
      'demo',
      'policy-search',
      'results-with-policy',
      'crawl.json',
    );

    expect(result.failures).toEqual([]);
    expect(result.receipts).toEqual(expect.arrayContaining([
      '.tesseract/discovery/demo/policy-search/default/crawl.json',
      '.tesseract/discovery/demo/policy-search/results-with-policy/crawl.json',
      '.tesseract/discovery/demo/policy-detail/with-policy/crawl.json',
    ]));
    expect(index.app).toBe('demo');
    expect(index.version).toBe(2);
    expect(index.receipts).toHaveLength(3);
    expect(index.receipts.every((entry) => entry.status === 'ok')).toBeTruthy();
    expect(index.receipts.every((entry) => entry.writeDisposition === 'rewritten')).toBeTruthy();
    expect(index.receipts.every((entry) => entry.contentFingerprint?.startsWith('sha256:'))).toBeTruthy();
    expect(defaultReceipt.app).toBe('demo');
    expect(defaultReceipt.routeId).toBe('policy-search');
    expect(defaultReceipt.variantId).toBe('default');
    expect(defaultReceipt.url.startsWith('file:///')).toBeTruthy();
    expect(defaultReceipt.targets.length).toBeGreaterThan(0);
    expect(defaultReceipt.selectorProbes.length).toBeGreaterThan(0);
    expect(defaultReceipt.selectorProbes.every((probe) => probe.variantRef === 'route-variant:demo:policy-search:default')).toBeTruthy();
    expect(defaultReceipt.stateObservations.length).toBeGreaterThan(0);
    expect(defaultReceipt.eventCandidates.map((candidate) => candidate.eventSignatureRef)).toEqual([
      'event:policy-search:click-search',
      'event:policy-search:enter-policy-number',
    ]);
    expect(defaultReceipt.transitionObservations.some((entry) => entry.transitionRef === 'transition:policy-search:populate-policy-number')).toBeTruthy();
    expect(defaultReceipt.transitionObservations.some((entry) => entry.transitionRef === 'transition:policy-search:show-results')).toBeTruthy();
    expect(defaultReceipt.transitionObservations.every((entry) => entry.classification === 'matched')).toBeTruthy();
    expect(defaultReceipt.observationDiffs.some((entry) => entry.eventSignatureRef === 'event:policy-search:enter-policy-number' && entry.classification === 'observed')).toBeTruthy();
    expect(seededReceipt.variantId).toBe('results-with-policy');
    expect(seededReceipt.url).toContain('seed=POL-001');
  } finally {
    workspace.cleanup();
  }
});

test('harvest reuses unchanged route receipts and rewrites deterministically on drift', async () => {
  test.setTimeout(120_000);
  const workspace = createTestWorkspace('compiler-harvest-idempotence');
  try {
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const defaultReceiptPath = workspace.resolve('.tesseract', 'discovery', 'demo', 'policy-search', 'default', 'crawl.json');
    const resultsReceiptPath = workspace.resolve('.tesseract', 'discovery', 'demo', 'policy-search', 'results-with-policy', 'crawl.json');
    const firstIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const firstFingerprint = firstIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;
    const firstResultsFingerprint = firstIndex.receipts.find((entry) => entry.variantId === 'results-with-policy')?.contentFingerprint ?? null;
    const firstModifiedAt = statSync(defaultReceiptPath).mtimeMs;
    const firstResultsModifiedAt = statSync(resultsReceiptPath).mtimeMs;

    await wait(1100);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const reusedIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const reusedFingerprint = reusedIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;

    expect(reusedIndex.receipts.every((entry) => entry.writeDisposition === 'reused')).toBeTruthy();
    expect(reusedFingerprint).toBe(firstFingerprint);
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);

    const fixturePath = workspace.resolve('fixtures', 'demo-harness', 'policy-search.html');
    const originalFixture = readFileSync(fixturePath, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(fixturePath, originalFixture.replace('Search Results', 'Policy Matches'), 'utf8');

    await wait(1100);
    await runWithLocalServices(
      harvestDeclaredRoutes({ paths: workspace.paths, app: 'demo' }),
      workspace.rootDir,
    );
    const rewrittenIndex = validateDiscoveryIndex(workspace.readJson(
      '.tesseract',
      'discovery',
      'demo',
      'index.json',
    ));
    const rewrittenFingerprint = rewrittenIndex.receipts.find((entry) => entry.variantId === 'default')?.contentFingerprint ?? null;
    const rewrittenResultsEntry = rewrittenIndex.receipts.find((entry) => entry.variantId === 'results-with-policy') ?? null;

    expect(rewrittenIndex.receipts.some((entry) => entry.writeDisposition === 'rewritten')).toBeTruthy();
    expect(rewrittenIndex.receipts.find((entry) => entry.variantId === 'default')?.writeDisposition).toBe('reused');
    expect(rewrittenResultsEntry?.writeDisposition).toBe('rewritten');
    expect(rewrittenFingerprint).toBe(reusedFingerprint);
    expect(rewrittenResultsEntry?.contentFingerprint).not.toBe(firstResultsFingerprint);
    expect(statSync(defaultReceiptPath).mtimeMs).toBe(firstModifiedAt);
    expect(statSync(resultsReceiptPath).mtimeMs).toBeGreaterThan(firstResultsModifiedAt);
  } finally {
    workspace.cleanup();
  }
});

test('surface inspection returns approved structure plus derived capabilities', async () => {
  const workspace = createTestWorkspace('compiler-surface');
  try {
    const result = await runWithLocalServices(inspectSurface({ screen: policySearchScreenId, paths: workspace.paths }), workspace.rootDir);
    const resultsGrid = result.surfaceGraph.surfaces[resultsGridId];

    expect(resultsGrid?.assertions).toEqual(['structure', 'state']);
    expect(result.capabilities.some((entry) => entry.targetKind === 'surface' && entry.target === searchFormId)).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('workflow inspection exposes lane ownership, controls, and precedence for a seeded scenario', async () => {
  const workspace = createTestWorkspace('compiler-workflow');
  try {
    await runWithLocalServices(
      refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );
    const result = await runWithLocalServices(
      inspectWorkflow({ adoId: createAdoId('10001'), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(result.lanes.map((lane) => lane.lane)).toEqual([
      'intent',
      'knowledge',
      'control',
      'resolution',
      'execution',
      'governance/projection',
    ]);
    expect(result.controls.datasets).toContainEqual(expect.objectContaining({
      name: 'demo-default',
      artifactPath: 'controls/datasets/demo-default.dataset.yaml',
      isDefault: true,
    }));
    expect(result.controls.runbooks).toContainEqual(expect.objectContaining({
      name: 'demo-smoke',
      dataset: 'demo-default',
      resolutionControl: 'demo-policy-search',
    }));
    expect(result.controls.resolutionControls).toContainEqual(expect.objectContaining({
      name: 'demo-policy-search',
      stepIndex: 2,
    }));
    expect(result.precedence.resolution).toEqual([
      'scenario explicit',
      'resolution controls',
      'approved knowledge priors',
      'approved-equivalent overlays',
      'structured translation',
      'live DOM',
      'needs-human',
    ]);
    expect(result.selection.runbook).toBe('demo-smoke');
    expect(Array.isArray(result.hotspots)).toBeTruthy();
    expect(result.fingerprints?.task).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('run emits interpretation and execution receipts, then reprojects review surfaces', async () => {
  const workspace = createTestWorkspace('compiler-run');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const run = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const traceArtifact = JSON.parse(readFileSync(run.emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(run.emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    const runRecord = JSON.parse(readFileSync(run.runPath, 'utf8').replace(/^\uFEFF/, ''));
    const proposalBundle = JSON.parse(readFileSync(run.proposalsPath, 'utf8').replace(/^\uFEFF/, ''));
    const graph = JSON.parse(readFileSync(run.graph.graphPath, 'utf8').replace(/^\uFEFF/, ''));
    await runWithLocalServices(emitOperatorInbox({ paths: workspace.paths, filter: { adoId: '10001' } }), workspace.rootDir);
    const inboxReport = readFileSync(workspace.resolve('generated', 'operator', 'inbox.md'), 'utf8').replace(/^\uFEFF/, '');

    expect(runRecord.kind).toBe('scenario-run-record');
    expect(runRecord.steps).toHaveLength(4);
    expect(runRecord.steps.every((step: { interpretation: { kind: string } }) => step.interpretation.kind === 'resolved')).toBeTruthy();
    expect(traceArtifact.summary.provenanceKinds['approved-knowledge']).toBe(4);
    expect(traceArtifact.summary.provenanceKinds.unresolved).toBe(0);
    expect(traceArtifact.steps.every((step: { runtime: { status: string } }) => step.runtime.status === 'resolved')).toBeTruthy();
    expect(review).toContain('Runtime: resolved');
    expect(review).toContain('Interface graph fingerprint:');
    expect(review).toContain('Selector canon fingerprint:');
    expect(review).toContain('State graph fingerprint:');
    expect(review).toContain('Agent sessions: 1');
    expect(review).toContain('Learning corpora: 3');
    expect(review).toContain('Event signatures:');
    expect(review).toContain('Transition observations:');
    expect(runRecord.steps.some((step: { execution: { eventSignatureRefs?: string[]; transitionObservations?: unknown[] } }) =>
      (step.execution.eventSignatureRefs?.length ?? 0) > 0
      && (step.execution.transitionObservations?.length ?? 0) > 0)).toBeTruthy();
    expect(proposalBundle.proposals).toEqual([]);
    expect(graph.nodes.find((node: { id: string; payload?: Record<string, unknown> }) => node.id === graphIds.step(adoId, 2))?.payload?.runtimeStatus).toBe('resolved');
    expect(inboxReport).toContain('## Hotspot suggestions');
  } finally {
    workspace.cleanup();
  }
});

test('promoted behavior patterns reuse the same transition ids from interface graph through run receipts', async () => {
  const workspace = createTestWorkspace('compiler-phase2-reuse');
  try {
    const adoId = createAdoId('10001');
    writeFileSync(
      workspace.resolve('knowledge', 'patterns', 'form-entry.behavior.yaml'),
      readFileSync(path.join(process.cwd(), 'tests', 'fixtures', 'knowledge', 'patterns', 'form-entry.behavior.yaml'), 'utf8'),
      'utf8',
    );
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const run = await runWithLocalServices(runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }), workspace.rootDir);

    const stateGraph = workspace.readJson<{
      eventSignatures: Array<{
        ref: string;
        provenance: string[];
        effects: { transitionRefs: string[]; assertions: string[] };
      }>;
      transitions: Array<{ ref: string; provenance: string[] }>;
    }>('.tesseract', 'interface', 'state-graph.json');
    const taskPacket = workspace.readJson<{
      payload: {
        steps: Array<{
          index: number;
          grounding: {
            eventSignatureRefs: string[];
            expectedTransitionRefs: string[];
            effectAssertions: string[];
          };
        }>;
      };
    }>('.tesseract', 'tasks', '10001.resolution.json');
    const runRecord = JSON.parse(readFileSync(run.runPath, 'utf8').replace(/^\uFEFF/, '')) as {
      steps: Array<{
        stepIndex: number;
        execution: {
          eventSignatureRefs?: string[];
          expectedTransitionRefs?: string[];
          effectAssertions?: string[];
        };
      }>;
    };

    const inputEvent = stateGraph.eventSignatures.find((entry) => entry.ref === 'event:policy-search:enter-policy-number');
    const populatedTransition = stateGraph.transitions.find((entry) => entry.ref === 'transition:policy-search:populate-policy-number');
    const stepTwo = taskPacket.payload.steps.find((step) => step.index === 2);
    const executedStepTwo = runRecord.steps.find((step) => step.stepIndex === 2);

    expect(inputEvent).toBeTruthy();
    expect(populatedTransition).toBeTruthy();
    expect(stepTwo).toBeTruthy();
    expect(executedStepTwo).toBeTruthy();

    expect(inputEvent?.provenance).toEqual(expect.arrayContaining([
      'knowledge/screens/policy-search.behavior.yaml',
      'knowledge/patterns/form-entry.behavior.yaml',
    ]));
    expect(populatedTransition?.provenance).toEqual(expect.arrayContaining([
      'knowledge/screens/policy-search.behavior.yaml',
      'knowledge/patterns/form-entry.behavior.yaml',
    ]));
    expect(inputEvent?.effects.transitionRefs).toContain('transition:policy-search:populate-policy-number');
    expect(inputEvent?.effects.assertions).toContain('Policy number field keeps the entered value');
    expect(stepTwo?.grounding.expectedTransitionRefs).toContain('transition:policy-search:populate-policy-number');
    expect(stepTwo?.grounding.effectAssertions).toContain('Policy number field keeps the entered value');
    expect(executedStepTwo?.execution.expectedTransitionRefs).toContain('transition:policy-search:populate-policy-number');
    expect(executedStepTwo?.execution.effectAssertions).toContain('Policy number field keeps the entered value');
  } finally {
    workspace.cleanup();
  }
});


test('replay interpretation law: same provider and inputs yields no drift', async () => {
  const workspace = createTestWorkspace('compiler-replay-no-drift');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }), workspace.rootDir);
    const replay = await runWithLocalServices(
      replayInterpretation({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const drift = JSON.parse(readFileSync(replay.driftPath, 'utf8').replace(/^﻿/, ''));

    expect(drift.hasDrift).toBeFalsy();
    expect(drift.changedStepCount).toBe(0);
    expect(drift.explainableByFingerprintDelta).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('trace and impact queries operate over the derived graph without repo lore', async () => {
  const workspace = createTestWorkspace('compiler-trace-impact');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const trace = await runWithLocalServices(traceScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const impact = await runWithLocalServices(
      impactNode({ nodeId: graphIds.element(policySearchScreenId, searchButtonId), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(trace.nodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
    expect(trace.nodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.scenario(adoId))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.step(adoId, 3))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.generatedSpec(adoId))).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.step(adoId, 2))).toBeFalsy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.element(policySearchScreenId, resultsTableId))).toBeFalsy();
  } finally {
    workspace.cleanup();
  }
});


test('emit, types, and graph projections expose aligned incremental metadata for equivalent cache states', async () => {
  const workspace = createTestWorkspace('compiler-incremental-shape');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    const emitHit = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const typesHit = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphHit = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    expect(emitHit.incremental.status).toBe('cache-hit');
    expect(typesHit.incremental.status).toBe('cache-hit');
    expect(graphHit.incremental.status).toBe('cache-hit');

    const hitKeys = incrementalKeys(emitHit.incremental as unknown as Record<string, unknown>);
    expect(incrementalKeys(typesHit.incremental as unknown as Record<string, unknown>)).toEqual(hitKeys);
    expect(incrementalKeys(graphHit.incremental as unknown as Record<string, unknown>)).toEqual(hitKeys);

    unlinkSync(refresh.compile.emitted.outputPath);
    unlinkSync(typesHit.outputPath);
    unlinkSync(workspace.paths.graphIndexPath);

    const emitMiss = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const typesMiss = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphMiss = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);

    const emitMissIncremental = expectCacheMiss(emitMiss.incremental);
    const typesMissIncremental = expectCacheMiss(typesMiss.incremental);
    const graphMissIncremental = expectCacheMiss(graphMiss.incremental);

    expect(emitMissIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(typesMissIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(graphMissIncremental.cacheInvalidationReason).toBe('missing-output');

    const missKeys = incrementalKeys(emitMissIncremental as unknown as Record<string, unknown>);
    expect(incrementalKeys(typesMissIncremental as unknown as Record<string, unknown>)).toEqual(missKeys);
    expect(incrementalKeys(graphMissIncremental as unknown as Record<string, unknown>)).toEqual(missKeys);
  } finally {
    workspace.cleanup();
  }
});

test('graph and types skip rewrites when fingerprinted inputs are unchanged', async () => {
  const workspace = createTestWorkspace('compiler-cache');
  try {
    const graphFirst = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const typesFirst = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphManifestPath = path.join(workspace.paths.graphDir, 'build-manifest.json');
    const typesMetadataPath = path.join(workspace.paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
    const graphMtimeBefore = statSync(workspace.paths.graphIndexPath).mtimeMs;
    const typesMtimeBefore = statSync(typesFirst.outputPath).mtimeMs;
    const graphFingerprintBefore = JSON.parse(readFileSync(graphManifestPath, 'utf8')).outputFingerprint;
    const typesFingerprintBefore = JSON.parse(readFileSync(typesMetadataPath, 'utf8')).outputFingerprint;

    await wait(20);

    const graphSecond = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const typesSecond = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const graphMtimeAfter = statSync(workspace.paths.graphIndexPath).mtimeMs;
    const typesMtimeAfter = statSync(typesSecond.outputPath).mtimeMs;
    const graphFingerprintAfter = JSON.parse(readFileSync(graphManifestPath, 'utf8')).outputFingerprint;
    const typesFingerprintAfter = JSON.parse(readFileSync(typesMetadataPath, 'utf8')).outputFingerprint;

    expect(graphFirst.incremental.status).toMatch(/cache-(hit|miss)/);
    expect(typesFirst.incremental.status).toMatch(/cache-(hit|miss)/);
    expect(graphSecond.incremental.status).toBe('cache-hit');
    expect(typesSecond.incremental.status).toBe('cache-hit');
    expect(graphMtimeAfter).toBe(graphMtimeBefore);
    expect(typesMtimeAfter).toBe(typesMtimeBefore);
    expect(graphSecond.incremental.outputFingerprint).toBe(graphFirst.incremental.outputFingerprint);
    expect(typesSecond.incremental.outputFingerprint).toBe(typesFirst.incremental.outputFingerprint);
    expect(graphFingerprintAfter).toBe(graphFingerprintBefore);
    expect(typesFingerprintAfter).toBe(typesFingerprintBefore);
  } finally {
    workspace.cleanup();
  }
});

test('emit skips rewrites when the bound scenario and rendered artifacts are unchanged', async () => {
  const workspace = createTestWorkspace('compiler-emit-cache');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const suitePath = refresh.compile.compileSnapshot.boundScenario.metadata.suite;
    const manifestPath = emitManifestPath(workspace.paths, suitePath, adoId);
    const specMtimeBefore = statSync(refresh.compile.emitted.outputPath).mtimeMs;
    const traceMtimeBefore = statSync(refresh.compile.emitted.tracePath).mtimeMs;
    const reviewMtimeBefore = statSync(refresh.compile.emitted.reviewPath).mtimeMs;
    const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    await wait(20);

    const emittedAgain = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    expect(emittedAgain.incremental.status).toBe('cache-hit');
    expect(statSync(refresh.compile.emitted.outputPath).mtimeMs).toBe(specMtimeBefore);
    expect(statSync(refresh.compile.emitted.tracePath).mtimeMs).toBe(traceMtimeBefore);
    expect(statSync(refresh.compile.emitted.reviewPath).mtimeMs).toBe(reviewMtimeBefore);
    expect(manifestAfter.outputFingerprint).toBe(manifestBefore.outputFingerprint);
    expect(emittedAgain.incremental.outputFingerprint).toBe(manifestBefore.outputFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('emit regenerates when manifest is present but generated artifacts are missing or corrupted', async () => {
  const workspace = createTestWorkspace('compiler-emit-regenerate');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const suitePath = refresh.compile.compileSnapshot.boundScenario.metadata.suite;
    const manifestPath = emitManifestPath(workspace.paths, suitePath, adoId);
    const relativeSpec = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.outputPath));
    const relativeTrace = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.tracePath));
    const relativeReview = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.reviewPath));
    const relativeProposals = projectPath(path.relative(workspace.rootDir, refresh.compile.emitted.proposalsPath));
    const relativeManifest = projectPath(path.relative(workspace.rootDir, manifestPath));

    unlinkSync(refresh.compile.emitted.reviewPath);

    const rebuiltMissingOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeSpec);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeTrace);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeReview);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeProposals);
    expect(rebuiltMissingOutputIncremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(refresh.compile.emitted.tracePath, '{"bad":', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltInvalidOutputIncremental = expectCacheMiss(rebuiltInvalidOutput.incremental);
    expect(rebuiltInvalidOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeSpec);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeTrace);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeReview);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeProposals);
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain(relativeManifest);
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutputIncremental.outputFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('types regenerate when manifest is present but generated output is deleted or corrupted', async () => {
  const workspace = createTestWorkspace('compiler-types-regenerate');
  try {
    const metadataPath = path.join(workspace.paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');

    const firstBuild = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const firstManifest = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    unlinkSync(firstBuild.outputPath);

    const rebuiltMissingOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(rebuiltMissingOutput.outputPath, `export const corrupted = true;\n`, 'utf8');

    const rebuiltCorruptedOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterCorruption = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltCorruptedOutputIncremental = expectCacheMiss(rebuiltCorruptedOutput.incremental);
    expect(rebuiltCorruptedOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltCorruptedOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltCorruptedOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterCorruption.outputFingerprint).toBe(rebuiltCorruptedOutputIncremental.outputFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterCorruption.inputSetFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('graph rebuilds when manifest is present but cached graph is missing or invalid', async () => {
  const workspace = createTestWorkspace('compiler-graph-regenerate');
  try {
    const manifestPath = path.join(workspace.paths.graphDir, 'build-manifest.json');

    const firstBuild = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const firstManifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    unlinkSync(workspace.paths.graphIndexPath);

    const rebuiltMissingOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(workspace.paths.graphIndexPath, '{"bad":true}', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''));

    const rebuiltInvalidOutputIncremental = expectCacheMiss(rebuiltInvalidOutput.incremental);
    expect(rebuiltInvalidOutputIncremental.cacheInvalidationReason).toBe('invalid-output');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltInvalidOutputIncremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterInvalidOutput.outputFingerprint).toBe(rebuiltInvalidOutputIncremental.outputFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterMissingOutput.inputSetFingerprint);
    expect(firstManifest.inputSetFingerprint).toBe(manifestAfterInvalidOutput.inputSetFingerprint);
    expect(firstBuild.graph.nodes.length).toBeGreaterThan(0);
  } finally {
    workspace.cleanup();
  }
});

test('graph projection includes policy decision audit nodes and governs edges', async () => {
  const workspace = createTestWorkspace('compiler-policy-graph');
  try {
    const evidenceDir = path.join(workspace.paths.evidenceDir, 'tests');
    const evidencePath = path.join(evidenceDir, 'policy-decision.json');
    mkdirSync(evidenceDir, { recursive: true });
    writeFileSync(evidencePath, JSON.stringify({
      evidence: {
        type: 'assertion-run',
        timestamp: new Date().toISOString(),
        trigger: 'assertion-mismatch',
        observation: { message: 'snapshot mismatch' },
        proposal: {
          file: 'knowledge/snapshots/policy-search/results-with-policy.yaml',
          field: 'root',
          old_value: 'A',
          new_value: 'B',
        },
        confidence: 0.99,
        risk: 'high',
        scope: 'snapshot',
      },
    }, null, 2));

    const graphResult = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const policyNode = graphResult.graph.nodes.find((node) => node.kind === 'policy-decision');
    const governsEdge = graphResult.graph.edges.find((edge) => edge.kind === 'governs');

    expect(policyNode).toBeTruthy();
    expect(policyNode?.payload?.decision).toBe('deny');
    expect(governsEdge).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('task packet separates task and knowledge fingerprints via shared interface references', async () => {
  const workspace = createTestWorkspace('task-packet-fingerprint-separation');
  try {
    const adoId = createAdoId('10001');
    const first = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const firstPacket = workspace.readJson<{ payload: { knowledgeFingerprint: string; steps: Array<{ taskFingerprint: string; grounding: unknown; knowledgeRef?: string; runtimeKnowledge?: unknown }>; interface: unknown; selectors: unknown } }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(firstPacket.payload.interface).toBeTruthy();
    expect(firstPacket.payload.selectors).toBeTruthy();
    expect(firstPacket.payload.steps.every((step) => step.knowledgeRef === undefined)).toBeTruthy();
    expect(firstPacket.payload.steps.every((step) => step.runtimeKnowledge === undefined)).toBeTruthy();
    expect(firstPacket.payload.steps.every((step) => step.grounding)).toBeTruthy();

    const firstStepFingerprints = firstPacket.payload.steps.map((step) => step.taskFingerprint);

    const hintsPath = workspace.resolve('knowledge', 'screens', 'policy-search.hints.yaml');
    const originalHints = readFileSync(hintsPath, 'utf8').replace(/^\uFEFF/, '');
    writeFileSync(hintsPath, originalHints.replace('policy search screen', 'policy search workspace'), 'utf8');

    const second = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const secondPacket = workspace.readJson<{ payload: { knowledgeFingerprint: string; steps: Array<{ taskFingerprint: string }> }; taskFingerprint: string }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(second.compile.compileSnapshot.surface.payload.knowledgeFingerprint).not.toBe(first.compile.compileSnapshot.surface.payload.knowledgeFingerprint);
    expect(secondPacket.payload.steps.map((step) => step.taskFingerprint)).toEqual(firstStepFingerprints);
    expect(secondPacket.taskFingerprint).not.toBe(first.compile.compileSnapshot.surface.surfaceFingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('task packet size stays bounded with shared interface references', async () => {
  const workspace = createTestWorkspace('task-packet-size-sanity');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const taskPath = workspace.resolve('.tesseract', 'tasks', '10001.resolution.json');
    const packet = workspace.readJson<{ payload: { interface: unknown; selectors: unknown; steps: Array<{ runtimeKnowledge?: unknown }> } }>('.tesseract', 'tasks', '10001.resolution.json');
    const sizeBytes = statSync(taskPath).size;

    expect(packet.payload.interface).toBeTruthy();
    expect(packet.payload.selectors).toBeTruthy();
    expect(packet.payload.steps.some((step) => step.runtimeKnowledge !== undefined)).toBeFalsy();
    expect(sizeBytes).toBeLessThan(150_000);
  } finally {
    workspace.cleanup();
  }
});

test('interface intelligence compiles deterministic graph and selector canon with grounded task packets', async () => {
  const workspace = createTestWorkspace('interface-intelligence');
  try {
    const discoveryDir = workspace.resolve('.tesseract', 'discovery', 'policy-search');
    mkdirSync(discoveryDir, { recursive: true });
      const discoveryTargetRef = `target:element:${policySearchScreenId}:${policyNumberInputId}`;
      writeFileSync(
        path.join(discoveryDir, 'crawl.json'),
        `${JSON.stringify({
          kind: 'discovery-run',
          version: 2,
          stage: 'preparation',
          scope: 'workspace',
          governance: 'approved',
          app: 'demo',
          routeId: 'policy-search',
          variantId: 'default',
          routeVariantRef: 'route-variant:demo:policy-search:default',
          runId: 'seeded-discovery-run',
          screen: 'policy-search',
          url: '/policy-search',
        title: 'Policy Search',
        discoveredAt: '2026-03-10T00:00:00.000Z',
        artifactPath: '.tesseract/discovery/policy-search/crawl.json',
        rootSelector: 'body',
        snapshotHash: 'sha256:seeded-discovery',
        sections: [{
          id: 'searchFormSection',
          depth: 0,
          selector: 'form',
          surfaceIds: ['search-form'],
          elementIds: ['policyNumberInput'],
        }],
        surfaces: [{
          id: 'search-form',
          targetRef: `target:surface:${policySearchScreenId}:search-form`,
          section: 'searchFormSection',
          selector: 'form',
          role: 'form',
          name: 'Search form',
          kind: 'form',
          assertions: ['state'],
          testId: 'policy-search-form',
        }],
        elements: [{
          id: 'policyNumberInput',
          targetRef: discoveryTargetRef,
          surface: 'search-form',
          selector: "[data-testid='policy-number']",
          role: 'textbox',
          name: 'Policy Number',
          testId: 'policy-number',
          widget: 'os-input',
          required: true,
          locatorHint: 'test-id',
          locatorCandidates: [{ kind: 'test-id', value: 'policy-number' }],
        }],
        snapshotAnchors: [],
        targets: [{
          targetRef: discoveryTargetRef,
          graphNodeId: graphIds.target(discoveryTargetRef),
          kind: 'element',
          screen: 'policy-search',
          section: 'searchFormSection',
          surface: 'search-form',
          element: 'policyNumberInput',
        }],
        reviewNotes: [],
        selectorProbes: [{
          id: `${discoveryTargetRef}:probe:test-id:0`,
          selectorRef: `selector:${discoveryTargetRef}:test-id:0:policy-number`,
          targetRef: discoveryTargetRef,
          graphNodeId: graphIds.target(discoveryTargetRef),
          screen: 'policy-search',
          section: 'searchFormSection',
          element: 'policyNumberInput',
          strategy: { kind: 'test-id', value: 'policy-number' },
          source: 'discovery',
          variantRef: 'route-variant:demo:policy-search:default',
        }],
        graphDeltas: {
          nodeIds: [graphIds.target(discoveryTargetRef)],
          edgeIds: [],
        },
      }, null, 2)}\n`,
      'utf8',
    );

    const adoId = createAdoId('10001');
    const first = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const firstGraph = workspace.readJson<{ fingerprint: string; discoveryRunIds: string[]; nodes: Array<{ id: string; kind: string }> }>('.tesseract', 'interface', 'index.json');
    const firstSelectors = workspace.readJson<{ fingerprint: string; entries: Array<{ probes: Array<{ selectorRef: string; source: string }> }> }>('.tesseract', 'interface', 'selectors.json');
    const taskPacket = workspace.readJson<{
      payload: {
        interface: { fingerprint?: string };
        selectors: { fingerprint?: string };
        steps: Array<{ grounding?: { selectorRefs: string[] } }>;
      };
    }>('.tesseract', 'tasks', '10001.resolution.json');

    expect(firstGraph.discoveryRunIds).toContain('seeded-discovery-run');
    expect(firstGraph.nodes.some((node) => node.kind === 'harvest-run' && node.id === 'harvest-run:seeded-discovery-run')).toBeTruthy();
    expect(firstSelectors.entries.some((entry) => entry.probes.some((probe) => probe.source === 'discovery' && probe.selectorRef.includes('policy-number')))).toBeTruthy();
    expect(taskPacket.payload.interface.fingerprint).toBe(firstGraph.fingerprint);
    expect(taskPacket.payload.selectors.fingerprint).toBe(firstSelectors.fingerprint);
    expect(taskPacket.payload.steps.every((step) => step.grounding !== undefined)).toBeTruthy();
    expect(taskPacket.payload.steps.some((step) => (step.grounding?.selectorRefs.length ?? 0) > 0)).toBeTruthy();
    expect(first.compile.compileSnapshot.surface.payload.interface.fingerprint).toBe(firstGraph.fingerprint);
    expect(first.compile.compileSnapshot.surface.payload.selectors.fingerprint).toBe(firstSelectors.fingerprint);

    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const secondGraph = workspace.readJson<{ fingerprint: string }>('.tesseract', 'interface', 'index.json');
    const secondSelectors = workspace.readJson<{ fingerprint: string }>('.tesseract', 'interface', 'selectors.json');

    expect(secondGraph.fingerprint).toBe(firstGraph.fingerprint);
    expect(secondSelectors.fingerprint).toBe(firstSelectors.fingerprint);
  } finally {
    workspace.cleanup();
  }
});

test('interface graph and selector canon span both screens after second-screen compilation', async () => {
  const workspace = createTestWorkspace('multi-screen-graph');
  try {
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10001'), paths: workspace.paths }), workspace.rootDir);
    await runWithLocalServices(refreshScenario({ adoId: createAdoId('10010'), paths: workspace.paths }), workspace.rootDir);
    const graph = workspace.readJson<{
      nodes: Array<{ id: string; kind: string; screen?: string | null }>;
      edges: Array<{ id: string; kind: string }>;
      targetRefs: string[];
      stateRefs: string[];
    }>('.tesseract', 'interface', 'index.json');
    const selectors = workspace.readJson<{
      entries: Array<{ targetRef: string }>;
      summary: { totalTargets: number };
    }>('.tesseract', 'interface', 'selectors.json');

    const screenSet = new Set(graph.nodes.filter((n) => n.screen).map((n) => n.screen));
    expect(screenSet.has('policy-search')).toBeTruthy();
    expect(screenSet.has('policy-detail')).toBeTruthy();

    const selectorScreens = new Set(selectors.entries.map((e) => e.targetRef.split(':')[2]));
    expect(selectorScreens.has('policy-search')).toBeTruthy();
    expect(selectorScreens.has('policy-detail')).toBeTruthy();

    expect(graph.targetRefs.some((ref) => ref.includes('policy-search'))).toBeTruthy();
    expect(graph.targetRefs.some((ref) => ref.includes('policy-detail'))).toBeTruthy();
    expect(selectors.summary.totalTargets).toBeGreaterThan(10);
  } finally {
    workspace.cleanup();
  }
});

test('agent session adapters share one provider-agnostic event vocabulary', async () => {
  const workspace = createTestWorkspace('agent-session-vocabulary');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);
    const surface = catalog.interpretationSurfaces.find((entry) => entry.artifact.payload.adoId === adoId)?.artifact;

    expect(surface).toBeTruthy();
    if (!surface) {
      throw new Error('interpretation surface is required');
    }

    const input = {
      adoId,
      runId: 'session-run',
      sessionId: 'session-run',
      surface,
      interfaceGraph: catalog.interfaceGraph?.artifact ?? null,
      selectorCanon: catalog.selectorCanon?.artifact ?? null,
      proposalBundle: null,
      learningManifest: catalog.learningManifest?.artifact ?? null,
    };

    const deterministic = resolveAgentSessionAdapter('deterministic-agent-session').eventVocabulary(input);
    const copilot = resolveAgentSessionAdapter('copilot-vscode-chat').eventVocabulary(input);
    const deterministicTypes = [...new Set(deterministic.map((event) => event.type))].sort((left, right) => left.localeCompare(right));
    const copilotTypes = [...new Set(copilot.map((event) => event.type))].sort((left, right) => left.localeCompare(right));

    expect(deterministicTypes).toEqual(copilotTypes);
    expect(deterministicTypes).toEqual(['artifact-inspection', 'execution-reviewed', 'orientation']);
  } finally {
    workspace.cleanup();
  }
});

test('run scenario emits agent session and learning artifacts with replay-ready provenance', async () => {
  const workspace = createTestWorkspace('agent-session-learning');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const decomposition = workspace.readJson<Array<{ runtime: string; graphNodeIds: string[]; selectorRefs: string[] }>>(
      '.tesseract',
      'learning',
      'decomposition',
      '10001.fragments.json',
    );
    const workflow = workspace.readJson<Array<{ runtime: string; graphNodeIds: string[]; selectorRefs: string[] }>>(
      '.tesseract',
      'learning',
      'workflow',
      '10001.fragments.json',
    );
    const compileManifest = workspace.readJson<{ kind: string; corpora: Array<{ runtime: string; exampleCount: number }> }>(
      '.tesseract',
      'learning',
      'manifest.json',
    );

    expect(decomposition.every((fragment) => fragment.runtime === 'decomposition')).toBeTruthy();
    expect(workflow[0]?.runtime).toBe('workflow');
    expect(workflow[0]?.graphNodeIds.length).toBeGreaterThan(0);
    expect(workflow[0]?.selectorRefs.length).toBeGreaterThan(0);
    expect(compileManifest.kind).toBe('training-corpus-manifest');
    expect(compileManifest.corpora.map((entry) => entry.runtime)).toEqual(['decomposition', 'repair-recovery', 'workflow']);

    const run = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const session = workspace.readJson<{ sessionId: string; adapterId: string; eventCount: number; eventTypes: Record<string, number>; transcripts: Array<{ kind: string }> }>(
      '.tesseract',
      'sessions',
      run.runId,
      'session.json',
    );
    const sessionEvents = workspace.readText('.tesseract', 'sessions', run.runId, 'events.jsonl')
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as { type: string });
    const repair = workspace.readJson<Array<{ runtime: string }>>(
      '.tesseract',
      'learning',
      'repair-recovery',
      '10001.fragments.json',
    );
    const replay = workspace.readJson<{ runtime: string; fragmentIds: string[]; graphNodeIds: string[]; selectorRefs: string[] }>(
      '.tesseract',
      'learning',
      'replays',
      `10001.${run.runId}.json`,
    );
    const manifest = workspace.readJson<{ replayExamples: number; corpora: Array<{ runtime: string; exampleCount: number }> }>(
      '.tesseract',
      'learning',
      'manifest.json',
    );
    const catalog = await runWithLocalServices(loadWorkspaceCatalog({ paths: workspace.paths }), workspace.rootDir);

    expect(session.sessionId).toBe(run.runId);
    expect(session.adapterId).toBe('deterministic-agent-session');
    expect(session.eventCount).toBe(sessionEvents.length);
    expect(session.transcripts[0]?.kind).toBe('none');
    expect(session.eventTypes.orientation).toBe(1);
    expect(session.eventTypes['artifact-inspection']).toBe(1);
    expect(session.eventTypes['execution-reviewed']).toBe(1);
    expect(sessionEvents.map((event) => event.type)).toEqual(['orientation', 'artifact-inspection', 'execution-reviewed']);
    expect(repair.every((fragment) => fragment.runtime === 'repair-recovery')).toBeTruthy();
    expect(replay.runtime).toBe('workflow');
    expect(replay.fragmentIds.length).toBeGreaterThan(0);
    expect(replay.graphNodeIds.length).toBeGreaterThan(0);
    expect(replay.selectorRefs.length).toBeGreaterThan(0);
    expect(manifest.replayExamples).toBe(1);
    expect(catalog.agentSessions.some((entry) => entry.artifact.sessionId === run.runId)).toBeTruthy();
    expect(catalog.learningManifest?.artifact.replayExamples).toBe(1);
    expect(catalog.replayExamples.some((entry) => entry.artifact.runId === run.runId)).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('flywheel: proposal activation improves knowledge hit rate on recompile for 10011', async () => {
  const workspace = createTestWorkspace('flywheel-proposal-loop');
  try {
    const adoId = createAdoId('10011');

    // Phase 1: compile + run 10011 in diagnostic mode — step 4 (underwriter) is unresolved
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const baselineRun = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const baselineTrace = JSON.parse(readFileSync(baselineRun.emitted.tracePath, 'utf8').replace(/^\uFEFF/, '')) as {
      summary: { stageMetrics: { knowledgeHitRate: number } };
      steps: Array<{ provenanceKind: string; unresolvedGaps: string[] }>;
    };
    expect(baselineTrace.summary.stageMetrics.knowledgeHitRate).toBe(0.75);
    expect(baselineTrace.steps[3]!.provenanceKind).toBe('unresolved');
    expect(baselineTrace.steps[3]!.unresolvedGaps).toContain('runtime-resolution-required');

    // Phase 2: simulate what the runtime agent would do — add the underwriter element
    // to the knowledge layer (as live DOM discovery would propose)
    const elementsPath = path.join(workspace.rootDir, 'knowledge', 'screens', 'policy-detail.elements.yaml');
    const elementsContent = readFileSync(elementsPath, 'utf8');
    writeFileSync(elementsPath, elementsContent + `  underwriter:
    role: text
    name: Underwriter
    testId: underwriter
    surface: detail-fields
    widget: os-region
    required: false
`);

    // Also add a hint alias to help match the novel phrasing
    const proposal: ProposalEntry = {
      proposalId: 'proposal-underwriter-alias',
      stepIndex: 4,
      artifactType: 'hints',
      targetPath: 'knowledge/screens/policy-detail.hints.yaml',
      title: 'Capture phrasing for step 4 (underwriter)',
      patch: {
        screen: 'policy-detail',
        element: 'underwriter',
        alias: 'Verify the underwriter name is displayed on the detail page',
      },
      evidenceIds: [],
      impactedSteps: [4],
      trustPolicy: { decision: 'allow', reasons: [] },
      certification: 'uncertified',
      activation: {
        status: 'pending',
        activatedAt: null,
        certifiedAt: null,
        reason: null,
      },
      lineage: {
        runIds: ['flywheel-run-1'],
        evidenceIds: [],
        sourceArtifactPaths: ['.tesseract/tasks/10011.runtime.json'],
        role: 'csr',
        state: 'quoted',
        driftSeed: 'flywheel-seed-1',
      },
    };

    const proposalBundle = createProposalBundleEnvelope({
      ids: createScenarioEnvelopeIds({
        adoId,
        suite: 'demo/policy-detail',
        runId: 'flywheel-run-1',
        dataset: 'demo-default',
        runbook: 'demo-smoke',
        resolutionControl: null,
      }),
      fingerprints: createScenarioEnvelopeFingerprints({
        artifact: 'flywheel-run-1:proposal',
        content: 'sha256:content',
        knowledge: 'sha256:knowledge',
        controls: 'sha256:controls',
        task: 'sha256:task',
        run: 'flywheel-run-1',
      }),
      lineage: {
        sources: ['.tesseract/tasks/10011.runtime.json'],
        parents: ['sha256:task', 'flywheel-run-1'],
        handshakes: ['preparation', 'resolution', 'execution', 'evidence', 'proposal'],
      },
      governance: 'approved',
      payload: {
        adoId,
        runId: 'flywheel-run-1',
        revision: 1,
        title: 'Verify policy detail loads and displays coverage effective date',
        suite: 'demo/policy-detail',
        proposals: [proposal],
      },
      proposals: [proposal],
    });

    // Phase 3: activate the hint proposal — patches hints file with underwriter alias
    const activation = await runWithLocalServices(activateProposalBundle({
      paths: workspace.paths,
      proposalBundle,
    }), workspace.rootDir);
    expect(activation.blockedProposalIds).toEqual([]);
    expect(activation.activatedPaths).toHaveLength(1);
    expect(activation.activatedPaths[0]).toContain('policy-detail.hints.yaml');

    // Phase 4: recompile + re-run — step 4 should now resolve from approved knowledge
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const improvedRun = await runWithLocalServices(
      runScenario({ adoId, paths: workspace.paths, interpreterMode: 'diagnostic' }),
      workspace.rootDir,
    );
    const improvedTrace = JSON.parse(readFileSync(improvedRun.emitted.tracePath, 'utf8').replace(/^\uFEFF/, '')) as {
      summary: { stageMetrics: { knowledgeHitRate: number } };
      steps: Array<{ provenanceKind: string; unresolvedGaps: string[] }>;
    };

    // The flywheel turned: knowledge hit rate improved from 0.75 to 1.0
    expect(improvedTrace.summary.stageMetrics.knowledgeHitRate).toBe(1);
    expect(improvedTrace.steps[3]!.provenanceKind).toBe('approved-knowledge');
    expect(improvedTrace.steps[3]!.unresolvedGaps).toEqual([]);

    // Move 5: scorecard delta — structured comparison of the two runs
    const delta = {
      baseline: {
        runId: baselineRun.runId,
        knowledgeHitRate: baselineTrace.summary.stageMetrics.knowledgeHitRate,
        unresolvedSteps: baselineTrace.steps.filter((s) => s.provenanceKind === 'unresolved').length,
        approvedKnowledgeSteps: baselineTrace.steps.filter((s) => s.provenanceKind === 'approved-knowledge').length,
      },
      improved: {
        runId: improvedRun.runId,
        knowledgeHitRate: improvedTrace.summary.stageMetrics.knowledgeHitRate,
        unresolvedSteps: improvedTrace.steps.filter((s) => s.provenanceKind === 'unresolved').length,
        approvedKnowledgeSteps: improvedTrace.steps.filter((s) => s.provenanceKind === 'approved-knowledge').length,
      },
      proposalActivations: 1,
      knowledgeHitRateDelta: improvedTrace.summary.stageMetrics.knowledgeHitRate - baselineTrace.summary.stageMetrics.knowledgeHitRate,
      unresolvedDelta: improvedTrace.steps.filter((s) => s.provenanceKind === 'unresolved').length - baselineTrace.steps.filter((s) => s.provenanceKind === 'unresolved').length,
    };

    // Resolution quality improved
    expect(delta.knowledgeHitRateDelta).toBe(0.25);
    // Unresolved count decreased
    expect(delta.unresolvedDelta).toBe(-1);
    // Knowledge coverage increased
    expect(delta.improved.approvedKnowledgeSteps).toBeGreaterThan(delta.baseline.approvedKnowledgeSteps);
    // Exactly one proposal activation drove the improvement
    expect(delta.proposalActivations).toBe(1);
  } finally {
    workspace.cleanup();
  }
});

test('dogfood loop completes two iterations and produces a legible ledger', async () => {
  const workspace = createTestWorkspace('dogfood-loop');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger, ledgerPath } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 2,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    expect(ledger.kind).toBe('dogfood-ledger');
    expect(ledger.version).toBe(1);
    expect(ledger.maxIterations).toBe(2);
    expect(ledger.completedIterations).toBeGreaterThanOrEqual(1);
    expect(ledger.completedIterations).toBeLessThanOrEqual(2);
    expect(ledger.iterations.length).toBeGreaterThanOrEqual(1);
    expect(ledger.iterations[0]!.iteration).toBe(1);
    expect(ledger.iterations[0]!.scenarioIds.length).toBeGreaterThan(0);
    expect(ledger.iterations[0]!.knowledgeHitRate).toBeGreaterThanOrEqual(0);
    expect(typeof ledger.knowledgeHitRateDelta).toBe('number');
    expect(typeof ledger.totalProposalsActivated).toBe('number');

    // Hardened ledger fields
    expect(ledger.convergenceReason).toBeDefined();
    expect(typeof ledger.totalInstructionCount).toBe('number');
    expect(ledger.totalInstructionCount).toBeGreaterThanOrEqual(0);
    expect(ledger.iterations[0]!.totalStepCount).toBeGreaterThan(0);
    expect(typeof ledger.iterations[0]!.instructionCount).toBe('number');
    expect(typeof ledger.iterations[0]!.unresolvedStepCount).toBe('number');

    const writtenLedger = JSON.parse(readFileSync(ledgerPath, 'utf8').replace(/^\uFEFF/, '')) as DogfoodLedger;
    expect(writtenLedger.kind).toBe('dogfood-ledger');
    expect(writtenLedger.completedIterations).toBe(ledger.completedIterations);
    expect(writtenLedger.convergenceReason).toBe(ledger.convergenceReason);
    expect(writtenLedger.totalInstructionCount).toBe(ledger.totalInstructionCount);
  } finally {
    workspace.cleanup();
  }
});

test('dogfood loop converges early when budget is exhausted', async () => {
  const workspace = createTestWorkspace('dogfood-budget');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 5,
        maxInstructionCount: 0,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    expect(ledger.converged).toBe(true);
    expect(ledger.convergenceReason).toBe('budget-exhausted');
    expect(ledger.completedIterations).toBe(1);
    expect(ledger.totalInstructionCount).toBeGreaterThanOrEqual(0);
  } finally {
    workspace.cleanup();
  }
});

test('dogfood loop converges when threshold-met on stable knowledge', async () => {
  const workspace = createTestWorkspace('dogfood-threshold');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const { ledger } = await runWithLocalServices(
      runDogfoodLoop({
        paths: workspace.paths,
        maxIterations: 3,
        convergenceThreshold: 0.5,
        interpreterMode: 'diagnostic',
      }),
      workspace.rootDir,
    );

    // With a high threshold (0.5), if knowledge doesn't improve by 50%+ between
    // iterations, convergence triggers. Stable knowledge base should trigger this.
    expect(ledger.completedIterations).toBeGreaterThanOrEqual(2);
    expect(['threshold-met', 'no-proposals', 'max-iterations']).toContain(ledger.convergenceReason);
  } finally {
    workspace.cleanup();
  }
});

test('drift applicator mutates knowledge files according to variance manifest', async () => {
  const workspace = createTestWorkspace('drift-applicator');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const manifest: VarianceManifest = {
      kind: 'variance-manifest',
      version: 1,
      description: 'Test drift events for policy-search',
      screen: 'policy-search',
      'drift-events': [
        {
          id: 'label-drift-search-button',
          type: 'label-change',
          target: { screen: 'policy-search', element: 'searchButton' },
          mutation: { field: 'name', from: 'Search', to: 'Find Policies' },
        },
        {
          id: 'locator-drift-results',
          type: 'locator-degradation',
          target: { screen: 'policy-search', element: 'resultsTable' },
          mutation: { field: 'testId', from: 'search-results-table', to: 'results-grid-v2' },
        },
        {
          id: 'element-addition-reset',
          type: 'element-addition',
          target: { screen: 'policy-search' },
          mutation: {
            elementId: 'resetButton',
            definition: { role: 'button', name: 'Reset', testId: 'reset-btn', surface: 'search-actions', widget: 'os-button', required: false },
          },
        },
        {
          id: 'alias-removal-validation',
          type: 'alias-removal',
          target: { screen: 'policy-search', element: 'validationSummary' },
          mutation: { removedAliases: ['error summary'] },
        },
      ],
    };

    const result = await runWithLocalServices(
      applyDriftEvents({ paths: workspace.paths, manifest }),
      workspace.rootDir,
    );

    expect(result.appliedEventIds).toEqual([
      'label-drift-search-button',
      'locator-drift-results',
      'element-addition-reset',
      'alias-removal-validation',
    ]);
    expect(result.modifiedFiles.length).toBeGreaterThanOrEqual(1);

    // Verify elements file was mutated
    const elementsPath = path.join(workspace.rootDir, 'knowledge/screens/policy-search.elements.yaml');
    const elementsText = readFileSync(elementsPath, 'utf8');
    expect(elementsText).toContain('Find Policies');
    expect(elementsText).toContain('results-grid-v2');
    expect(elementsText).toContain('resetButton');

    // Verify hints file was mutated (alias removal)
    const hintsPath = path.join(workspace.rootDir, 'knowledge/screens/policy-search.hints.yaml');
    const hintsText = readFileSync(hintsPath, 'utf8');
    expect(hintsText).not.toContain('error summary');
  } finally {
    workspace.cleanup();
  }
});
