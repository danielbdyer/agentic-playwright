import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { buildDerivedGraph } from '../lib/application/graph';
import { impactNode } from '../lib/application/impact';
import { emitOperatorInbox } from '../lib/application/inbox';
import { describeScenarioPaths } from '../lib/application/inspect';
import { buildImprovementRun, improvementLedgerPath } from '../lib/application/improvement';
import { emitScenario } from '../lib/application/emit';
import { emitManifestPath } from '../lib/application/paths';
import { refreshScenario } from '../lib/application/refresh';
import { runScenario } from '../lib/application/run';
import { replayInterpretation } from '../lib/application/replay-interpretation';
import { inspectSurface } from '../lib/application/surface';
import { traceScenario } from '../lib/application/trace';
import { generateTypes } from '../lib/application/types';
import { inspectWorkflow } from '../lib/application/workflow';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createAdoId } from '../lib/domain/identity';
import { graphIds } from '../lib/domain/ids';
import {
  DEFAULT_PIPELINE_CONFIG,
  type PipelineFitnessReport,
} from '../lib/domain/types';
import { createTestWorkspace } from './support/workspace';
import {
  policySearchScreenId,
  searchButtonId,
  resultsTableId,
  resultsGridId,
  searchFormId,
  wait,
  projectPath,
  incrementalKeys,
  expectCacheMiss,
  sampleImprovementRunForScenario,
  writeImprovementLedgerFixture,
} from './support/compiler-helpers';

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
      workspace.suiteResolve('knowledge', 'patterns', 'form-entry.behavior.yaml'),
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
    const drift = JSON.parse(readFileSync(replay.driftPath, 'utf8').replace(/^\uFEFF/, ''));

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

