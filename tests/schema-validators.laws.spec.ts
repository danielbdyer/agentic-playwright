/**
 * Schema Validators — Algebraic Law Tests (W4.2)
 *
 * Verifies that the Effect Schema migration validators correctly enforce
 * both structural and semantic validation rules. Law-style tests:
 *
 *   Law 1: Structural round-trip — valid inputs decode and re-encode identically
 *   Law 2: Semantic filter rejection — invalid semantic states are rejected
 *   Law 3: Governance enum exhaustiveness — exactly three values accepted
 *   Law 4: ScreenId brand safety — path traversal and empty strings rejected
 *   Law 5: BoundStep invariants — binding kind / governance coherence
 *   Law 6: WorkflowEnvelope invariants — blocked + execution is rejected
 *   Law 7: TrustPolicy invariants — confidence range and evidence constraints
 *
 * 150 seeds, deterministic PRNG.
 */

import { expect, test } from '@playwright/test';
import { Schema } from 'effect';
import {
  GovernanceSemanticSchema,
  ScreenIdSemanticSchema,
  BoundStepSemanticSchema,
  WorkflowEnvelopeSemanticSchema,
  TrustPolicySemanticSchema,
} from '../lib/domain/validation/schema-validators';
import { mulberry32, pick, randomWord, randomInt } from './support/random';

// ─── Helpers ───

const GOVERNANCE_VALUES = ['approved', 'review-required', 'blocked'] as const;
const STEP_ACTIONS = ['navigate', 'input', 'click', 'assert-snapshot', 'custom'] as const;
const BINDING_KINDS = ['bound', 'deferred', 'unbound'] as const;
const WORKFLOW_STAGES = ['preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection'] as const;
const WORKFLOW_SCOPES = ['scenario', 'step', 'run', 'suite', 'workspace', 'control'] as const;

function decodeSync<A, I>(schema: Schema.Schema<A, I>, input: unknown): A {
  return Schema.decodeUnknownSync(schema)(input);
}

function decodeSafe<A, I>(schema: Schema.Schema<A, I>, input: unknown): boolean {
  try {
    Schema.decodeUnknownSync(schema)(input);
    return true;
  } catch {
    return false;
  }
}

function makeValidBoundStep(next: () => number) {
  const governance = pick(next, ['approved', 'review-required'] as const);
  const kind = governance === 'approved' ? pick(next, BINDING_KINDS) : pick(next, ['deferred', 'unbound'] as const);
  const hasScreen = kind === 'bound' || kind === 'deferred';
  return {
    index: randomInt(next, 100),
    intent: `step intent ${randomWord(next)}`,
    action_text: `action ${randomWord(next)}`,
    expected_text: `expected ${randomWord(next)}`,
    action: pick(next, STEP_ACTIONS),
    screen: hasScreen ? `screen-${randomWord(next)}` : null,
    element: hasScreen ? `element-${randomWord(next)}` : null,
    posture: null,
    override: null,
    snapshot_template: null,
    binding: {
      kind,
      reasons: [`reason-${randomWord(next)}`],
      ruleId: next() > 0.5 ? `rule-${randomWord(next)}` : null,
      normalizedIntent: `normalized ${randomWord(next)}`,
      knowledgeRefs: [],
      supplementRefs: [],
      evidenceIds: [],
      governance,
      reviewReasons: governance === 'review-required' ? [`review-${randomWord(next)}`] : [],
    },
  };
}

function makeValidEnvelope(next: () => number) {
  const governance = pick(next, GOVERNANCE_VALUES);
  // Avoid blocked + execution/projection which is semantically invalid
  const validStages = governance === 'blocked'
    ? (['preparation', 'resolution', 'evidence', 'proposal'] as const)
    : WORKFLOW_STAGES;
  return {
    version: 1 as const,
    stage: pick(next, validStages),
    scope: pick(next, WORKFLOW_SCOPES),
    ids: {},
    fingerprints: { artifact: `fp-${randomWord(next)}` },
    lineage: {},
    governance,
  };
}

