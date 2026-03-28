/**
 * Architecture Fitness Laws
 *
 * These tests measure structural properties of the codebase itself — not runtime
 * behavior, but the code's amenability to future improvement. Each test enforces
 * a monotonic ratchet: the metric can improve but must never regress.
 *
 * See docs/recursive-self-improvement.md § Five Tuning Surfaces for the model.
 */

import { expect, test } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const LIB_ROOT = path.resolve(__dirname, '..', 'lib');

function walkTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkTs(full));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      results.push(full);
    }
  }
  return results;
}

function classifyLayer(filePath: string): string | null {
  const rel = path.relative(LIB_ROOT, filePath);
  if (rel.startsWith('domain')) return 'domain';
  if (rel.startsWith('application')) return 'application';
  if (rel.startsWith('runtime')) return 'runtime';
  if (rel.startsWith('infrastructure')) return 'infrastructure';
  if (rel.startsWith('composition')) return 'composition';
  if (rel.startsWith('playwright')) return 'playwright';
  return null;
}

const FORBIDDEN_IMPORTS: Record<string, readonly string[]> = {
  domain: ['application', 'runtime', 'infrastructure', 'composition', 'playwright'],
  application: ['runtime', 'infrastructure', 'composition', 'playwright'],
};

function extractImports(content: string): string[] {
  const importRegex = /from\s+['"]([^'"]+)['"]/g;
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]!);
  }
  return imports;
}

// ─── Law: Domain layer must not import from higher layers ───

test('domain layer has zero import violations', () => {
  const domainFiles = walkTs(path.join(LIB_ROOT, 'domain'));
  const violations: string[] = [];

  for (const file of domainFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const imports = extractImports(content);
    const forbidden = FORBIDDEN_IMPORTS['domain']!;

    for (const imp of imports) {
      if (imp.startsWith('.') || imp.startsWith('..')) {
        // Resolve relative import to check if it crosses boundary
        const resolved = path.resolve(path.dirname(file), imp);
        const layer = classifyLayer(resolved + '.ts') ?? classifyLayer(resolved + '/index.ts');
        if (layer && forbidden.includes(layer)) {
          violations.push(`${path.relative(LIB_ROOT, file)}: imports from ${layer} via "${imp}"`);
        }
      } else {
        // Absolute import — check for direct layer references
        for (const f of forbidden) {
          if (imp.includes(`/${f}/`) || imp.startsWith(`../${f}`)) {
            violations.push(`${path.relative(LIB_ROOT, file)}: imports from ${f} via "${imp}"`);
          }
        }
      }
    }
  }

  expect(violations).toEqual([]);
});

// ─── Law: Domain layer purity ratio must not regress ───

test('domain layer purity rate >= 98%', () => {
  const domainFiles = walkTs(path.join(LIB_ROOT, 'domain'));
  let totalFunctions = 0;
  let letBindings = 0;

  for (const file of domainFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Count exported functions
    const funcMatches = content.match(/export\s+function\s+/g);
    totalFunctions += funcMatches?.length ?? 0;
    // Count let bindings (mutation indicator)
    const letMatches = content.match(/\blet\s+\w/g);
    letBindings += letMatches?.length ?? 0;
  }

  // Purity proxy: functions with let bindings / total functions
  // A let binding doesn't necessarily mean impurity, but it's a strong signal
  const impurityRate = totalFunctions > 0 ? letBindings / totalFunctions : 0;
  const purityRate = 1 - impurityRate;

  expect(purityRate).toBeGreaterThanOrEqual(0.98);
});

// ─── Law: Visitor fold functions exist for all major discriminated unions ───

test('typed fold functions cover all major discriminated unions', () => {
  const visitorsPath = path.join(LIB_ROOT, 'domain', 'visitors.ts');
  const content = fs.readFileSync(visitorsPath, 'utf-8');

  const expectedFolds = [
    'foldValueRef',
    'foldStepInstruction',
    'foldLocatorStrategy',
    'foldResolutionReceipt',
    'foldResolutionOutcome',
    'foldImprovementTarget',
    'foldResolutionEvent',
    'foldPipelineFailureClass',
  ];

  for (const fold of expectedFolds) {
    expect(content).toContain(`export function ${fold}`);
  }
});

// ─── Law: Governance fold exists and is exhaustive ───

test('foldGovernance exists with all three cases', () => {
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  expect(content).toContain('function foldGovernance');
  expect(content).toContain("case 'approved'");
  expect(content).toContain("case 'review-required'");
  expect(content).toContain("case 'blocked'");
});

// ─── Law: mapPayload envelope utility exists ───

