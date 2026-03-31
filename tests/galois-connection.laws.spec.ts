/**
 * Galois Connection Verification — Law Tests
 *
 * Algebraic invariants for trust policy evaluation as a Galois connection:
 *   - Decision order: deny <= review <= allow is a total order
 *   - Monotonicity: higher confidence + more evidence => at least as permissive
 *   - Forbidden auto-heal is always deny
 *   - Sufficient evidence + confidence allows
 *   - Gate composition is monotone
 *
 * Tested function:
 *   - evaluateTrustPolicy (domain/trust-policy.ts)
 */

import { expect, test } from '@playwright/test';
import { mulberry32, pick , LAW_SEED_COUNT } from './support/random';
import { evaluateTrustPolicy } from '../lib/domain/trust-policy';
import type {
  TrustPolicy,
  TrustPolicyDecision,
  TrustPolicyArtifactType,
  EvidenceDescriptor,
} from '../lib/domain/types';

// ─── Decision lattice ───

const DECISION_ORDER: Record<TrustPolicyDecision, number> = {
  deny: 0,
  review: 1,
  allow: 2,
};

function decisionLeq(a: TrustPolicyDecision, b: TrustPolicyDecision): boolean {
  return DECISION_ORDER[a] <= DECISION_ORDER[b];
}

// ─── Test policy ───

const ARTIFACT_TYPES: readonly TrustPolicyArtifactType[] = [
  'elements', 'postures', 'surface', 'snapshot', 'hints', 'patterns',
];

const EVIDENCE_KINDS = ['screenshot', 'aria-snapshot', 'dom-snapshot', 'trace'];

function makePolicy(): TrustPolicy {
  const artifactTypes = Object.fromEntries(
    ARTIFACT_TYPES.map((t) => [
      t,
      {
        minimumConfidence: 0.7,
        requiredEvidence: { minCount: 1, kinds: ['screenshot', 'aria-snapshot'] },
      },
    ]),
  ) as unknown as TrustPolicy['artifactTypes'];

  return {
    version: 1,
    artifactTypes,
    forbiddenAutoHealClasses: ['destructive', 'data-mutation'],
  };
}

const POLICY = makePolicy();

function evaluate(
  artifactType: TrustPolicyArtifactType,
  confidence: number,
  evidence: readonly EvidenceDescriptor[],
  autoHealClass?: string | null,
): TrustPolicyDecision {
  return evaluateTrustPolicy({
    policy: POLICY,
    proposedChange: { artifactType, confidence, autoHealClass },
    evidence: [...evidence],
  }).decision;
}

function randomEvidence(next: () => number, count: number): EvidenceDescriptor[] {
  return Array.from({ length: count }, () => ({
    kind: pick(next, EVIDENCE_KINDS),
  }));
}

// ─── Law 1: Decision order ───

test.describe('Law 1: Decision order — deny <= review <= allow is a total order', () => {
  test('deny <= review', () => {
    expect(decisionLeq('deny', 'review')).toBe(true);
  });

  test('review <= allow', () => {
    expect(decisionLeq('review', 'allow')).toBe(true);
  });

  test('deny <= allow', () => {
    expect(decisionLeq('deny', 'allow')).toBe(true);
  });

  test('allow is NOT <= deny', () => {
    expect(decisionLeq('allow', 'deny')).toBe(false);
  });

  test('reflexive: every decision <= itself', () => {
    for (const d of ['deny', 'review', 'allow'] as const) {
      expect(decisionLeq(d, d)).toBe(true);
    }
  });

  test('transitive: if a <= b and b <= c then a <= c', () => {
    const decisions: TrustPolicyDecision[] = ['deny', 'review', 'allow'];
    for (const a of decisions) {
      for (const b of decisions) {
        for (const c of decisions) {
          if (decisionLeq(a, b) && decisionLeq(b, c)) {
            expect(decisionLeq(a, c)).toBe(true);
          }
        }
      }
    }
  });

  test('antisymmetric: if a <= b and b <= a then a = b', () => {
    const decisions: TrustPolicyDecision[] = ['deny', 'review', 'allow'];
    for (const a of decisions) {
      for (const b of decisions) {
        if (decisionLeq(a, b) && decisionLeq(b, a)) {
          expect(a).toBe(b);
        }
      }
    }
  });
});

// ─── Law 2: Monotonicity of evaluation ───

test.describe('Law 2: Monotonicity — higher confidence + more evidence => at least as permissive', () => {
  test('increasing confidence is monotone (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const evidence = randomEvidence(next, 3);

      const lowConf = next() * 0.5;
      const highConf = lowConf + next() * 0.5;

      const lowDecision = evaluate(artifactType, lowConf, evidence);
      const highDecision = evaluate(artifactType, highConf, evidence);

      expect(decisionLeq(lowDecision, highDecision)).toBe(true);
    }
  });

  test('increasing evidence count is monotone (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 5000);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const confidence = next();

      const lessEvidence = randomEvidence(next, 0);
      const moreEvidence = [...lessEvidence, ...randomEvidence(next, 3)];

      const lessDecision = evaluate(artifactType, confidence, lessEvidence);
      const moreDecision = evaluate(artifactType, confidence, moreEvidence);

      expect(decisionLeq(lessDecision, moreDecision)).toBe(true);
    }
  });

  test('both increasing together is monotone (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 6000);
      const artifactType = pick(next, ARTIFACT_TYPES);

      const lowConf = next() * 0.4;
      const highConf = lowConf + 0.3 + next() * 0.3;

      const lessEvidence = randomEvidence(next, 0);
      const moreEvidence = [...lessEvidence, ...randomEvidence(next, 3)];

      const weakDecision = evaluate(artifactType, lowConf, lessEvidence);
      const strongDecision = evaluate(artifactType, highConf, moreEvidence);

      expect(decisionLeq(weakDecision, strongDecision)).toBe(true);
    }
  });
});