function makeValidTrustPolicy(next: () => number) {
  const makeRule = () => ({
    minimumConfidence: next() * 0.99 + 0.01, // in (0, 1)
    requiredEvidence: {
      minCount: randomInt(next, 5),
      kinds: [`kind-${randomWord(next)}`],
    },
  });

  return {
    version: 1 as const,
    artifactTypes: {
      elements: makeRule(),
      postures: makeRule(),
      surface: makeRule(),
      snapshot: makeRule(),
      hints: makeRule(),
      patterns: makeRule(),
    },
    forbiddenAutoHealClasses: next() > 0.5 ? [`class-${randomWord(next)}`] : [],
  };
}

// ─── Law 1: Governance enum exhaustiveness ───

test.describe('Law 1: Governance enum exhaustiveness', () => {
  test('all three canonical governance values are accepted', () => {
    for (const g of GOVERNANCE_VALUES) {
      expect(decodeSync(GovernanceSemanticSchema, g)).toBe(g);
    }
  });

  test('non-governance strings are rejected', () => {
    const invalids = ['approve', 'APPROVED', 'blocked!', '', 'pending', 'denied', null, undefined, 42];
    for (const invalid of invalids) {
      expect(decodeSafe(GovernanceSemanticSchema, invalid)).toBe(false);
    }
  });

  test('round-trip: decode then encode preserves value (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const value = pick(next, GOVERNANCE_VALUES);
      const decoded = decodeSync(GovernanceSemanticSchema, value);
      const encoded = Schema.encodeSync(GovernanceSemanticSchema)(decoded);
      expect(encoded).toBe(value);
    }
  });
});

// ─── Law 2: ScreenId brand safety ───

test.describe('Law 2: ScreenId brand safety', () => {
  test('valid screen IDs are accepted', () => {
    const valid = ['login', 'dashboard/main', 'work-items', 'screen_1'];
    for (const id of valid) {
      expect(decodeSafe(ScreenIdSemanticSchema, id)).toBe(true);
    }
  });

  test('empty string is rejected', () => {
    expect(decodeSafe(ScreenIdSemanticSchema, '')).toBe(false);
  });

  test('absolute paths are rejected', () => {
    expect(decodeSafe(ScreenIdSemanticSchema, '/absolute/path')).toBe(false);
    expect(decodeSafe(ScreenIdSemanticSchema, '\\windows\\path')).toBe(false);
    expect(decodeSafe(ScreenIdSemanticSchema, 'C:\\drive')).toBe(false);
  });

  test('path traversal is rejected', () => {
    expect(decodeSafe(ScreenIdSemanticSchema, 'foo/../bar')).toBe(false);
    expect(decodeSafe(ScreenIdSemanticSchema, '../escape')).toBe(false);
  });

  test('random valid screen IDs round-trip (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const id = `screen-${randomWord(next)}`;
      const decoded = decodeSync(ScreenIdSemanticSchema, id);
      expect(String(decoded)).toBe(id);
    }
  });
});

// ─── Law 3: BoundStep semantic invariants ───

