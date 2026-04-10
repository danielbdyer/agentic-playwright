/**
 * Phase 0d: Governance Verdict Laws
 *
 * Asserts that governance consumption is exclusively through the
 * typed API (isApproved/isBlocked/isReviewRequired/foldGovernance)
 * and that the GovernanceVerdict<T, I> ADT combinators (chainVerdict,
 * runGateChain) compose correctly.
 *
 * The governance field on WorkflowMetadata<S> stays as the
 * `Governance` string union for persistence compatibility. The
 * typed consumption layer (folds + type guards) is the canonical
 * access pattern; ad-hoc `=== 'approved'` comparisons are
 * architectural violations caught by this test.
 *
 * @see docs/envelope-axis-refactor-plan.md § 7 (Phase 0d)
 */
import { describe, test, expect } from 'vitest';
import {
  isApproved,
  isBlocked,
  isReviewRequired,
  foldGovernance,
  mintApproved,
  mintReviewRequired,
  mintBlocked,
} from '../../lib/domain/governance/workflow-types';
import type { Governance } from '../../lib/domain/governance/workflow-types';
import {
  approved,
  suspended,
  blocked,
  foldVerdict,
  chainVerdict,
  runGateChain,
} from '../../lib/domain/kernel/governed-suspension';
import type { GovernanceVerdict } from '../../lib/domain/kernel/governed-suspension';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';

describe('Phase 0d: Governance verdict laws', () => {
  // ─── Law 1: Governance type guards are exhaustive ──────────

  test('Law 1: isApproved/isBlocked/isReviewRequired cover all cases', () => {
    const cases: readonly Governance[] = ['approved', 'review-required', 'blocked'];
    for (const g of cases) {
      const item = { governance: g };
      const exactly_one =
        [isApproved(item), isBlocked(item), isReviewRequired(item)]
          .filter(Boolean).length;
      expect(exactly_one).toBe(1);
    }
  });

  // ─── Law 2: foldGovernance dispatches correctly ────────────

  test('Law 2: foldGovernance dispatches each governance value to correct case', () => {
    const items: readonly { governance: Governance }[] = [
      { governance: 'approved' },
      { governance: 'review-required' },
      { governance: 'blocked' },
    ];
    const results = items.map((item) =>
      foldGovernance(item, {
        approved: () => 'A',
        reviewRequired: () => 'R',
        blocked: () => 'B',
      }),
    );
    expect(results).toEqual(['A', 'R', 'B']);
  });

  // ─── Law 3: Mint functions produce correct values ──────────

  test('Law 3: mintApproved/mintReviewRequired/mintBlocked produce correct literals', () => {
    expect(mintApproved()).toBe('approved');
    expect(mintReviewRequired()).toBe('review-required');
    expect(mintBlocked()).toBe('blocked');
  });

  // ─── Law 4: GovernanceVerdict ADT constructors ─────────────

  test('Law 4: approved/suspended/blocked constructors produce correct tags', () => {
    const a = approved(42);
    expect(a._tag).toBe('Approved');
    expect(a.value).toBe(42);

    const s = suspended({ kind: 'needs-review' }, 'pending review');
    expect(s._tag).toBe('Suspended');
    expect(s.reason).toBe('pending review');

    const b = blocked('policy denied');
    expect(b._tag).toBe('Blocked');
    expect(b.reason).toBe('policy denied');
  });

  // ─── Law 5: foldVerdict is exhaustive ──────────────────────

  test('Law 5: foldVerdict dispatches each verdict tag to correct case', () => {
    const verdicts: readonly GovernanceVerdict<number, string>[] = [
      approved(1),
      suspended('needs-input', 'waiting'),
      blocked('forbidden'),
    ];
    const results = verdicts.map((v) =>
      foldVerdict(v, {
        onApproved: (val) => `A:${val}`,
        onSuspended: (_needs, reason) => `S:${reason}`,
        onBlocked: (reason) => `B:${reason}`,
      }),
    );
    expect(results).toEqual(['A:1', 'S:waiting', 'B:forbidden']);
  });

  // ─── Law 6: chainVerdict short-circuits on non-approved ────

  test('Law 6: chainVerdict short-circuits on suspended/blocked', () => {
    const base = approved(10);
    const chained = chainVerdict(base, (v) => approved(v * 2));
    expect(chained._tag).toBe('Approved');
    expect((chained as { value: number }).value).toBe(20);

    const sus = suspended('review', 'needs review');
    const chainedSus = chainVerdict(sus, () => approved(999));
    expect(chainedSus._tag).toBe('Suspended');

    const blk = blocked('denied');
    const chainedBlk = chainVerdict(blk, () => approved(999));
    expect(chainedBlk._tag).toBe('Blocked');
  });

  // ─── Law 7: runGateChain composes ──────────────────────────

  test('Law 7: runGateChain runs gates in order, short-circuits on first non-approved', () => {
    const calls: string[] = [];
    const gates = [
      (v: number) => { calls.push('A'); return approved(v + 1); },
      (v: number) => { calls.push('B'); return approved(v + 1); },
      (v: number) => { calls.push('C'); return approved(v + 1); },
    ];
    const result = runGateChain(0, gates);
    expect(result._tag).toBe('Approved');
    expect((result as { value: number }).value).toBe(3);
    expect(calls).toEqual(['A', 'B', 'C']);
  });

  test('Law 7b: runGateChain short-circuits and later gates are not called', () => {
    const calls: string[] = [];
    const gates = [
      (v: number) => { calls.push('A'); return approved(v + 1); },
      (_v: number) => { calls.push('B'); return blocked('stop') as GovernanceVerdict<number, never>; },
      (v: number) => { calls.push('C'); return approved(v + 1); },
    ];
    const result = runGateChain(0, gates);
    expect(result._tag).toBe('Blocked');
    expect(calls).toEqual(['A', 'B']); // C not called
  });

  // ─── Law 8: No ad-hoc governance string comparisons ────────

  test('Law 8: production code has zero ad-hoc governance string comparisons outside typed API', () => {
    // Walk lib/ and check that no file does `.governance === '...'`
    // outside the typed-API infrastructure files. This is the
    // architecture fitness test that prevents regression to
    // ad-hoc string comparisons.
    const libDir = path.resolve(__dirname, '../../lib');
    const violations: string[] = [];
    const adHocPattern = /\.governance\s*===\s*['"]|\.governance\s*!==\s*['"]/g;
    const allowedFiles = new Set([
      'domain/governance/workflow-types.ts', // isApproved/isBlocked/isReviewRequired definitions
      'domain/validation/core/shared.ts', // validator reads from persistence
      'domain/schemas/intent.ts', // schema validation on serialized data
      'domain/schemas/workflow.ts', // schema validation on serialized data
    ]);

    function walkDir(dir: string): void {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(full);
        } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
          const rel = path.relative(libDir, full).replace(/\\/g, '/');
          if (allowedFiles.has(rel)) continue;
          const content = readFileSync(full, 'utf-8');
          const matches = content.match(adHocPattern);
          if (matches) {
            violations.push(`${rel}: ${matches.length} ad-hoc comparison(s)`);
          }
        }
      }
    }

    walkDir(libDir);
    expect(violations).toEqual([]);
  });
});
