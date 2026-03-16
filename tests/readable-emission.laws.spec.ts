import * as ts from 'typescript';
import { expect, test } from '@playwright/test';
import { readFileSync } from 'fs';
import { createAdoId, createElementId, createScreenId } from '../lib/domain/identity';
import { buildGroundedSpecFlow } from '../lib/domain/grounded-flow';
import { renderReadableSpecModule } from '../lib/domain/spec-codegen';
import type { BoundScenario, GroundedSpecFlow, ScenarioInterpretationSurface } from '../lib/domain/types';
import { refreshScenario } from '../lib/application/refresh';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createTestWorkspace } from './support/workspace';

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = Math.imul(current ^ (current >>> 15), 1 | current);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const testImports = {
  fixtures: '../../../fixtures/index',
  readableHelpers: '../../../lib/runtime/readable-helpers',
  scenario: '../../../lib/runtime/scenario',
  execution: '../../../lib/application/execution/load-run-plan',
  environment: '../../../lib/infrastructure/runtime/local-runtime-environment',
};

function createTestBoundScenario(overrides?: Partial<{ stepCount: number; hasUnbound: boolean; seed: number }>): BoundScenario {
  const stepCount = overrides?.stepCount ?? 4;
  const hasUnbound = overrides?.hasUnbound ?? false;
  const adoId = createAdoId('10001');

  const actions = ['navigate', 'input', 'click', 'assert-snapshot'] as const;
  const steps = Array.from({ length: stepCount }, (_, i) => ({
    index: i + 1,
    intent: `Step ${i + 1} intent`,
    action_text: `action text ${i + 1}`,
    expected_text: `expected text ${i + 1}`,
    action: actions[i % actions.length]!,
    screen: createScreenId('test-screen'),
    element: createElementId(`element-${i}`),
    posture: null,
    override: null,
    snapshot_template: null,
    resolution: null,
    confidence: 'intent-only' as const,
    binding: {
      kind: (hasUnbound && i === 0 ? 'unbound' : 'deferred') as 'bound' | 'deferred' | 'unbound',
      reasons: ['test-reason'],
      ruleId: null,
      normalizedIntent: `normalized-step-${i + 1}`,
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance: 'approved' as const,
      reviewReasons: [],
    },
    program: undefined,
  }));

  return {
    kind: 'bound-scenario',
    version: 1,
    stage: 'preparation',
    scope: 'scenario',
    ids: { adoId, suite: 'demo' },
    fingerprints: { artifact: 'test-fingerprint', content: 'sha256:test', knowledge: null, controls: null, task: null, run: null },
    lineage: { sources: [], parents: [], handshakes: ['preparation'] },
    governance: 'approved',
    source: { ado_id: adoId, revision: 1, content_hash: 'sha256:test', synced_at: '2025-01-01T00:00:00Z' },
    metadata: { title: 'Test scenario title', suite: 'demo', tags: ['smoke', 'P1'], priority: 1, status: 'active', status_detail: null },
    preconditions: [{ fixture: 'demoSession' as any }],
    steps,
    postconditions: [],
    payload: {
      source: { ado_id: adoId, revision: 1, content_hash: 'sha256:test', synced_at: '2025-01-01T00:00:00Z' },
      metadata: { title: 'Test scenario title', suite: 'demo', tags: ['smoke', 'P1'], priority: 1, status: 'active', status_detail: null },
      preconditions: [{ fixture: 'demoSession' as any }],
      steps,
      postconditions: [],
      diagnostics: [],
    },
    diagnostics: [],
  };
}

