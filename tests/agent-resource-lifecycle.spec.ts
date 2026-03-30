import { test, expect } from '@playwright/test';
import { Effect, Duration } from 'effect';
import {
  withAgentTimeout,
  withAgentTimeoutEffect,
  createScopedSessionProvider,
  type AgentLlmApiDependencies,
} from '../lib/application/agent-interpreter-provider';
import { createScopedInternalMCPBridge } from '../lib/runtime/agent/mcp-bridge';
import type { McpToolDefinition } from '../lib/domain/types';

test.describe('agent resource lifecycle stress tests', () => {
  test('timeout wrapper returns deterministic fallback across repeated retries', async () => {
    const callCount = { value: 0 };
    const wrapped = withAgentTimeout(() => Effect.gen(function* () {
      callCount.value += 1;
      yield* Effect.sleep(Duration.millis(40));
      return yield* Effect.succeed({
        interpreted: true,
        target: null,
        confidence: 1,
        rationale: 'unexpected completion',
        proposalDrafts: [],
        provider: 'test-provider',
      });
    }), { budgetMs: 5, provider: 'stress-timeout' });

    const results = await Effect.runPromise(Effect.all(
      Array.from({ length: 25 }, () => wrapped({} as never)),
      { concurrency: 'unbounded' },
    ));
    expect(callCount.value).toBe(25);
    expect(results.every((entry) =>
      entry.interpreted === false
      && entry.provider === 'stress-timeout'
      && entry.observation?.detail?.reason === 'token-budget-exceeded')).toBe(true);
  });

  test('effect timeout interrupts fiber without manual promise races', async () => {
    const interrupted = { value: 0 };
    const neverCompletes = Effect.never.pipe(
      Effect.onInterrupt(() => Effect.sync(() => {
        interrupted.value += 1;
      })),
    );

    const result = await Effect.runPromise(withAgentTimeoutEffect(
      neverCompletes,
      { budgetMs: 10, provider: 'effect-timeout' },
    ));
    await Effect.runPromise(Effect.sleep(Duration.millis(5)));

    expect(result.interpreted).toBe(false);
    expect(result.provider).toBe('effect-timeout');
    expect(interrupted.value).toBe(1);
  });

  test('scoped session providers release clients across repeated runs', async () => {
    const releaseCount = { value: 0 };
    const deps: AgentLlmApiDependencies = {
      createChatCompletion: async () => JSON.stringify({
        interpreted: false,
        confidence: 0,
        rationale: 'stub',
        target: null,
        proposalDrafts: [],
      }),
      release: async () => {
        releaseCount.value += 1;
      },
    };

    await Effect.runPromise(Effect.all(
      Array.from({ length: 20 }, () => Effect.scoped(Effect.gen(function* () {
        const provider = yield* createScopedSessionProvider(deps);
        const response = yield* provider.interpret({} as never).pipe(
          Effect.catchTag('translator-error', () => Effect.succeed({
            interpreted: false,
            target: null,
            confidence: 0,
            rationale: 'translator-error',
            proposalDrafts: [],
            provider: 'session-agent',
          })),
        );
        expect(response.provider === 'session-agent' || response.provider === 'session-stub').toBe(true);
      }))),
      { concurrency: 'unbounded' },
    ));

    expect(releaseCount.value).toBe(20);
  });

  test('scoped MCP bridge closes cleanly across timeout/retry loops', async () => {
    const releaseCount = { value: 0 };
    const tools: readonly McpToolDefinition[] = [{
      name: 'health_ping',
      category: 'observe',
      description: 'health',
      inputSchema: {},
    }];
    const invocations = { value: 0 };

    await Effect.runPromise(Effect.all(
      Array.from({ length: 30 }, () => Effect.scoped(Effect.gen(function* () {
        const bridge = yield* createScopedInternalMCPBridge(
          tools,
          async (invocation) => {
            invocations.value += 1;
            await new Promise<void>((resolve) => setTimeout(resolve, 2));
            return { tool: invocation.tool, result: { ok: true }, isError: false };
          },
          { release: async () => { releaseCount.value += 1; } },
        );
        const result = yield* Effect.promise(() => bridge.invoke('health_ping', {}));
        expect(result.isError).toBe(false);
      }))),
      { concurrency: 'unbounded' },
    ));

    expect(invocations.value).toBe(30);
    expect(releaseCount.value).toBe(30);
  });
});
