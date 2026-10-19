/**
 * Where kept code lands when the unit it followed is gone (a free region after
 * the last test.step or the last page-object member), and how flow steps are
 * keyed so re-recording a flow does not move kept code onto another action.
 */
import { describe, expect, it } from 'vitest';
import type { Facet, ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import { mergeTexts, renderFlow, renderPageObject, renderSpec } from '../../../src/emit/index.js';
import type { FlowRecording } from '../../../src/emit/index.js';
import { loginCatalog, loginRecording, policySearchCatalog, policySearchFacets, steps10001, testCase10001 } from './fixtures.js';

const replaceOnce = (text: string, from: string, to: string): string => {
  const at = text.indexOf(from);
  if (at === -1 || text.indexOf(from, at + 1) !== -1) throw new Error(`expected exactly one occurrence of: ${from}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
};

/** Bracket depth (outside strings) at the start of the first line containing `needle`. */
const depthAt = (text: string, needle: string): number => {
  const at = text.indexOf(needle);
  if (at === -1) throw new Error(`missing: ${needle}`);
  return [...text.slice(0, at).replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`|\/\/[^\n]*/g, '')].reduce(
    (depth, ch) => depth + ('([{'.includes(ch) ? 1 : ')]}'.includes(ch) ? -1 : 0),
    0,
  );
};

