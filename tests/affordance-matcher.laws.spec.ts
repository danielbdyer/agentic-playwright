import { expect, test } from '@playwright/test';

import { inferCapabilities, matchAffordance } from '../lib/domain/affordance-matcher';
import type { ElementAffordance, InteractionCapability } from '../lib/domain/types/affordance';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultConstraints = {
  isDisabled: false,
  isReadonly: false,
  isHidden: false,
  isRequired: false,
  maxLength: null,
  pattern: null,
  validValues: null,
} as const;

const makeAffordance = (
  overrides: Partial<ElementAffordance> & { readonly capabilities: readonly InteractionCapability[] },
): ElementAffordance => ({
  selector: overrides.selector ?? '#test',
  role: overrides.role ?? null,
  tagName: overrides.tagName ?? 'div',
  capabilities: overrides.capabilities,
  constraints: overrides.constraints ?? defaultConstraints,
  ariaLabel: overrides.ariaLabel ?? null,
});

// ---------------------------------------------------------------------------
// Law: inferCapabilities — tag-based inference
// ---------------------------------------------------------------------------

test('button infers clickable + focusable', () => {
  const caps = inferCapabilities('button', null, {});
  expect(caps).toContain('clickable');
  expect(caps).toContain('focusable');
});

test('anchor tag infers clickable + focusable', () => {
  const caps = inferCapabilities('a', null, {});
  expect(caps).toContain('clickable');
  expect(caps).toContain('focusable');
});

test('text input infers typeable + focusable', () => {
  const caps = inferCapabilities('input', null, { type: 'text' });
  expect(caps).toContain('typeable');
  expect(caps).toContain('focusable');
});

test('input with no type defaults to typeable + focusable', () => {
  const caps = inferCapabilities('input', null, {});
  expect(caps).toContain('typeable');
  expect(caps).toContain('focusable');
});

test('textarea infers typeable + focusable', () => {
  const caps = inferCapabilities('textarea', null, {});
  expect(caps).toContain('typeable');
  expect(caps).toContain('focusable');
});

test('select infers selectable + focusable', () => {
  const caps = inferCapabilities('select', null, {});
  expect(caps).toContain('selectable');
  expect(caps).toContain('focusable');
});

test('checkbox input infers toggleable + focusable', () => {
  const caps = inferCapabilities('input', null, { type: 'checkbox' });
  expect(caps).toContain('toggleable');
  expect(caps).toContain('focusable');
});

test('radio input infers toggleable + focusable', () => {
  const caps = inferCapabilities('input', null, { type: 'radio' });
  expect(caps).toContain('toggleable');
  expect(caps).toContain('focusable');
});

test('details tag infers expandable + focusable', () => {
  const caps = inferCapabilities('details', null, {});
  expect(caps).toContain('expandable');
  expect(caps).toContain('focusable');
});

test('dialog tag infers dismissable', () => {
  const caps = inferCapabilities('dialog', null, {});
  expect(caps).toContain('dismissable');
});

// ---------------------------------------------------------------------------
// Law: inferCapabilities — role-based inference
// ---------------------------------------------------------------------------

test('unknown tag with role=button infers clickable + focusable', () => {
  const caps = inferCapabilities('div', 'button', {});
  expect(caps).toContain('clickable');
  expect(caps).toContain('focusable');
});

test('unknown tag with role=textbox infers typeable + focusable', () => {
  const caps = inferCapabilities('span', 'textbox', {});
  expect(caps).toContain('typeable');
  expect(caps).toContain('focusable');
});

test('unknown tag with role=combobox infers selectable + focusable', () => {
  const caps = inferCapabilities('div', 'combobox', {});
  expect(caps).toContain('selectable');
  expect(caps).toContain('focusable');
});

test('unknown tag with role=checkbox infers toggleable + focusable', () => {
  const caps = inferCapabilities('div', 'checkbox', {});
  expect(caps).toContain('toggleable');
  expect(caps).toContain('focusable');
});

test('unknown tag with role=switch infers toggleable + focusable', () => {
  const caps = inferCapabilities('div', 'switch', {});
  expect(caps).toContain('toggleable');
  expect(caps).toContain('focusable');
});

test('unknown tag with role=dialog infers dismissable', () => {
  const caps = inferCapabilities('div', 'dialog', {});
  expect(caps).toContain('dismissable');
});

test('unknown tag with role=tab infers expandable + focusable', () => {
  const caps = inferCapabilities('div', 'tab', {});
  expect(caps).toContain('expandable');
  expect(caps).toContain('focusable');
});

// ---------------------------------------------------------------------------
// Law: inferCapabilities — attribute-based inference
// ---------------------------------------------------------------------------

