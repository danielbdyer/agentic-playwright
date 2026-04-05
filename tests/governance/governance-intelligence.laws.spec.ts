import { test, expect } from '@playwright/test';
import {
  buildGovernanceIntelligence,
  extractHighFrictionTypes,
  isGovernanceHealthy,
} from '../../lib/application/governance/governance-intelligence';
import type { ContradictionReport } from '../../lib/domain/knowledge/contradiction-types';
import type { ArchitectureFitnessReport } from '../../lib/domain/fitness/architecture-fitness';
import type { ProposalBundle } from '../../lib/domain/execution/types';

function makeContradictionReport(overrides?: Partial<{
  contradictions: ContradictionReport['contradictions'];
}>): ContradictionReport {
  const contradictions = overrides?.contradictions ?? [];
  const errorCount = contradictions.filter((c) => c.severity === 'error').length;
  const warningCount = contradictions.filter((c) => c.severity === 'warning').length;
  const infoCount = contradictions.filter((c) => c.severity === 'info').length;
  return {
    kind: 'contradiction-report',
    version: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    contradictions,
    summary: {
      totalContradictions: contradictions.length,
      byCategory: {
        'locator-conflict': 0,
        'route-conflict': 0,
        'pattern-conflict': 0,
        'hint-conflict': 0,
        'screen-identity-conflict': 0,
      },
      bySeverity: { error: errorCount, warning: warningCount, info: infoCount },
      blocksPromotion: errorCount > 0,
    },
  };
}

function makeArchitectureReport(overrides?: Partial<{
  overallPurityRate: number;
}>): ArchitectureFitnessReport {
  return {
    timestamp: '2026-01-01T00:00:00Z',
    layers: [],
    dependencyViolations: [],
    overallPurityRate: overrides?.overallPurityRate ?? 1.0,
  };
}

function makeProposalBundle(overrides?: Partial<{
  decision: 'allow' | 'review' | 'deny';
  artifactType: string;
}>): ProposalBundle {
  return {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: { adoId: 'TC-001', suite: 'test', sessionId: 's-1', runId: 'r-1', stepIndex: 0, dataset: 'default', runbook: null, resolutionControl: null },
    fingerprints: { content: 'fp-1', derivation: 'fp-2' },
    lineage: { parentId: null, rootId: 'r-1', depth: 0 },
    governance: 'approved',
    payload: {
      adoId: 'TC-001' as never,
      runId: 'r-1',
      revision: 1,
      title: 'Test',
      suite: 'test',
      proposals: [{
        proposalId: 'prop-1',
        artifactType: overrides?.artifactType ?? 'elements.yaml',
        screen: 'PolicySearch',
        element: 'Number',
        targetPath: 'knowledge/screens/PolicySearch.elements.yaml',
        change: { kind: 'add', detail: 'Add alias' },
        rationale: 'Test',
        confidence: 'agent-proposed' as never,
        evidenceCount: 1,
        evidenceIds: ['ev-1'],
        trustPolicy: { decision: overrides?.decision ?? 'allow', rationale: 'test' },
        activation: { status: 'pending', reason: 'New' },
      }],
    },
  } as unknown as ProposalBundle;
}

test('Law 1: buildGovernanceIntelligence produces valid report', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('governance-intelligence-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: overallGovernanceHealth is in [0, 1]', () => {
  const report = buildGovernanceIntelligence({
    contradictionReport: makeContradictionReport({
      contradictions: [{
        id: 'c-1',
        category: 'locator-conflict',
        severity: 'error',
        description: 'test',
        sources: [{ file: 'knowledge/screens/PolicySearch.elements.yaml', field: 'alias', value: 'x' }],
        suggestedResolution: 'fix',
      }],
    }),
    architectureReport: makeArchitectureReport({ overallPurityRate: 0.8 }),
    proposalBundles: [makeProposalBundle({ decision: 'deny' })],
  });
  expect(report.overallGovernanceHealth).toBeGreaterThanOrEqual(0);
  expect(report.overallGovernanceHealth).toBeLessThanOrEqual(1);
});

test('Law 3: trustPolicyBlockRate is in [0, 1]', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [
      makeProposalBundle({ decision: 'deny' }),
      makeProposalBundle({ decision: 'allow' }),
    ],
  });
  expect(report.trustPolicyBlockRate).toBeGreaterThanOrEqual(0);
  expect(report.trustPolicyBlockRate).toBeLessThanOrEqual(1);
});