test.describe('Law 3: BoundStep semantic invariants', () => {
  test('valid bound steps are accepted (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const step = makeValidBoundStep(next);
      expect(decodeSafe(BoundStepSemanticSchema, step)).toBe(true);
    }
  });

  test('negative index is rejected', () => {
    const next = mulberry32(42);
    const step = { ...makeValidBoundStep(next), index: -1 };
    expect(decodeSafe(BoundStepSemanticSchema, step)).toBe(false);
  });

  test('empty intent is rejected', () => {
    const next = mulberry32(43);
    const step = { ...makeValidBoundStep(next), intent: '' };
    expect(decodeSafe(BoundStepSemanticSchema, step)).toBe(false);
  });

  test('whitespace-only intent is rejected', () => {
    const next = mulberry32(44);
    const step = { ...makeValidBoundStep(next), intent: '   ' };
    expect(decodeSafe(BoundStepSemanticSchema, step)).toBe(false);
  });

  test('bound step with blocked governance is rejected', () => {
    const next = mulberry32(45);
    const step = makeValidBoundStep(next);
    const invalid = {
      ...step,
      binding: { ...step.binding, kind: 'bound' as const, governance: 'blocked' as const, reviewReasons: [] },
    };
    expect(decodeSafe(BoundStepSemanticSchema, invalid)).toBe(false);
  });

  test('unbound step with non-null screen is rejected', () => {
    const next = mulberry32(46);
    const step = makeValidBoundStep(next);
    const invalid = {
      ...step,
      screen: 'some-screen',
      binding: { ...step.binding, kind: 'unbound' as const, governance: 'approved' as const, reviewReasons: [] },
    };
    expect(decodeSafe(BoundStepSemanticSchema, invalid)).toBe(false);
  });

  test('review-required with empty reviewReasons is rejected', () => {
    const next = mulberry32(47);
    const step = makeValidBoundStep(next);
    const invalid = {
      ...step,
      binding: { ...step.binding, kind: 'deferred' as const, governance: 'review-required' as const, reviewReasons: [] },
    };
    expect(decodeSafe(BoundStepSemanticSchema, invalid)).toBe(false);
  });

  test('index zero is accepted (boundary)', () => {
    const next = mulberry32(48);
    const step = { ...makeValidBoundStep(next), index: 0 };
    expect(decodeSafe(BoundStepSemanticSchema, step)).toBe(true);
  });
});

// ─── Law 4: WorkflowEnvelope semantic invariants ───

test.describe('Law 4: WorkflowEnvelope semantic invariants', () => {
  test('valid envelopes are accepted (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const envelope = makeValidEnvelope(next);
      expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(true);
    }
  });

  test('empty artifact fingerprint is rejected', () => {
    const next = mulberry32(42);
    const envelope = { ...makeValidEnvelope(next), fingerprints: { artifact: '' } };
    expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(false);
  });

  test('whitespace-only artifact fingerprint is rejected', () => {
    const next = mulberry32(43);
    const envelope = { ...makeValidEnvelope(next), fingerprints: { artifact: '   ' } };
    expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(false);
  });

  test('blocked governance at execution stage is rejected', () => {
    const envelope = {
      version: 1 as const,
      stage: 'execution' as const,
      scope: 'scenario' as const,
      ids: {},
      fingerprints: { artifact: 'fp-test' },
      lineage: {},
      governance: 'blocked' as const,
    };
    expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(false);
  });

  test('blocked governance at projection stage is rejected', () => {
    const envelope = {
      version: 1 as const,
      stage: 'projection' as const,
      scope: 'scenario' as const,
      ids: {},
      fingerprints: { artifact: 'fp-test' },
      lineage: {},
      governance: 'blocked' as const,
    };
    expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(false);
  });

  test('blocked governance at preparation stage is accepted', () => {
    const envelope = {
      version: 1 as const,
      stage: 'preparation' as const,
      scope: 'scenario' as const,
      ids: {},
      fingerprints: { artifact: 'fp-test' },
      lineage: {},
      governance: 'blocked' as const,
    };
    expect(decodeSafe(WorkflowEnvelopeSemanticSchema, envelope)).toBe(true);
  });

  test('round-trip: version field preserved', () => {
    const next = mulberry32(99);
    const envelope = makeValidEnvelope(next);
    const decoded = decodeSync(WorkflowEnvelopeSemanticSchema, envelope);
    expect(decoded.version).toBe(1);
  });
});

// ─── Law 5: TrustPolicy semantic invariants ───

