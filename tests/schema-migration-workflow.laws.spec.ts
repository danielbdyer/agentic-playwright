import { expect, test } from '@playwright/test';
import { SchemaError } from '../product/domain/kernel/errors';
import { validateBoundStep } from '../product/domain/validation/intent';
import { validateTrustPolicy } from '../product/domain/validation/trust-policy';
import { WorkflowEnvelopeHeaderSchema } from '../product/domain/schemas';
import { decodeUnknownSync } from '../product/domain/schemas/decode';

const decodeWorkflowEnvelope = decodeUnknownSync(WorkflowEnvelopeHeaderSchema);

const validBoundStep = {
  index: 0,
  intent: 'open dashboard',
  action_text: 'open dashboard',
  expected_text: 'dashboard loads',
  action: 'navigate' as const,
  screen: 'dashboard',
  element: null,
  posture: null,
  override: null,
  snapshot_template: null,
  route_state: null,
  resolution: null,
  confidence: 'compiler-derived' as const,
  binding: {
    kind: 'deferred' as const,
    reasons: [],
    ruleId: null,
    normalizedIntent: 'open dashboard',
    knowledgeRefs: [],
    supplementRefs: [],
    evidenceIds: [],
    governance: 'approved' as const,
    reviewReasons: [],
  },
};

test.describe('semantic schema migration laws', () => {
  test('bound step round-trips through validateBoundStep', () => {
    const decoded = validateBoundStep(validBoundStep);
    expect(decoded).toEqual(validBoundStep);
  });

  test('bound step enforces cross-field invariant for unbound steps', () => {
    const invalid = {
      ...validBoundStep,
      screen: 'dashboard',
      binding: { ...validBoundStep.binding, kind: 'unbound' as const },
    };
    expect(() => validateBoundStep(invalid)).toThrow(/screen and element must both be null/i);
  });

  test('workflow envelope reports precise path for artifact fingerprint', () => {
    const invalid = {
      version: 1 as const,
      stage: 'preparation' as const,
      scope: 'scenario' as const,
      ids: {},
      fingerprints: { artifact: '   ' },
      lineage: {},
      governance: 'approved' as const,
    };
    try {
      decodeWorkflowEnvelope(invalid);
      throw new Error('expected decode failure');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError);
      expect((error as SchemaError).path).toBe('fingerprints.artifact');
    }
  });

  test('trust policy reports precise path for minimumConfidence bounds', () => {
    const invalid = {
      version: 1 as const,
      artifactTypes: {
        elements: { minimumConfidence: 2, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
        postures: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
        surface: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
        snapshot: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
        hints: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
        patterns: { minimumConfidence: 0.8, requiredEvidence: { minCount: 0, kinds: ['dom'] } },
      },
      forbiddenAutoHealClasses: [],
    };

    try {
      validateTrustPolicy(invalid);
      throw new Error('expected decode failure');
    } catch (error) {
      expect(error).toBeInstanceOf(SchemaError);
      expect((error as SchemaError).path).toBe('artifactTypes.elements.minimumConfidence');
    }
  });
});