test('Law 4: proposalActivationRate is in [0, 1]', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [
      makeProposalBundle({ decision: 'allow' }),
      makeProposalBundle({ decision: 'review' }),
    ],
  });
  expect(report.proposalActivationRate).toBeGreaterThanOrEqual(0);
  expect(report.proposalActivationRate).toBeLessThanOrEqual(1);
});

test('Law 5: frictionPoints sorted by frictionRate descending', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [
      makeProposalBundle({ decision: 'deny', artifactType: 'elements.yaml' }),
      makeProposalBundle({ decision: 'allow', artifactType: 'hints.yaml' }),
    ],
  });
  for (let i = 1; i < report.frictionPoints.length; i++) {
    expect(report.frictionPoints[i]!.frictionRate)
      .toBeLessThanOrEqual(report.frictionPoints[i - 1]!.frictionRate);
  }
});

test('Law 6: empty bundles produce healthy defaults', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [],
  });
  expect(report.trustPolicyBlockRate).toBe(0);
  expect(report.proposalActivationRate).toBe(1);
  expect(report.frictionPoints.length).toBe(0);
});

test('Law 7: contradictionSeverityScore increases with error contradictions', () => {
  const noErrors = buildGovernanceIntelligence({
    contradictionReport: makeContradictionReport({
      contradictions: [{
        id: 'c-1', category: 'hint-conflict', severity: 'info',
        description: 'test', sources: [], suggestedResolution: 'fix',
      }],
    }),
    proposalBundles: [],
  });
  const withErrors = buildGovernanceIntelligence({
    contradictionReport: makeContradictionReport({
      contradictions: [{
        id: 'c-1', category: 'hint-conflict', severity: 'error',
        description: 'test', sources: [], suggestedResolution: 'fix',
      }],
    }),
    proposalBundles: [],
  });
  expect(withErrors.contradictionSeverityScore)
    .toBeGreaterThan(noErrors.contradictionSeverityScore);
});

test('Law 8: extractHighFrictionTypes limits to N items', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [
      makeProposalBundle({ decision: 'deny', artifactType: 'a' }),
      makeProposalBundle({ decision: 'deny', artifactType: 'b' }),
      makeProposalBundle({ decision: 'deny', artifactType: 'c' }),
    ],
  });
  const top2 = extractHighFrictionTypes(report, 2);
  expect(top2.length).toBeLessThanOrEqual(2);
});

test('Law 9: isGovernanceHealthy respects threshold', () => {
  const report = buildGovernanceIntelligence({
    proposalBundles: [makeProposalBundle({ decision: 'allow' })],
  });
  expect(isGovernanceHealthy(report, 0.5)).toBe(true);
  expect(isGovernanceHealthy(report, 1.0)).toBe(report.overallGovernanceHealth >= 1.0);
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    contradictionReport: makeContradictionReport(),
    architectureReport: makeArchitectureReport(),
    proposalBundles: [makeProposalBundle({})],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildGovernanceIntelligence(input);
  const r2 = buildGovernanceIntelligence(input);
  expect(r1.overallGovernanceHealth).toBe(r2.overallGovernanceHealth);
  expect(r1.trustPolicyBlockRate).toBe(r2.trustPolicyBlockRate);
  expect(r1.proposalActivationRate).toBe(r2.proposalActivationRate);
  expect(r1.frictionPoints.length).toBe(r2.frictionPoints.length);
});
