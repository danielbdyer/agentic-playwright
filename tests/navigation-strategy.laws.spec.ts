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
import { describe, it, expect } from 'vitest';
import {
  classifyRoute,
  navigationOptionsForRoute,
  navigationOptionsForUrl,
  needsPostNavigationCheck,
} from '../lib/runtime/navigation-strategy';

describe('classifyRoute', () => {
  it('classifies hash-based routing as SPA', () => {
    expect(classifyRoute('https://app.example.com/#/dashboard')).toBe('spa');
  });

  it('classifies /app/ prefix as SPA', () => {
    expect(classifyRoute('https://example.com/app/settings')).toBe('spa');
  });

  it('classifies /dashboard as SPA', () => {
    expect(classifyRoute('https://example.com/dashboard')).toBe('spa');
  });

  it('classifies .php as traditional', () => {
    expect(classifyRoute('https://example.com/index.php')).toBe('traditional');
  });

  it('classifies .aspx as traditional', () => {
    expect(classifyRoute('https://example.com/page.aspx')).toBe('traditional');
  });

  it('classifies /api/ as traditional', () => {
    expect(classifyRoute('https://example.com/api/users')).toBe('traditional');
  });

  it('classifies unknown URLs as unknown', () => {
    expect(classifyRoute('https://example.com/some/path')).toBe('unknown');
  });

  it('metadata overrides URL pattern', () => {
    expect(classifyRoute('https://example.com/index.php', { routeType: 'spa' })).toBe('spa');
    expect(classifyRoute('https://example.com/#/app', { routeType: 'traditional' })).toBe('traditional');
  });

  it('traditional patterns take priority over SPA patterns', () => {
    // /api/ is traditional even though it could match SPA-like patterns
    expect(classifyRoute('https://example.com/api/dashboard')).toBe('traditional');
  });
});

describe('navigationOptionsForRoute', () => {
  it('SPA uses domcontentloaded with 10s timeout', () => {
    const opts = navigationOptionsForRoute('spa');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(10_000);
  });

  it('traditional uses load with 30s timeout', () => {
    const opts = navigationOptionsForRoute('traditional');
    expect(opts.waitUntil).toBe('load');
    expect(opts.timeout).toBe(30_000);
  });

  it('unknown uses domcontentloaded with 15s timeout', () => {
    const opts = navigationOptionsForRoute('unknown');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(15_000);
  });
});

describe('navigationOptionsForUrl', () => {
  it('convenience function combines classify + options', () => {
    const opts = navigationOptionsForUrl('https://example.com/#/dashboard');
    expect(opts.waitUntil).toBe('domcontentloaded');
    expect(opts.timeout).toBe(10_000);
  });
});

describe('needsPostNavigationCheck', () => {
  it('SPA needs post-navigation check', () => {
    expect(needsPostNavigationCheck('spa')).toBe(true);
  });

  it('unknown needs post-navigation check', () => {
    expect(needsPostNavigationCheck('unknown')).toBe(true);
  });

  it('traditional does not need post-navigation check', () => {
    expect(needsPostNavigationCheck('traditional')).toBe(false);
  });
});
