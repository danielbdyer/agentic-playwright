import { describe, expect, it } from 'vitest';
import {
  PATTERNS,
  classifyStep,
  controlInRowByCellText,
  dialogButtonByName,
  formContextSubmit,
  indexCandidates,
  interactiveByContent,
  linkInNavLandmark,
  matchContext,
  matchPatterns,
  roleAndNameExact,
  roleAndNameInLandmark,
  roleAndNameSubstring,
  rolesAdmittedBy,
  singleTextboxInForm,
  statusOrAlertByName,
  substituteParams,
  textboxByPlaceholder,
} from '../../../src/resolve/index.js';
import type { Candidate } from '../../../src/contract/schemas.js';
import { candidate, landmark, policySearchPage } from './fixtures.js';

const ctxFor = (action: string, candidates: readonly Candidate[], params: readonly string[] = [], values?: Record<string, string>) =>
  matchContext(classifyStep(action, '', params), candidates, values === undefined ? {} : { params: values });

describe('registry', () => {
  it('keeps v1 order: 8 patterns, 10 distinct matchers plus the shared role+name pair', () => {
    expect(PATTERNS.map((p) => p.id)).toEqual([
      'row-scoped-control',
      'dialog-confirmation',
      'navigation-link-by-name',
      'form-submission',
      'field-input-by-label',
      'observation-by-assertion-phrase',
      'locator-by-role-and-name',
      'content-named-interactive',
    ]);
    const matchers = new Set(PATTERNS.flatMap((p) => p.matchers));
    expect(matchers.size).toBe(11);
  });

  it('returns every pattern\'s match, de-duplicated by ref, first pattern wins', () => {
    const page = policySearchPage();
    const matches = matchPatterns(classifyStep('Click Search button', '', []), page);
    // form-submission and locator-by-role-and-name both name c10; only the first is kept.
    expect(matches).toEqual([
      expect.objectContaining({ ref: 'c10', patternId: 'form-submission', matcherId: 'role-and-name-exact', matcherIndex: 0 }),
    ]);
  });

  it('reaches the roleless Filter only through the content floor', () => {
    const matches = matchPatterns(classifyStep('Click Filter', '', []), policySearchPage());
    expect(matches.map((m) => [m.ref, m.patternId])).toEqual([['c11', 'content-named-interactive']]);
  });

  it('matches a parameterized row once values are supplied, and nothing without them', () => {
    const intent = classifyStep('Click View in the row for @policyNumber', '', ['policyNumber']);
    expect(matchPatterns(intent, policySearchPage(), { params: { policyNumber: 'POL-002' } })[0]).toMatchObject({
      ref: 'c16',
      patternId: 'row-scoped-control',
    });
    expect(matchPatterns(intent, policySearchPage()).filter((m) => m.patternId === 'row-scoped-control')).toEqual([]);
  });

  it('rolesAdmittedBy admits the text-entry family for textbox', () => {
    expect(rolesAdmittedBy('textbox')).toEqual(['textbox', 'searchbox', 'spinbutton', 'combobox']);
    expect(rolesAdmittedBy('checkbox')).toContain('switch');
    expect(rolesAdmittedBy('button')).toEqual(['button']);
  });

  it('substitutes @param values case-insensitively and leaves unknown ones', () => {
    expect(substituteParams('row for @PolicyNumber', { policyNumber: 'POL-1' })).toBe('row for POL-1');
    expect(substituteParams('@missing', { policyNumber: 'POL-1' })).toBe('@missing');
    expect(substituteParams(null, { a: 'b' })).toBeNull();
  });
});

describe('fix: role-and-name-in-landmark admits the role family', () => {
  const page: Candidate[] = [
    landmark('s', 'search'),
    candidate({ ref: 'sb', role: 'searchbox', name: 'Search', tag: 'input', inputType: 'search', landmark: 'search' }),
    candidate({ ref: 'tb', role: 'textbox', name: 'Search', tag: 'input' }),
  ];

  it('finds a searchbox in the search landmark for a "search field" fill', () => {
    const ctx = ctxFor('Enter POL-001 in the search field', page);
    expect(ctx.role).toBe('textbox');
    expect(roleAndNameInLandmark(ctx)).toMatchObject({ ref: 'sb', matcherId: 'role-and-name-in-landmark' });
    expect(matchPatterns(ctx.intent, page)[0]).toMatchObject({ ref: 'sb', patternId: 'field-input-by-label', matcherIndex: 0 });
  });

  it('declines without a cue, and declines when the cue names a landmark the page lacks', () => {
    const noSearchLandmark = [candidate({ ref: 'sb', role: 'searchbox', name: 'Search', tag: 'input' })];
    expect(roleAndNameInLandmark(ctxFor('Enter POL-001 in the Search field', noSearchLandmark))).toBeNull();
    expect(roleAndNameInLandmark(ctxFor('Enter X in the Name field', page))).toBeNull();
  });

  it('still knows a candidate is in the landmark when the cap dropped the landmark node', () => {
    expect(roleAndNameInLandmark(ctxFor('Enter POL-001 in the search field', page.slice(1)))).toMatchObject({ ref: 'sb' });
  });
});