test('derived graph projects recursive improvement artifacts and impact explains their lineage', async () => {
  const workspace = createTestWorkspace('compiler-improvement-graph');
  try {
    const adoId = createAdoId('10001');
    await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);

    const fitnessReport: PipelineFitnessReport = {
      kind: 'pipeline-fitness-report',
      version: 1,
      pipelineVersion: 'abc123',
      runAt: '2026-03-19T12:00:00.000Z',
      baseline: true,
      metrics: {
        knowledgeHitRate: 0.75,
        translationPrecision: 0.8,
        translationRecall: 0.6,
        convergenceVelocity: 2,
        proposalYield: 0.9,
        resolutionByRung: [
          { rung: 'approved-screen-knowledge', wins: 3, rate: 0.75 },
          { rung: 'structured-translation', wins: 1, rate: 0.25 },
        ],
        degradedLocatorRate: 0.1,
        recoverySuccessRate: 1,
      },
      failureModes: [
        {
          class: 'translation-threshold-miss',
          count: 2,
          affectedSteps: 2,
          exampleIntents: ['search by policy number'],
          improvementTarget: {
            kind: 'translation',
            detail: 'Adjust overlap score threshold or improve scoring formula',
          },
        },
      ],
      scoringEffectiveness: {
        bottleneckWeightCorrelations: [
          {
            signal: 'translation-fallback-dominant',
            weight: 0.25,
            correlationWithImprovement: 0.1,
          },
        ],
        proposalRankingAccuracy: 0.9,
      },
    };

    const improvementRun = buildImprovementRun({
      paths: workspace.paths,
      pipelineVersion: 'abc123',
      baselineConfig: DEFAULT_PIPELINE_CONFIG,
      configDelta: {},
      substrateContext: {
        substrate: 'synthetic',
        seed: 'graph-seed',
        scenarioCount: 1,
        screenCount: 1,
        phrasingTemplateVersion: 'v1',
      },
      fitnessReport,
      scorecardComparison: {
        improved: true,
        knowledgeHitRateDelta: 0.1,
        translationPrecisionDelta: 0.05,
        convergenceVelocityDelta: -1,
      },
      scorecardSummary: 'Accepted by governed scorecard gate.',
      ledger: {
        kind: 'dogfood-ledger',
        version: 1,
        maxIterations: 2,
        completedIterations: 2,
        converged: true,
        convergenceReason: 'threshold-met',
        iterations: [
          {
            iteration: 1,
            scenarioIds: [adoId],
            proposalsGenerated: 1,
            proposalsActivated: 1,
            proposalsBlocked: 0,
            knowledgeHitRate: 0.5,
            unresolvedStepCount: 2,
            totalStepCount: 4,
            instructionCount: 4,
          },
          {
            iteration: 2,
            scenarioIds: [adoId],
            proposalsGenerated: 1,
            proposalsActivated: 1,
            proposalsBlocked: 0,
            knowledgeHitRate: 0.75,
            unresolvedStepCount: 1,
            totalStepCount: 4,
            instructionCount: 3,
          },
        ],
        totalProposalsActivated: 2,
        totalInstructionCount: 7,
        knowledgeHitRateDelta: 0.25,
      },
      parentExperimentId: null,
      tags: ['speedrun'],
    });

    const improvementLedgerFile = improvementLedgerPath(workspace.paths);
    mkdirSync(path.dirname(improvementLedgerFile), { recursive: true });
    writeFileSync(
      improvementLedgerFile,
      `${JSON.stringify({ kind: 'improvement-ledger', version: 1, runs: [improvementRun] }, null, 2)}\n`,
      'utf8',
    );

    const graphResult = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const impact = await runWithLocalServices(
      impactNode({ nodeId: graphIds.scenario(adoId), paths: workspace.paths }),
      workspace.rootDir,
    );

    expect(graphResult.graph.nodes.some((node) => node.id === graphIds.improvementRun(improvementRun.improvementRunId))).toBeTruthy();
    expect(graphResult.graph.nodes.some((node) => node.kind === 'participant')).toBeTruthy();
    expect(graphResult.graph.nodes.some((node) => node.kind === 'intervention')).toBeTruthy();
    expect(graphResult.graph.nodes.some((node) => node.kind === 'acceptance-decision')).toBeTruthy();
    expect(
      graphResult.graph.edges.some((edge) =>
        edge.kind === 'derived-from'
        && edge.from === graphIds.improvementRun(improvementRun.improvementRunId)
        && edge.to === graphIds.scenario(adoId)),
    ).toBeTruthy();
    expect(impact.impactedNodes.some((node) => node.id === graphIds.improvementRun(improvementRun.improvementRunId))).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});

