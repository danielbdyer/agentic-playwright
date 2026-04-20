/**
 * ReasoningError Union — Law Tests
 *
 * Verifies the 4b.B.2 five-family error consolidation:
 *   - each family constructs to the correct tag + family
 *   - foldReasoningError dispatches exhaustively
 *   - classifyReasoningError reconciles legacy error classes
 *   - classifyReasoningError inspects raw causes for family signatures
 */

import { expect, test } from '@playwright/test';
import {
  AgentInterpreterParseError,
  AgentInterpreterTimeoutError,
  ReasoningContextExceededError,
  ReasoningError,
  ReasoningMalformedResponseError,
  ReasoningRateLimitedError,
  ReasoningUnavailableError,
  ReasoningUnclassifiedError,
  TranslationProviderParseError,
  TranslationProviderTimeoutError,
  classifyReasoningError,
  foldReasoningError,
} from '../../product/domain/kernel/errors';

// ─── Law 1: each family's _tag is a stable literal ───

test('each ReasoningError subclass carries a stable _tag literal', () => {
  expect(new ReasoningRateLimitedError('').name).toBe('ReasoningRateLimitedError');
  expect(new ReasoningContextExceededError('').name).toBe('ReasoningContextExceededError');
  expect(new ReasoningMalformedResponseError('').name).toBe('ReasoningMalformedResponseError');
  expect(new ReasoningUnavailableError('').name).toBe('ReasoningUnavailableError');
  expect(new ReasoningUnclassifiedError('').name).toBe('ReasoningUnclassifiedError');
});

// ─── Law 2: each subclass's family matches its name ───

test('each subclass sets the correct family discriminator', () => {
  expect(new ReasoningRateLimitedError('').family).toBe('rate-limited');
  expect(new ReasoningContextExceededError('').family).toBe('context-exceeded');
  expect(new ReasoningMalformedResponseError('').family).toBe('malformed-response');
  expect(new ReasoningUnavailableError('').family).toBe('unavailable');
  expect(new ReasoningUnclassifiedError('').family).toBe('unclassified');
});

// ─── Law 3: foldReasoningError dispatches exhaustively ───

test('foldReasoningError routes each family to the matching case', () => {
  const errors: ReadonlyArray<ReasoningError> = [
    new ReasoningRateLimitedError('r'),
    new ReasoningContextExceededError('c'),
    new ReasoningMalformedResponseError('m'),
    new ReasoningUnavailableError('u'),
    new ReasoningUnclassifiedError('x'),
  ];
  const labels = errors.map((err) =>
    foldReasoningError(err, {
      rateLimited: () => 'R',
      contextExceeded: () => 'C',
      malformedResponse: () => 'M',
      unavailable: () => 'U',
      unclassified: () => 'X',
    }),
  );
  expect(labels).toEqual(['R', 'C', 'M', 'U', 'X']);
});

// ─── Law 4: classifyReasoningError passes ReasoningError through ───

test('classifyReasoningError is idempotent on ReasoningError subclasses', () => {
  const source = new ReasoningRateLimitedError('already classified', 'p');
  const classified = classifyReasoningError(source);
  expect(classified).toBe(source);
});

// ─── Law 5: legacy Timeout errors map to ReasoningUnavailableError ───

test('classifyReasoningError lifts v1 Timeout errors into unavailable', () => {
  const translationTimeout = new TranslationProviderTimeoutError('t', 'tr-p');
  const agentTimeout = new AgentInterpreterTimeoutError('a', 'ag-p');
  const t = classifyReasoningError(translationTimeout);
  const a = classifyReasoningError(agentTimeout);
  expect(t).toBeInstanceOf(ReasoningUnavailableError);
  expect(t.family).toBe('unavailable');
  expect(a).toBeInstanceOf(ReasoningUnavailableError);
  expect(a.family).toBe('unavailable');
});

// ─── Law 6: legacy Parse errors map to ReasoningMalformedResponseError ───

test('classifyReasoningError lifts v1 Parse errors into malformed-response', () => {
  const translationParse = new TranslationProviderParseError('p1');
  const agentParse = new AgentInterpreterParseError('p2');
  expect(classifyReasoningError(translationParse)).toBeInstanceOf(ReasoningMalformedResponseError);
  expect(classifyReasoningError(agentParse).family).toBe('malformed-response');
});

// ─── Law 7: raw cause signatures classify by message heuristics ───

test('classifyReasoningError inspects cause messages for family signatures', () => {
  expect(classifyReasoningError(new Error('Rate limit exceeded (429)')).family).toBe('rate-limited');
  expect(classifyReasoningError(new Error('context length exceeded')).family).toBe('context-exceeded');
  expect(classifyReasoningError(new Error('ECONNREFUSED from 503')).family).toBe('unavailable');
  expect(classifyReasoningError(new Error('something unexpected')).family).toBe('unclassified');
  expect(classifyReasoningError('non-error value').family).toBe('unclassified');
});

// ─── Law 8: classifyReasoningError threads provider name through ───

test('classifyReasoningError forwards the provider argument into the receipt', () => {
  const err = classifyReasoningError(new Error('boom'), 'test-provider');
  expect(err.provider).toBe('test-provider');
});