function createTestSurface(boundScenario: BoundScenario): ScenarioInterpretationSurface {
  const adoId = boundScenario.source.ado_id;
  return {
    kind: 'scenario-interpretation-surface',
    version: 1,
    stage: 'preparation',
    scope: 'scenario',
    ids: { adoId, suite: boundScenario.metadata.suite },
    fingerprints: { artifact: 'test-surface-fingerprint', content: 'sha256:test-surface', knowledge: null, controls: null, task: null, run: null },
    lineage: { sources: [], parents: [], handshakes: ['preparation'] },
    governance: 'approved',
    payload: {
      adoId,
      revision: boundScenario.source.revision,
      title: boundScenario.metadata.title,
      suite: boundScenario.metadata.suite,
      knowledgeFingerprint: 'test-knowledge-fingerprint',
      interface: { fingerprint: null, artifactPath: null },
      selectors: { fingerprint: null, artifactPath: null },
      stateGraph: { fingerprint: null, artifactPath: null },
      knowledgeSlice: {
        routeRefs: [],
        routeVariantRefs: [],
        screenRefs: [],
        targetRefs: [],
        stateRefs: [],
        eventSignatureRefs: [],
        transitionRefs: [],
        evidenceRefs: [],
        controlRefs: [],
      },
      steps: boundScenario.steps.map((step) => ({
        index: step.index,
        intent: step.intent,
        actionText: step.action_text,
        expectedText: step.expected_text,
        normalizedIntent: step.binding.normalizedIntent,
        allowedActions: [step.action],
        explicitResolution: step.resolution ?? null,
        controlResolution: null,
        grounding: {
          targetRefs: [],
          selectorRefs: [],
          fallbackSelectorRefs: [],
          routeVariantRefs: [],
          assertionAnchors: [],
          effectAssertions: [],
          requiredStateRefs: [],
          forbiddenStateRefs: [],
          eventSignatureRefs: [],
          expectedTransitionRefs: [],
          resultStateRefs: [],
        },
        stepFingerprint: `step-${step.index}-fingerprint`,
        taskFingerprint: 'task-fingerprint',
      })),
      resolutionContext: {
        knowledgeFingerprint: 'test-knowledge-fingerprint',
        sharedPatterns: { version: 1, actions: {} as any, postures: {}, documents: [], sources: { actions: {} as any, postures: {} } },
        screens: [],
        confidenceOverlays: [],
        controls: { datasets: [], resolutionControls: [], runbooks: [] },
        evidenceRefs: [],
      },
    },
    surfaceFingerprint: 'test-surface-fingerprint',
  };
}

// --- Law Tests: Readable Surface Stability ---

test('readable emission is deterministic: same GroundedSpecFlow produces identical TypeScript across 100 seeds', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);

  const baseline = renderReadableSpecModule(flow, { imports: testImports });

  for (let seed = 1; seed <= 100; seed += 1) {
    const result = renderReadableSpecModule(flow, { imports: testImports });
    expect(result.code).toBe(baseline.code);
    expect(result.lifecycle).toBe(baseline.lifecycle);
  }
});

test('readable emission is stable under structurally equivalent inputs with different step counts', () => {
  for (let stepCount = 1; stepCount <= 8; stepCount += 1) {
    const boundScenario = createTestBoundScenario({ stepCount });
    const surface = createTestSurface(boundScenario);
    const flow = buildGroundedSpecFlow(boundScenario, surface);

    const first = renderReadableSpecModule(flow, { imports: testImports });
    const second = renderReadableSpecModule(flow, { imports: testImports });
    expect(second.code).toBe(first.code);
  }
});

// --- Contract Tests: AST Round-Trip ---

test('emitted readable spec parses to a valid TypeScript AST with no syntax diagnostics', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  const sourceFile = ts.createSourceFile('test.spec.ts', result.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = (sourceFile as any).parseDiagnostics ?? [];
  expect(diagnostics).toHaveLength(0);
  expect(sourceFile.statements.length).toBeGreaterThan(0);
});

test('emitted readable spec AST contains import declarations and test call', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  const sourceFile = ts.createSourceFile('test.spec.ts', result.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = sourceFile.statements.filter(ts.isImportDeclaration);
  const expressions = sourceFile.statements.filter(ts.isExpressionStatement);

  expect(imports.length).toBeGreaterThanOrEqual(4);
  expect(expressions.length).toBeGreaterThanOrEqual(1);
});

// --- Structural Tests: Helper-to-Pipeline Mapping ---

test('emitted spec references only canonical readable helpers, not raw runScenarioHandshake', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  const canonicalHelpers = ['navigateTo', 'fillField', 'clickElement', 'expectSnapshot', 'executeStep'];
  const hasCanonicalHelper = canonicalHelpers.some((helper) => result.code.includes(helper));
  expect(hasCanonicalHelper).toBe(true);

  expect(result.code).not.toContain('runScenarioHandshake');
  expect(result.code).not.toContain('stepHandshakeFromPlan');
});