describe('fix: every landmark of a role is iterated', () => {
  const page: Candidate[] = [
    landmark('n1', 'navigation', 'Main'),
    candidate({ ref: 'h1', role: 'link', name: 'Home', tag: 'a', landmark: 'navigation', landmarkName: 'Main' }),
    landmark('n2', 'navigation', 'Section'),
    candidate({ ref: 'h2', role: 'link', name: 'Home', tag: 'a', landmark: 'navigation', landmarkName: 'Section' }),
    candidate({ ref: 'r2', role: 'link', name: 'Reports', tag: 'a', landmark: 'navigation', landmarkName: 'Section' }),
  ];

  it('finds a link that only the second navigation holds', () => {
    expect(indexCandidates(page).landmarksOf('navigation').map((l) => l.name)).toEqual(['Main', 'Section']);
    expect(linkInNavLandmark(ctxFor('Click Reports', page))).toMatchObject({ ref: 'r2' });
  });

  it('declines when two navigations each hold one', () => {
    expect(linkInNavLandmark(ctxFor('Click Home', page))).toBeNull();
  });

  it('nests: a link in a nav inside the banner is inside the banner', () => {
    const nested: Candidate[] = [
      landmark('b', 'banner'),
      landmark('n', 'navigation', 'Top', { landmark: 'banner' }),
      candidate({ ref: 'l', role: 'link', name: 'Profile', tag: 'a', landmark: 'navigation', landmarkName: 'Top' }),
      candidate({ ref: 'l2', role: 'link', name: 'Profile settings', tag: 'a' }),
    ];
    const index = indexCandidates(nested);
    expect(index.byRef.get('l')?.landmarks.map((l) => l.role)).toEqual(['navigation', 'banner']);
    expect(roleAndNameInLandmark(ctxFor('Click the Profile link in the header', nested))).toMatchObject({ ref: 'l' });
  });
});

describe('fix: dialogs and forms', () => {
  const page: Candidate[] = [
    candidate({ ref: 'ok0', role: 'button', name: 'OK' }),
    landmark('d', 'dialog', 'Delete policy?'),
    candidate({ ref: 'ok1', role: 'button', name: 'OK', landmark: 'dialog', landmarkName: 'Delete policy?' }),
    candidate({ ref: 'cancel', role: 'button', name: 'Cancel', landmark: 'dialog', landmarkName: 'Delete policy?' }),
  ];

  it('finds a button inside the dialog by the scope the walker reports', () => {
    expect(dialogButtonByName(ctxFor('Click OK', page))).toMatchObject({ ref: 'ok1' });
    expect(matchPatterns(classifyStep('Click OK in the confirmation dialog', '', []), page)[0]).toMatchObject({
      ref: 'ok1',
      patternId: 'dialog-confirmation',
    });
  });

  it('a form-like container is a named form, the search landmark, or a dialog', () => {
    const form: Candidate[] = [
      landmark('f', 'form', 'Quote'),
      candidate({ ref: 'qty', role: 'spinbutton', name: 'Quantity', tag: 'input', inputType: 'number', landmark: 'form', landmarkName: 'Quote' }),
      candidate({ ref: 'go', role: 'button', name: 'Get quote', landmark: 'form', landmarkName: 'Quote' }),
      candidate({ ref: 'other', role: 'textbox', name: 'Newsletter email', tag: 'input' }),
    ];
    // single-textbox-in-form admits the family (fix: v1 compared role === 'textbox' and missed the spinbutton).
    expect(singleTextboxInForm(ctxFor('Enter 5', form))).toMatchObject({ ref: 'qty' });
    expect(formContextSubmit(ctxFor('Click Submit', form))).toMatchObject({ ref: 'go' });
    // An unnamed <form> is no landmark: with no form-like scope the matchers decline.
    const unnamed = form.map((c) => ({ ...c, landmark: undefined, landmarkName: undefined })).filter((c) => c.ref !== 'f') as Candidate[];
    expect(singleTextboxInForm(ctxFor('Enter 5', unnamed))).toBeNull();
    expect(formContextSubmit(ctxFor('Click Submit', unnamed))).toBeNull();
  });

  it('the search landmark counts as a form for the only-button rule', () => {
    expect(formContextSubmit(ctxFor('Click Search', policySearchPage()))).toMatchObject({ ref: 'c10' });
  });
});

