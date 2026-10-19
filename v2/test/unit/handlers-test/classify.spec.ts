/**
 * Run-failure classification, on messages captured from Playwright 1.55's
 * JSON report (ANSI codes and all).
 */
import { describe, expect, it } from 'vitest';
import type { Facet } from '../../../src/contract/schemas.js';
import { classifyRunFailure, facetNamedBy, familyOf } from '../../../src/run/classify.js';

const DIM = '\u001b[2m';
const UNDIM = '\u001b[22m';

const fillTimeout = `TimeoutError: locator.fill: Timeout 3000ms exceeded.\nCall log:\n${DIM}  - waiting for getByRole('search').getByRole('textbox', { name: 'Search Policy', exact: true })${UNDIM}\n`;
const testTimeoutInStep = `Error: locator.fill: Test timeout of 2000ms exceeded.\nCall log:\n${DIM}  - waiting for getByRole('textbox', { name: 'Nope', exact: true })${UNDIM}\n`;
const expectMissing =
  `Error: ${DIM}expect(${UNDIM}\u001b[31mlocator\u001b[39m${DIM}).${UNDIM}toBeVisible${DIM}()${UNDIM} failed\n\n` +
  `Locator:  getByRole('heading', { name: 'Sign in', exact: true })\nExpected: visible\nReceived: <element(s) not found>\nTimeout:  1000ms\n\n` +
  `Call log:\n${DIM}  - Expect "toBeVisible" with timeout 1000ms${UNDIM}\n${DIM}  - waiting for getByRole('heading', { name: 'Sign in', exact: true })${UNDIM}\n`;
const textMismatch =
  `Error: ${DIM}expect(${UNDIM}\u001b[31mlocator\u001b[39m${DIM}).${UNDIM}toHaveText${DIM}(${UNDIM}\u001b[32mexpected\u001b[39m${DIM})${UNDIM} failed\n\n` +
  `Locator: getByRole('heading', { name: 'Hello', exact: true })\nExpected string: \u001b[32m"Goodbye"\u001b[39m\nReceived string: \u001b[31m"Hello"\u001b[39m\nTimeout: 1000ms\n\n` +
  `Call log:\n${DIM}  - Expect "toHaveText" with timeout 1000ms${UNDIM}\n${DIM}    5 × locator resolved to <h1>Hello</h1>${UNDIM}\n`;
const strict = `Error: locator.click: Error: strict mode violation: getByRole('link', { name: 'Edit', exact: true }) resolved to 3 elements:\n    1) <a href="PolicyDetail?id=POL-001">Edit</a>\n`;
const gotoTimeout = `TimeoutError: page.goto: Timeout 30000ms exceeded.\nCall log:\n${DIM}  - navigating to "http://127.0.0.1:1/PolicyApp/PolicySearch", waiting until "load"${UNDIM}\n`;
const netError = `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:1/PolicyApp/Login\nCall log:\n  - navigating to "http://127.0.0.1:1/PolicyApp/Login", waiting until "load"\n`;
const missingSecret = 'Error: Set the environment variable TESSERACT_PARAM_PASSWORD to run this flow.';

const provenance = { mintedAt: '2026-10-19T00:00:00Z', instrument: 'app.observe' as const };
const facet = (id: string, locators: Facet['locators']): Facet => ({
  id,
  screen: id.split(':')[0]!,
  kind: 'element',
  displayName: id,
  aliases: [],
  locators,
  status: 'trusted',
  provenance,
});

const searchInput = facet('policy-search:search-input', [
  { strategy: 'role-name', role: 'textbox', name: 'Search Policy', scope: { landmark: 'search' } },
  { strategy: 'placeholder', value: 'Search Policy' },
]);
const searchButton = facet('policy-search:search-button', [{ strategy: 'role-name', role: 'button', name: 'Search', scope: { landmark: 'search' } }]);
const heading = facet('login:sign-in-heading', [{ strategy: 'role-name', role: 'heading', name: 'Sign in' }]);
const resultRow: Facet = {
  ...facet('policy-search:result-row', [{ strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } }]),
  kind: 'row',
  parameter: 'policyNumber',
};