test.describe('Law 5: TrustPolicy semantic invariants', () => {
  test('valid trust policies are accepted (150 seeds)', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const policy = makeValidTrustPolicy(next);
      expect(decodeSafe(TrustPolicySemanticSchema, policy)).toBe(true);
    }
  });

  test('minimumConfidence > 1 is rejected', () => {
    const next = mulberry32(42);
    const policy = makeValidTrustPolicy(next);
    const invalid = {
      ...policy,
      artifactTypes: {
        ...policy.artifactTypes,
        elements: {
          ...policy.artifactTypes.elements,
          minimumConfidence: 1.5,
        },
      },
    };
    expect(decodeSafe(TrustPolicySemanticSchema, invalid)).toBe(false);
  });

  test('minimumConfidence < 0 is rejected', () => {
    const next = mulberry32(43);
    const policy = makeValidTrustPolicy(next);
    const invalid = {
      ...policy,
      artifactTypes: {
        ...policy.artifactTypes,
        postures: {
          ...policy.artifactTypes.postures,
          minimumConfidence: -0.1,
        },
      },
    };
    expect(decodeSafe(TrustPolicySemanticSchema, invalid)).toBe(false);
  });

  test('negative minCount is rejected', () => {
    const next = mulberry32(44);
    const policy = makeValidTrustPolicy(next);
    const invalid = {
      ...policy,
      artifactTypes: {
        ...policy.artifactTypes,
        surface: {
          ...policy.artifactTypes.surface,
          requiredEvidence: {
            ...policy.artifactTypes.surface.requiredEvidence,
            minCount: -1,
          },
        },
      },
    };
    expect(decodeSafe(TrustPolicySemanticSchema, invalid)).toBe(false);
  });

  test('duplicate forbiddenAutoHealClasses are rejected', () => {
    const next = mulberry32(45);
    const policy = makeValidTrustPolicy(next);
    const invalid = {
      ...policy,
      forbiddenAutoHealClasses: ['class-a', 'class-a'],
    };
    expect(decodeSafe(TrustPolicySemanticSchema, invalid)).toBe(false);
  });

  test('minimumConfidence of 0 is accepted (boundary)', () => {
    const next = mulberry32(46);
    const policy = makeValidTrustPolicy(next);
    const boundary = {
      ...policy,
      artifactTypes: {
        ...policy.artifactTypes,
        elements: {
          ...policy.artifactTypes.elements,
          minimumConfidence: 0,
        },
      },
    };
    expect(decodeSafe(TrustPolicySemanticSchema, boundary)).toBe(true);
  });

  test('minimumConfidence of 1 is accepted (boundary)', () => {
    const next = mulberry32(47);
    const policy = makeValidTrustPolicy(next);
    const boundary = {
      ...policy,
      artifactTypes: {
        ...policy.artifactTypes,
        elements: {
          ...policy.artifactTypes.elements,
          minimumConfidence: 1,
        },
      },
    };
    expect(decodeSafe(TrustPolicySemanticSchema, boundary)).toBe(true);
  });

  test('empty forbiddenAutoHealClasses is accepted', () => {
    const next = mulberry32(48);
    const policy = { ...makeValidTrustPolicy(next), forbiddenAutoHealClasses: [] };
    expect(decodeSafe(TrustPolicySemanticSchema, policy)).toBe(true);
  });
});

// ─── Law 6: Schema composition — filter layering ───

test.describe('Law 6: Schema composition — filter layering', () => {
  test('structural errors are caught before semantic filters', () => {
    // Missing required fields in BoundStep should fail structurally
    expect(decodeSafe(BoundStepSemanticSchema, {})).toBe(false);
    expect(decodeSafe(BoundStepSemanticSchema, { index: 'not-a-number' })).toBe(false);
    expect(decodeSafe(BoundStepSemanticSchema, null)).toBe(false);
  });

  test('type coercion: non-object inputs are uniformly rejected', () => {
    const schemas = [
      BoundStepSemanticSchema,
      WorkflowEnvelopeSemanticSchema,
      TrustPolicySemanticSchema,
    ] as const;

    const nonObjects = [42, 'string', true, [], null, undefined];
    for (const schema of schemas) {
      for (const input of nonObjects) {
        expect(decodeSafe(schema as any, input)).toBe(false);
      }
    }
  });
});
