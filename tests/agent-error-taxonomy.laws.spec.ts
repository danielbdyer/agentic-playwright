import { expect, test } from '@playwright/test';
import {
  foldAgentError,
  isRetryable,
} from '../lib/domain/types/agent-errors';
import type { AgentInterpretationError } from '../lib/domain/types/agent-errors';
import {
  isWithinBudget,
  remainingBudget,
  shouldTruncatePrompt,
} from '../lib/domain/agent-budget';
import type { TokenBudget, TokenUsage } from '../lib/domain/agent-budget';

// ─── Law: foldAgentError exhaustiveness — all 6 variants dispatched ───

test('foldAgentError dispatches each variant to exactly one case', () => {
  const variants: readonly AgentInterpretationError[] = [
    { kind: 'network-timeout', timeoutMs: 5000, url: 'https://api.example.com' },
    { kind: 'rate-limited', retryAfterMs: 1000 },
    { kind: 'token-overflow', tokensUsed: 10000, maxTokens: 4096 },
    { kind: 'auth-failure', provider: 'openai' },
    { kind: 'malformed-response', rawResponse: '<!DOCTYPE html>' },
    { kind: 'provider-error', statusCode: 500, message: 'Internal Server Error' },
  ];

  const results = variants.map((e) =>
    foldAgentError(e, {
      networkTimeout: () => 'network-timeout',
      rateLimited: () => 'rate-limited',
      tokenOverflow: () => 'token-overflow',
      authFailure: () => 'auth-failure',
      malformedResponse: () => 'malformed-response',
      providerError: () => 'provider-error',
    }),
  );

  expect(results).toEqual([
    'network-timeout',
    'rate-limited',
    'token-overflow',
    'auth-failure',
    'malformed-response',
    'provider-error',
  ]);
});

test('foldAgentError preserves typed payload in each case', () => {
  const timeout: AgentInterpretationError = { kind: 'network-timeout', timeoutMs: 3000, url: 'https://x.com' };
  const result = foldAgentError(timeout, {
    networkTimeout: (e) => e.timeoutMs,
    rateLimited: () => -1,
    tokenOverflow: () => -1,
    authFailure: () => -1,
    malformedResponse: () => -1,
    providerError: () => -1,
  });
  expect(result).toBe(3000);
});

// ─── Law: isRetryable returns true only for retryable errors ───

test('isRetryable returns true for network-timeout', () => {
  expect(isRetryable({ kind: 'network-timeout', timeoutMs: 5000 })).toBe(true);
});

test('isRetryable returns true for rate-limited', () => {
  expect(isRetryable({ kind: 'rate-limited', retryAfterMs: 2000 })).toBe(true);
});

test('isRetryable returns false for all non-retryable variants', () => {
  const nonRetryable: readonly AgentInterpretationError[] = [
    { kind: 'token-overflow', tokensUsed: 10000, maxTokens: 4096 },
    { kind: 'auth-failure', provider: 'azure' },
    { kind: 'malformed-response', rawResponse: 'garbage' },
    { kind: 'provider-error', statusCode: 503, message: 'Unavailable' },
  ];

  for (const error of nonRetryable) {
    expect(isRetryable(error)).toBe(false);
  }
});

// ─── Law: fold is total — no variant returns undefined ───

test('foldAgentError never returns undefined when all cases return defined values', () => {
  const allVariants: readonly AgentInterpretationError[] = [
    { kind: 'network-timeout', timeoutMs: 0 },
    { kind: 'rate-limited', retryAfterMs: 0 },
    { kind: 'token-overflow', tokensUsed: 0, maxTokens: 0 },
    { kind: 'auth-failure', provider: '' },
    { kind: 'malformed-response', rawResponse: '' },
    { kind: 'provider-error', statusCode: 0, message: '' },
  ];

  for (const error of allVariants) {
    const result = foldAgentError(error, {
      networkTimeout: () => 1,
      rateLimited: () => 2,
      tokenOverflow: () => 3,
      authFailure: () => 4,
      malformedResponse: () => 5,
      providerError: () => 6,
    });
    expect(result).toBeDefined();
    expect(typeof result).toBe('number');
  }
});

// ─── Token budget enforcement ───

test('isWithinBudget returns true when total is within both limits', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  const usage: TokenUsage = { prompt: 300, completion: 200, total: 500 };
  expect(isWithinBudget(usage, budget)).toBe(true);
});

test('isWithinBudget returns false when total exceeds per-step limit', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  const usage: TokenUsage = { prompt: 800, completion: 300, total: 1100 };
  expect(isWithinBudget(usage, budget)).toBe(false);
});

test('isWithinBudget returns false when total exceeds per-run limit', () => {
  const budget: TokenBudget = { maxTokensPerStep: 10000, maxTokensPerRun: 500 };
  const usage: TokenUsage = { prompt: 400, completion: 200, total: 600 };
  expect(isWithinBudget(usage, budget)).toBe(false);
});

test('isWithinBudget edge case: exact boundary is within budget', () => {
  const budget: TokenBudget = { maxTokensPerStep: 500, maxTokensPerRun: 500 };
  const usage: TokenUsage = { prompt: 300, completion: 200, total: 500 };
  expect(isWithinBudget(usage, budget)).toBe(true);
});

test('remainingBudget returns correct remaining tokens', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  const usage: TokenUsage = { prompt: 1000, completion: 500, total: 1500 };
  expect(remainingBudget(usage, budget)).toBe(3500);
});

test('remainingBudget is non-negative even when over budget', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 2000 };
  const usage: TokenUsage = { prompt: 2000, completion: 1000, total: 3000 };
  expect(remainingBudget(usage, budget)).toBe(0);
});

test('remainingBudget returns zero when exactly at budget', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 2000 };
  const usage: TokenUsage = { prompt: 1200, completion: 800, total: 2000 };
  expect(remainingBudget(usage, budget)).toBe(0);
});

test('shouldTruncatePrompt returns true when prompt exceeds per-step budget', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  expect(shouldTruncatePrompt(1500, budget)).toBe(true);
});

test('shouldTruncatePrompt returns false when prompt is within per-step budget', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  expect(shouldTruncatePrompt(800, budget)).toBe(false);
});

test('shouldTruncatePrompt edge case: exactly at limit does not truncate', () => {
  const budget: TokenBudget = { maxTokensPerStep: 1000, maxTokensPerRun: 5000 };
  expect(shouldTruncatePrompt(1000, budget)).toBe(false);
});