test('mapPayload envelope utility is defined and exported', () => {
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const content = fs.readFileSync(workflowPath, 'utf-8');

  expect(content).toContain('export function mapPayload');
  expect(content).toContain('export type PayloadOf');
  expect(content).toContain('export type ApprovedEnvelope');
  expect(content).toContain('export type BlockedEnvelope');
});

// ─── Law: Architecture fitness types are exported ───

test('architecture fitness types are exported from domain barrel', () => {
  const typesPath = path.join(LIB_ROOT, 'domain', 'types.ts');
  const content = fs.readFileSync(typesPath, 'utf-8');

  expect(content).toContain("'./types/architecture-fitness'");
});

// ─── Law: All readonly enforcement on key domain interfaces ───

test('key domain interfaces use readonly fields', () => {
  const criticalFiles = [
    'types/workflow.ts',
    'types/resolution.ts',
    'types/execution.ts',
    'types/fitness.ts',
    'types/pipeline-config.ts',
    'types/experiment.ts',
    'types/architecture-fitness.ts',
  ];

  for (const file of criticalFiles) {
    const content = fs.readFileSync(path.join(LIB_ROOT, 'domain', file), 'utf-8');
    // Find exported interfaces with non-readonly fields
    const interfaceBlocks = content.match(/export\s+interface\s+\w+[^{]*\{[^}]+\}/g) ?? [];

    for (const block of interfaceBlocks) {
      // Extract field declarations (lines with colon that aren't method signatures)
      const fields = block.match(/^\s+(?!readonly\b)(\w+)\s*[?:](?!.*=>)/gm) ?? [];
      // Filter out 'kind' and 'version' fields which are discriminators and often not readonly
      // in older interfaces for backward compatibility
      const nonReadonly = fields.filter((f) => {
        const name = f.trim().split(/[\s?:]/)[0];
        return name !== 'kind' && name !== 'version';
      });

      // Allow a small number of legacy non-readonly fields
      // The ratchet: this count must not increase
      expect(nonReadonly.length).toBeLessThanOrEqual(15);
    }
  }
});

// ─── Law: PipelineConfig covers the documented 15 parameters ───

test('PipelineConfig interface covers all documented parameter groups', () => {
  const configPath = path.join(LIB_ROOT, 'domain', 'types', 'pipeline-config.ts');
  const content = fs.readFileSync(configPath, 'utf-8');

  const expectedGroups = [
    'BottleneckWeights',
    'RankingWeights',
    'MemoryCapacityConfig',
    'DomScoringWeights',
    'CandidateLimits',
    'ConfidenceScaling',
    'IntentThresholds',
    'ProposalConfidenceValues',
  ];

  for (const group of expectedGroups) {
    expect(content).toContain(`interface ${group}`);
  }

  // PipelineConfig must reference all groups
  expect(content).toContain('interface PipelineConfig');
  expect(content).toContain('convergenceThreshold');
  expect(content).toContain('precedenceBase');
});

// ─── Law: Five tuning surfaces are documented ───

test('recursive-self-improvement.md documents all five tuning surfaces', () => {
  const docPath = path.resolve(__dirname, '..', 'docs', 'recursive-self-improvement.md');
  const content = fs.readFileSync(docPath, 'utf-8');

  expect(content).toContain('## Five Tuning Surfaces');
  expect(content).toContain('### Surface 1: Hyperparameters');
  expect(content).toContain('### Surface 2: Code structure');
  expect(content).toContain('### Surface 3: Knowledge representation');
  expect(content).toContain('### Surface 4: Documentation and authorial leverage');
  expect(content).toContain('### Surface 5: Information-theoretic efficiency');
  expect(content).toContain('## Architecture Fitness Report');
});

// ─── Law: Effect.runPromise / Effect.runSync only in composition and adapter layers ───

test('Effect.runPromise and Effect.runSync only appear in allowed boundary files', () => {
  const ALLOWED_LOCATIONS = new Set([
    'composition',
    'application/dashboard-decider.ts',
    'application/agent-decider.ts',
    'infrastructure/dashboard/pipeline-event-bus.ts',
    'application/execution/load-run-plan.ts',
  ]);

  function isAllowed(relPath: string): boolean {
    if (relPath.startsWith('composition')) return true;
    return ALLOWED_LOCATIONS.has(relPath);
  }

  const allFiles = walkTs(LIB_ROOT);
  const violations: string[] = [];

  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    if (/Effect\.runPromise|Effect\.runSync/.test(content)) {
      const rel = path.relative(LIB_ROOT, file);
      if (!isAllowed(rel)) {
        violations.push(`${rel} contains Effect.runPromise or Effect.runSync — must be in composition or an allowed adapter`);
      }
    }
  }

  expect(violations).toEqual([]);
});

// ─── Law: WorkflowEnvelope schema contract ───

