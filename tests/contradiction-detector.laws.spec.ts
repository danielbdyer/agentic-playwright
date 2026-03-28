import { expect, test } from '@playwright/test';
import {
  detectHintContradictions,
  detectRouteContradictions,
  detectPatternContradictions,
  buildContradictionReport,
} from '../lib/domain/contradiction-detector';
import type { HintEntry, RouteEntry, PatternEntry } from '../lib/domain/contradiction-detector';
import type { KnowledgeContradiction } from '../lib/domain/types/contradiction';

// ─── Law: empty inputs produce no contradictions ───

test('no hints → no contradictions', () => {
  expect(detectHintContradictions([])).toEqual([]);
});

test('no routes → no contradictions', () => {
  expect(detectRouteContradictions([])).toEqual([]);
});

test('no patterns → no contradictions', () => {
  expect(detectPatternContradictions([])).toEqual([]);
});

// ─── Law: same element, same selector → no contradiction ───

test('same element with identical selectors produces no contradiction', () => {
  const hints: readonly HintEntry[] = [
    { screenId: 'login', elementId: 'username', selector: '#user', source: 'a.yaml' },
    { screenId: 'login', elementId: 'username', selector: '#user', source: 'b.yaml' },
  ];
  expect(detectHintContradictions(hints)).toEqual([]);
});

// ─── Law: same element, different selectors → locator-conflict ───

test('same element with different selectors produces locator-conflict', () => {
  const hints: readonly HintEntry[] = [
    { screenId: 'login', elementId: 'username', selector: '#user', source: 'a.yaml' },
    { screenId: 'login', elementId: 'username', selector: '.user-input', source: 'b.yaml' },
  ];
  const result = detectHintContradictions(hints);
  expect(result).toHaveLength(1);
  expect(result[0]!.category).toBe('locator-conflict');
  expect(result[0]!.severity).toBe('error');
  expect(result[0]!.id).toBe('hint-conflict-login-username');
  expect(result[0]!.sources).toHaveLength(2);
});

// ─── Law: same route pattern, different screens → route-conflict ───

test('same route pattern mapping to different screens produces route-conflict', () => {
  const routes: readonly RouteEntry[] = [
    { pattern: '/dashboard', screenId: 'main-dashboard', source: 'routes-a.yaml' },
    { pattern: '/dashboard', screenId: 'admin-dashboard', source: 'routes-b.yaml' },
  ];
  const result = detectRouteContradictions(routes);
  expect(result).toHaveLength(1);
  expect(result[0]!.category).toBe('route-conflict');
  expect(result[0]!.severity).toBe('error');
  expect(result[0]!.sources).toHaveLength(2);
});

// ─── Law: same route pattern, same screen → no contradiction ───

test('same route pattern mapping to same screen produces no contradiction', () => {
  const routes: readonly RouteEntry[] = [
    { pattern: '/dashboard', screenId: 'main-dashboard', source: 'routes-a.yaml' },
    { pattern: '/dashboard', screenId: 'main-dashboard', source: 'routes-b.yaml' },
  ];
  expect(detectRouteContradictions(routes)).toEqual([]);
});

// ─── Law: same action, different selectors → pattern-conflict (warning) ───

test('same action on same screen with different selectors produces pattern-conflict warning', () => {
  const patterns: readonly PatternEntry[] = [
    { name: 'submit', screenId: 'login', action: 'click', selector: '#submit-btn', source: 'p1.yaml' },
    { name: 'submit', screenId: 'login', action: 'click', selector: '.submit-button', source: 'p2.yaml' },
  ];
  const result = detectPatternContradictions(patterns);
  expect(result).toHaveLength(1);
  expect(result[0]!.category).toBe('pattern-conflict');
  expect(result[0]!.severity).toBe('warning');
  expect(result[0]!.id).toBe('pattern-conflict-login-click');
});

// ─── Law: same action, same selector → no contradiction ───

test('same action on same screen with identical selectors produces no contradiction', () => {
  const patterns: readonly PatternEntry[] = [
    { name: 'submit', screenId: 'login', action: 'click', selector: '#submit-btn', source: 'p1.yaml' },
    { name: 'submit', screenId: 'login', action: 'click', selector: '#submit-btn', source: 'p2.yaml' },
  ];
  expect(detectPatternContradictions(patterns)).toEqual([]);
});

// ─── Law: report summary counts are correct ───

