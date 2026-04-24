/**
 * Seed patterns — Z11a.4c laws.
 *
 *   ZC39     locator-by-role-and-name: guard accepts role+name,
 *            rejects role-only or name-only; resolves exact then
 *            substring.
 *   ZC39.b   navigation-link-by-name: guard accepts click+link in
 *            nav context; resolves single link by name in nav.
 *   ZC39.c   field-input-by-label: input verb resolves by exact /
 *            substring / single-textbox-in-form (ladder order).
 *   ZC39.d   dialog-confirmation: guard accepts click with dialog-
 *            cue text or canonical dialog-button name.
 *   ZC39.e   observation-by-assertion-phrase: observe verb +
 *            success cue resolves to role=status; error cue
 *            resolves to role=alert.
 *   ZC39.f   DEFAULT_PATTERN_REGISTRY contains all 6 patterns in
 *            specific → generic order.
 */

import { describe, test, expect } from 'vitest';
import { Option } from 'effect';
import {
  foldPatternRungResult,
  patternId,
  type ClassifiedIntent,
  type IndexedSurface,
  type MatcherContext,
  type Pattern,
  type TargetShapeHint,
} from '../../../product/domain/resolution/patterns/rung-kernel';
import { DEFAULT_PATTERN_REGISTRY } from '../../../product/domain/resolution/patterns/registry';
import { locatorByRoleAndNamePattern } from '../../../product/domain/resolution/patterns/patterns/locator-by-role-and-name.pattern';
import { navigationLinkByNamePattern } from '../../../product/domain/resolution/patterns/patterns/navigation-link-by-name.pattern';
import { fieldInputByLabelPattern } from '../../../product/domain/resolution/patterns/patterns/field-input-by-label.pattern';
import { dialogConfirmationPattern } from '../../../product/domain/resolution/patterns/patterns/dialog-confirmation.pattern';
import { observationByAssertionPhrasePattern } from '../../../product/domain/resolution/patterns/patterns/observation-by-assertion-phrase.pattern';
import { surfaceIndexFromList } from '../../../product/runtime/resolution/patterns/surface-index-from-stage';

function surface(o: Partial<IndexedSurface> & Pick<IndexedSurface, 'surfaceId' | 'role'>): IndexedSurface {
  return { name: null, landmarkRole: null, classes: [], ...o };
}

function ctx(
  verb: ClassifiedIntent['verb'],
  actionText: string,
  targetShape: TargetShapeHint,
  surfaces: readonly IndexedSurface[],
): MatcherContext {
  return {
    intent: { verb, originalActionText: actionText, targetShape },
    surfaceIndex: surfaceIndexFromList(surfaces),
  };
}

function runPattern(pattern: Pattern, c: MatcherContext): { matched: boolean; targetSurfaceId?: string; matcherIndex?: number } {
  const result = pattern.orchestrator(pattern, c);
  return foldPatternRungResult(result, {
    matched: (r) => ({ matched: true, targetSurfaceId: r.candidate.targetSurfaceId, matcherIndex: r.candidate.matcherIndex }),
    noMatch: () => ({ matched: false }),
  });
}

// ─── ZC39: locator-by-role-and-name ─────────────────────────────

