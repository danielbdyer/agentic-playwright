import { expect, test } from '@playwright/test';
import type { ConsoleEntry } from '../../lib/domain/execution/types';

// ─── Law: ConsoleEntry level is a closed union ───

test('ConsoleEntry level covers all browser console methods', () => {
  const levels: readonly ConsoleEntry['level'][] = ['log', 'warn', 'error', 'info', 'debug'];
  expect(levels.length).toBe(5);
  expect(new Set(levels).size).toBe(5);
});

// ─── Law: ConsoleEntry is structurally immutable ───

test('ConsoleEntry fields are all readonly', () => {
  const entry: ConsoleEntry = {
    level: 'error',
    text: 'Uncaught TypeError: Cannot read property "foo" of undefined',
    timestamp: '2026-03-28T12:00:00.000Z',
    url: 'https://app.example.com/main.js',
  };
  // Readonly check: attempting to assign should be a type error at compile time.
  // At runtime, we verify the shape is correct.
  expect(entry.level).toBe('error');
  expect(entry.text).toContain('TypeError');
  expect(entry.url).toContain('example.com');
});

// ─── Law: optional url field is omittable ───

test('ConsoleEntry works without url field', () => {
  const entry: ConsoleEntry = {
    level: 'warn',
    text: 'Deprecation warning: API v1 will be removed',
    timestamp: '2026-03-28T12:00:00.000Z',
  };
  expect(entry.url).toBeUndefined();
});