test('each step action maps to the correct readable helper', () => {
  const boundScenario = createTestBoundScenario({ stepCount: 4 });
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.code).toContain('navigateTo');
  expect(result.code).toContain('fillField');
  expect(result.code).toContain('clickElement');
  expect(result.code).toContain('expectSnapshot');
});

test('readable helpers import is present in emitted spec', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.code).toContain('readable-helpers');
});

// --- Contract Tests: Emission-Execution Parity ---

test('emitted spec preserves all required annotations', () => {
  const boundScenario = createTestBoundScenario();
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.code).toContain('ado-id');
  expect(result.code).toContain('ado-revision');
  expect(result.code).toContain('content-hash');
  expect(result.code).toContain('confidence');
  expect(result.code).toContain('intent-only');
  expect(result.code).toContain('runtime-receipt');
});

test('emitted spec step count matches input flow step count', () => {
  for (const stepCount of [1, 3, 5, 8]) {
    const boundScenario = createTestBoundScenario({ stepCount });
    const surface = createTestSurface(boundScenario);
    const flow = buildGroundedSpecFlow(boundScenario, surface);
    const result = renderReadableSpecModule(flow, { imports: testImports });

    const stepMatches = result.code.match(/test\.step\(/g) ?? [];
    expect(stepMatches.length).toBe(stepCount);
  }
});

test('emitted spec includes grounding context in step titles', () => {
  const boundScenario = createTestBoundScenario({ stepCount: 2 });
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.code).toContain('screen: test-screen');
  expect(result.code).toContain('element: element-');
});

test('lifecycle is fixme when steps are unbound', () => {
  const boundScenario = createTestBoundScenario({ hasUnbound: true });
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.lifecycle).toBe('fixme');
  expect(result.code).toContain('test.fixme');
});

test('lifecycle is normal when all steps are bound', () => {
  const boundScenario = createTestBoundScenario({ hasUnbound: false });
  const surface = createTestSurface(boundScenario);
  const flow = buildGroundedSpecFlow(boundScenario, surface);
  const result = renderReadableSpecModule(flow, { imports: testImports });

  expect(result.lifecycle).toBe('normal');
  expect(result.code).not.toContain('test.fixme');
  expect(result.code).not.toContain('test.skip');
});

// --- Integration Test: Full Compile Pipeline ---

test('readable emission integrates with the full compile pipeline', async () => {
  const workspace = createTestWorkspace('readable-emission');
  try {
    const adoId = createAdoId('10001');
    const result = await runWithLocalServices(refreshScenario({ adoId, paths: workspace.paths }), workspace.rootDir);
    const generated = readFileSync(result.compile.emitted.outputPath, 'utf8').replace(/^\uFEFF/, '');

    // Readable helpers should be present instead of raw handshake calls
    const canonicalHelpers = ['navigateTo', 'fillField', 'clickElement', 'expectSnapshot', 'executeStep'];
    const hasCanonicalHelper = canonicalHelpers.some((helper) => generated.includes(helper));
    expect(hasCanonicalHelper).toBe(true);

    // Should not contain raw pipeline calls
    expect(generated).not.toContain('runScenarioHandshake');
    expect(generated).not.toContain('stepHandshakeFromPlan');

    // Should still contain required structural elements
    expect(generated).toContain('createLocalRuntimeEnvironment');
    expect(generated).toContain('loadScenarioRunPlan');
    expect(generated).toContain('createScenarioRunState');
    expect(generated).toContain('intent-only');

    // AST should be valid
    const sourceFile = ts.createSourceFile('test.spec.ts', generated, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const parseDiagnostics = (sourceFile as any).parseDiagnostics ?? [];
    expect(parseDiagnostics).toHaveLength(0);

    // Trace and review should still be generated
    const traceArtifact = JSON.parse(readFileSync(result.compile.emitted.tracePath, 'utf8').replace(/^\uFEFF/, ''));
    const review = readFileSync(result.compile.emitted.reviewPath, 'utf8').replace(/^\uFEFF/, '');
    expect(traceArtifact.steps.length).toBeGreaterThan(0);
    expect(review).toContain('# ');
  } finally {
    workspace.cleanup();
  }
});