describe('familyOf', () => {
  it('reads an action timeout from its call log: waiting for a locator that never resolved is not-found', () => {
    expect(familyOf(fillTimeout).family).toBe('not-found');
    expect(familyOf(fillTimeout).message).toMatch(/locator\.fill: Timeout 3000ms exceeded/);
  });

  it('reads the test-level timeout the same way (the step error carries the call log)', () => {
    expect(familyOf(testTimeoutInStep).family).toBe('not-found');
  });

  it('treats a web-first expect that found nothing as not-found, not as an assertion', () => {
    const result = familyOf(expectMissing);
    expect(result.family).toBe('not-found');
    expect(result.expect).toBe(true);
    expect(result.message).toContain('Received: <element(s) not found>');
    expect(result.message).not.toContain('\u001b');
  });

  it('treats a content mismatch as assertion-like, keeping expected and received', () => {
    const result = familyOf(textMismatch);
    expect(result.family).toBe('assertion-like');
    expect(result.message).toContain('Expected string: "Goodbye"');
    expect(result.message).toContain('Received string: "Hello"');
  });

  it('recognises strict-mode violations as ambiguous', () => {
    expect(familyOf(strict).family).toBe('ambiguous');
  });
});

describe('classifyRunFailure', () => {
  it('is drift when a locator family names a locator of the failing step\'s facet', () => {
    const result = classifyRunFailure(fillTimeout, [searchInput], [searchInput, searchButton]);
    expect(result).toMatchObject({ family: 'not-found', failureType: 'drift', facet: 'policy-search:search-input' });
  });

  it('prefers the step\'s facets, then any facet of the test (a failure in a beforeEach flow has no step)', () => {
    expect(classifyRunFailure(fillTimeout, [], [searchButton, searchInput]).facet).toBe('policy-search:search-input');
    expect(facetNamedBy(fillTimeout, [searchButton], [])).toBeUndefined();
  });

  it('matches a locator printed without its scope, and a parameterised row with or without the row value', () => {
    const unscoped = `TimeoutError: locator.click: Timeout 1000ms exceeded.\nCall log:\n  - waiting for getByRole('textbox', { name: 'Search Policy', exact: true })\n`;
    expect(facetNamedBy(unscoped, [searchInput], [])).toBe('policy-search:search-input');
    const row = `Error: expect(locator).toContainText(expected) failed\n\nLocator: getByRole('main').getByRole('row').filter({ hasText: 'POL-001' })\nExpected substring: "POL-001"\nReceived: <element(s) not found>\n`;
    expect(facetNamedBy(row, [resultRow], [], { policyNumber: 'POL-001' })).toBe('policy-search:result-row');
    expect(facetNamedBy(row, [resultRow], [])).toBe('policy-search:result-row');
    expect(facetNamedBy(row, [resultRow], [], { policyNumber: 'POL-999' })).toBeUndefined();
  });

  it('is a candidate bug when toHaveText / toContainText / toHaveValue / toHaveCount saw other content', () => {
    expect(classifyRunFailure(textMismatch, [heading], [heading])).toMatchObject({ family: 'assertion-like', failureType: 'candidate-bug' });
    const count = `Error: expect(locator).toHaveCount(expected) failed\n\nLocator: getByRole('row')\nExpected: 3\nReceived: 1\n`;
    expect(classifyRunFailure(count, [], []).failureType).toBe('candidate-bug');
  });

  it('is environment for navigation timeouts, net:: errors, 5xx, and a missing runtime secret', () => {
    expect(classifyRunFailure(gotoTimeout, [], [])).toMatchObject({ failureType: 'environment', family: 'timeout' });
    expect(classifyRunFailure(netError, [], [])).toMatchObject({ failureType: 'environment', family: 'unavailable' });
    expect(classifyRunFailure('Error: page returned 503 Service Unavailable', [], []).failureType).toBe('environment');
    expect(classifyRunFailure(missingSecret, [], [])).toMatchObject({ failureType: 'environment', family: 'not-configured' });
    const noMain = "TimeoutError: locator.waitFor: Timeout 30000ms exceeded.\nCall log:\n  - waiting for getByRole('main') to be visible\n";
    expect(classifyRunFailure(noMain, [searchInput], [searchInput])).toMatchObject({ failureType: 'environment', family: 'not-found' });
  });

  it('is unknown when a locator family names no facet and nothing points at the environment', () => {
    expect(classifyRunFailure(expectMissing, [searchInput], [searchInput])).toMatchObject({ family: 'not-found', failureType: 'unknown' });
    expect(classifyRunFailure('Error: something odd happened', [], []).failureType).toBe('unknown');
  });

  it('a missing element in a content assertion is drift, not a candidate bug', () => {
    expect(classifyRunFailure(expectMissing, [heading], [heading])).toMatchObject({ family: 'not-found', failureType: 'drift', facet: 'login:sign-in-heading' });
  });
});