test('emit and operator inbox surfaces project recursive improvement lineage for scenario-scoped runs', async () => {
  const workspace = createTestWorkspace('compiler-improvement-surfaces');
  try {
    const adoId = createAdoId('10001');
    const refresh = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const improvementRun = sampleImprovementRunForScenario(workspace, adoId);
    writeImprovementLedgerFixture(workspace, improvementRun);

    const emitted = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const inbox = await runWithLocalServices(
      emitOperatorInbox({ paths: workspace.paths, filter: { adoId: '10001' } }),
      workspace.rootDir,
    );
    const traceArtifact = JSON.parse(readFileSync(emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    const inboxReport = readFileSync(inbox.inboxReportPath, 'utf8').replace(/^\uFEFF/, '');
    const inboxIndex = JSON.parse(readFileSync(inbox.inboxIndexPath, 'utf8').replace(/^\uFEFF/, ''));
    const latestDecision = improvementRun.acceptanceDecisions[0] ?? null;

    expect(emitted.incremental.status).toBe('cache-miss');
    expect(traceArtifact.improvement).toEqual({
      relatedRunIds: [improvementRun.improvementRunId],
      latestRunId: improvementRun.improvementRunId,
      latestAccepted: improvementRun.accepted,
      latestVerdict: latestDecision?.verdict ?? null,
      latestDecisionId: latestDecision?.decisionId ?? null,
      signalCount: improvementRun.signals.length,
      candidateInterventionCount: improvementRun.candidateInterventions.length,
      checkpointRef: latestDecision?.checkpointRef ?? null,
    });
    expect(review).toContain('## Recursive Improvement');
    expect(review).toContain(`- Latest improvement run: ${improvementRun.improvementRunId}`);
    expect(review).toContain(`- Latest verdict: ${latestDecision?.verdict ?? 'none'}`);
    expect(review).toContain(`- Latest checkpoint: ${latestDecision?.checkpointRef ?? 'none'}`);
    expect(inboxReport).toContain('## Recursive improvement');
    expect(inboxReport).toContain(improvementRun.improvementRunId);
    expect(inboxReport).toContain(`checkpoint: ${latestDecision?.checkpointRef ?? 'none'}`);
    expect(inboxIndex.improvementRuns).toHaveLength(1);
    expect(inboxIndex.improvementRuns[0].improvementRunId).toBe(improvementRun.improvementRunId);
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
    const manifestBefore = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

    await wait(20);

    const emittedAgain = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfter = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

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
    const relativeSpec = projectPath(path.relative(workspace.suiteRoot, refresh.compile.emitted.outputPath));
    const relativeTrace = projectPath(path.relative(workspace.suiteRoot, refresh.compile.emitted.tracePath));
    const relativeReview = projectPath(path.relative(workspace.suiteRoot, refresh.compile.emitted.reviewPath));
    const relativeProposals = projectPath(path.relative(workspace.suiteRoot, refresh.compile.emitted.proposalsPath));
    const relativeManifest = projectPath(path.relative(workspace.rootDir, manifestPath));

    unlinkSync(refresh.compile.emitted.reviewPath);

    const rebuiltMissingOutput = await runWithLocalServices(
      emitScenario({ paths: workspace.paths, compileSnapshot: refresh.compile.compileSnapshot }),
      workspace.rootDir,
    );
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

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
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

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
    const firstManifest = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''));

    unlinkSync(firstBuild.outputPath);

    const rebuiltMissingOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.ts');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('lib/generated/tesseract-knowledge.metadata.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(rebuiltMissingOutput.outputPath, `export const corrupted = true;\n`, 'utf8');

    const rebuiltCorruptedOutput = await runWithLocalServices(generateTypes({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterCorruption = JSON.parse(readFileSync(metadataPath, 'utf8').replace(/^\uFEFF/, ''));

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
    const firstManifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

    unlinkSync(workspace.paths.graphIndexPath);

    const rebuiltMissingOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterMissingOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

    const rebuiltMissingOutputIncremental = expectCacheMiss(rebuiltMissingOutput.incremental);
    expect(rebuiltMissingOutputIncremental.cacheInvalidationReason).toBe('missing-output');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/index.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/mcp-catalog.json');
    expect(rebuiltMissingOutputIncremental.rewritten).toContain('.tesseract/graph/build-manifest.json');
    expect(manifestAfterMissingOutput.outputFingerprint).toBe(rebuiltMissingOutputIncremental.outputFingerprint);

    writeFileSync(workspace.paths.graphIndexPath, '{"bad":true}', 'utf8');

    const rebuiltInvalidOutput = await runWithLocalServices(buildDerivedGraph({ paths: workspace.paths }), workspace.rootDir);
    const manifestAfterInvalidOutput = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));

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

    // Find the policy-decision node for our specific evidence (assertion-mismatch → deny)
    const denyNode = graphResult.graph.nodes.find(
      (node) => node.kind === 'policy-decision' && (node.payload as Record<string, unknown>)?.decision === 'deny',
    );
    const governsEdgeForDeny = denyNode
      ? graphResult.graph.edges.find((edge) => edge.kind === 'governs' && edge.from === denyNode.id)
      : null;

    expect(policyNode).toBeTruthy();
    expect(denyNode).toBeTruthy();
    expect(denyNode?.payload?.decision).toBe('deny');
    expect(governsEdge || governsEdgeForDeny).toBeTruthy();
  } finally {
    workspace.cleanup();
  }
});