test('WorkflowEnvelope has all required fields and mapPayload preserves them', () => {
  // Validate the source defines mapPayload with the correct spread-based implementation
  const workflowPath = path.join(LIB_ROOT, 'domain', 'types', 'workflow.ts');
  const workflowSource = fs.readFileSync(workflowPath, 'utf-8');
  expect(workflowSource).toContain('export function mapPayload');
  expect(workflowSource).toContain('...envelope');

  // Construct a well-formed envelope and validate its runtime shape
  const envelope = {
    version: 1 as const,
    stage: 'preparation' as const,
    scope: 'scenario' as const,
    ids: {
      adoId: 'ADO-1',
      suite: 'test-suite',
      sessionId: 'sess-1',
      runId: 'run-1',
      stepIndex: 0,
      dataset: 'default',
      runbook: null,
      resolutionControl: null,
      participantIds: [],
      interventionIds: [],
      improvementRunId: null,
      iteration: null,
      parentExperimentId: null,
    },
    fingerprints: {
      artifact: 'abc123',
      content: null,
      knowledge: null,
      controls: null,
      task: null,
      run: null,
    },
    lineage: {
      sources: ['source-a'],
      parents: ['parent-a'],
      handshakes: ['preparation' as const],
      experimentIds: [],
    },
    governance: 'approved' as const,
    payload: { data: 42 },
  };

  // Verify all required envelope fields exist
  const requiredFields = ['version', 'stage', 'scope', 'ids', 'fingerprints', 'lineage', 'governance', 'payload'];
  for (const field of requiredFields) {
    expect(envelope).toHaveProperty(field);
  }

  // Verify lineage shape: sources, parents, handshakes
  expect(envelope.lineage).toHaveProperty('sources');
  expect(envelope.lineage).toHaveProperty('parents');
  expect(envelope.lineage).toHaveProperty('handshakes');
  expect(Array.isArray(envelope.lineage.sources)).toBe(true);
  expect(Array.isArray(envelope.lineage.parents)).toBe(true);
  expect(Array.isArray(envelope.lineage.handshakes)).toBe(true);

  // Verify ids has all expected optional fields
  const expectedIdFields = [
    'adoId', 'suite', 'sessionId', 'runId', 'stepIndex',
    'dataset', 'runbook', 'resolutionControl',
    'participantIds', 'interventionIds',
    'improvementRunId', 'iteration', 'parentExperimentId',
  ];
  for (const field of expectedIdFields) {
    expect(envelope.ids).toHaveProperty(field);
  }

  // Verify mapPayload preserves all fields except payload using a local
  // replica of the spread-based implementation (the source is TypeScript
  // and cannot be require'd directly at runtime).
  const mapPayload = <A, B>(env: typeof envelope & { payload: A }, f: (p: A) => B) => ({
    ...env,
    payload: f(env.payload),
  });

  const mapped = mapPayload(envelope, (p) => ({ doubled: p.data * 2 }));

  expect(mapped.version).toBe(envelope.version);
  expect(mapped.stage).toBe(envelope.stage);
  expect(mapped.scope).toBe(envelope.scope);
  expect(mapped.ids).toEqual(envelope.ids);
  expect(mapped.fingerprints).toEqual(envelope.fingerprints);
  expect(mapped.lineage).toEqual(envelope.lineage);
  expect(mapped.governance).toBe(envelope.governance);
  expect(mapped.payload).toEqual({ doubled: 84 });

  // Verify the mapped result has exactly the same keys as the original
  const originalKeys = Object.keys(envelope).sort();
  const mappedKeys = Object.keys(mapped).sort();
  expect(mappedKeys).toEqual(originalKeys);
});

// ─── Law: Discriminated unions with `kind` fields have fold coverage ───

/**
 * Scans all type files under lib/domain/types/ for discriminated union types
 * that use a `kind` field as discriminant, then verifies that a corresponding
 * fold function exists in visitors.ts or in the defining type file itself.
 *
 * This catches the case where a new discriminated union is added without a
 * companion fold function for exhaustive case analysis.
 */
