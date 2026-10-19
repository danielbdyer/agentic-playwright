import { describe, expect, it } from 'vitest';
import type { ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import { isToolError } from '../../../src/core/errors.js';
import {
  checkGenerated,
  generatedHash,
  mergeTexts,
  mergeWithExisting,
  renderFlow,
  renderPageObject,
  renderSpec,
  sameGeneratedContent,
  stampHash,
} from '../../../src/emit/index.js';
import type { SpecInput } from '../../../src/emit/index.js';
import { facet, loginCatalog, loginRecording, policySearchCatalog, policySearchFacets, steps10001, testCase10001 } from './fixtures.js';

const base: SpecInput = { testCase: testCase10001, steps: steps10001, catalogs: [policySearchCatalog], area: 'policy' };

/** Revision 2 of 10001: step 3 reworded, step 2's expected result changed. */
const rev2: TestCase = {
  ...testCase10001,
  revision: 2,
  contentHash: 'sha256:2222',
  steps: testCase10001.steps.map((s) =>
    s.index === 3 ? { ...s, action: 'Click the Search button' } : s.index === 2 ? { ...s, expected: 'The policy number is shown in the field' } : s,
  ),
};
const rev2Steps: readonly ResolvedStep[] = steps10001.map((s) => (s.index === 3 ? { ...s, actionText: 'Click the Search button' } : s));

/** Revision 3 of 10001: step 3 removed. */
const rev3: TestCase = { ...testCase10001, revision: 3, steps: testCase10001.steps.filter((s) => s.index !== 3).map((s) => (s.index === 4 ? { ...s, index: 3 } : s)) };
const rev3Steps: readonly ResolvedStep[] = steps10001.filter((s) => s.index !== 3).map((s) => (s.index === 4 ? { ...s, index: 3 } : s));

const replaceOnce = (text: string, from: string, to: string): string => {
  const at = text.indexOf(from);
  if (at === -1 || text.indexOf(from, at + 1) !== -1) throw new Error(`expected exactly one occurrence of: ${from}`);
  return text.slice(0, at) + to + text.slice(at + from.length);
};

const familyOf = (fn: () => unknown): string => {
  try {
    fn();
    return 'none';
  } catch (error) {
    return isToolError(error) ? error.family : 'thrown';
  }
};

describe('hash line', () => {
  it('is a 12-hex sha256 prefix over the file without its hash line, and stamping is idempotent', () => {
    const text = renderSpec(base).text;
    expect(text.split('\n')[2]).toMatch(/^\/\/ tesseract:generated sha256:[0-9a-f]{12}$/);
    expect(stampHash(text)).toBe(text);
    expect(stampHash(text.replace(/sha256:[0-9a-f]{12}/, 'sha256:000000000000'))).toBe(text);
    expect(checkGenerated(text)).toEqual({ stamped: true, intact: true });
  });

  it('ignores formatting: quotes, indentation, semicolons, trailing commas, line wrapping', () => {
    const text = renderSpec(base).text;
    const prettier = text
      .replace(/'([^'"\\\n]*)'/g, '"$1"')
      .replace(/^( +)/gm, (spaces) => spaces + spaces)
      .replace(/^(?!\s*\/\/)(.*);$/gm, '$1')
      .replace("await test.step(\"Click Search button\", async () => {", 'await test.step(\n    "Click Search button",\n    async () => {')
      .replace("{ type: \"ado-id\", description: \"10001\" },", '{\n      type: "ado-id",\n      description: "10001",\n    },');
    expect(prettier).not.toBe(text);
    expect(generatedHash(prettier)).toBe(generatedHash(text));
    expect(sameGeneratedContent(prettier, text)).toBe(true);
    const merged = mergeWithExisting(text, prettier);
    expect(merged.handEdited).toBe(false);
    expect(sameGeneratedContent(prettier, merged.text)).toBe(true);
  });

  it('notices a changed literal', () => {
    const text = renderSpec(base).text;
    expect(generatedHash(text.replace("'POL-001'", "'POL-002'"))).not.toBe(generatedHash(text));
    expect(sameGeneratedContent(text, text.replace("'POL-001'", "'POL 001'"))).toBe(false);
    expect(checkGenerated(text.replace("'POL-001'", "'POL-002'"))).toEqual({ stamped: true, intact: false });
  });
});

describe('mergeWithExisting — spec', () => {
  const written = mergeWithExisting(renderSpec(base).text, null).text;

  it('a fresh file is the rendered text; re-merging an untouched file changes nothing', () => {
    expect(written).toBe(renderSpec(base).text);
    const again = mergeWithExisting(renderSpec(base).text, written);
    expect(again).toEqual({ text: written, orphaned: [], handEdited: false });
  });

  it('keep regions survive a new ADO revision: kept step bodies stay, titles and expected text follow ADO', () => {
    const edited = replaceOnce(
      replaceOnce(
        written,
        '    await policySearch.searchButton.click();\n',
        "    await policySearch.searchButton.click();\n    // tesseract:keep-start\n    await page.waitForLoadState('networkidle');\n    // tesseract:keep-end\n",
      ),
      '  const policySearch = new PolicySearchPage(page);\n',
      '  const policySearch = new PolicySearchPage(page);\n  // tesseract:keep-start viewport\n  await page.setViewportSize({ width: 1600, height: 900 });\n  // tesseract:keep-end\n',
    );
    const merged = mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(merged.text).toContain("{ type: 'ado-revision', description: '2' },");
    expect(merged.text).toContain(
      [
        '  const policySearch = new PolicySearchPage(page);',
        '  // tesseract:keep-start viewport',
        '  await page.setViewportSize({ width: 1600, height: 900 });',
        '  // tesseract:keep-end',
        '',
        "  await test.step('Navigate to Policy Search screen', async () => {",
      ].join('\n'),
    );
    expect(merged.text).toContain(
      [
        "  await test.step('Click the Search button', async () => {",
        '    // Expected: Search runs',
        '    await policySearch.searchButton.click();',
        '    // tesseract:keep-start',
        "    await page.waitForLoadState('networkidle');",
        '    // tesseract:keep-end',
        '  });',
      ].join('\n'),
    );
    expect(merged.text).toContain('    // Expected: The policy number is shown in the field');
    // Stable: merging the same generation again changes nothing.
    expect(mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, merged.text).text).toBe(merged.text);
  });

  it('a free region keeps its place and the blank lines around it', () => {
    const edited = replaceOnce(
      written,
      "  await test.step('Click Search button', async () => {\n",
      "  // tesseract:keep-start\n  await page.screenshot({ path: 'before-search.png' });\n  // tesseract:keep-end\n\n  await test.step('Click Search button', async () => {\n",
    );
    const merged = mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, edited);
    expect(merged.text).toContain(
      "    await policySearch.policyNumberInput.fill(policyNumber);\n  });\n\n  // tesseract:keep-start\n  await page.screenshot({ path: 'before-search.png' });\n  // tesseract:keep-end\n\n  await test.step('Click the Search button', async () => {",
    );
    expect(mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, merged.text).text).toBe(merged.text);
  });

  it('a stray // tesseract:keep with nothing under it is harmless', () => {
    const edited = replaceOnce(written, '  const policySearch = new PolicySearchPage(page);\n', '  const policySearch = new PolicySearchPage(page);\n  // tesseract:keep\n');
    const merged = mergeWithExisting(renderSpec(base).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual([]);
    expect(merged.text).toBe(stampHash(edited));
  });

  it('a whole step kept with the shorthand keeps its edited body; its title still follows ADO', () => {
    const edited = replaceOnce(
      replaceOnce(written, "  await test.step('Click Search button', async () => {\n", "  // tesseract:keep\n  await test.step('Click Search button', async () => {\n"),
      '    await policySearch.searchButton.click();\n',
      '    await policySearch.searchButton.dblclick();\n',
    );
    const merged = mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.text).toContain("  // tesseract:keep\n  await test.step('Click the Search button', async () => {\n    // Expected: Search runs\n    await policySearch.searchButton.dblclick();\n  });");
    expect(merged.text).not.toContain('searchButton.click()');
  });

  it('a region wrapping a whole step is kept byte for byte in the step’s place, with no duplicate', () => {
    const edited = replaceOnce(
      written,
      "  await test.step('Click Search button', async () => {\n    // Expected: Search runs\n    await policySearch.searchButton.click();\n  });\n",
      "  // tesseract:keep-start\n  await test.step('Click Search button', async () => {\n    // Expected: Search runs\n    await policySearch.searchButton.click({ force: true });\n  });\n  // tesseract:keep-end\n",
    );
    const merged = mergeWithExisting(renderSpec(base).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.text).toBe(edited.replace(/sha256:[0-9a-f]{12}/, `sha256:${generatedHash(merged.text)}`));
    expect(merged.text.match(/Click Search button/g)).toHaveLength(1);
  });

  it('kept code whose step was removed in ADO is appended as an orphaned block, and stays put afterwards', () => {
    const edited = replaceOnce(
      written,
      '    await policySearch.searchButton.click();\n',
      "    await policySearch.searchButton.click();\n    // tesseract:keep-start\n    await expect(page.getByRole('status')).toHaveText('Searching');\n    // tesseract:keep-end\n",
    );
    const generated = renderSpec({ ...base, testCase: rev3, steps: rev3Steps }).text;
    const merged = mergeWithExisting(generated, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.orphaned).toEqual(['step-4']);
    expect(merged.text).not.toMatch(/^ {2}await test\.step\('Click Search button'/m);
    expect(merged.text.endsWith(
      [
        '});',
        '',
        '// tesseract:keep-start orphaned step-4',
        '// tesseract:orphaned step-4 — kept code whose step or member is no longer generated; reuse what you need, then delete this block.',
        "//   await test.step('Click Search button', async () => {",
        '//     // Expected: Search runs',
        '//     await policySearch.searchButton.click();',
        '//     // tesseract:keep-start',
        "//     await expect(page.getByRole('status')).toHaveText('Searching');",
        '//     // tesseract:keep-end',
        '//   });',
        '// tesseract:keep-end',
        '',
      ].join('\n'),
    )).toBe(true);
    const again = mergeWithExisting(generated, merged.text);
    expect(again.text).toBe(merged.text);
    expect(again.orphaned).toEqual([]);
    expect(again.handEdited).toBe(false);
  });

  it('limitation: a generated line rewritten inside a new keep region, in a step ADO then removed, cannot be verified; force orphans it intact', () => {
    const edited = replaceOnce(
      written,
      '    await policySearch.searchButton.click();\n',
      "    // tesseract:keep-start\n    await policySearch.searchButton.click({ force: true });\n    // tesseract:keep-end\n",
    );
    const generated = renderSpec({ ...base, testCase: rev3, steps: rev3Steps }).text;
    expect(familyOf(() => mergeWithExisting(generated, edited))).toBe('conflict');
    const forced = mergeWithExisting(generated, edited, { force: true });
    expect(forced.orphaned).toEqual(['step-4']);
    expect(forced.text).toContain('//     await policySearch.searchButton.click({ force: true });');
    // The same rewrite in a step that is still generated the same way verifies fine.
    expect(mergeWithExisting(renderSpec(base).text, edited).handEdited).toBe(false);
  });

  it('an edit outside keep regions is a conflict; force discards it but keeps kept code', () => {
    const edited = replaceOnce(
      replaceOnce(written, 'fill(policyNumber)', "fill('HAND-EDIT')"),
      '    await policySearch.searchButton.click();\n',
      "    await policySearch.searchButton.click();\n    // tesseract:keep-start\n    await page.waitForTimeout(100);\n    // tesseract:keep-end\n",
    );
    expect(familyOf(() => mergeWithExisting(renderSpec(base).text, edited))).toBe('conflict');
    const forced = mergeWithExisting(renderSpec(base).text, edited, { force: true });
    expect(forced.handEdited).toBe(true);
    expect(forced.text).toContain('fill(policyNumber)');
    expect(forced.text).not.toContain('HAND-EDIT');
    expect(forced.text).toContain('    await page.waitForTimeout(100);');
    expect(mergeTexts(renderSpec(base).text, edited).handEdited).toBe(true);
  });

  it('deleting a generated step without a keep marker is a hand edit', () => {
    const edited = replaceOnce(written, "  await test.step('Click Search button', async () => {\n    // Expected: Search runs\n    await policySearch.searchButton.click();\n  });\n\n", '');
    expect(mergeTexts(renderSpec(base).text, edited).handEdited).toBe(true);
  });

  it('a file without a tesseract:generated line is not ours: conflict unless forced', () => {
    expect(familyOf(() => mergeWithExisting(renderSpec(base).text, "import { test } from '@playwright/test';\ntest('mine', async () => {});\n"))).toBe('conflict');
  });

  it('malformed keep markers are a conflict even with force', () => {
    const unclosed = replaceOnce(written, '    await policySearch.searchButton.click();\n', '    // tesseract:keep-start\n    await policySearch.searchButton.click();\n');
    const stray = replaceOnce(written, '    await policySearch.searchButton.click();\n', '    await policySearch.searchButton.click();\n    // tesseract:keep-end\n');
    const nested = replaceOnce(
      written,
      '    await policySearch.searchButton.click();\n',
      '    // tesseract:keep-start\n    // tesseract:keep-start\n    await policySearch.searchButton.click();\n    // tesseract:keep-end\n    // tesseract:keep-end\n',
    );
    for (const text of [unclosed, stray, nested]) {
      expect(familyOf(() => mergeWithExisting(renderSpec(base).text, text, { force: true }))).toBe('conflict');
    }
  });

  it('kept lines pasted with any indentation stay inside their step', () => {
    const edited = replaceOnce(
      written,
      '    await policySearch.searchButton.click();\n',
      '    await policySearch.searchButton.click();\n    // tesseract:keep-start\nawait page.waitForTimeout(1);\n  await page.waitForTimeout(2);\n    // tesseract:keep-end\n',
    );
    const merged = mergeWithExisting(renderSpec({ ...base, testCase: rev2, steps: rev2Steps }).text, edited);
    expect(merged.text).toContain("  await test.step('Click the Search button', async () => {\n    // Expected: Search runs\n    await policySearch.searchButton.click();\n    // tesseract:keep-start\nawait page.waitForTimeout(1);\n  await page.waitForTimeout(2);\n    // tesseract:keep-end\n  });");
  });

  it('kept bodies follow the step when a case gains data rows (re-indented into the describe)', () => {
    const edited = replaceOnce(
      written,
      '    await policySearch.searchButton.click();\n',
      "    // tesseract:keep-start\n    await policySearch.searchButton.click({ force: true });\n    // tesseract:keep-end\n",
    );
    const multi = { ...testCase10001, dataRows: [{ policyNumber: 'POL-001' }, { policyNumber: 'POL-002' }] };
    const merged = mergeWithExisting(renderSpec({ ...base, testCase: multi }).text, edited);
    expect(merged.text).toContain(
      "      await test.step('Click Search button', async () => {\n        // Expected: Search runs\n        // tesseract:keep-start\n        await policySearch.searchButton.click({ force: true });\n        // tesseract:keep-end\n      });",
    );
  });
});