// ─── Law 3: Forbidden auto-heal is always deny ───

test.describe('Law 3: Forbidden auto-heal is always deny', () => {
  test('forbidden auto-heal class produces deny regardless of confidence/evidence (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 7000);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const confidence = next(); // any confidence
      const evidence = randomEvidence(next, 5); // abundant evidence
      const healClass = pick(next, POLICY.forbiddenAutoHealClasses);

      const decision = evaluate(artifactType, confidence, evidence, healClass);
      expect(decision).toBe('deny');
    }
  });

  test('non-forbidden heal class does NOT force deny', () => {
    const evidence: EvidenceDescriptor[] = [{ kind: 'screenshot' }, { kind: 'aria-snapshot' }];
    const decision = evaluate('elements', 0.95, evidence, 'safe-class');
    expect(decision).not.toBe('deny');
  });
});

// ─── Law 4: Sufficient evidence + confidence allows ───

test.describe('Law 4: Sufficient evidence + confidence => allow', () => {
  test('meeting both thresholds yields allow for all artifact types', () => {
    for (const artifactType of ARTIFACT_TYPES) {
      const rule = POLICY.artifactTypes[artifactType];
      const evidence: EvidenceDescriptor[] = rule.requiredEvidence.kinds.map((kind) => ({ kind }));
      // Add enough evidence to meet minCount
      while (evidence.length < rule.requiredEvidence.minCount) {
        evidence.push({ kind: rule.requiredEvidence.kinds[0]! });
      }

      const decision = evaluate(artifactType, rule.minimumConfidence, evidence);
      expect(decision).toBe('allow');
    }
  });

  test('exceeding thresholds still allows (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 8000);
      const artifactType = pick(next, ARTIFACT_TYPES);
      const rule = POLICY.artifactTypes[artifactType];

      const confidence = rule.minimumConfidence + next() * (1 - rule.minimumConfidence);
      const evidence: EvidenceDescriptor[] = rule.requiredEvidence.kinds.map((kind) => ({ kind }));
      // Add extra evidence
      for (let i = 0; i < 3; i++) {
        evidence.push({ kind: pick(next, rule.requiredEvidence.kinds) });
      }

      const decision = evaluate(artifactType, confidence, evidence);
      expect(decision).toBe('allow');
    }
  });
});

// ─── Law 5: Gate composition is monotone ───

test.describe('Law 5: Gate composition — the 6-gate chain respects the lattice', () => {
  test('failing confidence but passing evidence => review (not allow)', () => {
    for (const artifactType of ARTIFACT_TYPES) {
      const rule = POLICY.artifactTypes[artifactType];
      const evidence: EvidenceDescriptor[] = rule.requiredEvidence.kinds.map((kind) => ({ kind }));
      while (evidence.length < rule.requiredEvidence.minCount) {
        evidence.push({ kind: rule.requiredEvidence.kinds[0]! });
      }

      const decision = evaluate(artifactType, rule.minimumConfidence * 0.5, evidence);
      // Failing confidence gate but passing evidence gate => review
      expect(decision).toBe('review');
    }
  });

  test('passing confidence but failing evidence => review (not allow)', () => {
    for (const artifactType of ARTIFACT_TYPES) {
      const decision = evaluate(artifactType, 0.99, []);
      // Failing evidence gate => review
      expect(decision).toBe('review');
    }
  });

  test('failing both gates => review (not deny, since no forbidden heal)', () => {
    for (const artifactType of ARTIFACT_TYPES) {
      const decision = evaluate(artifactType, 0.1, []);
      expect(decision).toBe('review');
    }
  });

  test('forbidden heal dominates all other gates => deny', () => {
    for (const artifactType of ARTIFACT_TYPES) {
      const rule = POLICY.artifactTypes[artifactType];
      const evidence: EvidenceDescriptor[] = rule.requiredEvidence.kinds.map((kind) => ({ kind }));
      // Pass confidence and evidence but forbidden heal class
      const decision = evaluate(artifactType, 0.99, evidence, 'destructive');
      expect(decision).toBe('deny');
    }
  });

  test('gate composition monotonicity across artifact types (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 9000);
      const artifactType = pick(next, ARTIFACT_TYPES);

      // Baseline: low confidence, no evidence
      const weak = evaluate(artifactType, 0.1, []);

      // Intermediate: high confidence, no evidence
      const mid = evaluate(artifactType, 0.99, []);

      // Strong: high confidence, sufficient evidence
      const rule = POLICY.artifactTypes[artifactType];
      const evidence: EvidenceDescriptor[] = rule.requiredEvidence.kinds.map((kind) => ({ kind }));
      const strong = evaluate(artifactType, 0.99, evidence);

      // Monotone: weak <= mid <= strong
      expect(decisionLeq(weak, mid)).toBe(true);
      expect(decisionLeq(mid, strong)).toBe(true);
    }
  });
});