describe('free keep region after the last unit, when that unit is deleted', () => {
  it('spec: stays inside the test body after its step is removed in ADO', () => {
    const written = renderSpec({ testCase: testCase10001, steps: steps10001, catalogs: [policySearchCatalog], area: 'policy' }).text;
    const edited = replaceOnce(
      written,
      '    await expect(policySearch.resultRow(policyNumber)).toBeVisible();\n  });\n',
      "    await expect(policySearch.resultRow(policyNumber)).toBeVisible();\n  });\n\n  // tesseract:keep-start\n  await page.screenshot({ path: 'after-search.png' });\n  // tesseract:keep-end\n",
    );
    expect(depthAt(edited, 'await page.screenshot')).toBe(2);
    const shortened: TestCase = { ...testCase10001, revision: 2, steps: testCase10001.steps.filter((s) => s.index !== 4) };
    const shortenedSteps: readonly ResolvedStep[] = steps10001.filter((s) => s.index !== 4);
    const regenerated = renderSpec({ testCase: shortened, steps: shortenedSteps, catalogs: [policySearchCatalog], area: 'policy' }).text;
    const merged = mergeTexts(regenerated, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(depthAt(merged.text, 'await page.screenshot')).toBe(2);
    expect(merged.text).toContain(
      "    await policySearch.searchButton.click();\n  });\n  // tesseract:keep-start\n  await page.screenshot({ path: 'after-search.png' });\n  // tesseract:keep-end\n});\n",
    );
    expect(merged.text.trimEnd().endsWith('});')).toBe(true);
    // Stable on the next regeneration.
    expect(mergeTexts(regenerated, merged.text).text).toBe(merged.text);
  });

  it('page object: a hand-written getter at the end of the class stays in the class when the last facet is retired', () => {
    const written = renderPageObject('policy-search', policySearchCatalog.route, policySearchFacets, null).text;
    const edited = replaceOnce(
      written,
      '    return this.page.getByRole(\'row\').filter({ hasText: policyNumber });\n  }\n}\n',
      "    return this.page.getByRole('row').filter({ hasText: policyNumber });\n  }\n\n  // tesseract:keep-start\n  get toast(): Locator {\n    return this.page.getByRole('status');\n  }\n  // tesseract:keep-end\n}\n",
    );
    expect(depthAt(edited, 'get toast()')).toBe(1);
    const retired: readonly Facet[] = policySearchFacets.map((f) => (f.id === 'policy-search:results-table' ? { ...f, status: 'retired' as const } : f));
    const regenerated = renderPageObject('policy-search', policySearchCatalog.route, retired, null).text;
    const merged = mergeTexts(regenerated, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(depthAt(merged.text, 'get toast()')).toBe(1);
    expect(merged.text).not.toContain('resultRow(');
    expect(merged.text.trimEnd().endsWith('}')).toBe(true);
    expect(mergeTexts(regenerated, merged.text).text).toBe(merged.text);
  });

  it('a region at top level after the last unit stays at top level', () => {
    const written = renderSpec({ testCase: testCase10001, steps: steps10001, catalogs: [policySearchCatalog], area: 'policy' }).text;
    const edited = `${written}\n// tesseract:keep-start\nconst helperAtTopLevel = 1;\n// tesseract:keep-end\n`;
    const shortened: TestCase = { ...testCase10001, revision: 2, steps: testCase10001.steps.filter((s) => s.index !== 4) };
    const regenerated = renderSpec({ testCase: shortened, steps: steps10001.filter((s) => s.index !== 4), catalogs: [policySearchCatalog], area: 'policy' }).text;
    const merged = mergeTexts(regenerated, edited);
    expect(merged.orphaned).toEqual([]);
    expect(depthAt(merged.text, 'const helperAtTopLevel')).toBe(0);
  });
});

describe('flow keep units are keyed by action and facet, not by position', () => {
  const routes = { login: loginCatalog.route };
  const facets = new Map(loginCatalog.facets.map((f) => [f.id, f]));
  const url = 'https://qa.example.com/App/Login';
  /** Re-recorded: an extra click on the username field at position 2, so the login click becomes step 5. */
  const rerecorded: FlowRecording = {
    ...loginRecording,
    steps: [
      loginRecording.steps[0]!,
      { index: 2, action: 'click', facetId: 'login:username-input', screen: 'login', url },
      ...loginRecording.steps.slice(1).map((step) => ({ ...step, index: step.index + 1 })),
    ],
  };
  const written = renderFlow(loginRecording, facets, routes).text;

  it('a free region after the login click still follows the login click', () => {
    const edited = replaceOnce(
      written,
      '  await loginPage.logInButton.click();\n',
      "  await loginPage.logInButton.click();\n  // tesseract:keep-start\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n",
    );
    const merged = mergeTexts(renderFlow(rerecorded, facets, routes).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(merged.text).toContain(
      "  // step 5 — click login:log-in-button\n  await loginPage.logInButton.click();\n  // tesseract:keep-start\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n}",
    );
    expect(merged.text).toContain('  // step 4 — fill login:password-input\n  await loginPage.passwordInput.fill(params.password);\n  // step 5');
  });

  it('a kept step replaces the same action on the same facet, and no other step', () => {
    const edited = replaceOnce(
      written,
      '  // step 4 — click login:log-in-button\n  await loginPage.logInButton.click();\n',
      '  // tesseract:keep\n  // step 4 — click login:log-in-button\n  await loginPage.logInButton.click({ force: true });\n',
    );
    const merged = mergeTexts(renderFlow(rerecorded, facets, routes).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(merged.text).toContain('await loginPage.passwordInput.fill(params.password);');
    expect(merged.text.match(/logInButton\.click/g)).toHaveLength(1);
    // The kept body moves with its step; the comment is renumbered to the step's new position.
    expect(merged.text).toContain('  // tesseract:keep\n  // step 5 — click login:log-in-button\n  await loginPage.logInButton.click({ force: true });\n}');
    expect(mergeTexts(renderFlow(rerecorded, facets, routes).text, merged.text)).toEqual({ text: merged.text, orphaned: [], handEdited: false });
    const lines = merged.text.split('\n');
    expect(lines.indexOf('  await loginPage.logInButton.click({ force: true });')).toBeGreaterThan(lines.indexOf('  await loginPage.passwordInput.fill(params.password);'));
  });

  it('a kept step whose action changed is orphaned, not attached to whatever now sits at its position', () => {
    const edited = replaceOnce(
      written,
      '  // step 4 — click login:log-in-button\n  await loginPage.logInButton.click();\n',
      '  // tesseract:keep\n  // step 4 — click login:log-in-button\n  await loginPage.logInButton.click({ force: true });\n',
    );
    const pressed: FlowRecording = {
      ...loginRecording,
      steps: loginRecording.steps.map((step) => (step.index === 4 ? { ...step, action: 'press', value: { literal: 'Enter' } } : step)),
    };
    const merged = mergeTexts(renderFlow(pressed, facets, routes).text, edited);
    expect(merged.orphaned).toHaveLength(1);
    expect(merged.orphaned[0]).toContain('click login:log-in-button');
    expect(merged.text).toContain("await loginPage.logInButton.press('Enter');");
    expect(merged.text).toContain('//   await loginPage.logInButton.click({ force: true });');
  });

  it('a free region after a step whose action changed is orphaned, not moved in front of the new action', () => {
    const edited = replaceOnce(
      written,
      '  await loginPage.logInButton.click();\n',
      "  await loginPage.logInButton.click();\n  // tesseract:keep-start\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n",
    );
    const pressed: FlowRecording = {
      ...loginRecording,
      steps: loginRecording.steps.map((step) => (step.index === 4 ? { ...step, action: 'press', value: { literal: 'Enter' } } : step)),
    };
    const merged = mergeTexts(renderFlow(pressed, facets, routes).text, edited);
    expect(merged.orphaned).toHaveLength(1);
    expect(merged.text).not.toContain("\n  await page.waitForURL('**/Home');");
    expect(merged.text).toContain("//   await page.waitForURL('**/Home');");
    expect(merged.text).toContain("  // step 4 — press login:log-in-button\n  await loginPage.logInButton.press('Enter');\n}");
  });

  it('repeated identical steps keep their own kept code, in order', () => {
    const twice: FlowRecording = {
      ...loginRecording,
      steps: [...loginRecording.steps, { index: 5, action: 'click', facetId: 'login:log-in-button', screen: 'login', url }],
    };
    const first = renderFlow(twice, facets, routes).text;
    const edited = replaceOnce(
      first,
      '  // step 5 — click login:log-in-button\n  await loginPage.logInButton.click();\n',
      "  // step 5 — click login:log-in-button\n  await loginPage.logInButton.click();\n  // tesseract:keep-start\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n",
    );
    const shifted: FlowRecording = {
      ...twice,
      steps: [twice.steps[0]!, { index: 2, action: 'click', facetId: 'login:username-input', screen: 'login', url }, ...twice.steps.slice(1).map((s) => ({ ...s, index: s.index + 1 }))],
    };
    const merged = mergeTexts(renderFlow(shifted, facets, routes).text, edited);
    expect(merged.orphaned).toEqual([]);
    expect(merged.text).toContain(
      "  // step 6 — click login:log-in-button\n  await loginPage.logInButton.click();\n  // tesseract:keep-start\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n}",
    );
  });
});
