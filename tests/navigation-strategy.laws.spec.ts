/**
 * Law tests for the route-aware navigation strategy.
 *
 * Invariants:
 *   1. SPA URL patterns classified as 'spa'.
 *   2. Traditional URL patterns classified as 'traditional'.
 *   3. Unknown URLs classified as 'unknown'.
 *   4. Explicit metadata overrides URL pattern classification.
 *   5. SPA routes use 'domcontentloaded' with shorter timeout.
 *   6. Traditional routes use 'load' with longer timeout.
 *   7. Post-navigation check needed for SPA and unknown, not traditional.
 */
import { test, expect } from '@playwright/test';
import {
  classifyRoute,
  navigationOptionsForRoute,
  navigationOptionsForUrl,
  needsPostNavigationCheck,
} from '../product/runtime/adapters/navigation-strategy';

test.describe('classifyRoute', () => {
  test('classifies hash-based routing as SPA', () => {
    expect(classifyRoute('https://app.example.com/#/dashboard')).toBe('spa');
  });

  test('classifies /app/ prefix as SPA', () => {
    expect(classifyRoute('https://example.com/app/settings')).toBe('spa');
  });

  test('classifies /dashboard as SPA', () => {
    expect(classifyRoute('https://example.com/dashboard')).toBe('spa');
  });

  test('classifies .php as traditional', () => {
    expect(classifyRoute('https://example.com/index.php')).toBe('traditional');
  });

  test('classifies .aspx as traditional', () => {
    expect(classifyRoute('https://example.com/page.aspx')).toBe('traditional');
  });

  test('classifies /api/ as traditional', () => {
    expect(classifyRoute('https://example.com/api/users')).toBe('traditional');
  });

  test('classifies unknown URLs as unknown', () => {
    expect(classifyRoute('https://example.com/some/path')).toBe('unknown');
  });

  test('metadata overrides URL pattern', () => {
    expect(classifyRoute('https://example.com/index.php', { routeType: 'spa' })).toBe('spa');
    expect(classifyRoute('https://example.com/#/app', { routeType: 'traditional' })).toBe('traditional');
  });

  test('traditional patterns take priority over SPA patterns', () => {
    // /api/ is traditional even though it could match SPA-like patterns
    expect(classifyRoute('https://example.com/api/dashboard')).toBe('traditional');
  });
});

test.describe('navigationOptionsForRoute', () => {
  test('SPA uses domcontentloaded with 10s timeout', () => {
    const opts = navigationOptionsForRoute('spa');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(10_000);
  });

  test('traditional uses load with 30s timeout', () => {
    const opts = navigationOptionsForRoute('traditional');
    expect(opts.waitUntil).toBe('load');
    expect(opts.timeout).toBe(30_000);
  });

  test('unknown uses domcontentloaded with 15s timeout', () => {
    const opts = navigationOptionsForRoute('unknown');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(15_000);
  });
});

test.describe('navigationOptionsForUrl', () => {
  test('convenience function combines classify + options', () => {
    const opts = navigationOptionsForUrl('https://example.com/#/dashboard');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(10_000);
  });
});

test.describe('needsPostNavigationCheck', () => {
  test('SPA needs post-navigation check', () => {
    expect(needsPostNavigationCheck('spa')).toBe(true);
  });

  test('unknown needs post-navigation check', () => {
    expect(needsPostNavigationCheck('unknown')).toBe(true);
  });

  test('traditional does not need post-navigation check', () => {
    expect(needsPostNavigationCheck('traditional')).toBe(false);
  });
});