test('report summary counts contradictions correctly', () => {
  const contradictions: readonly KnowledgeContradiction[] = [
    {
      id: 'hint-conflict-login-username',
      category: 'locator-conflict',
      severity: 'error',
      description: 'test',
      sources: [],
      suggestedResolution: 'test',
    },
    {
      id: 'pattern-conflict-login-click',
      category: 'pattern-conflict',
      severity: 'warning',
      description: 'test',
      sources: [],
      suggestedResolution: 'test',
    },
    {
      id: 'route-conflict-abc',
      category: 'route-conflict',
      severity: 'error',
      description: 'test',
      sources: [],
      suggestedResolution: 'test',
    },
  ];

  const report = buildContradictionReport(contradictions, '2026-03-28T00:00:00Z');
  expect(report.kind).toBe('contradiction-report');
  expect(report.version).toBe(1);
  expect(report.summary.totalContradictions).toBe(3);
  expect(report.summary.byCategory['locator-conflict']).toBe(1);
  expect(report.summary.byCategory['route-conflict']).toBe(1);
  expect(report.summary.byCategory['pattern-conflict']).toBe(1);
  expect(report.summary.byCategory['hint-conflict']).toBe(0);
  expect(report.summary.byCategory['screen-identity-conflict']).toBe(0);
  expect(report.summary.bySeverity['error']).toBe(2);
  expect(report.summary.bySeverity['warning']).toBe(1);
  expect(report.summary.bySeverity['info']).toBe(0);
});

// ─── Law: blocksPromotion true when errors exist ───

test('blocksPromotion is true when error-severity contradictions exist', () => {
  const contradictions: readonly KnowledgeContradiction[] = [
    {
      id: 'hint-conflict-login-username',
      category: 'locator-conflict',
      severity: 'error',
      description: 'test',
      sources: [],
      suggestedResolution: 'test',
    },
  ];
  const report = buildContradictionReport(contradictions, '2026-03-28T00:00:00Z');
  expect(report.summary.blocksPromotion).toBe(true);
});

// ─── Law: blocksPromotion false when only warnings ───

test('blocksPromotion is false when only warning-severity contradictions exist', () => {
  const contradictions: readonly KnowledgeContradiction[] = [
    {
      id: 'pattern-conflict-login-click',
      category: 'pattern-conflict',
      severity: 'warning',
      description: 'test',
      sources: [],
      suggestedResolution: 'test',
    },
  ];
  const report = buildContradictionReport(contradictions, '2026-03-28T00:00:00Z');
  expect(report.summary.blocksPromotion).toBe(false);
});

// ─── Law: blocksPromotion false when no contradictions ───

test('blocksPromotion is false when no contradictions exist', () => {
  const report = buildContradictionReport([], '2026-03-28T00:00:00Z');
  expect(report.summary.blocksPromotion).toBe(false);
  expect(report.summary.totalContradictions).toBe(0);
});

// ─── Law: contradiction IDs are deterministic ───

test('contradiction IDs are deterministic across invocations', () => {
  const hints: readonly HintEntry[] = [
    { screenId: 'login', elementId: 'password', selector: '#pass', source: 'a.yaml' },
    { screenId: 'login', elementId: 'password', selector: '.password', source: 'b.yaml' },
  ];
  const first = detectHintContradictions(hints);
  const second = detectHintContradictions(hints);
  expect(first[0]!.id).toBe(second[0]!.id);
  expect(first[0]!.id).toBe('hint-conflict-login-password');
});

test('route contradiction IDs are deterministic across invocations', () => {
  const routes: readonly RouteEntry[] = [
    { pattern: '/settings', screenId: 'user-settings', source: 'a.yaml' },
    { pattern: '/settings', screenId: 'admin-settings', source: 'b.yaml' },
  ];
  const first = detectRouteContradictions(routes);
  const second = detectRouteContradictions(routes);
  expect(first[0]!.id).toBe(second[0]!.id);
  expect(first[0]!.id).toMatch(/^route-conflict-/);
});

test('pattern contradiction IDs are deterministic across invocations', () => {
  const patterns: readonly PatternEntry[] = [
    { name: 'save', screenId: 'form', action: 'click', selector: '#save', source: 'a.yaml' },
    { name: 'save', screenId: 'form', action: 'click', selector: '.save-btn', source: 'b.yaml' },
  ];
  const first = detectPatternContradictions(patterns);
  const second = detectPatternContradictions(patterns);
  expect(first[0]!.id).toBe(second[0]!.id);
  expect(first[0]!.id).toBe('pattern-conflict-form-click');
});

// ─── Law: different elements on same screen are independent ───

test('different elements on same screen do not interfere', () => {
  const hints: readonly HintEntry[] = [
    { screenId: 'login', elementId: 'username', selector: '#user', source: 'a.yaml' },
    { screenId: 'login', elementId: 'password', selector: '#pass', source: 'a.yaml' },
  ];
  expect(detectHintContradictions(hints)).toEqual([]);
});

// ─── Law: multiple contradictions detected independently ───

test('multiple contradictions are detected independently', () => {
  const hints: readonly HintEntry[] = [
    { screenId: 'login', elementId: 'username', selector: '#user', source: 'a.yaml' },
    { screenId: 'login', elementId: 'username', selector: '.user', source: 'b.yaml' },
    { screenId: 'login', elementId: 'password', selector: '#pass', source: 'a.yaml' },
    { screenId: 'login', elementId: 'password', selector: '.pass', source: 'b.yaml' },
  ];
  const result = detectHintContradictions(hints);
  expect(result).toHaveLength(2);
  expect(result.map((c) => c.id).sort()).toEqual([
    'hint-conflict-login-password',
    'hint-conflict-login-username',
  ]);
});
