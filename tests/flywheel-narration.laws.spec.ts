import { expect, test } from '@playwright/test';
import {
  generateCaption,
  shouldShowCaption,
  NARRATED_EVENT_KINDS,
  CAPTION_FACTORIES,
  type CaptionContext,
} from '../dashboard/src/narration-catalog';
import type { DashboardEventKind } from '../product/domain/observation/dashboard';

// ─── Helpers ───

const baseContext: CaptionContext = {
  isFirst: true,
  currentAct: 1,
  iteration: 1,
  totalScenarios: 50,
  screenCount: 8,
  elementCount: 120,
};

test.describe('Narration catalog laws', () => {

  test('Law 1: NARRATED_EVENT_KINDS lists all event types with caption factories', () => {
    expect(NARRATED_EVENT_KINDS.length).toBeGreaterThan(0);
    NARRATED_EVENT_KINDS.forEach((kind) => {
      expect(CAPTION_FACTORIES[kind]).toBeDefined();
      expect(typeof CAPTION_FACTORIES[kind]).toBe('function');
    });
  });

  test('Law 2: every caption factory returns CaptionDescriptor or null', () => {
    NARRATED_EVENT_KINDS.forEach((kind) => {
      const factory = CAPTION_FACTORIES[kind]!;
      const result = factory({}, baseContext);
      if (result !== null) {
        expect(typeof result.text).toBe('string');
        expect(result.text.length).toBeGreaterThan(0);
        expect(typeof result.position).toBe('string');
        expect(typeof result.emphasis).toBe('string');
        expect(typeof result.durationMs).toBe('number');
        expect(typeof result.minVerbosity).toBe('string');
      }
    });
  });

  test('Law 3: convergence milestone caption appears at minimal verbosity', () => {
    const caption = generateCaption(
      'convergence-evaluated',
      { converged: true, knowledgeHitRate: 0.89, delta: 0.03 },
      { ...baseContext, iteration: 5 },
    );
    expect(caption).not.toBeNull();
    expect(caption!.emphasis).toBe('milestone');
    expect(caption!.minVerbosity).toBe('minimal');
    expect(caption!.text).toContain('Converged');
    expect(caption!.text).toContain('89%');
  });

  test('Law 4: first green test caption is a milestone at minimal verbosity', () => {
    const caption = generateCaption(
      'scenario-executed',
      { adoId: 'TC-42', passed: true },
      { ...baseContext, isFirst: true },
    );
    expect(caption).not.toBeNull();
    expect(caption!.emphasis).toBe('milestone');
    expect(caption!.minVerbosity).toBe('minimal');
    expect(caption!.text).toContain('✓');
    expect(caption!.text).toContain('TC-42');
  });

  test('Law 5: subsequent scenario-executed does not generate caption', () => {
    const caption = generateCaption(
      'scenario-executed',
      { adoId: 'TC-42', passed: true },
      { ...baseContext, isFirst: false },
    );
    expect(caption).toBeNull();
  });

  test('Law 6: fiber-paused caption is a highlight at minimal verbosity', () => {
    const caption = generateCaption(
      'fiber-paused',
      { reason: 'locator ambiguity' },
      baseContext,
    );
    expect(caption).not.toBeNull();
    expect(caption!.emphasis).toBe('highlight');
    expect(caption!.minVerbosity).toBe('minimal');
    expect(caption!.text).toContain('Awaiting human decision');
  });

  test('Law 7: shouldShowCaption respects verbosity hierarchy', () => {
    expect(shouldShowCaption('minimal', 'minimal')).toBe(true);
    expect(shouldShowCaption('minimal', 'normal')).toBe(true);
    expect(shouldShowCaption('minimal', 'verbose')).toBe(true);
    expect(shouldShowCaption('normal', 'minimal')).toBe(false);
    expect(shouldShowCaption('normal', 'normal')).toBe(true);
    expect(shouldShowCaption('normal', 'verbose')).toBe(true);
    expect(shouldShowCaption('verbose', 'minimal')).toBe(false);
    expect(shouldShowCaption('verbose', 'normal')).toBe(false);
    expect(shouldShowCaption('verbose', 'verbose')).toBe(true);
  });

  test('Law 8: non-convergence hit-rate caption includes delta', () => {
    const caption = generateCaption(
      'convergence-evaluated',
      { converged: false, knowledgeHitRate: 0.65, delta: 0.08, budgetRemaining: { iterations: 3 } },
      { ...baseContext, iteration: 2 },
    );
    expect(caption).not.toBeNull();
    expect(caption!.text).toContain('65%');
    expect(caption!.text).toContain('+8%');
    expect(caption!.text).toContain('3 iterations remaining');
  });

  test('Law 9: suite-slice-selected shows selection count', () => {
    const caption = generateCaption(
      'suite-slice-selected',
      { selectedCount: 30, totalCount: 50 },
      baseContext,
    );
    expect(caption).not.toBeNull();
    expect(caption!.text).toContain('30');
    expect(caption!.text).toContain('50');
    expect(caption!.emphasis).toBe('highlight');
  });

  test('Law 10: trust-policy blocked caption mentions trust policy', () => {
    const caption = generateCaption(
      'trust-policy-evaluated',
      { proposalId: 'P-1', decision: 'blocked' },
      baseContext,
    );
    expect(caption).not.toBeNull();
    expect(caption!.text).toContain('Blocked');
    expect(caption!.text).toContain('trust policy');
  });

  test('Law 11: generateCaption returns null for event types without factories', () => {
    const caption = generateCaption(
      'diagnostics' as DashboardEventKind,
      {},
      baseContext,
    );
    expect(caption).toBeNull();
  });

  test('Law 12: all caption positions are valid CaptionPosition values', () => {
    const validPositions = new Set([
      'top-center', 'center', 'bottom-center',
      'screen-plane-top', 'screen-plane-bottom', 'screen-plane-center',
      'observatory', 'glass-pane', 'pipeline-timeline', 'workbench',
    ]);
    NARRATED_EVENT_KINDS.forEach((kind) => {
      const factory = CAPTION_FACTORIES[kind]!;
      const result = factory({}, baseContext);
      if (result) {
        expect(validPositions.has(result.position), `${kind} position "${result.position}" is valid`).toBe(true);
      }
    });
  });

  test('Law 13: all caption emphases are valid CaptionEmphasis values', () => {
    const validEmphasis = new Set(['normal', 'highlight', 'milestone']);
    NARRATED_EVENT_KINDS.forEach((kind) => {
      const factory = CAPTION_FACTORIES[kind]!;
      const result = factory({}, baseContext);
      if (result) {
        expect(validEmphasis.has(result.emphasis), `${kind} emphasis "${result.emphasis}" is valid`).toBe(true);
      }
    });
  });

  test('Law 14: milestones have longer duration than normal captions', () => {
    // Convergence milestone
    const milestone = generateCaption(
      'convergence-evaluated',
      { converged: true, knowledgeHitRate: 0.89 },
      { ...baseContext, iteration: 5 },
    );
    // Suite slice (highlight)
    const highlight = generateCaption(
      'suite-slice-selected',
      { selectedCount: 30, totalCount: 50 },
      baseContext,
    );
    // Route navigated (normal)
    const normal = generateCaption(
      'route-navigated',
      { url: 'http://example.com/claims' },
      baseContext,
    );
    expect(milestone!.durationMs).toBeGreaterThan(highlight!.durationMs);
    expect(highlight!.durationMs).toBeGreaterThanOrEqual(normal!.durationMs);
  });
});
