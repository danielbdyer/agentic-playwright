import { expect, test } from '@playwright/test';
import { deriveAct, type FlywheelAct } from '../dashboard/bridges/journal-writer';
import type { DashboardEventKind } from '../product/domain/observation/dashboard';

const FLYWHEEL_EVENTS: readonly DashboardEventKind[] = [
  'surface-discovered', 'route-navigated', 'aria-tree-captured',
  'suite-slice-selected', 'scenario-prioritized',
  'step-bound', 'scenario-compiled',
  'step-executing', 'step-resolved', 'scenario-executed',
  'trust-policy-evaluated', 'knowledge-activated',
  'convergence-evaluated', 'iteration-summary',
];

test.describe('Journal writer laws', () => {
  test('Law 1: every flywheel event kind maps to acts 2-7, not act 1', () => {
    FLYWHEEL_EVENTS.forEach((kind) => {
      const act = deriveAct(kind, null);
      expect(act, `${kind} should not fall through to act 1`).toBeGreaterThanOrEqual(2);
      expect(act).toBeLessThanOrEqual(7);
    });
  });

  test('Law 2: act derivation is deterministic — same input always produces same act', () => {
    FLYWHEEL_EVENTS.forEach((kind) => {
      const first = deriveAct(kind, null);
      const second = deriveAct(kind, null);
      const third = deriveAct(kind, 'some-hint');
      const fourth = deriveAct(kind, 'some-hint');
      expect(first).toBe(second);
      expect(third).toBe(fourth);
    });
  });

  test('Law 3: stage hint keywords correctly map to acts', () => {
    const hintToAct: ReadonlyArray<readonly [string, FlywheelAct]> = [
      ['capture-phase', 2],
      ['probe-dom', 2],
      ['slice-selection', 3],
      ['compile-specs', 4],
      ['bind-steps', 4],
      ['emit-artifacts', 4],
      ['execute-run', 5],
      ['run-scenario', 5],
      ['gate-check', 6],
      ['trust-evaluation', 6],
      ['measure-convergence', 7],
      ['score-results', 7],
    ];
    // Use an unknown event type so only the stage hint decides
    const unknownKind = 'unknown-event' as DashboardEventKind;
    hintToAct.forEach(([hint, expectedAct]) => {
      const act = deriveAct(unknownKind, hint);
      expect(act, `hint "${hint}" → act ${expectedAct}`).toBe(expectedAct);
    });
  });

  test('Law 4: unknown event type with null stage hint produces act 1', () => {
    const unknownKind = 'totally-unknown' as DashboardEventKind;
    expect(deriveAct(unknownKind, null)).toBe(1);
  });

  test('Law 5: event type takes precedence over stage hint', () => {
    // 'route-navigated' maps to act 2 by event type.
    // A misleading stage hint like 'measure-convergence' would map to act 7 via hint.
    // Event type must win.
    const act = deriveAct('route-navigated', 'measure-convergence');
    expect(act).toBe(2);

    // 'convergence-evaluated' maps to act 7 by event type.
    // A hint of 'capture-phase' would map to act 2 via hint. Event type must win.
    const act2 = deriveAct('convergence-evaluated', 'capture-phase');
    expect(act2).toBe(7);
  });
});
