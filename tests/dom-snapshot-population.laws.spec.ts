/**
 * DOM Snapshot Population — Law Tests
 *
 * Invariants for the captureTruncatedAriaSnapshot helper:
 * 1. When page is available and returns a snapshot, domSnapshot is non-null.
 * 2. domSnapshot length is bounded (≤ 2048 chars).
 * 3. domSnapshot is null when no page context is provided.
 * 4. domSnapshot is null when accessibility.snapshot() throws.
 */

import { expect, test } from '@playwright/test';
import { captureTruncatedAriaSnapshot } from '../lib/runtime/resolution/resolution-stages';

// ─── Mock Page Factories ───

function mockPage(snapshot: object | null, shouldThrow = false) {
  return {
    accessibility: {
      snapshot: async (_opts?: unknown) => {
        if (shouldThrow) throw new Error('Page crashed');
        return snapshot;
      },
    },
    locator: (_selector: string) => ({}),
  };
}

function largeAccessibilityTree(nodeCount: number): object {
  const children = Array.from({ length: nodeCount }, (_, i) => ({
    role: 'button',
    name: `Button ${i}`,
    children: [],
  }));
  return {
    role: 'WebArea',
    name: 'Test Page',
    children,
  };
}

// ─── Law 1: Non-null when page returns snapshot ───

test('domSnapshot is non-null when page returns a valid accessibility tree', async () => {
  const page = mockPage({ role: 'WebArea', name: 'Test', children: [] });
  const result = await captureTruncatedAriaSnapshot(page);
  expect(result).not.toBeNull();
  expect(typeof result).toBe('string');
  expect(result!.length).toBeGreaterThan(0);
});

// ─── Law 2: Bounded length ───

test('domSnapshot length is bounded to maxChars (default 2048)', async () => {
  const page = mockPage(largeAccessibilityTree(500));
  const result = await captureTruncatedAriaSnapshot(page);
  expect(result).not.toBeNull();
  expect(result!.length).toBeLessThanOrEqual(2048 + 4); // +4 for trailing '\n...' or '...'
});

test('domSnapshot respects a custom maxChars bound', async () => {
  const page = mockPage(largeAccessibilityTree(500));
  const result = await captureTruncatedAriaSnapshot(page, 512);
  expect(result).not.toBeNull();
  expect(result!.length).toBeLessThanOrEqual(512 + 4);
});

test('small snapshot is returned without truncation', async () => {
  const tree = { role: 'WebArea', name: 'Small', children: [] };
  const page = mockPage(tree);
  const result = await captureTruncatedAriaSnapshot(page);
  expect(result).toBe(JSON.stringify(tree, null, 2));
});

// ─── Law 3: Null when no page ───

test('domSnapshot is null when page is null', async () => {
  const result = await captureTruncatedAriaSnapshot(null);
  expect(result).toBeNull();
});

test('domSnapshot is null when page is undefined', async () => {
  const result = await captureTruncatedAriaSnapshot(undefined);
  expect(result).toBeNull();
});

// ─── Law 4: Null on error ───

test('domSnapshot is null when accessibility.snapshot() throws', async () => {
  const page = mockPage(null, true);
  const result = await captureTruncatedAriaSnapshot(page);
  expect(result).toBeNull();
});

test('domSnapshot is null when accessibility.snapshot() returns null', async () => {
  const page = mockPage(null);
  const result = await captureTruncatedAriaSnapshot(page);
  expect(result).toBeNull();
});
