/**
 * The data-block scope counts every block honestly (no positional .first()),
 * and a page that navigates while the ladder runs is reported as a stale
 * snapshot, not as an element that does not exist.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from '@playwright/test';
import { isToolError } from '../../../src/core/errors.js';
import { renderLocator, toPlaywrightLocator } from '../../../src/locator/locator.js';
import { resolveCandidateLocator } from '../../../src/observe/ladder.js';
import { observePage } from '../../../src/observe/observe.js';
import { html, launch, openFixture, startServer } from './helpers.js';

const CARDS = `<!doctype html><html><body>
  <main>
    <div data-block="Catalog.ProductCard"><h3>Alpha</h3><button>Add to cart</button></div>
    <div data-block="Catalog.ProductCard"><h3>Beta</h3><button>Add to cart</button></div>
    <div data-block="Catalog.ProductCard"><h3>Gamma</h3><button>Add to cart</button></div>
    <div data-block="Catalog.Cart"><button>Checkout</button></div>
    <button>Checkout</button>
  </main>
</body></html>`;

let browser: Browser;

beforeAll(async () => {
  browser = await launch();
});

afterAll(async () => {
  await browser.close();
});

const refsNamed = async (page: Page, name: string): Promise<{ readonly snapshotId: string; readonly refs: readonly string[] }> => {
  const { record } = await observePage(page, { pageId: 'p1', pii: 'off' });
  return { snapshotId: record.snapshotId, refs: record.candidates.filter((c) => c.name === name).map((c) => c.ref) };
};

describe('ladder: data-block scope', () => {
  it('never verifies a positional pick among repeated blocks', async () => {
    const page = await openFixture(browser, CARDS);
    try {
      const { snapshotId, refs } = await refsNamed(page, 'Add to cart');
      expect(refs).toHaveLength(3);
      for (const [index, ref] of refs.entries()) {
        const result = await resolveCandidateLocator(page, snapshotId, ref);
        expect(result.expression).not.toContain('.first()');
        // Only position tells the three buttons apart: an nth locator, not a verified one.
        expect(result.verified).toBe(false);
        expect(result.locator.nth).toBe(index);
        const blockScoped = result.alternatives.find((alt) => alt.locator.scope?.dataBlock === 'Catalog.ProductCard');
        expect(blockScoped?.matches).toBe(3);
      }
    } finally {
      await page.close();
    }
  });

  it('verifies through a block that occurs once, without .first()', async () => {
    const page = await openFixture(browser, CARDS);
    try {
      const { snapshotId, refs } = await refsNamed(page, 'Checkout');
      expect(refs).toHaveLength(2);
      const inCart = await resolveCandidateLocator(page, snapshotId, refs[0]!);
      expect(inCart.verified).toBe(true);
      expect(inCart.expression).toBe(
        "page.getByRole('main').locator('[data-block=\"Catalog.Cart\"]').getByRole('button', { name: 'Checkout', exact: true })",
      );
      expect(await toPlaywrightLocator(page, inCart.locator).count()).toBe(1);
    } finally {
      await page.close();
    }
  });

  it('renders and builds a block scope that matches every block of that name', async () => {
    const spec = { strategy: 'role-name' as const, role: 'button', name: 'Add to cart', scope: { dataBlock: 'Catalog.ProductCard' } };
    expect(renderLocator(spec)).toBe("page.locator('[data-block=\"Catalog.ProductCard\"]').getByRole('button', { name: 'Add to cart', exact: true })");
    const page = await openFixture(browser, CARDS);
    try {
      expect(await toPlaywrightLocator(page, spec).count()).toBe(3);
    } finally {
      await page.close();
    }
  });
});

describe('ladder: the page navigates while the ladder runs', () => {
  it('throws stale-snapshot (re-observe), not not-found', async () => {
    const server = await startServer({ '/cards': html(CARDS) });
    const page = await browser.newPage();
    try {
      await page.goto(`${server.url}/cards`);
      const { snapshotId, refs } = await refsNamed(page, 'Checkout');
      // The first in-page call (describing the candidate) sees the observed document; the page then
      // navigates to a new document with the same content, as a delayed navigation from the previous click would.
      let calls = 0;
      const navigating = new Proxy(page, {
        get(target, property, receiver) {
          if (property === 'evaluate') {
            return async (...args: Parameters<Page['evaluate']>) => {
              const result = await target.evaluate(...args);
              calls += 1;
              if (calls === 1) await target.goto(`${server.url}/cards?again=1`);
              return result;
            };
          }
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      const error = await resolveCandidateLocator(navigating, snapshotId, refs[0]!).catch((e: unknown) => e);
      expect(isToolError(error) && error.family).toBe('stale-snapshot');
      expect(isToolError(error) && error.detail).toMatchObject({ snapshotId, ref: refs[0], status: 'no-registry' });
    } finally {
      await page.close();
      await server.close();
    }
  });

  it('throws stale-snapshot instead of returning an nth fallback computed on another document', async () => {
    const page = await openFixture(browser, CARDS);
    try {
      const { snapshotId, refs } = await refsNamed(page, 'Add to cart');
      let calls = 0;
      const navigating = new Proxy(page, {
        get(target, property, receiver) {
          if (property === 'evaluate') {
            return async (...args: Parameters<Page['evaluate']>) => {
              const result = await target.evaluate(...args);
              calls += 1;
              if (calls === 1) await target.setContent(CARDS);
              return result;
            };
          }
          const value: unknown = Reflect.get(target, property, receiver);
          return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value;
        },
      });
      const error = await resolveCandidateLocator(navigating, snapshotId, refs[1]!).catch((e: unknown) => e);
      expect(isToolError(error) && error.family).toBe('stale-snapshot');
    } finally {
      await page.close();
    }
  });
});
