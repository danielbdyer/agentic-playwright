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

  test('osui- (kebab-case) → "osui"', () => {
    expect(classifyClassPrefix(['osui-button'])).toBe('osui');
    expect(classifyClassPrefix(['osui-input-text', 'other-class'])).toBe('osui');
  });

  test('OS* PascalCase → "os" (distinct from osui-)', () => {
    expect(classifyClassPrefix(['OSFillParent'])).toBe('os');
    expect(classifyClassPrefix(['OSInline'])).toBe('os');
    expect(classifyClassPrefix(['OSAutoMarginTop'])).toBe('os');
  });

  test('"os" alone (lowercase) is not an OS-family match — app-specific', () => {
    // Guards against false-positive for app classes like "os-icon"
    // that happen to start with "os" but aren't the PascalCase OS
    // utility convention.
    expect(classifyClassPrefix(['os-icon'])).toBe('app-specific');
    expect(classifyClassPrefix(['osmetic'])).toBe('app-specific');
  });

  test('ThemeGrid_* → "theme-grid"', () => {
    expect(classifyClassPrefix(['ThemeGrid_Container'])).toBe('theme-grid');
    expect(classifyClassPrefix(['ThemeGrid_Width10'])).toBe('theme-grid');
  });

  test('Menu_* → "menu"', () => {
    expect(classifyClassPrefix(['Menu_DropDownButton'])).toBe('menu');
    expect(classifyClassPrefix(['Menu_TopMenu'])).toBe('menu');
  });

  test('EPATaskbox_* → "epa-taskbox"', () => {
    expect(classifyClassPrefix(['EPATaskbox_Container'])).toBe('epa-taskbox');
  });

  test('Feedback_* → "feedback"', () => {
    expect(classifyClassPrefix(['Feedback_AjaxWait'])).toBe('feedback');
  });

  test('RichWidgets_* → "rich-widgets"', () => {
    expect(classifyClassPrefix(['RichWidgets_wt10'])).toBe('rich-widgets');
  });

  test('fa / fa-* → "fa"', () => {
    expect(classifyClassPrefix(['fa'])).toBe('fa');
    expect(classifyClassPrefix(['fa-angellist'])).toBe('fa');
  });

  test('unknown prefix → "app-specific"', () => {
    expect(classifyClassPrefix(['app-logo'])).toBe('app-specific');
    expect(classifyClassPrefix(['card'])).toBe('app-specific');
    expect(classifyClassPrefix(['home-banner'])).toBe('app-specific');
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
    osPascalClassCount: 0,
    osvstatePresent: false,
    mobileMarkerPresent: false,
    ...FRAMEWORK_NONE,
  };

  test('Reactive: ≥3 osui-* + zero __OSVSTATE + React marker', () => {
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

  test('Reactive requires ALL three: count ≥3, no __OSVSTATE, framework marker', () => {
    // osui count below threshold
    expect(classifyVariant({ ...base, osuiClassCount: 2, reactDetected: true }).kind).not.toBe('reactive');
    // no framework marker
    expect(classifyVariant({ ...base, osuiClassCount: 10 }).kind).not.toBe('reactive');
    // __OSVSTATE present → ambiguous, not reactive
    expect(
      classifyVariant({
        ...base,
        osuiClassCount: 10,
        reactDetected: true,
        osvstatePresent: true,
        osPascalClassCount: 5,
      }).kind,
    ).toBe('ambiguous');
  });

  test('Traditional: __OSVSTATE + ≥1 OS* PascalCase class', () => {
    const v = classifyVariant({
      ...base,
      osvstatePresent: true,
      osPascalClassCount: 8,
    });
    expect(v.kind).toBe('traditional');
    if (v.kind === 'traditional') {
      expect(v.osvstatePresent).toBe(true);
    }
  });

  test('Mobile: mobile-marker presence is sufficient', () => {
    const v = classifyVariant({ ...base, mobileMarkerPresent: true });
    expect(v.kind).toBe('mobile');
  });

  test('Ambiguous: conflicting signals (Reactive + Traditional) → ambiguous with evidence', () => {
    const v = classifyVariant({
      ...base,
      osuiClassCount: 10,
      osPascalClassCount: 10,
      osvstatePresent: true,
      reactDetected: true,
    });
    expect(v.kind).toBe('ambiguous');
    if (v.kind === 'ambiguous') {
      expect(v.conflictingEvidence.length).toBeGreaterThanOrEqual(2);
      expect(v.conflictingEvidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining('reactive candidate'),
          expect.stringContaining('traditional candidate'),
        ]),
      );
    }
  });

  test('Not-OS: no OS markers + no frameworks', () => {
    const v = classifyVariant(base);
    expect(v.kind).toBe('not-os');
  });

  test('Not-OS (framework-only): React present but no OS classes', () => {
    const v = classifyVariant({ ...base, reactDetected: true });
    expect(v.kind).toBe('not-os');
    if (v.kind === 'not-os') {
      expect(v.evidence).toEqual(
        expect.arrayContaining([expect.stringContaining('React present')]),
      );
    }
  });

  test('evidence fields are non-empty for every verdict', () => {
    // Every verdict kind must carry at least one piece of
    // evidence so post-hoc review is possible.
    const verdicts = [
      classifyVariant({ ...base }), // not-os
      classifyVariant({ ...base, osvstatePresent: true, osPascalClassCount: 1 }), // traditional
      classifyVariant({
        ...base,
        osuiClassCount: 5,
        reactDetected: true,
      }), // reactive
      classifyVariant({ ...base, mobileMarkerPresent: true }), // mobile
      classifyVariant({
        ...base,
        osuiClassCount: 5,
        osPascalClassCount: 5,
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