describe('mergeWithExisting — page object', () => {
  const written = renderPageObject('policy-search', policySearchCatalog.route, policySearchFacets, null).text;
  const added = facet({ id: 'policy-search:clear-button', role: 'button', tag: 'button', namingSource: 'content', locators: [{ strategy: 'role-name', role: 'button', name: 'Clear' }] });
  const regenerate = (facets = [...policySearchFacets, added]) => renderPageObject('policy-search', policySearchCatalog.route, facets, null).text;

  it('a member kept with the shorthand keeps its hand-edited locator while new facets are added', () => {
    const edited = replaceOnce(
      replaceOnce(written, '  /** facet policy-search:search-button', '  // tesseract:keep\n  /** facet policy-search:search-button'),
      "return this.page.getByRole('search').getByRole('button', { name: 'Search', exact: true });",
      "return this.page.locator('#SearchButton');",
    );
    const merged = mergeWithExisting(regenerate(), edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.text).toContain(
      "  // tesseract:keep\n  /** facet policy-search:search-button — content-named button in the search landmark */\n  get searchButton(): Locator {\n    return this.page.locator('#SearchButton');\n  }",
    );
    expect(merged.text).toContain('  get clearButton(): Locator {');
    expect(merged.text.match(/get searchButton/g)).toHaveLength(1);
    expect(mergeWithExisting(regenerate(), merged.text).text).toBe(merged.text);
  });

  it('a region wrapping a whole member replaces the generated member, and a free region holds a hand-written member', () => {
    const edited = replaceOnce(
      replaceOnce(
        written,
        '  /** facet policy-search:heading',
        '  // tesseract:keep-start\n  /** facet policy-search:heading',
      ),
      "    return this.page.getByRole('heading', { name: 'Policy Search', exact: true });\n  }\n",
      "    return this.page.getByRole('heading', { level: 1 });\n  }\n  // tesseract:keep-end\n\n  // tesseract:keep-start\n  get toast(): Locator {\n    return this.page.getByRole('status');\n  }\n  // tesseract:keep-end\n",
    );
    const merged = mergeWithExisting(regenerate(), edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.text.match(/get heading/g)).toHaveLength(1);
    expect(merged.text).toContain("return this.page.getByRole('heading', { level: 1 });");
    expect(merged.text).toContain(
      "    return this.page.getByRole('heading', { level: 1 });\n  }\n  // tesseract:keep-end\n\n  // tesseract:keep-start\n  get toast(): Locator {\n    return this.page.getByRole('status');\n  }\n  // tesseract:keep-end\n\n  /** facet policy-search:policy-number-input",
    );
    expect(merged.text).toContain('  get clearButton(): Locator {');
    expect(mergeWithExisting(regenerate(), merged.text).text).toBe(merged.text);
  });

  it('a kept member whose facet was retired is orphaned, not dropped', () => {
    const edited = replaceOnce(written, '  /** facet policy-search:search-button', '  // tesseract:keep\n  /** facet policy-search:search-button');
    const retired = policySearchFacets.map((f) => (f.id === 'policy-search:search-button' ? { ...f, status: 'retired' as const } : f));
    const merged = mergeWithExisting(regenerate(retired), edited);
    expect(merged.orphaned).toEqual(['policy-search:search-button']);
    expect(merged.text).toMatch(/^}\n\n\/\/ tesseract:keep-start orphaned policy-search:search-button\n/m);
    expect(merged.text).toContain('//   get searchButton(): Locator {');
  });
});

describe('mergeWithExisting — flow', () => {
  it('a kept flow step survives re-recording', () => {
    const routes = { login: loginCatalog.route };
    const facets = new Map(loginCatalog.facets.map((f) => [f.id, f]));
    const written = renderFlow(loginRecording, facets, routes).text;
    const edited = replaceOnce(
      written,
      '  await loginPage.logInButton.click();\n',
      "  // tesseract:keep-start\n  await loginPage.logInButton.click();\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n",
    );
    const merged = mergeWithExisting(renderFlow(loginRecording, facets, routes).text, edited);
    expect(merged.handEdited).toBe(false);
    expect(merged.text).toContain("  // step 4 — click login:log-in-button\n  // tesseract:keep-start\n  await loginPage.logInButton.click();\n  await page.waitForURL('**/Home');\n  // tesseract:keep-end\n}");
  });
});
