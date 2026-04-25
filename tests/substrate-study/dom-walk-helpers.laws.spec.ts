/**
 * DOM-walk pure-helper laws (Z11g.d.0a Phase 3).
 *
 * The browser-bound walkDom() function is tested by integration
 * against the synthetic-app in a later phase. Its pure helpers
 * are exported separately so they can be unit-tested here
 * without Playwright ceremony.
 */

import { describe, test, expect } from 'vitest';
import {
  bucketBoundingRect,
  bucketTextLength,
  classifyClassPrefix,
  isLabelClassified,
} from '../../workshop/substrate-study/application/dom-walk-capture';
import {
  classifyVariant,
  type VariantClassifierSignals,
} from '../../workshop/substrate-study/application/variant-classifier';

describe('bucketBoundingRect (Z11g.d.0a §3.3)', () => {
  test('zero rect produces zero bins', () => {
    expect(bucketBoundingRect({ x: 0, y: 0, width: 0, height: 0 })).toEqual({
      xBin: 0,
      yBin: 0,
      widthBin: 0,
      heightBin: 0,
    });
  });

  test('x/y bucketed to nearest 10 (floor); w/h to nearest 20', () => {
    expect(
      bucketBoundingRect({ x: 17, y: 29, width: 53, height: 98 }),
    ).toEqual({
      xBin: 10,
      yBin: 20,
      widthBin: 40,
      heightBin: 80,
    });
  });

  test('sub-pixel drift is absorbed (values within a bin bucket together)', () => {
    const a = bucketBoundingRect({ x: 11.3, y: 21.7, width: 54.1, height: 97.9 });
    const b = bucketBoundingRect({ x: 18.9, y: 29.1, width: 55.4, height: 99.3 });
    expect(b).toEqual(a);
  });

  test('NaN / infinite inputs collapse to 0 (defensive)', () => {
    expect(
      bucketBoundingRect({
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        width: Number.NEGATIVE_INFINITY,
        height: Number.NaN,
      }),
    ).toEqual({ xBin: 0, yBin: 0, widthBin: 0, heightBin: 0 });
  });

  test('negative coords bucket to negative bins', () => {
    // Element off-screen to the left/top legitimately has
    // negative coordinates — floor(-5/10)*10 = -10.
    expect(
      bucketBoundingRect({ x: -5, y: -11, width: 100, height: 100 }),
    ).toEqual({ xBin: -10, yBin: -20, widthBin: 100, heightBin: 100 });
  });
});

describe('bucketTextLength (Z11g.d.0a §11.5)', () => {
  test('zero length → "0"', () => {
    expect(bucketTextLength(0)).toBe('0');
  });
  test('1-10 chars → "1-10"', () => {
    expect(bucketTextLength(1)).toBe('1-10');
    expect(bucketTextLength(10)).toBe('1-10');
  });
  test('11-50 chars → "11-50"', () => {
    expect(bucketTextLength(11)).toBe('11-50');
    expect(bucketTextLength(50)).toBe('11-50');
  });
  test('51+ chars → "51+"', () => {
    expect(bucketTextLength(51)).toBe('51+');
    expect(bucketTextLength(10000)).toBe('51+');
  });
  test('negative length → "0"', () => {
    expect(bucketTextLength(-1)).toBe('0');
  });
});

describe('classifyClassPrefix (Z11g.d.0a §3.3)', () => {
  test('empty token list → null', () => {
    expect(classifyClassPrefix([])).toBeNull();
  });

  test('osui- (kebab-case) → "osui" (the Reactive-Web marker)', () => {
    expect(classifyClassPrefix(['osui-button'])).toBe('osui');
    expect(classifyClassPrefix(['osui-input-text', 'other-class'])).toBe('osui');
  });

  test('OS* PascalCase → "app-specific" (Traditional Web is out of scope)', () => {
    // Traditional-Web families (OS PascalCase utilities,
    // ThemeGrid_*, Menu_*, EPATaskbox_*, Feedback_*, fa-*,
    // RichWidgets_*) were removed when Z11g.d's rung-4 target
    // was scoped to Reactive only. They fall to 'app-specific'
    // like any other unknown token.
    expect(classifyClassPrefix(['OSFillParent'])).toBe('app-specific');
    expect(classifyClassPrefix(['ThemeGrid_Container'])).toBe('app-specific');
    expect(classifyClassPrefix(['Menu_DropDownButton'])).toBe('app-specific');
    expect(classifyClassPrefix(['EPATaskbox_Container'])).toBe('app-specific');
    expect(classifyClassPrefix(['Feedback_AjaxWait'])).toBe('app-specific');
    expect(classifyClassPrefix(['RichWidgets_wt10'])).toBe('app-specific');
    expect(classifyClassPrefix(['fa-angellist'])).toBe('app-specific');
  });

  test('unknown prefix → "app-specific"', () => {
    expect(classifyClassPrefix(['app-logo'])).toBe('app-specific');
    expect(classifyClassPrefix(['card'])).toBe('app-specific');
    expect(classifyClassPrefix(['home-banner'])).toBe('app-specific');
    expect(classifyClassPrefix(['os-icon'])).toBe('app-specific');
  });

  test('only the FIRST token determines family', () => {
    expect(classifyClassPrefix(['app-logo', 'osui-button'])).toBe('app-specific');
    expect(classifyClassPrefix(['osui-button', 'app-logo'])).toBe('osui');
  });
});