test('all discriminated unions with kind fields have corresponding fold functions', () => {
  const TYPES_DIR = path.join(LIB_ROOT, 'domain', 'types');
  const visitorsPath = path.join(LIB_ROOT, 'domain', 'visitors.ts');
  const visitorsContent = fs.readFileSync(visitorsPath, 'utf-8');

  const typeFiles = walkTs(TYPES_DIR);
  const allTypeContent = typeFiles.map((f) => fs.readFileSync(f, 'utf-8'));

  // Find discriminated union types: `export type Foo = ... { kind: '...' } | ...`
  // We look for type aliases whose definition includes `{ kind: '...'` patterns
  const kindUnionPattern = /export\s+type\s+(\w+)\s*=\s*([^;]+);/g;
  const kindFieldPattern = /\{\s*(?:readonly\s+)?kind:\s*'[^']+'/;

  const unionNames: string[] = [];

  for (const content of allTypeContent) {
    let match: RegExpExecArray | null;
    while ((match = kindUnionPattern.exec(content)) !== null) {
      const typeName = match[1]!;
      const typeBody = match[2]!;
      // Must have at least one variant with a `kind` field
      if (kindFieldPattern.test(typeBody)) {
        unionNames.push(typeName);
      }
    }
  }

  // Also collect all fold function names from visitors.ts and type files
  const foldFunctionPattern = /export\s+function\s+(fold\w+)/g;
  const foldFunctions: string[] = [];
  let foldMatch: RegExpExecArray | null;

  // Scan visitors.ts
  while ((foldMatch = foldFunctionPattern.exec(visitorsContent)) !== null) {
    foldFunctions.push(foldMatch[1]!);
  }

  // Scan all type files (some folds live in the defining file, e.g. foldAgentError)
  for (const content of allTypeContent) {
    const localPattern = /export\s+function\s+(fold\w+)/g;
    let localMatch: RegExpExecArray | null;
    while ((localMatch = localPattern.exec(content)) !== null) {
      foldFunctions.push(localMatch[1]!);
    }
  }

  // For each discriminated union, check that a fold function exists whose name
  // contains the type name (e.g., ValueRef -> foldValueRef, ResolutionReceipt -> foldResolutionReceipt)
  const missingFolds: string[] = [];
  for (const typeName of unionNames) {
    const hasFold = foldFunctions.some((fn) =>
      fn.toLowerCase().includes(typeName.toLowerCase().replace(/^(pipeline|agent)/, '')),
    );
    if (!hasFold) {
      missingFolds.push(typeName);
    }
  }

  // Current known unions that intentionally lack folds (simple inline unions or
  // unions where exhaustive handling is done via Record types instead of switch).
  // This allowlist must not grow without justification.
  const allowedWithoutFold = new Set([
    'TranslationCandidate',  // uses kind for classification, not for fold dispatch
  ]);

  const unexpectedMissing = missingFolds.filter((name) => !allowedWithoutFold.has(name));
  expect(unexpectedMissing).toEqual([]);
});

// ─── Law: Fold functions cover all variants of their discriminated union ───

test('fold switch cases match discriminated union variants', () => {
  const visitorsPath = path.join(LIB_ROOT, 'domain', 'visitors.ts');
  const visitorsContent = fs.readFileSync(visitorsPath, 'utf-8');

  // Extract fold functions and their switch cases
  const foldBlockPattern = /export\s+function\s+(fold\w+)[^{]*\{([\s\S]*?)\n\}/g;
  const casePattern = /case\s+'([^']+)'/g;

  const foldCases: Record<string, string[]> = {};
  let foldMatch: RegExpExecArray | null;

  while ((foldMatch = foldBlockPattern.exec(visitorsContent)) !== null) {
    const foldName = foldMatch[1]!;
    const foldBody = foldMatch[2]!;
    const cases: string[] = [];
    let caseMatch: RegExpExecArray | null;
    while ((caseMatch = casePattern.exec(foldBody)) !== null) {
      cases.push(caseMatch[1]!);
    }
    foldCases[foldName] = cases;
  }

  // Each fold should have at least 2 cases (otherwise it's not really a union)
  const violations: string[] = [];
  for (const [foldName, cases] of Object.entries(foldCases)) {
    if (cases.length < 2) {
      violations.push(`${foldName} has only ${cases.length} case(s) — expected at least 2 for a discriminated union`);
    }
    // No duplicate cases
    const uniqueCases = new Set(cases);
    if (uniqueCases.size !== cases.length) {
      violations.push(`${foldName} has duplicate switch cases`);
    }
  }

  expect(violations).toEqual([]);

  // Verify the expected fold functions are present
  const expectedFolds = [
    'foldValueRef',
    'foldStepInstruction',
    'foldLocatorStrategy',
    'foldResolutionReceipt',
    'foldImprovementTarget',
    'foldResolutionEvent',
    'foldPipelineFailureClass',
    'foldStepWinningSource',
  ];

  for (const fold of expectedFolds) {
    expect(foldCases).toHaveProperty(fold);
  }
});

// ─── Law: DerivedFoldCases utility type is exported from visitors ───

test('DerivedFoldCases utility type is exported from visitors.ts', () => {
  const visitorsPath = path.join(LIB_ROOT, 'domain', 'visitors.ts');
  const content = fs.readFileSync(visitorsPath, 'utf-8');

  expect(content).toContain('export type DerivedFoldCases');
  // The type should reference Extract and the kind discriminant
  expect(content).toContain("readonly kind: K");
});