test('contenteditable infers typeable + focusable', () => {
  const caps = inferCapabilities('div', null, { contenteditable: 'true' });
  expect(caps).toContain('typeable');
  expect(caps).toContain('focusable');
});

test('aria-expanded attribute infers expandable + focusable', () => {
  const caps = inferCapabilities('div', null, { 'aria-expanded': 'false' });
  expect(caps).toContain('expandable');
  expect(caps).toContain('focusable');
});

test('draggable attribute infers draggable + focusable', () => {
  const caps = inferCapabilities('div', null, { draggable: 'true' });
  expect(caps).toContain('draggable');
  expect(caps).toContain('focusable');
});

// ---------------------------------------------------------------------------
// Law: inferCapabilities — deduplication and determinism
// ---------------------------------------------------------------------------

test('capabilities are deduplicated and sorted', () => {
  // button role + button tag both yield clickable+focusable — should not duplicate
  const caps = inferCapabilities('button', 'button', {});
  const unique = [...new Set(caps)];
  expect(caps).toEqual(unique);
  expect(caps).toEqual([...caps].sort((a, b) => a.localeCompare(b)));
});

// ---------------------------------------------------------------------------
// Law: matchAffordance — action verb mapping
// ---------------------------------------------------------------------------

test.describe('action verb to capability mapping', () => {
  const verbTests: readonly (readonly [string, InteractionCapability])[] = [
    ['click', 'clickable'],
    ['press', 'clickable'],
    ['tap', 'clickable'],
    ['type', 'typeable'],
    ['enter', 'typeable'],
    ['fill', 'typeable'],
    ['select', 'selectable'],
    ['choose', 'selectable'],
    ['pick', 'selectable'],
    ['toggle', 'toggleable'],
    ['check', 'toggleable'],
    ['uncheck', 'toggleable'],
    ['scroll', 'scrollable'],
    ['expand', 'expandable'],
    ['collapse', 'expandable'],
    ['close', 'dismissable'],
    ['dismiss', 'dismissable'],
  ];

  verbTests.forEach(([verb, capability]) => {
    test(`"${verb}" maps to ${capability} with confidence 1.0`, () => {
      const affordance = makeAffordance({ capabilities: [capability, 'focusable'] });
      const match = matchAffordance(affordance, `${verb} the element`);
      expect(match.matchedCapability).toBe(capability);
      expect(match.confidence).toBe(1.0);
    });
  });
});

// ---------------------------------------------------------------------------
// Law: matchAffordance — confidence levels
// ---------------------------------------------------------------------------

test('exact capability match yields confidence 1.0', () => {
  const affordance = makeAffordance({ capabilities: ['clickable', 'focusable'] });
  const match = matchAffordance(affordance, 'click');
  expect(match.confidence).toBe(1.0);
  expect(match.matchedCapability).toBe('clickable');
});

test('focusable-only fallback yields confidence 0.5', () => {
  const affordance = makeAffordance({ capabilities: ['focusable'] });
  const match = matchAffordance(affordance, 'click');
  expect(match.confidence).toBe(0.5);
  expect(match.matchedCapability).toBeNull();
});

test('no match and not focusable yields confidence 0.0', () => {
  const affordance = makeAffordance({ capabilities: [] });
  const match = matchAffordance(affordance, 'click');
  expect(match.confidence).toBe(0.0);
  expect(match.matchedCapability).toBeNull();
});

// ---------------------------------------------------------------------------
// Law: matchAffordance — constraint warnings
// ---------------------------------------------------------------------------

test('disabled element generates warning', () => {
  const affordance = makeAffordance({
    capabilities: ['clickable', 'focusable'],
    constraints: { ...defaultConstraints, isDisabled: true },
  });
  const match = matchAffordance(affordance, 'click');
  expect(match.warnings).toContain('Element is disabled');
});

test('hidden element generates warning', () => {
  const affordance = makeAffordance({
    capabilities: ['clickable', 'focusable'],
    constraints: { ...defaultConstraints, isHidden: true },
  });
  const match = matchAffordance(affordance, 'click');
  expect(match.warnings).toContain('Element is hidden');
});

test('readonly element generates warning', () => {
  const affordance = makeAffordance({
    capabilities: ['typeable', 'focusable'],
    constraints: { ...defaultConstraints, isReadonly: true },
  });
  const match = matchAffordance(affordance, 'type hello');
  expect(match.warnings).toContain('Element is readonly');
});

test('unconstrained element generates no warnings', () => {
  const affordance = makeAffordance({ capabilities: ['clickable', 'focusable'] });
  const match = matchAffordance(affordance, 'click');
  expect(match.warnings).toEqual([]);
});