describe('isLabelClassified (Z11g.d.0a §3.4 PII discipline)', () => {
  test('<h1>..<h6> are label-like', () => {
    for (const tag of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) {
      expect(
        isLabelClassified({ tag, ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
      ).toBe(true);
    }
  });

  test('<button> is label-like', () => {
    expect(
      isLabelClassified({ tag: 'button', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(true);
  });

  test('<label> is label-like', () => {
    expect(
      isLabelClassified({ tag: 'label', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(true);
  });

  test('role="button" or role="heading" is label-like', () => {
    expect(
      isLabelClassified({ tag: 'div', ariaRole: 'button', hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(true);
    expect(
      isLabelClassified({ tag: 'span', ariaRole: 'heading', hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(true);
  });

  test('aria-label or aria-labelledby presence makes element label-like', () => {
    expect(
      isLabelClassified({ tag: 'div', ariaRole: null, hasAriaLabel: true, hasAriaLabelledBy: false }),
    ).toBe(true);
    expect(
      isLabelClassified({ tag: 'div', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: true }),
    ).toBe(true);
  });

  test('<div>/<span>/<td> without label-semantic markers are NOT label-like (PII safety)', () => {
    expect(
      isLabelClassified({ tag: 'div', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(false);
    expect(
      isLabelClassified({ tag: 'span', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(false);
    expect(
      isLabelClassified({ tag: 'td', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(false);
    expect(
      isLabelClassified({ tag: 'li', ariaRole: null, hasAriaLabel: false, hasAriaLabelledBy: false }),
    ).toBe(false);
  });
});

describe('classifyVariant (Z11g.d.0a §4.4)', () => {
  const FRAMEWORK_NONE = {
    reactDetected: false,
    angularDetected: false,
    vueDetected: false,
  } as const;

  const base: VariantClassifierSignals = {
    osuiClassCount: 0,
    osvstatePresent: false,
    ...FRAMEWORK_NONE,
  };

  test('Reactive: ≥3 osui-* + zero __OSVSTATE + framework marker', () => {
    const v = classifyVariant({
      ...base,
      osuiClassCount: 15,
      reactDetected: true,
    });
    expect(v.kind).toBe('reactive');
    if (v.kind === 'reactive') {
      expect(v.osuiClassCount).toBe(15);
      expect(v.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining('osui-* class count')]),
      );
    }
  });

  test('Reactive requires ALL three conditions', () => {
    // osui count below threshold → not-reactive
    expect(
      classifyVariant({ ...base, osuiClassCount: 2, reactDetected: true }).kind,
    ).toBe('not-reactive');
    // no framework marker → not-reactive
    expect(classifyVariant({ ...base, osuiClassCount: 10 }).kind).toBe(
      'not-reactive',
    );
    // __OSVSTATE present with strong osui-* signal → ambiguous
    expect(
      classifyVariant({
        ...base,
        osuiClassCount: 10,
        reactDetected: true,
        osvstatePresent: true,
      }).kind,
    ).toBe('ambiguous');
  });

  test('Ambiguous: osui-* strong AND __OSVSTATE present', () => {
    const v = classifyVariant({
      ...base,
      osuiClassCount: 10,
      osvstatePresent: true,
      reactDetected: true,
    });
    expect(v.kind).toBe('ambiguous');
    if (v.kind === 'ambiguous') {
      expect(v.conflictingEvidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining('reactive candidate'),
          expect.stringContaining('__OSVSTATE'),
        ]),
      );
    }
  });

  test('Not-reactive: no osui-* signal', () => {
    const v = classifyVariant(base);
    expect(v.kind).toBe('not-reactive');
  });

  test('Not-reactive (framework-only): React present but no osui- classes', () => {
    const v = classifyVariant({ ...base, reactDetected: true });
    expect(v.kind).toBe('not-reactive');
    if (v.kind === 'not-reactive') {
      expect(v.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining('osui-* count below threshold')]),
      );
    }
  });

  test('Not-reactive (osvstate-present): Traditional markers disqualify', () => {
    const v = classifyVariant({
      ...base,
      osuiClassCount: 0,
      osvstatePresent: true,
    });
    expect(v.kind).toBe('not-reactive');
    if (v.kind === 'not-reactive') {
      expect(v.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining('__OSVSTATE')]),
      );
    }
  });

  test('evidence fields are non-empty for every verdict', () => {
    const verdicts = [
      classifyVariant({ ...base }), // not-reactive
      classifyVariant({ ...base, osvstatePresent: true }), // not-reactive (traditional marker)
      classifyVariant({
        ...base,
        osuiClassCount: 5,
        reactDetected: true,
      }), // reactive
      classifyVariant({
        ...base,
        osuiClassCount: 5,
        osvstatePresent: true,
        reactDetected: true,
      }), // ambiguous
    ];
    for (const v of verdicts) {
      if (v.kind === 'ambiguous') {
        expect(v.conflictingEvidence.length).toBeGreaterThan(0);
      } else {
        expect(v.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});
