/**
 * A data-testid locator verified in Tesseract's browser must find the same
 * element in the customer's runner, whatever its use.testIdAttribute is
 * (tesseract-qa init suggests 'os-test-id'). getByTestId follows that
 * setting, so test ids render as attribute selectors.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { selectors, type Browser, type Locator, type Page } from '@playwright/test';
import type { LocatorSpec } from '../../../src/contract/schemas.js';
import { renderLocator, toPlaywrightLocator } from '../../../src/locator/locator.js';
import { resolveCandidateLocator } from '../../../src/observe/ladder.js';
import { observePage } from '../../../src/observe/observe.js';
import { launch, openFixture } from './helpers.js';

const HTML = `<!doctype html><html><body><main>
  <button data-testid="save-draft"><span class="icon"></span></button>
  <button os-test-id="save-draft">Other</button>
</main></body></html>`;

let browser: Browser;

beforeAll(async () => {
  browser = await launch();
});

afterAll(async () => {
  selectors.setTestIdAttribute('data-testid');
  await browser.close();
});

/** Evaluate an emitted locator expression (rooted at `page`) against a live page. */
const run = (expression: string, page: Page, params: Readonly<Record<string, string>> = {}): Locator =>
  new Function('page', ...Object.keys(params), `return ${expression};`)(page, ...Object.values(params)) as Locator;

describe('test-id locators do not depend on testIdAttribute', () => {
  it('renders the attribute explicitly, with or without parameters', () => {
    expect(renderLocator({ strategy: 'test-id', value: 'save-draft' })).toBe('page.locator(\'[data-testid="save-draft"]\')');
    expect(renderLocator({ strategy: 'test-id', value: 'CloseIcon', attribute: 'os-test-id' })).toBe('page.locator(\'[os-test-id="CloseIcon"]\')');
    expect(renderLocator({ strategy: 'test-id', value: 'row-{id}' }, { params: 'identifiers' })).toBe('page.locator(`[data-testid=${JSON.stringify(`row-${id}`)}]`)');
    expect(renderLocator({ strategy: 'test-id', value: '{id}' }, { params: 'identifiers' })).toBe('page.locator(`[data-testid=${JSON.stringify(id)}]`)');
    expect(renderLocator({ strategy: 'test-id', value: 'row-{id}' }, { params: { id: '7' } })).toBe('page.locator(\'[data-testid="row-7"]\')');
  });

  it('a locator the ladder verified finds the same element in a runner configured with testIdAttribute os-test-id', async () => {
    const page = await openFixture(browser, HTML);
    try {
      const { record } = await observePage(page, { pageId: 'p1', pii: 'off' });
      const save = record.candidates.find((c) => c.testId === 'save-draft' && c.testIdAttribute === 'data-testid');
      expect(save).toBeDefined();
      const resolved = await resolveCandidateLocator(page, record.snapshotId, save!.ref);
      expect(resolved).toMatchObject({ verified: true, locator: { strategy: 'test-id', value: 'save-draft' } });
      expect(resolved.expression).not.toContain('getByTestId');
      // The customer's runner: use.testIdAttribute = 'os-test-id'.
      selectors.setTestIdAttribute('os-test-id');
      const customerPage = await openFixture(browser, HTML);
      try {
        const emitted = run(resolved.expression, customerPage);
        expect(await emitted.count()).toBe(1);
        expect(await emitted.getAttribute('data-testid')).toBe('save-draft');
        expect(await toPlaywrightLocator(customerPage, resolved.locator).getAttribute('data-testid')).toBe('save-draft');
        const parameterized: LocatorSpec = { strategy: 'test-id', value: '{name}' };
        const withParam = run(renderLocator(parameterized, { params: 'identifiers' }), customerPage, { name: 'save-draft' });
        expect(await withParam.getAttribute('data-testid')).toBe('save-draft');
      } finally {
        await customerPage.close();
        selectors.setTestIdAttribute('data-testid');
      }
    } finally {
      await page.close();
    }
  });
});
