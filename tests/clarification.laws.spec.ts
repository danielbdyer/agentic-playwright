import { expect, test } from '@playwright/test';
import { buildClarificationRequest } from '../lib/domain/clarification';
import type { ResolutionPrecedenceRung } from '../lib/domain/precedence';

const typicalRungs: readonly ResolutionPrecedenceRung[] = [
  'explicit',
  'control',
  'approved-screen-knowledge',
  'shared-patterns',
  'prior-evidence',
];

test('no candidates generates navigation questions', () => {
  const result = buildClarificationRequest(
    3,
    'Click the Submit button',
    'login-screen',
    typicalRungs,
    [],
    [],
  );

  expect(result.kind).toBe('clarification-request');
  expect(result.stepIndex).toBe(3);

  const navQuestions = result.questions.filter((q) => q.category === 'navigation');
  expect(navQuestions.length).toBeGreaterThan(0);
  expect(navQuestions[0]!.question).toContain('login-screen');
});

test('no candidates and null screenId asks for screen identification', () => {
  const result = buildClarificationRequest(
    0,
    'Click Save',
    null,
    typicalRungs,
    [],
    [],
  );

  const navQuestions = result.questions.filter((q) => q.category === 'navigation');
  expect(navQuestions.length).toBeGreaterThan(0);
  expect(navQuestions[0]!.question).toContain('Could not identify the current screen');
  expect(navQuestions[0]!.suggestedActions).toContain('Provide a screen identifier for this step');
});

test('some candidates generates locator questions', () => {
  const result = buildClarificationRequest(
    2,
    'Click Submit',
    'form-screen',
    typicalRungs,
    ['button#save', 'button#cancel'],
    [],
  );

  const locatorQuestions = result.questions.filter((q) => q.category === 'locator');
  expect(locatorQuestions.length).toBeGreaterThan(0);
  expect(locatorQuestions[0]!.question).toContain('2 candidate(s)');
  expect(locatorQuestions[0]!.suggestedActions.some((a) => a.includes('button#save'))).toBe(true);

  const navQuestions = result.questions.filter((q) => q.category === 'navigation');
  expect(navQuestions.length).toBe(0);
});

test('console errors generate precondition questions', () => {
  const result = buildClarificationRequest(
    1,
    'Fill in Username',
    'login-screen',
    typicalRungs,
    ['input#username'],
    ['TypeError: Cannot read property "value" of null', 'NetworkError: fetch failed'],
  );

  const preconditionQuestions = result.questions.filter((q) => q.category === 'precondition');
  expect(preconditionQuestions.length).toBeGreaterThan(0);
  expect(preconditionQuestions[0]!.question).toContain('Console errors detected (2)');
  expect(preconditionQuestions[0]!.suggestedActions.some((a) => a.includes('TypeError'))).toBe(true);
});

test('question IDs are deterministic', () => {
  const argsA = [5, 'Click OK', 'dialog', typicalRungs, [], ['SomeError']] as const;
  const argsB = [5, 'Click OK', 'dialog', typicalRungs, [], ['SomeError']] as const;

  const resultA = buildClarificationRequest(...argsA);
  const resultB = buildClarificationRequest(...argsB);

  expect(resultA.questions.map((q) => q.id)).toEqual(resultB.questions.map((q) => q.id));

  const ids = resultA.questions.map((q) => q.id);
  const uniqueIds = [...new Set(ids)];
  expect(ids).toEqual(uniqueIds);
});

test('question IDs follow clarify-{stepIndex}-{category}-{index} format', () => {
  const result = buildClarificationRequest(
    7,
    'Click Save',
    null,
    typicalRungs,
    [],
    ['Error'],
  );

  for (const question of result.questions) {
    expect(question.id).toMatch(/^clarify-7-[a-z]+-\d+$/);
  }
});

test('empty failed rungs still produces valid request', () => {
  const result = buildClarificationRequest(
    0,
    'Click Login',
    null,
    [],
    [],
    [],
  );

  expect(result.kind).toBe('clarification-request');
  expect(result.stepIndex).toBe(0);
  expect(result.failedRungs).toEqual([]);
  expect(result.questions.length).toBeGreaterThan(0);
  expect(result.context.attemptedStrategies).toEqual([]);
  expect(result.context.actionText).toBe('Click Login');
  expect(result.context.screenId).toBeNull();
});

test('context captures all input data faithfully', () => {
  const rungs: readonly ResolutionPrecedenceRung[] = ['explicit', 'control'];
  const candidates = ['btn-a', 'btn-b'];
  const errors = ['err-1'];

  const result = buildClarificationRequest(4, 'Press Enter', 'main', rungs, candidates, errors);

  expect(result.context.actionText).toBe('Press Enter');
  expect(result.context.screenId).toBe('main');
  expect(result.context.attemptedStrategies).toEqual(['explicit', 'control']);
  expect(result.context.nearestCandidates).toEqual(candidates);
  expect(result.context.consoleErrors).toEqual(errors);
});

test('no candidates produces affordance questions', () => {
  const result = buildClarificationRequest(
    1,
    'Drag slider to 50%',
    'settings',
    typicalRungs,
    [],
    [],
  );

  const affordanceQuestions = result.questions.filter((q) => q.category === 'affordance');
  expect(affordanceQuestions.length).toBeGreaterThan(0);
  expect(affordanceQuestions[0]!.question).toContain('Drag slider to 50%');
});