describe('fix: a nested footer is not contentinfo', () => {
  // TodoMVC: <section><footer>…</footer></section> — the walker reports no landmark at all.
  const page: Candidate[] = [
    candidate({ ref: 'all', role: 'link', name: 'All', tag: 'a' }),
    candidate({ ref: 'active', role: 'link', name: 'Active', tag: 'a' }),
    candidate({ ref: 'done', role: 'link', name: 'Completed', tag: 'a' }),
  ];

  it('the in-landmark matcher declines and the page-wide matchers still resolve', () => {
    const intent = classifyStep('Click the Active filter link in the footer', '', []);
    expect(intent.landmarkCue).toBe('contentinfo');
    const ctx = matchContext(intent, page);
    expect(roleAndNameInLandmark(ctx)).toBeNull();
    // "Active filter" is not a substring of "Active"; the floor needs the phrase, so the exact rung on "Active" is what an agent would use.
    const plain = matchContext(classifyStep('Click the Active link in the footer', '', []), page);
    expect(matchPatterns(plain.intent, page)[0]).toMatchObject({ ref: 'active', patternId: 'locator-by-role-and-name', matcherId: 'role-and-name-exact' });
  });
});

describe('the other matchers', () => {
  it('role-and-name-exact and -substring need a unique hit', () => {
    const page = policySearchPage();
    expect(roleAndNameExact(ctxFor('Click the View link', page))).toBeNull();
    expect(roleAndNameExact(ctxFor('Click the Claims link', page))).toMatchObject({ ref: 'c5' });
    expect(roleAndNameSubstring(ctxFor('Click the Polic link', page))).toMatchObject({ ref: 'c4' });
  });

  it('textbox-by-placeholder: exact placeholder first, then containment', () => {
    const page: Candidate[] = [
      candidate({ ref: 'a', role: 'textbox', name: 'Search', placeholder: 'Find a policy', tag: 'input' }),
      candidate({ ref: 'b', role: 'textbox', name: 'Lookup', placeholder: 'Find a policy by holder', tag: 'input' }),
    ];
    expect(textboxByPlaceholder(ctxFor('Enter X in the Find a policy field', page))).toMatchObject({ ref: 'a', rationale: expect.stringContaining('equals') });
    expect(textboxByPlaceholder(ctxFor('Enter X in the by holder field', page))).toMatchObject({ ref: 'b' });
  });

  it('status-or-alert-by-name infers the role from success or error wording', () => {
    const page: Candidate[] = [
      candidate({ ref: 'alert', role: 'alert', name: 'Invalid policy number', interactive: false, affordance: 'none', tag: 'div' }),
      candidate({ ref: 'status', role: 'status', name: 'Saved', interactive: false, affordance: 'none', tag: 'div' }),
    ];
    expect(statusOrAlertByName(ctxFor('Verify an error is shown', page))).toMatchObject({ ref: 'alert' });
    expect(statusOrAlertByName(ctxFor('Verify the success message appears', page))).toMatchObject({ ref: 'status' });
    expect(statusOrAlertByName(ctxFor('Click Save', page))).toBeNull();
    // OutSystems .feedback-message: a non-interactive generic.
    expect(statusOrAlertByName(ctxFor('Verify the success message appears', policySearchPage()))).toMatchObject({ ref: 'c18' });
  });

  it('control-in-row-by-cell-text uses bounded containment so POL-001 is not POL-0010', () => {
    const page: Candidate[] = [
      candidate({ ref: 'r1', role: 'row', name: 'POL-001 Smith', interactive: false, affordance: 'none', tag: 'tr' }),
      candidate({ ref: 'x1', role: 'checkbox', name: '', tag: 'input', rowText: 'POL-001 Smith' }),
      candidate({ ref: 'r2', role: 'row', name: 'POL-0010 Jones', interactive: false, affordance: 'none', tag: 'tr' }),
      candidate({ ref: 'x2', role: 'checkbox', name: '', tag: 'input', rowText: 'POL-0010 Jones' }),
    ];
    expect(controlInRowByCellText(ctxFor('Check the checkbox in the row for POL-001', page))).toMatchObject({ ref: 'x1' });
    expect(controlInRowByCellText(ctxFor('Verify the row for POL-0010 is visible', page))).toMatchObject({ ref: 'r2' });
    expect(controlInRowByCellText(ctxFor('Check the checkbox in the row for POL-00', page))).toBeNull();
  });

  it('control-in-row-by-cell-text declines when two rows share the text', () => {
    const page: Candidate[] = [
      candidate({ ref: 'r1', role: 'row', name: 'Same', interactive: false, affordance: 'none', tag: 'tr' }),
      candidate({ ref: 'r2', role: 'row', name: 'Same', interactive: false, affordance: 'none', tag: 'tr' }),
    ];
    expect(controlInRowByCellText(ctxFor('Verify the row for Same is visible', page))).toBeNull();
  });

  it('interactive-by-content ignores the role hint and skips non-interactive text', () => {
    const page: Candidate[] = [
      candidate({ ref: 'label', role: 'generic', name: 'Filter', interactive: false, affordance: 'none', tag: 'span' }),
      candidate({ ref: 'owner', role: 'generic', name: 'Filter', affordance: 'handler-owner', tag: 'div' }),
    ];
    expect(interactiveByContent(ctxFor('Click the Filter button', page))).toMatchObject({ ref: 'owner' });
  });
});