describe('Z11a.4c — locator-by-role-and-name', () => {
  test('ZC39: guard accepts role + name; rejects role-only and name-only', () => {
    const empty = ctx('click', '', {}, []);
    expect(locatorByRoleAndNamePattern.applicabilityGuard(empty)).toBe(false);

    const roleOnly = ctx('click', '', { role: 'button' }, []);
    expect(locatorByRoleAndNamePattern.applicabilityGuard(roleOnly)).toBe(false);

    const nameOnly = ctx('click', '', { name: 'Save' }, []);
    expect(locatorByRoleAndNamePattern.applicabilityGuard(nameOnly)).toBe(false);

    const both = ctx('click', '', { role: 'button', name: 'Save' }, []);
    expect(locatorByRoleAndNamePattern.applicabilityGuard(both)).toBe(true);
  });

  test('ZC39.a: resolves exact role+name at M0', () => {
    const save = surface({ surfaceId: 'sid:save', role: 'button', name: 'Save' });
    const c = ctx('click', '', { role: 'button', name: 'Save' }, [save]);
    const r = runPattern(locatorByRoleAndNamePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:save', matcherIndex: 0 });
  });

  test('ZC39.a.substring: falls through to M1 on casing mismatch', () => {
    const save = surface({ surfaceId: 'sid:save', role: 'button', name: 'Save' });
    const c = ctx('click', '', { role: 'button', nameSubstring: 'save' }, [save]);
    const r = runPattern(locatorByRoleAndNamePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:save', matcherIndex: 1 });
  });
});

// ─── ZC39.b: navigation-link-by-name ────────────────────────────

describe('Z11a.4c — navigation-link-by-name', () => {
  test('ZC39.b: guard accepts click intent naming a link or bare nav target', () => {
    const clickLink = ctx('click', '', { role: 'link', name: 'Archive' }, []);
    expect(navigationLinkByNamePattern.applicabilityGuard(clickLink)).toBe(true);

    const clickButton = ctx('click', '', { role: 'button', name: 'Archive' }, []);
    expect(navigationLinkByNamePattern.applicabilityGuard(clickButton)).toBe(false);

    const navigateVerb = ctx('navigate', '', { name: 'Archive' }, []);
    expect(navigationLinkByNamePattern.applicabilityGuard(navigateVerb)).toBe(false);
  });

  test('ZC39.b.resolves: link inside nav landmark resolves single match', () => {
    const nav = surface({ surfaceId: 'sid:nav', role: 'navigation', landmarkRole: 'navigation' });
    const archive = surface({ surfaceId: 'sid:archive', role: 'link', name: 'Archive' });
    const c = ctx('click', 'Click the Archive link', { nameSubstring: 'Archive' }, [nav, archive]);
    const r = runPattern(navigationLinkByNamePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:archive' });
  });

  test('ZC39.b.no-nav: no nav landmark → no match', () => {
    const archive = surface({ surfaceId: 'sid:archive', role: 'link', name: 'Archive' });
    const c = ctx('click', '', { nameSubstring: 'Archive' }, [archive]);
    const r = runPattern(navigationLinkByNamePattern, c);
    expect(r.matched).toBe(false);
  });
});

// ─── ZC39.c: field-input-by-label ───────────────────────────────

describe('Z11a.4c — field-input-by-label', () => {
  test('ZC39.c: exact textbox name fires M0', () => {
    const tb = surface({ surfaceId: 'sid:email', role: 'textbox', name: 'Email' });
    const c = ctx('input', '', { role: 'textbox', name: 'Email' }, [tb]);
    const r = runPattern(fieldInputByLabelPattern, c);
    expect(r).toMatchObject({ matched: true, matcherIndex: 0 });
  });

  test('ZC39.c.single-in-form: falls to M2 when name hint absent but form has single textbox', () => {
    const form = surface({ surfaceId: 'sid:form', role: 'form', landmarkRole: 'form' });
    const tb = surface({ surfaceId: 'sid:email', role: 'textbox', name: 'Email' });
    const c = ctx('input', 'Enter the value', {}, [form, tb]);
    const r = runPattern(fieldInputByLabelPattern, c);
    expect(r).toMatchObject({ matched: true, matcherIndex: 2, targetSurfaceId: 'sid:email' });
  });

  test('ZC39.c.wrong-verb: click verb not applicable', () => {
    const tb = surface({ surfaceId: 'sid:email', role: 'textbox', name: 'Email' });
    const c = ctx('click', '', { role: 'textbox', name: 'Email' }, [tb]);
    expect(fieldInputByLabelPattern.applicabilityGuard(c)).toBe(false);
  });
});

// ─── ZC39.d: dialog-confirmation ────────────────────────────────

describe('Z11a.4c — dialog-confirmation', () => {
  test('ZC39.d: guard accepts click with dialog-cue text', () => {
    const c = ctx('click', 'Click Confirm in the modal dialog', { nameSubstring: 'Confirm' }, []);
    expect(dialogConfirmationPattern.applicabilityGuard(c)).toBe(true);
  });

  test('ZC39.d.button-name-cue: guard accepts canonical dialog-button name even without dialog word', () => {
    const c = ctx('click', 'Click Confirm', { name: 'Confirm' }, []);
    expect(dialogConfirmationPattern.applicabilityGuard(c)).toBe(true);
  });

  test('ZC39.d.no-dialog-substrate: resolves to no-match when no dialog landmark present (current synthetic-app)', () => {
    const btn = surface({ surfaceId: 'sid:confirm', role: 'button', name: 'Confirm' });
    const c = ctx('click', 'Click Confirm in the modal', { name: 'Confirm' }, [btn]);
    // Pattern fires its guard, walks matcher, finds no dialog landmark → no-match.
    const r = runPattern(dialogConfirmationPattern, c);
    expect(r.matched).toBe(false);
  });

  test('ZC39.d.resolves: with dialog landmark + confirm button, matcher resolves', () => {
    const dialog = surface({ surfaceId: 'sid:dlg', role: 'dialog', landmarkRole: 'dialog' });
    const confirm = surface({ surfaceId: 'sid:confirm', role: 'button', name: 'Confirm' });
    const c = ctx('click', 'Click Confirm in the modal', { name: 'Confirm' }, [dialog, confirm]);
    const r = runPattern(dialogConfirmationPattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:confirm' });
  });
});

// ─── ZC39.e: observation-by-assertion-phrase ───────────────────

describe('Z11a.4c — observation-by-assertion-phrase', () => {
  test('ZC39.e.status: "success" cue + matching status surface → inferred role', () => {
    const statusNode = surface({ surfaceId: 'sid:ok', role: 'status', name: 'Account created' });
    const c = ctx('observe', 'Verify the success message appears', { nameSubstring: 'success' }, [statusNode]);
    const r = runPattern(observationByAssertionPhrasePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:ok' });
  });

  test('ZC39.e.alert: "error" cue + matching alert surface → role=alert inferred', () => {
    const alertNode = surface({ surfaceId: 'sid:err', role: 'alert', name: 'Something went wrong' });
    const c = ctx('observe', 'Verify the error message appears', { nameSubstring: 'error' }, [alertNode]);
    const r = runPattern(observationByAssertionPhrasePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:err' });
  });

  test('ZC39.e.exact-role: observe with exact role+name fires M0 before inference', () => {
    const heading = surface({ surfaceId: 'sid:h', role: 'heading', name: 'Article title' });
    const c = ctx('observe', '', { role: 'heading', name: 'Article title' }, [heading]);
    const r = runPattern(observationByAssertionPhrasePattern, c);
    expect(r).toMatchObject({ matched: true, targetSurfaceId: 'sid:h', matcherIndex: 0 });
  });
});

// ─── ZC39.f: default registry ordering ──────────────────────────

describe('Z11a.4c — DEFAULT_PATTERN_REGISTRY composition', () => {
  test('ZC39.f: contains all six patterns in specific → generic order', () => {
    const ids = DEFAULT_PATTERN_REGISTRY.patterns.map((p) => p.id);
    expect(ids).toEqual([
      patternId('dialog-confirmation'),
      patternId('navigation-link-by-name'),
      patternId('form-submission'),
      patternId('field-input-by-label'),
      patternId('observation-by-assertion-phrase'),
      patternId('locator-by-role-and-name'),
    ]);
  });
});
