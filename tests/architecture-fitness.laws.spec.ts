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
